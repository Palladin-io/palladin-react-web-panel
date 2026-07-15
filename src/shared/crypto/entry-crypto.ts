/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/entry-crypto` import paths working unchanged.
 */
export { encryptEntry, decryptEntry } from '@palladin/crypto'
