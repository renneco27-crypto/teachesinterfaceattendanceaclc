import { supabase } from '../services/supabase'

export interface PendingAttendanceRecord {
  id: string
  sessionId: string
  studentId: string
  studentName: string
  section?: string
  verifiedAt: string
  challengeHex: string
  signatureHex: string
  synced: boolean
}

interface NonceEntry {
  key: string
  createdAt: string
}

const DB_NAME = 'aclc-offline-attendance'
const DB_VERSION = 1
const RECORDS_STORE = 'records'
const NONCES_STORE = 'nonces'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(RECORDS_STORE)) {
        db.createObjectStore(RECORDS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(NONCES_STORE)) {
        db.createObjectStore(NONCES_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const request = tx.objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

function putValue(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    tx.objectStore(store).put(value)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function deleteKeys(db: IDBDatabase, store: string, keys: IDBValidKey[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const os = tx.objectStore(store)
    keys.forEach(k => os.delete(k))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function savePendingRecord(record: PendingAttendanceRecord): Promise<void> {
  const db = await openDb()
  try {
    await putValue(db, RECORDS_STORE, record)
  } finally {
    db.close()
  }
}

export async function getPendingRecords(): Promise<PendingAttendanceRecord[]> {
  const db = await openDb()
  try {
    return await getAll<PendingAttendanceRecord>(db, RECORDS_STORE)
  } finally {
    db.close()
  }
}

export async function getUnsyncedRecords(): Promise<PendingAttendanceRecord[]> {
  const all = await getPendingRecords()
  return all.filter(r => !r.synced)
}

export async function markRecordSynced(id: string): Promise<void> {
  const db = await openDb()
  try {
    const all = await getAll<PendingAttendanceRecord>(db, RECORDS_STORE)
    const rec = all.find(r => r.id === id)
    if (rec) {
      rec.synced = true
      await putValue(db, RECORDS_STORE, rec)
    }
  } finally {
    db.close()
  }
}

export async function purgeSyncedRecords(): Promise<void> {
  const db = await openDb()
  try {
    const all = await getAll<PendingAttendanceRecord>(db, RECORDS_STORE)
    const synced = all.filter(r => r.synced).map(r => r.id)
    if (synced.length > 0) await deleteKeys(db, RECORDS_STORE, synced)
  } finally {
    db.close()
  }
}

export async function markNonce(studentId: string, challengeHex: string): Promise<void> {
  const db = await openDb()
  try {
    const entry: NonceEntry = { key: `${studentId}:${challengeHex}`, createdAt: new Date().toISOString() }
    await putValue(db, NONCES_STORE, entry)
  } finally {
    db.close()
  }
}

export async function hasNonce(studentId: string, challengeHex: string): Promise<boolean> {
  const db = await openDb()
  try {
    const all = await getAll<NonceEntry>(db, NONCES_STORE)
    return all.some(n => n.key === `${studentId}:${challengeHex}`)
  } finally {
    db.close()
  }
}

export async function clearNonces(): Promise<void> {
  const db = await openDb()
  try {
    const all = await getAll<NonceEntry>(db, NONCES_STORE)
    await deleteKeys(db, NONCES_STORE, all.map(n => n.key))
  } finally {
    db.close()
  }
}

export interface SyncResult {
  synced: number
  skippedDuplicates: number
  failed: number
}

export async function syncPendingRecords(): Promise<SyncResult> {
  const records = await getUnsyncedRecords()
  const result: SyncResult = { synced: 0, skippedDuplicates: 0, failed: 0 }
  for (const record of records) {
    try {
      const { data, error } = await supabase().functions.invoke('submit-ble-attendance', {
        body: {
          sessionId: record.sessionId,
          studentId: record.studentId,
          studentName: record.studentName,
          section: record.section || '',
          challengeHex: record.challengeHex,
          signatureHex: record.signatureHex,
          verifiedAt: record.verifiedAt,
        },
      })
      if (!error) {
        if (data?.status === 'duplicate') {
          result.skippedDuplicates++
        } else {
          result.synced++
        }
        await markRecordSynced(record.id)
      } else {
        if (data?.status === 'duplicate') {
          result.skippedDuplicates++
          await markRecordSynced(record.id)
        } else {
          result.failed++
        }
      }
    } catch {
      result.failed++
    }
  }
  await purgeSyncedRecords()
  return result
}