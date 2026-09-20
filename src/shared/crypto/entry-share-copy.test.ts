import { describe, expect, it } from 'vitest'
import { entryShareCopySecret, missingEntryShareCopyFields } from './entry-share-copy'
import { encodeMemberSecret, parseMemberSecret } from './vault-plaintext'
import type { EntryShareSnapshot } from './entry-share'
import fixture from './fixtures/entry-share-v1.json'

const snapshot = fixture.snapshot as EntryShareSnapshot
const form = { title: ' My copy ', additions: {} }

describe('Received snapshot to independent Entry', () => {
  it('copies selected credential fields without introducing Discovery or source policy', () => {
    const secret = entryShareCopySecret(snapshot, form)
    expect(secret).toMatchObject({ memberLabel: 'My copy', discoverable: false, agentLabel: null, icon: null,
      entryType: 'credential', content: { username: '', password: 'fixture-only', totp: null, customFields: [] } })
    expect(Object.values(secret.agentFieldAccess).every((access) => access === 'never')).toBe(true)
    expect(parseMemberSecret(encodeMemberSecret(secret))).toEqual(secret)
  })

  it('does not mutate the received copy and gives copied custom fields new identities', () => {
    const source: EntryShareSnapshot = { ...snapshot, fields: [...snapshot.fields,
      { id: 'custom:source-field', label: 'Recovery', type: 'concealed', value: '  recovery\nsecret  ' }] }
    const original = JSON.stringify(source)
    const first = entryShareCopySecret(source, form), second = entryShareCopySecret(source, form)
    expect(first.content.customFields[0]).toMatchObject({ label: 'Recovery', type: 'concealed', value: '  recovery\nsecret  ' })
    expect(first.content.customFields[0].id).not.toBe(second.content.customFields[0].id)
    expect(first.content.customFields[0].id).not.toBe('custom:source-field')
    expect(JSON.stringify(source)).toBe(original)
  })

  it('preserves whitespace and refuses to silently normalize a received password', () => {
    const source: EntryShareSnapshot = { ...snapshot, fields: [{ ...snapshot.fields[0], value: '  valid secret\n' }] }
    expect(entryShareCopySecret(source, form).content).toMatchObject({ password: '  valid secret\n' })
    source.fields[0].value = 'e\u0301-private'
    expect(() => entryShareCopySecret(source, form)).toThrow('Shared copy cannot be saved with these fields')
  })

  it('never lets additions replace a received secret or introduce source policy', () => {
    expect(() => entryShareCopySecret(snapshot, { ...form, additions: { 'credential.password': 'replacement' } })).toThrow()
    expect(() => entryShareCopySecret({ ...snapshot, agentFieldAccess: {} } as EntryShareSnapshot, form)).toThrow()
  })

  it('requires missing card fields without inventing their values', () => {
    const card: EntryShareSnapshot = { ...snapshot, entryType: 'creditCard', fields: [
      { id: 'creditCard.cardNumber', label: '', type: 'concealed', value: '4111111111111111' }] }
    expect(missingEntryShareCopyFields(card)).toEqual(['creditCard.cardholderName', 'creditCard.expiryMonth', 'creditCard.expiryYear'])
    expect(() => entryShareCopySecret(card, form)).toThrow()
    const secret = entryShareCopySecret(card, { ...form, additions: {
      'creditCard.cardholderName': 'Example User', 'creditCard.expiryMonth': '12', 'creditCard.expiryYear': '2030' } })
    expect(secret.entryType).toBe('creditCard')
    expect(secret.content).toMatchObject({ cardNumber: '4111111111111111', expiryMonth: '12', expiryYear: '2030' })
    expect(Object.values(secret.agentFieldAccess).every((access) => access === 'never')).toBe(true)
  })

  it('copies inert Script source without references or execution policy', () => {
    const script: EntryShareSnapshot = { ...snapshot, entryType: 'script', fields: [
      { id: 'script.source', label: '', type: 'multiline', value: 'echo example' }] }
    expect(missingEntryShareCopyFields(script)).toEqual(['script.interpreter'])
    expect(() => entryShareCopySecret(script, form)).toThrow()
    const secret = entryShareCopySecret(script, { ...form, additions: { 'script.interpreter': 'sh' } })
    expect(secret.content).toMatchObject({ source: 'echo example', interpreter: 'sh', refs: [] })
    expect(secret.content).not.toHaveProperty('execution')
    expect(secret.discoverable).toBe(false)
  })

  it('saves a partial Key and a valid TOTP as a new non-grantable field', () => {
    const key: EntryShareSnapshot = { ...snapshot, entryType: 'key', fields: [
      { id: 'key.url', label: '', type: 'text', value: 'https://example.test' },
      { id: 'custom:otp', label: 'OTP', type: 'totp', value: 'otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP' }] }
    const secret = entryShareCopySecret(key, form)
    expect(secret.content).toMatchObject({ value: '', url: 'https://example.test' })
    expect(secret.content.customFields[0].value).toMatchObject({ secret: 'JBSWY3DPEHPK3PXP', digits: 6 })
    expect(Object.values(secret.agentFieldAccess).every((access) => access === 'never')).toBe(true)
  })
})
