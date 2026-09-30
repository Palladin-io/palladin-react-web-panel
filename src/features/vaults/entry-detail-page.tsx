import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { DetailTabBar } from '../../shared/components/detail-tab-bar'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { FeedbackSlot, FormInput } from '../../shared/components/form-field'
import { NotesField } from './components/notes-field'
import { SecretInput } from '../../shared/components/secret-input'
import { firstError, required, validUrl } from '../../shared/lib/validation'
import { presentationIconReference } from '../../shared/crypto/vault-plaintext'
import {
  ENTRY_FIELD,
  fromMemberSecret,
  withNewCredentialTotpPolicy,
  type AgentVisibilityPolicy,
  type MemberSecretView,
} from '../../shared/crypto/entry-draft'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { analytics } from '../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE, PERMISSION_VAULT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import { useAgentNames } from '../agents'
import {
  GRANT_STATUS_ACTIVE,
  GrantAccessDialog,
  useOrgGrants,
} from '../grants'
import { EntryIconButton } from './components/entry-icon-button'
import { EntryAgentsTab } from './components/entry-agents-tab'
import { EntryLogsTab } from './components/entry-logs-tab'
import { EntryHistoryTab } from './components/entry-history-tab'
import { EntrySharingTab } from './sharing/entry-sharing-tab'
import { EntryShareAction } from './sharing/entry-share-action'
import {
  ENTRY_ICON_COLORS,
  extractDomain,
  openExternalUrl,
} from './components/entry-presentation'
import { ModalShell } from '../../shared/components/modal-shell'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { WarningZone } from '../../shared/components/warning-zone'
import { VaultDetailHeader } from './components/vault-detail-header'
import { VaultEntriesPanel } from './components/vault-entries-panel'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  SCRIPT_INTERPRETERS,
  type CustomField,
  type TotpParams,
  type EntryDetail,
  type EntryPlaintext,
  type ScriptInterpreter,
  type ScriptRef,
  type Vault,
} from './types'
import {
  DEFAULT_TOTP_LABEL,
  foldCustomFields,
  foldScriptRefs,
  mergeCredentialTotp,
  newFieldId,
  plaintextsEqual,
  readCustomFields,
  splitCredentialTotp,
  validateCustomFields,
} from './entry-blob'
import { formatOtpauthUri, parseOtpauthUri } from '../../shared/crypto/totp'
import { CustomFieldsEditor } from './components/custom-fields-editor'
import { CredentialTotpField } from './components/credential-totp-field'
import { ScriptEditor } from './components/script-editor'
import { ScriptExecHint } from './components/script-exec-hint'
import { ScriptRefsEditor } from './components/script-refs-editor'
import {
  buildScriptParameterDefinitions,
  scriptParameterDrafts,
  validateScriptParameterDrafts,
  type ScriptParameterDraft,
} from './script-parameters'
import { validateScriptRefs } from './script-refs'
import { ScriptParametersEditor } from './components/script-parameters-editor'
import { ScriptResultToggle } from './components/script-result-toggle'
import { SectionHeader } from './components/section-header'
import { discoveryAction } from './components/discovery-toggle'
import { useDeleteEntry } from './use-delete-entry'
import {
  getScriptAccessImpact,
  type CanonicalEntryDetail,
  type ScriptAccessImpact,
} from './api/vault-api'
import { useCanonicalEntryDetail } from './use-entries'
import { useUpdateCanonicalEntry } from './use-update-canonical-entry'
import { useRepairMissingWebsiteIcons } from './use-repair-missing-website-icons'
import { useVault } from './use-vault'
import {
  isCurrentMemberEntryStructuralHeadMismatchError,
  openCurrentMemberEntrySecret,
} from './sync/current-member-entry-reader'
import { useMemberSyncStore, type MemberIndexRecord } from './sync/member-sync-store'
import { shortenKey } from '../../shared/lib/shorten-key'
import { GlobalEntriesPanel } from './global-entries-page'

export interface EntryDetailPageProps {
  vaultId: string
  entryId: string
  initialTab?: EntryDetailTab
  fromEntries?: boolean
}

type EntryDetailTab = 'details' | 'agents' | 'history' | 'logs' | 'sharing'

/**
 * Full entry detail screen — opened from the `arrow_forward` action on
 * a row. Hosts the Details / Agents / Logs tab strip; only Details is
 * implemented for now (Agents and Logs render empty-state cards until
 * their dedicated subtasks land).
 *
 * Decrypts the encrypted blob on demand when the user reveals a secret
 * field, using the same unseal-then-decrypt pattern as `EntryRow`. The
 * plaintext is cached locally for the lifetime of the page so toggling
 * visibility doesn't re-decrypt; refreshing or closing the tab wipes it
 * because all crypto state lives in memory only.
 */
export function EntryDetailPage({ vaultId, entryId, initialTab = 'details', fromEntries = false }: EntryDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const memberEntry = useMemberSyncStore((store) => store.vaults.get(vaultId)?.entries.get(entryId))
  const [activeTab, setActiveTab] = useState<EntryDetailTab>(initialTab)
  const canonicalNeeded = activeTab === 'agents' || activeTab === 'history'
  const canonical = useCanonicalEntryDetail(vaultId, entryId, canonicalNeeded)
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const isWide = useWideScreen()

  const handleBack = () => fromEntries ? navigate({ to: '/entries' }) : navigate({ to: '/vaults/$vaultId', params: { vaultId } })
  const onDeleted = handleBack

  const loadCanonical = useCallback(async (): Promise<CanonicalEntryDetail> => {
    const result = await canonical.refetch()
    if (!result.data) throw new Error('Current Entry detail is unavailable')
    if (!memberEntry || result.data.currentRevision !== memberEntry.currentRevision
      || result.data.currentKeyVersion !== memberEntry.currentKeyVersion) {
      useMemberSyncStore.getState().retry()
      throw new Error('Current Entry detail changed after Member sync')
    }
    return result.data
  }, [canonical, memberEntry])

  const detailContent = vault.isPending || (!memberEntry && useMemberSyncStore.getState().status === 'syncing') ? (
    <PageSkeleton />
  ) : vault.isError || !vault.data ? (
    <ErrorState message={t('vault.errorLoad')} onRetry={vault.refetch} />
  ) : !memberEntry || memberEntry.corrupt || !memberEntry.payload ? (
    <ErrorState
      message={t('vault.entry.detail.loadError')}
      onRetry={async () => { useMemberSyncStore.getState().retry() }}
    />
  ) : (
    <>
      <DetailBody
        vault={vault.data}
        entry={toEntryView(memberEntry)}
        canonical={canonical.data ?? null}
        canonicalPending={canonical.isPending}
        canonicalError={canonical.isError}
        loadCanonical={loadCanonical}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onBack={handleBack}
        onDeleted={onDeleted}
        onAddAgent={() => setAddAgentOpen(true)}
        hideHeader={isWide}
      />
      {addAgentOpen && (
        <GrantAccessDialog
          mode={{ kind: 'agent-for-entry', vaultId, entryId }}
          onClose={() => setAddAgentOpen(false)}
        />
      )}
    </>
  )

  if (isWide) {
    return (
      <div className="flex h-full overflow-hidden text-[var(--cv-t1)]">
        <div className="w-[clamp(18.75rem,22vw,25rem)] shrink-0 overflow-hidden border-r border-[var(--cv-border)]">
          <div className={fromEntries ? 'h-full' : 'h-full px-4 pt-4'}>
            {fromEntries ? <GlobalEntriesPanel selectedEntryId={entryId} selectedVaultId={vaultId} /> : vault.data ? (
              <VaultEntriesPanel vault={vault.data} selectedEntryId={entryId} />
            ) : (
              <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
            )}
          </div>
        </div>
        <div className={activeTab === 'sharing' ? 'min-w-0 flex-1 overflow-hidden' : 'subtle-scrollbar min-w-0 flex-1 overflow-y-auto [overflow-anchor:none]'}>
          <div className={activeTab === 'sharing' ? 'h-full min-h-0 px-4 py-4' : 'px-4 py-4'}>{detailContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className={activeTab === 'sharing' ? 'h-full min-h-0 overflow-hidden text-[var(--cv-t1)]' : 'min-h-screen text-[var(--cv-t1)]'}>
      <div className={activeTab === 'sharing' ? 'h-full min-h-0 px-4 py-4' : 'px-6 py-8'}>{detailContent}</div>
    </div>
  )
}

interface CurrentEntryView extends EntryDetail {
  currentRevision: string
  currentKeyVersion: number
}

function toEntryView(record: MemberIndexRecord): CurrentEntryView {
  const index = record.payload!
  const iconReference = presentationIconReference(index?.icon ?? null)
  const entryType = index?.entryType === 'key'
    ? ENTRY_TYPE_KEY
    : index?.entryType === 'script' ? ENTRY_TYPE_SCRIPT
      : index?.entryType === 'creditCard' ? ENTRY_TYPE_CREDIT_CARD : ENTRY_TYPE_CREDENTIAL
  return {
    id: record.entryId,
    label: index.memberLabel,
    type: entryType,
    ...(iconReference ? { icon: iconReference } : {}),
    ...(index.description ? { description: index.description } : {}),
    ...(index.color ? { color: index.color } : {}),
    createdAt: record.updatedAt,
    updatedAt: record.updatedAt,
    accessCount: 0,
    username: index.username ?? undefined,
    urlDomain: index.urlDomain ?? undefined,
    content: { encryptedBlob: '', nonce: '' },
    currentRevision: record.currentRevision,
    currentKeyVersion: record.currentKeyVersion,
  }
}

function PageSkeleton() {
  return (
    <>
      <div className="mb-4 h-12 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
      <div className="h-64 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
    </>
  )
}

interface DetailBodyProps {
  vault: Vault
  entry: CurrentEntryView
  canonical: CanonicalEntryDetail | null
  canonicalPending: boolean
  canonicalError: boolean
  loadCanonical: () => Promise<CanonicalEntryDetail>
  activeTab: EntryDetailTab
  onTabChange: (next: EntryDetailTab) => void
  /** Omitted in split-view (wide screens) to hide the back arrow. */
  onBack?: () => void
  onDeleted: () => void
  onAddAgent: () => void
  hideHeader?: boolean
}

function DetailBody({
  vault,
  entry,
  canonical,
  canonicalPending,
  canonicalError,
  loadCanonical,
  activeTab,
  onTabChange,
  onBack,
  onDeleted,
  onAddAgent,
  hideHeader = false,
}: DetailBodyProps) {
  const { t } = useTranslation()

  // Active-agent count for the header. Reuses the same (deduped) org-grants query
  // the embedded Agents-tab panel runs, gated on GrantManage so users without it
  // never trigger a 403; the count falls back to 0 until/unless it loads.
  const permissions = useAuthStore((s) => s.permissions)
  const canManageGrants = (permissions & PERMISSION_GRANT_MANAGE) !== 0
  const grants = useOrgGrants({ entryId: entry.id }, canManageGrants)
  const agentCount = useMemo(() => {
    const ids = new Set<string>()
    for (const g of grants.data?.items ?? []) {
      if (g.status === GRANT_STATUS_ACTIVE && g.agentId) ids.add(g.agentId)
    }
    return ids.size
  }, [grants.data])

  const subtitle = [
    t('vault.entry.detail.subtitleAgents', { count: agentCount }),
    t('vault.entry.detail.subtitleLogs', { count: entry.accessCount }),
  ].join(' · ')

  const handleTabChange = (next: EntryDetailTab) => {
    if (next !== activeTab) {
      analytics.capture('entry', 'detail-tab-switched', {
        type: entry.type === ENTRY_TYPE_KEY
          ? 'key'
          : entry.type === ENTRY_TYPE_SCRIPT
            ? 'script'
            : entry.type === ENTRY_TYPE_CREDIT_CARD
              ? 'credit-card'
              : 'credential',
        tab: next,
      })
    }
    onTabChange(next)
  }

  const agentAction = entry.type === ENTRY_TYPE_CREDIT_CARD ? null : (
    <div className="flex items-center gap-2">
      <span className="text-meta text-[var(--cv-t3)]">
        {t('vault.entry.detail.agentsWithAccess', { count: agentCount })}
      </span>
      <Button variant="accent" size="sm" icon="add" onClick={onAddAgent}>
        {t('vault.detail.addAgent')}
      </Button>
    </div>
  )

  const sharingScope = {
    organizationId: vault.organizationId, vaultId: vault.id, entryId: entry.id,
    revision: entry.currentRevision, keyVersion: entry.currentKeyVersion,
  }
  const tabAction = activeTab === 'agents' ? agentAction
    : activeTab === 'sharing' ? <EntryShareAction scope={sharingScope} />
      : activeTab === 'details' ? <EntryShareAction scope={sharingScope} iconOnly /> : undefined

  return (
    <div className={activeTab === 'sharing' ? 'flex h-full min-h-0 flex-col' : undefined}>
      <div className="shrink-0">
        {!hideHeader && (
          <VaultDetailHeader
            title={entry.label}
            subtitle={subtitle}
            onBack={onBack}
          />
        )}
        <EntryDetailTabs
          active={activeTab}
          onChange={handleTabChange}
          wide={hideHeader}
          actions={tabAction}
        />
      </div>
      {activeTab === 'details' ? (
        <DetailsTab
          key={`${entry.id}:${entry.currentRevision}`}
          vault={vault}
          entry={entry}
          loadCanonical={loadCanonical}
          onDeleted={onDeleted}
        />
      ) : null}
      {activeTab === 'agents' && canonical ? (
        <EntryAgentsTab
          key={`${entry.id}:${canonical.currentRevision}`}
          vaultId={vault.id}
          entryId={entry.id}
          entryType={entry.type}
          memberLabel={entry.label}
          detail={canonical}
        />
      ) : null}
      {activeTab === 'logs' ? (
        <EntryLogsTab vaultId={vault.id} entryId={entry.id} entryName={entry.label} />
      ) : null}
      {activeTab === 'sharing' ? <EntrySharingTab scope={sharingScope} /> : null}
      {activeTab === 'history' && canonical ? (
        <EntryHistoryTab detail={canonical} />
      ) : null}
      {(activeTab === 'agents' || activeTab === 'history') && !canonical && canonicalPending ? <PageSkeleton /> : null}
      {(activeTab === 'agents' || activeTab === 'history') && !canonical && canonicalError ? (
        <ErrorState message={t('vault.entry.detail.loadError')} onRetry={loadCanonical} />
      ) : null}
    </div>
  )
}

interface EntryDetailTabsProps {
  active: EntryDetailTab
  onChange: (next: EntryDetailTab) => void
  wide?: boolean
  actions?: ReactNode
}

function EntryDetailTabs({ active, onChange, wide, actions }: EntryDetailTabsProps) {
  const { t } = useTranslation()
  const tabs: { id: EntryDetailTab; label: string }[] = [
    { id: 'details', label: t('vault.entry.detail.detailsTab') },
    { id: 'sharing', label: t('sharing.tab') },
    { id: 'agents', label: t('vault.entry.detail.agentsTab') },
    { id: 'history', label: t('vault.entry.detail.historyTab') },
    { id: 'logs', label: t('vault.entry.detail.logsTab') },
  ]

  return (
    <DetailTabBar
      tabs={tabs}
      active={active}
      onChange={onChange}
      ariaLabel={t('vault.entry.detail.tabsLabel')}
      wide={wide}
      actions={actions}
    />
  )
}

// ---------------------------------------------------------------------------
// Details tab
// ---------------------------------------------------------------------------

interface DetailsTabProps {
  vault: Vault
  entry: CurrentEntryView
  loadCanonical: () => Promise<CanonicalEntryDetail>
  onDeleted: () => void
}

function DetailsTab({ vault, entry, loadCanonical, onDeleted }: DetailsTabProps) {
  const { t } = useTranslation()
  const permissions = useAuthStore((state) => state.permissions)
  const update = useUpdateCanonicalEntry(vault.id, entry.id)
  const remove = useDeleteEntry(vault.id)
  const repairIcon = useRepairMissingWebsiteIcons(vault.id, entry.id)

  // Editable metadata — initialise from server values, reset to the
  // current server values on Discard.
  const [label, setLabel] = useState(entry.label)
  const [description, setDescription] = useState(entry.description ?? '')
  const [descriptionError, setDescriptionError] = useState(false)
  const [icon, setIcon] = useState<string | undefined>(entry.icon)
  const [color, setColor] = useState<string>(
    entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))
  )
  const [url, setUrl] = useState(
    entry.type === ENTRY_TYPE_KEY
      ? (entry.urlDomain ? `https://${entry.urlDomain}` : '')
      : ''
  )
  const [urlError, setUrlError] = useState(false)
  const [labelError, setLabelError] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  // Encrypted field state — populated after decrypt.
  const [secretValue, setSecretValue] = useState('') // KEY only
  const [secretValueError, setSecretValueError] = useState(false)
  const [username, setUsername] = useState('') // CREDENTIAL only
  const [usernameError, setUsernameError] = useState(false)
  const [password, setPassword] = useState('') // CREDENTIAL only
  const [passwordError, setPasswordError] = useState(false)
  const [cardholderName, setCardholderName] = useState('')
  const [cardholderNameError, setCardholderNameError] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cvv, setCvv] = useState('')
  const [cvvShown, setCvvShown] = useState(false)
  const [cvvError, setCvvError] = useState(false)
  const [cardNumberError, setCardNumberError] = useState(false)
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryMonthError, setExpiryMonthError] = useState(false)
  const [expiryYear, setExpiryYear] = useState('')
  const [expiryYearError, setExpiryYearError] = useState(false)
  const [billingAddress, setBillingAddress] = useState('')
  const [notes, setNotes] = useState('') // both types

  // Original plaintext for change detection / discard.
  const [originalPlaintext, setOriginalPlaintext] = useState<EntryPlaintext | null>(null)
  const [originalSecret, setOriginalSecret] = useState<MemberSecretView | null>(null)
  const [policy, setPolicy] = useState<AgentVisibilityPolicy | null>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)

  // Custom fields + script state (populated after decrypt).
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [credentialTotp, setCredentialTotp] = useState<CustomField | null>(null) // CREDENTIAL only
  const [script, setScript] = useState('') // SCRIPT only
  const [scriptError, setScriptError] = useState(false)
  const [interpreter, setInterpreter] = useState<ScriptInterpreter>('bash')
  const [refs, setRefs] = useState<ScriptRef[]>([])
  const [scriptParameters, setScriptParameters] = useState<ScriptParameterDraft[]>([])
  const [returnResultToAgent, setReturnResultToAgent] = useState(false)
  const [scriptImpact, setScriptImpact] = useState<ScriptAccessImpact | null>(null)
  const [pendingScriptSave, setPendingScriptSave] = useState<EntryPlaintext | null>(null)
  const [mutationDetail, setMutationDetail] = useState<CanonicalEntryDetail | null>(null)
  const [scriptChangeKinds, setScriptChangeKinds] = useState<string[]>([])

  // Reveal toggles.
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const mounted = useRef(true)
  const decryptedHead = useRef<string | null>(null)
  const currentHead = JSON.stringify([
    vault.id, entry.id, entry.currentRevision, entry.currentKeyVersion, entry.urlDomain,
  ])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  // Opening the detail screen is already an explicit user action. Decrypt the
  // selected Entry immediately in memory; individual secret inputs remain
  // masked until their own visibility toggle is used.
  const handleDecrypt = useCallback(async () => {
    setDecryptError(null)
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      setDecryptError(t('vault.entry.detail.decryptLocked'))
      return
    }
    const sessionGeneration = useAuthStore.getState().cryptoSessionGeneration
    const userId = useAuthStore.getState().userId
    const sessionChanged = () => {
      const currentAuth = useAuthStore.getState()
      return currentAuth.privateKey !== privateKey
        || currentAuth.cryptoSessionGeneration !== sessionGeneration
        || !mounted.current
    }
    setDecrypting(true)
    try {
      if (!userId) throw new Error('Authenticated Member is unavailable')
      const secret = fromMemberSecret(await openCurrentMemberEntrySecret({
        userId,
        vaultId: vault.id,
        entryId: entry.id,
        expectedRevision: entry.currentRevision,
        expectedKeyVersion: entry.currentKeyVersion,
        memberPrivateKey: privateKey,
      }))
      if (sessionChanged()) return
      const pt = secret.content
      setOriginalSecret(secret)
      setPolicy(secret.agentVisibilityPolicy)
      setLabel(secret.memberLabel)
      setDescription(secret.description ?? '')
      setIcon(secret.iconReference?.startsWith('builtin:')
        ? secret.iconReference.slice(8)
        : secret.iconReference)
      if (pt.type === ENTRY_TYPE_KEY) {
        setOriginalPlaintext(pt); setCustomFields(readCustomFields(pt)); setSecretValue(pt.value)
        setUrl(pt.url ?? ''); setNotes(pt.notes ?? '')
      } else if (pt.type === ENTRY_TYPE_SCRIPT) {
        setOriginalPlaintext(pt); setCustomFields(readCustomFields(pt)); setScript(pt.script)
        setInterpreter(pt.interpreter); setRefs(pt.refs ?? []); setNotes(pt.notes ?? '')
        setDescription(pt.execution?.description ?? secret.description ?? '')
        setScriptParameters(scriptParameterDrafts(pt.execution?.parameters))
        setReturnResultToAgent(pt.execution?.returnResultToAgent === true)
      } else if (pt.type === ENTRY_TYPE_CREDENTIAL) {
        const { pinned, rest, baseline } = pinCredentialTotp(pt)
        setOriginalPlaintext(baseline); setCredentialTotp(pinned); setCustomFields(rest)
        setUsername(pt.username); setPassword(pt.password)
        setUrl(pt.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : '')); setNotes(pt.notes ?? '')
      } else if (pt.type === ENTRY_TYPE_CREDIT_CARD) {
        setOriginalPlaintext(pt); setCustomFields(readCustomFields(pt))
        setCardholderName(pt.cardholderName); setCardNumber(pt.cardNumber); setCvv(pt.cvv ?? ''); setCvvShown(false)
        setExpiryMonth(pt.expiryMonth); setExpiryYear(pt.expiryYear)
        setBillingAddress(pt.billingAddress ?? ''); setNotes(pt.notes ?? '')
      }
      decryptedHead.current = currentHead
    } catch (error: unknown) {
      // Locking the Vault or leaving the page invalidates this in-flight
      // plaintext operation. It says nothing about the cached ciphertext, so
      // do not purge an otherwise valid sync generation as corruption.
      if (sessionChanged()) return
      const structuralHeadChanged = isCurrentMemberEntryStructuralHeadMismatchError(error)
      if (mounted.current) {
        setDecryptError(t(structuralHeadChanged
          ? 'vault.entry.detail.decryptChanged'
          : 'vault.entry.detail.decryptRepairing'))
      }
    } finally {
      if (mounted.current) setDecrypting(false)
    }
  }, [entry.id, entry.currentRevision, entry.currentKeyVersion, entry.urlDomain, t, vault.id, currentHead])

  useEffect(() => {
    // Preserve edits once this head was opened successfully. A new sync item
    // may repair a failed decrypt without changing its revision or key version.
    if (decryptedHead.current === currentHead) return
    void handleDecrypt()
  }, [entry, currentHead, handleDecrypt])

  const saveInFlight = useRef(false)
  const [preparingSave, setPreparingSave] = useState(false)
  const isSaving = update.isPending || preparingSave || repairIcon.isPending
  const isRemoving = remove.isPending

  const defaultColor =
    entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))

  // Rebuild the plaintext from the current form state, preserving un-edited
  // well-known fields (e.g. a credential's stored `totp`) that this UI doesn't
  // expose. Used for both change detection and re-encryption on save.
  const currentPlaintext = useCallback((totp = credentialTotp): EntryPlaintext | null => {
    if (!originalPlaintext) return null
    return buildCurrentPlaintext(originalPlaintext, entry, {
      secretValue,
      username,
      password,
      notes,
      url,
      script,
      interpreter,
      refs,
      executionDescription: description,
      scriptParameters,
      returnResultToAgent,
      customFields,
      credentialTotp: totp,
      cardholderName, cardNumber, cvv, expiryMonth, expiryYear, billingAddress,
    })
  }, [
    originalPlaintext,
    entry,
    secretValue,
    username,
    password,
    notes,
    url,
    script,
    interpreter,
    refs,
    description,
    scriptParameters,
    returnResultToAgent,
    customFields,
    credentialTotp,
    cardholderName, cardNumber, cvv, expiryMonth, expiryYear, billingAddress,
  ])

  // Merged field set for a credential (pinned 2FA + additional) — the shape
  // validated and folded to the blob. KEY/SCRIPT have no pinned 2FA.
  const mergedFields =
    entry.type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(credentialTotp, customFields)
      : customFields
  const nativeTotp = originalPlaintext?.type === ENTRY_TYPE_CREDENTIAL
    && !!originalPlaintext.totp && parseOtpauthUri(originalPlaintext.totp) !== null
  const totpPolicyId = credentialTotp ? nativeTotp ? ENTRY_FIELD.totp : `custom:${credentialTotp.id}` : null
  const existingTotp = nativeTotp || originalSecret?.content.fields?.some((field) => field.id === credentialTotp?.id)
  const totpAccess = totpPolicyId ? policy?.fields[totpPolicyId] ?? (existingTotp ? 'never' : 'onGrantDerived') : 'never'
  const fieldsInvalid = validateCustomFields(mergedFields).hasError
  const scriptContractInvalid = entry.type === ENTRY_TYPE_SCRIPT
    && (!description.trim() || validateScriptParameterDrafts(scriptParameters) !== null
      || !validateScriptRefs(refs, vault.id))

  const contentChanged = useMemo(() => {
    const current = currentPlaintext()
    return current !== null && originalPlaintext !== null && !plaintextsEqual(current, originalPlaintext)
  }, [currentPlaintext, originalPlaintext])

  const metadataChanged = useMemo(() => {
    const originalLabel = originalSecret?.memberLabel ?? entry.label
    const originalDescription = originalSecret?.description
    const originalIcon = originalSecret?.iconReference?.startsWith('builtin:')
      ? originalSecret.iconReference.slice(8)
      : originalSecret?.iconReference ?? entry.icon
    if (label.trim() !== originalLabel) return true
    if ((description.trim() || undefined) !== originalDescription) return true
    if (icon !== originalIcon) return true
    if (color !== defaultColor) return true
    if (policy && originalSecret
      && JSON.stringify(policy) !== JSON.stringify(originalSecret.agentVisibilityPolicy)) return true
    return false
  }, [label, description, icon, color, defaultColor, entry, originalSecret, policy])

  const hasChanges = metadataChanged || contentChanged

  const handleRepairIcon = () => {
    if (hasChanges || isSaving || !originalSecret || repairIcon.candidateCount !== 1) return
    repairIcon.mutate({}, {
      onSuccess: (result) => {
        if (result.repaired === 1) toast.success(t('vault.entry.detail.repairIconSuccess'))
        else if (result.failed > 0) toast.error(t('vault.entry.detail.repairIconError'))
        else toast.info(t('vault.entry.detail.repairIconUnavailable'))
      },
      onError: () => toast.error(t('vault.entry.detail.repairIconError')),
    })
  }

  const handleDiscard = () => {
    setLabel(originalSecret?.memberLabel ?? entry.label)
    setDescription(originalSecret?.description ?? '')
    setIcon(originalSecret?.iconReference?.startsWith('builtin:')
      ? originalSecret.iconReference.slice(8)
      : originalSecret?.iconReference ?? entry.icon)
    setColor(defaultColor)
    setPolicy(originalSecret?.agentVisibilityPolicy ?? null)
    setUrlError(false)
    setScriptError(false)
    setDescriptionError(false)
    setCardholderNameError(false)
    setCardNumberError(false)
    setCvvError(false)
    setExpiryMonthError(false)
    setExpiryYearError(false)
    if (originalPlaintext) {
      if (originalPlaintext.type === ENTRY_TYPE_KEY) {
        setCustomFields(readCustomFields(originalPlaintext))
        setSecretValue(originalPlaintext.value)
        setNotes(originalPlaintext.notes ?? '')
        setUrl(originalPlaintext.url ?? '')
      } else if (originalPlaintext.type === ENTRY_TYPE_SCRIPT) {
        setCustomFields(readCustomFields(originalPlaintext))
        setScript(originalPlaintext.script)
        setInterpreter(originalPlaintext.interpreter)
        setRefs(originalPlaintext.refs ?? [])
        setDescription(originalPlaintext.execution?.description ?? originalSecret?.description ?? '')
        setScriptParameters(scriptParameterDrafts(originalPlaintext.execution?.parameters))
        setReturnResultToAgent(originalPlaintext.execution?.returnResultToAgent === true)
        setNotes(originalPlaintext.notes ?? '')
      } else if (originalPlaintext.type === ENTRY_TYPE_CREDENTIAL) {
        const { pinned, rest } = pinCredentialTotp(originalPlaintext)
        setCredentialTotp(pinned)
        setCustomFields(rest)
        setUsername(originalPlaintext.username)
        setPassword(originalPlaintext.password)
        setUrl(originalPlaintext.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : ''))
        setNotes(originalPlaintext.notes ?? '')
      } else if (originalPlaintext.type === ENTRY_TYPE_CREDIT_CARD) {
        setCustomFields(readCustomFields(originalPlaintext))
        setCardholderName(originalPlaintext.cardholderName); setCardNumber(originalPlaintext.cardNumber); setCvv(originalPlaintext.cvv ?? ''); setCvvShown(false)
        setExpiryMonth(originalPlaintext.expiryMonth); setExpiryYear(originalPlaintext.expiryYear)
        setBillingAddress(originalPlaintext.billingAddress ?? ''); setNotes(originalPlaintext.notes ?? '')
      }
    }
  }

  const submitUpdate = (current: EntryPlaintext, detail = mutationDetail) => {
    if (!originalSecret || !detail) return
    const originalIcon = originalSecret.iconReference
    const iconReference = icon
      ? /^(?:website|public-asset|vault-asset):/.test(icon) ? icon : `builtin:${icon}`
      : originalIcon?.startsWith('builtin:') ? undefined : originalIcon
    const savedPolicy = policy ?? originalSecret.agentVisibilityPolicy
    const basePolicy = entry.type === ENTRY_TYPE_CREDENTIAL
      ? withNewCredentialTotpPolicy(originalSecret.content.fields ?? [], current.fields ?? [], savedPolicy)
      : savedPolicy
    const nextPolicy = entry.type === ENTRY_TYPE_SCRIPT
      ? {
          ...basePolicy,
          discoverable: true,
          fields: {
            ...basePolicy.fields,
            [ENTRY_FIELD.agentLabel]: 'discovery' as const,
            [ENTRY_FIELD.description]: 'discovery' as const,
          },
        }
      : basePolicy
    update.mutate({
      detail,
      previous: originalSecret,
      draft: {
        memberLabel: label.trim(),
        agentLabel: label.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(iconReference ? { iconReference } : {}),
        entryType: originalSecret.entryType,
        content: current,
        policy: nextPolicy,
      },
    }, {
      onSuccess: () => {
        toast.success(t('vault.entry.detail.saveSuccess'))
        setOriginalPlaintext(current)
        setPendingScriptSave(null)
        setScriptImpact(null)
      },
      onError: () => toast.error(t('vault.entry.detail.saveError')),
    })
  }

  const handleSave = async (totp = credentialTotp) => {
    if (saveInFlight.current || update.isPending) return
    saveInFlight.current = true
    setPreparingSave(true)
    try {
      await saveEntry(totp)
    } finally {
      saveInFlight.current = false
      setPreparingSave(false)
    }
  }

  const saveEntry = async (totp: CustomField | null) => {
    if ((entry.type === ENTRY_TYPE_CREDENTIAL || entry.type === ENTRY_TYPE_KEY)
      && firstError(url.trim(), [validUrl(t('validation.invalidUrl'))]) !== null) {
      setUrlError(true)
      return
    }
    if (!label.trim()) {
      setLabelError(true)
      return
    }
    const fields = entry.type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(totp, customFields)
      : customFields
    if (validateCustomFields(fields).hasError) {
      toast.error(t('vault.entry.detail.saveError'))
      return
    }
    if (entry.type === ENTRY_TYPE_SCRIPT && !description.trim()) {
      setDescriptionError(true)
      return
    }
    if (scriptContractInvalid) return
    if (originalPlaintext) {
      if (entry.type === ENTRY_TYPE_KEY && !secretValue.trim()) {
        setSecretValueError(true)
        return
      }
      if (entry.type === ENTRY_TYPE_SCRIPT && !script.trim()) {
        setScriptError(true)
        return
      }
      if (entry.type === ENTRY_TYPE_CREDENTIAL) {
        const u = !username.trim()
        const p = !password.trim()
        if (u) setUsernameError(true)
        if (p) setPasswordError(true)
        if (u || p) return
      }
      if (entry.type === ENTRY_TYPE_CREDIT_CARD) {
        const cardholderInvalid = !cardholderName.trim() || cardholderName.trim().length > 256
        const cardNumberInvalid = !/^\d{12,19}$/.test(cardNumber.replace(/[ -]/g, ''))
        const expiryMonthInvalid = !/^(0[1-9]|1[0-2])$/.test(expiryMonth)
        const expiryYearInvalid = !/^\d{4}$/.test(expiryYear)
        setCardholderNameError(cardholderInvalid)
        setCardNumberError(cardNumberInvalid)
        setExpiryMonthError(expiryMonthInvalid)
        setExpiryYearError(expiryYearInvalid)
        const cvvInvalid = !!cvv.trim() && !/^\d{3,4}$/.test(cvv.trim())
        setCvvError(cvvInvalid)
        if (cardholderInvalid || cardNumberInvalid || cvvInvalid || expiryMonthInvalid || expiryYearInvalid) return
      }
    }

    const current = currentPlaintext(totp)
    if (!current || !originalSecret) {
      void handleDecrypt()
      return
    }
    let detail: CanonicalEntryDetail
    try {
      detail = await loadCanonical()
      setMutationDetail(detail)
    } catch {
      toast.error(t('vault.entry.detail.saveError'))
      return
    }
    if (originalPlaintext
      && (originalPlaintext.type === ENTRY_TYPE_SCRIPT || current.type === ENTRY_TYPE_SCRIPT)
      && (permissions & PERMISSION_GRANT_MANAGE) !== 0) {
      try {
        const impact = await getScriptAccessImpact(vault.id, entry.id)
        if (impact.effectiveAgentCount > 0) {
          setScriptChangeKinds(scriptChangeKindKeys(originalPlaintext, current))
          setPendingScriptSave(current)
          setScriptImpact(impact)
          return
        }
      } catch {
        toast.error(t('vault.entry.detail.saveError'))
        return
      }
    }
    submitUpdate(current, detail)
  }

  const handleDelete = () => {
    remove.mutate(entry.id, {
      onSuccess: () => {
        toast.success(t('vault.entry.detail.deleteSuccess'))
        setShowDelete(false)
        onDeleted()
      },
      onError: () => {
        toast.error(t('vault.entry.detail.deleteError'))
        setShowDelete(false)
      },
    })
  }

  return (
    <>
      <div
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="entry-detail-label" className="mb-1 block text-meta font-semibold text-[var(--cv-label-text)]">
                {t('vault.entries.labelLabel')}
              </label>
              <div className="flex gap-2">
                <EntryIconButton
                  icon={icon}
                  color={color}
                  type={entry.type}
                  onChange={setIcon}
                  onColorChange={setColor}
                  disabled={isSaving || !originalSecret}
                />
                <div className="min-w-0 flex-1">
                  <FormInput
                    id="entry-detail-label"
                    label={t('vault.entries.labelLabel')}
                    labelClassName="sr-only"
                    trailingActions={policy ? [discoveryAction(
                      entry.type === ENTRY_TYPE_SCRIPT || policy.discoverable,
                      isSaving || entry.type === ENTRY_TYPE_SCRIPT,
                      (active) => setPolicy({
                        ...policy,
                        discoverable: active,
                        fields: { ...policy.fields, [ENTRY_FIELD.agentLabel]: active ? 'discovery' : 'never' },
                      }),
                      t,
                    )] : undefined}
                    value={label}
                    onChange={(e) => { setLabel(e.target.value); setLabelError(false) }}
                    onBlur={() => setLabelError(firstError(label, [required(t('validation.required'))]) !== null)}
                    placeholder={t('vault.entries.labelPlaceholder')}
                    disabled={isSaving || !originalSecret}
                    maxLength={120}
                    error={labelError}
                  />
                  <FeedbackSlot visible={labelError} color="red">
                    {t('validation.required')}
                  </FeedbackSlot>
                </div>
              </div>
            </div>
            <div>
              <FormInput
                id="entry-detail-description"
                label={entry.type === ENTRY_TYPE_SCRIPT
                  ? t('vault.entries.script.descriptionLabel')
                  : t('vault.entries.descriptionLabel')}
                labelSuffix={entry.type === ENTRY_TYPE_SCRIPT
                  ? <>· {t('vault.entries.script.visibleInDiscovery')}</>
                  : undefined}
                trailingActions={policy && entry.type !== ENTRY_TYPE_SCRIPT ? [discoveryAction(
                  policy.fields[ENTRY_FIELD.description] === 'discovery',
                  isSaving || !policy.discoverable,
                  (active) => setPolicy({
                    ...policy,
                    fields: { ...policy.fields, [ENTRY_FIELD.description]: active ? 'discovery' : 'never' },
                  }),
                  t,
                )] : undefined}
                value={description}
                onChange={(e) => { setDescription(e.target.value); setDescriptionError(false) }}
                onBlur={() => setDescriptionError(entry.type === ENTRY_TYPE_SCRIPT && !description.trim())}
                placeholder={entry.type === ENTRY_TYPE_SCRIPT
                  ? t('vault.entries.script.descriptionPlaceholder')
                  : t('vault.entries.descriptionPlaceholder')}
                disabled={isSaving || !originalSecret}
                maxLength={entry.type === ENTRY_TYPE_SCRIPT ? 4096 : 500}
                error={descriptionError}
              />
              <FeedbackSlot visible={descriptionError} color="red">{t('validation.required')}</FeedbackSlot>
            </div>
            {entry.type === ENTRY_TYPE_KEY || entry.type === ENTRY_TYPE_CREDENTIAL ? (
              <div>
                <FormInput
                  id="entry-detail-url"
                  label={t('vault.entries.urlLabel')}
                  trailingActions={entry.type === ENTRY_TYPE_CREDENTIAL && policy ? [discoveryAction(
                    policy.fields[ENTRY_FIELD.urlDomain] === 'discovery',
                    isSaving || !policy.discoverable,
                    (active) => setPolicy({
                      ...policy,
                      fields: { ...policy.fields, [ENTRY_FIELD.urlDomain]: active ? 'discovery' : 'never' },
                    }),
                    t,
                  )] : undefined}
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
                  onBlur={() =>
                    setUrlError(
                      firstError(url.trim(), [validUrl(t('validation.invalidUrl'))]) !== null,
                    )
                  }
                  placeholder={t('vault.entries.urlPlaceholder')}
                  disabled={isSaving || !originalSecret}
                  inputMode="url"
                  error={urlError}
                  trailingAction={{
                    icon: 'open_in_new',
                    label: t('vault.entry.openInBrowser'),
                    onClick: () => openExternalUrl(url),
                    show: !!extractDomain(url),
                  }}
                />
                <FeedbackSlot visible={urlError} color="red">
                  {t('validation.invalidUrl')}
                </FeedbackSlot>
                {entry.type === ENTRY_TYPE_CREDENTIAL
                  && (permissions & PERMISSION_VAULT_MANAGE) !== 0
                  && repairIcon.candidateCount === 1
                  && !originalSecret?.iconReference ? (
                    <Button
                      variant="subtle"
                      size="sm"
                      icon="image_search"
                      onClick={handleRepairIcon}
                      disabled={!originalSecret || hasChanges || isSaving || repairIcon.isPending}
                      className="mt-2"
                    >
                      {repairIcon.isPending
                        ? t('vault.entry.detail.repairIconPending')
                        : t('vault.entry.detail.repairIcon')}
                    </Button>
                  ) : null}
              </div>
            ) : null}
            {decryptError ? (
              <div className="rounded-lg border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.06)] px-3 py-2 text-meta text-[var(--cv-primary)]">
                {decryptError}
              </div>
            ) : entry.type === ENTRY_TYPE_KEY ? (
              <div>
                <SecretInput
                  id="entry-detail-value"
                  label={t('vault.entries.valueLabel')}
                  value={secretValue}
                  onChange={(next) => { setSecretValue(next); setSecretValueError(false) }}
                  onBlur={() =>
                    setSecretValueError(
                      firstError(secretValue, [required(t('validation.required'))]) !== null,
                    )
                  }
                  shown={showSecret}
                  onToggleShown={() => setShowSecret((v) => !v)}
                  onGenerate={(pw) => { setSecretValue(pw); setShowSecret(true); setSecretValueError(false) }}
                  disabled={isSaving || decrypting}
                  monospace
                  error={secretValueError}
                  copyable
                  copyLabel={t('vault.entry.copyKey')}
                />
                <FeedbackSlot visible={secretValueError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
              </div>
            ) : entry.type === ENTRY_TYPE_SCRIPT ? (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    htmlFor="entry-detail-interpreter"
                    className="mb-1 flex items-center gap-2 text-meta font-semibold text-[var(--cv-label-text)]"
                  >
                    <span>{t('vault.entries.script.bodyLabel')}</span>
                    <span className="flex-1" />
                    <select
                      id="entry-detail-interpreter"
                      aria-label={t('vault.entries.script.interpreterLabel')}
                      value={interpreter}
                      onChange={(e) => setInterpreter(e.target.value as ScriptInterpreter)}
                      disabled={isSaving || decrypting}
                      className="cursor-pointer appearance-none border-0 bg-transparent pr-1 text-meta
                        font-normal text-[var(--cv-t2)] outline-none disabled:cursor-not-allowed"
                    >
                      {SCRIPT_INTERPRETERS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                    <Icon name="expand_more" size={13} className="-ml-1 text-[var(--cv-icon-muted)]" />
                  </label>
                  <ScriptEditor
                    value={script}
                    onChange={(next) => { setScript(next); setScriptError(false) }}
                    interpreter={interpreter}
                    disabled={isSaving || decrypting}
                    placeholder={t('vault.entries.script.bodyPlaceholder')}
                  />
                  <FeedbackSlot visible={scriptError} color="red">
                    {t('validation.required')}
                  </FeedbackSlot>
                  <ScriptExecHint />
                </div>
                <SectionHeader>{t('vault.entries.script.refsTitle')}</SectionHeader>
                <ScriptRefsEditor
                  vaultId={vault.id}
                  currentEntryId={entry.id}
                  refs={refs}
                  onChange={setRefs}
                  disabled={isSaving || decrypting}
                />
                <FeedbackSlot visible={!validateScriptRefs(refs, vault.id)} color="red">
                  {t('vault.entries.script.refsInvalid')}
                </FeedbackSlot>
                <SectionHeader
                  hint={t('vault.entries.script.parametersHint')}
                  hintLabel={t('vault.entries.script.parametersInfoLabel')}
                >
                  {t('vault.entries.script.parametersTitle')}
                </SectionHeader>
                <ScriptParametersEditor
                  parameters={scriptParameters}
                  onChange={setScriptParameters}
                  disabled={isSaving || decrypting}
                  error={validateScriptParameterDrafts(scriptParameters)}
                />
                <ScriptResultToggle
                  checked={returnResultToAgent}
                  onChange={setReturnResultToAgent}
                  disabled={isSaving || decrypting}
                />
              </div>
            ) : entry.type === ENTRY_TYPE_CREDIT_CARD ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FormInput id="entry-detail-cardholder" label={t('vault.entries.card.cardholderName')} value={cardholderName}
                    onChange={(e) => { setCardholderName(e.target.value); setCardholderNameError(false) }}
                    onBlur={() => setCardholderNameError(!cardholderName.trim())}
                    maxLength={256} disabled={isSaving || decrypting} error={cardholderNameError} />
                  <FeedbackSlot visible={cardholderNameError} color="red">{t('validation.required')}</FeedbackSlot>
                </div>
                <div>
                  <SecretInput id="entry-detail-card-number" label={t('vault.entries.card.cardNumber')} value={cardNumber}
                    onChange={(value) => { setCardNumber(value); setCardNumberError(false) }}
                    onBlur={() => setCardNumberError(!/^\d{12,19}$/.test(cardNumber.replace(/[ -]/g, '')))}
                    shown={showSecret} onToggleShown={() => setShowSecret((v) => !v)}
                    disabled={isSaving || decrypting} copyable error={cardNumberError} />
                  <FeedbackSlot visible={cardNumberError} color="red">{t('vault.entries.card.invalidCardNumber')}</FeedbackSlot>
                </div>
                <div className="col-span-2">
                  <SecretInput id="entry-card-cvv" label={t('vault.entries.card.cvv')} value={cvv}
                    onChange={(value) => { setCvv(value); setCvvError(false) }}
                    onBlur={() => setCvvError(!!cvv.trim() && !/^\d{3,4}$/.test(cvv.trim()))}
                    shown={cvvShown} onToggleShown={() => setCvvShown((value) => !value)}
                    disabled={isSaving || decrypting} monospace copyable error={cvvError} />
                  <FeedbackSlot visible={cvvError} color="red">{t('vault.entries.card.invalidCvv')}</FeedbackSlot>
                </div>
                <div>
                  <FormInput id="entry-detail-expiry-month" label={t('vault.entries.card.expiryMonth')} value={expiryMonth}
                    onChange={(e) => { setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2)); setExpiryMonthError(false) }}
                    onBlur={() => setExpiryMonthError(!/^(0[1-9]|1[0-2])$/.test(expiryMonth))}
                    disabled={isSaving || decrypting} error={expiryMonthError} />
                  <FeedbackSlot visible={expiryMonthError} color="red">{t('vault.entries.card.invalidExpiryMonth')}</FeedbackSlot>
                </div>
                <div>
                  <FormInput id="entry-detail-expiry-year" label={t('vault.entries.card.expiryYear')} value={expiryYear}
                    onChange={(e) => { setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setExpiryYearError(false) }}
                    onBlur={() => setExpiryYearError(!/^\d{4}$/.test(expiryYear))}
                    disabled={isSaving || decrypting} error={expiryYearError} />
                  <FeedbackSlot visible={expiryYearError} color="red">{t('vault.entries.card.invalidExpiryYear')}</FeedbackSlot>
                </div>
                <div className="col-span-2"><FormInput id="entry-detail-billing-address" label={t('vault.entries.card.billingAddress')} value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)} disabled={isSaving || decrypting} /></div>
              </div>
            ) : (
              <>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <FormInput
                    id="entry-detail-username"
                    label={t('vault.entries.usernameLabel')}
                    trailingActions={policy ? [discoveryAction(
                      policy.fields[ENTRY_FIELD.username] === 'discovery',
                      isSaving || !policy.discoverable,
                      (active) => setPolicy({
                        ...policy,
                        fields: { ...policy.fields, [ENTRY_FIELD.username]: active ? 'discovery' : 'never' },
                      }),
                      t,
                    )] : undefined}
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setUsernameError(false) }}
                    onBlur={() =>
                      setUsernameError(
                        firstError(username, [required(t('validation.required'))]) !== null,
                      )
                    }
                    disabled={isSaving || decrypting}
                    error={usernameError}
                    copyable
                    copyLabel={t('vault.entry.copyUsername')}
                  />
                  <FeedbackSlot visible={usernameError} color="red">
                    {t('validation.required')}
                  </FeedbackSlot>
                </div>
                <div className="flex-1 min-w-0">
                  <SecretInput
                    id="entry-detail-password"
                    label={t('vault.entries.passwordLabel')}
                    value={password}
                    onChange={(next) => { setPassword(next); setPasswordError(false) }}
                    onBlur={() =>
                      setPasswordError(
                        firstError(password, [required(t('validation.required'))]) !== null,
                      )
                    }
                    shown={showPassword}
                    onToggleShown={() => setShowPassword((v) => !v)}
                    onGenerate={(pw) => { setPassword(pw); setShowPassword(true); setPasswordError(false) }}
                    disabled={isSaving || decrypting}
                    monospace
                    error={passwordError}
                    copyable
                    copyLabel={t('vault.entry.copyPassword')}
                  />
                  <FeedbackSlot visible={passwordError} color="red">
                    {t('validation.required')}
                  </FeedbackSlot>
                </div>
              </div>
              <SectionHeader>{t('vault.entries.totp.section')}</SectionHeader>
              <CredentialTotpField
                value={credentialTotp}
                onChange={setCredentialTotp}
                onApply={(field) => { void handleSave(field) }}
                disabled={isSaving || decrypting}
                agentAccess={totpPolicyId && policy ? {
                  allowed: totpAccess === 'onGrantDerived',
                  onChange: (allowed) => setPolicy({ ...policy, fields: {
                    ...policy.fields, [totpPolicyId]: allowed ? 'onGrantDerived' : 'never',
                  } }),
                } : undefined}
              />
              </>
            )}
            {!decryptError ? (
              <>
                <SectionHeader>{t('vault.entries.customFields.title')}</SectionHeader>
                <CustomFieldsEditor
                  fields={customFields}
                  onChange={setCustomFields}
                  disabled={isSaving || decrypting || !originalSecret}
                  copyable
                />
              </>
            ) : null}
            {!decryptError ? (
              <NotesField
                id="entry-detail-notes"
                value={notes}
                onChange={setNotes}
                disabled={isSaving || decrypting || !originalSecret}
              />
            ) : null}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--cv-divider)] pt-4">
          <EntryShareAction scope={{ organizationId: vault.organizationId, vaultId: vault.id, entryId: entry.id,
            revision: entry.currentRevision, keyVersion: entry.currentKeyVersion }} footer />
          <div className="flex items-center gap-2">
            <Button variant="subtle" size="sm" onClick={handleDiscard} disabled={isSaving || !hasChanges}>
              {t('vault.entry.detail.discard')}
            </Button>
            <Button variant="accent" size="sm" onClick={() => { void handleSave() }}
              disabled={isSaving || !originalSecret || !hasChanges || fieldsInvalid || scriptContractInvalid}>
              {isSaving ? t('vault.entry.detail.saving') : t('vault.entry.detail.save')}
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <DangerZone
          onDelete={() => setShowDelete(true)}
          disabled={isRemoving}
        />
      </div>

      <DeleteEntryDialog
        open={showDelete}
        entryLabel={entry.label}
        isPending={isRemoving}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
      <ScriptAccessImpactDialog
        open={scriptImpact !== null && pendingScriptSave !== null}
        impact={scriptImpact}
        changes={scriptChangeKinds}
        isPending={isSaving}
        onCancel={() => { setScriptImpact(null); setPendingScriptSave(null) }}
        onConfirm={() => { if (pendingScriptSave) submitUpdate(pendingScriptSave) }}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Danger zone
// ---------------------------------------------------------------------------

function DangerZone({
  onDelete,
  disabled,
}: {
  onDelete: () => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <section
      className="rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4"
    >
      <h2 className="text-meta font-semibold text-[var(--cv-primary)]">
        {t('vault.entry.detail.dangerZoneTitle')}
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-ui font-semibold text-[var(--cv-t1)]">
            {t('vault.entry.detail.deleteTitle')}
          </div>
          <p className="mt-1 text-meta text-[var(--cv-t3)]">
            {t('vault.entry.detail.deleteSubtitle')}
          </p>
        </div>
        <Button variant="danger" size="sm" onClick={onDelete} disabled={disabled}>
          {t('vault.entry.detail.deleteButton')}
        </Button>
      </div>
    </section>
  )
}

interface DeleteEntryDialogProps {
  open: boolean
  entryLabel: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function ScriptAccessImpactDialog({
  open,
  impact,
  changes,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  impact: ScriptAccessImpact | null
  changes: string[]
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const agents = useAgentNames(open)
  const agentNameById = useMemo(() => new Map(
    (agents.data ?? []).map((agent) => [agent.agentId, agent.name?.trim() || shortenKey(agent.agentId)]),
  ), [agents.data])
  if (!open || !impact) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('vault.entries.script.impactTitle')}
      title={t('vault.entries.script.impactTitle')}
      width={480}
      footer={<DialogFooter>
        <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
          {t('vault.cancel')}
        </Button>
        <Button variant="accent" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
          {isPending ? t('vault.entry.detail.saving') : t('vault.entries.script.impactConfirm')}
        </Button>
      </DialogFooter>}
    >
      <div className="flex flex-col gap-3">
        <WarningZone title={t('vault.entries.script.impactWarningTitle')}>
          {t('vault.entries.script.impactWarningBody', { count: impact.effectiveAgentCount })}
        </WarningZone>
        <dl className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--cv-border)] p-3 text-meta">
          <div><dt className="text-[var(--cv-t3)]">{t('vault.entries.script.impactDirect')}</dt>
            <dd className="font-semibold text-[var(--cv-t1)]">{impact.directAgentCount}</dd></div>
          <div><dt className="text-[var(--cv-t3)]">{t('vault.entries.script.impactFull')}</dt>
            <dd className="font-semibold text-[var(--cv-t1)]">{impact.fullAgentCount}</dd></div>
        </dl>
        <div>
          <p className="text-meta font-semibold text-[var(--cv-t1)]">
            {t('vault.entries.script.impactAgents')}
          </p>
          <ul className="mt-1 space-y-1 text-meta text-[var(--cv-t2)]">
            {impact.agentIds.map((agentId) => (
              <li key={agentId}>{agentNameById.get(agentId) ?? shortenKey(agentId)}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-meta font-semibold text-[var(--cv-t1)]">{t('vault.entries.script.impactChanges')}</p>
          <ul className="mt-1 list-disc pl-5 text-meta text-[var(--cv-t2)]">
            {changes.map((key) => <li key={key}>{t(key)}</li>)}
          </ul>
        </div>
        {changes.includes('vault.entries.script.changeReferences') ? (
          <p className="text-meta text-[var(--cv-pending)]">
            {t('vault.entries.script.impactReferencesBody')}
          </p>
        ) : null}
      </div>
    </ModalShell>
  )
}

function DeleteEntryDialog({
  open,
  entryLabel,
  isPending,
  onConfirm,
  onCancel,
}: DeleteEntryDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('vault.entry.detail.deleteConfirmTitle', { label: entryLabel })}
      title={t('vault.entry.detail.deleteConfirmTitle', { label: entryLabel })}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {isPending ? t('vault.deleting') : t('vault.entry.detail.deleteButton')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">
        {t('vault.entry.detail.deleteConfirmText')}
      </p>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CurrentFormValues {
  secretValue: string
  username: string
  password: string
  notes: string
  url: string
  script: string
  interpreter: ScriptInterpreter
  refs: ScriptRef[]
  executionDescription: string
  scriptParameters: ScriptParameterDraft[]
  returnResultToAgent: boolean
  customFields: CustomField[]
  /** Pinned credential 2FA field (CREDENTIAL only). */
  credentialTotp: CustomField | null
  cardholderName: string
  cardNumber: string
  cvv: string
  expiryMonth: string
  expiryYear: string
  billingAddress: string
}

type CredentialPlaintext = Extract<EntryPlaintext, { type: typeof ENTRY_TYPE_CREDENTIAL }>

/**
 * Rebuild the entry's plaintext from the current inline-edit form state. For a
 * credential the pinned 2FA field retains its original native/custom identity.
 * An unparseable top-level URI is kept while no replacement field is configured.
 * `v: 2` is stamped only when fields are present, so a plain KEY/CREDENTIAL blob stays v1.
 */
function buildCurrentPlaintext(
  original: EntryPlaintext,
  entry: EntryDetail,
  values: CurrentFormValues,
): EntryPlaintext {
  const notes = values.notes.trim() || undefined

  if (entry.type === ENTRY_TYPE_KEY) {
    const fieldsPart = foldFieldsPart(values.customFields)
    return {
      type: ENTRY_TYPE_KEY,
      value: values.secretValue.trim(),
      url: values.url.trim() || undefined,
      notes,
      ...fieldsPart,
    }
  }
  if (entry.type === ENTRY_TYPE_SCRIPT) {
    const fieldsPart = foldFieldsPart(values.customFields)
    const scriptRefs = foldScriptRefs(values.refs)
    return {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_SCRIPT,
      script: values.script.trim(),
      interpreter: values.interpreter,
      execution: {
        contractVersion: 1,
        description: values.executionDescription.trim(),
        parameters: buildScriptParameterDefinitions(values.scriptParameters),
        returnResultToAgent: values.returnResultToAgent,
      },
      notes,
      ...(scriptRefs.length > 0 ? { refs: scriptRefs } : {}),
      ...fieldsPart,
    }
  }
  if (entry.type === ENTRY_TYPE_CREDIT_CARD) {
    return {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_CREDIT_CARD,
      cardholderName: values.cardholderName.trim(),
      cardNumber: values.cardNumber.replace(/[ -]/g, ''),
      ...(values.cvv.trim() ? { cvv: values.cvv.trim() } : {}),
      expiryMonth: values.expiryMonth,
      expiryYear: values.expiryYear,
      billingAddress: values.billingAddress.trim() || undefined,
      notes,
      ...foldFieldsPart(values.customFields),
    }
  }
  const originalTotp = original.type === ENTRY_TYPE_CREDENTIAL ? original.totp : undefined
  const nativeTotp = !!originalTotp && parseOtpauthUri(originalTotp) !== null
  // Keep native TOTP under credential.totp so selected grants keep the same field identity.
  const fieldsPart = foldFieldsPart(nativeTotp ? values.customFields : mergeCredentialTotp(values.credentialTotp, values.customFields))
  const legacyTotp = nativeTotp
    ? values.credentialTotp && typeof values.credentialTotp.value === 'object'
      ? formatOtpauthUri(values.credentialTotp.value as TotpParams) : undefined
    : !values.credentialTotp ? originalTotp : undefined
  return {
    type: ENTRY_TYPE_CREDENTIAL,
    username: values.username.trim(),
    password: values.password,
    url: values.url.trim() || undefined,
    notes,
    ...(legacyTotp ? { totp: legacyTotp } : {}),
    ...fieldsPart,
  }
}

function scriptChangeKindKeys(previous: EntryPlaintext, next: EntryPlaintext): string[] {
  if (previous.type !== ENTRY_TYPE_SCRIPT || next.type !== ENTRY_TYPE_SCRIPT) {
    return ['vault.entries.script.changeExecution']
  }
  const changes: string[] = []
  if (previous.script !== next.script || previous.interpreter !== next.interpreter) {
    changes.push('vault.entries.script.changeExecution')
  }
  if ((previous.execution?.description ?? '') !== (next.execution?.description ?? '')) {
    changes.push('vault.entries.script.changeDescription')
  }
  if (JSON.stringify(previous.execution?.parameters ?? []) !== JSON.stringify(next.execution?.parameters ?? [])) {
    changes.push('vault.entries.script.changeParameters')
  }
  if (JSON.stringify(previous.refs ?? []) !== JSON.stringify(next.refs ?? [])) {
    changes.push('vault.entries.script.changeReferences')
  }
  if ((previous.execution?.returnResultToAgent === true) !== (next.execution?.returnResultToAgent === true)) {
    changes.push('vault.entries.script.changeResultPolicy')
  }
  return changes.length > 0 ? changes : ['vault.entries.script.changeMetadata']
}

function foldFieldsPart(fields: CustomField[]): { v?: typeof BLOB_VERSION_V2; fields?: CustomField[] } {
  const folded = foldCustomFields(fields)
  return folded ? { v: BLOB_VERSION_V2, fields: folded } : {}
}

/**
 * Pin native credential.totp when present; otherwise use the first custom TOTP.
 * The editable native field retains its credential.totp identity on save.
 * The baseline normalizes only its URI representation, preserving selected grants.
 */
function pinCredentialTotp(pt: CredentialPlaintext): {
  pinned: CustomField | null
  rest: CustomField[]
  baseline: EntryPlaintext
} {
  const fields = readCustomFields(pt)
  if (pt.totp) {
    const params = parseOtpauthUri(pt.totp)
    if (params) {
      const pinned: CustomField = {
        id: newFieldId(),
        label: DEFAULT_TOTP_LABEL,
        type: 'totp',
        value: params,
      }
      const baseline: EntryPlaintext = {
        ...pt,
        totp: formatOtpauthUri(params),
      }
      return { pinned, rest: fields, baseline }
    }
  }
  const split = splitCredentialTotp(fields)
  return { pinned: split.pinned, rest: split.rest, baseline: pt }
}
