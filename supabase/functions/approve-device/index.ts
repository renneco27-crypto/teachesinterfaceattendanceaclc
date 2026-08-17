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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // confirm the caller is a teacher, not just any authenticated user
    const { data: teacherRecord } = await supabase
      .from('teachers')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (!teacherRecord) {
      return new Response(JSON.stringify({ error: 'Forbidden: teachers only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { device_registration_id } = await req.json()

    if (!device_registration_id) {
      return new Response(JSON.stringify({ error: 'device_registration_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: deviceReg, error: fetchError } = await supabase
      .from('device_registrations')
      .select('id, teacher_id, student_name, status')
      .eq('id', device_registration_id)
      .single()

    if (fetchError || !deviceReg) {
      return new Response(JSON.stringify({ error: 'Device registration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (deviceReg.teacher_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Not authorized to approve this device' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (deviceReg.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Request already resolved' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // device replacement: revoke any previously approved device for the same student name
    const { error: revokeError } = await supabase
      .from('device_registrations')
      .update({ status: 'revoked' })
      .eq('teacher_id', user.id)
      .ilike('student_name', deviceReg.student_name)
      .eq('status', 'approved')
      .neq('id', device_registration_id)

    if (revokeError) {
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: approveError } = await supabase
      .from('device_registrations')
      .update({ status: 'approved' })
      .eq('id', device_registration_id)
      .eq('teacher_id', user.id)

    if (approveError) {
      return new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})