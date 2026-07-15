/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/encoding` import paths working unchanged.
 */
export { toBase64, fromBase64 } from '@palladin/crypto'
