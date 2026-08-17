import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('../../../shared/api/client', () => ({ api: apiMock }))

import {
  encryptedVaultDetailSchema,
  getMemberSnapshotPage,
  memberSyncItemSchema,
} from './member-sync-api'

const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const memberId = '33333333-3333-4333-8333-333333333333'

function scope(extra: Partial<Record<'entryId' | 'grantOrRequestId' | 'agentId' | 'memberId', string>> = {}) {
  return {
    organizationId,
    vaultId,
    entryId: null,
    grantOrRequestId: null,
    agentId: null,
    memberId: null,
    ...extra,
  }
}

function envelope(purpose: 'memberVaultMetadata' | 'vaultDiscoveryKey' | 'vaultAgentMessagePrivateKey' | 'vaultManifestSigningPrivateKey', keyVersion: number) {
  return {
    descriptor: {
      protocolVersion: 2,
      cryptoSuiteId: 'palladin-vault-xchacha-v1',
      purpose,
      scope: scope(),
      resourceRevision: purpose === 'memberVaultMetadata' ? '12' : '1',
      keyVersion,
      memberKeyGeneration: 1,
      binding: purpose === 'memberVaultMetadata' ? {} : { wrappingVaultKeyVersion: 7 },
    },
    encodedSuitePayload: 'ciphertext',
  }
}

function encryptedVaultDetail() {
  return {
    id: vaultId,
    organizationId,
    isDefault: true,
    protocolVersion: 2,
    metadataRevision: '12',
    memberSequence: '4',
    discoverySequence: '2',
    memberKeyGeneration: 1,
    currentKeyEpoch: {
      vaultKeyVersion: 7,
      vdkVersion: 3,
      agentMessageKeyVersion: 2,
      manifestSigningKeyVersion: 2,
    },
    memberVaultMetadata: envelope('memberVaultMetadata', 7),
    memberVaultKey: {
      wrappedVaultKey: {
        descriptor: {
          protocolVersion: 2,
          wrapperSuiteId: 'palladin-x25519-sealed-box-v1',
          purpose: 'memberVaultKey',
          scope: scope({ memberId }),
          resourceRevision: '1',
          wrappedKeyVersion: 7,
          memberKeyGeneration: 1,
          recipientKeyKind: 'memberX25519',
          recipientKeyVersion: 1,
          recipientFingerprint: 'fingerprint',
          parentDescriptorHash: null,
        },
        encodedSealedKeyPackage: 'wrapped-key',
      },
    },
    discoveryKey: envelope('vaultDiscoveryKey', 3),
    vaultPrivateKeys: [
      envelope('vaultAgentMessagePrivateKey', 2),
      envelope('vaultManifestSigningPrivateKey', 2),
    ],
    vaultAgentMessagePublicKey: {
      protocolVersion: 2,
      schemeId: 'palladin-x25519-v1',
      keyKind: 'agentMessageX25519',
      keyVersion: 2,
      encodedPublicKey: 'public-key',
      fingerprint: 'fingerprint',
    },
    vaultManifestSigningPublicKey: {
      protocolVersion: 2,
      schemeId: 'palladin-ed25519-v1',
      keyKind: 'manifestSigningEd25519',
      keyVersion: 2,
      encodedPublicKey: 'public-key',
      fingerprint: 'fingerprint',
    },
    createdAt: '2026-08-17T12:00:00Z',
    updatedAt: '2026-08-17T12:00:00Z',
    memberCount: 1,
    entryCount: 1,
    activeGrantCount: 0,
  }
}

describe('Member sync transport boundary', () => {
  beforeEach(() => apiMock.post.mockReset())

  it('rejects a declared response above the hard byte budget before reading its body', async () => {
    const body = new ReadableStream()
    apiMock.post.mockResolvedValue(new Response(body, {
      status: 200,
      headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
    }))

    await expect(getMemberSnapshotPage('22222222-2222-4222-8222-222222222222', null)).rejects.toThrow('hard byte limit')
  })

  it('accepts the detail metadata revision returned by the backend', () => {
    const result = encryptedVaultDetailSchema.parse(encryptedVaultDetail())

    expect(result.metadataRevision).toBe('12')
  })

  it('rejects a detail whose outer metadata revision does not match its envelope', () => {
    const detail = { ...encryptedVaultDetail(), metadataRevision: '11' }

    expect(encryptedVaultDetailSchema.safeParse(detail).success).toBe(false)
  })

  it('rejects an EntryKey whose authenticated generation is inconsistent with MemberIndex', () => {
    const item = {
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'head', state: 'active',
      updatedAt: '2026-07-26T12:00:00Z',
      currentRevision: '1', memberIndexRevision: '1', currentKeyVersion: 5,
      entryKey: {
        organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '33333333-3333-4333-8333-333333333333', wrapperRevision: '1', keyVersion: 5,
        memberKeyGeneration: 4, wrappingKeyVersion: 3, wrappedEntryDekByVk: 'ciphertext',
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 8, resourceRevision: '1', keyVersion: 5, memberKeyGeneration: 4, nonce: 'nonce' },
      },
      memberIndex: {
        organizationId: '11111111-1111-4111-8111-111111111111', vaultId: '22222222-2222-4222-8222-222222222222',
        entryId: '33333333-3333-4333-8333-333333333333', memberIndexRevision: '1', ciphertext: 'ciphertext',
        header: { protocolVersion: 2, algorithmSuite: 1, resourceKind: 2, projectionKind: 2, resourceRevision: '1', keyVersion: 5, memberKeyGeneration: 3, nonce: 'nonce' },
      },
    }

    expect(memberSyncItemSchema.safeParse(item).success).toBe(false)
  })

  it('requires the structural update timestamp on Member heads and null on tombstones', () => {
    expect(memberSyncItemSchema.safeParse({
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'tombstone', state: null,
      updatedAt: null, currentRevision: null, memberIndexRevision: null,
      currentKeyVersion: null, entryKey: null, memberIndex: null,
    }).success).toBe(true)
    expect(memberSyncItemSchema.safeParse({
      entryId: '33333333-3333-4333-8333-333333333333', kind: 'tombstone', state: null,
      currentRevision: null, memberIndexRevision: null,
      currentKeyVersion: null, entryKey: null, memberIndex: null,
    }).success).toBe(false)
  })
})
