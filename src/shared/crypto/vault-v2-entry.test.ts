import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from '../../features/vaults/types'
import { decryptVaultEnvelope } from './vault-v2-envelope'
import { deriveVaultProjectionKey } from './vault-v2-kdf'
import {
  buildEntryProjections,
  createInitialEntryMaterial,
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
