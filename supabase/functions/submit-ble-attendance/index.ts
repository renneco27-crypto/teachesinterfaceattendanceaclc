import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json()
    const method = body.method === 'manual' ? 'manual' : 'ble'
    const sessionId = body.sessionId
    const studentId = body.studentId

    if (!sessionId || !studentId) {
      return json({ error: 'sessionId and studentId are required' }, 400)
    }

    const { data: session, error: sessionError } = await supabase
      .from('attendance_sessions')
      .select('id, teacher_id')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return json({ error: 'Session not found' }, 404)
    }

    const { data: registration, error: regError } = await supabase
      .from('device_registrations')
      .select('student_name, section, status, public_key')
      .eq('student_id', studentId)
      .eq('teacher_id', session.teacher_id)
      .maybeSingle()

    if (regError || !registration) {
      return json({ error: 'Device registration not found for this session' }, 404)
    }

    if (registration.status !== 'approved') {
      return json({ error: 'Device registration is not approved' }, 403)
    }

    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id')
      .eq('session_id', sessionId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existing) {
      if (method === 'ble') {
        return json({ status: 'duplicate' })
      }
      return json({ error: 'Student already recorded in this session' }, 409)
    }

    if (method === 'manual') {
      // Manual marks are teacher-only actions.
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return json({ error: 'Unauthorized' }, 401)
      }
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !user) {
        return json({ error: 'Unauthorized' }, 401)
      }
      const { data: teacherRecord } = await supabase
        .from('teachers')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!teacherRecord) {
        return json({ error: 'Forbidden: teachers only' }, 403)
      }
      if (session.teacher_id !== user.id) {
        return json({ error: 'Not authorized to modify this session' }, 403)
      }
    } else {
      // BLE records are authenticated by the ECDSA signature over the challenge.
      const challengeHex = body.challengeHex
      const signatureHex = body.signatureHex
      if (!challengeHex || !signatureHex || !registration.public_key) {
        return json({ error: 'challengeHex, signatureHex and a registered public key are required' }, 400)
      }
      const valid = await verifySignature(
        challengeHex,
        signatureHex,
        registration.public_key,
      )
      if (!valid) {
        return json({ error: 'invalid-signature' }, 403)
      }
    }

    const scannedAt = new Date().toISOString()
    const insertPayload: Record<string, unknown> = {
      session_id: sessionId,
      student_id: studentId,
      student_name: registration.student_name || body.studentName || 'Unknown',
      section: registration.section || body.section || null,
      method,
      is_mock_location: false,
      scanned_at: method === 'ble' && body.verifiedAt ? new Date(body.verifiedAt).toISOString() : scannedAt,
    }
    if (method === 'ble') {
      insertPayload.challenge_hex = body.challengeHex
      insertPayload.signature_hex = body.signatureHex
      insertPayload.offline_verified_at = body.verifiedAt || scannedAt
    }
    insertPayload.synced_at = scannedAt

    const { error: insertError } = await supabase
      .from('attendance_records')
      .insert(insertPayload)

    if (insertError) {
      if (insertError.code === '23505') {
        return json({ status: 'duplicate' })
      }
      return json({ error: 'Server error' }, 500)
    }

    return json({ success: true, status: 'recorded' })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})

async function verifySignature(challengeHex: string, signatureHex: string, publicKeySpkiBase64: string): Promise<boolean> {
  try {
    const rawKey = Uint8Array.from(atob(publicKeySpkiBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('spki', rawKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const signatureBytes = hexToBytes(signatureHex)
    const challengeBytes = hexToBytes(challengeHex)
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signatureBytes, challengeBytes)
  } catch {
    return false
  }
}

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length
  const out = new Uint8Array(len / 2)
  for (let i = 0; i < len; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}