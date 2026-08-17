const DB_NAME = 'aclc-attendance-keys'
const DB_VERSION = 1
const STORE = 'keys'
const PRIVATE_KEY_ID = 'ecdsa-private-key'
const PUBLIC_KEY_ID = 'ecdsa-public-key-spki'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function storeValue(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function getValue(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const request = tx.objectStore(STORE).get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function deleteValue(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof value === 'object' && value !== null && (value as CryptoKey).type === 'private'
}

export async function generateAndStoreKeyPair(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify']
  )
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const publicKeyBase64 = bufferToBase64(spki)
  const db = await openDb()
  try {
    await storeValue(db, PRIVATE_KEY_ID, keyPair.privateKey)
    await storeValue(db, PUBLIC_KEY_ID, publicKeyBase64)
  } finally {
    db.close()
  }
  return publicKeyBase64
}

export async function getPublicKeyBase64(): Promise<string | null> {
  const db = await openDb()
  try {
    const value = await getValue(db, PUBLIC_KEY_ID)
    return typeof value === 'string' ? value : null
  } finally {
    db.close()
  }
}

export async function getPublicKeyFingerprint(): Promise<string | null> {
  const publicKeyBase64 = await getPublicKeyBase64()
  if (!publicKeyBase64) return null
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(publicKeyBase64))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function signChallenge(challengeBytes: Uint8Array): Promise<Uint8Array> {
  const db = await openDb()
  let privateKey: CryptoKey | null = null
  try {
    const value = await getValue(db, PRIVATE_KEY_ID)
    privateKey = isCryptoKey(value) ? value : null
  } finally {
    db.close()
  }
  if (!privateKey) throw new Error('No key pair exists')
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, challengeBytes)
  return new Uint8Array(signature)
}

export async function hasKeyPair(): Promise<boolean> {
  const db = await openDb()
  try {
    const value = await getValue(db, PRIVATE_KEY_ID)
    return isCryptoKey(value)
  } finally {
    db.close()
  }
}

export async function deleteKeyPair(): Promise<void> {
  const db = await openDb()
  try {
    await deleteValue(db, PRIVATE_KEY_ID)
    await deleteValue(db, PUBLIC_KEY_ID)
  } finally {
    db.close()
  }
}
