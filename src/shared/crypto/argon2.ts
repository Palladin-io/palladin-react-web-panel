/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/argon2` import paths working unchanged.
 */
export {
  ARGON2_PARAMS,
  MASTER_KEY_SALT_BYTES,
  RECOVERY_KEY_SALT_BYTES,
  AUTH_SALT_BYTES,
  deriveKey,
} from '@palladin/crypto'
