import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toBase64, toBase64Url } from '../../../shared/crypto/encoding'
import { computeVaultKeyFingerprint, VAULT_KEY_KIND } from '../../../shared/crypto/x25519-wrapper'

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('../../../shared/api/client', () => ({ api: mocks }))

import {
  appendFullGrantPreparationEntries,
  cancelFullGrantPreparation,
  commitFullGrantPreparation,
  getFullGrantPreparationMaterial,
  prepareFullGrant,
} from './full-grant-preparations-api'

const vaultId = '22222222-2222-4222-8222-222222222222'
const grantId = '33333333-3333-4333-8333-333333333333'
const agentId = '44444444-4444-4444-8444-444444444444'
const organizationId = '11111111-1111-4111-8111-111111111111'
const entryId = '55555555-5555-4555-8555-555555555555'
const otherEntryId = '66666666-6666-4666-8666-666666666666'
let preparation: Record<string, unknown>

function materialItem(itemOrganizationId = organizationId) {
  const scope = {
    organizationId: itemOrganizationId,
    vaultId,
    entryId,
    grantOrRequestId: null,
    agentId: null,
    memberId: null,
  }
  return {
    entryId,
    entryRevision: '7',
    entryKey: {
      descriptor: {
        protocolVersion: 2,
        cryptoSuiteId: 'palladin-vault-xchacha-v1',
        purpose: 'entryDekByVaultKey',
        scope,
        resourceRevision: '3',
        keyVersion: 2,
        memberKeyGeneration: 3,
        binding: { wrappingVaultKeyVersion: 2 },
      },
      encodedSuitePayload: 'entry-key',
    },
    memberSecret: {
      descriptor: {
        protocolVersion: 2,
        cryptoSuiteId: 'palladin-vault-xchacha-v1',
        purpose: 'memberSecret',
        scope,
        resourceRevision: '7',
        keyVersion: 2,
        memberKeyGeneration: 3,
        binding: { operation: 'updated' },
      },
      encodedSuitePayload: 'member-secret',
    },
  }
}

describe('full-grant-preparations-api', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const publicKey = new Uint8Array(32).fill(7)
    preparation = {
      grantId,
      organizationId,
      preparationExpiresAt: '2026-08-14T22:30:00Z',
      memberKeyGeneration: 3,
      agentAccessEpoch: 2,
      recipientAgentKeyVersion: 4,
      agentKeyFingerprint: toBase64Url(await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.agentX25519)),
      agentPublicKey: toBase64(publicKey),
    }
  })

  it('uses the bounded prepare, material, append, commit, and cancel contract', async () => {
    mocks.post
      .mockReturnValueOnce({ json: vi.fn().mockResolvedValue(preparation) })
      .mockReturnValueOnce({ json: vi.fn().mockResolvedValue({ id: grantId }) })
    mocks.get.mockReturnValue({ json: vi.fn().mockResolvedValue({ items: [], nextAfterEntryId: null }) })
    mocks.put.mockReturnValue({
      json: vi.fn().mockResolvedValue({ acceptedEntries: 1, totalPreparedEntries: 1 }),
    })
    mocks.delete.mockResolvedValue(undefined)

    await expect(prepareFullGrant(vaultId, {
      grantId,
      agentId,
      methods: 'Get, Exec',
      queryLimit: 3,
    })).resolves.toEqual(preparation)
    await expect(getFullGrantPreparationMaterial(vaultId, grantId, {
      organizationId, memberKeyGeneration: 3,
    }))
      .resolves.toEqual({ items: [], nextAfterEntryId: null })
    await expect(appendFullGrantPreparationEntries(vaultId, grantId, [{} as never]))
      .resolves.toEqual({ acceptedEntries: 1, totalPreparedEntries: 1 })
    await expect(commitFullGrantPreparation(vaultId, grantId)).resolves.toEqual({ id: grantId })
    await expect(cancelFullGrantPreparation(vaultId, grantId)).resolves.toBeUndefined()

    const base = `api/vaults/${vaultId}/grants/full/preparations`
    expect(mocks.post).toHaveBeenNthCalledWith(1, base, { json: {
      grantId, agentId, methods: 'Get, Exec', queryLimit: 3,
    } })
    expect(mocks.get).toHaveBeenCalledWith(`${base}/${grantId}/material`, {
      searchParams: { pageSize: '100' },
    })
    expect(mocks.put).toHaveBeenCalledWith(`${base}/${grantId}/entries`, {
      json: { grantEntries: [{}] },
    })
    expect(mocks.post).toHaveBeenNthCalledWith(2, `${base}/${grantId}/commit`)
    expect(mocks.delete).toHaveBeenCalledWith(`${base}/${grantId}`)
  })

  it('rejects recipient fingerprint substitution in the preparation response', async () => {
    mocks.post.mockReturnValue({ json: vi.fn().mockResolvedValue({
      ...preparation,
      agentKeyFingerprint: toBase64Url(new Uint8Array(32).fill(9)),
    }) })

    await expect(prepareFullGrant(vaultId, {
      grantId, agentId, methods: 'Get',
    })).rejects.toThrow('Full grant recipient key material is invalid')
  })

  it('accepts all preparation generation fields across the complete u32 range', async () => {
    const zeroGenerationPreparation = {
      ...preparation,
      memberKeyGeneration: 0,
      agentAccessEpoch: 0,
      recipientAgentKeyVersion: 0,
    }
    mocks.post.mockReturnValue({ json: vi.fn().mockResolvedValue(zeroGenerationPreparation) })

    await expect(prepareFullGrant(vaultId, {
      grantId, agentId, methods: 'Get',
    })).resolves.toEqual(zeroGenerationPreparation)
  })

  it('rejects material outside the prepared organization scope', async () => {
    mocks.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      items: [materialItem('66666666-6666-4666-8666-666666666666')],
      nextAfterEntryId: null,
    }) })

    await expect(getFullGrantPreparationMaterial(vaultId, grantId, {
      organizationId, memberKeyGeneration: 3,
    })).rejects.toThrow('Full grant material scope mismatch')
  })

  it('rejects an empty page with a non-advancing continuation cursor', async () => {
    mocks.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      items: [], nextAfterEntryId: entryId,
    }) })

    await expect(getFullGrantPreparationMaterial(vaultId, grantId, {
      organizationId, memberKeyGeneration: 3,
    })).rejects.toThrow('Full grant material cursor did not advance')
  })

  it('rejects a continuation cursor that does not identify the last page item', async () => {
    mocks.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      items: [materialItem()], nextAfterEntryId: otherEntryId,
    }) })

    await expect(getFullGrantPreparationMaterial(vaultId, grantId, {
      organizationId, memberKeyGeneration: 3,
    })).rejects.toThrow('Full grant material cursor did not advance')
  })

  it('rejects a repeated continuation cursor', async () => {
    mocks.get.mockReturnValue({ json: vi.fn().mockResolvedValue({
      items: [materialItem()], nextAfterEntryId: entryId,
    }) })

    await expect(getFullGrantPreparationMaterial(vaultId, grantId, {
      organizationId, memberKeyGeneration: 3,
    }, entryId)).rejects.toThrow('Full grant material cursor did not advance')
  })

  it('rejects append batches above the frozen page limit before issuing a request', async () => {
    await expect(appendFullGrantPreparationEntries(
      vaultId,
      grantId,
      Array.from({ length: 101 }, () => ({} as never)),
    )).rejects.toThrow('between 1 and 100')
    expect(mocks.put).not.toHaveBeenCalled()
  })
})
