import { getPublicKeyFingerprint } from './cryptoIdentity'
import { savePendingRecord, markNonce, hasNonce, syncPendingRecords } from './offlineAttendance'

const ACLC_SERVICE_UUID = '7a3a2e1e-6c4a-4e0e-a5a1-2b6c3d4e5f60'

export interface BleRosterEntry {
  studentId: string
  studentName: string
  deviceIdentifier: string
  publicKey: string
  section?: string
}

export type BleDeviceStatus = 'verifying' | 'verified' | 'rejected' | 'error'

export interface BleStatus {
  studentId?: string
  studentName?: string
  section?: string
  address?: string
  rssi?: number
  status?: BleDeviceStatus
  message?: string
}

interface TeacherScanOptions {
  sessionId: string
  challengeBytes: Uint8Array
  roster: BleRosterEntry[]
  onStatus: (status: BleStatus) => void
}

interface ScanState {
  options: TeacherScanOptions
  challengeHex: string
  processingAddresses: Set<string>
  candidatesByAddress: Map<string, BleRosterEntry[]>
  listenerCleanups: Array<() => void>
  running: boolean
}

function plugin(): any {
  const cap = (window as any).Capacitor
  return cap && cap.Plugins ? cap.Plugins.BleAttendance : null
}

let scanState: ScanState | null = null
let studentUnsubscribes: Array<() => void> = []

export function isBleAvailable(): boolean {
  return !!plugin()
}

export async function requestBlePermissions(): Promise<boolean> {
  const p = plugin()
  if (!p?.requestPermissions) return false
  try {
    const res = await p.requestPermissions()
    const state = res ?? {}
    const aliases = Object.values(state).filter((v): v is string =>
      v === 'granted' || v === 'denied' || v === 'prompt')
    if (aliases.length === 0) return true
    return aliases.every(a => a === 'granted')
  } catch {
    return false
  }
}

export async function startStudentAdvertising(): Promise<string> {
  const p = plugin()
  if (!p) throw new Error('BLE is not available on this device')
  const fingerprint = await getPublicKeyFingerprint()
  if (!fingerprint) throw new Error('No device identity registered')
  await p.startAdvertising({ serviceUUID: ACLC_SERVICE_UUID, fingerprintHex: fingerprint })
  return fingerprint
}

export async function stopStudentAdvertising(): Promise<void> {
  const p = plugin()
  if (p?.stopAdvertising) {
    try {
      await p.stopAdvertising()
    } catch {
    }
  }
}

export async function studentSendSignature(signatureHex: string): Promise<void> {
  const p = plugin()
  if (!p) throw new Error('BLE is not available on this device')
  await p.sendSignature({ signatureHex })
}

export function addChallengeListener(cb: (challengeHex: string) => void): () => void {
  const p = plugin()
  if (!p?.addListener) return () => {}
  let handle: { remove: () => void } | null = null
  p.addListener('challengeReceived', (data: any) => {
    cb(data?.challengeHex ?? '')
  }).then((h: any) => { handle = h })
  return () => { if (handle) { try { handle.remove() } catch {} } }
}

export function addAdvertisingStateListener(cb: (state: 'started' | 'error', message?: string) => void): () => void {
  const p = plugin()
  if (!p?.addListener) return () => {}
  const handles: Array<{ remove: () => void } | null> = [null, null]
  p.addListener('advertisingStarted', () => cb('started')).then((h: any) => { handles[0] = h })
  p.addListener('advertisingError', (data: any) => cb('error', data?.message ?? '')).then((h: any) => { handles[1] = h })
  return () => {
    handles.forEach(h => { if (h) { try { h.remove() } catch {} } })
  }
}

export function addStudentErrorListener(cb: (message: string) => void): () => void {
  const p = plugin()
  if (!p?.addListener) return () => {}
  let handle: { remove: () => void } | null = null
  p.addListener('deviceError', (data: any) => cb(data?.message ?? 'connect error')).then((h: any) => { handle = h })
  return () => { if (handle) { try { handle.remove() } catch {} } }
}

export async function startTeacherScan(options: TeacherScanOptions): Promise<void> {
  await stopTeacherScan()
  const p = plugin()
  if (!p) {
    options.onStatus({ message: 'BLE is not available on this device', status: 'error' })
    return
  }
  if (!(await requestBlePermissions())) {
    options.onStatus({ message: 'Bluetooth permission was denied', status: 'error' })
    return
  }
  const st: ScanState = {
    options,
    challengeHex: bytesToHex(options.challengeBytes),
    processingAddresses: new Set(),
    candidatesByAddress: new Map(),
    listenerCleanups: [],
    running: true,
  }
  scanState = st
  const unsubs = [
    p.addListener('deviceFound', (data: any) => handleDeviceFound(data)).then((h: any) => () => h.remove()),
    p.addListener('signatureReceived', (data: any) => handleSignatureReceived(data)).then((h: any) => () => h.remove()),
    p.addListener('deviceError', (data: any) => handleDeviceError(data)).then((h: any) => () => h.remove()),
    p.addListener('scanError', (data: any) => handleScanError(data)).then((h: any) => () => h.remove()),
  ]
  const resolved = await Promise.all(unsubs)
  st.listenerCleanups = resolved
  try {
    await p.startScan()
  } catch (e: any) {
    if (scanState === st) scanState = null
    options.onStatus({ message: e?.message ?? 'Failed to start BLE scan', status: 'error' })
  }
}

async function handleDeviceFound(data: any) {
  const s = scanState
  if (!s || !s.running) return
  const address = data?.address
  const fingerprintHex = data?.fingerprintHex ?? ''
  if (!address || !fingerprintHex || s.processingAddresses.has(address)) return
  const candidates = (s.options.roster || []).filter(r =>
    r.deviceIdentifier && r.deviceIdentifier.toLowerCase().startsWith(fingerprintHex.toLowerCase()))
  if (candidates.length === 0) {
    s.options.onStatus({ address, rssi: data.rssi, message: 'unknown-device' })
    return
  }
  s.processingAddresses.add(address)
  s.candidatesByAddress.set(address, candidates)
  candidates.forEach(c => {
    s.options.onStatus({ studentId: c.studentId, studentName: c.studentName, section: c.section, address, rssi: data.rssi, status: 'verifying' })
  })
  try {
    await plugin().connectAndChallenge({ deviceAddress: address, challengeHex: s.challengeHex })
  } catch (e: any) {
    s.options.onStatus({ address, message: e?.message ?? 'connect failed', status: 'error' })
    s.processingAddresses.delete(address)
  }
}

async function handleSignatureReceived(data: any) {
  const s = scanState
  if (!s || !s.running) return
  const address = data?.address
  const signatureHex = data?.signatureHex ?? ''
  if (!address || !signatureHex) return
  const candidates = s.candidatesByAddress.get(address) ?? []
  if (candidates.length === 0) return
  const signatureBytes = hexToBytes(signatureHex)
  for (const c of candidates) {
    if (await verifyEcdsaSignature(s.options.challengeBytes, signatureBytes, c.publicKey)) {
      if (await hasNonce(c.studentId, s.challengeHex)) {
        s.options.onStatus({ studentId: c.studentId, studentName: c.studentName, address, status: 'rejected', message: 'replay' })
        s.processingAddresses.delete(address)
        return
      }
      await markNonce(c.studentId, s.challengeHex)
      await savePendingRecord({
        id: crypto.randomUUID(),
        sessionId: s.options.sessionId,
        studentId: c.studentId,
        studentName: c.studentName,
        section: c.section || '',
        verifiedAt: new Date().toISOString(),
        challengeHex: s.challengeHex,
        signatureHex,
        synced: false,
      })
      syncPendingRecords().catch(() => {})
      s.options.onStatus({ studentId: c.studentId, studentName: c.studentName, section: c.section, address, status: 'verified' })
      s.processingAddresses.delete(address)
      return
    }
  }
  s.options.onStatus({ address, message: 'invalid-signature', status: 'rejected' })
  s.processingAddresses.delete(address)
}

function handleDeviceError(data: any) {
  const s = scanState
  if (!s || !s.running) return
  const address = data?.address
  s.options.onStatus({ address, message: data?.message ?? 'device error', status: 'error' })
  if (address) s.processingAddresses.delete(address)
}

function handleScanError(data: any) {
  const s = scanState
  if (!s || !s.running) return
  s.options.onStatus({ message: data?.message ?? 'scan error', status: 'error' })
}

export async function restartTeacherScan(): Promise<void> {
  const s = scanState
  if (!s) return
  const newChallenge = new Uint8Array(32)
  crypto.getRandomValues(newChallenge)
  await startTeacherScan({ ...s.options, challengeBytes: newChallenge })
}

export async function stopTeacherScan(): Promise<void> {
  const p = plugin()
  if (p) {
    try {
      await p.stopScan()
      await p.cleanUp()
    } catch {
    }
  }
  if (scanState?.listenerCleanups) {
    scanState.listenerCleanups.forEach(fn => { try { fn() } catch {} })
  }
  scanState = null
}

async function verifyEcdsaSignature(challengeBytes: Uint8Array, signatureBytes: Uint8Array, publicKeySpkiBase64: string): Promise<boolean> {
  if (!publicKeySpkiBase64) return false
  try {
    const rawKey = Uint8Array.from(atob(publicKeySpkiBase64), c => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('spki', rawKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
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

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}