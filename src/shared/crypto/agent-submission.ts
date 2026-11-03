import { sha256Digest } from '@palladin/crypto'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types/entry-type'
import { defaultAgentVisibilityPolicy, toMemberSecret } from './entry-draft'
import { loadSodium, wipe } from './sodium'
import type { MemberSecretV1 } from './vault-plaintext'
import { concatBytes, decodeBase64Url, decodeUuid, encodeBase64Url, encodeU32, encodeUtf8 } from './vault-v2-bytes'
import { canonicalizeVaultJson, signVaultObject, verifyVaultSignature, type CanonicalJson } from './vault-v2-signatures'
import {
  VAULT_KEY_KIND,
  WRAPPER_PURPOSE,
  X25519_SEALED_BOX_V1,
  computeContextHash,
  computeVaultKeyFingerprint,
  openKeyFromX25519Recipient,
  sealKeyToX25519Recipient,
  type X25519WrapperContext,
} from './x25519-wrapper'

// Frozen by palladin-protocol contracts/agent-submission/v1.
export const SUBMISSION_CONTRACT_VERSION = 1
const PROTOCOL_VERSION = 2
export const SUBMISSION_SCHEMA = 'palladin.agent-entry-submission.v1'
export const SUBMISSION_PAYLOAD_SCHEMA = 'palladin.agent-submission-payload.v1'
export const APPROVER_MANIFEST_SCHEMA = 'palladin.organization-approver-manifest.v1'
const MANIFEST_SIGNATURE_DOMAIN = 'PLDNSUB1SIG:APPROVER-MANIFEST:'
const CONTINUITY_SIGNATURE_DOMAIN = 'PLDNSUB1SIG:APPROVER-CONTINUITY:'
const SUBMISSION_SIGNATURE_DOMAIN = 'PLDNSUB1SIG:AGENT-SUBMISSION:'
const SIGNATURE_FIELDS = ['signature', 'continuitySignature', 'agentSignature']
const APPROVER_WRAP_SCOPE_BITMAP = 33
const PACKAGE_MAGIC = new TextEncoder().encode('PLDNX2K1')

export const SUBMISSION_KIND = { new: 1, update: 2 } as const
export const SUBMISSION_ENTRY_TYPE = { key: 0, credential: 1 } as const

export const SUBMISSION_TRANSPORT_FIELDS = [
  'schema', 'contractVersion', 'protocolVersion', 'organizationId', 'submissionId', 'agentId',
  'submissionKind', 'entryType', 'target', 'submissionRevision', 'agentAccessEpoch', 'agentKeyVersion',
  'agentKeyFingerprint', 'approverKeyVersion', 'approverMessageKeyFingerprint', 'approverManifestRevision',
  'encodedPayload', 'encodedAgentWrappedDek', 'encodedApproverWrappedDek', 'agentSignature',
] as const
export const SUBMISSION_IDENTITY_FIELDS = [
  'contractVersion', 'protocolVersion', 'organizationId', 'submissionId', 'agentId', 'submissionKind',
  'entryType', 'target',
] as const
const TARGET_FIELDS = {
  new: { required: ['kind'], optional: ['suggestedVaultId'] },
  update: { required: ['kind', 'vaultId', 'entryId', 'expectedEntryRevision'], optional: [] },
} as const
const CONTENT_FIELDS = {
  new: {
    key: { required: ['value'], optional: ['url', 'notes'] },
    credential: { required: ['username', 'password'], optional: ['url', 'notes'] },
  },
  update: {
    key: { required: ['value'], optional: ['url', 'notes'] },
    credential: { required: ['password'], optional: ['username', 'url', 'notes'] },
  },
} as const
export const SUBMISSION_LIMITS = {
  labelUtf8Bytes: 256,
  usernameUtf8Bytes: 1024,
  passwordUtf8Bytes: 4096,
  keyValueUtf8Bytes: 16384,
  urlUtf8Bytes: 2048,
  notesUtf8Bytes: 8192,
  payloadPlaintextBytes: 32768,
} as const
const CONTENT_LIMIT: Record<string, number> = {
  username: SUBMISSION_LIMITS.usernameUtf8Bytes,
  password: SUBMISSION_LIMITS.passwordUtf8Bytes,
  value: SUBMISSION_LIMITS.keyValueUtf8Bytes,
  url: SUBMISSION_LIMITS.urlUtf8Bytes,
  notes: SUBMISSION_LIMITS.notesUtf8Bytes,
}
const AEAD_NONCE_BYTES = 24
const AEAD_TAG_BYTES = 16
const LOWERCASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const CANONICAL_U64 = /^(0|[1-9][0-9]{0,19})$/
const U64_MAX = 0xffffffffffffffffn
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/
const SEALED_KEY_PACKAGE_BYTES = 120
const MANIFEST_FIELDS = [
  'schema', 'contractVersion', 'protocolVersion', 'organizationId', 'keyVersion', 'manifestRevision',
  'approverSetRevision', 'approverSetDigest', 'messagePublicKey', 'messageKeyFingerprint', 'signingPublicKey',
  'signingKeyFingerprint', 'issuedAt', 'signature',
]
const MANIFEST_CONDITIONAL_FIELDS = ['continuitySignature', 'previousSigningKeyFingerprint']

/** Value-free failure codes shared with the contract's reference verifier. */
export type AgentSubmissionErrorCode =
  | 'unknown-field' | 'missing-field' | 'invalid-target' | 'unsupported-entry-type' | 'invalid-field'
  | 'unsupported-version' | 'field-too-large'
  | 'invalid-agent-signature' | 'context-mismatch' | 'recipient-key-mismatch' | 'wrapper-open-failed'
  | 'wrapper-context-mismatch' | 'payload-auth-failed' | 'identity-mismatch'
  | 'manifest-organization-mismatch' | 'manifest-fingerprint-mismatch' | 'manifest-signature-invalid'
  | 'manifest-continuity-invalid' | 'manifest-rollback' | 'manifest-key-version-skip'
  | 'manifest-reintroduction-required' | 'approver-wrap-invalid' | 'approver-not-recipient'
  | 'entry-type-mismatch' | 'secret-not-nfc'

export class AgentSubmissionCryptoError extends Error {
  readonly code: AgentSubmissionErrorCode
  constructor(code: AgentSubmissionErrorCode) {
    // The message is the code only: no field value or plaintext may leak into logs.
    super(code)
    this.name = 'AgentSubmissionCryptoError'
    this.code = code
  }
}

function fail(code: AgentSubmissionErrorCode): never {
  throw new AgentSubmissionCryptoError(code)
}

export interface AgentSubmissionTarget {
  kind: string
  suggestedVaultId?: string
  vaultId?: string
  entryId?: string
  expectedEntryRevision?: string
}

export interface AgentEntrySubmission {
  schema: string
  contractVersion: number
  protocolVersion: number
  organizationId: string
  submissionId: string
  agentId: string
  submissionKind: number
  entryType: number
  target: AgentSubmissionTarget
  submissionRevision: string
  agentAccessEpoch: string
  agentKeyVersion: number
  agentKeyFingerprint: string
  approverKeyVersion: number
  approverMessageKeyFingerprint: string
  approverManifestRevision: string
  encodedPayload: string
  encodedAgentWrappedDek: string
  encodedApproverWrappedDek: string
  agentSignature: string
}

export interface OrganizationApproverManifest {
  schema: string
  contractVersion: number
  protocolVersion: number
  organizationId: string
  keyVersion: number
  manifestRevision: string
  approverSetRevision: string
  approverSetDigest: string
  messagePublicKey: string
  messageKeyFingerprint: string
  signingPublicKey: string
  signingKeyFingerprint: string
  previousSigningKeyFingerprint?: string
  issuedAt: string
  signature: string
  continuitySignature?: string
}

export interface ApproverKeyWrapDescriptor {
  purpose: number
  scopeBitmap: number
  organizationId: string
  memberId: string
  resourceRevision: string
  wrappedKeyVersion: number
  recipientKeyKind: number
  recipientKeyVersion: number
  recipientFingerprint: string
}

export interface ApproverKeyWrap {
  descriptor: ApproverKeyWrapDescriptor
  encodedSealedKeyPackage: string
}

/** One current approver as listed by the authoritative approver set. */
export interface ApproverRecipient {
  memberId: string
  memberKeyVersion: number
  memberKeyFingerprint: string
  memberPublicKey: string
  hasWrap: boolean
}

export type SubmissionContentField = 'value' | 'username' | 'password' | 'url' | 'notes'

export interface AgentSubmissionPayload {
  schema: string
  identity: Record<string, unknown>
  label?: string
  content: Partial<Record<SubmissionContentField, string>>
}

/**
 * The caller's own approver keys after opening their wraps. Callers own every
 * buffer and must call {@link wipeApproverKeys} when done.
 */
export interface OpenedApproverKeys {
  keyVersion: number
  manifest: OrganizationApproverManifest
  messagePublicKey: Uint8Array
  messagePrivateKey: Uint8Array
  messageKeyFingerprint: string
  signingSeed: Uint8Array
}

export function wipeApproverKeys(keys: OpenedApproverKeys): void {
  wipe(keys.messagePrivateKey)
  wipe(keys.signingSeed)
}

function omit<T extends object>(value: T, keys: readonly string[]): CanonicalJson {
  return Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key))) as CanonicalJson
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index]
  return difference === 0
}

function decode(value: unknown, code: AgentSubmissionErrorCode = 'invalid-field', bytes?: number): Uint8Array {
  if (typeof value !== 'string') fail(code)
  let decoded: Uint8Array
  try { decoded = decodeBase64Url(value) } catch { fail(code) }
  if (bytes !== undefined && decoded.length !== bytes) fail(code)
  return decoded
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length
}

async function fingerprint(publicKey: Uint8Array, kind: number): Promise<Uint8Array> {
  return computeVaultKeyFingerprint(publicKey, kind as (typeof VAULT_KEY_KIND)[keyof typeof VAULT_KEY_KIND])
}

export function submissionIdentity(submission: AgentEntrySubmission): Record<string, unknown> {
  return Object.fromEntries(SUBMISSION_IDENTITY_FIELDS.map((key) => [key, submission[key]]))
}

function identityAad(identity: Record<string, unknown>): Uint8Array {
  return concatBytes(ascii('PLDNSUB1AAD'), encodeUtf8(canonicalizeVaultJson(identity as CanonicalJson)))
}

function identityDescriptorHash(identity: Record<string, unknown>): Uint8Array {
  return sha256Digest(concatBytes(ascii('PLDNSUB1ID'), encodeUtf8(canonicalizeVaultJson(identity as CanonicalJson))))
}

export function submissionKindName(kind: number): 'new' | 'update' | null {
  return kind === SUBMISSION_KIND.new ? 'new' : kind === SUBMISSION_KIND.update ? 'update' : null
}

export function submissionEntryTypeName(entryType: number): 'key' | 'credential' | null {
  return entryType === SUBMISSION_ENTRY_TYPE.key ? 'key'
    : entryType === SUBMISSION_ENTRY_TYPE.credential ? 'credential' : null
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Closed transport shape: unknown or missing fields, kinds and entry types fail before any key use. */
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (!isObject(value)) fail('invalid-field')
}

function assertHeader(object: Record<string, unknown>, schema: string): void {
  if (object.schema !== schema || object.contractVersion !== SUBMISSION_CONTRACT_VERSION
    || object.protocolVersion !== PROTOCOL_VERSION) fail('unsupported-version')
}

function assertUuid(value: unknown): void {
  if (typeof value !== 'string' || !LOWERCASE_UUID.test(value)) fail('invalid-field')
}

function assertU64(value: unknown, positive: boolean): void {
  if (typeof value !== 'string' || !CANONICAL_U64.test(value) || BigInt(value) > U64_MAX
    || (positive && value === '0')) fail('invalid-field')
}

function assertPositiveU32(value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 0xffffffff) fail('invalid-field')
}

function assertBinary(value: unknown, bytes?: number): Uint8Array {
  return decode(value, 'invalid-field', bytes)
}

/** `wireEncoding` and the closed transport shape, checked before any key or signature use. */
export function assertSubmissionTransportShape(submission: unknown): asserts submission is AgentEntrySubmission {
  assertObject(submission)
  const allowed = new Set<string>(SUBMISSION_TRANSPORT_FIELDS)
  for (const key of Object.keys(submission)) if (!allowed.has(key)) fail('unknown-field')
  for (const key of allowed) if (!(key in submission)) fail('missing-field')
  assertHeader(submission, SUBMISSION_SCHEMA)
  for (const key of ['organizationId', 'submissionId', 'agentId']) assertUuid(submission[key])
  for (const key of ['submissionRevision', 'agentAccessEpoch', 'approverManifestRevision']) assertU64(submission[key], true)
  assertPositiveU32(submission.agentKeyVersion)
  assertPositiveU32(submission.approverKeyVersion)
  assertBinary(submission.agentKeyFingerprint, 32)
  assertBinary(submission.approverMessageKeyFingerprint, 32)
  assertBinary(submission.encodedAgentWrappedDek, SEALED_KEY_PACKAGE_BYTES)
  assertBinary(submission.encodedApproverWrappedDek, SEALED_KEY_PACKAGE_BYTES)
  assertBinary(submission.agentSignature, 64)
  if (assertBinary(submission.encodedPayload).length < AEAD_NONCE_BYTES + AEAD_TAG_BYTES) fail('invalid-field')
  const target = submission.target
  const kind = isNonNegativeInteger(submission.submissionKind) ? submissionKindName(submission.submissionKind) : null
  assertObject(target)
  if (!kind || target.kind !== kind) fail('invalid-target')
  if (!isNonNegativeInteger(submission.entryType) || submissionEntryTypeName(submission.entryType) === null) {
    fail('unsupported-entry-type')
  }
  const targetSpec = TARGET_FIELDS[kind]
  const targetFields: readonly string[] = [...targetSpec.required, ...targetSpec.optional]
  for (const key of Object.keys(target)) if (!targetFields.includes(key)) fail('unknown-field')
  for (const key of targetSpec.required) if (!(key in target)) fail('missing-field')
  for (const key of ['vaultId', 'entryId', 'suggestedVaultId']) if (key in target) assertUuid(target[key])
  if ('expectedEntryRevision' in target) assertU64(target.expectedEntryRevision, true)
}

const UNPAIRED_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

/** Vault protocol 2 rejects non-NFC Entry strings; normalizing would change the secret the Agent used. */
function assertPayloadString(value: unknown, maximumBytes: number): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || UNPAIRED_SURROGATE.test(value)
    || value !== value.normalize('NFC')) fail('invalid-field')
  if (utf8Length(value) > maximumBytes) fail('field-too-large')
}

function assertHttpsUrl(value: string): void {
  let url: URL
  try { url = new URL(value) } catch { fail('invalid-field') }
  if (url.protocol !== 'https:' || url.hostname === '') fail('invalid-field')
}

/** Decrypted content is untrusted Agent input: closed shape, types, NFC label, HTTPS URL and limits. */
function assertPayloadShape(payload: unknown): asserts payload is AgentSubmissionPayload {
  assertObject(payload)
  for (const key of Object.keys(payload)) {
    if (!['schema', 'identity', 'content', 'label'].includes(key)) fail('unknown-field')
  }
  for (const key of ['schema', 'identity', 'content']) if (!(key in payload)) fail('missing-field')
  if (payload.schema !== SUBMISSION_PAYLOAD_SCHEMA) fail('invalid-field')
  assertObject(payload.identity)
  assertObject(payload.content)
  const kind = submissionKindName(payload.identity.submissionKind as number)
  if (kind === 'new' && !('label' in payload)) fail('missing-field')
  if ('label' in payload) {
    assertPayloadString(payload.label, SUBMISSION_LIMITS.labelUtf8Bytes)
  }
  const type = submissionEntryTypeName(payload.identity.entryType as number)
  if (!kind || !type) fail('unsupported-entry-type')
  const spec = CONTENT_FIELDS[kind][type]
  const fields: readonly string[] = [...spec.required, ...spec.optional]
  for (const key of Object.keys(payload.content)) if (!fields.includes(key)) fail('unknown-field')
  for (const key of spec.required) if (!(key in payload.content)) fail('missing-field')
  for (const [key, value] of Object.entries(payload.content)) assertPayloadString(value, CONTENT_LIMIT[key])
  if (type === 'credential' && 'url' in payload.content) assertHttpsUrl(payload.content.url as string)
}

function assertManifestShape(manifest: unknown): asserts manifest is OrganizationApproverManifest {
  assertObject(manifest)
  for (const key of Object.keys(manifest)) if (!MANIFEST_FIELDS.includes(key) && !MANIFEST_CONDITIONAL_FIELDS.includes(key)) fail('unknown-field')
  for (const key of MANIFEST_FIELDS) if (!(key in manifest)) fail('missing-field')
  assertHeader(manifest, APPROVER_MANIFEST_SCHEMA)
  assertUuid(manifest.organizationId)
  assertPositiveU32(manifest.keyVersion)
  assertU64(manifest.manifestRevision, true)
  assertU64(manifest.approverSetRevision, true)
  for (const key of ['approverSetDigest', 'messagePublicKey', 'messageKeyFingerprint', 'signingPublicKey', 'signingKeyFingerprint']) {
    assertBinary(manifest[key], 32)
  }
  if ('previousSigningKeyFingerprint' in manifest) assertBinary(manifest.previousSigningKeyFingerprint, 32)
  assertBinary(manifest.signature, 64)
  if ('continuitySignature' in manifest) assertBinary(manifest.continuitySignature, 64)
  if (typeof manifest.issuedAt !== 'string' || !INSTANT.test(manifest.issuedAt)
    || Number.isNaN(Date.parse(manifest.issuedAt))) fail('invalid-field')
}

function approverSubmissionWrapContext(submission: AgentEntrySubmission): X25519WrapperContext {
  return {
    protocolVersion: PROTOCOL_VERSION,
    wrapperSuiteId: X25519_SEALED_BOX_V1,
    purpose: WRAPPER_PURPOSE.submissionDek,
    organizationId: submission.organizationId,
    grantOrRequestId: submission.submissionId,
    agentId: submission.agentId,
    resourceRevision: BigInt(submission.submissionRevision),
    wrappedKeyVersion: 1,
    recipientKeyKind: VAULT_KEY_KIND.approverX25519,
    recipientKeyVersion: submission.approverKeyVersion,
    recipientFingerprint: decode(submission.approverMessageKeyFingerprint, 'recipient-key-mismatch', 32),
    parentDescriptorHash: identityDescriptorHash(submissionIdentity(submission)),
  }
}

/**
 * Independent authority for opening a submission as an approver:
 * - `organizationId` from the authenticated JWT;
 * - `agentId` + `agentEd25519PublicKey` from the Agent directory row matched to the submission;
 * - `approverKeys` opened from the caller's own wraps and bound to a self-verified manifest.
 */
export interface SubmissionApproverAuthority {
  organizationId: string
  /** The id the client requested; a different correctly signed submission is never opened. */
  submissionId: string
  agentId: string
  agentEd25519PublicKey: Uint8Array
  approverKeys: Pick<OpenedApproverKeys, 'keyVersion' | 'messagePublicKey' | 'messagePrivateKey' | 'messageKeyFingerprint'>
}

/**
 * Verifies and opens a submission in the contract's validation order. The
 * returned payload contains plaintext secrets and must stay in memory only.
 */
export async function openSubmissionAsApprover(
  submission: unknown,
  authority: SubmissionApproverAuthority,
): Promise<AgentSubmissionPayload> {
  assertSubmissionTransportShape(submission)
  let signatureValid = false
  try {
    signatureValid = await verifyVaultSignature(
      SUBMISSION_SIGNATURE_DOMAIN,
      omit(submission, SIGNATURE_FIELDS),
      submission.agentSignature,
      authority.agentEd25519PublicKey,
    )
  } catch {
    signatureValid = false
  }
  if (!signatureValid) fail('invalid-agent-signature')
  if (submission.organizationId !== authority.organizationId || submission.submissionId !== authority.submissionId
    || submission.agentId !== authority.agentId) {
    fail('context-mismatch')
  }
  if (submission.approverKeyVersion !== authority.approverKeys.keyVersion
    || submission.approverMessageKeyFingerprint !== authority.approverKeys.messageKeyFingerprint) {
    fail('recipient-key-mismatch')
  }
  return openPayload(
    submission,
    decode(submission.encodedApproverWrappedDek, 'wrapper-open-failed'),
    authority.approverKeys.messagePublicKey,
    authority.approverKeys.messagePrivateKey,
  )
}

async function openPayload(
  submission: AgentEntrySubmission,
  sealedDek: Uint8Array,
  recipientPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array,
): Promise<AgentSubmissionPayload> {
  const sodium = await loadSodium()
  const context = approverSubmissionWrapContext(submission)
  let opened: Uint8Array
  try {
    opened = sodium.crypto_box_seal_open(sealedDek, recipientPublicKey, recipientPrivateKey)
  } catch {
    fail('wrapper-open-failed')
  }
  const expectedHash = await computeContextHash(context)
  try {
    if (opened.length !== PACKAGE_MAGIC.length + 64 || !equalBytes(opened.subarray(0, 8), PACKAGE_MAGIC)) {
      fail('wrapper-open-failed')
    }
    if (!equalBytes(opened.subarray(40), expectedHash)) fail('wrapper-context-mismatch')
    const dek = opened.subarray(8, 40)
    const sealed = decode(submission.encodedPayload, 'payload-auth-failed')
    // The ciphertext length fixes the plaintext length, so the plaintext limit is enforced before decryption.
    if (sealed.length > AEAD_NONCE_BYTES + AEAD_TAG_BYTES + SUBMISSION_LIMITS.payloadPlaintextBytes) fail('field-too-large')
    const identity = submissionIdentity(submission)
    let plaintext: Uint8Array
    try {
      plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
        null, sealed.subarray(AEAD_NONCE_BYTES), identityAad(identity), sealed.subarray(0, AEAD_NONCE_BYTES), dek,
      )
    } catch {
      fail('payload-auth-failed')
    }
    let payload: unknown
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext))
    } catch {
      fail('invalid-field')
    } finally {
      wipe(plaintext)
    }
    assertPayloadShape(payload)
    let sameIdentity = false
    try {
      sameIdentity = canonicalizeVaultJson(payload.identity as CanonicalJson)
        === canonicalizeVaultJson(identity as CanonicalJson)
    } catch {
      sameIdentity = false
    }
    if (!sameIdentity) fail('identity-mismatch')
    return payload
  } finally {
    wipe(opened)
    wipe(expectedHash)
  }
}

async function manifestFingerprintsMatch(manifest: OrganizationApproverManifest): Promise<boolean> {
  const signing = decode(manifest.signingPublicKey, 'manifest-fingerprint-mismatch', 32)
  const message = decode(manifest.messagePublicKey, 'manifest-fingerprint-mismatch', 32)
  return equalBytes(await fingerprint(signing, VAULT_KEY_KIND.approverEd25519),
    decode(manifest.signingKeyFingerprint, 'manifest-fingerprint-mismatch', 32))
    && equalBytes(await fingerprint(message, VAULT_KEY_KIND.approverX25519),
      decode(manifest.messageKeyFingerprint, 'manifest-fingerprint-mismatch', 32))
}

async function verifyManifestSignature(
  domain: string, manifest: OrganizationApproverManifest, field: 'signature' | 'continuitySignature',
  publicKey: Uint8Array, code: AgentSubmissionErrorCode,
): Promise<void> {
  let valid = false
  try {
    valid = await verifyVaultSignature(domain, omit(manifest, SIGNATURE_FIELDS), manifest[field] ?? '', publicKey)
  } catch {
    valid = false
  }
  if (!valid) fail(code)
}

/** Self-contained manifest checks: wire shape, organization, fingerprints, self-signature and continuity pairing. */
export async function verifyApproverManifest(
  manifest: unknown,
  organizationId: string,
): Promise<void> {
  assertManifestShape(manifest)
  if (manifest.organizationId !== organizationId) fail('manifest-organization-mismatch')
  if (!await manifestFingerprintsMatch(manifest)) fail('manifest-fingerprint-mismatch')
  await verifyManifestSignature(MANIFEST_SIGNATURE_DOMAIN, manifest, 'signature',
    decode(manifest.signingPublicKey, 'manifest-signature-invalid', 32), 'manifest-signature-invalid')
  const hasContinuity = manifest.continuitySignature !== undefined
  if (hasContinuity !== (manifest.previousSigningKeyFingerprint !== undefined)
    || (hasContinuity && manifest.keyVersion === 1)) fail('manifest-continuity-invalid')
}

export interface PinnedApproverManifest {
  keyVersion: number
  manifestRevision: string
  signingKeyFingerprint: string
  messageKeyFingerprint: string
  signingPublicKey: Uint8Array
}

/** Trust-on-first-use chain rules the Agent runtime applies; reused to self-check a rotation before upload. */
export async function verifyApproverManifestChain(
  manifests: readonly OrganizationApproverManifest[],
  organizationId: string,
): Promise<PinnedApproverManifest | null> {
  let pinned: PinnedApproverManifest | null = null
  for (const manifest of manifests) {
    await verifyApproverManifest(manifest, organizationId)
    const hasContinuity = manifest.continuitySignature !== undefined
    if (pinned !== null) {
      if (BigInt(manifest.manifestRevision) <= BigInt(pinned.manifestRevision)) fail('manifest-rollback')
      if (manifest.keyVersion === pinned.keyVersion) {
        if (manifest.signingKeyFingerprint !== pinned.signingKeyFingerprint || hasContinuity) {
          fail('manifest-signature-invalid')
        }
        // A different message key under the same version would let a server substitute recipients.
        if (manifest.messageKeyFingerprint !== pinned.messageKeyFingerprint) fail('manifest-fingerprint-mismatch')
      } else if (manifest.keyVersion === pinned.keyVersion + 1) {
        if (!hasContinuity) fail('manifest-reintroduction-required')
        if (manifest.previousSigningKeyFingerprint !== pinned.signingKeyFingerprint) fail('manifest-continuity-invalid')
        await verifyManifestSignature(CONTINUITY_SIGNATURE_DOMAIN, manifest, 'continuitySignature',
          pinned.signingPublicKey, 'manifest-continuity-invalid')
      } else {
        fail('manifest-key-version-skip')
      }
    }
    pinned = {
      keyVersion: manifest.keyVersion,
      manifestRevision: manifest.manifestRevision,
      signingKeyFingerprint: manifest.signingKeyFingerprint,
      messageKeyFingerprint: manifest.messageKeyFingerprint,
      signingPublicKey: decode(manifest.signingPublicKey, 'manifest-signature-invalid', 32),
    }
  }
  return pinned
}

/**
 * Independent authority for opening the caller's own approver wraps: the JWT
 * organization and principal, Identity's current Member key version and the
 * in-memory Member private key (its public key and fingerprint are derived locally).
 */
export interface ApproverMemberAuthority {
  organizationId: string
  memberId: string
  memberKeyVersion: number
  memberPrivateKey: Uint8Array
}

function approverWrapContext(descriptor: ApproverKeyWrapDescriptor): X25519WrapperContext {
  return {
    protocolVersion: PROTOCOL_VERSION,
    wrapperSuiteId: X25519_SEALED_BOX_V1,
    purpose: descriptor.purpose as typeof WRAPPER_PURPOSE.approverMessagePrivateKey,
    organizationId: descriptor.organizationId,
    memberId: descriptor.memberId,
    resourceRevision: BigInt(descriptor.resourceRevision),
    wrappedKeyVersion: descriptor.wrappedKeyVersion,
    recipientKeyKind: VAULT_KEY_KIND.memberX25519,
    recipientKeyVersion: descriptor.recipientKeyVersion,
    recipientFingerprint: decode(descriptor.recipientFingerprint, 'approver-wrap-invalid', 32),
  }
}

/** Opens the caller's two approver wraps and binds them to a manifest whose public keys they must reproduce. */
export async function openOwnApproverKeys(
  manifest: OrganizationApproverManifest,
  wraps: readonly ApproverKeyWrap[],
  authority: ApproverMemberAuthority,
): Promise<OpenedApproverKeys> {
  await verifyApproverManifest(manifest, authority.organizationId)
  const sodium = await loadSodium()
  const memberPublicKey = sodium.crypto_scalarmult_base(authority.memberPrivateKey)
  const memberFingerprint = encodeBase64Url(await fingerprint(memberPublicKey, VAULT_KEY_KIND.memberX25519))
  const purposes = [WRAPPER_PURPOSE.approverMessagePrivateKey, WRAPPER_PURPOSE.approverSigningSeed]
  if (wraps.length !== 2 || purposes.some((purpose) => wraps.filter((wrap) => wrap.descriptor.purpose === purpose).length !== 1)) {
    fail('approver-not-recipient')
  }
  const opened = new Map<number, Uint8Array>()
  try {
    for (const wrap of wraps) {
      const descriptor = wrap.descriptor
      if (descriptor.scopeBitmap !== APPROVER_WRAP_SCOPE_BITMAP
        || descriptor.organizationId !== authority.organizationId
        || descriptor.memberId !== authority.memberId
        || descriptor.recipientKeyKind !== VAULT_KEY_KIND.memberX25519
        || descriptor.recipientKeyVersion !== authority.memberKeyVersion
        || descriptor.recipientFingerprint !== memberFingerprint
        || descriptor.wrappedKeyVersion !== manifest.keyVersion
        || !CANONICAL_U64.test(descriptor.resourceRevision)
        || BigInt(descriptor.resourceRevision) > BigInt(manifest.approverSetRevision)) {
        fail('approver-not-recipient')
      }
      try {
        opened.set(descriptor.purpose, await openKeyFromX25519Recipient(
          decode(wrap.encodedSealedKeyPackage, 'approver-wrap-invalid'),
          memberPublicKey, authority.memberPrivateKey, approverWrapContext(descriptor),
        ))
      } catch (error) {
        if (error instanceof AgentSubmissionCryptoError) throw error
        fail('approver-wrap-invalid')
      }
    }
    const messagePrivateKey = opened.get(WRAPPER_PURPOSE.approverMessagePrivateKey)!
    const signingSeed = opened.get(WRAPPER_PURPOSE.approverSigningSeed)!
    const messagePublicKey = sodium.crypto_scalarmult_base(messagePrivateKey)
    const signing = sodium.crypto_sign_seed_keypair(signingSeed)
    try {
      if (encodeBase64Url(messagePublicKey) !== manifest.messagePublicKey
        || encodeBase64Url(signing.publicKey) !== manifest.signingPublicKey) {
        fail('manifest-fingerprint-mismatch')
      }
    } finally {
      wipe(signing.privateKey)
    }
    opened.clear()
    return {
      keyVersion: manifest.keyVersion,
      manifest,
      messagePublicKey,
      messagePrivateKey,
      messageKeyFingerprint: manifest.messageKeyFingerprint,
      signingSeed,
    }
  } finally {
    for (const key of opened.values()) wipe(key)
  }
}

export async function computeApproverSetDigest(
  approvers: readonly Pick<ApproverRecipient, 'memberId' | 'memberKeyVersion' | 'memberKeyFingerprint'>[],
): Promise<string> {
  const sorted = approvers.map((approver) => ({ approver, id: decodeUuid(approver.memberId) }))
    .sort((left, right) => {
      for (let index = 0; index < 16; index++) {
        if (left.id[index] !== right.id[index]) return left.id[index] - right.id[index]
      }
      return 0
    })
  return encodeBase64Url(sha256Digest(concatBytes(
    ascii('PLDNSUB1SET'),
    ...sorted.flatMap(({ approver, id }) => [
      id, encodeU32(approver.memberKeyVersion), decode(approver.memberKeyFingerprint, 'invalid-field', 32),
    ]),
  )))
}

/** Server-issued single-use binding for the next signed manifest. */
export interface ApproverKeyChallenge {
  issuedAt: string
  approverSetRevision: string
  approvers: readonly ApproverRecipient[]
}

export type ApproverKeySetChangeKind = 'bootstrap' | 'addApprovers' | 'rotate' | 'rebootstrap'

export interface ApproverKeySetChangeInput {
  kind: ApproverKeySetChangeKind
  organizationId: string
  /** The caller; must be a listed approver so the change never locks them out. */
  memberId: string
  memberPrivateKey: Uint8Array
  challenge: ApproverKeyChallenge
  /** Required except for bootstrap: the last committed manifest. */
  currentManifest?: OrganizationApproverManifest
  /** Required for addApprovers and rotate: the caller's opened current keys. */
  currentKeys?: OpenedApproverKeys
}

export interface ApproverKeySetChange {
  manifest: OrganizationApproverManifest
  wraps: ApproverKeyWrap[]
}

async function sealApproverWraps(
  recipients: readonly ApproverRecipient[],
  keys: { messagePrivateKey: Uint8Array; signingSeed: Uint8Array },
  organizationId: string,
  keyVersion: number,
  approverSetRevision: string,
): Promise<ApproverKeyWrap[]> {
  const wraps: ApproverKeyWrap[] = []
  for (const recipient of recipients) {
    const recipientPublicKey = decode(recipient.memberPublicKey, 'invalid-field', 32)
    for (const [purpose, key] of [
      [WRAPPER_PURPOSE.approverMessagePrivateKey, keys.messagePrivateKey],
      [WRAPPER_PURPOSE.approverSigningSeed, keys.signingSeed],
    ] as const) {
      const descriptor: ApproverKeyWrapDescriptor = {
        purpose,
        scopeBitmap: APPROVER_WRAP_SCOPE_BITMAP,
        organizationId,
        memberId: recipient.memberId,
        resourceRevision: approverSetRevision,
        wrappedKeyVersion: keyVersion,
        recipientKeyKind: VAULT_KEY_KIND.memberX25519,
        recipientKeyVersion: recipient.memberKeyVersion,
        recipientFingerprint: recipient.memberKeyFingerprint,
      }
      // Rejects a listed public key that does not reproduce its listed fingerprint.
      const sealed = await sealKeyToX25519Recipient(key, recipientPublicKey, approverWrapContext(descriptor))
      wraps.push({ descriptor, encodedSealedKeyPackage: encodeBase64Url(sealed) })
    }
  }
  return wraps
}

/**
 * Produces the manifest and wraps for one approver key-set change. Generated
 * private keys never leave this function except as wraps.
 */
export async function buildApproverKeySetChange(input: ApproverKeySetChangeInput): Promise<ApproverKeySetChange> {
  const sodium = await loadSodium()
  const { challenge, kind } = input
  const memberPublicKey = sodium.crypto_scalarmult_base(input.memberPrivateKey)
  const memberFingerprint = encodeBase64Url(await fingerprint(memberPublicKey, VAULT_KEY_KIND.memberX25519))
  if (!challenge.approvers.some((approver) => approver.memberId === input.memberId
    && approver.memberKeyFingerprint === memberFingerprint)) fail('approver-not-recipient')
  if (kind !== 'bootstrap' && !input.currentManifest) fail('missing-field')
  if ((kind === 'addApprovers' || kind === 'rotate') && !input.currentKeys) fail('missing-field')

  const reuseKeys = kind === 'addApprovers'
  const messagePrivateKey = reuseKeys ? new Uint8Array(input.currentKeys!.messagePrivateKey) : sodium.randombytes_buf(32)
  const signingSeed = reuseKeys ? new Uint8Array(input.currentKeys!.signingSeed) : sodium.randombytes_buf(32)
  const signing = sodium.crypto_sign_seed_keypair(signingSeed)
  const previousSigning = kind === 'rotate' ? sodium.crypto_sign_seed_keypair(input.currentKeys!.signingSeed) : null
  try {
    const messagePublicKey = sodium.crypto_scalarmult_base(messagePrivateKey)
    const keyVersion = kind === 'bootstrap' ? 1
      : reuseKeys ? input.currentManifest!.keyVersion : input.currentManifest!.keyVersion + 1
    const manifestRevision = kind === 'bootstrap' ? '1'
      : (BigInt(input.currentManifest!.manifestRevision) + 1n).toString()
    const unsigned: Omit<OrganizationApproverManifest, 'signature' | 'continuitySignature'> = {
      schema: APPROVER_MANIFEST_SCHEMA,
      contractVersion: SUBMISSION_CONTRACT_VERSION,
      protocolVersion: PROTOCOL_VERSION,
      organizationId: input.organizationId,
      keyVersion,
      manifestRevision,
      approverSetRevision: challenge.approverSetRevision,
      approverSetDigest: await computeApproverSetDigest(challenge.approvers),
      messagePublicKey: encodeBase64Url(messagePublicKey),
      messageKeyFingerprint: encodeBase64Url(await fingerprint(messagePublicKey, VAULT_KEY_KIND.approverX25519)),
      signingPublicKey: encodeBase64Url(signing.publicKey),
      signingKeyFingerprint: encodeBase64Url(await fingerprint(signing.publicKey, VAULT_KEY_KIND.approverEd25519)),
      ...(kind === 'rotate' ? { previousSigningKeyFingerprint: input.currentManifest!.signingKeyFingerprint } : {}),
      issuedAt: challenge.issuedAt,
    }
    const manifest: OrganizationApproverManifest = {
      ...unsigned,
      signature: await signVaultObject(MANIFEST_SIGNATURE_DOMAIN, unsigned as unknown as CanonicalJson, signing.privateKey),
      ...(previousSigning ? {
        continuitySignature: await signVaultObject(
          CONTINUITY_SIGNATURE_DOMAIN, unsigned as unknown as CanonicalJson, previousSigning.privateKey),
      } : {}),
    }
    if (kind === 'rotate' || kind === 'addApprovers') {
      await verifyApproverManifestChain([input.currentManifest!, manifest], input.organizationId)
    } else {
      await verifyApproverManifest(manifest, input.organizationId)
    }
    const recipients = kind === 'addApprovers'
      ? challenge.approvers.filter((approver) => !approver.hasWrap)
      : challenge.approvers
    if (recipients.length === 0) fail('approver-not-recipient')
    const wraps = await sealApproverWraps(
      recipients, { messagePrivateKey, signingSeed }, input.organizationId, keyVersion, challenge.approverSetRevision)
    return { manifest, wraps }
  } finally {
    wipe(messagePrivateKey)
    wipe(signingSeed)
    wipe(signing.privateKey)
    if (previousSigning) wipe(previousSigning.privateKey)
  }
}

/**
 * Secrets enter the Entry exactly as the Agent sent them. Vault protocol 2 fails
 * closed on non-NFC MemberSecret strings (vault-v2 README, `normalizedString` in
 * the MemberSecret schema), so such a submission is refused rather than altered.
 */
function assertNfcSecrets(content: AgentSubmissionPayload['content']): void {
  for (const value of Object.values(content)) {
    if (typeof value === 'string' && value !== value.normalize('NFC')) fail('secret-not-nfc')
  }
}

function hostname(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

/** Builds a complete new Entry with the canonical default Agent Visibility Policy. */
export function newEntrySecretFromSubmission(payload: AgentSubmissionPayload, label: string): MemberSecretV1 {
  const type = submissionEntryTypeName(payload.identity.entryType as number)
  const content = payload.content
  assertNfcSecrets(content)
  const name = label.trim()
  if (!name) fail('missing-field')
  if (type === 'credential') {
    return toMemberSecret({
      label: name, agentLabel: name, type: ENTRY_TYPE_CREDENTIAL,
      payload: {
        type: ENTRY_TYPE_CREDENTIAL, username: content.username ?? '', password: content.password ?? '',
        url: content.url, notes: content.notes, fields: [],
      },
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_CREDENTIAL),
    })
  }
  if (type === 'key') {
    return toMemberSecret({
      label: name, agentLabel: name, type: ENTRY_TYPE_KEY,
      payload: { type: ENTRY_TYPE_KEY, value: content.value ?? '', url: content.url, notes: content.notes, fields: [] },
      policy: defaultAgentVisibilityPolicy(ENTRY_TYPE_KEY),
    })
  }
  fail('unsupported-entry-type')
}

/**
 * Applies only the fields present in an update submission to the decrypted
 * target revision. Custom fields, TOTP and the Agent Visibility Policy of
 * existing fields are never changed.
 */
export function mergeSubmissionUpdate(
  current: MemberSecretV1,
  payload: AgentSubmissionPayload,
  label?: string,
): MemberSecretV1 {
  const type = submissionEntryTypeName(payload.identity.entryType as number)
  if (type !== current.entryType) fail('entry-type-mismatch')
  const content = payload.content
  assertNfcSecrets(content)
  const memberLabel = label?.trim() ? label.trim().normalize('NFC') : current.memberLabel
  if (current.entryType === 'credential') {
    const url = 'url' in content ? content.url! : current.content.url
    return {
      ...current,
      memberLabel,
      content: {
        ...current.content,
        password: content.password ?? current.content.password,
        username: content.username ?? current.content.username,
        url,
        urlDomain: 'url' in content ? hostname(url!) : current.content.urlDomain,
        notes: 'notes' in content ? content.notes! : current.content.notes,
      },
    }
  }
  if (current.entryType === 'key') {
    const addsUrl = 'url' in content && !('key.url' in current.agentFieldAccess)
    return {
      ...current,
      memberLabel,
      // The schema requires a key.url entry once a URL exists; a submission never widens Agent access.
      agentFieldAccess: addsUrl ? { ...current.agentFieldAccess, 'key.url': 'never' } : current.agentFieldAccess,
      content: {
        ...current.content,
        value: content.value ?? current.content.value,
        url: 'url' in content ? content.url! : current.content.url,
        notes: 'notes' in content ? content.notes! : current.content.notes,
      },
    }
  }
  fail('entry-type-mismatch')
}
