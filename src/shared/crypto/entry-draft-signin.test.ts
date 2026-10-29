import { describe, expect, it } from 'vitest'
import type { CustomField } from '../../features/vaults/types'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from '../types/entry-type'
import {
  allowedAgentFieldAccess,
  defaultAgentVisibilityPolicy,
  fromMemberSecret,
  toMemberSecret,
  withNewCredentialTotpPolicy,
  withNewSignInMethodPolicy,
  type AgentVisibilityPolicy,
} from './entry-draft'
import {
  allowedAgentFieldAccess as allowedV2AgentFieldAccess,
  defaultAgentVisibilityPolicy as defaultV2AgentVisibilityPolicy,
} from './vault-v2-entry'
import { encodeMemberSecret, parseMemberSecret, projectAgentDiscovery, projectMemberIndex } from './vault-plaintext'

const SIGN_IN_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const POLICY_ID = `custom:${SIGN_IN_ID}`
const linked = { vaultId: '0b5e8f0c-1d2a-4c3b-8e4f-5a6b7c8d9e0f', entryId: '7c1d2e3f-4a5b-4c6d-9e7f-8091a2b3c4d5' }

function signIn(value: unknown, id = SIGN_IN_ID): CustomField {
  return { id, label: 'Sign-in method', type: 'palladin.signin.v1', value: value as CustomField['value'] }
}

const binding = signIn({ provider: 'google', account: 'alice@gmail.com', entry: linked })
const retired = signIn({ provider: 'google', account: 'alice@gmail.com' })

function credential(fields: CustomField[], policy: AgentVisibilityPolicy) {
  return toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL, policy,
    payload: { type: ENTRY_TYPE_CREDENTIAL, username: '', password: '', url: 'https://example.com', fields } })
}

describe('palladin.signin.v1 Agent policy', () => {
  it('allows only never or discovery for a valid binding on a Credential', () => {
    expect(allowedAgentFieldAccess(ENTRY_TYPE_CREDENTIAL, POLICY_ID, binding.type, binding.value)).toEqual(['never', 'discovery'])
    expect(allowedV2AgentFieldAccess(ENTRY_TYPE_CREDENTIAL, POLICY_ID, binding.type, binding.value)).toEqual(['never', 'discovery'])
  })

  it('allows only never for retired values and on other entry types', () => {
    for (const [type, field] of [
      [ENTRY_TYPE_CREDENTIAL, retired], [ENTRY_TYPE_KEY, binding], [ENTRY_TYPE_SCRIPT, binding], [ENTRY_TYPE_CREDIT_CARD, binding],
    ] as const) {
      expect(allowedAgentFieldAccess(type, POLICY_ID, field.type, field.value)).toEqual(['never'])
      expect(allowedV2AgentFieldAccess(type, POLICY_ID, field.type, field.value)).toEqual(['never'])
      expect(defaultAgentVisibilityPolicy(type, [field]).fields[POLICY_ID]).toBe('never')
      expect(defaultV2AgentVisibilityPolicy(type, [field]).fields[POLICY_ID]).toBe('never')
    }
  })

  it('defaults a valid binding on a discoverable Credential to discovery', () => {
    expect(defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding]).fields[POLICY_ID]).toBe('discovery')
    expect(defaultV2AgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding]).fields[POLICY_ID]).toBe('discovery')
  })

  it('rejects a grant mode for the binding at the canonical encoder', () => {
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding])
    const secret = credential([binding], { ...policy, fields: { ...policy.fields, [POLICY_ID]: 'onGrantValue' } })
    expect(() => encodeMemberSecret(secret)).toThrow(/Unsafe AgentFieldAccess/)
  })

  it('writes a new binding as discovery only when the Credential is discoverable, keeping existing access', () => {
    const discoverable = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL)
    expect(withNewSignInMethodPolicy(ENTRY_TYPE_CREDENTIAL, [], [binding], discoverable).fields[POLICY_ID]).toBe('discovery')
    const hidden = { ...discoverable, discoverable: false }
    expect(withNewSignInMethodPolicy(ENTRY_TYPE_CREDENTIAL, [], [binding], hidden).fields[POLICY_ID]).toBe('never')
    const restricted = { ...discoverable, fields: { ...discoverable.fields, [POLICY_ID]: 'never' as const } }
    expect(withNewSignInMethodPolicy(ENTRY_TYPE_CREDENTIAL, [binding], [binding], restricted).fields[POLICY_ID]).toBe('never')
    expect(withNewSignInMethodPolicy(ENTRY_TYPE_CREDENTIAL, [], [retired], discoverable).fields[POLICY_ID]).toBe('never')
    expect(withNewCredentialTotpPolicy([], [binding], discoverable).fields[POLICY_ID]).toBeUndefined()
  })
})

describe('palladin.signin.v1 Agent Discovery projection', () => {
  it('projects the provider and linked entry, never the account or the custom field id', () => {
    const secret = credential([binding], defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding]))
    const parsed = parseMemberSecret(encodeMemberSecret(secret))
    const discovery = projectAgentDiscovery(parsed)

    expect(discovery?.fields).toContainEqual({ id: 'signIn', value: JSON.stringify({
      entry: { entryId: linked.entryId, vaultId: linked.vaultId }, provider: 'google', schema: 'palladin.signin.v1',
    }) })
    expect(JSON.stringify(discovery)).not.toContain('alice@gmail.com')
    expect(JSON.stringify(discovery)).not.toContain(POLICY_ID)
    expect(JSON.stringify(projectMemberIndex(parsed))).not.toContain('alice@gmail.com')
  })

  it('projects nothing when the binding is not discoverable or the Credential is hidden', () => {
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding])
    const never = credential([binding], { ...policy, fields: { ...policy.fields, [POLICY_ID]: 'never' } })
    expect(projectAgentDiscovery(parseMemberSecret(encodeMemberSecret(never)))?.fields.map(({ id }) => id))
      .not.toContain('signIn')
    const hidden = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      policy: { discoverable: false, fields: { ...policy.fields, agentLabel: 'never' } },
      payload: { type: ENTRY_TYPE_CREDENTIAL, username: '', password: '', fields: [binding] } })
    expect(projectAgentDiscovery(parseMemberSecret(encodeMemberSecret(hidden)))).toBeNull()
  })

  it('never projects ambiguous multi-account bindings', () => {
    const second = signIn({ provider: 'google', account: 'bob@gmail.com', entry: null }, '5e4d3c2b-1a09-4f87-a6b5-c4d3e2f1a0b9')
    const secret = credential([binding, second], defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding, second]))
    const discovery = projectAgentDiscovery(parseMemberSecret(encodeMemberSecret(secret)))
    expect(discovery?.fields.map(({ id }) => id)).not.toContain('signIn')
    expect(JSON.stringify(discovery)).not.toContain('gmail.com')
  })
})

describe('palladin.signin.v1 persistence', () => {
  it('preserves a retired two-key value byte-for-byte through decode and re-encode', () => {
    const secret = credential([retired], defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [retired]))
    const opened = fromMemberSecret(parseMemberSecret(encodeMemberSecret(secret)))
    const again = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      payload: opened.content, policy: opened.agentVisibilityPolicy })
    expect(encodeMemberSecret(again)).toEqual(encodeMemberSecret(secret))
  })

  it('removes the binding together with its policy entry', () => {
    const secret = credential([binding], defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [binding]))
    const opened = fromMemberSecret(parseMemberSecret(encodeMemberSecret(secret)))
    const removed = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      payload: { ...opened.content, fields: [] }, policy: opened.agentVisibilityPolicy })
    const parsed = parseMemberSecret(encodeMemberSecret(removed))
    expect(parsed.content.customFields).toEqual([])
    expect(parsed.agentFieldAccess).not.toHaveProperty(POLICY_ID)
  })
})
