/**
 * Thin re-export from the shared `@palladin/crypto` package (CVT-365).
 * The crypto now lives in one audited module shared with the browser extension;
 * this shim keeps existing `shared/crypto/grant-envelope` import paths working unchanged.
 */
export { produceGrantEntryEnvelope } from '@palladin/crypto'
export type {
  GrantEntryEnvelope,
  SealedEntryContent,
  ProduceGrantEntryEnvelopeParams,
} from '@palladin/crypto'
