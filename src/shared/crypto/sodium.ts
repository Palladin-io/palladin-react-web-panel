/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/sodium` import paths working unchanged.
 */
export {
  loadSodium,
  generateKeyPair,
  encryptWithKey,
  decryptWithKey,
  randomBytes,
  wipe,
} from '@palladin/crypto'
export type { KeyPair } from '@palladin/crypto'
