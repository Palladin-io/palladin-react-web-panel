import { beforeEach, describe, expect, it } from 'vitest'
import type { AccountResponse } from '../../shared/api/account-api'
import { encodeBase64Url } from '../../shared/crypto/vault-v2-bytes'
import { beginSecurityUpgrade, createSecurityUpgradeDraft } from './prepare-security-upgrade'
import { useSecurityUpgradeStore, type PendingUpgrade } from './security-upgrade-store'

const accountId = '11111111-1111-4111-8111-111111111111'
const proof = new Uint8Array(32).fill(6)

function account(credentialRevision: number): AccountResponse {
  return {
    userId: accountId, email: 'user@example.com', displayName: 'User', avatarUrl: null, isOnboarded: true,
    memberKeyVersion: 1,
    kdf: { securityVersion: 1, minimumSecurityVersion: 1, profileId: 'identity-argon2id-password-v1', kdfSalt: 'salt',
      credentialRevision, privateKeyWrapRevision: 2, deviceWrapperMetadata: null },
  }
}

async function requestFor(credentialRevision: number) {
  await beginSecurityUpgrade({
    account: account(credentialRevision),
    draft: await createSecurityUpgradeDraft(accountId, 'master password'),
    currentAuthCredential: proof,
    legacyPrivateKey: new Uint8Array(32).fill(7),
  })
  return (useSecurityUpgradeStore.getState().pending as PendingUpgrade).request
}

describe('beginSecurityUpgrade', () => {
  beforeEach(() => useSecurityUpgradeStore.getState().clear())

  it('sends an empty proof with base revision 0 for an OAuth account without a password credential', async () => {
    const request = await requestFor(0)
    expect(request).toMatchObject({ currentAuthCredential: '', baseCredentialRevision: 0, sourceSecurityVersion: 1 })
  })

  it('sends the v1 AuthCredential proof for a password account', async () => {
    const request = await requestFor(3)
    expect(request).toMatchObject({ currentAuthCredential: encodeBase64Url(proof), baseCredentialRevision: 3 })
    expect(request.newAuthCredential).not.toBe(request.currentAuthCredential)
  })
})
