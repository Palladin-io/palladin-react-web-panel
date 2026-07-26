import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { FeedbackSlot, FormInput } from '../../shared/components/form-field'
import { NotesField } from './components/notes-field'
import { SecretInput } from '../../shared/components/secret-input'
import { firstError, required, validUrl } from '../../shared/lib/validation'
import { wipe } from '../../shared/crypto/sodium'
import { decryptMemberSecret, type CanonicalEntryDetail, type MemberSecretPlaintext } from '../../shared/crypto/vault-v2-entry'
import { openMemberVaultKey } from '../../shared/crypto/vault-v2-member-sync'
import { useWideScreen } from '../../shared/hooks/use-wide-screen'
import { analytics } from '../../shared/lib/analytics'
import { PERMISSION_GRANT_MANAGE } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import {
  GRANT_STATUS_ACTIVE,
  GrantAccessDialog,
  useOrgGrants,
} from '../grants'
import { EntryIconButton } from './components/entry-icon-button'
import { EntryAgentsTab } from './components/entry-agents-tab'
import { EntryLogsTab } from './components/entry-logs-tab'
import {
  ENTRY_ICON_COLORS,
  extractDomain,
  openExternalUrl,
} from './components/entry-presentation'
import { ModalShell } from '../../shared/components/modal-shell'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { VaultDetailHeader } from './components/vault-detail-header'
import { VaultEntriesPanel } from './components/vault-entries-panel'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  SCRIPT_INTERPRETERS,
  type CustomField,
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
import { parseOtpauthUri } from '../../shared/crypto/totp'
import { CustomFieldsEditor } from './components/custom-fields-editor'
import { CredentialTotpField } from './components/credential-totp-field'
import { ScriptEditor } from './components/script-editor'
import { ScriptExecHint } from './components/script-exec-hint'
import { ScriptRefsEditor } from './components/script-refs-editor'
import { SectionHeader } from './components/section-header'
import { useDeleteEntry } from './use-delete-entry'
import { useCanonicalEntryDetail } from './use-entries'
import { useUpdateCanonicalEntry } from './use-update-canonical-entry'
import { useVault } from './use-vault'
import { getEncryptedVault } from './sync/member-sync-api'
import { useMemberSyncStore } from './sync/member-sync-store'

export interface EntryDetailPageProps {
  vaultId: string
  entryId: string
}

type EntryDetailTab = 'details' | 'agents' | 'logs'

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
export function EntryDetailPage({ vaultId, entryId }: EntryDetailPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)
  const entry = useCanonicalEntryDetail(vaultId, entryId)
  const memberIndex = useMemberSyncStore((store) => store.vaults.get(vaultId)?.entries.get(entryId)?.payload)
  const [activeTab, setActiveTab] = useState<EntryDetailTab>('details')
  const [addAgentOpen, setAddAgentOpen] = useState(false)
  const isWide = useWideScreen()

  const handleBack = () => navigate({ to: '/vaults/$vaultId', params: { vaultId } })
  const onDeleted = () => navigate({ to: '/vaults/$vaultId', params: { vaultId } })

  const detailContent = vault.isPending || entry.isPending ? (
    <PageSkeleton />
  ) : vault.isError || !vault.data ? (
    <ErrorState message={t('vault.errorLoad')} onRetry={vault.refetch} />
  ) : entry.isError || !entry.data ? (
    <ErrorState
      message={t('vault.entry.detail.loadError')}
      onRetry={entry.refetch}
    />
  ) : (
    <>
      <DetailBody
        vault={vault.data}
        entry={toEntryView(entry.data, memberIndex)}
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
          <div className="h-full px-4 pt-4">
            {vault.data ? (
              <VaultEntriesPanel vault={vault.data} selectedEntryId={entryId} />
            ) : (
              <div className="h-32 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
            )}
          </div>
        </div>
        <div className="subtle-scrollbar flex-1 overflow-y-auto min-w-0">
          <div className="px-4 py-4">{detailContent}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-[var(--cv-t1)]">
      <div className="px-6 py-8">{detailContent}</div>
    </div>
  )
}

interface CanonicalEntryView extends EntryDetail {
  canonical: CanonicalEntryDetail
}

function toEntryView(
  canonical: CanonicalEntryDetail,
  index: { memberLabel: string; entryType: EntryDetail['type']; iconReference?: string } | null | undefined,
): CanonicalEntryView {
  const iconReference = index?.iconReference
  return {
    id: canonical.id,
    label: index?.memberLabel ?? canonical.id,
    type: index?.entryType ?? ENTRY_TYPE_CREDENTIAL,
    ...(iconReference?.startsWith('builtin:') ? { icon: iconReference.slice(8) } : {}),
    createdAt: canonical.createdAt,
    updatedAt: canonical.updatedAt,
    accessCount: 0,
    content: { encryptedBlob: '', nonce: '' },
    canonical,
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
  entry: CanonicalEntryView
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
        type: entry.type === ENTRY_TYPE_KEY ? 'key' : 'credential',
        tab: next,
      })
    }
    onTabChange(next)
  }

  const agentAction = (
    <div className="flex items-center gap-2">
      <span className="text-meta text-[var(--cv-t3)]">
        {t('vault.entry.detail.agentsWithAccess', { count: agentCount })}
      </span>
      <Button variant="accent" size="sm" icon="add" onClick={onAddAgent}>
        {t('vault.detail.addAgent')}
      </Button>
    </div>
  )

  return (
    <>
      {!hideHeader && (
        <VaultDetailHeader
          title={entry.label}
          subtitle={subtitle}
          onBack={onBack}
          actions={activeTab === 'agents' ? agentAction : undefined}
        />
      )}
      <EntryDetailTabs
        active={activeTab}
        onChange={handleTabChange}
        wide={hideHeader}
        actions={hideHeader && activeTab === 'agents' ? agentAction : undefined}
      />
      {activeTab === 'details' ? (
        <DetailsTab
          key={`${entry.id}:${entry.canonical.currentRevision}`}
          vault={vault}
          entry={entry}
          onDeleted={onDeleted}
        />
      ) : null}
      {activeTab === 'agents' ? (
        <EntryAgentsTab
          key={`${entry.id}:${entry.canonical.currentRevision}`}
          vaultId={vault.id}
          entryId={entry.id}
          entryType={entry.type}
          memberLabel={entry.label}
          detail={entry.canonical}
        />
      ) : null}
      {activeTab === 'logs' ? (
        <EntryLogsTab vaultId={vault.id} entryId={entry.id} />
      ) : null}
    </>
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
  const tabs: { id: EntryDetailTab; labelKey: string }[] = [
    { id: 'details', labelKey: 'vault.entry.detail.detailsTab' },
    { id: 'agents', labelKey: 'vault.entry.detail.agentsTab' },
    { id: 'logs', labelKey: 'vault.entry.detail.logsTab' },
  ]

  const tabButtons = tabs.map((tab) => {
    const isActive = tab.id === active
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onChange(tab.id)}
        className={`-mb-px border-b-2 px-3.5 py-2 text-ui transition-colors ${
          isActive
            ? 'border-[var(--cv-primary)] font-bold text-[var(--cv-primary)]'
            : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
        }`}
      >
        {t(tab.labelKey)}
      </button>
    )
  })

  if (wide) {
    return (
      <div className="mb-4 flex h-10 items-end">
        <div className="flex shrink-0 border-b border-[var(--cv-divider)]" role="tablist">
          {tabButtons}
        </div>
        <div className="h-px flex-1 self-end bg-gradient-to-r from-[var(--cv-divider)] to-transparent" />
        {actions ? (
          <div className="flex shrink-0 self-center items-center gap-1">
            {actions}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mb-3 flex border-b border-[var(--cv-divider)]" role="tablist">
      {tabButtons}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Details tab
// ---------------------------------------------------------------------------

interface DetailsTabProps {
  vault: Vault
  entry: CanonicalEntryView
  onDeleted: () => void
}

function DetailsTab({ vault, entry, onDeleted }: DetailsTabProps) {
  const { t } = useTranslation()
  const update = useUpdateCanonicalEntry(vault.id, entry.id)
  const remove = useDeleteEntry(vault.id)

  // Editable metadata — initialise from server values, reset to the
  // current server values on Discard.
  const [label, setLabel] = useState(entry.label)
  const [description, setDescription] = useState(entry.description ?? '')
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
  const [notes, setNotes] = useState('') // both types

  // Original plaintext for change detection / discard.
  const [originalPlaintext, setOriginalPlaintext] = useState<EntryPlaintext | null>(null)
  const [originalSecret, setOriginalSecret] = useState<MemberSecretPlaintext | null>(null)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)
  const [decryptRequested, setDecryptRequested] = useState(false)

  // Custom fields + script state (populated after decrypt).
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [credentialTotp, setCredentialTotp] = useState<CustomField | null>(null) // CREDENTIAL only
  const [script, setScript] = useState('') // SCRIPT only
  const [scriptError, setScriptError] = useState(false)
  const [interpreter, setInterpreter] = useState<ScriptInterpreter>('bash')
  const [refs, setRefs] = useState<ScriptRef[]>([])

  // Reveal toggles.
  const [showSecret, setShowSecret] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Decrypt only after an explicit reveal/edit action.
  // The keyed DetailsTab instance prevents plaintext from one Entry revision
  // from being reused after navigation or a successful optimistic update.
  const handleDecrypt = async () => {
    setDecryptRequested(true)
    setDecryptError(null)
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      setDecryptError(t('vault.entry.detail.decryptError'))
      return
    }
    setDecrypting(true)
    try {
      const encryptedVault = await getEncryptedVault(vault.id)
      const vaultKey = await openMemberVaultKey(encryptedVault.memberVaultKey, {
        organizationId: entry.canonical.organizationId,
        vaultId: vault.id,
        memberId: encryptedVault.memberVaultKey.memberId,
        vkVersion: encryptedVault.currentKeyEpoch.vaultKeyVersion,
        memberKeyGeneration: encryptedVault.memberKeyGeneration,
      }, privateKey)
      try {
        const secret = await decryptMemberSecret(entry.canonical, vaultKey)
        const pt = secret.content
        setOriginalSecret(secret)
        setLabel(secret.memberLabel)
        setDescription(secret.description ?? '')
        setIcon(secret.iconReference?.startsWith('builtin:') ? secret.iconReference.slice(8) : undefined)
        if (pt.type === ENTRY_TYPE_KEY) {
          setOriginalPlaintext(pt); setCustomFields(readCustomFields(pt)); setSecretValue(pt.value); setNotes(pt.notes ?? '')
        } else if (pt.type === ENTRY_TYPE_SCRIPT) {
          setOriginalPlaintext(pt); setCustomFields(readCustomFields(pt)); setScript(pt.script)
          setInterpreter(pt.interpreter); setRefs(pt.refs ?? []); setNotes(pt.notes ?? '')
        } else {
          const { pinned, rest, baseline } = pinCredentialTotp(pt)
          setOriginalPlaintext(baseline); setCredentialTotp(pinned); setCustomFields(rest)
          setUsername(pt.username); setPassword(pt.password)
          setUrl(pt.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : '')); setNotes(pt.notes ?? '')
        }
      } finally {
        wipe(vaultKey)
      }
    } catch {
      setDecryptError(t('vault.entry.detail.decryptError'))
    } finally {
      setDecrypting(false)
    }
  }

  const isSaving = update.isPending
  const isRemoving = remove.isPending

  const defaultColor =
    entry.color ?? (ENTRY_ICON_COLORS[entry.icon ?? ''] ?? (entry.type === ENTRY_TYPE_KEY ? '#10B981' : '#60A5FA'))

  // Rebuild the plaintext from the current form state, preserving un-edited
  // well-known fields (e.g. a credential's stored `totp`) that this UI doesn't
  // expose. Used for both change detection and re-encryption on save.
  const currentPlaintext = useCallback((): EntryPlaintext | null => {
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
      customFields,
      credentialTotp,
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
    customFields,
    credentialTotp,
  ])

  // Merged field set for a credential (pinned 2FA + additional) — the shape
  // validated and folded to the blob. KEY/SCRIPT have no pinned 2FA.
  const mergedFields =
    entry.type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(credentialTotp, customFields)
      : customFields
  const fieldsInvalid = validateCustomFields(mergedFields).hasError

  const contentChanged = useMemo(() => {
    const current = currentPlaintext()
    return current !== null && originalPlaintext !== null && !plaintextsEqual(current, originalPlaintext)
  }, [currentPlaintext, originalPlaintext])

  const metadataChanged = useMemo(() => {
    const originalLabel = originalSecret?.memberLabel ?? entry.label
    const originalDescription = originalSecret?.description
    const originalIcon = originalSecret?.iconReference?.startsWith('builtin:')
      ? originalSecret.iconReference.slice(8)
      : entry.icon
    if (label.trim() !== originalLabel) return true
    if ((description.trim() || undefined) !== originalDescription) return true
    if (icon !== originalIcon) return true
    if (color !== defaultColor) return true
    // For KEY/SCRIPT the URL field feeds only `urlDomain` metadata (CREDENTIAL's
    // url lives in the blob and is covered by contentChanged).
    if (entry.type !== ENTRY_TYPE_CREDENTIAL) {
      const origKeyUrl = entry.urlDomain ? `https://${entry.urlDomain}` : ''
      if (url !== origKeyUrl) return true
    }
    return false
  }, [label, description, icon, color, defaultColor, url, entry, originalSecret])

  const hasChanges = metadataChanged || contentChanged

  const handleDiscard = () => {
    setLabel(originalSecret?.memberLabel ?? entry.label)
    setDescription(originalSecret?.description ?? '')
    setIcon(originalSecret?.iconReference?.startsWith('builtin:')
      ? originalSecret.iconReference.slice(8)
      : entry.icon)
    setColor(defaultColor)
    setUrlError(false)
    setScriptError(false)
    if (originalPlaintext) {
      if (originalPlaintext.type === ENTRY_TYPE_KEY) {
        setCustomFields(readCustomFields(originalPlaintext))
        setSecretValue(originalPlaintext.value)
        setNotes(originalPlaintext.notes ?? '')
        setUrl(entry.urlDomain ? `https://${entry.urlDomain}` : '')
      } else if (originalPlaintext.type === ENTRY_TYPE_SCRIPT) {
        setCustomFields(readCustomFields(originalPlaintext))
        setScript(originalPlaintext.script)
        setInterpreter(originalPlaintext.interpreter)
        setRefs(originalPlaintext.refs ?? [])
        setNotes(originalPlaintext.notes ?? '')
      } else {
        const { pinned, rest } = pinCredentialTotp(originalPlaintext)
        setCredentialTotp(pinned)
        setCustomFields(rest)
        setUsername(originalPlaintext.username)
        setPassword(originalPlaintext.password)
        setUrl(originalPlaintext.url ?? (entry.urlDomain ? `https://${entry.urlDomain}` : ''))
        setNotes(originalPlaintext.notes ?? '')
      }
    }
  }

  const handleSave = async () => {
    if (!label.trim()) {
      setLabelError(true)
      return
    }
    if (fieldsInvalid) return
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
    }

    const current = currentPlaintext()
    if (!current || !originalSecret) {
      void handleDecrypt()
      return
    }
    const originalIcon = originalSecret.iconReference
    const iconReference = icon
      ? `builtin:${icon}`
      : originalIcon?.startsWith('builtin:') ? undefined : originalIcon
    update.mutate({
      detail: entry.canonical,
      previous: originalSecret,
      draft: {
        memberLabel: label.trim(),
        agentLabel: originalSecret.agentLabel,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(iconReference ? { iconReference } : {}),
        entryType: originalSecret.entryType,
        content: current,
        policy: originalSecret.agentVisibilityPolicy,
      },
    }, {
      onSuccess: () => {
        toast.success(t('vault.entry.detail.saveSuccess'))
        setOriginalPlaintext(current)
      },
      onError: () => {
        toast.error(t('vault.entry.detail.saveError'))
      },
    })
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
              <label
                htmlFor="entry-detail-label"
                className="mb-1 block text-meta font-semibold text-[var(--cv-label-text)]"
              >
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
            <FormInput
              id="entry-detail-description"
              label={t('vault.entries.descriptionLabel')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('vault.entries.descriptionPlaceholder')}
              disabled={isSaving || !originalSecret}
              maxLength={500}
            />
            {entry.type !== ENTRY_TYPE_SCRIPT ? (
              <div>
                <FormInput
                  id="entry-detail-url"
                  label={t('vault.entries.urlLabel')}
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
              </div>
            ) : null}
            {!decryptRequested ? (
              <div className="flex justify-center rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
                <Button
                  variant="subtle"
                  size="sm"
                  icon="visibility"
                  onClick={() => void handleDecrypt()}
                >
                  {t('vault.entry.reveal')}
                </Button>
              </div>
            ) : decrypting ? (
              <div className="h-20 animate-pulse rounded-xl bg-[var(--cv-card-bg)]" />
            ) : decryptError ? (
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
              </div>
            ) : (
              <>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <FormInput
                    id="entry-detail-username"
                    label={t('vault.entries.usernameLabel')}
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
                disabled={isSaving || decrypting}
              />
              </>
            )}
            {originalSecret && !decryptError ? (
              <>
                <SectionHeader>{t('vault.entries.customFields.title')}</SectionHeader>
                <CustomFieldsEditor
                  fields={customFields}
                  onChange={setCustomFields}
                  disabled={isSaving || decrypting}
                  copyable
                />
              </>
            ) : null}
            {originalSecret ? (
              <NotesField
                id="entry-detail-notes"
                value={notes}
                onChange={setNotes}
                disabled={isSaving || decrypting}
              />
            ) : null}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
          <Button
            variant="subtle"
            size="sm"
            onClick={handleDiscard}
            disabled={isSaving || !hasChanges}
          >
            {t('vault.entry.detail.discard')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !originalSecret || !hasChanges || fieldsInvalid}
          >
            {isSaving ? t('vault.entry.detail.saving') : t('vault.entry.detail.save')}
          </Button>
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
  customFields: CustomField[]
  /** Pinned credential 2FA field (CREDENTIAL only). */
  credentialTotp: CustomField | null
}

type CredentialPlaintext = Extract<EntryPlaintext, { type: typeof ENTRY_TYPE_CREDENTIAL }>

/**
 * Rebuild the entry's plaintext from the current inline-edit form state. For a
 * credential the pinned 2FA field is merged back into `fields[]`; a legacy
 * top-level `totp` URI is preserved only while it hasn't been pinned (malformed
 * seed that couldn't be parsed), so nothing is lost. `v: 2` is stamped only when
 * fields are present, so a plain KEY/CREDENTIAL blob stays v1.
 */
function buildCurrentPlaintext(
  original: EntryPlaintext,
  entry: EntryDetail,
  values: CurrentFormValues,
): EntryPlaintext {
  const notes = values.notes.trim() || undefined

  if (entry.type === ENTRY_TYPE_KEY) {
    const fieldsPart = foldFieldsPart(values.customFields)
    return { type: ENTRY_TYPE_KEY, value: values.secretValue.trim(), notes, ...fieldsPart }
  }
  if (entry.type === ENTRY_TYPE_SCRIPT) {
    const fieldsPart = foldFieldsPart(values.customFields)
    const scriptRefs = foldScriptRefs(values.refs)
    return {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_SCRIPT,
      script: values.script.trim(),
      interpreter: values.interpreter,
      notes,
      ...(scriptRefs.length > 0 ? { refs: scriptRefs } : {}),
      ...fieldsPart,
    }
  }
  const fieldsPart = foldFieldsPart(mergeCredentialTotp(values.credentialTotp, values.customFields))
  // Keep an unparseable legacy totp string only while no 2FA field is pinned.
  const legacyTotp =
    !values.credentialTotp && original.type === ENTRY_TYPE_CREDENTIAL ? original.totp : undefined
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

function foldFieldsPart(fields: CustomField[]): { v?: typeof BLOB_VERSION_V2; fields?: CustomField[] } {
  const folded = foldCustomFields(fields)
  return folded ? { v: BLOB_VERSION_V2, fields: folded } : {}
}

/**
 * Pin the dedicated credential 2FA field for editing. If a TOTP field already
 * exists it is used as-is; otherwise a legacy top-level `totp` URI is parsed and
 * migrated into a field object, with the returned `baseline` reflecting that
 * migration so the form doesn't read as dirty on load.
 */
function pinCredentialTotp(pt: CredentialPlaintext): {
  pinned: CustomField | null
  rest: CustomField[]
  baseline: EntryPlaintext
} {
  const fields = readCustomFields(pt)
  const split = splitCredentialTotp(fields)
  if (split.pinned) return { pinned: split.pinned, rest: split.rest, baseline: pt }

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
        totp: undefined,
        v: BLOB_VERSION_V2,
        fields: mergeCredentialTotp(pinned, fields),
      }
      return { pinned, rest: fields, baseline }
    }
  }
  return { pinned: null, rest: fields, baseline: pt }
}
