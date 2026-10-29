import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { hasApiErrorKey } from '../../../shared/api/error-response'
import { Button } from '../../../shared/components/button'
import { ErrorState } from '../../../shared/components/error-state'
import { FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import { WarningZone } from '../../../shared/components/warning-zone'
import {
  AgentSubmissionCryptoError,
  submissionEntryTypeName,
  type AgentSubmissionPayload,
} from '../../../shared/crypto/agent-submission'
import { DETAIL_SURFACE_CLASSES } from '../../../shared/lib/styles'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { AGENT_STATUS_ACTIVE, AgentAvatar, getAgent } from '../../agents'
import { useAuthStore } from '../../auth'
import { formatRelativeTime } from '../../grants'
import { useMemberSyncStore, type DecryptedMemberVault } from '../../vaults/sync/member-sync-store'
import type { ApproveSubmissionResponse, SubmissionListItem } from '../api/submissions-api'
import { StaleSubmissionTargetError } from '../submission-approval'
import { submissionSummaryKeys } from '../submission-presentation'
import { useApproverKeyPresentation } from '../use-approver-keys'
import {
  SUBMISSIONS_QUERY_KEY,
  useApproveSubmission,
  useDenySubmission,
  useExistingAgentAccess,
  useSubmissionReview,
  type OpenedSubmission,
} from '../use-submissions'
import { ApproverKeyNotice } from './approver-key-notice'

export interface SubmissionDecisionPanelProps {
  item: SubmissionListItem
  onApproved: (result: ApproveSubmissionResponse) => void
}

export function SubmissionDecisionPanel({ item, onApproved }: SubmissionDecisionPanelProps) {
  const { t } = useTranslation()
  const keyPresentation = useApproverKeyPresentation()
  const review = useSubmissionReview(keyPresentation === 'ready' ? item : undefined)

  if (keyPresentation !== 'ready') return <ApproverKeyNotice presentation={keyPresentation} />
  if (review.isPending) return <SkeletonBlock height="16rem" />
  if (review.isError) {
    const code = review.error instanceof AgentSubmissionCryptoError ? review.error.code : null
    return (
      <div className="flex flex-col gap-4">
        <ErrorState
          message={code ? t('submissions.review.unverified', { code }) : t('submissions.review.loadFailed')}
          retryLabel={t('submissions.review.retry')}
          onRetry={() => review.refetch()}
        />
        <DenyOnlyFooter item={item} />
      </div>
    )
  }
  return <SubmissionReviewForm key={item.submissionId} item={item} opened={review.data} onApproved={onApproved} />
}

function DenyOnlyFooter({ item }: { item: SubmissionListItem }) {
  const { t } = useTranslation()
  const deny = useDenySubmission()
  return (
    <div className="flex justify-end">
      <Button variant="subtle" size="sm" icon="delete" disabled={deny.isPending}
        onClick={() => deny.mutate(item.submissionId, {
          onSuccess: () => toast.success(t('submissions.decision.denied')),
          onError: () => toast.error(t('submissions.decision.denyFailed')),
        })}>
        {t('submissions.decision.deny')}
      </Button>
    </div>
  )
}

interface DuplicateHint {
  label: string
  vaultName: string
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

function findDuplicate(vaults: ReadonlyMap<string, DecryptedMemberVault>, payload: AgentSubmissionPayload): DuplicateHint | null {
  const host = hostOf(payload.content.url)
  const username = payload.content.username
  if (!host || !username) return null
  for (const vault of vaults.values()) {
    for (const entry of vault.entries.values()) {
      const index = entry.payload
      if (entry.state === 'active' && !entry.corrupt && index?.entryType === 'credential'
        && index.urlDomain === host && index.username === username) {
        return { label: index.memberLabel, vaultName: vault.metadata?.name ?? '' }
      }
    }
  }
  return null
}

type Conflict = 'stale' | 'typeMismatch' | null

function SubmissionReviewForm({ item, opened, onApproved }: {
  item: SubmissionListItem
  opened: OpenedSubmission
  onApproved: (result: ApproveSubmissionResponse) => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { payload, submission } = opened
  const target = submission.target
  const vaults = useMemberSyncStore((state) => state.vaults)
  const canManageVaults = useAuthStore((state) => (state.permissions & PERMISSION_VAULT_MANAGE) !== 0)
  const writableVaults = useMemo(
    () => [...vaults.values()].filter((vault) => vault.status === 'ready' && vault.metadata),
    [vaults],
  )
  const [mode, setMode] = useState<'new' | 'update'>(target.kind === 'update' ? 'update' : 'new')
  const targetVault = target.vaultId ? vaults.get(target.vaultId) : undefined
  const targetIndex = target.entryId ? targetVault?.entries.get(target.entryId)?.payload : undefined
  const [label, setLabel] = useState(payload.label ?? targetIndex?.memberLabel ?? '')
  const [vaultId, setVaultId] = useState(() =>
    writableVaults.some((vault) => vault.vaultId === target.suggestedVaultId)
      ? target.suggestedVaultId! : writableVaults[0]?.vaultId ?? '')
  const [grantEnabled, setGrantEnabled] = useState(true)
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const [conflict, setConflict] = useState<Conflict>(null)
  const approve = useApproveSubmission()
  const deny = useDenySubmission()
  const summary = submissionSummaryKeys(item)
  const entryType = submissionEntryTypeName(submission.entryType)
  const accessVaultId = mode === 'update' ? target.vaultId : vaultId
  const coverage = useExistingAgentAccess(item.agentId, accessVaultId, mode === 'update' ? target.entryId : undefined)
  const agent = useQuery({
    queryKey: ['submissions', 'agent', item.agentId],
    queryFn: () => getAgent(item.agentId),
    staleTime: 0,
  })
  const agentActive = agent.data?.status === AGENT_STATUS_ACTIVE && Boolean(agent.data.publicKey)
  const covered = coverage.data === 'full' || coverage.data === 'entry'
  const duplicate = mode === 'new' && entryType === 'credential' ? findDuplicate(vaults, payload) : null
  const labelValid = mode === 'update' || label.trim().length > 0
  const busy = approve.isPending || deny.isPending
  const canApprove = canManageVaults && labelValid && !busy && conflict !== 'stale' && conflict !== 'typeMismatch'
    && (mode === 'update' || Boolean(vaultId)) && !coverage.isPending

  function handleApprove() {
    const grantRecipient = grantEnabled && !covered && agentActive
      ? { agentId: item.agentId, publicKey: agent.data!.publicKey!, recipientKeyVersion: agent.data!.recipientKeyVersion }
      : undefined
    const input = mode === 'new'
      ? { kind: 'new' as const, submissionId: item.submissionId, vaultId, payload, label: label.trim(), agent: grantRecipient }
      : {
          kind: 'update' as const, submissionId: item.submissionId, vaultId: target.vaultId!, entryId: target.entryId!,
          expectedEntryRevision: target.expectedEntryRevision!, payload, agent: grantRecipient,
          ...(label.trim() && label.trim() !== targetIndex?.memberLabel ? { label: label.trim() } : {}),
        }
    approve.mutate(input, {
      onSuccess: (result) => {
        toast.success(t('submissions.decision.approved'))
        onApproved(result)
      },
      onError: async (error) => {
        if (error instanceof StaleSubmissionTargetError || await hasApiErrorKey(error, 'stale-target-revision')) {
          setConflict('stale')
          useMemberSyncStore.getState().retry()
          return
        }
        if (error instanceof AgentSubmissionCryptoError && error.code === 'entry-type-mismatch') {
          setConflict('typeMismatch')
          return
        }
        if (await hasApiErrorKey(error, 'submission-already-decided')
          || await hasApiErrorKey(error, 'approver-key-rotated')) {
          toast.error(t('submissions.decision.changedElsewhere'))
          void queryClient.invalidateQueries({ queryKey: SUBMISSIONS_QUERY_KEY })
          return
        }
        if (await hasApiErrorKey(error, 'agent-already-has-access')) {
          toast.error(t('submissions.decision.agentAlreadyHasAccess'))
          void coverage.refetch()
          return
        }
        toast.error(t('submissions.decision.approveFailed'))
      },
    })
  }

  function handleDeny() {
    deny.mutate(item.submissionId, {
      onSuccess: () => toast.success(t('submissions.decision.denied')),
      onError: () => toast.error(t('submissions.decision.denyFailed')),
    })
  }

  function switchToNewEntry() {
    setConflict(null)
    setMode('new')
    if (!label.trim() && targetIndex?.memberLabel) setLabel(targetIndex.memberLabel)
  }

  const content = payload.content
  const secretField = (id: 'password' | 'value', labelKey: string) => content[id] !== undefined ? (
    <SecretInput
      id={`submission-${id}`}
      label={t(labelKey)}
      value={content[id]!}
      onChange={() => undefined}
      readOnly
      monospace={id === 'value'}
      shown={Boolean(shown[id])}
      onToggleShown={() => setShown((current) => ({ ...current, [id]: !current[id] }))}
    />
  ) : null

  return (
    <div className="flex flex-col gap-4">
      <section className={`${DETAIL_SURFACE_CLASSES} p-4`}>
        <div className="flex min-w-0 items-center gap-3">
          <AgentAvatar agent={{ name: item.agentName, agentId: item.agentId, iconKey: agent.data?.iconKey ?? null }} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">{item.agentName}</h2>
            <p className="truncate text-meta text-[var(--cv-t3)]">
              {t(summary.kindKey)} · {t(summary.typeKey)} · {formatRelativeTime(item.createdAt, t)}
            </p>
          </div>
        </div>
        {target.kind === 'update' && (
          <p className="mt-4 border-t border-[var(--cv-divider)] pt-4 text-ui text-[var(--cv-t2)]">
            {t('submissions.review.updates')}{' '}
            <span className="font-semibold text-[var(--cv-t1)]">
              {targetIndex?.memberLabel ?? t('submissions.review.unknownEntry')}
            </span>
            {targetVault?.metadata?.name ? <span> · {targetVault.metadata.name}</span> : null}
          </p>
        )}
      </section>

      {target.kind === 'update' && (
        <WarningZone title={t('submissions.review.updateWarningTitle')}>
          {t('submissions.review.updateWarning')}
        </WarningZone>
      )}

      {conflict === 'stale' && (
        <WarningZone title={t('submissions.review.staleTitle')}>{t('submissions.review.stale')}</WarningZone>
      )}
      {conflict === 'typeMismatch' && (
        <WarningZone title={t('submissions.review.typeMismatchTitle')}>{t('submissions.review.typeMismatch')}</WarningZone>
      )}
      {conflict && (
        <div className="flex justify-end">
          <Button variant="subtle" size="sm" icon="add" onClick={switchToNewEntry}>
            {t('submissions.review.saveAsNew')}
          </Button>
        </div>
      )}

      <section className={`${DETAIL_SURFACE_CLASSES} flex flex-col gap-3 p-4`}>
        <FormInput
          id="submission-label"
          label={t('submissions.review.label')}
          value={label}
          maxLength={256}
          onChange={(event) => setLabel(event.target.value)}
          error={!labelValid}
        />
        {mode === 'new' && (
          <FormSelect
            id="submission-vault"
            label={t('submissions.review.vault')}
            value={vaultId}
            onChange={(event) => setVaultId(event.target.value)}
            disabled={writableVaults.length === 0}
          >
            {writableVaults.map((vault) => (
              <option key={vault.vaultId} value={vault.vaultId}>{vault.metadata!.name}</option>
            ))}
          </FormSelect>
        )}
        {content.username !== undefined && (
          <FormInput id="submission-username" label={t('submissions.review.username')} value={content.username} readOnly />
        )}
        {secretField('password', target.kind === 'update' ? 'submissions.review.newPassword' : 'submissions.review.password')}
        {secretField('value', 'submissions.review.value')}
        {content.url !== undefined && (
          <FormInput id="submission-url" label={t('submissions.review.url')} value={content.url} readOnly />
        )}
        {content.notes !== undefined && (
          <FormTextarea id="submission-notes" label={t('submissions.review.notes')} value={content.notes} readOnly />
        )}
        {duplicate && (
          <p className="flex items-start gap-2 text-meta text-[var(--cv-t3)]" role="status">
            <Icon name="info" size={16} className="mt-0.5 shrink-0" />
            <span>{t('submissions.review.duplicate', { label: duplicate.label, vault: duplicate.vaultName })}</span>
          </p>
        )}
      </section>

      <section className={`${DETAIL_SURFACE_CLASSES} p-4`} aria-labelledby="submission-access-title">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 id="submission-access-title" className="text-heading-sm font-bold text-[var(--cv-t1)]">
              {t('submissions.access.title')}
            </h3>
            <p className="mt-1 text-meta text-[var(--cv-t3)]">
              {coverage.data === 'full' ? t('submissions.access.coveredFull', { agent: item.agentName })
                : coverage.data === 'entry' ? t('submissions.access.coveredEntry', { agent: item.agentName })
                  : !agentActive && agent.isSuccess ? t('submissions.access.agentInactive')
                    : t('submissions.access.description', { agent: item.agentName })}
            </p>
          </div>
          {!covered && (
            <ToggleSwitch
              checked={grantEnabled && agentActive}
              label={t('submissions.access.toggle')}
              disabled={!agentActive || busy}
              onChange={setGrantEnabled}
            />
          )}
        </div>
      </section>

      {!canManageVaults && (
        <p className="text-meta text-[var(--cv-t3)]" role="status">{t('submissions.decision.vaultManageRequired')}</p>
      )}

      <div className="flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
        <Button variant="subtle" size="sm" icon="delete" disabled={busy} onClick={handleDeny}>
          {t('submissions.decision.deny')}
        </Button>
        <Button variant="positive" size="sm" icon="check" disabled={!canApprove} onClick={handleApprove}>
          {approve.isPending ? t('submissions.decision.approving') : t('submissions.decision.approve')}
        </Button>
      </div>
    </div>
  )
}
