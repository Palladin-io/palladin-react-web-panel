import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { analytics } from '../../../shared/lib/analytics'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
  type Agent,
  type AgentType,
} from '../api/agents-api'
import { GrantAccessDialog } from '../../grants'
import { useAgentPermissions } from '../use-agents'
import { AgentApprovalRequiresUnlockError, useApproveAgent } from '../use-approve-agent'
import { useDeactivateAgent } from '../use-deactivate-agent'
import { useReactivateAgent } from '../use-reactivate-agent'
import { useDeleteAgent } from '../use-delete-agent'
import { OrgGrantsPanel } from '../../grants'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { AgentAvatar } from './agent-avatar'
import { AgentEditForm } from './agent-edit-form'
import {
  agentDisplayName,
  formatAgentDateTime,
  formatPublicKey,
} from './agent-presentation'
import { AgentStatusBadge } from './agent-list-panel'
import { ApproveAgentDialog } from './approve-agent-dialog'

// ---------------------------------------------------------------------------
// Tab types
// ---------------------------------------------------------------------------

type AgentDetailTab = 'details' | 'grants' | 'logs'

const AGENT_TABS: { id: AgentDetailTab; labelKey: string; requiresActive?: boolean }[] = [
  { id: 'details', labelKey: 'agents.tabDetails' },
  { id: 'grants', labelKey: 'agents.tabGrants', requiresActive: true },
  { id: 'logs', labelKey: 'agents.tabLogs' },
]

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface AgentDetailProps {
  agent: Agent
  renderLogs?: (agentId: string) => ReactNode
}

/**
 * Right-side detail panel of the Agents split view. Mirrors the vault-entry
 * detail pattern: flat identity header → tab bar → per-tab content card.
 */
export function AgentDetail({ agent, renderLogs }: AgentDetailProps) {
  const { t } = useTranslation()
  const { canManage } = useAgentPermissions()
  const approve = useApproveAgent()
  const deactivate = useDeactivateAgent()
  const reactivate = useReactivateAgent()
  const del = useDeleteAgent()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<AgentDetailTab>('details')
  const [approveOpen, setApproveOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [addAccessOpen, setAddAccessOpen] = useState(false)

  const name = agentDisplayName(agent, t('agents.unnamed'))
  const isAgentActive = agent.status === AGENT_STATUS_ACTIVE
  const canEdit = canManage && isAgentActive
  const tabs = AGENT_TABS.map(({ id, labelKey, requiresActive }) => ({
    id,
    label: t(labelKey),
    disabled: Boolean(requiresActive && !isAgentActive),
  }))

  const handleConfirmApprove = (input: {
    name?: string
    type?: AgentType
    iconKey?: string
    iconColor?: string
  }) => {
    approve.mutate(
      { agentId: agent.agentId, input },
      {
        onSuccess: ({ discoveryReady }) => {
          analytics.capture('agents', 'agent-approved')
          setApproveOpen(false)
          if (discoveryReady) toast.success(t('agents.approveSuccess'))
          else toast.warning(t('agents.discoveryProvisioningPending'))
        },
        onError: (error) => {
          toast.error(t(error instanceof AgentApprovalRequiresUnlockError
            ? 'agents.approveRequiresUnlock'
            : 'agents.errorApprove'))
        },
      },
    )
  }

  const handleConfirmDeactivate = () => {
    deactivate.mutate(agent.agentId, {
      onSuccess: () => {
        analytics.capture('agents', 'agent-deactivated')
        setDeactivateOpen(false)
      },
      onError: () => {
        setDeactivateOpen(false)
        toast.error(t('agents.errorDeactivate'))
      },
    })
  }

  const handleReactivate = () => {
    reactivate.mutate(agent.agentId, {
      onSuccess: () => {
        analytics.capture('agents', 'agent-reactivated')
      },
      onError: () => {
        toast.error(t('agents.errorReactivate'))
      },
    })
  }

  const handleConfirmDelete = () => {
    del.mutate(agent.agentId, {
      onSuccess: () => {
        analytics.capture('agents', 'agent-deleted')
        setDeleteOpen(false)
        // The agent no longer exists — leave the (now-dangling) detail panel.
        navigate({ to: '/agents' })
      },
      onError: () => toast.error(t('agents.errorDelete')),
    })
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <DetailTabBar
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
          ariaLabel={t('agents.tabsLabel')}
          wide
          actions={activeTab === 'grants' ? (
            <Button
              variant="accent"
              size="sm"
              icon="add"
              onClick={() => setAddAccessOpen(true)}
            >
              {t('agents.addAccess')}
            </Button>
          ) : undefined}
        />

        {/* ── Details tab ─────────────────────────────────────────────────── */}
        {activeTab === 'details' ? (
          <ScrollArea>
          <div
            className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]
              p-5 dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          >
            {/* Identity header */}
            <div className="mb-4 flex items-start gap-3 border-b border-[var(--cv-divider)] pb-4">
              <AgentAvatar agent={agent} size={40} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-heading font-bold text-[var(--cv-t1)]">{name}</h2>
                  <span className="ml-auto"><AgentStatusBadge status={agent.status} /></span>
                </div>
              </div>
            </div>

            {/* Read-only metadata */}
            <dl className="flex flex-col gap-3">
              <DetailRow
                label={t('agents.publicKey')}
                value={formatPublicKey(agent)}
                mono
              />
              {agent.deactivatedAt ? (
                <DetailRow
                  label={t('agents.deactivatedOn')}
                  value={`${formatAgentDateTime(agent.deactivatedAt)}${
                    agent.deactivatedByName ? ` · ${agent.deactivatedByName}` : ''
                  }`}
                />
              ) : null}
              {agent.lastIp ? (
                <DetailRow
                  label={t('agents.lastIp')}
                  value={agent.lastIp}
                  mono
                />
              ) : null}
              {agent.lastHostname ? (
                <DetailRow
                  label={t('agents.lastHostname')}
                  value={agent.lastHostname}
                />
              ) : null}
              <DetailRow
                label={t('agents.connectedOn')}
                value={formatAgentDateTime(agent.createdAt)}
              />
              {agent.enrolledAt ? (
                <DetailRow
                  label={t('agents.enrolled')}
                  value={`${formatAgentDateTime(agent.enrolledAt)}${
                    agent.enrolledByName ? ` · ${agent.enrolledByName}` : ''
                  }`}
                />
              ) : null}
            </dl>

            {/* Editable fields — hidden for pending agents (nothing to configure before approval) */}
            {agent.status !== AGENT_STATUS_PENDING ? (
              <div className="mt-4 border-t border-[var(--cv-divider)] pt-4">
                <AgentEditForm agent={agent} canEdit={canEdit} />
              </div>
            ) : null}
          </div>

          {/* Action zones */}
          <div className="mt-3.5 flex flex-col gap-3">
            {agent.status === AGENT_STATUS_PENDING ? (
              <ActionZone
                tone="positive"
                title={t('agents.approveZone')}
                hint={t('agents.approveHint')}
                action={
                  <Button
                    variant="positive"
                    size="sm"
                    icon="check_circle"
                    onClick={() => setApproveOpen(true)}
                    disabled={approve.isPending}
                  >
                    {t('agents.approve')}
                  </Button>
                }
              />
            ) : null}

            {agent.status === AGENT_STATUS_ACTIVE ? (
              <ActionZone
                tone="danger"
                title={t('agents.deactivateZone')}
                hint={t('agents.deactivateHint')}
                action={
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeactivateOpen(true)}
                    disabled={deactivate.isPending}
                  >
                    {t('agents.deactivate')}
                  </Button>
                }
              />
            ) : null}

            {agent.status === AGENT_STATUS_DEACTIVATED ? (
              <ActionZone
                tone="positive"
                title={t('agents.reactivateZone')}
                hint={t('agents.reactivateHint')}
                action={
                  <Button
                    variant="positive"
                    size="sm"
                    icon="replay"
                    onClick={handleReactivate}
                    disabled={reactivate.isPending}
                  >
                    {reactivate.isPending ? t('agents.reactivating') : t('agents.reactivate')}
                  </Button>
                }
              />
            ) : null}

            {agent.status === AGENT_STATUS_DEACTIVATED ? (
              <ActionZone
                tone="danger"
                title={t('agents.deleteZone')}
                hint={t('agents.deleteHint')}
                action={
                  <Button
                    variant="danger"
                    size="sm"
                    icon="delete"
                    onClick={() => setDeleteOpen(true)}
                    disabled={del.isPending}
                  >
                    {t('agents.delete')}
                  </Button>
                }
              />
            ) : null}
          </div>
          </ScrollArea>
        ) : null}

      {/* ── Grants tab ──────────────────────────────────────────────────────
          Reuses the exact Approvals org-grants panel, filtered to this agent —
          one component, two locations. */}
        {activeTab === 'grants' ? (
          <ScrollArea>
            <OrgGrantsPanel agentId={agent.agentId} />
          </ScrollArea>
        ) : null}

        {/* ── Logs tab ────────────────────────────────────────────────────── */}
        {activeTab === 'logs' ? (
          renderLogs?.(agent.agentId)
        ) : null}
      </div>

      <ApproveAgentDialog
        key={agent.agentId}
        agentId={agent.agentId}
        open={approveOpen}
        initialName={agent.name ?? ''}
        initialType={agent.type ?? ''}
        isPending={approve.isPending}
        isProvisioning={approve.phase === 'provisioning'}
        onConfirm={handleConfirmApprove}
        onCancel={() => setApproveOpen(false)}
      />

      <DeactivateAgentDialog
        open={deactivateOpen}
        agentName={name}
        isPending={deactivate.isPending}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateOpen(false)}
      />

      <DeleteAgentDialog
        open={deleteOpen}
        agentName={name}
        isPending={del.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />

      {addAccessOpen && (
        <GrantAccessDialog
          mode={{ kind: 'target-for-agent', agentId: agent.agentId }}
          onClose={() => setAddAccessOpen(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface ActionZoneProps {
  tone: 'positive' | 'danger'
  title: string
  hint: string
  action: React.ReactNode
}

function ActionZone({ tone, title, hint, action }: ActionZoneProps) {
  const isPositive = tone === 'positive'
  return (
    <section
      className={`rounded-xl border p-4 ${
        isPositive
          ? 'border-[rgba(16,185,129,0.3)] bg-[rgba(16,185,129,0.12)]'
          : 'border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.04)]'
      }`}
    >
      <h2
        className={`text-meta font-semibold uppercase tracking-[0.06em] ${
          isPositive ? 'text-[#10B981]' : 'text-[var(--cv-primary)]'
        }`}
      >
        {title}
      </h2>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-meta text-[var(--cv-t3)]">{hint}</p>
        {action}
      </div>
    </section>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-ui text-[var(--cv-t3)]">{label}</dt>
      <dd className={`text-right text-ui font-medium text-[var(--cv-t1)]${mono ? ' font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

/** Empty-state shown in the right panel when no agent is selected (wide mode). */
export function AgentDetailEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[17.5rem] flex-col items-center justify-center gap-3 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--cv-empty-bg)]">
        <Icon name="smart_toy" size={26} color="var(--cv-t3)" />
      </span>
      <p className="text-heading-sm text-[var(--cv-t3)]">{t('agents.selectAgent')}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Deactivate confirmation dialog
// ---------------------------------------------------------------------------

interface DeactivateAgentDialogProps {
  open: boolean
  agentName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeactivateAgentDialog({ open, agentName, isPending, onConfirm, onCancel }: DeactivateAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.deactivateConfirmTitle')}
      title={t('agents.deactivateConfirmTitle')}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {isPending ? t('agents.deactivating') : t('agents.deactivate')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">
        {t('agents.deactivateConfirmBody', { name: agentName })}
      </p>
    </ModalShell>
  )
}

interface DeleteAgentDialogProps {
  open: boolean
  agentName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DeleteAgentDialog({ open, agentName, isPending, onConfirm, onCancel }: DeleteAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null
  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.deleteConfirmTitle')}
      title={t('agents.deleteConfirmTitle')}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('agents.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} disabled={isPending} className="flex-[2]">
            {isPending ? t('agents.deleting') : t('agents.delete')}
          </Button>
        </DialogFooter>
      }
    >
      <p className="text-ui text-[var(--cv-t2)]">
        {t('agents.deleteConfirmBody', { name: agentName })}
      </p>
    </ModalShell>
  )
}
