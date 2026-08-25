import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import { WarningZone } from '../../../shared/components/warning-zone'
import { AGENT_STATUS_ACTIVE, getAgent, useAgents } from '../../agents'
import { useVaults } from '../../vaults/use-vaults'
import { useMemberSyncStore } from '../../../shared/stores/member-sync-store'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  GRANT_TYPE_SCRIPT_EXECUTION,
  type GrantType,
  type OrgGrant,
} from '../api/org-grants-api'
import { useLocalEntrySearch } from '../use-local-entry-search'
import {
  agentsCoveringEntry,
  agentsCoveringScriptExecution,
  agentsCoveringVault,
  entryCoverageByAgent,
  vaultsCoveredByAgent,
} from '../grant-eligibility'
import {
  DEFAULT_GRANT_POLICY_KIND,
  grantPolicyToBody,
  POLICY_ERROR_KEY,
  validateGrantPolicy,
  type GrantPolicyKind,
} from '../grant-policy'
import { useCreateGrant } from '../use-create-grant'
import { useOrgGrants } from '../use-org-grants'
import { DEFAULT_GRANT_METHODS, GRANT_METHOD_EXEC, type GrantMethod } from '../grant-methods'
import { EntityCombobox, type ComboboxOption } from './entity-combobox'
import { GrantPolicyFields } from './grant-policy-fields'
import { GrantMethodsSelect } from './grant-methods-select'
import { ENTRY_TYPE_SCRIPT } from '../../../shared/types/entry-type'
import { useAuthStore } from '../../auth'
import { getCanonicalEntry } from '../../vaults/api/vault-api'
import { getEncryptedVault } from '../../vaults/sync/member-sync-api'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import {
  effectiveReturnResultToAgent,
  normalizeScriptExecutionMetadata,
  type ScriptExecutionMetadataV1,
} from '../../../shared/crypto/script-execution'
import { shortenKey } from '../../../shared/lib/shorten-key'

/**
 * Where the dialog was opened from — drives which subject the user picks and
 * which side of the grant is fixed by context.
 */
export type GrantAccessMode =
  | { kind: 'agent-for-vault'; vaultId: string }
  | { kind: 'agent-for-entry'; vaultId: string; entryId: string }
  | { kind: 'target-for-agent'; agentId: string }

export interface GrantAccessDialogProps {
  mode: GrantAccessMode
  onClose: () => void
}

/** Resolved subject of the grant once the user has picked it. */
interface ResolvedSubject {
  vaultId: string
  agentId: string
  type: GrantType
  entryId?: string
  constraintsUnavailable?: boolean
}

function targetReadiness(
  vaultId: string,
  entryId?: string,
  vaults = useMemberSyncStore.getState().vaults,
): Pick<ResolvedSubject, 'constraintsUnavailable'> {
  if (!entryId) return {}
  const vault = vaults.get(vaultId)
  if (!vault || vault.status !== 'ready') return { constraintsUnavailable: true }
  const entry = vault.entries.get(entryId)
  if (!entry || entry.corrupt || !entry.payload) {
    return { constraintsUnavailable: true }
  }
  return {}
}

function entryGrantType(vaultId: string, entryId: string): GrantType {
  const entry = useMemberSyncStore.getState().vaults.get(vaultId)?.entries.get(entryId)
  return entry?.payload?.entryType === 'script' ? GRANT_TYPE_SCRIPT_EXECUTION : GRANT_TYPE_GRANULAR
}

/**
 * One shared dialog for proactively granting access, reused from three entry
 * points (mode prop). A shared policy segment (Time/Uses/Lifetime) is common to
 * every mode; the swappable "subject" segment picks the agent / vault / entry
 * with backend-driven eligibility (agents/vaults/entries already covered by an
 * active grant are excluded). On confirm it delegates envelope production to
 * `useCreateGrant`; FULL grants resolve authoritative recipient key material
 * immediately before sealing the current Vault key.
 */
export function GrantAccessDialog({ mode, onClose }: GrantAccessDialogProps) {
  const { t } = useTranslation()
  const createGrant = useCreateGrant()

  // Shared policy state.
  const [kind, setKind] = useState<GrantPolicyKind>(DEFAULT_GRANT_POLICY_KIND)
  const [expiresAt, setExpiresAt] = useState('')
  const [queryLimit, setQueryLimit] = useState('')
  const [policyError, setPolicyError] = useState<string | null>(null)
  const [subjectError, setSubjectError] = useState(false)

  // Methods the grant permits. Default to the privacy-preserving set; `get` is opt-in.
  const [methods, setMethods] = useState<GrantMethod[]>(DEFAULT_GRANT_METHODS)
  const [methodsError, setMethodsError] = useState<string | null>(null)
  const [reviewedScriptRevision, setReviewedScriptRevision] = useState<string | null>(null)

  // Subject selection (resolved on confirm).
  const [subject, setSubject] = useState<ResolvedSubject | null>(null)
  const syncedVaults = useMemberSyncStore((state) => state.vaults)
  const currentSubject = subject && ({
    ...subject,
    ...targetReadiness(subject.vaultId, subject.entryId, syncedVaults),
  })
  const effectiveMethods: GrantMethod[] = currentSubject?.type === GRANT_TYPE_SCRIPT_EXECUTION
    ? [GRANT_METHOD_EXEC]
    : methods

  function resetPolicyError() {
    setPolicyError(null)
  }

  async function handleConfirm() {
    if (!currentSubject) {
      setSubjectError(true)
      return
    }
    if (currentSubject.constraintsUnavailable) return
    if (currentSubject.type === GRANT_TYPE_SCRIPT_EXECUTION && !reviewedScriptRevision) return
    const policyInput = { kind, expiresAt, queryLimit }
    const validationError = validateGrantPolicy(policyInput)
    if (validationError) {
      setPolicyError(POLICY_ERROR_KEY[validationError])
      return
    }
    if (effectiveMethods.length === 0) {
      setMethodsError('grants.methods.errorNoneSelected')
      return
    }

    let agentPublicKey: string | null | undefined
    let recipientAgentKeyVersion: number | null | undefined
    let agentAccessEpoch: number | null | undefined
    try {
      const agent = await getAgent(currentSubject.agentId)
      agentPublicKey = agent.publicKey
      recipientAgentKeyVersion = agent.recipientKeyVersion
      agentAccessEpoch = agent.accessEpoch
    } catch {
      toast.error(t('grants.create.error'))
      return
    }

    createGrant.mutate(
      {
        vaultId: currentSubject.vaultId,
        agentId: currentSubject.agentId,
        agentPublicKey,
        recipientAgentKeyVersion,
        agentAccessEpoch,
        type: currentSubject.type,
        entryId: currentSubject.entryId,
        reviewedScriptRevision: reviewedScriptRevision ?? undefined,
        policy: grantPolicyToBody(policyInput),
        methods: effectiveMethods,
      },
      {
        onSuccess: () => {
          toast.success(t('grants.create.success'))
          onClose()
        },
        onError: () => toast.error(t('grants.create.error')),
      },
    )
  }

  return (
    <ModalShell
      onClose={createGrant.isPending ? undefined : onClose}
      ariaLabel={t('grants.create.title')}
      title={t('grants.create.title')}
      width={460}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} disabled={createGrant.isPending} className="flex-1">
            {t('grants.cancel')}
          </Button>
          <Button variant="positive" size="sm" onClick={handleConfirm}
            disabled={createGrant.isPending || currentSubject?.constraintsUnavailable
              || (currentSubject?.type === GRANT_TYPE_SCRIPT_EXECUTION && !reviewedScriptRevision)}
            className="flex-[2]">
            {createGrant.isPending ? t('grants.create.granting') : t('grants.create.confirm')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('grants.create.subtitle')}
        </p>

        {/* Swappable subject segment. Feedback collapses when there is no error. */}
        <div>
          <SubjectSegment
            mode={mode}
            disabled={createGrant.isPending}
            onSubjectChange={(s) => {
              setSubject(s)
              setReviewedScriptRevision(null)
              setSubjectError(false)
            }}
          />
          <FeedbackSlot visible={subjectError} color="red">
            {t('grants.create.subjectRequired')}
          </FeedbackSlot>
          <FeedbackSlot visible={currentSubject?.constraintsUnavailable === true} color="red">
            {t('grants.create.waitForVaultSync')}
          </FeedbackSlot>
        </div>

        {currentSubject?.type === GRANT_TYPE_FULL && (
          <WarningZone title={t('grants.create.fullTrustTitle')}>
            {t('grants.create.fullTrustBody')}
          </WarningZone>
        )}

        {currentSubject?.type === GRANT_TYPE_SCRIPT_EXECUTION && currentSubject.entryId ? (
          <ScriptGrantSummary vaultId={currentSubject.vaultId} scriptEntryId={currentSubject.entryId}
            onStatusChange={setReviewedScriptRevision} />
        ) : null}

        {/* Shared policy segment */}
        <GrantPolicyFields
          idPrefix="create-grant"
          kind={kind}
          expiresAt={expiresAt}
          queryLimit={queryLimit}
          error={policyError}
          disabled={createGrant.isPending}
          onKindChange={(k) => {
            setKind(k)
            resetPolicyError()
          }}
          onExpiresAtChange={(v) => {
            setExpiresAt(v)
            resetPolicyError()
          }}
          onQueryLimitChange={(v) => {
            setQueryLimit(v)
            resetPolicyError()
          }}
        />

        {currentSubject?.type !== GRANT_TYPE_SCRIPT_EXECUTION ? <GrantMethodsSelect
          idPrefix="create-grant"
          value={effectiveMethods}
          disabled={createGrant.isPending}
          error={methodsError}
          onChange={(m) => {
            setMethods(m)
            setMethodsError(null)
          }}
        /> : null}

      </div>
    </ModalShell>
  )
}

// ── subject segments ───────────────────────────────────────────────────────

function SubjectSegment({
  mode,
  disabled,
  onSubjectChange,
}: {
  mode: GrantAccessMode
  disabled: boolean
  onSubjectChange: (subject: ResolvedSubject | null) => void
}) {
  if (mode.kind === 'agent-for-vault') {
    return (
      <AgentPicker
        vaultId={mode.vaultId}
        disabled={disabled}
        onPick={(agentId) =>
          onSubjectChange(
            agentId
              ? { vaultId: mode.vaultId, agentId, type: GRANT_TYPE_FULL,
                  ...targetReadiness(mode.vaultId) }
              : null,
          )
        }
      />
    )
  }
  if (mode.kind === 'agent-for-entry') {
    return (
      <AgentPicker
        vaultId={mode.vaultId}
        entryId={mode.entryId}
        disabled={disabled}
        onPick={(agentId) =>
          onSubjectChange(
            agentId
              ? {
                  vaultId: mode.vaultId,
                  agentId,
                  type: entryGrantType(mode.vaultId, mode.entryId),
                  entryId: mode.entryId,
                  ...targetReadiness(mode.vaultId, mode.entryId),
                }
              : null,
          )
        }
      />
    )
  }
  return (
    <TargetPicker
      agentId={mode.agentId}
      disabled={disabled}
      onPick={onSubjectChange}
    />
  )
}

/** Agent autocomplete excluding agents that already cover the vault/entry. */
function AgentPicker({
  vaultId,
  entryId,
  disabled,
  onPick,
}: {
  vaultId: string
  entryId?: string
  disabled: boolean
  onPick: (agentId: string | null) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const agents = useAgents()
  const vaultGrants = useOrgGrants({ vaultId })

  const covered = useMemo(() => {
    const items = vaultGrants.data?.items ?? []
    if (!entryId) return agentsCoveringVault(items)
    return entryGrantType(vaultId, entryId) === GRANT_TYPE_SCRIPT_EXECUTION
      ? agentsCoveringScriptExecution(items, entryId)
      : agentsCoveringEntry(items, entryId)
  }, [vaultGrants.data, entryId, vaultId])

  const options = useMemo<ComboboxOption[]>(() => {
    const q = query.trim().toLowerCase()
    return (agents.data ?? [])
      .filter((a) => a.status === AGENT_STATUS_ACTIVE && !covered.has(a.agentId))
      .filter((a) => !q || (a.name ?? '').toLowerCase().includes(q))
      .map((a) => ({ id: a.agentId, label: a.name ?? a.agentId }))
  }, [agents.data, covered, query])

  return (
    <EntityCombobox
      label={t('grants.create.agentLabel')}
      placeholder={t('grants.create.agentPlaceholder')}
      query={query}
      onQueryChange={(text) => {
        setQuery(text)
        setSelectedLabel(null)
        onPick(null)
      }}
      options={options}
      selectedLabel={selectedLabel}
      emptyText={t('grants.create.noEligibleAgents')}
      disabled={disabled}
      onSelect={(opt) => {
        setSelectedLabel(opt.label)
        setQuery('')
        onPick(opt.id)
      }}
    />
  )
}

/** Agent→target picker: toggle between Vault (FULL) and Entry (GRANULAR). */
function TargetPicker({
  agentId,
  disabled,
  onPick,
}: {
  agentId: string
  disabled: boolean
  onPick: (subject: ResolvedSubject | null) => void
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState<'vault' | 'entry'>('vault')

  const agentGrants = useOrgGrants({ agentId })

  function switchTarget(next: 'vault' | 'entry') {
    setTarget(next)
    onPick(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inline-flex rounded-lg border border-[var(--cv-input-border)] p-0.5">
        <ToggleButton active={target === 'vault'} onClick={() => switchTarget('vault')}>
          {t('grants.create.targetVault')}
        </ToggleButton>
        <ToggleButton active={target === 'entry'} onClick={() => switchTarget('entry')}>
          {t('grants.create.targetEntry')}
        </ToggleButton>
      </div>

      {target === 'vault' ? (
        <VaultPicker
          agentGrants={agentGrants.data?.items ?? []}
          agentId={agentId}
          disabled={disabled}
          onPick={onPick}
        />
      ) : (
        <CrossVaultEntryPicker
          agentGrants={agentGrants.data?.items ?? []}
          agentId={agentId}
          disabled={disabled}
          onPick={onPick}
        />
      )}
    </div>
  )
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-ui font-semibold transition-colors ${
        active
          ? 'bg-[rgb(var(--cv-primary-rgb)/0.12)] text-[var(--cv-primary)]'
          : 'text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
      }`}
    >
      {children}
    </button>
  )
}

/** Vault autocomplete excluding vaults the agent already has any active grant in. */
function VaultPicker({
  agentGrants,
  agentId,
  disabled,
  onPick,
}: {
  agentGrants: OrgGrant[]
  agentId: string
  disabled: boolean
  onPick: (subject: ResolvedSubject | null) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const vaults = useVaults()
  const covered = useMemo(() => vaultsCoveredByAgent(agentGrants), [agentGrants])

  const options = useMemo<ComboboxOption[]>(() => {
    const q = query.trim().toLowerCase()
    return (vaults.data?.vaults ?? [])
      .filter((v) => !covered.has(v.id))
      .filter((v) => !q || v.name.toLowerCase().includes(q))
      .map((v) => ({ id: v.id, label: v.name }))
  }, [vaults.data, covered, query])

  return (
    <EntityCombobox
      label={t('grants.create.vaultLabel')}
      placeholder={t('grants.create.vaultPlaceholder')}
      query={query}
      onQueryChange={(text) => {
        setQuery(text)
        setSelectedLabel(null)
        onPick(null)
      }}
      options={options}
      selectedLabel={selectedLabel}
      emptyText={t('grants.create.noEligibleVaults')}
      disabled={disabled}
      onSelect={(opt) => {
        setSelectedLabel(opt.label)
        setQuery('')
        onPick({ vaultId: opt.id, agentId, type: GRANT_TYPE_FULL,
          ...targetReadiness(opt.id) })
      }}
    />
  )
}

/** Cross-vault entry search excluding entries the agent already covers. */
function CrossVaultEntryPicker({
  agentGrants,
  agentId,
  disabled,
  onPick,
}: {
  agentGrants: OrgGrant[]
  agentId: string
  disabled: boolean
  onPick: (subject: ResolvedSubject | null) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)

  const trimmed = query.trim()
  const entries = useLocalEntrySearch(trimmed, 20, 'label', trimmed.length >= 2)

  const coverage = useMemo(() => entryCoverageByAgent(agentGrants), [agentGrants])

  const options = useMemo<ComboboxOption[]>(() => {
    return entries
      .filter(
        (e) =>
          !coverage.coveredEntryIds.has(e.id) &&
          !(e.type === ENTRY_TYPE_SCRIPT
            ? coverage.fullExecCoveredVaultIds.has(e.vaultId)
            : coverage.fullCoveredVaultIds.has(e.vaultId)),
      )
      .map((e) => ({ id: e.id, label: e.label, sublabel: e.vaultName }))
  }, [entries, coverage])

  // Track vaultId for the selected entry so we can build the subject.
  const entryCoordinates = useMemo(() => {
    const map = new Map<string, { vaultId: string; type: number }>()
    for (const e of entries) map.set(e.id, { vaultId: e.vaultId, type: e.type })
    return map
  }, [entries])

  return (
    <EntityCombobox
      label={t('grants.create.entryLabel')}
      placeholder={t('grants.create.entryPlaceholder')}
      query={query}
      onQueryChange={(text) => {
        setQuery(text)
        setSelectedLabel(null)
        onPick(null)
      }}
      options={options}
      selectedLabel={selectedLabel}
      loading={false}
      emptyText={
        trimmed.length < 2
          ? t('grants.create.entryHint')
          : t('grants.create.noEligibleEntries')
      }
      disabled={disabled}
      onSelect={(opt) => {
        const coordinates = entryCoordinates.get(opt.id)
        if (!coordinates) return
        const { vaultId, type } = coordinates
        setSelectedLabel(opt.label)
        setQuery('')
        onPick({ vaultId, agentId, type: type === ENTRY_TYPE_SCRIPT
          ? GRANT_TYPE_SCRIPT_EXECUTION
          : GRANT_TYPE_GRANULAR, entryId: opt.id,
          ...targetReadiness(vaultId, opt.id) })
      }}
    />
  )
}

function ScriptGrantSummary({
  vaultId,
  scriptEntryId,
  onStatusChange,
}: {
  vaultId: string
  scriptEntryId: string
  onStatusChange: (reviewedRevision: string | null) => void
}) {
  const { t } = useTranslation()
  const [metadata, setMetadata] = useState<ScriptExecutionMetadataV1 | null>(null)
  const [references, setReferences] = useState<Array<{ env: string; entryId: string; fieldId: string }>>([])
  const [unavailable, setUnavailable] = useState(() => !useAuthStore.getState().privateKey)

  useEffect(() => {
    let active = true
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      onStatusChange(null)
      return
    }
    void (async () => {
      let vaultKey: Uint8Array | undefined
      try {
        const [vault, detail] = await Promise.all([
          getEncryptedVault(vaultId),
          getCanonicalEntry(vaultId, scriptEntryId),
        ])
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
        const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId,
          vaultId,
          entryId: scriptEntryId,
          revision: detail.currentRevision,
        })
        if (!active || useAuthStore.getState().privateKey !== privateKey) return
        if (secret.entryType !== 'script') {
          setUnavailable(true)
          onStatusChange(null)
          return
        }
        setMetadata(normalizeScriptExecutionMetadata(secret.content.execution, secret.description))
        setReferences(secret.content.refs.map(({ env, entryId, fieldId }) => ({ env, entryId, fieldId })))
        onStatusChange(detail.currentRevision)
      } catch {
        if (active) {
          setUnavailable(true)
          onStatusChange(null)
        }
      } finally {
        if (vaultKey) wipe(vaultKey)
      }
    })()
    return () => { active = false }
  }, [onStatusChange, scriptEntryId, vaultId])

  if (unavailable) {
    return <WarningZone title={t('grants.create.scriptUnavailableTitle')}>
      {t('grants.create.scriptUnavailableBody')}
    </WarningZone>
  }
  if (!metadata) return <p className="text-meta text-[var(--cv-t3)]">{t('grants.create.scriptLoading')}</p>
  return (
    <div className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3">
      <p className="text-ui font-semibold text-[var(--cv-t1)]">{metadata.description}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-meta text-[var(--cv-t2)]">
        <div><dt>{t('grants.create.scriptParameters')}</dt><dd>{metadata.parameters.length}</dd></div>
        <div><dt>{t('grants.create.scriptReferences')}</dt><dd>{references.length}</dd></div>
        <div className="col-span-2"><dt>{t('grants.create.scriptResult')}</dt><dd>
          {t(effectiveReturnResultToAgent(metadata)
            ? 'grants.create.scriptResultReturned'
            : 'grants.create.scriptResultWithheld')}
        </dd></div>
      </dl>
      {references.length > 0 ? (
        <div className="mt-3">
          <p className="text-meta font-semibold text-[var(--cv-t1)]">
            {t('grants.create.scriptReferenceDetails')}
          </p>
          <ul className="mt-1 space-y-1 text-meta text-[var(--cv-t2)]">
            {references.map((reference) => (
              <li key={`${reference.env}:${reference.entryId}:${reference.fieldId}`} className="font-mono">
                ${reference.env} ← {shortenKey(reference.entryId)} · {reference.fieldId}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {effectiveReturnResultToAgent(metadata) ? (
        <p className="mt-2 text-meta text-[var(--cv-pending)]">
          {t('grants.create.scriptResultTrust')}
        </p>
      ) : null}
    </div>
  )
}
