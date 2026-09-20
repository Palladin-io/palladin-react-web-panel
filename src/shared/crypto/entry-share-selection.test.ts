import { describe, expect, it } from 'vitest'
import { entryShareFieldChoices, selectEntryShareSnapshot } from './entry-share-selection'
import type { MemberSecretV1 } from './vault-plaintext'

const common = {
  schema: 'palladin.member-secret.v1' as const, memberLabel: 'Private title',
  agentLabel: 'Do not share', discoverable: true, description: 'Private description',
  icon: null, color: null, agentFieldAccess: { 'credential.password': 'onGrantValue' as const },
}
const totp = { secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1' as const, digits: 6 as const, period: 30, issuer: null, account: null }
const source: MemberSecretV1 = { ...common, entryType: 'credential', content: {
  username: 'alice', password: '  secret\u0301  ', url: 'https://example.test', urlDomain: 'example.test',
  notes: 'Private notes', totp,
  customFields: [
    { id: 'custom:recovery', label: 'Recovery codes', type: 'concealed', value: 'Recovery secret' },
    { id: 'custom:otp', label: 'Second TOTP', type: 'totp', value: totp },
    { id: 'custom:future', label: 'Unsupported field', type: 'future', value: { unknown: true } },
  ],
} }

describe('Entry sharing field selection', () => {
  it('defaults only ordinary credential fields, never TOTP, notes or any custom fields', () => {
    const choices = entryShareFieldChoices(source)
    expect(choices.fields.filter((field) => field.selectedByDefault).map((field) => field.id))
      .toEqual(['credential.username', 'credential.password', 'credential.url'])
    expect(choices.unsupported).toEqual([{ id: 'custom:future', label: 'Unsupported field' }])
  })

  it('projects only the explicit selection and never source policy or unrelated values', () => {
    const snapshot = selectEntryShareSnapshot(source, ['credential.password'])
    expect(snapshot).toEqual({ schema: 'palladin.entry-share.v1', title: 'Private title', entryType: 'credential',
      fields: [{ id: 'credential.password', label: '', type: 'concealed', value: '  secret\u0301  ' }] })
    const json = JSON.stringify(snapshot)
    for (const excluded of ['agentFieldAccess', 'discoverable', 'Recovery secret', 'Private notes', 'JBSWY3DPEHPK3PXP']) {
      expect(json).not.toContain(excluded)
    }
  })

  it('includes native TOTP, custom TOTP, recovery fields and notes only when explicitly chosen', () => {
    const selected = ['credential.totp', 'custom:otp', 'custom:recovery', 'notes']
    const snapshot = selectEntryShareSnapshot(source, selected)
    expect(snapshot.fields.map((field) => field.id).sort()).toEqual(selected.sort())
    expect(snapshot.fields.find((field) => field.id === 'credential.totp')?.value).toContain('otpauth://totp/')
    expect(snapshot.fields.find((field) => field.id === 'custom:recovery')?.value).toBe('Recovery secret')
  })

  it.each([[], ['unknown'], ['custom:future'], ['credential.password', 'credential.password']])(
    'rejects empty, unknown, unsupported and duplicate selections', (selected) => {
      expect(() => selectEntryShareSnapshot(source, selected)).toThrow('Invalid Entry sharing field selection')
    },
  )

  it('does not include Script references, source scopes or execution policy', () => {
    const script: MemberSecretV1 = { ...common, entryType: 'script', content: {
      source: 'echo "$TOKEN"', interpreter: 'bash', notes: null, customFields: [],
      refs: [{ env: 'TOKEN', vaultId: 'private-vault', entryId: 'private-entry', fieldId: 'key.value' }],
      execution: { contractVersion: 1, description: 'private execution', parameters: [], returnResultToAgent: true },
    } }
    const snapshot = selectEntryShareSnapshot(script, ['script.source', 'script.interpreter'])
    expect(snapshot.fields).toHaveLength(2)
    for (const excluded of ['private-vault', 'private-entry', 'private execution', 'returnResultToAgent']) {
      expect(JSON.stringify(snapshot)).not.toContain(excluded)
    }
  })

  it('supports Key and Credit Card snapshots without adding other fields', () => {
    const key: MemberSecretV1 = { ...common, entryType: 'key', content: {
      value: 'key-secret', url: null, notes: null, customFields: [],
    } }
    expect(selectEntryShareSnapshot(key, ['key.value']).fields[0].value).toBe('key-secret')
    const card: MemberSecretV1 = { ...common, entryType: 'creditCard', content: {
      cardholderName: 'Test Person', cardNumber: '4111111111111111', expiryMonth: '09', expiryYear: '2030',
      billingAddress: 'Private address', notes: null, customFields: [],
    } }
    const choices = entryShareFieldChoices(card).fields
    expect(choices.find((field) => field.id === 'creditCard.billingAddress')?.selectedByDefault).toBe(false)
    expect(selectEntryShareSnapshot(card, ['creditCard.cardNumber']).fields).toHaveLength(1)
  })
})
