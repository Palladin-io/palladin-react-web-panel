import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../shared/components/button'
import { ErrorState } from '../../shared/components/error-state'
import { FeedbackSlot, FormInput } from '../../shared/components/form-field'
import { FormSelect } from '../../shared/components/form-select'
import { Icon } from '../../shared/components/icon'
import { DialogFooter } from '../../shared/components/dialog-footer'
import { ModalShell } from '../../shared/components/modal-shell'
import { analytics } from '../../shared/lib/analytics'
import { firstError, required } from '../../shared/lib/validation'
import {
  approveAgentPairing,
  approveAgentPairingWithNewKey,
  claimAgentPairing,
  claimAgentPairingForNewKey,
  rejectAgentPairing,
  reserveAgentPairingDisplayName,
  type AgentPairingClaim,
} from './api/agents-api'
import { typeLabel } from './components/agent-type-combobox'
import { AgentAvatar } from './components/agent-avatar'
import { AgentIconBrowser } from './components/agent-icon-picker'
import { formatAgentDateTime } from './components/agent-presentation'
import {
  createFriendlyAgentName,
  FRIENDLY_AGENT_NAME_COUNT,
  normalizeAgentMetadata,
} from './pairing-metadata'
import { AGENTS_QUERY_KEY } from './use-agents'
import { AGENT_ICON_ALLOWED_TYPES, AGENT_ICON_MAX_BYTES, AGENT_ICON_MAX_MB, uploadAgentIcon } from './upload-agent-icon'

const CREATE_API_KEY = '__create__'

type PairingTerminalStatus = 'approved' | 'rejected' | 'expired'

interface AgentPairingView extends AgentPairingClaim {
  initialDisplayName: string
  fallbackNameUnavailable: boolean
  terminalStatus?: PairingTerminalStatus
}

export interface AgentPairingPageProps {
  pairingId: string
  canReadApiKeys: boolean
  prepareDiscovery: (signal: AbortSignal) => Promise<boolean>
  onApproved: (agentId: string) => Promise<void>
  onRejected: () => Promise<void>
  /** Leave the request pending so the same deep link can be reopened. */
  onClose?: () => void
}

export function AgentPairingPage({
  pairingId,
  canReadApiKeys,
  prepareDiscovery,
  onApproved,
  onRejected,
  onClose,
}: AgentPairingPageProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const pairingQueryKey = ['agent-pairing', pairingId, canReadApiKeys] as const
  const reconciliationController = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    reconciliationController.current = controller
    return () => controller.abort()
  }, [pairingId])
  const language = i18n.resolvedLanguage ?? i18n.language
  const claim = useQuery<AgentPairingView>({
    queryKey: pairingQueryKey,
    queryFn: async () => {
      const data = await (canReadApiKeys ? claimAgentPairing : claimAgentPairingForNewKey)(pairingId)
      const suppliedName = data.reservedDisplayName ?? data.displayName
      if (suppliedName) {
        return { ...data, initialDisplayName: suppliedName, fallbackNameUnavailable: false }
      }
      const rejectedCandidates = new Set<string>()
      for (let attempt = 0; attempt < FRIENDLY_AGENT_NAME_COUNT; attempt += 1) {
        const candidate = createFriendlyAgentName(language, rejectedCandidates)
        try {
          await reserveAgentPairingDisplayName(pairingId, candidate)
          return { ...data, initialDisplayName: candidate, fallbackNameUnavailable: false }
        } catch (error) {
          if (responseStatus(error) !== 409) throw error
          rejectedCandidates.add(candidate)
        }
      }
      return { ...data, initialDisplayName: '', fallbackNameUnavailable: true }
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  })
  const [editedDisplayName, setEditedDisplayName] = useState<string>()
  const [deadlineReached, setDeadlineReached] = useState(false)
  useEffect(() => {
    if (!claim.data) return
    const delay = Math.max(0, Date.parse(claim.data.expiresAt) - Date.now())
    const timer = window.setTimeout(() => setDeadlineReached(true), delay)
    return () => window.clearTimeout(timer)
  }, [claim.data?.expiresAt, claim.data])
  const [iconKey, setIconKey] = useState<string>()
  const [customIcon, setCustomIcon] = useState<{ file: File; previewUrl: string }>()
  useEffect(() => () => {
    if (customIcon) URL.revokeObjectURL(customIcon.previewUrl)
  }, [customIcon])
  const [showIconBrowser, setShowIconBrowser] = useState(false)
  const iconButtonRef = useRef<HTMLButtonElement>(null)
  const [editedApiKeyChoice, setEditedApiKeyChoice] = useState<string>()
  const [newApiKeyName, setNewApiKeyName] = useState('')
  const [nameConflict, setNameConflict] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [newApiKeyNameTouched, setNewApiKeyNameTouched] = useState(false)

  const displayName = editedDisplayName ?? claim.data?.initialDisplayName ?? ''
  const apiKeyChoice = editedApiKeyChoice
    ?? claim.data?.apiKeys[0]?.apiKeyId
    ?? (claim.data?.canCreateApiKey ? CREATE_API_KEY : '')

  const approve = useMutation({
    mutationFn: async () => {
      const normalizedName = normalizeAgentMetadata(displayName ?? '', 64)
      if (!normalizedName) throw new Error('invalid-name')
      try {
        await reserveAgentPairingDisplayName(pairingId, normalizedName)
      } catch (error) {
        if (responseStatus(error) === 409) throw new Error('name-conflict')
        throw error
      }
      const approvalMetadata = {
        displayName: normalizedName,
        ...(!customIcon && iconKey ? { iconKey } : {}),
      }
      const { agentId } = apiKeyChoice === CREATE_API_KEY
        ? await approveAgentPairingWithNewKey(pairingId, { ...approvalMetadata, newApiKeyName: newApiKeyName.trim() })
        : await approveAgentPairing(pairingId, { ...approvalMetadata, apiKeyId: apiKeyChoice })

      const signal = reconciliationController.current.signal
      if (signal.aborted) return { agentId, discoveryReady: false, cancelled: true }
      const iconUploadFailed = customIcon ? !(await uploadAgentIcon(agentId, customIcon.file)).ok : false
      if (signal.aborted) return { agentId, discoveryReady: false, cancelled: true }
      const discoveryReady = await prepareDiscovery(signal)
      return { agentId, discoveryReady, iconUploadFailed, cancelled: signal.aborted }
    },
    onSuccess: async ({ agentId, discoveryReady, iconUploadFailed, cancelled }) => {
      queryClient.setQueryData<AgentPairingView>(pairingQueryKey, (data) => (
        data ? { ...data, terminalStatus: 'approved' } : data
      ))
      await queryClient.invalidateQueries({ queryKey: AGENTS_QUERY_KEY })
      if (cancelled) return
      toast.success(discoveryReady ? t('agents.pairing.success') : t('agents.pairing.discoveryPending'))
      if (iconUploadFailed) toast.error(t('agents.pairing.iconUploadFailed'))
      await onApproved(agentId)
      queryClient.removeQueries({ queryKey: pairingQueryKey, exact: true })
    },
    onError: (error) => {
      if (reconciliationController.current.signal.aborted) return
      if (responseStatus(error) === 404 && claim.data && Date.parse(claim.data.expiresAt) <= Date.now()) {
        setDeadlineReached(true)
        toast.error(t('agents.pairing.terminal.expired'))
        return
      }
      const conflict = error.message === 'name-conflict'
      setNameConflict(conflict)
      if (conflict) {
        setNameTouched(true)
      } else {
        toast.error(t('agents.pairing.actionError'))
      }
    },
  })

  const reject = useMutation({
    mutationFn: () => rejectAgentPairing(pairingId),
    onSuccess: () => {
      queryClient.setQueryData<AgentPairingView>(pairingQueryKey, (data) => (
        data ? { ...data, terminalStatus: 'rejected' } : data
      ))
    },
  })

  const handleApprove = () => {
    setNameTouched(true)
    setNewApiKeyNameTouched(true)
    analytics.capture('agents', 'browser-pairing-approval-submitted')
    approve.mutate()
  }

  const handleReject = () => {
    analytics.capture('agents', 'browser-pairing-rejection-submitted')
    reject.mutate(undefined, {
      onSuccess: async () => {
        await onRejected()
        queryClient.removeQueries({ queryKey: pairingQueryKey, exact: true })
      },
      onError: () => toast.error(t('agents.pairing.actionError')),
    })
  }

  if (claim.isPending) {
    return <PairingShell onClose={onClose}><p role="status" className="text-ui text-[var(--cv-t2)]">{t('agents.pairing.loading')}</p></PairingShell>
  }
  if (claim.isError || !claim.data) {
    return <PairingShell onClose={onClose}><ErrorState message={t(responseStatus(claim.error) === 404 ? 'agents.pairing.unavailable' : 'agents.pairing.loadError')} onRetry={claim.refetch} /></PairingShell>
  }
  const actionPending = approve.isPending || reject.isPending
  if (claim.data.terminalStatus || (deadlineReached && !actionPending)) {
    return (
      <PairingShell onClose={actionPending ? undefined : onClose}>
        <p role="status" className="text-ui text-[var(--cv-t2)]">
          {t(`agents.pairing.terminal.${claim.data.terminalStatus ?? 'expired'}`)}
        </p>
      </PairingShell>
    )
  }

  const normalizedName = normalizeAgentMetadata(displayName, 64)
  const fallbackNameUnavailable = claim.data.fallbackNameUnavailable
    && editedDisplayName === undefined
  const showNameError = fallbackNameUnavailable
    || (nameTouched && (!normalizedName || nameConflict))
  const creatingKey = apiKeyChoice === CREATE_API_KEY
  const newApiKeyNameError = creatingKey
    ? firstError(newApiKeyName, [required(t('agents.pairing.newApiKeyNameRequired'))])
    : null
  const showNewApiKeyNameError = newApiKeyNameTouched && newApiKeyNameError !== null
  const canApprove = Boolean(
    normalizedName && apiKeyChoice && newApiKeyNameError === null,
  )

  return (
    <PairingShell
      onClose={actionPending ? undefined : onClose}
      footer={
        <DialogFooter>
          <Button variant="outline" size="sm" className="min-w-0 flex-1" onClick={handleReject} disabled={actionPending}>
            {t('agents.pairing.reject')}
          </Button>
          <Button variant="accent" size="sm" className="min-w-0 flex-[2]" type="submit" form="agent-pairing-approval" disabled={!canApprove || actionPending}>
            {approve.isPending ? t('agents.pairing.approving') : t('agents.pairing.approve')}
          </Button>
        </DialogFooter>
      }
    >
      <form id="agent-pairing-approval" className="flex w-full min-w-0 flex-col gap-3" onSubmit={(event) => {
        event.preventDefault()
        if (canApprove && !actionPending) handleApprove()
      }}>
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <button
              ref={iconButtonRef}
              type="button"
              aria-label={t('agents.agentIcon')}
              aria-haspopup="dialog"
              disabled={actionPending}
              onClick={() => setShowIconBrowser(true)}
              className="relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--cv-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AgentAvatar agent={{ agentId: pairingId, name: displayName, iconKey: customIcon?.previewUrl ?? iconKey ?? null }} size={48} />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] text-[var(--cv-t2)]">
                <Icon name="edit" size={12} />
              </span>
            </button>
            <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-between gap-1 self-stretch">
              <p className="break-words text-heading font-semibold text-[var(--cv-t1)]">{displayName || t('agents.pairing.displayName')}</p>
              <dl className="min-w-0 self-end break-words text-right text-meta text-[var(--cv-t2)]">
                <dt className="sr-only">{t('agents.pairing.type')}</dt>
                <dd className="break-words">{claim.data.type ? typeLabel(claim.data.type, t) : t('agents.pairing.typeAbsent')}</dd>
              </dl>
            </div>
          </div>
          <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-micro text-[var(--cv-t3)]">
            <dt>{t('agents.pairing.hostname')}</dt>
            <dd className="break-words text-right">{claim.data.hostname || '—'}</dd>
            <dt>{t('agents.pairing.ip')}</dt>
            <dd className="break-words text-right">{claim.data.ip || '—'}</dd>
            <dt>{t('agents.pairing.publicKey')}</dt>
            <dd className="break-words text-right">{claim.data.publicKeyHint}</dd>
            <dt>{t('agents.pairing.expiresLabel')}</dt>
            <dd className="break-words text-right">{formatAgentDateTime(claim.data.expiresAt)}</dd>
          </dl>
        </div>
        {showIconBrowser && (
          <AgentIconBrowser
            currentIcon={iconKey}
            onSelectIcon={(next) => {
              setCustomIcon(undefined)
              setIconKey(next)
            }}
            onFileSelected={(file) => {
              if (!AGENT_ICON_ALLOWED_TYPES.includes(file.type)) {
                toast.error(t('vault.iconUploadError.invalidType'))
                return false
              }
              if (file.size > AGENT_ICON_MAX_BYTES) {
                toast.error(t('vault.iconUploadError.tooLarge', { maxMb: AGENT_ICON_MAX_MB }))
                return false
              }
              setCustomIcon({ file, previewUrl: URL.createObjectURL(file) })
              return true
            }}
            currentColor={undefined}
            onSelectColor={undefined}
            onClose={() => {
              setShowIconBrowser(false)
              requestAnimationFrame(() => iconButtonRef.current?.focus())
            }}
          />
        )}
        <div>
          <FormInput
            id="pairing-display-name"
            label={t('agents.pairing.displayName')}
            value={displayName}
            onChange={(event) => {
              setEditedDisplayName(event.target.value)
              setNameConflict(false)
              setNameTouched(false)
            }}
            onBlur={() => setNameTouched(true)}
            disabled={actionPending}
            error={showNameError}
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? 'pairing-name-feedback' : undefined}
          />
          <FeedbackSlot visible={showNameError} color="red">
            <span id="pairing-name-feedback">
              {nameConflict
                ? t('agents.pairing.nameConflict')
                : fallbackNameUnavailable
                  ? t('agents.pairing.fallbackNameUnavailable')
                  : t('agents.pairing.invalidName')}
            </span>
          </FeedbackSlot>
        </div>
        <FormSelect
          id="pairing-api-key"
          label={t('agents.pairing.apiKey')}
          value={apiKeyChoice}
          disabled={actionPending}
          onChange={(event) => {
            setEditedApiKeyChoice(event.target.value)
            setNewApiKeyNameTouched(false)
          }}
        >
          <option value="" disabled>{t('agents.pairing.selectApiKey')}</option>
          {claim.data.apiKeys.map((key) => (
            <option key={key.apiKeyId} value={key.apiKeyId}>{key.name} · {key.keyHint}</option>
          ))}
          {claim.data.canCreateApiKey ? (
            <option value={CREATE_API_KEY}>{t('agents.pairing.createApiKey')}</option>
          ) : null}
        </FormSelect>
        {creatingKey ? (
          <div>
            <FormInput
              id="pairing-new-api-key-name"
              label={t('agents.pairing.newApiKeyName')}
              value={newApiKeyName}
              onChange={(event) => {
                setNewApiKeyName(event.target.value)
                setNewApiKeyNameTouched(false)
              }}
              onBlur={() => setNewApiKeyNameTouched(true)}
              disabled={actionPending}
              error={showNewApiKeyNameError}
              aria-invalid={showNewApiKeyNameError || undefined}
              aria-describedby={showNewApiKeyNameError ? 'pairing-api-key-name-feedback' : undefined}
              maxLength={200}
            />
            <FeedbackSlot visible={showNewApiKeyNameError} color="red">
              <span id="pairing-api-key-name-feedback">{newApiKeyNameError}</span>
            </FeedbackSlot>
          </div>
        ) : null}

        {!claim.data.canCreateApiKey && claim.data.apiKeys.length === 0 && (
          <p role="status" className="text-meta text-[var(--cv-t2)]">{t('agents.pairing.noAvailableApiKey')}</p>
        )}
      </form>
    </PairingShell>
  )
}

function PairingShell({ children, footer, onClose }: { children: React.ReactNode; footer?: React.ReactNode; onClose?: () => void }) {
  const { t } = useTranslation()
  return (
    <ModalShell
      ariaLabel={t('agents.pairing.title')}
      title={t('agents.pairing.title')}
      width={560}
      onClose={onClose}
      trapFocus
      footer={footer}
    >
      {children}
    </ModalShell>
  )
}

function responseStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status
}
