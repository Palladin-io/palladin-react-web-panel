import { generateRecipientKeyPair, KEY_WRAPPER_SUITE, type RecipientKeyPair } from '@palladin/crypto'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { HTTPError } from 'ky'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSodium } from '../../shared/crypto/sodium'
import { sealKeyToX25519Recipient, computeVaultKeyFingerprint } from '../../test/legacy-key-wrapper'
import { toBase64Url } from '../../shared/crypto/encoding'
import { openMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { useAuthStore } from '../auth/stores/auth-store'
import type { PendingUpgrade } from './security-upgrade-store'
import { useSecurityUpgradeStore } from './security-upgrade-store'
import { useSecurityUpgradeRun } from './use-security-upgrade-run'

const api = vi.hoisted(() => ({ submit: vi.fn(), report: vi.fn(), deleteLegacy: vi.fn(), replace: vi.fn() }))
const store = vi.hoisted(() => vi.fn())
const accounts = vi.hoisted(() => ({ get: vi.fn() }))
const vaults = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('./security-upgrade-api', () => ({
  submitSecurityUpgrade: api.submit, getKeyMigrationReport: api.report,
  deleteLegacyMemberKey: api.deleteLegacy, replaceOwnMemberVaultKey: api.replace,
}))
vi.mock('../../shared/crypto/secret-key', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/crypto/secret-key')>(), storeDeviceSecretKey: store,
}))
vi.mock('../../shared/api/account-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/account-api')>(), getAccount: accounts.get,
}))
vi.mock('../vaults/sync/member-sync-api', () => ({ listEncryptedVaults: vaults.list }))

const organizationId = '00112233-4455-4677-8899-aabbccddeeff'
const vaultId = '11112222-3333-4444-8555-666677778888'
const memberId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const accessToken = `h.${btoa(JSON.stringify({ org_id: organizationId }))}.s`

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

let legacy: { publicKey: Uint8Array; privateKey: Uint8Array }
let next: RecipientKeyPair
let vaultKey: Uint8Array

async function legacyVault() {
  const recipientFingerprint = await computeVaultKeyFingerprint(legacy.publicKey, 5)
  const context = {
    protocolVersion: 2, wrapperSuiteId: KEY_WRAPPER_SUITE.legacy, purpose: 1, organizationId, vaultId, memberId,
    resourceRevision: 1, wrappedKeyVersion: 1, memberKeyGeneration: 1, recipientKeyKind: 5, recipientKeyVersion: 1,
    recipientFingerprint,
  }
  const sealed = await sealKeyToX25519Recipient(vaultKey, legacy.publicKey, context)
  return { id: vaultId, memberKeyGeneration: 1, memberVaultKey: { wrappedVaultKey: { descriptor: {
    protocolVersion: 2, wrapperSuiteId: KEY_WRAPPER_SUITE.legacy, purpose: 1,
    scope: { organizationId, vaultId, entryId: null, grantOrRequestId: null, agentId: null, memberId },
    resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1, recipientKeyKind: 5, recipientKeyVersion: 1,
    recipientFingerprint: toBase64Url(recipientFingerprint), parentDescriptorHash: null,
  }, encodedSealedKeyPackage: toBase64Url(sealed) } } }
}

function pending(): PendingUpgrade {
  return {
    kind: 'upgrade', accountId: memberId, email: 'user@example.com', recoveryMnemonic: ['a'],
    legacyPrivateKey: new Uint8Array(legacy.privateKey), legacyMemberKeyVersion: 1,
    material: {
      secretKey: new Uint8Array(32).fill(4), masterKey: new Uint8Array(32).fill(5), authCredential: new Uint8Array(32).fill(6),
      securityVersion: 2, kdfProfileId: 'identity-argon2id-account-secret-v2', kdfSalt: 'salt', recoverySalt: 'rsalt',
      encryptedPrivateKey: 'wrapped', encryptedPrivateKeyByRecovery: 'wrapped-r',
      memberKey: { ...next, privateKey: new Uint8Array(next.privateKey) },
    },
    request: { migrationId: 'm' } as PendingUpgrade['request'],
  }
}

describe('useSecurityUpgradeRun', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const sodium = await loadSodium()
    legacy = sodium.crypto_box_keypair()
    next = await generateRecipientKeyPair()
    vaultKey = sodium.randombytes_buf(32)
    useAuthStore.setState({ userId: memberId, accessToken, isVaultLocked: false })
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), legacy.privateKey)
    accounts.get.mockResolvedValue({ userId: memberId, memberKeyVersion: 2, memberPublicKeySuiteId: next.keySuiteId })
    vaults.list.mockResolvedValue([await legacyVault()])
    api.submit.mockResolvedValue(undefined)
    api.report.mockResolvedValue({ memberEnvelopesPendingRewrap: 0 })
    store.mockResolvedValue(undefined)
  })

  it('stores the Secret Key before committing, then re-wraps every Vault for the new key and removes the legacy record', async () => {
    const upgrade = pending()
    const { result } = renderHook(() => useSecurityUpgradeRun(upgrade), { wrapper })
    await act(() => result.current.run('commit'))

    expect(store.mock.invocationCallOrder[0]).toBeLessThan(api.submit.mock.invocationCallOrder[0])
    expect(useAuthStore.getState().memberKeySuiteId).toBe(next.keySuiteId)
    const [replacedVault, expectedVersion, envelope] = api.replace.mock.calls[0]
    expect([replacedVault, expectedVersion]).toEqual([vaultId, 1])
    expect(envelope.wrappedVaultKey.descriptor).toMatchObject({ wrapperSuiteId: KEY_WRAPPER_SUITE.active, recipientKeyVersion: 2 })
    const reopened = await openMemberVaultKey(envelope, { keySuiteId: next.keySuiteId, privateKey: next.privateKey })
    expect(Array.from(reopened)).toEqual(Array.from(vaultKey))
    expect(api.deleteLegacy).toHaveBeenCalledWith(1)
    expect(result.current.stage).toBe('kit')
    expect(result.current.kit?.email).toBe('user@example.com')
  })

  it('keeps the legacy record while envelopes still address the old key', async () => {
    api.report.mockResolvedValueOnce({ memberEnvelopesPendingRewrap: 2 })
    const { result } = renderHook(() => useSecurityUpgradeRun(pending()), { wrapper })
    await act(() => result.current.run('commit'))
    expect(api.deleteLegacy).not.toHaveBeenCalled()
  })

  it('reports a compare-and-swap conflict without publishing new keys', async () => {
    api.submit.mockRejectedValueOnce(new HTTPError(new Response(null, { status: 409 }), new Request('https://api.test/x'), {}))
    const { result } = renderHook(() => useSecurityUpgradeRun(pending()), { wrapper })
    await act(() => result.current.run('commit'))
    expect(result.current.failure).toBe('conflict')
    expect(useAuthStore.getState().memberKeySuiteId).toBe(KEY_WRAPPER_SUITE.legacy)
    expect(api.replace).not.toHaveBeenCalled()
  })

  it('resumes a committed upgrade from the re-wrap and clears itself without an Emergency Kit', async () => {
    useAuthStore.getState().unlockVault(new Uint8Array(32).fill(1), next.privateKey, undefined, next.keySuiteId)
    useSecurityUpgradeStore.getState().begin({ kind: 'resume', legacyPrivateKey: new Uint8Array(legacy.privateKey), legacyMemberKeyVersion: 1 })
    const resume = useSecurityUpgradeStore.getState().pending!
    const { result } = renderHook(() => useSecurityUpgradeRun(resume), { wrapper })
    await act(() => result.current.run('rewrap'))
    expect(api.replace).toHaveBeenCalledOnce()
    expect(api.submit).not.toHaveBeenCalled()
    expect(useSecurityUpgradeStore.getState().pending).toBeNull()
  })
})
