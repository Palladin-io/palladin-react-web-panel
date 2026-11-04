import {
  deleteAccountSecretFromDevice,
  DeviceWrapperError,
  encodeEmergencyKitQr,
  formatSecretKey,
  generateAccountSecret,
  loadAccountSecretFromDevice,
  parseEmergencyKitQr,
  parseSecretKey,
  SecretKeyError,
  storeAccountSecretOnDevice,
} from '@palladin/crypto'

export { DeviceWrapperError, SecretKeyError }

/**
 * The Secret Key (identity v2 Account Secret) is the one key this browser may
 * persist, and only as AES-GCM ciphertext under a non-extractable WebCrypto
 * key (identity-kdf v3 `browserNonExtractableWrapper`). It never reaches the
 * backend, logs or analytics.
 */
export const generateSecretKey = generateAccountSecret

export function loadDeviceSecretKey(accountId: string): Promise<Uint8Array | null> {
  return loadAccountSecretFromDevice(accountId)
}

export function storeDeviceSecretKey(accountId: string, secretKey: Uint8Array): Promise<void> {
  return storeAccountSecretOnDevice(accountId, secretKey)
}

/** Best effort: a missing IndexedDB must not block sign-out. */
export async function forgetDeviceSecretKey(accountId: string): Promise<void> {
  try {
    await deleteAccountSecretFromDevice(accountId)
  } catch {
    // Nothing to delete when storage is unavailable.
  }
}

/** Accepts the typed `PSK2-…` form or the pasted kit QR text for `accountId` only. */
export function parseSecretKeyInput(accountId: string, input: string): Uint8Array {
  const value = input.trim()
  return value.startsWith('palladin-kit:') ? parseEmergencyKitQr(accountId, value) : parseSecretKey(accountId, value)
}

/** Display-only kit values; held in component memory for the kit screen and dropped with it. */
export interface EmergencyKitMaterial {
  email: string
  secretKey: string
  qrPayload: string
}

export function emergencyKitMaterial(accountId: string, email: string, secretKey: Uint8Array): EmergencyKitMaterial {
  return {
    email,
    secretKey: formatSecretKey(accountId, secretKey),
    qrPayload: encodeEmergencyKitQr(accountId, secretKey),
  }
}
