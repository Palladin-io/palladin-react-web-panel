import { z } from 'zod'

import {
  MAX_ENCODED_SUITE_PAYLOAD_BYTES,
  requireCryptoSuite,
  VAULT_XCHACHA20_POLY1305_V1,
} from './crypto-suite'
import { toBase64Url } from './encoding'
import type { CanonicalEnvelopeAad } from './envelope'
import { loadSodium, randomBytes, wipe } from './sodium'
import {
  SCRIPT_EXECUTION_CONTRACT_VERSION,
  SCRIPT_EXECUTION_PARAMETER_MAX_COUNT,
  scriptExecutionMetadataSchema,
  scriptParameterDefinitionSchema,
  type ScriptExecutionMetadataV1,
  type ScriptParameterDefinition,
} from './script-execution-metadata'
import {
  encodeGrantPayload,
  parseGrantPayload,
  parseMemberSecret,
  projectScriptReferencePayload,
  type MemberSecretV1,
} from './vault-plaintext'
import { signVaultObject, type CanonicalJson } from './vault-v2-signatures'
import {
  computeVaultKeyFingerprint,
  sealKeyToX25519Recipient,
  VAULT_KEY_KIND,
  WRAPPER_PURPOSE,
  X25519_SEALED_BOX_V1,
  type X25519WrapperContext,
} from './x25519-wrapper'

export const SCRIPT_EXECUTION_REFERENCE_MAX_COUNT = 64
export const SCRIPT_EXECUTION_PACKAGE_MAX_BYTES = 2_097_152
export const SCRIPT_EXECUTION_PACKAGE_SIGNATURE_DOMAIN = 'PLDNV2SIG:SCRIPT-EXECUTION-PACKAGE:'
export {
  SCRIPT_EXECUTION_CONTRACT_VERSION,
  SCRIPT_EXECUTION_PARAMETER_MAX_COUNT,
  scriptExecutionMetadataSchema,
  scriptParameterDefinitionSchema,
}
export type { ScriptExecutionMetadataV1, ScriptParameterDefinition }

const uuid = z.string().uuid()
const revision = z.string().regex(/^[1-9][0-9]*$/)
const normalizedString = z.string().refine((value) => value === value.normalize('NFC'), 'String must be NFC')
const parameterName = normalizedString.regex(/^[A-Za-z_][A-Za-z0-9_]*$/).max(64)

const RESERVED_REFERENCE_ENV_NAMES = new Set([
  'BASHOPTS', 'BASH_ENV', 'CDPATH', 'ENV', 'GCONV_PATH', 'GLOBIGNORE', 'HOME', 'HOSTALIASES',
  'IFS', 'LD_PRELOAD', 'LOCPATH', 'LOGNAME', 'NLSPATH', 'NODE_OPTIONS', 'NODE_PATH', 'PATH',
  'PERL5LIB', 'PERL5OPT', 'PYTHONHOME', 'PYTHONINSPECT', 'PYTHONPATH', 'PYTHONSTARTUP', 'RUBYOPT',
  'SHELL', 'SHELLOPTS', 'TEMP', 'TMP', 'TMPDIR', 'USER',
])
const RESERVED_REFERENCE_ENV_PREFIXES = ['CLAW_', 'DYLD_', 'LD_', 'PALLADIN_'] as const

const referenceSchema = z.object({
  env: parameterName,
  vaultId: uuid,
  entryId: uuid,
  fieldId: normalizedString.min(1).max(128),
  entryRevision: revision,
}).strict()

const manifestSchema = z.object({
  schema: z.literal('palladin.script-execution-manifest.v1'),
  contractVersion: z.literal(SCRIPT_EXECUTION_CONTRACT_VERSION),
  organizationId: uuid,
  agentId: uuid,
  agentAccessEpoch: z.number().int().positive(),
  vaultId: uuid,
  scriptEntryId: uuid,
  scriptRevision: revision,
  description: normalizedString.trim().min(1).max(4096),
  parameters: z.array(scriptParameterDefinitionSchema).max(SCRIPT_EXECUTION_PARAMETER_MAX_COUNT),
  returnResultToAgent: z.boolean(),
  interpreter: z.enum(['bash', 'sh', 'node', 'python']),
  scriptSource: normalizedString,
  references: z.array(referenceSchema).max(SCRIPT_EXECUTION_REFERENCE_MAX_COUNT),
}).strict()

const packageScopeSchema = z.object({
  vaultId: uuid,
  entryId: uuid,
  fieldId: normalizedString.min(1).max(128),
  entryRevision: revision,
}).strict()

const bindingSchema = z.object({
  schema: z.literal('palladin.script-execution-package-binding.v1'),
  contractVersion: z.literal(SCRIPT_EXECUTION_CONTRACT_VERSION),
  organizationId: uuid,
  agentId: uuid,
  agentAccessEpoch: z.number().int().positive(),
  vaultId: uuid,
  scriptEntryId: uuid,
  scriptRevision: revision,
  manifestDigest: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  authorization: z.object({ source: z.literal('scriptExecution'), grantId: uuid }).strict(),
  scopes: z.array(packageScopeSchema).min(1).max(SCRIPT_EXECUTION_REFERENCE_MAX_COUNT + 1),
}).strict()

const transportScopeSchema = z.object({
  entryId: uuid,
  entryRevision: revision,
  isScript: z.boolean(),
}).strict()

const transportSchema = z.object({
  contractVersion: z.literal(SCRIPT_EXECUTION_CONTRACT_VERSION),
  organizationId: uuid,
  vaultId: uuid,
  grantId: uuid,
  agentId: uuid,
  agentAccessEpoch: z.number().int().positive(),
  scriptEntryId: uuid,
  scriptRevision: revision,
  packageRevision: revision,
  recipientAgentKeyVersion: z.number().int().positive(),
  recipientAgentKeyFingerprint: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  vaultSigningKeyVersion: z.number().int().positive(),
  vaultSigningKeyFingerprint: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  manifestDigest: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  scopes: z.array(transportScopeSchema).min(1).max(SCRIPT_EXECUTION_REFERENCE_MAX_COUNT + 1),
}).strict()

export type ScriptExecutionManifestV1 = z.infer<typeof manifestSchema>
export type ScriptExecutionPackageScopeV1 = z.infer<typeof packageScopeSchema>
export type ScriptExecutionPackageTransportScopeV1 = z.infer<typeof transportScopeSchema>

export interface ScriptExecutionPackageReferenceInput {
  entryId: string
  entryRevision: string
  encodedMemberSecret: Uint8Array
}

export interface ScriptExecutionEncryptedPackageV1 extends z.infer<typeof transportSchema> {
  encodedPackageCiphertext: string
  producerSignature: string
}

export interface BuildScriptExecutionManifestInput {
  organizationId: string
  agentId: string
  agentAccessEpoch: number
  vaultId: string
  scriptEntryId: string
  scriptRevision: string
  memberSecret: MemberSecretV1
  referenceRevisions: Readonly<Record<string, string>>
}

export interface SealScriptExecutionPackageInput {
  manifest: ScriptExecutionManifestV1
  grantId: string
  packageRevision: string
  recipientAgentKeyVersion: number
  recipientAgentPublicKey: Uint8Array
  vaultSigningKeyVersion: number
  vaultSigningPrivateKey: Uint8Array
  entries: readonly ScriptExecutionPackageReferenceInput[]
}

export function effectiveReturnResultToAgent(
  metadata: Pick<ScriptExecutionMetadataV1, 'returnResultToAgent'> | undefined,
): boolean {
  return metadata?.returnResultToAgent === true
}

export function normalizeScriptExecutionMetadata(value: unknown, legacyDescription?: string | null): ScriptExecutionMetadataV1 {
  const normalizedValue = value ?? (legacyDescription?.trim()
    ? {
        contractVersion: SCRIPT_EXECUTION_CONTRACT_VERSION,
        description: legacyDescription.trim(),
        parameters: [],
        returnResultToAgent: false,
      }
    : value)
  const parsed = scriptExecutionMetadataSchema.parse(normalizedValue)
  const parameters = sortedUnique(parsed.parameters, (item) => item.name, 'Script parameter names')
  validateParameterDefinitions(parameters)
  return { ...parsed, description: parsed.description.trim(), parameters }
}

export function buildScriptExecutionManifest(input: BuildScriptExecutionManifestInput): ScriptExecutionManifestV1 {
  if (input.memberSecret.entryType !== 'script') throw new Error('Entry is not a Script')
  const metadata = normalizeScriptExecutionMetadata(
    input.memberSecret.content.execution,
    input.memberSecret.description,
  )
  const references = sortedUnique(input.memberSecret.content.refs.map((reference) => {
    if (reference.vaultId !== input.vaultId) throw new Error('Cross-Vault Script references are forbidden')
    const entryRevision = input.referenceRevisions[reference.entryId]
    if (!entryRevision) throw new Error('A Script reference revision is missing')
    return { ...reference, entryRevision }
  }), referenceKey, 'Script references')
  validateReferenceEnvironmentNames(references)
  const manifest = manifestSchema.parse({
    schema: 'palladin.script-execution-manifest.v1',
    contractVersion: SCRIPT_EXECUTION_CONTRACT_VERSION,
    organizationId: input.organizationId,
    agentId: input.agentId,
    agentAccessEpoch: input.agentAccessEpoch,
    vaultId: input.vaultId,
    scriptEntryId: input.scriptEntryId,
    scriptRevision: input.scriptRevision,
    description: metadata.description,
    parameters: metadata.parameters,
    returnResultToAgent: effectiveReturnResultToAgent(metadata),
    interpreter: input.memberSecret.content.interpreter,
    scriptSource: input.memberSecret.content.source,
    references,
  })
  assertPositiveUInt64(manifest.scriptRevision, 'Script revision')
  if (manifest.references.some((reference) => reference.entryId === manifest.scriptEntryId)) {
    throw new Error('A Script cannot reference itself')
  }
  return manifest
}

export function isAllowedScriptReferenceEnvName(value: string): boolean {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || new TextEncoder().encode(value).length > 64) return false
  const normalized = value.toUpperCase()
  return !RESERVED_REFERENCE_ENV_NAMES.has(normalized)
    && !RESERVED_REFERENCE_ENV_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function validateReferenceEnvironmentNames(references: readonly { env: string }[]): void {
  const names = new Set<string>()
  for (const reference of references) {
    const normalized = reference.env.toUpperCase()
    if (!isAllowedScriptReferenceEnvName(reference.env)) {
      throw new Error('Script reference environment name is reserved or invalid')
    }
    if (names.has(normalized)) throw new Error('Script reference environment names must be unique')
    names.add(normalized)
  }
}

export async function sealScriptExecutionPackage(
  input: SealScriptExecutionPackageInput,
): Promise<ScriptExecutionEncryptedPackageV1> {
  const manifest = manifestSchema.parse(input.manifest)
  assertPositiveUInt64(manifest.scriptRevision, 'Script revision')
  assertPositiveUInt64(input.packageRevision, 'Package revision')
  const entries = normalizeReferenceEntries(input.entries)
  let recipientFingerprint: Uint8Array | undefined
  let vaultSigningPublicKey: Uint8Array | undefined
  let vaultSigningPrivateKey: Uint8Array | undefined
  let vaultSigningFingerprint: Uint8Array | undefined
  let projectedEntries: { entryId: string; entryRevision: string; encodedGrantPayload: Uint8Array }[] | undefined
  let plaintext: Uint8Array | undefined
  let packageDek: Uint8Array | undefined
  let aad: Uint8Array | undefined
  let parentDescriptorHash: Uint8Array | undefined
  try {
    assertReferenceEntriesMatchManifest(manifest, entries)
    const manifestDigest = await digestManifest(manifest)
    const scopes = sortedUnique<ScriptExecutionPackageScopeV1>([
      { vaultId: manifest.vaultId, entryId: manifest.scriptEntryId, fieldId: 'script.source', entryRevision: manifest.scriptRevision },
      ...manifest.references.map(({ vaultId, entryId, fieldId, entryRevision }) => ({ vaultId, entryId, fieldId, entryRevision })),
    ], scopeKey, 'Script package scopes')
    const binding = bindingSchema.parse({
      schema: 'palladin.script-execution-package-binding.v1',
      contractVersion: SCRIPT_EXECUTION_CONTRACT_VERSION,
      organizationId: manifest.organizationId,
      agentId: manifest.agentId,
      agentAccessEpoch: manifest.agentAccessEpoch,
      vaultId: manifest.vaultId,
      scriptEntryId: manifest.scriptEntryId,
      scriptRevision: manifest.scriptRevision,
      manifestDigest,
      authorization: { source: 'scriptExecution', grantId: input.grantId },
      scopes,
    })
    recipientFingerprint = await computeVaultKeyFingerprint(
      input.recipientAgentPublicKey,
      VAULT_KEY_KIND.agentX25519,
    )
    ;({ publicKey: vaultSigningPublicKey, privateKey: vaultSigningPrivateKey }
      = await normalizeVaultSigningKey(input.vaultSigningPrivateKey))
    vaultSigningFingerprint = await computeVaultKeyFingerprint(
      vaultSigningPublicKey,
      VAULT_KEY_KIND.vaultSigningEd25519,
    )
    projectedEntries = projectReferenceEntries(manifest, entries)
    const transportScopes = new Map<string, ScriptExecutionPackageTransportScopeV1>()
    for (const scope of scopes) {
      const next = {
        entryId: scope.entryId,
        entryRevision: scope.entryRevision,
        isScript: scope.entryId === manifest.scriptEntryId,
      }
      const current = transportScopes.get(scope.entryId)
      if (current && (current.entryRevision !== next.entryRevision || current.isScript !== next.isScript)) {
        throw new Error('Script package scopes contain conflicting Entry revisions')
      }
      transportScopes.set(scope.entryId, next)
    }
    const transport = transportSchema.parse({
      contractVersion: SCRIPT_EXECUTION_CONTRACT_VERSION,
      organizationId: manifest.organizationId,
      vaultId: manifest.vaultId,
      grantId: input.grantId,
      agentId: manifest.agentId,
      agentAccessEpoch: manifest.agentAccessEpoch,
      scriptEntryId: manifest.scriptEntryId,
      scriptRevision: manifest.scriptRevision,
      packageRevision: input.packageRevision,
      recipientAgentKeyVersion: input.recipientAgentKeyVersion,
      recipientAgentKeyFingerprint: toBase64Url(recipientFingerprint),
      vaultSigningKeyVersion: input.vaultSigningKeyVersion,
      vaultSigningKeyFingerprint: toBase64Url(vaultSigningFingerprint),
      manifestDigest,
      scopes: [...transportScopes.values()].sort((left, right) => compareUtf8(left.entryId, right.entryId)),
    })
    plaintext = new TextEncoder().encode(canonicalJson({
      schema: 'palladin.script-execution-package-payload.v1',
      binding,
      manifest,
      entries: projectedEntries.map((entry) => ({
        entryId: entry.entryId,
        entryRevision: entry.entryRevision,
        encodedGrantPayload: toBase64Url(entry.encodedGrantPayload),
      })),
    }))
    if (plaintext.length > MAX_ENCODED_SUITE_PAYLOAD_BYTES - 40) {
      throw new RangeError('Script execution package plaintext exceeds the encrypted payload limit')
    }
    packageDek = await randomBytes(32)
    aad = new TextEncoder().encode(canonicalJson(transport))
    parentDescriptorHash = await hashWithDomain('PLDNSCRIPTAAD1', aad)
    const wrapperContext: X25519WrapperContext = {
      protocolVersion: 2,
      wrapperSuiteId: X25519_SEALED_BOX_V1,
      purpose: WRAPPER_PURPOSE.scriptExecutionDek,
      organizationId: transport.organizationId,
      vaultId: transport.vaultId,
      entryId: transport.scriptEntryId,
      grantOrRequestId: transport.grantId,
      agentId: transport.agentId,
      resourceRevision: BigInt(transport.packageRevision),
      wrappedKeyVersion: 1,
      recipientKeyKind: VAULT_KEY_KIND.agentX25519,
      recipientKeyVersion: transport.recipientAgentKeyVersion,
      recipientFingerprint,
      parentDescriptorHash,
    }
    const [suitePayload, sealedDek] = await Promise.all([
      requireCryptoSuite(VAULT_XCHACHA20_POLY1305_V1).seal({
        plaintext,
        key: packageDek,
        aad: aad as CanonicalEnvelopeAad,
      }),
      sealKeyToX25519Recipient(packageDek, input.recipientAgentPublicKey, wrapperContext),
    ])
    try {
      const container = new TextEncoder().encode(canonicalJson({
        schema: 'palladin.script-execution-package-ciphertext.v1',
        contractVersion: SCRIPT_EXECUTION_CONTRACT_VERSION,
        packageRevision: transport.packageRevision,
        encodedSealedPackageDek: toBase64Url(sealedDek),
        encodedSuitePayload: toBase64Url(suitePayload),
      }))
      try {
        if (container.length > SCRIPT_EXECUTION_PACKAGE_MAX_BYTES) {
          throw new RangeError('Encoded Script execution package exceeds its transport limit')
        }
        const unsignedPackage = { ...transport, encodedPackageCiphertext: toBase64Url(container) }
        const producerSignature = await signVaultObject(
          SCRIPT_EXECUTION_PACKAGE_SIGNATURE_DOMAIN,
          canonicalObject(unsignedPackage),
          vaultSigningPrivateKey,
        )
        return { ...unsignedPackage, producerSignature }
      } finally {
        wipe(container)
      }
    } finally {
      wipe(suitePayload)
      wipe(sealedDek)
    }
  } finally {
    for (const entry of entries) wipe(entry.encodedMemberSecret)
    if (projectedEntries) {
      for (const entry of projectedEntries) wipe(entry.encodedGrantPayload)
    }
    if (recipientFingerprint) wipe(recipientFingerprint)
    if (vaultSigningPublicKey) wipe(vaultSigningPublicKey)
    if (vaultSigningPrivateKey) wipe(vaultSigningPrivateKey)
    if (vaultSigningFingerprint) wipe(vaultSigningFingerprint)
    if (plaintext) wipe(plaintext)
    if (packageDek) wipe(packageDek)
    if (aad) wipe(aad)
    if (parentDescriptorHash) wipe(parentDescriptorHash)
  }
}

function normalizeReferenceEntries(
  values: readonly ScriptExecutionPackageReferenceInput[],
): ScriptExecutionPackageReferenceInput[] {
  if (values.length > SCRIPT_EXECUTION_REFERENCE_MAX_COUNT) throw new RangeError('Too many Script references')
  const copies: ScriptExecutionPackageReferenceInput[] = []
  try {
    for (const entry of values) {
      uuid.parse(entry.entryId)
      assertPositiveUInt64(entry.entryRevision, 'Reference Entry revision')
      if (Object.prototype.toString.call(entry.encodedMemberSecret) !== '[object Uint8Array]'
        || entry.encodedMemberSecret.length === 0
        || entry.encodedMemberSecret.length > MAX_ENCODED_SUITE_PAYLOAD_BYTES) {
        throw new RangeError('Encoded referenced MemberSecret is invalid')
      }
      copies.push({ ...entry, encodedMemberSecret: new Uint8Array(entry.encodedMemberSecret) })
    }
    return sortedUnique(copies, (entry) => entry.entryId, 'Script package referenced Entries')
  } catch (error) {
    for (const entry of copies) wipe(entry.encodedMemberSecret)
    throw error
  }
}

function projectReferenceEntries(
  manifest: ScriptExecutionManifestV1,
  entries: readonly ScriptExecutionPackageReferenceInput[],
): { entryId: string; entryRevision: string; encodedGrantPayload: Uint8Array }[] {
  const fieldIdsByEntry = new Map<string, Set<string>>()
  for (const reference of manifest.references) {
    const fieldIds = fieldIdsByEntry.get(reference.entryId) ?? new Set<string>()
    fieldIds.add(reference.fieldId)
    fieldIdsByEntry.set(reference.entryId, fieldIds)
  }
  const projected: { entryId: string; entryRevision: string; encodedGrantPayload: Uint8Array }[] = []
  try {
    for (const entry of entries) {
      const fieldIds = fieldIdsByEntry.get(entry.entryId)
      if (!fieldIds) throw new Error('Script package referenced Entries are incomplete')
      const encodedGrantPayload = encodeGrantPayload(projectScriptReferencePayload(
        parseMemberSecret(entry.encodedMemberSecret),
        [...fieldIds].sort(compareUtf8),
      ))
      const projectedFieldIds = parseGrantPayload(encodedGrantPayload).fields.map((field) => field.id)
      if (canonicalJson(projectedFieldIds) !== canonicalJson([...fieldIds].sort(compareUtf8))) {
        wipe(encodedGrantPayload)
        throw new Error('Script package field projection is incomplete or overbroad')
      }
      projected.push({ entryId: entry.entryId, entryRevision: entry.entryRevision, encodedGrantPayload })
    }
    return projected
  } catch (error) {
    for (const entry of projected) wipe(entry.encodedGrantPayload)
    throw error
  }
}

function assertReferenceEntriesMatchManifest(
  manifest: ScriptExecutionManifestV1,
  entries: readonly Pick<ScriptExecutionPackageReferenceInput, 'entryId' | 'entryRevision'>[],
): void {
  const expected = new Map<string, string>()
  for (const reference of manifest.references) {
    const current = expected.get(reference.entryId)
    if (current && current !== reference.entryRevision) {
      throw new Error('A referenced Entry cannot have conflicting revisions')
    }
    expected.set(reference.entryId, reference.entryRevision)
  }
  if (entries.length !== expected.size
    || entries.some((entry) => expected.get(entry.entryId) !== entry.entryRevision)) {
    throw new Error('Script package referenced Entries are incomplete, stale or substituted')
  }
}

async function digestManifest(manifest: ScriptExecutionManifestV1): Promise<string> {
  const domain = new TextEncoder().encode('PLDNSCRIPT1')
  const encoded = new TextEncoder().encode(canonicalJson(manifest))
  const input = new Uint8Array(domain.length + encoded.length)
  input.set(domain)
  input.set(encoded, domain.length)
  try {
    return toBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', input)))
  } finally {
    wipe(domain)
    wipe(encoded)
    wipe(input)
  }
}

async function hashWithDomain(domainValue: string, bytes: Uint8Array): Promise<Uint8Array> {
  const domain = new TextEncoder().encode(domainValue)
  const input = new Uint8Array(domain.length + bytes.length)
  input.set(domain)
  input.set(bytes, domain.length)
  try {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', input))
  } finally {
    wipe(domain)
    wipe(input)
  }
}

function validateParameterDefinitions(definitions: readonly ScriptParameterDefinition[]): void {
  const names = new Set<string>()
  for (const definition of definitions) {
    const folded = definition.name.toLocaleLowerCase('en-US')
    if (names.has(folded) || ['__proto__', 'constructor', 'prototype'].includes(folded)
      || folded.startsWith('palladin_')) {
      throw new Error('Script parameter names must be unique and non-reserved')
    }
    names.add(folded)
    if ('minimum' in definition && 'maximum' in definition
      && definition.minimum !== undefined && definition.maximum !== undefined
      && definition.minimum > definition.maximum) {
      throw new Error('Script parameter minimum exceeds maximum')
    }
    if (definition.type === 'string' && definition.minLength !== undefined
      && definition.maxLength !== undefined && definition.minLength > definition.maxLength) {
      throw new Error('Script parameter minLength exceeds maxLength')
    }
    if (definition.enum && new Set(definition.enum.map(canonicalJson)).size !== definition.enum.length) {
      throw new Error('Script parameter allowed values must be unique')
    }
  }
}

function assertPositiveUInt64(value: string, label: string): void {
  if (!/^[1-9][0-9]*$/.test(value) || BigInt(value) > 0xffffffffffffffffn) {
    throw new RangeError(`${label} must be a positive UInt64`)
  }
}

function sortedUnique<T>(values: readonly T[], key: (value: T) => string, label: string): T[] {
  const sorted = [...values].sort((left, right) => compareUtf8(key(left), key(right)))
  for (let index = 1; index < sorted.length; index += 1) {
    if (key(sorted[index - 1]) === key(sorted[index])) throw new Error(`${label} must be unique`)
  }
  return sorted
}

function referenceKey(reference: z.infer<typeof referenceSchema>): string {
  return `${reference.env}\u0000${reference.entryId}\u0000${reference.fieldId}`
}

function scopeKey(scope: ScriptExecutionPackageScopeV1): string {
  return `${scope.vaultId}\u0000${scope.entryId}\u0000${scope.fieldId}`
}

function compareUtf8(left: string, right: string): number {
  const leftBytes = new TextEncoder().encode(left.normalize('NFC'))
  const rightBytes = new TextEncoder().encode(right.normalize('NFC'))
  const limit = Math.min(leftBytes.length, rightBytes.length)
  for (let index = 0; index < limit; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index]
  }
  return leftBytes.length - rightBytes.length
}

async function normalizeVaultSigningKey(
  value: Uint8Array,
): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  if (!(value instanceof Uint8Array) || (value.length !== 32 && value.length !== 64)) {
    throw new RangeError('Vault signing private key must be a 32-byte seed or 64-byte Ed25519 key')
  }
  const sodium = await loadSodium()
  const seed = new Uint8Array(value.subarray(0, 32))
  try {
    const pair = sodium.crypto_sign_seed_keypair(seed)
    if (value.length === 64 && !sodium.memcmp(pair.privateKey, value)) {
      wipe(pair.publicKey)
      wipe(pair.privateKey)
      throw new Error('Vault signing private key is not canonical')
    }
    const publicKey = new Uint8Array(pair.publicKey)
    const privateKey = new Uint8Array(pair.privateKey)
    wipe(pair.publicKey)
    wipe(pair.privateKey)
    return { publicKey, privateKey }
  } finally {
    wipe(seed)
  }
}

function canonicalObject(value: unknown): CanonicalJson {
  return JSON.parse(canonicalJson(value)) as CanonicalJson
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON requires finite numbers')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new TypeError('Unsupported canonical JSON value')
}
