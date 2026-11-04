import { openAccountRecoveryChallenge, openAccountRecoveryChallengeV2 } from '@palladin/crypto'
import { KEY_WRAPPER_SUITE, type RecipientPrivateKey } from './key-wrapper'
import { encodeBase64Url } from './vault-v2-bytes'
import { wipe } from './sodium'

/**
 * Opens the recovery challenge with the account Member private key. The
 * challenge version follows the Member key suite the authenticated account
 * publishes (X-Wing → identity-kdf v3 challenge v2). `sessionUserId` must come
 * from the authenticated session so the server cannot bind another identity.
 */
export async function createAccountRecoveryProof(
  sealedChallenge: string,
  sessionUserId: string,
  memberKey: RecipientPrivateKey,
): Promise<string> {
  const proof = memberKey.keySuiteId === KEY_WRAPPER_SUITE.legacy
    ? await openAccountRecoveryChallenge(sealedChallenge, sessionUserId, memberKey.privateKey)
    : await openAccountRecoveryChallengeV2(sealedChallenge, sessionUserId, memberKey.privateKey)
  try {
    return encodeBase64Url(proof)
  } finally {
    wipe(proof)
  }
}
