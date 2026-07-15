/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/totp` import paths working unchanged.
 */
export {
  base32Decode,
  parseOtpauthUri,
  totpParamsFromSecret,
  generateTotp,
} from '@palladin/crypto'
export type { TotpCode } from '@palladin/crypto'
