import { describe, expect, it } from 'vitest'
import { createCapturedCredentialSecret, defaultCredentialAgentFieldAccess,
  projectCanonicalCredentialDiscovery, projectCanonicalGrantPayload,
  sealCanonicalCredentialEntry, openMemberSecret as openSharedMemberSecret,
  randomBytes, wipe } from '@palladin/crypto'
import { defaultAgentVisibilityPolicy, toMemberSecret } from './entry-draft'
import { openMemberSecret, sealCanonicalEntry } from './entry-protocol'
import { projectAgentDiscovery, projectGrantPayload } from './vault-plaintext'
import { parseOtpauthUri, totpParamsFromSecret } from './totp'

describe('CVT-573 Credential web / extension package contract', () => {
  it.each([
    ['bare secret', totpParamsFromSecret('JBSWY3DPEHPK3PXP')!],
    ['URI without issuer', parseOtpauthUri('otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP')!],
  ])('encrypts and reopens TOTP from %s for create and update', async (_label, params) => {
    const fields = [{ id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', label: '2FA', type: 'totp' as const, value: params }]
    const secret = toMemberSecret({ label: 'Example', agentLabel: 'Example', type: 1,
      payload: { type: 1, username: 'alice', password: 'test-password', fields },
      policy: defaultAgentVisibilityPolicy(1, fields) })
    const vk = await randomBytes(32)
    const vdk = await randomBytes(32)
    try {
      for (const operation of [1, 2] as const) {
        const coordinates = { organizationId: '00112233-4455-6677-8899-aabbccddeeff',
          vaultId: '11112222-3333-4444-8555-666677778888', entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          revision: String(operation), vaultKeyVersion: 1, vdkVersion: 1, memberKeyGeneration: 1 }
        const sealed = await sealCanonicalEntry(coordinates, secret, vk, vdk, operation)
        const opened = await openSharedMemberSecret(sealed.entryKey, sealed.memberSecret, vk, coordinates)
        expect(opened.content.customFields[0].value).toMatchObject({
          secret: params.secret, algorithm: params.algorithm, digits: params.digits, period: params.period,
        })
        expect(JSON.stringify(projectAgentDiscovery(secret))).not.toContain(params.secret)
      }
    } finally { wipe(vk); wipe(vdk) }
  })

  const input = { label: 'Example', username: 'alice', password: 'Literal password!',
    url: 'https://example.test', urlDomain: 'example.test' }
  const extensionSecret = createCapturedCredentialSecret(input)
  const webSecret = toMemberSecret({ label: input.label, agentLabel: input.label, type: 1,
    payload: { type: 1, username: input.username, password: input.password, url: input.url },
    policy: defaultAgentVisibilityPolicy(1) })

  it('uses the same default policy and Credential plaintext for web creation and extension capture', () => {
    expect(webSecret.agentFieldAccess).toEqual(defaultCredentialAgentFieldAccess())
    expect(webSecret).toEqual(extensionSecret)
    expect(projectAgentDiscovery(webSecret)).toEqual(projectCanonicalCredentialDiscovery(extensionSecret))
  })

  it('maps shared custom-field defaults back into the web form vocabulary', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    const policy = defaultAgentVisibilityPolicy(1, [{ id, label: 'Tenant', type: 'text', value: 'acme' }])
    expect(policy.fields[`custom:${id}`]).toBe(defaultCredentialAgentFieldAccess([{ id, type: 'text' }])[`custom:${id}`])
    expect(policy.fields.password).toBe('onGrantValue')
    expect(policy.fields.username).toBe('discovery')
  })

  it('matches current web GrantPayload fields without widening the approved scope', async () => {
    const selected = ['credential.password', 'credential.url', 'notes']
    expect(await projectCanonicalGrantPayload(extensionSecret, selected))
      .toEqual(await projectGrantPayload(webSecret, selected))
    await expect(projectCanonicalGrantPayload(extensionSecret, ['credential.username'])).rejects.toThrow()
  })

  it('decrypts create and update envelopes across both consumers with independent Entry key revisions', async () => {
    const vk = await randomBytes(32)
    const vdk = await randomBytes(32)
    try {
      const coordinates = { organizationId: '00112233-4455-6677-8899-aabbccddeeff',
        vaultId: '11112222-3333-4444-8555-666677778888', entryId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        revision: '1', vaultKeyVersion: 1, vdkVersion: 1, memberKeyGeneration: 1 }
      const created = await sealCanonicalEntry(coordinates, webSecret, vk, vdk, 1)
      expect(await openSharedMemberSecret(created.entryKey, created.memberSecret, vk, coordinates)).toEqual(webSecret)
      const next = { ...extensionSecret, content: { ...extensionSecret.content, password: 'Replacement password!' } }
      const updatedCoordinates = { ...coordinates, revision: '2', entryKeyRevision: '1', entryKeyVersion: 2 }
      const updated = await sealCanonicalCredentialEntry(updatedCoordinates, next, vk, vdk, 2)
      expect(await openMemberSecret(updated.entryKey, updated.memberSecret, vk, updatedCoordinates)).toEqual(next)
    } finally { wipe(vk); wipe(vdk) }
  })
})
