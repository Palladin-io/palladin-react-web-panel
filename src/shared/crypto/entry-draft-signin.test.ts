import { describe, expect, it } from 'vitest'
import type { CustomField } from '../../features/vaults/types'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT } from '../types/entry-type'
import {
  allowedAgentFieldAccess,
  defaultAgentVisibilityPolicy,
  fromMemberSecret,
  toMemberSecret,
  withNewCredentialTotpPolicy,
} from './entry-draft'
import {
  allowedAgentFieldAccess as allowedV2AgentFieldAccess,
  defaultAgentVisibilityPolicy as defaultV2AgentVisibilityPolicy,
} from './vault-v2-entry'
import { encodeMemberSecret, parseMemberSecret, projectAgentDiscovery, projectMemberIndex } from './vault-plaintext'

const SIGN_IN_ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const signIn: CustomField = {
  id: SIGN_IN_ID,
  label: 'Sign-in method',
  type: 'palladin.signin.v1',
  value: { provider: 'google', account: 'alice@example.com' } as unknown as CustomField['value'],
}
const payload = {
  type: ENTRY_TYPE_CREDENTIAL, username: '', password: '', url: 'https://example.com', fields: [signIn],
} as const

describe('palladin.signin.v1 Agent policy', () => {
  it('defaults the binding to never and encodes a canonical MemberSecret', () => {
    const policy = defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [signIn])
    expect(policy.fields[`custom:${SIGN_IN_ID}`]).toBe('never')

    const secret = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL, payload, policy })
    const parsed = parseMemberSecret(encodeMemberSecret(secret))
    expect(parsed.agentFieldAccess[`custom:${SIGN_IN_ID}`]).toBe('never')
    expect(parsed.content.customFields).toEqual([{
      id: `custom:${SIGN_IN_ID}`, label: 'Sign-in method', type: 'palladin.signin.v1',
      value: { provider: 'google', account: 'alice@example.com' },
    }])
    expect(JSON.stringify(projectMemberIndex(parsed))).not.toContain('alice@example.com')
    expect(JSON.stringify(projectAgentDiscovery(parsed))).not.toContain('alice@example.com')
  })

  it('never offers discovery or grant access for non-standard custom types', () => {
    for (const type of [ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY, ENTRY_TYPE_SCRIPT]) {
      expect(allowedAgentFieldAccess(type, `custom:${SIGN_IN_ID}`, 'palladin.signin.v1')).toEqual(['never'])
      expect(allowedV2AgentFieldAccess(type, `custom:${SIGN_IN_ID}`, 'palladin.signin.v1')).toEqual(['never'])
      expect(defaultAgentVisibilityPolicy(type, [signIn]).fields[`custom:${SIGN_IN_ID}`]).toBe('never')
      expect(defaultV2AgentVisibilityPolicy(type, [signIn]).fields[`custom:${SIGN_IN_ID}`]).toBe('never')
    }
  })

  it('does not assign grant access to a binding added while editing', () => {
    const previous: CustomField[] = []
    const policy = withNewCredentialTotpPolicy(previous, [signIn], defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL))
    expect(policy.fields[`custom:${SIGN_IN_ID}`]).toBeUndefined()
    const secret = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL, payload, policy })
    expect(secret.agentFieldAccess[`custom:${SIGN_IN_ID}`]).toBe('never')
  })

  it('preserves an unrecognized binding value byte-for-byte through decode and re-encode', () => {
    const odd: CustomField = { ...signIn, value: { provider: 'Google', account: ' x ', extra: [1] } as unknown as CustomField['value'] }
    const secret = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      payload: { ...payload, fields: [odd] }, policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [odd]) })
    const opened = fromMemberSecret(parseMemberSecret(encodeMemberSecret(secret)))
    const again = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      payload: opened.content, policy: opened.agentVisibilityPolicy })
    expect(encodeMemberSecret(again)).toEqual(encodeMemberSecret(secret))
  })

  it('removes the binding together with its policy entry', () => {
    const secret = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL, payload,
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL, [signIn]) })
    const opened = fromMemberSecret(parseMemberSecret(encodeMemberSecret(secret)))
    const removed = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: ENTRY_TYPE_CREDENTIAL,
      payload: { ...opened.content, fields: [] }, policy: opened.agentVisibilityPolicy })
    const parsed = parseMemberSecret(encodeMemberSecret(removed))
    expect(parsed.content.customFields).toEqual([])
    expect(parsed.agentFieldAccess).not.toHaveProperty(`custom:${SIGN_IN_ID}`)
  })
})
