import { sha1 } from '@noble/hashes/legacy.js'
import { sha256Digest } from '@palladin/crypto'
import { encodeBase64Url } from './vault-v2-bytes'

export function sha256Base64Url(bytes: Uint8Array): string {
  return encodeBase64Url(sha256Digest(bytes))
}

export function sha256Hex(bytes: Uint8Array): string {
  return [...sha256Digest(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

// HIBP mandates SHA-1 for its k-anonymous lookup; never use this for key derivation.
export function hibpSha1Hex(value: string): string {
  const bytes = new TextEncoder().encode(value)
  try {
    return [...sha1(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  } finally { bytes.fill(0) }
}
