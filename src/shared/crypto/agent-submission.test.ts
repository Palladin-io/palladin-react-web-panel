import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import sodium from 'libsodium-wrappers'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  AgentSubmissionCryptoError,
  SUBMISSION_IDENTITY_FIELDS,
  SUBMISSION_LIMITS,
  SUBMISSION_TRANSPORT_FIELDS,
  buildApproverKeySetChange,
  computeApproverSetDigest,
  mergeSubmissionUpdate,
  newEntrySecretFromSubmission,
  openOwnApproverKeys,
  openSubmissionAsApprover,
  verifyApproverManifest,
  verifyApproverManifestChain,
  wipeApproverKeys,
  type AgentEntrySubmission,
  type AgentSubmissionPayload,
  type ApproverKeyWrap,
  type ApproverRecipient,
  type OrganizationApproverManifest,
  type SubmissionApproverAuthority,
} from './agent-submission'
import { toMemberSecret, defaultAgentVisibilityPolicy } from './entry-draft'
import { encodeMemberSecret, parseMemberSecret } from './vault-plaintext'
import { listGrantableFields } from './grant-protocol'
import { VAULT_KEY_KIND, WRAPPER_PURPOSE, computeVaultKeyFingerprint } from './x25519-wrapper'
import { canonicalizeVaultJson, signVaultObject, type CanonicalJson } from './vault-v2-signatures'
import { concatBytes, decodeBase64Url, encodeBase64Url } from './vault-v2-bytes'

const root = resolve(process.cwd(), 'src/shared/crypto/fixtures/agent-submission-v1')
const fixtureText = readFileSync(resolve(root, 'fixture.json'), 'utf8')
const contractText = readFileSync(resolve(root, 'contract.json'), 'utf8')

interface Fixture {
  deterministicInputs: Record<string, string> & { ephemeralSeeds: Record<string, string> }
  context: {
    organizationId: string
    agentId: string
    memberId: string
    memberKeyVersion: number
    agentEd25519PublicKey: string
    memberX25519PublicKey: string
  }
  approverManifests: [OrganizationApproverManifest, OrganizationApproverManifest]
  approverKeyWraps: ApproverKeyWrap[]
  submissions: [AgentEntrySubmission, AgentEntrySubmission]
  expectedPlaintext: AgentSubmissionPayload
}

const fixture = JSON.parse(fixtureText) as Fixture
const contract = JSON.parse(contractText)
const FOREIGN_ID = '1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a'
const PIN_ID = '5e5e5e5e-5e5e-4e5e-8e5e-5e5e5e5e5e5e'
const SIGNATURE_FIELDS = ['signature', 'continuitySignature', 'agentSignature']

const hex = (value: string) => Uint8Array.from(Buffer.from(value, 'hex'))
const clone = <T>(value: T): T => structuredClone(value)
const omit = (value: object, keys: string[]) =>
  Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)))

function flipLastByte(value: string): string {
  const bytes = decodeBase64Url(value)
  bytes[bytes.length - 1] ^= 1
  return encodeBase64Url(bytes)
}

let keys: {
  agentSign: { publicKey: Uint8Array; privateKey: Uint8Array }
  member: { publicKey: Uint8Array; privateKey: Uint8Array }
  approverV1: { publicKey: Uint8Array; privateKey: Uint8Array }
  approverV2: { publicKey: Uint8Array; privateKey: Uint8Array }
  approverV1Sign: { publicKey: Uint8Array; privateKey: Uint8Array }
  approverV2Sign: { publicKey: Uint8Array; privateKey: Uint8Array }
}

beforeAll(async () => {
  await sodium.ready
  const inputs = fixture.deterministicInputs
  keys = {
    agentSign: sodium.crypto_sign_seed_keypair(hex(inputs.agentEd25519Seed)),
    member: sodium.crypto_box_seed_keypair(hex(inputs.memberX25519Seed)),
    approverV1: sodium.crypto_box_seed_keypair(hex(inputs.approverV1X25519Seed)),
    approverV2: sodium.crypto_box_seed_keypair(hex(inputs.approverV2X25519Seed)),
    approverV1Sign: sodium.crypto_sign_seed_keypair(hex(inputs.approverV1Ed25519Seed)),
    approverV2Sign: sodium.crypto_sign_seed_keypair(hex(inputs.approverV2Ed25519Seed)),
  }
})

async function expectCode(promise: Promise<unknown>, code: string) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error, `expected ${code}`).toBeInstanceOf(AgentSubmissionCryptoError)
  expect((error as AgentSubmissionCryptoError).code).toBe(code)
  expect((error as Error).message).toBe(code)
}

function memberAuthority(overrides: Partial<Parameters<typeof openOwnApproverKeys>[2]> = {}) {
  return {
    organizationId: fixture.context.organizationId,
    memberId: fixture.context.memberId,
    memberKeyVersion: fixture.context.memberKeyVersion,
    memberPrivateKey: keys.member.privateKey,
    ...overrides,
  }
}

async function approverKeysFor(version: 1 | 2): Promise<SubmissionApproverAuthority['approverKeys']> {
  const box = version === 1 ? keys.approverV1 : keys.approverV2
  return {
    keyVersion: version,
    messagePublicKey: box.publicKey,
    messagePrivateKey: box.privateKey,
    messageKeyFingerprint: encodeBase64Url(await computeVaultKeyFingerprint(box.publicKey, VAULT_KEY_KIND.approverX25519)),
  }
}

async function authority(version: 1 | 2 = 1): Promise<SubmissionApproverAuthority> {
  return {
    organizationId: fixture.context.organizationId,
    submissionId: fixture.submissions[0].submissionId,
    agentId: fixture.context.agentId,
    agentEd25519PublicKey: decodeBase64Url(fixture.context.agentEd25519PublicKey),
    approverKeys: await approverKeysFor(version),
  }
}

async function resign(candidate: Record<string, unknown>): Promise<AgentEntrySubmission> {
  const unsigned = omit(candidate, ['agentSignature'])
  return {
    ...(unsigned as unknown as AgentEntrySubmission),
    agentSignature: await signVaultObject('PLDNSUB1SIG:AGENT-SUBMISSION:', unsigned as CanonicalJson, keys.agentSign.privateKey),
  }
}

// Mirrors the reference generator: it serializes Agent input as-is, including non-NFC strings.
function referenceCanonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(referenceCanonical).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${referenceCanonical((value as Record<string, unknown>)[key])}`).join(',')}}`
}

function reencryptPayload(mutate: (payload: AgentSubmissionPayload) => unknown): string {
  const payload = mutate(clone(fixture.expectedPlaintext))
  const nonce = hex(fixture.deterministicInputs.payloadNonce)
  const identity = Object.fromEntries(SUBMISSION_IDENTITY_FIELDS.map((key) => [key, fixture.submissions[0][key]]))
  const encoder = new TextEncoder()
  const aad = concatBytes(encoder.encode('PLDNSUB1AAD'), encoder.encode(canonicalizeVaultJson(identity as CanonicalJson)))
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    new Uint8Array(encoder.encode(referenceCanonical(payload))), aad, null, nonce, hex(fixture.deterministicInputs.submissionDek))
  return encodeBase64Url(concatBytes(nonce, ciphertext))
}

async function signManifest(
  unsigned: Record<string, unknown>,
  signingPrivateKey: Uint8Array,
  previousSigningPrivateKey?: Uint8Array,
): Promise<OrganizationApproverManifest> {
  const base = omit(unsigned, SIGNATURE_FIELDS) as CanonicalJson
  return {
    ...(base as unknown as OrganizationApproverManifest),
    signature: await signVaultObject('PLDNSUB1SIG:APPROVER-MANIFEST:', base, signingPrivateKey),
    ...(previousSigningPrivateKey ? {
      continuitySignature: await signVaultObject('PLDNSUB1SIG:APPROVER-CONTINUITY:', base, previousSigningPrivateKey),
    } : {}),
  }
}

describe('Agent Submission v1 vendored contract', () => {
  it('pins the imported fixture and contract bytes', () => {
    const digest = (text: string) => createHash('sha256').update(text).digest('hex')
    expect(digest(fixtureText)).toBe('4778ca29b0bee27e8d73c71838f9c51d51ecd59962f7f263272370e53dcf4101')
    expect(digest(contractText)).toBe('21a40ebb4366d3559deaeccd4675470e1b07ab384b9ca45d3004c509a97a246a')
  })

  it('matches the frozen field lists, registrations and limits', () => {
    expect([...SUBMISSION_TRANSPORT_FIELDS]).toEqual(contract.submission.transportFields)
    expect([...SUBMISSION_IDENTITY_FIELDS]).toEqual(contract.submission.identityFields)
    expect(contract.registrations.x25519WrapperPurposes.map((purpose: { id: number }) => purpose.id))
      .toEqual([WRAPPER_PURPOSE.submissionDek, WRAPPER_PURPOSE.approverMessagePrivateKey, WRAPPER_PURPOSE.approverSigningSeed])
    expect(contract.registrations.keyKinds.map((kind: { id: number }) => kind.id))
      .toEqual([VAULT_KEY_KIND.approverX25519, VAULT_KEY_KIND.approverEd25519])
    for (const [name, value] of Object.entries(SUBMISSION_LIMITS)) expect(contract.limits[name]).toBe(value)
  })
})

describe('approver manifest chain', () => {
  const org = () => fixture.context.organizationId

  it('pins the rotated manifest and computes the cross-language approver set digest', async () => {
    const pinned = await verifyApproverManifestChain(fixture.approverManifests, org())
    expect(pinned?.keyVersion).toBe(2)
    expect(pinned?.manifestRevision).toBe('2')
    const memberFingerprint = encodeBase64Url(await computeVaultKeyFingerprint(keys.member.publicKey, VAULT_KEY_KIND.memberX25519))
    expect(await computeApproverSetDigest([{
      memberId: fixture.context.memberId,
      memberKeyVersion: fixture.context.memberKeyVersion,
      memberKeyFingerprint: memberFingerprint,
    }])).toBe(fixture.approverManifests[0].approverSetDigest)
  })

  it('rejects rollback, foreign organization, broken signatures, skips and forged rotation', async () => {
    const [v1, v2] = fixture.approverManifests
    await expectCode(verifyApproverManifestChain([v1, v1], org()), 'manifest-rollback')
    await expectCode(verifyApproverManifestChain([{ ...v1, organizationId: FOREIGN_ID }], org()), 'manifest-organization-mismatch')
    await expectCode(verifyApproverManifestChain([{ ...v1, signature: flipLastByte(v1.signature) }], org()), 'manifest-signature-invalid')
    await expectCode(verifyApproverManifestChain([v1, { ...v2, continuitySignature: flipLastByte(v2.continuitySignature!) }], org()),
      'manifest-continuity-invalid')
    const skipped = await signManifest({ ...v2, keyVersion: 3 }, keys.approverV2Sign.privateKey, keys.approverV1Sign.privateKey)
    await expectCode(verifyApproverManifestChain([v1, skipped], org()), 'manifest-key-version-skip')
    const attacker = sodium.crypto_sign_seed_keypair(hex('99'.repeat(32)))
    const forged = await signManifest({
      ...v2,
      signingPublicKey: encodeBase64Url(attacker.publicKey),
      signingKeyFingerprint: encodeBase64Url(await computeVaultKeyFingerprint(attacker.publicKey, VAULT_KEY_KIND.approverEd25519)),
    }, attacker.privateKey, attacker.privateKey)
    await expectCode(verifyApproverManifestChain([v1, forged], org()), 'manifest-continuity-invalid')
    await expectCode(verifyApproverManifestChain([omit(v2, ['continuitySignature']) as unknown as OrganizationApproverManifest], org()),
      'manifest-continuity-invalid')
  })

  it('rejects manifests that violate the wire encoding before pinning them', async () => {
    const [v1] = fixture.approverManifests
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['unknown manifest schema', { schema: 'palladin.organization-approver-manifest.v2' }, 'unsupported-version'],
      ['unknown manifest protocol version', { protocolVersion: 3 }, 'unsupported-version'],
      ['additional manifest field', { note: 'x' }, 'unknown-field'],
      ['missing approver set digest', { approverSetDigest: undefined }, 'missing-field'],
      ['missing issuedAt', { issuedAt: undefined }, 'missing-field'],
      ['malformed issuedAt', { issuedAt: '2026-10-29 08:00:00' }, 'invalid-field'],
      ['noncanonical manifest revision', { manifestRevision: '01' }, 'invalid-field'],
      ['zero key version', { keyVersion: 0 }, 'invalid-field'],
      ['uppercase organization', { organizationId: v1.organizationId.toUpperCase() }, 'invalid-field'],
      ['short approver set digest', { approverSetDigest: v1.signingKeyFingerprint.slice(0, 20) }, 'invalid-field'],
    ]
    for (const [name, change, code] of cases) {
      const candidate = Object.fromEntries(Object.entries({ ...v1, ...change }).filter(([, value]) => value !== undefined))
      const error = await verifyApproverManifestChain([await signManifest(candidate, keys.approverV1Sign.privateKey)], org())
        .then(() => null, (caught: unknown) => caught)
      expect((error as AgentSubmissionCryptoError | null)?.code, name).toBe(code)
    }
    await expectCode(openOwnApproverKeys({ ...v1, issuedAt: 'yesterday' }, fixture.approverKeyWraps, memberAuthority()), 'invalid-field')
  })

  it('applies continuity only to rotation and requires explicit re-trust for re-bootstrap', async () => {
    const [v1, v2] = fixture.approverManifests
    const reBootstrap = await signManifest(omit(v2, ['previousSigningKeyFingerprint']), keys.approverV2Sign.privateKey)
    await expectCode(verifyApproverManifestChain([v1, reBootstrap], org()), 'manifest-reintroduction-required')
    expect((await verifyApproverManifestChain([reBootstrap], org()))?.keyVersion).toBe(2)
    const addedApprover = await signManifest({ ...v1, manifestRevision: '2', approverSetRevision: '2' }, keys.approverV1Sign.privateKey)
    expect((await verifyApproverManifestChain([v1, addedApprover], org()))?.manifestRevision).toBe('2')
    const sameVersionWithContinuity = await signManifest(
      { ...addedApprover, previousSigningKeyFingerprint: v1.signingKeyFingerprint },
      keys.approverV1Sign.privateKey, keys.approverV1Sign.privateKey)
    await expectCode(verifyApproverManifestChain([v1, sameVersionWithContinuity], org()), 'manifest-continuity-invalid')
  })
})

describe('opening own approver wraps as a Member', () => {
  it('opens the fixture wraps and binds them to the self-signed manifest', async () => {
    const opened = await openOwnApproverKeys(fixture.approverManifests[0], fixture.approverKeyWraps, memberAuthority())
    expect(opened.keyVersion).toBe(1)
    expect([...opened.messagePrivateKey]).toEqual([...keys.approverV1.privateKey])
    expect([...opened.signingSeed]).toEqual([...hex(fixture.deterministicInputs.approverV1Ed25519Seed)])
    expect(opened.messageKeyFingerprint).toBe(fixture.approverManifests[0].messageKeyFingerprint)
    wipeApproverKeys(opened)
    expect(opened.messagePrivateKey.every((byte) => byte === 0)).toBe(true)
    expect(opened.signingSeed.every((byte) => byte === 0)).toBe(true)
  })

  it('rejects wraps addressed to another principal, key version or organization', async () => {
    const [v1, v2] = fixture.approverManifests
    const wraps = fixture.approverKeyWraps
    await expectCode(openOwnApproverKeys(v1, wraps, memberAuthority({ memberId: '1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c' })), 'approver-not-recipient')
    await expectCode(openOwnApproverKeys(v1, wraps, memberAuthority({ memberKeyVersion: 3 })), 'approver-not-recipient')
    await expectCode(openOwnApproverKeys(v1, wraps, memberAuthority({ organizationId: FOREIGN_ID })), 'manifest-organization-mismatch')
    await expectCode(openOwnApproverKeys(v2, wraps, memberAuthority()), 'approver-not-recipient')
    await expectCode(openOwnApproverKeys(v1, wraps.slice(0, 1), memberAuthority()), 'approver-not-recipient')
    await expectCode(openOwnApproverKeys(v1, [wraps[0], wraps[0]], memberAuthority()), 'approver-not-recipient')
    const foreignMember = sodium.crypto_box_keypair()
    await expectCode(openOwnApproverKeys(v1, wraps, memberAuthority({ memberPrivateKey: foreignMember.privateKey })), 'approver-not-recipient')
  })

  it('rejects a corrupted package, a substituted descriptor and a manifest the wraps do not reproduce', async () => {
    const [v1] = fixture.approverManifests
    const corrupted = clone(fixture.approverKeyWraps)
    corrupted[0].encodedSealedKeyPackage = flipLastByte(corrupted[0].encodedSealedKeyPackage)
    await expectCode(openOwnApproverKeys(v1, corrupted, memberAuthority()), 'approver-wrap-invalid')
    const swappedPurpose = clone(fixture.approverKeyWraps)
    ;[swappedPurpose[0].descriptor.purpose, swappedPurpose[1].descriptor.purpose] = [swappedPurpose[1].descriptor.purpose, swappedPurpose[0].descriptor.purpose]
    await expectCode(openOwnApproverKeys(v1, swappedPurpose, memberAuthority()), 'approver-wrap-invalid')
    const substitute = sodium.crypto_box_keypair()
    const substituted = await signManifest({
      ...v1,
      messagePublicKey: encodeBase64Url(substitute.publicKey),
      messageKeyFingerprint: encodeBase64Url(await computeVaultKeyFingerprint(substitute.publicKey, VAULT_KEY_KIND.approverX25519)),
    }, keys.approverV1Sign.privateKey)
    await expectCode(openOwnApproverKeys(substituted, fixture.approverKeyWraps, memberAuthority()), 'manifest-fingerprint-mismatch')
  })
})

describe('opening submissions as the approver group', () => {
  it('opens the original and the re-wrapped submission with their key versions', async () => {
    expect(await openSubmissionAsApprover(fixture.submissions[0], await authority(1))).toEqual(fixture.expectedPlaintext)
    expect(await openSubmissionAsApprover(fixture.submissions[1], await authority(2))).toEqual(fixture.expectedPlaintext)
    await expectCode(openSubmissionAsApprover(fixture.submissions[1], await authority(1)), 'recipient-key-mismatch')
  })

  it('fails closed for every contract negative case', async () => {
    const submission = fixture.submissions[0]
    const payloadCase = (name: string, mutate: (payload: AgentSubmissionPayload) => unknown, code: string): Array<[string, () => Promise<unknown>, string]> =>
      [[name, () => resign({ ...submission, encodedPayload: reencryptPayload(mutate) }), code]]
    const cases: Array<[string, () => Promise<unknown>, string]> = [
      ['backend substitutes organization', async () => ({ ...submission, organizationId: FOREIGN_ID }), 'invalid-agent-signature'],
      ['agent substitutes organization', () => resign({ ...submission, organizationId: FOREIGN_ID }), 'context-mismatch'],
      ['agent replays under another submission id', () => resign({ ...submission, submissionId: '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d' }), 'context-mismatch'],
      ['retarget update to another entry', () => resign({ ...submission, target: { ...submission.target, entryId: '1f1f1f1f-1f1f-4f1f-8f1f-1f1f1f1f1f1f' } }), 'wrapper-context-mismatch'],
      ['rewrite expected revision', () => resign({ ...submission, target: { ...submission.target, expectedEntryRevision: '8' } }), 'wrapper-context-mismatch'],
      ['flip update to new', () => resign({ ...submission, submissionKind: 1, target: { kind: 'new' } }), 'wrapper-context-mismatch'],
      ['change entry type', () => resign({ ...submission, entryType: 0 }), 'wrapper-context-mismatch'],
      ['script entry type', () => resign({ ...submission, entryType: 2 }), 'unsupported-entry-type'],
      ['unknown transport field', () => resign({ ...submission, note: 'x' }), 'unknown-field'],
      ['unknown target field', () => resign({ ...submission, target: { ...submission.target, label: 'x' } }), 'unknown-field'],
      ['missing transport field', async () => omit(submission, ['agentAccessEpoch']), 'missing-field'],
      ['stale approver key version', () => resign({ ...submission, approverKeyVersion: 2 }), 'recipient-key-mismatch'],
      ['unknown transport schema', () => resign({ ...submission, schema: 'palladin.agent-entry-submission.v2' }), 'unsupported-version'],
      ['unknown contract version', () => resign({ ...submission, contractVersion: 2 }), 'unsupported-version'],
      ['noncanonical submission revision', () => resign({ ...submission, submissionRevision: '01' }), 'invalid-field'],
      ['zero access epoch', () => resign({ ...submission, agentAccessEpoch: '0' }), 'invalid-field'],
      ['noncanonical expected revision', () => resign({ ...submission, target: { ...submission.target, expectedEntryRevision: '+7' } }), 'invalid-field'],
      ['u64 overflow', () => resign({ ...submission, approverManifestRevision: '18446744073709551616' }), 'invalid-field'],
      ['uppercase submission id', () => resign({ ...submission, submissionId: submission.submissionId.toUpperCase() }), 'invalid-field'],
      ['string key version', () => resign({ ...submission, agentKeyVersion: '3' }), 'invalid-field'],
      ['zero approver key version', () => resign({ ...submission, approverKeyVersion: 0 }), 'invalid-field'],
      ['padded base64 fingerprint', () => resign({ ...submission, agentKeyFingerprint: `${submission.agentKeyFingerprint}=` }), 'invalid-field'],
      ['truncated wrapped DEK', () => resign({ ...submission, encodedApproverWrappedDek: submission.encodedApproverWrappedDek.slice(0, -4) }), 'invalid-field'],
      ['short agent signature', () => resign({ ...submission, encodedPayload: submission.encodedPayload }).then((signed) => ({ ...signed, agentSignature: signed.agentSignature.slice(0, -4) })), 'invalid-field'],
      ['target is not an object', () => resign({ ...submission, target: 'update' }), 'invalid-field'],
      ['submission is not an object', async () => [submission], 'invalid-field'],
      ['revision replay inside wrapper', () => resign({ ...submission, submissionRevision: '2' }), 'wrapper-context-mismatch'],
      ['approver wrap corruption', () => resign({ ...submission, encodedApproverWrappedDek: flipLastByte(submission.encodedApproverWrappedDek) }), 'wrapper-open-failed'],
      ['approver wrap swapped with agent wrap', () => resign({ ...submission, encodedApproverWrappedDek: submission.encodedAgentWrappedDek }), 'wrapper-open-failed'],
      ['payload ciphertext corruption', () => resign({ ...submission, encodedPayload: flipLastByte(submission.encodedPayload) }), 'payload-auth-failed'],
      ['signature corruption', async () => ({ ...submission, agentSignature: flipLastByte(submission.agentSignature) }), 'invalid-agent-signature'],
      ['inner identity differs from outer identity', () => resign({ ...submission, encodedPayload: reencryptPayload((payload) => ({ ...payload, identity: { ...payload.identity, agentId: '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b' } })) }), 'identity-mismatch'],
      ['TOTP is excluded from v1 payloads', () => resign({ ...submission, encodedPayload: reencryptPayload((payload) => ({ ...payload, content: { ...payload.content, totp: 'JBSWY3DPEHPK3PXP' } })) }), 'unknown-field'],
      ['credential update requires the new password', () => resign({ ...submission, encodedPayload: reencryptPayload((payload) => ({ ...payload, content: { username: payload.content.username } })) }), 'missing-field'],
      ['payload carries an unknown top-level field', () => resign({ ...submission, encodedPayload: reencryptPayload((payload) => ({ ...payload, agentVisibilityPolicy: {} })) }), 'unknown-field'],
      ...payloadCase('unknown payload schema', (payload) => ({ ...payload, schema: 'palladin.agent-submission-payload.v2' }), 'invalid-field'),
      ...payloadCase('numeric url', (payload) => ({ ...payload, content: { ...payload.content, url: 42 } }), 'invalid-field'),
      ...payloadCase('http url', (payload) => ({ ...payload, content: { ...payload.content, url: 'http://example.invalid/login' } }), 'invalid-field'),
      ...payloadCase('relative url', (payload) => ({ ...payload, content: { ...payload.content, url: '/login' } }), 'invalid-field'),
      ...payloadCase('numeric label', (payload) => ({ ...payload, label: 7 }), 'invalid-field'),
      ...payloadCase('non-NFC label', (payload) => ({ ...payload, label: 'Cafe\u0301' }), 'invalid-field'),
      ...payloadCase('label over 256 bytes', (payload) => ({ ...payload, label: 'l'.repeat(257) }), 'field-too-large'),
      ...payloadCase('password over 4096 bytes', (payload) => ({ ...payload, content: { ...payload.content, password: 'p'.repeat(4097) } }), 'field-too-large'),
      ...payloadCase('empty optional username', (payload) => ({ ...payload, content: { ...payload.content, username: '' } }), 'invalid-field'),
      ...payloadCase('empty new password', (payload) => ({ ...payload, content: { ...payload.content, password: '' } }), 'invalid-field'),
      ...payloadCase('notes over 8192 bytes', (payload) => ({ ...payload, content: { ...payload.content, notes: 'n'.repeat(8193) } }), 'field-too-large'),
      ...payloadCase('plaintext over 32768 bytes', (payload) => ({ ...payload, content: { ...payload.content, notes: 'n'.repeat(8192) }, padding: 'x'.repeat(32768) }), 'field-too-large'),
      ...payloadCase('content is not an object', (payload) => ({ ...payload, content: 'x' }), 'invalid-field'),
    ]
    const approver = await authority(1)
    for (const [name, build, code] of cases) {
      const error = await openSubmissionAsApprover(await build(), approver).then(() => null, (caught: unknown) => caught)
      expect((error as AgentSubmissionCryptoError | null)?.code, name).toBe(code)
    }
  })

  it('binds the opened submission to the requested submission id', async () => {
    const replayed = await resign({ ...fixture.submissions[0], submissionId: '1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d' })
    await expectCode(openSubmissionAsApprover(fixture.submissions[0], { ...await authority(1), submissionId: replayed.submissionId }), 'context-mismatch')
    // Requested and signed ids agree, so the wrapper context still catches the replay (reference code).
    await expectCode(openSubmissionAsApprover(replayed, { ...await authority(1), submissionId: replayed.submissionId }), 'wrapper-context-mismatch')
  })

  it('rejects a submission signed by a different Agent key', async () => {
    const other = sodium.crypto_sign_keypair()
    await expectCode(openSubmissionAsApprover(fixture.submissions[0], { ...await authority(1), agentEd25519PublicKey: other.publicKey }),
      'invalid-agent-signature')
    await expectCode(openSubmissionAsApprover(fixture.submissions[0], { ...await authority(1), agentId: '1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b' }),
      'context-mismatch')
  })

  it('never puts payload plaintext into error messages', async () => {
    const leaking = await resign({
      ...fixture.submissions[0],
      encodedPayload: reencryptPayload((payload) => ({ ...payload, content: { ...payload.content, extra: payload.content.password } })),
    })
    const error = await openSubmissionAsApprover(leaking, await authority(1)).catch((caught: Error) => caught)
    expect(String((error as Error).message)).not.toContain(fixture.expectedPlaintext.content.password!)
    expect(JSON.stringify(error)).not.toContain(fixture.expectedPlaintext.content.password!)
  })
})

describe('approver key-set lifecycle material', () => {
  const org = () => fixture.context.organizationId

  async function recipient(memberId: string, publicKey: Uint8Array, hasWrap = false, memberKeyVersion = 1): Promise<ApproverRecipient> {
    return {
      memberId,
      memberKeyVersion,
      memberKeyFingerprint: encodeBase64Url(await computeVaultKeyFingerprint(publicKey, VAULT_KEY_KIND.memberX25519)),
      memberPublicKey: encodeBase64Url(publicKey),
      hasWrap,
    }
  }

  async function bootstrap() {
    const other = sodium.crypto_box_keypair()
    const otherId = '2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c'
    const approvers = [
      await recipient(fixture.context.memberId, keys.member.publicKey, false, fixture.context.memberKeyVersion),
      await recipient(otherId, other.publicKey),
    ]
    const change = await buildApproverKeySetChange({
      kind: 'bootstrap', organizationId: org(), memberId: fixture.context.memberId,
      memberPrivateKey: keys.member.privateKey,
      challenge: { issuedAt: '2026-10-29T08:00:00Z', approverSetRevision: '1', approvers },
    })
    return { change, approvers, other, otherId }
  }

  function ownWraps(wraps: ApproverKeyWrap[], memberId = fixture.context.memberId) {
    return wraps.filter((wrap) => wrap.descriptor.memberId === memberId)
  }

  it('bootstraps key version 1 that every approver can open', async () => {
    const { change, approvers, other, otherId } = await bootstrap()
    expect(change.manifest).toMatchObject({ keyVersion: 1, manifestRevision: '1', approverSetRevision: '1', issuedAt: '2026-10-29T08:00:00Z' })
    expect(change.manifest.continuitySignature).toBeUndefined()
    expect(change.manifest.approverSetDigest).toBe(await computeApproverSetDigest(approvers))
    expect(change.wraps).toHaveLength(4)
    await verifyApproverManifest(change.manifest, org())
    const mine = await openOwnApproverKeys(change.manifest, ownWraps(change.wraps), memberAuthority())
    const theirs = await openOwnApproverKeys(change.manifest, ownWraps(change.wraps, otherId), {
      organizationId: org(), memberId: otherId, memberKeyVersion: 1, memberPrivateKey: other.privateKey,
    })
    expect([...mine.messagePrivateKey]).toEqual([...theirs.messagePrivateKey])
  })

  it('adds approvers with the unchanged key version and signs the next revision without continuity', async () => {
    const { change, approvers } = await bootstrap()
    const opened = await openOwnApproverKeys(change.manifest, ownWraps(change.wraps), memberAuthority())
    const newcomer = sodium.crypto_box_keypair()
    const newcomerId = '3c3c3c3c-3c3c-4c3c-8c3c-3c3c3c3c3c3c'
    const added = await buildApproverKeySetChange({
      kind: 'addApprovers', organizationId: org(), memberId: fixture.context.memberId,
      memberPrivateKey: keys.member.privateKey, currentManifest: change.manifest, currentKeys: opened,
      challenge: {
        issuedAt: '2026-10-29T09:00:00Z', approverSetRevision: '2',
        approvers: [...approvers.map((approver) => ({ ...approver, hasWrap: true })), await recipient(newcomerId, newcomer.publicKey)],
      },
    })
    expect(added.manifest).toMatchObject({ keyVersion: 1, manifestRevision: '2', messagePublicKey: change.manifest.messagePublicKey })
    expect(added.manifest.continuitySignature).toBeUndefined()
    expect(added.manifest.previousSigningKeyFingerprint).toBeUndefined()
    expect(added.wraps.map((wrap) => wrap.descriptor.memberId)).toEqual([newcomerId, newcomerId])
    expect((await verifyApproverManifestChain([change.manifest, added.manifest], org()))?.manifestRevision).toBe('2')
    const theirs = await openOwnApproverKeys(added.manifest, added.wraps, {
      organizationId: org(), memberId: newcomerId, memberKeyVersion: 1, memberPrivateKey: newcomer.privateKey,
    })
    expect([...theirs.messagePrivateKey]).toEqual([...opened.messagePrivateKey])
  })

  it('rotates to new keys with a continuity signature the Agent chain accepts', async () => {
    const { change, approvers } = await bootstrap()
    const opened = await openOwnApproverKeys(change.manifest, ownWraps(change.wraps), memberAuthority())
    const rotated = await buildApproverKeySetChange({
      kind: 'rotate', organizationId: org(), memberId: fixture.context.memberId,
      memberPrivateKey: keys.member.privateKey, currentManifest: change.manifest, currentKeys: opened,
      challenge: { issuedAt: '2026-10-30T08:00:00Z', approverSetRevision: '2', approvers: approvers.slice(0, 1) },
    })
    expect(rotated.manifest).toMatchObject({ keyVersion: 2, manifestRevision: '2', previousSigningKeyFingerprint: change.manifest.signingKeyFingerprint })
    expect(rotated.wraps).toHaveLength(2)
    expect((await verifyApproverManifestChain([change.manifest, rotated.manifest], org()))?.keyVersion).toBe(2)
    const next = await openOwnApproverKeys(rotated.manifest, rotated.wraps, memberAuthority())
    expect([...next.messagePrivateKey]).not.toEqual([...opened.messagePrivateKey])
  })

  it('re-bootstraps without continuity so Agents must re-trust explicitly', async () => {
    const { change, approvers } = await bootstrap()
    const rebuilt = await buildApproverKeySetChange({
      kind: 'rebootstrap', organizationId: org(), memberId: fixture.context.memberId,
      memberPrivateKey: keys.member.privateKey, currentManifest: change.manifest,
      challenge: { issuedAt: '2026-10-31T08:00:00Z', approverSetRevision: '2', approvers },
    })
    expect(rebuilt.manifest).toMatchObject({ keyVersion: 2, manifestRevision: '2' })
    expect(rebuilt.manifest.continuitySignature).toBeUndefined()
    expect(rebuilt.manifest.previousSigningKeyFingerprint).toBeUndefined()
    await expectCode(verifyApproverManifestChain([change.manifest, rebuilt.manifest], org()), 'manifest-reintroduction-required')
    expect((await verifyApproverManifestChain([rebuilt.manifest], org()))?.keyVersion).toBe(2)
  })

  it('refuses a change that would exclude the caller or seal to a key that does not match its fingerprint', async () => {
    const other = sodium.crypto_box_keypair()
    const outsider = await recipient('2c2c2c2c-2c2c-4c2c-8c2c-2c2c2c2c2c2c', other.publicKey)
    await expectCode(buildApproverKeySetChange({
      kind: 'bootstrap', organizationId: org(), memberId: fixture.context.memberId, memberPrivateKey: keys.member.privateKey,
      challenge: { issuedAt: '2026-10-29T08:00:00Z', approverSetRevision: '1', approvers: [outsider] },
    }), 'approver-not-recipient')
    const self = await recipient(fixture.context.memberId, keys.member.publicKey, false, fixture.context.memberKeyVersion)
    const substituted = { ...outsider, memberPublicKey: encodeBase64Url(sodium.crypto_box_keypair().publicKey) }
    await expect(buildApproverKeySetChange({
      kind: 'bootstrap', organizationId: org(), memberId: fixture.context.memberId, memberPrivateKey: keys.member.privateKey,
      challenge: { issuedAt: '2026-10-29T08:00:00Z', approverSetRevision: '1', approvers: [self, substituted] },
    })).rejects.toThrow()
  })
})

describe('approval plaintext builders', () => {
  const credentialSecret = () => toMemberSecret({
    label: 'Example', agentLabel: 'Example agent', type: 1,
    payload: {
      type: 1, username: 'old-user', password: 'old-password', url: 'https://old.example.invalid/login',
      totp: 'otpauth://totp/alice?secret=JBSWY3DPEHPK3PXP', notes: 'keep notes',
      fields: [{ id: PIN_ID, label: 'PIN', type: 'concealed', value: '1234' }],
    },
    policy: { ...defaultAgentVisibilityPolicy(1, [{ id: PIN_ID, label: 'PIN', type: 'concealed', value: '1234' }]),
      fields: { ...defaultAgentVisibilityPolicy(1).fields, password: 'never', [`custom:${PIN_ID}`]: 'never' } },
  })

  function updatePayload(content: AgentSubmissionPayload['content'], entryType = 1, label?: string): AgentSubmissionPayload {
    return {
      schema: 'palladin.agent-submission-payload.v1',
      identity: { ...fixture.expectedPlaintext.identity, entryType },
      ...(label ? { label } : {}),
      content,
    }
  }

  it('merges only present credential fields and preserves custom fields, TOTP and policy', () => {
    const current = credentialSecret()
    const next = mergeSubmissionUpdate(current, updatePayload({ password: 'new-password', url: 'https://new.example.invalid/x' }))
    if (next.entryType !== 'credential' || current.entryType !== 'credential') throw new Error('type')
    expect(next.content).toEqual({
      ...current.content, password: 'new-password', url: 'https://new.example.invalid/x', urlDomain: 'new.example.invalid',
    })
    expect(next.content.customFields).toEqual(current.content.customFields)
    expect(next.content.totp).toEqual(current.content.totp)
    expect(next.agentFieldAccess).toEqual(current.agentFieldAccess)
    expect(next.memberLabel).toBe('Example')
    expect(next.agentLabel).toBe('Example agent')
    expect(parseMemberSecret(encodeMemberSecret(next))).toEqual(next)
  })

  it('applies an approver-edited label and the proposed username', () => {
    const current = credentialSecret()
    const next = mergeSubmissionUpdate(current, updatePayload({ password: 'p', username: 'new-user' }, 1, 'Agent rename'), '  Reviewed name ')
    if (next.entryType !== 'credential') throw new Error('type')
    expect(next.memberLabel).toBe('Reviewed name')
    expect(next.content.username).toBe('new-user')
    expect(next.content.notes).toBe('keep notes')
  })

  it('merges Key values and never grants Agent access to a newly present URL', () => {
    const current = toMemberSecret({
      label: 'API', agentLabel: 'API', type: 0,
      payload: { type: 0, value: 'old', fields: [] }, policy: defaultAgentVisibilityPolicy(0),
    })
    const next = mergeSubmissionUpdate(current, updatePayload({ value: 'new', url: 'https://api.example.invalid' }, 0))
    if (next.entryType !== 'key' || current.entryType !== 'key') throw new Error('type')
    expect(next.content).toEqual({ ...current.content, value: 'new', url: 'https://api.example.invalid' })
    // The current schema requires a key.url policy entry once a URL exists; it must grant nothing.
    expect(next.agentFieldAccess).toEqual({ ...current.agentFieldAccess, 'key.url': 'never' })
    expect(listGrantableFields(next).map((field) => field.id)).toEqual(listGrantableFields(current).map((field) => field.id))
    expect(listGrantableFields(next).map((field) => field.id)).not.toContain('key.url')
    expect(parseMemberSecret(encodeMemberSecret(next))).toEqual(next)
  })

  it('keeps an existing Key URL policy unchanged when the URL is updated', () => {
    const current = toMemberSecret({
      label: 'API', agentLabel: 'API', type: 0,
      payload: { type: 0, value: 'old', url: 'https://old.example.invalid', fields: [] },
      policy: { ...defaultAgentVisibilityPolicy(0), fields: { ...defaultAgentVisibilityPolicy(0).fields, url: 'never' } },
    })
    const next = mergeSubmissionUpdate(current, updatePayload({ value: 'new', url: 'https://new.example.invalid' }, 0))
    expect(next.agentFieldAccess).toEqual(current.agentFieldAccess)
  })

  it('stores secrets byte-for-byte and refuses a non-NFC secret instead of normalizing it', () => {
    const composed = 'Caf\u00e9'
    const decomposed = 'Cafe\u0301'
    const created = newEntrySecretFromSubmission({
      schema: 'palladin.agent-submission-payload.v1',
      identity: { ...fixture.expectedPlaintext.identity, submissionKind: 1, target: { kind: 'new' } },
      label: 'L', content: { username: composed, password: composed },
    }, 'L')
    if (created.entryType !== 'credential') throw new Error('type')
    expect(created.content.password).toBe(composed)
    const merged = mergeSubmissionUpdate(credentialSecret(), updatePayload({ password: composed }))
    if (merged.entryType !== 'credential') throw new Error('type')
    expect(merged.content.password).toBe(composed)
    expect(() => newEntrySecretFromSubmission({
      schema: 'palladin.agent-submission-payload.v1',
      identity: { ...fixture.expectedPlaintext.identity, submissionKind: 1, target: { kind: 'new' } },
      label: 'L', content: { username: 'u', password: decomposed },
    }, 'L')).toThrow(expect.objectContaining({ code: 'secret-not-nfc' }))
    for (const content of [{ password: decomposed }, { password: 'p', username: decomposed }, { password: 'p', notes: decomposed }]) {
      expect(() => mergeSubmissionUpdate(credentialSecret(), updatePayload(content)))
        .toThrow(expect.objectContaining({ code: 'secret-not-nfc' }))
    }
    expect(() => mergeSubmissionUpdate(toMemberSecret({
      label: 'K', agentLabel: 'K', type: 0, payload: { type: 0, value: 'v', fields: [] }, policy: defaultAgentVisibilityPolicy(0),
    }), updatePayload({ value: decomposed }, 0))).toThrow(expect.objectContaining({ code: 'secret-not-nfc' }))
  })

  it('refuses to apply an update to an Entry of another type', () => {
    expect(() => mergeSubmissionUpdate(credentialSecret(), updatePayload({ value: 'x' }, 0)))
      .toThrow(expect.objectContaining({ code: 'entry-type-mismatch' }))
  })

  it('builds a complete new Credential with the canonical default policy', () => {
    const payload: AgentSubmissionPayload = {
      schema: 'palladin.agent-submission-payload.v1',
      identity: { ...fixture.expectedPlaintext.identity, submissionKind: 1, target: { kind: 'new' } },
      label: 'Agent label',
      content: { username: 'u', password: 'p', url: 'https://site.example.invalid/login' },
    }
    const secret = newEntrySecretFromSubmission(payload, ' Approved label ')
    expect(secret).toMatchObject({ entryType: 'credential', memberLabel: 'Approved label', agentLabel: 'Approved label', discoverable: true })
    if (secret.entryType !== 'credential') throw new Error('type')
    expect(secret.content).toMatchObject({ username: 'u', password: 'p', urlDomain: 'site.example.invalid', totp: null, customFields: [] })
    expect(secret.agentFieldAccess).toEqual(toMemberSecret({
      label: 'x', agentLabel: 'x', type: 1, payload: { type: 1, username: 'u', password: 'p', url: 'https://site.example.invalid/login', fields: [] },
      policy: defaultAgentVisibilityPolicy(1),
    }).agentFieldAccess)
    expect(() => newEntrySecretFromSubmission(payload, '   ')).toThrow(expect.objectContaining({ code: 'missing-field' }))
  })
})

