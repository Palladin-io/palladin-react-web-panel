import { sha256Digest } from '@palladin/crypto'
import { toBase64Url } from './encoding'

/**
 * Derive an opaque, stable identifier from non-secret values.
 *
 * This is domain-separated and length-framed to avoid ambiguous inputs. It is
 * only an identifier for local UI state, never an authentication or key-
 * derivation primitive.
 */
export async function deriveNonSecretStableId(
  namespace: string,
  ...parts: string[]
): Promise<string> {
  const framed = [namespace, ...parts]
    .map((part) => `${new TextEncoder().encode(part).byteLength}:${part}`)
    .join('|')
  const digest = sha256Digest(new TextEncoder().encode(framed))
  return `v1.${toBase64Url(new Uint8Array(digest))}`
}
