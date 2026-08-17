import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../services/supabase'
import { getPublicKeyFingerprint, signChallenge } from '../utils/cryptoIdentity'
import {
  isBleAvailable,
  requestBlePermissions,
  startStudentAdvertising,
  stopStudentAdvertising,
  studentSendSignature,
  addChallengeListener,
  addAdvertisingStateListener,
  addStudentErrorListener,
} from '../utils/bleManager'

interface Props {
  onBack: () => void
  pinValue: string
}

type BlePhase = 'checking' | 'ready' | 'active' | 'confirmed' | 'error'

function hexToBytes(hex: string): Uint8Array {
  const len = hex.length
  const out = new Uint8Array(len / 2)
  for (let i = 0; i < len; i += 2) {
    out[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function StudentBLE({ onBack, pinValue }: Props) {
  const [phase, setPhase] = useState<BlePhase>('checking')
  const [studentName, setStudentName] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const confirmedRef = useRef(false)
  const unsubsRef = useRef<Array<() => void>>([])

  useEffect(() => {
    checkEnvironment()
    return () => {
      stopAdvertisingAndListeners()
    }
  }, [])

  async function checkEnvironment() {
    if (!isBleAvailable()) {
      setErrorMsg('Bluetooth isn\'t available on this device. Use QR scanning instead.')
      setPhase('error')
      return
    }
    const permitted = await requestBlePermissions()
    if (!permitted) {
      setErrorMsg('Bluetooth permission was denied. Enable Bluetooth access and try again.')
      setPhase('error')
      return
    }
    const fingerprint = await getPublicKeyFingerprint()
    if (!fingerprint) {
      setErrorMsg('No device identity found. Register your device first.')
      setPhase('error')
      return
    }
    const { data: reg, error } = await supabase()
      .from('device_registrations')
      .select('id, student_id, student_name, status, pin, section')
      .eq('device_identifier', fingerprint)
      .maybeSingle()

    if (error || !reg) {
      setErrorMsg('Device not registered. Contact your teacher.')
      setPhase('error')
      return
    }
    if (reg.status !== 'approved') {
      setErrorMsg('Your device hasn\'t been approved yet.')
      setPhase('error')
      return
    }
    if (reg.pin && pinValue !== reg.pin) {
      setErrorMsg('PIN mismatch. Go back and re-enter your PIN.')
      setPhase('error')
      return
    }
    setStudentName(reg.student_name)
    setPhase('ready')
  }

  async function startBle() {
    confirmedRef.current = false
    stopAdvertisingAndListeners()
    setStatusMsg('')

    unsubsRef.current = [
      addChallengeListener(onChallenge),
      addAdvertisingStateListener((state, msg) => {
        if (state === 'started') {
          setPhase('active')
        } else if (state === 'error') {
          setStatusMsg(msg || '')
          setErrorMsg(msg || 'Bluetooth advertising failed. Move closer and try again.')
          setPhase('error')
        }
      }),
      addStudentErrorListener(msg => {
        setStatusMsg('Connection issue: ' + msg)
      }),
    ]

    try {
      await startStudentAdvertising()
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not start Bluetooth advertising.')
      setPhase('error')
    }
  }

  async function onChallenge(challengeHex: string) {
    if (confirmedRef.current || !challengeHex) return
    try {
      const signature = await signChallenge(hexToBytes(challengeHex))
      await studentSendSignature(bytesToHex(signature))
      confirmedRef.current = true
      setPhase('confirmed')
    } catch (e: any) {
      setStatusMsg('Sign failed: ' + (e?.message || 'unknown error'))
    }
  }

  function stopAdvertisingAndListeners() {
    unsubsRef.current.forEach(fn => { try { fn() } catch {} })
    unsubsRef.current = []
    stopStudentAdvertising().catch(() => {})
  }

  function resetAndRetry() {
    confirmedRef.current = false
    setErrorMsg('')
    setStatusMsg('')
    setPhase('ready')
  }

  return (
    <>
      <div className="scanner-topbar">
        <div className="tb-logo-img"><img src="/photo_2.webp" alt="ACLC Ormoc" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>
        <div className="tb-brand" style={{ fontSize: 15, fontWeight: 800 }}>
          {phase === 'confirmed' ? 'Attendance Recorded!' : phase === 'error' ? 'BLE Error' : 'BLE Attendance'}
          <span>ACLC Ormoc · Attendance</span>
        </div>
      </div>

      {phase === 'checking' && (
        <div className="scanner-body">
          <div className="qr-viewport">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12 }}>
              <img src="/emu-300.gif" alt="" style={{ width: 50, height: 50 }} />
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13 }}>Checking…</div>
            </div>
          </div>
          <div className="scanner-btns">
            <button className="btn-white-ghost" onClick={onBack}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'ready' && (
        <div className="scanner-body">
          <div className="qr-viewport">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <div style={{ color: 'rgba(255,255,255,.25)', fontSize: 52 }}>📶</div>
            </div>
          </div>
          <div className="scan-hint">
            {studentName ? `Ready, ${studentName}. ` : ''}Tap below and hold your phone near your teacher's device. Your device will auto-check you in over Bluetooth.
          </div>
          <div className="scanner-btns">
            <button className="btn-white" onClick={startBle}>▶ Start BLE</button>
            <button className="btn-white-ghost" onClick={onBack}>Cancel</button>
          </div>
        </div>
      )}

      {phase === 'active' && (
        <div className="scanner-body">
          <div className="qr-viewport">
            <div className="live-badge" style={{ position: 'absolute', top: 12, right: 12 }}>
              <div className="live-dot" />LISTENING
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 10 }}>
              <div style={{ color: 'rgba(255,255,255,.9)', fontSize: 46 }}>📶</div>
              <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 14, fontWeight: 700 }}>{studentName}</div>
            </div>
          </div>
          <div className="scan-hint" style={{ color: 'rgba(255,255,255,.9)' }}>Listening for your teacher… keep this screen open and hold still near their device.</div>
          {statusMsg && <div className="scan-hint" style={{ fontSize: 12, color: 'rgba(255,255,255,.6)' }}>{statusMsg}</div>}
          <div className="scanner-btns">
            <button className="btn-white-ghost" onClick={() => { stopAdvertisingAndListeners(); setStatusMsg(''); setPhase('ready') }}>Stop</button>
          </div>
        </div>
      )}

      {phase === 'confirmed' && (
        <div className="scanner-body">
          <div className="result-icon success">✅</div>
          <div className="result-title">Marked Present!</div>
          <div className="result-sub">{studentName ? `${studentName}, your attendance has been logged.` : 'Your attendance has been logged.'}</div>
          <div className="scanner-btns">
            <button className="btn-white" onClick={onBack}>Done</button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="scanner-body">
          <div className="result-icon fail">✖</div>
          <div className="result-title">BLE Error</div>
          <div className="result-sub">{errorMsg}</div>
          <div className="scanner-btns">
            <button className="btn-white" onClick={resetAndRetry}>Try Again</button>
            <button className="btn-white-ghost" onClick={onBack}>Back</button>
          </div>
        </div>
      )}
    </>
  )
}