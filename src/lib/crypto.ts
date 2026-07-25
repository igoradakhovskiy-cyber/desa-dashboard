import type { Dataset } from '../types'

export interface EncBlob {
  v: number
  alg: string
  kdf: string
  iter: number
  salt: string
  iv: string
  ct: string
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export async function fetchEncrypted(): Promise<EncBlob> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/latest.enc`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Не удалось загрузить данные (${res.status})`)
  return res.json()
}

/** Decrypts the dataset with the shared password. Throws on a wrong password. */
export async function decryptDataset(blob: EncBlob, password: string): Promise<Dataset> {
  const salt = b64(blob.salt)
  const iv = b64(blob.iv)
  const ct = b64(blob.ct)
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: blob.iter, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  )
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buf))) as Dataset
}
