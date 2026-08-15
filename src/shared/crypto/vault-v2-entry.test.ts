import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from '../types/entry-type'
import { decryptVaultEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import {
  buildEntryProjections,
  createEntryUpdateMaterial,
  createEntryRestoreMaterial,
  createInitialEntryMaterial,
  decryptMemberSecret,
  decryptHistoricalMemberSecret,
  defaultAgentVisibilityPolicy,
  ENTRY_FIELD,
  validateAgentVisibilityPolicy,
} from './vault-v2-entry'

const scope = {
  organizationId: '00112233-4455-4677-8899-aabbccddeeff',
  vaultId: '11112233-4455-4677-8899-aabbccddeeff',
  entryId: '22222233-4455-4677-8899-aabbccddeeff',
  vaultKeyVersion: 4,
  vdkVersion: 3,
  memberKeyGeneration: 2,
}

describe('Agent Visibility Policy', () => {
  it('uses privacy-preserving defaults for Credential Discovery', () => {
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL)
    expect(policy.fields[ENTRY_FIELD.username]).toBe('discovery')
    expect(policy.fields[ENTRY_FIELD.urlDomain]).toBe('discovery')
    expect(policy.fields[ENTRY_FIELD.password]).toBe('onGrantValue')
    expect(policy.fields[ENTRY_FIELD.notes]).toBe('onGrantValue')
    expect(policy.fields[ENTRY_FIELD.totp]).toBe('onGrantDerived')
  })

  it('rejects TOTP disclosure and Script source outside the trusted runtime', () => {
    const credential = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL)
    credential.fields[ENTRY_FIELD.totp] = 'discovery'
    expect(() => validateAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, credential)).toThrow()

    const script = defaultAgentVisibilityPolicy(ENTRY_TYPE_SCRIPT)
    script.fields[ENTRY_FIELD.script] = 'onGrantValue'
    expect(() => validateAgentVisibilityPolicy(ENTRY_TYPE_SCRIPT, script)).toThrow()
  })

  it('omits AgentDiscovery when the Member disables Discovery', () => {
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY)
    policy.discoverable = false
    policy.fields[ENTRY_FIELD.agentLabel] = 'never'
    const projections = buildEntryProjections({
      memberLabel: 'Private key',
      agentLabel: 'Private key',
      entryType: ENTRY_TYPE_KEY,
      content: { type: ENTRY_TYPE_KEY, value: 'secret' },
      policy,
    })
    expect(projections.agentDiscovery).toBeUndefined()
    expect(projections.memberSecret.content).toEqual({ type: ENTRY_TYPE_KEY, value: 'secret' })
  })
})

describe('canonical Entry create material', () => {
  it('encrypts all initial projections at the same revision and authenticates their scope', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const material = await createInitialEntryMaterial({
      memberLabel: 'GitHub private',
      agentLabel: 'GitHub work',
      description: 'Member only',
      entryType: ENTRY_TYPE_CREDENTIAL,
      content: {
        type: ENTRY_TYPE_CREDENTIAL,
        username: 'octocat',
        password: 'secret',
        url: 'https://github.com/login',
        fields: [{ id: 'totp-id', label: '2FA', type: 'totp', value: {
          secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30,
        } }],
      },
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [{
        id: 'totp-id', label: '2FA', type: 'totp', value: {
          secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30,
        },
      }]),
    }, scope, vaultKey, discoveryKey)

    expect(material.entryKey.wrapperRevision).toBe('1')
    expect(material.memberIndex.memberIndexRevision).toBe('1')
    expect(material.memberSecret.revision).toBe('1')
    expect(material.agentDiscovery?.agentDiscoveryRevision).toBe('1')

    const entryDek = await decryptVaultEnvelope('entry-key-wrapper', material.entryKey, vaultKey, {
      aadContext: material.entryKey,
      minimumMemberKeyGeneration: scope.memberKeyGeneration,
    })
    const memberSecretKey = await deriveVaultProjectionKey({
      baseKey: entryDek,
      purpose: 'member-secret',
      resourceKind: 2,
      organizationId: scope.organizationId,
      vaultId: scope.vaultId,
      entryId: scope.entryId,
      keyVersion: 1,
      memberKeyGeneration: scope.memberKeyGeneration,
    })
    const secretBytes = await decryptVaultEnvelope('member-secret', material.memberSecret, memberSecretKey, {
      aadContext: material.memberSecret,
      minimumMemberKeyGeneration: scope.memberKeyGeneration,
    })
    const secret = JSON.parse(new TextDecoder().decode(secretBytes))
    expect(secret.content.password).toBe('secret')
    expect(secret.agentVisibilityPolicy.fields.totp).toBe('onGrantDerived')

    const discoveryKeyDerived = await deriveVaultProjectionKey({
      baseKey: discoveryKey,
      purpose: 'agent-discovery',
      resourceKind: 2,
      organizationId: scope.organizationId,
      vaultId: scope.vaultId,
      entryId: scope.entryId,
      keyVersion: scope.vdkVersion,
      memberKeyGeneration: scope.memberKeyGeneration,
    })
    const discoveryBytes = await decryptVaultEnvelope(
      'agent-discovery',
      material.agentDiscovery!,
      discoveryKeyDerived,
      { aadContext: material.agentDiscovery!, minimumMemberKeyGeneration: scope.memberKeyGeneration },
    )
    const discovery = JSON.parse(new TextDecoder().decode(discoveryBytes))
    expect(discovery).toMatchObject({
      agentLabel: 'GitHub work',
      fields: { username: 'octocat', urlDomain: 'github.com' },
    })
    expect(JSON.stringify(discovery)).not.toContain('secret')
    expect(JSON.stringify(discovery)).not.toContain('JBSWY3DPEHPK3PXP')

    await expect(decryptVaultEnvelope(
      'member-secret',
      material.memberSecret,
      memberSecretKey,
      {
        aadContext: { ...material.memberSecret, entryId: '33333333-4455-4677-8899-aabbccddeeff' },
        minimumMemberKeyGeneration: scope.memberKeyGeneration,
      },
    )).rejects.toThrow('context mismatch')
  })
})

describe('canonical Entry versioned update', () => {
  it('restores Archived plaintext as a new revision and advances the independent Discovery watermark', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY)
    const initial = await createInitialEntryMaterial({ memberLabel: 'Archived', agentLabel: 'Agent',
      entryType: ENTRY_TYPE_KEY, content: { type: ENTRY_TYPE_KEY, value: 'secret' }, policy },
    scope, vaultKey, discoveryKey)
    const plaintext = await decryptMemberSecret({
      organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId,
      state: 'active', currentRevision: '1', memberIndexRevision: '1', agentDiscoveryRevision: '1',
      agentDiscoveryRevisionHighWatermark: '1', currentKeyVersion: 1, createdAt: '', createdBy: scope.entryId,
      updatedAt: '', updatedBy: scope.entryId, memberIndex: initial.memberIndex,
      memberSecret: initial.memberSecret, agentDiscovery: initial.agentDiscovery, entryKey: initial.entryKey,
    }, vaultKey)
    const archived = {
      organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId,
      state: 'archived' as const, currentRevision: '7', memberIndexRevision: '1', agentDiscoveryRevision: null,
      agentDiscoveryRevisionHighWatermark: '3', currentKeyVersion: 1, createdAt: '', createdBy: scope.entryId,
      updatedAt: '', updatedBy: scope.entryId, memberIndex: initial.memberIndex,
      memberSecret: initial.memberSecret, agentDiscovery: null, entryKey: initial.entryKey,
    }
    const restore = await createEntryRestoreMaterial(
      archived, plaintext, vaultKey, scope.vdkVersion, discoveryKey,
    )
    expect(restore.baseRevision).toBe('7')
    expect(restore.memberSecret).toMatchObject({ revision: '8', operation: 4 })
    expect(restore.agentDiscovery).toMatchObject({ agentDiscoveryRevision: '4' })
    const restored = await decryptMemberSecret({ ...archived, state: 'active', currentRevision: '8',
      agentDiscoveryRevision: '4', agentDiscoveryRevisionHighWatermark: '4',
      memberSecret: restore.memberSecret, agentDiscovery: restore.agentDiscovery }, vaultKey)
    expect(restored.content).toEqual({ type: ENTRY_TYPE_KEY, value: 'secret' })
  })

  it('restores Deleted plaintext as a new authenticated revision', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const initial = await createInitialEntryMaterial({ memberLabel: 'Deleted', agentLabel: 'Agent',
      entryType: ENTRY_TYPE_KEY, content: { type: ENTRY_TYPE_KEY, value: 'secret' },
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY) }, scope, vaultKey, discoveryKey)
    const plaintext = await decryptMemberSecret({
      organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId,
      state: 'active', currentRevision: '1', memberIndexRevision: '1', agentDiscoveryRevision: '1',
      agentDiscoveryRevisionHighWatermark: '1', currentKeyVersion: 1, createdAt: '', createdBy: scope.entryId,
      updatedAt: '', updatedBy: scope.entryId, memberIndex: initial.memberIndex,
      memberSecret: initial.memberSecret, agentDiscovery: initial.agentDiscovery, entryKey: initial.entryKey,
    }, vaultKey)
    const deleted = {
      organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId,
      state: 'deleted' as const, currentRevision: '7', memberIndexRevision: '1', agentDiscoveryRevision: null,
      agentDiscoveryRevisionHighWatermark: '3', currentKeyVersion: 1, createdAt: '', createdBy: scope.entryId,
      updatedAt: '', updatedBy: scope.entryId, memberIndex: initial.memberIndex,
      memberSecret: initial.memberSecret, agentDiscovery: null, entryKey: initial.entryKey,
    }
    const restore = await createEntryRestoreMaterial(deleted, plaintext, vaultKey, scope.vdkVersion, discoveryKey)
    expect(restore.baseRevision).toBe('7')
    expect(restore.memberSecret).toMatchObject({ revision: '8', operation: 4 })
  })

  it('decrypts an immutable version with its exact historical Entry key and rejects substituted scope', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const initial = await createInitialEntryMaterial({ memberLabel: 'Old label', agentLabel: 'Agent',
      entryType: ENTRY_TYPE_KEY, content: { type: ENTRY_TYPE_KEY, value: 'old-secret' },
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY) }, scope, vaultKey, discoveryKey)
    const detailScope = { organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId }
    const historical = await decryptHistoricalMemberSecret(
      detailScope, initial.memberSecret, initial.entryKey, vaultKey,
    )
    expect(historical.content).toEqual({ type: ENTRY_TYPE_KEY, value: 'old-secret' })
    await expect(decryptHistoricalMemberSecret(detailScope, initial.memberSecret, {
      ...initial.entryKey, entryId: '33332233-4455-4677-8899-aabbccddeeff',
    }, vaultKey)).rejects.toThrow('scope mismatch')
  })

  it('creates exactly the next revision and emits only projections whose plaintext changed', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY)
    const initial = await createInitialEntryMaterial({
      memberLabel: 'API key',
      agentLabel: 'API key',
      entryType: ENTRY_TYPE_KEY,
      content: { type: ENTRY_TYPE_KEY, value: 'old-secret' },
      policy,
    }, scope, vaultKey, discoveryKey)
    const detail = {
      organizationId: scope.organizationId,
      vaultId: scope.vaultId,
      id: scope.entryId,
      state: 'active' as const,
      currentRevision: '1',
      memberIndexRevision: '1',
      agentDiscoveryRevision: '1',
      agentDiscoveryRevisionHighWatermark: '1',
      currentKeyVersion: 1,
      createdAt: '2026-07-26T00:00:00Z',
      createdBy: '33333333-4455-4677-8899-aabbccddeeff',
      updatedAt: '2026-07-26T00:00:00Z',
      updatedBy: '33333333-4455-4677-8899-aabbccddeeff',
      memberIndex: initial.memberIndex,
      memberSecret: initial.memberSecret,
      agentDiscovery: initial.agentDiscovery,
      entryKey: initial.entryKey,
    }
    const previous = await decryptMemberSecret(detail, vaultKey)
    const update = await createEntryUpdateMaterial(detail, previous, {
      memberLabel: 'API key',
      agentLabel: 'API key',
      entryType: ENTRY_TYPE_KEY,
      content: { type: ENTRY_TYPE_KEY, value: 'new-secret' },
      policy,
    }, vaultKey, scope.vdkVersion, discoveryKey)

    expect(update.baseRevision).toBe('1')
    expect(update.memberSecret).toMatchObject({ revision: '2', operation: 2 })
    expect(update.memberIndex).toBeUndefined()
    expect(update.agentDiscoveryChanged).toBe(false)
    expect(update.grantEnvelopes).toEqual([])

    const decrypted = await decryptMemberSecret({
      ...detail,
      currentRevision: '2',
      memberSecret: update.memberSecret,
    }, vaultKey)
    expect(decrypted.content).toEqual({ type: ENTRY_TYPE_KEY, value: 'new-secret' })
  })

  it('binds a changed MemberIndex to the new canonical revision', async () => {
    const vaultKey = new Uint8Array(32).fill(7)
    const discoveryKey = new Uint8Array(32).fill(9)
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY)
    const initial = await createInitialEntryMaterial({ memberLabel: 'Old', agentLabel: 'Agent',
      entryType: ENTRY_TYPE_KEY, content: { type: ENTRY_TYPE_KEY, value: 'secret' }, policy }, scope, vaultKey, discoveryKey)
    const detail = { organizationId: scope.organizationId, vaultId: scope.vaultId, id: scope.entryId,
      state: 'active' as const, currentRevision: '1', memberIndexRevision: '1', agentDiscoveryRevision: '1',
      agentDiscoveryRevisionHighWatermark: '1',
      currentKeyVersion: 1, createdAt: '', createdBy: scope.entryId, updatedAt: '', updatedBy: scope.entryId,
      memberIndex: initial.memberIndex, memberSecret: initial.memberSecret,
      agentDiscovery: initial.agentDiscovery, entryKey: initial.entryKey }
    const previous = await decryptMemberSecret(detail, vaultKey)
    const update = await createEntryUpdateMaterial(detail, previous, { memberLabel: 'New', agentLabel: 'Agent',
      entryType: ENTRY_TYPE_KEY, content: previous.content, policy }, vaultKey, scope.vdkVersion, discoveryKey)

    expect(update.memberIndex?.memberIndexRevision).toBe('2')
    expect(update.memberIndex?.header.resourceRevision).toBe('2')
    expect(update.agentDiscoveryChanged).toBe(false)
  })
})
