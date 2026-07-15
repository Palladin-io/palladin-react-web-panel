/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/password-generator` import paths working unchanged.
 */
export {
  generatePassword,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_DEFAULT_LENGTH,
} from '@palladin/crypto'
export type { PasswordOptions } from '@palladin/crypto'
