import { describe, expect, it } from 'vitest'

import { requireCryptoSuite, VAULT_XCHACHA20_POLY1305_V1 } from './crypto-suite'
import { fromBase64Url } from './encoding'
import type { CanonicalEnvelopeAad, EncodedSuitePayload } from './envelope'
import {
  buildScriptExecutionManifest,
  effectiveReturnResultToAgent,
  sealScriptExecutionPackage,
} from './script-execution'
import { loadSodium, wipe } from './sodium'
import { encodeMemberSecret, parseGrantPayload, type MemberSecretV1 } from './vault-plaintext'
import { verifyVaultSignature, type CanonicalJson } from './vault-v2-signatures'
import {
  computeVaultKeyFingerprint,
  openKeyFromX25519Recipient,
  VAULT_KEY_KIND,
  WRAPPER_PURPOSE,
  X25519_SEALED_BOX_V1,
  type X25519WrapperContext,
} from './x25519-wrapper'

const organizationId = '00112233-4455-4677-8899-aabbccddeeff'
const vaultId = '11112222-3333-4444-8555-666677778888'
const scriptEntryId = '22223333-4444-4555-8666-777788889999'
const referencedEntryId = '33334444-5555-4666-8777-888899990000'
const grantId = '44445555-6666-4777-8888-999900001111'
const agentId = '55556666-7777-4888-8999-000011112222'

function scriptSecret(): MemberSecretV1 {
  return {
    schemaVersion: 1,
    memberLabel: 'List users',
    agentLabel: 'List users',
    description: 'Returns active users from SQL',
    entryType: 'script',
    content: {
      source: 'psql "$DATABASE_URL" -c "select email from users where team = $TEAM"',
      interpreter: 'bash',
      refs: [{ env: 'DATABASE_URL', vaultId, entryId: referencedEntryId, fieldId: 'credential.password' }],
      customFields: [],
      execution: {
        contractVersion: 1,
        description: 'Returns active users from SQL',
        parameters: [{ name: 'TEAM', description: 'Team slug', type: 'string', required: true }],
        returnResultToAgent: true,
      },
    },
    agentFieldAccess: {
      memberLabel: 'never', agentLabel: 'discovery', description: 'discovery', icon: 'never', color: 'never',
      entryType: 'discovery', 'script.interpreter': 'discovery', notes: 'never',
    },
  }
}

function referenceSecret(): MemberSecretV1 {
  return {
    schema: 'palladin.member-secret.v1',
    entryType: 'credential',
    memberLabel: 'Database',
    agentLabel: null,
    discoverable: false,
    description: null,
    icon: null,
    color: null,
    content: {
      username: 'fixture_user', password: 'fixture_password', url: null, urlDomain: null,
      totp: null, notes: null, customFields: [],
    },
    agentFieldAccess: {
      memberLabel: 'never', agentLabel: 'never', description: 'never', icon: 'never', color: 'never',
      entryType: 'never', 'credential.username': 'never', 'credential.password': 'onGrantValue',
      'credential.url': 'never', 'credential.urlDomain': 'never', 'credential.totp': 'never', notes: 'never',
    },
  }
}

describe('Script execution package', () => {
  it('seals one package containing the Script contract and every referenced Entry', async () => {
    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    const signer = sodium.crypto_sign_keypair()
    const referencedSecret = encodeMemberSecret(referenceSecret())
    let packageDek: Uint8Array | undefined
    let plaintext: Uint8Array | undefined
    try {
      const manifest = buildScriptExecutionManifest({
        organizationId,
        agentId,
        agentAccessEpoch: 7,
        vaultId,
        scriptEntryId,
        scriptRevision: '12',
        memberSecret: scriptSecret(),
        referenceRevisions: { [referencedEntryId]: '9' },
      })
      const sealed = await sealScriptExecutionPackage({
        manifest,
        grantId,
        packageRevision: '3',
        recipientAgentKeyVersion: 4,
        recipientAgentPublicKey: agent.publicKey,
        vaultSigningKeyVersion: 5,
        vaultSigningPrivateKey: signer.privateKey,
        entries: [{ entryId: referencedEntryId, entryRevision: '9', encodedMemberSecret: referencedSecret }],
      })

      expect(sealed).toMatchObject({
        contractVersion: 1,
        grantId,
        scriptEntryId,
        scriptRevision: '12',
        packageRevision: '3',
        scopes: [
          { entryId: scriptEntryId, entryRevision: '12', isScript: true },
          { entryId: referencedEntryId, entryRevision: '9', isScript: false },
        ],
      })
      const unsignedPackage = { ...sealed } as Record<string, unknown>
      delete unsignedPackage.producerSignature
      expect(await verifyVaultSignature(
        'PLDNV2SIG:SCRIPT-EXECUTION-PACKAGE:',
        JSON.parse(canonicalJson(unsignedPackage)) as CanonicalJson,
        sealed.producerSignature,
        signer.publicKey,
      )).toBe(true)
      const container = JSON.parse(new TextDecoder().decode(fromBase64Url(sealed.encodedPackageCiphertext))) as {
        encodedSealedPackageDek: string
        encodedSuitePayload: string
      }
      const transport = { ...sealed } as Record<string, unknown>
      delete transport.encodedPackageCiphertext
      delete transport.producerSignature
      const aad = new TextEncoder().encode(canonicalJson(transport)) as CanonicalEnvelopeAad
      const parentDescriptorHash = await hashWithDomain('PLDNSCRIPTAAD1', aad)
      const recipientFingerprint = await computeVaultKeyFingerprint(agent.publicKey, VAULT_KEY_KIND.agentX25519)
      const context: X25519WrapperContext = {
        protocolVersion: 2,
        wrapperSuiteId: X25519_SEALED_BOX_V1,
        purpose: WRAPPER_PURPOSE.scriptExecutionDek,
        organizationId,
        vaultId,
        entryId: scriptEntryId,
        grantOrRequestId: grantId,
        agentId,
        resourceRevision: 3n,
        wrappedKeyVersion: 1,
        recipientKeyKind: VAULT_KEY_KIND.agentX25519,
        recipientKeyVersion: 4,
        recipientFingerprint,
        parentDescriptorHash,
      }
      packageDek = await openKeyFromX25519Recipient(
        fromBase64Url(container.encodedSealedPackageDek),
        agent.publicKey,
        agent.privateKey,
        context,
      )
      plaintext = await requireCryptoSuite(VAULT_XCHACHA20_POLY1305_V1).open({
        payload: fromBase64Url(container.encodedSuitePayload) as EncodedSuitePayload,
        key: packageDek,
        aad,
      })
      const payload = JSON.parse(new TextDecoder().decode(plaintext))
      expect(payload.manifest).toMatchObject({
        description: 'Returns active users from SQL',
        returnResultToAgent: true,
        parameters: [{ name: 'TEAM', type: 'string', required: true }],
        scriptSource: expect.stringContaining('select email'),
      })
      expect(payload.entries).toEqual([{
        entryId: referencedEntryId,
        entryRevision: '9',
        encodedGrantPayload: expect.any(String),
      }])
      expect(parseGrantPayload(fromBase64Url(payload.entries[0].encodedGrantPayload))).toMatchObject({
        fields: [{ id: 'credential.password', value: 'fixture_password' }],
      })
      expect(payload.binding.authorization).toEqual({ source: 'scriptExecution', grantId })
      expect(context.purpose).toBe(6)
    } finally {
      wipe(referencedSecret)
      wipe(agent.publicKey)
      wipe(agent.privateKey)
      wipe(signer.publicKey)
      wipe(signer.privateKey)
      if (packageDek) wipe(packageDek)
      if (plaintext) wipe(plaintext)
    }
  })

  it('treats missing legacy result policy as false and rejects incomplete reference material', async () => {
    expect(effectiveReturnResultToAgent(undefined)).toBe(false)
    expect(effectiveReturnResultToAgent({})).toBe(false)
    expect(effectiveReturnResultToAgent({ returnResultToAgent: true })).toBe(true)

    const sodium = await loadSodium()
    const agent = sodium.crypto_box_keypair()
    const signer = sodium.crypto_sign_keypair()
    try {
      const manifest = buildScriptExecutionManifest({
        organizationId, agentId, agentAccessEpoch: 1, vaultId, scriptEntryId, scriptRevision: '1',
        memberSecret: scriptSecret(), referenceRevisions: { [referencedEntryId]: '1' },
      })
      await expect(sealScriptExecutionPackage({
        manifest, grantId, packageRevision: '1', recipientAgentKeyVersion: 1,
        recipientAgentPublicKey: agent.publicKey, vaultSigningKeyVersion: 1,
        vaultSigningPrivateKey: signer.privateKey, entries: [],
      })).rejects.toThrow(/incomplete, stale or substituted/)
    } finally {
      wipe(agent.publicKey)
      wipe(agent.privateKey)
      wipe(signer.publicKey)
      wipe(signer.privateKey)
    }
  })
})

function canonicalJson(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return JSON.stringify(value.normalize('NFC'))
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

async function hashWithDomain(domainValue: string, bytes: Uint8Array): Promise<Uint8Array> {
  const domain = new TextEncoder().encode(domainValue)
  const input = new Uint8Array(domain.length + bytes.length)
  input.set(domain)
  input.set(bytes, domain.length)
  return new Uint8Array(await crypto.subtle.digest('SHA-256', input))
}
