import { beforeEach, describe, expect, it, vi } from 'vitest'

const getJson = vi.hoisted(() => vi.fn())
const putFn = vi.hoisted(() => vi.fn())

vi.mock('../../../shared/api/client', () => ({
  api: {
    get: vi.fn(() => ({ json: getJson })),
    put: putFn,
  },
}))

import { api } from '../../../shared/api/client'
import {
  approveGrant,
  denyGrant,
  getPendingGrants,
} from './pending-grants-api'

// Real backend shape (GrantResponse projection) — the actual `/pending-grants`
// payload, with the new `agentName` / `entryLabel` enrichment.
const samplePending = {
  id: '33333333-3333-4333-8333-333333333333',
  vaultId: '22222222-2222-4222-8222-222222222222',
  agentId: '44444444-4444-4444-8444-444444444444',
  agentAccessEpoch: 1,
  agentName: 'Deploy Bot',
  agentIconKey: null,
  agentPublicKey: 'public',
  recipientAgentKeyVersion: 1,
  agentSigningPublicKey: 'signing',
  agentSigningKeyVersion: 1,
  agentSigningKeyFingerprint: 'fingerprint',
  type: 'granular',
  status: 'pending',
  methods: 'get',
  entryId: '55555555-5555-4555-8555-555555555555',
  entryLabel: 'Gmail',
  urlDomain: null,
  entryScopes: [],
  scriptScopes: [],
  scriptPackageRevision: null,
  expiresAt: null,
  queryLimit: null,
  queryCount: 0,
  expirySource: 'uses',
  createdAt: '2026-06-01T10:00:00Z',
  createdBy: '66666666-6666-4666-8666-666666666666',
  createdByName: 'User',
  revokedAt: null,
  revokedBy: null,
  revokedByName: null,
  supersededAt: null,
  supersededByGrantId: null,
  deniedAt: null,
  deniedBy: null,
  deniedByName: null,
  lastAccessedAt: null,
  lastAccessIp: null,
  lastAccessHostname: null,
  canRevoke: false,
  canGrantAgain: false,
  activeCoveringGrantIds: [],
  encryptedReason: {
    descriptor: {
      protocolVersion: 2, cryptoSuiteId: 'palladin-vault-xchacha-v1', purpose: 'encryptedReason',
      scope: { organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '55555555-5555-4555-8555-555555555555', grantOrRequestId: '33333333-3333-4333-8333-333333333333',
        agentId: '44444444-4444-4444-8444-444444444444', memberId: null },
      resourceRevision: '1', keyVersion: 1, memberKeyGeneration: 1,
      binding: { wrapperSuiteId: 'palladin-x25519-sealed-box-v1', recipientKeyVersion: 1,
        recipientKeyFingerprint: 'fingerprint', requestedMethods: 6 },
    },
    encodedSuitePayload: 'ciphertext',
    wrappedReasonDek: { descriptor: {
      protocolVersion: 2, wrapperSuiteId: 'palladin-x25519-sealed-box-v1', purpose: 'reasonDek',
      scope: { organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '55555555-5555-4555-8555-555555555555', grantOrRequestId: '33333333-3333-4333-8333-333333333333',
        agentId: '44444444-4444-4444-8444-444444444444', memberId: null },
      resourceRevision: '1', wrappedKeyVersion: 1, memberKeyGeneration: 1, recipientKeyKind: 'vaultMessageX25519',
      recipientKeyVersion: 1, recipientFingerprint: 'fingerprint', parentDescriptorHash: 'hash',
    }, encodedSealedKeyPackage: 'wrapped' },
    agentSignature: 'A'.repeat(86),
  },
}

describe('pending-grants-api', () => {
  beforeEach(() => {
    getJson.mockReset()
    putFn.mockReset()
    vi.mocked(api.get).mockClear()
  })

  it('parses the real backend shape (id, agentName, entryLabel)', async () => {
    getJson.mockResolvedValue({ items: [samplePending], nextCursor: null })
    const items = await getPendingGrants()
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(samplePending.id)
    expect(items[0].agentName).toBe('Deploy Bot')
    expect(items[0].entryLabel).toBe('Gmail')
    expect(items[0].entryId).toBe(samplePending.entryId)
  })

  it('keeps a pending ScriptExecution request and its structural scope', async () => {
    const script = {
      ...samplePending,
      type: 'scriptExecution',
      methods: 'exec',
      scriptScopes: [
        { entryId: samplePending.entryId, entryRevision: '7', isScript: true },
        { entryId: '77777777-7777-4777-8777-777777777777', entryRevision: '3', isScript: false },
      ],
    }
    getJson.mockResolvedValue({ items: [script], nextCursor: null })

    await expect(getPendingGrants()).resolves.toEqual([
      expect.objectContaining({
        type: 'scriptExecution',
        scriptScopes: script.scriptScopes,
      }),
    ])
  })

  it('defaults covering grants when reading a pre-rollout pending response', async () => {
    const preRolloutPending = Object.fromEntries(
      Object.entries(samplePending).filter(([key]) => key !== 'activeCoveringGrantIds'),
    )
    getJson.mockResolvedValue({ items: [preRolloutPending], nextCursor: null })

    const items = await getPendingGrants()

    expect(items).toHaveLength(1)
    expect(items[0].activeCoveringGrantIds).toEqual([])
  })

  it('does not reject a forward-compatible backend field', async () => {
    getJson.mockResolvedValue({
      items: [
        {
          ...samplePending,
          futurePresentationField: 'supported-by-newer-backend',
        },
      ],
      nextCursor: null,
    })
    await expect(getPendingGrants()).resolves.toEqual([
      expect.objectContaining({ id: samplePending.id }),
    ])
  })

  it('fails closed only for the row whose encrypted reason contract is invalid', async () => {
    const invalidGrant = {
      ...samplePending,
      id: '77777777-7777-4777-8777-777777777777',
      encryptedReason: { ...samplePending.encryptedReason, agentSignature: '' },
    }
    getJson.mockResolvedValue({
      items: [
        invalidGrant,
        samplePending,
      ],
      nextCursor: null,
    })

    await expect(getPendingGrants()).resolves.toEqual([
      expect.objectContaining({ id: samplePending.id }),
    ])
  })

  it('ignores a transport-malformed row without hiding valid pending grants', async () => {
    getJson.mockResolvedValue({
      items: [
        null,
        42,
        [],
        { ...samplePending, agentName: {} },
        samplePending,
      ],
      nextCursor: null,
    })

    await expect(getPendingGrants()).resolves.toEqual([
      expect.objectContaining({ id: samplePending.id }),
    ])
  })

  it('PUTs the approve envelope with an expiresAt policy', async () => {
    putFn.mockResolvedValue(undefined)
    await approveGrant('v1', 'g1', {
      grantEntry: {
        entryId: 'e1',
        reEncryptedBlob: 'blob',
        nonce: 'nonce',
        agentWrappedDek: 'dek',
      },
      expiresAt: '2026-06-04T12:00:00.000Z',
    } as never)
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/approve', {
      json: {
        grantEntry: {
          entryId: 'e1',
          reEncryptedBlob: 'blob',
          nonce: 'nonce',
          agentWrappedDek: 'dek',
        },
        expiresAt: '2026-06-04T12:00:00.000Z',
      },
    })
  })

  it('PUTs one complete Script package without granular material', async () => {
    putFn.mockResolvedValue(undefined)
    await approveGrant('v1', 'g1', {
      scriptPackage: { encodedPackageCiphertext: 'sealed-script-package' },
      queryLimit: 3,
      methods: 'Exec',
    } as never)
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/approve', {
      json: {
        scriptPackage: { encodedPackageCiphertext: 'sealed-script-package' },
        queryLimit: 3,
        methods: 'Exec',
      },
    })
  })

  it('sends a trimmed reason on deny, empty body when none', async () => {
    putFn.mockResolvedValue(undefined)
    await denyGrant('v1', 'g1', '  too risky  ')
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/deny', {
      json: { reason: 'too risky' },
    })

    putFn.mockClear()
    await denyGrant('v1', 'g1')
    expect(putFn).toHaveBeenCalledWith('api/vaults/v1/grants/g1/deny', {
      json: {},
    })
  })
})
