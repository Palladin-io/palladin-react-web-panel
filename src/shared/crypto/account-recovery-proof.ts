import { openAccountRecoveryChallenge } from '@palladin/crypto'
import { encodeBase64Url } from './vault-v2-bytes'
import { wipe } from './sodium'

/**
 * Opens the recovery challenge with the account private key. `sessionUserId`
 * must come from the authenticated session so the server cannot bind the
 * challenge to another identity.
 */
export async function createAccountRecoveryProof(
  sealedChallenge: string,
  sessionUserId: string,
  privateKey: Uint8Array,
): Promise<string> {
  const proof = await openAccountRecoveryChallenge(sealedChallenge, sessionUserId, privateKey)
  try {
    return encodeBase64Url(proof)
  } finally {
    wipe(proof)
  }
}
