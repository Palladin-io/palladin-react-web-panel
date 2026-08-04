import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FieldFeedback } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import { AGENT_STATUS_ACTIVE, getAgent, useAgents } from '../../agents'
import { useVaults } from '../../vaults/use-vaults'
import { ENTRY_TYPE_CREDIT_CARD, normalizeEntryType } from '../../vaults/types'
import { useMemberSyncStore } from '../../vaults/sync/member-sync-store'
import {
  GRANT_TYPE_FULL,
  GRANT_TYPE_GRANULAR,
  type GrantType,
  type OrgGrant,
} from '../api/org-grants-api'
import { useLocalEntrySearch } from '../use-local-entry-search'
import {
  agentsCoveringEntry,
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
import { DEFAULT_GRANT_METHODS, type GrantMethod } from '../grant-methods'
import { EntityCombobox, type ComboboxOption } from './entity-combobox'
import { GrantPolicyFields } from './grant-policy-fields'
import { GrantMethodsSelect } from './grant-methods-select'

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
  injectOnly?: boolean
}

function isInjectOnlyTarget(vaultId: string, entryId?: string): boolean {
  const vault = useMemberSyncStore.getState().vaults.get(vaultId)
  if (!vault || vault.status !== 'ready') return false
  const entries = entryId ? [vault.entries.get(entryId)] : [...vault.entries.values()]
  return entries.some((entry) => entry?.payload
    && normalizeEntryType(entry.payload.entryType) === ENTRY_TYPE_CREDIT_CARD)
}

/**
 * One shared dialog for proactively granting access, reused from three entry
 * points (mode prop). A shared policy segment (Time/Uses/Lifetime) is common to
 * every mode; the swappable "subject" segment picks the agent / vault / entry
 * with backend-driven eligibility (agents/vaults/entries already covered by an
 * active grant are excluded). On confirm it resolves the agent's full public
 * key and delegates envelope production to `useCreateGrant`.
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

  // Subject selection (resolved on confirm).
  const [subject, setSubject] = useState<ResolvedSubject | null>(null)

  function resetPolicyError() {
    setPolicyError(null)
  }

  async function handleConfirm() {
    if (!subject) {
      setSubjectError(true)
      return
    }
    const policyInput = { kind, expiresAt, queryLimit }
    const validationError = validateGrantPolicy(policyInput)
    if (validationError) {
      setPolicyError(POLICY_ERROR_KEY[validationError])
      return
    }
    if (methods.length === 0) {
      setMethodsError('grants.methods.errorNoneSelected')
      return
    }

    // The agent's full public key only comes from the single-agent endpoint.
    let agentPublicKey: string | null | undefined
    let recipientAgentKeyVersion: number | null | undefined
    try {
      const agent = await getAgent(subject.agentId)
      agentPublicKey = agent.publicKey
      recipientAgentKeyVersion = agent.recipientKeyVersion
    } catch {
      toast.error(t('grants.create.error'))
      return
    }

    createGrant.mutate(
      {
        vaultId: subject.vaultId,
        agentId: subject.agentId,
        agentPublicKey,
        recipientAgentKeyVersion,
        type: subject.type,
        entryId: subject.entryId,
        policy: grantPolicyToBody(policyInput),
        methods,
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
          <Button variant="positive" size="sm" onClick={handleConfirm} disabled={createGrant.isPending} className="flex-[2]">
            {createGrant.isPending ? t('grants.create.granting') : t('grants.create.confirm')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('grants.create.subtitle')}
        </p>

        {/* Swappable subject segment. -mb-4 absorbs the fixed-height (16px)
            FieldFeedback row so the gap to the policy segment matches the rest. */}
        <div className="-mb-4">
          <SubjectSegment
            mode={mode}
            disabled={createGrant.isPending}
            onSubjectChange={(s) => {
              setSubject(s)
              if (s?.injectOnly) setMethods(['inject'])
              setSubjectError(false)
            }}
          />
          <FieldFeedback visible={subjectError} color="red">
            {t('grants.create.subjectRequired')}
          </FieldFeedback>
        </div>

        {/* Shared policy segment */}
        <GrantPolicyFields
          idPrefix="create-grant"
          kind={kind}
          expiresAt={expiresAt}
          queryLimit={queryLimit}
          error={policyError}
          disabled={createGrant.isPending || subject?.injectOnly === true}
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

        <GrantMethodsSelect
          idPrefix="create-grant"
          value={methods}
          disabled={createGrant.isPending}
          error={methodsError}
          onChange={(m) => {
            setMethods(m)
            setMethodsError(null)
          }}
        />

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
                  injectOnly: isInjectOnlyTarget(mode.vaultId) }
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
                  type: GRANT_TYPE_GRANULAR,
                  entryId: mode.entryId,
                  injectOnly: isInjectOnlyTarget(mode.vaultId, mode.entryId),
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
    return entryId ? agentsCoveringEntry(items, entryId) : agentsCoveringVault(items)
  }, [vaultGrants.data, entryId])

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
          injectOnly: isInjectOnlyTarget(opt.id) })
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
          !coverage.fullCoveredVaultIds.has(e.vaultId),
      )
      .map((e) => ({ id: e.id, label: e.label, sublabel: e.vaultName }))
  }, [entries, coverage])

  // Track vaultId for the selected entry so we can build the subject.
  const entryVaultId = useMemo(() => {
    const map = new Map<string, string>()
    for (const e of entries) map.set(e.id, e.vaultId)
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
        const vaultId = entryVaultId.get(opt.id)
        if (!vaultId) return
        setSelectedLabel(opt.label)
        setQuery('')
        onPick({ vaultId, agentId, type: GRANT_TYPE_GRANULAR, entryId: opt.id,
          injectOnly: isInjectOnlyTarget(vaultId, opt.id) })
      }}
    />
  )
}
