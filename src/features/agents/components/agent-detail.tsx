import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { ModalShell } from '../../../shared/components/modal-shell'
import { analytics } from '../../../shared/lib/analytics'
import {
  AGENT_STATUS_ACTIVE,
  AGENT_STATUS_DEACTIVATED,
  AGENT_STATUS_PENDING,
  type Agent,
  type AgentType,
} from '../api/agents-api'
import { useApproveAgent } from '../use-approve-agent'
import { useDeactivateAgent } from '../use-deactivate-agent'
import { useReactivateAgent } from '../use-reactivate-agent'
import { AgentAvatar } from './agent-avatar'
import { AgentEditForm } from './agent-edit-form'
import {
  agentDisplayName,
  agentTypeLabelKey,
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
}

/**
 * Right-side detail panel of the Agents split view. Shows a hero card with
 * agent identity and a tab bar: Details (metadata + action zone), Grants
 * (disabled for non-active agents), Logs (lifecycle timeline).
 */
export function AgentDetail({ agent }: AgentDetailProps) {
  const { t } = useTranslation()
  const approve = useApproveAgent()
  const deactivate = useDeactivateAgent()
  const reactivate = useReactivateAgent()

  const [activeTab, setActiveTab] = useState<AgentDetailTab>('details')
  const [isEditing, setIsEditing] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [deactivateOpen, setDeactivateOpen] = useState(false)

  const name = agentDisplayName(agent, t('agents.unnamed'))
  const isAgentActive = agent.status === AGENT_STATUS_ACTIVE

  const handleConfirmApprove = (input: {
    name?: string
    type?: AgentType
    iconKey?: string
    iconColor?: string
  }) => {
    approve.mutate(
      { agentId: agent.agentId, input },
      {
        onSuccess: () => {
          analytics.capture('agents', 'agent-approved')
          setApproveOpen(false)
        },
        onError: () => {
          setApproveOpen(false)
          toast.error(t('agents.errorApprove'))
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

  return (
    <>
      {/* Hero card — always visible, shows identity */}
      <div
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex items-start gap-3">
          <AgentAvatar agent={agent} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate text-[16px] font-bold text-[var(--cv-t1)]">
                {name}
              </h2>
              <div className="flex shrink-0 items-center gap-2">
                <AgentStatusBadge status={agent.status} />
                {!isEditing && agent.status !== AGENT_STATUS_PENDING ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    aria-label={t('agents.edit')}
                    className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
                  >
                    <Icon name="edit" size={16} />
                  </button>
                ) : null}
              </div>
            </div>
            {agent.type ? (
              <span
                className="mt-1.5 inline-flex items-center rounded-full bg-[var(--cv-btn-subtle-bg)]
                  px-2 py-0.5 text-[10px] font-semibold text-[var(--cv-t2)]"
              >
                {t(agentTypeLabelKey(agent.type))}
              </span>
            ) : null}
            {!isEditing && agent.description ? (
              <p className="mt-1 text-[12px] text-[var(--cv-t3)]">{agent.description}</p>
            ) : null}
          </div>
        </div>

        {isEditing ? (
          <div className="mt-5 border-t border-[var(--cv-divider)] pt-4">
            <AgentEditForm
              agent={agent}
              onSaved={() => setIsEditing(false)}
              onCancel={() => setIsEditing(false)}
            />
          </div>
        ) : null}
      </div>

      {/* Tab bar */}
      <div
        className="flex border-b border-[var(--cv-divider)]"
        role="tablist"
      >
        {AGENT_TABS.map(({ id, labelKey, requiresActive }) => {
          const disabled = requiresActive && !isAgentActive
          const isActive = id === activeTab
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={disabled}
              onClick={() => setActiveTab(id)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-[12px] transition-colors ${
                disabled
                  ? 'cursor-not-allowed border-transparent font-medium text-[var(--cv-t3)] opacity-35'
                  : isActive
                    ? 'border-[#FF4F4F] font-bold text-[#FF4F4F]'
                    : 'border-transparent font-medium text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
              }`}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>

      {/* Details tab */}
      {activeTab === 'details' && (
        <>
          <div
            className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
              dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          >
            <dl className="flex flex-col gap-3">
              <DetailRow
                label={t('agents.publicKey')}
                value={formatPublicKey(agent)}
                mono
              />
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
              {agent.deactivatedAt ? (
                <DetailRow
                  label={t('agents.deactivatedOn')}
                  value={`${formatAgentDateTime(agent.deactivatedAt)}${
                    agent.deactivatedByName ? ` · ${agent.deactivatedByName}` : ''
                  }`}
                />
              ) : null}
            </dl>
          </div>

          {/* Pending — approve zone */}
          {agent.status === AGENT_STATUS_PENDING ? (
            <ActionZone
              tone="positive"
              title={t('agents.approveZone')}
              heading={t('agents.approve')}
              hint={t('agents.approveHint')}
              action={
                <button
                  type="button"
                  onClick={() => setApproveOpen(true)}
                  disabled={approve.isPending}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[7px]
                    border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)]
                    px-3 py-1.5 text-[11px] font-semibold text-[#2EC4B6]
                    transition-colors hover:bg-[rgba(46,196,182,0.12)]
                    disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="check_circle" size={13} />
                  {t('agents.approve')}
                </button>
              }
            />
          ) : null}

          {/* Active — danger zone */}
          {agent.status === AGENT_STATUS_ACTIVE ? (
            <ActionZone
              tone="danger"
              title={t('agents.deactivateZone')}
              heading={t('agents.deactivate')}
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

          {/* Deactivated — reactivate zone */}
          {agent.status === AGENT_STATUS_DEACTIVATED ? (
            <ActionZone
              tone="positive"
              title={t('agents.reactivateZone')}
              heading={t('agents.reactivate')}
              hint={t('agents.reactivateHint')}
              action={
                <button
                  type="button"
                  onClick={handleReactivate}
                  disabled={reactivate.isPending}
                  className="flex cursor-pointer items-center gap-1.5 rounded-[7px]
                    border border-[rgba(46,196,182,0.3)] bg-[rgba(46,196,182,0.06)]
                    px-3 py-1.5 text-[11px] font-semibold text-[#2EC4B6]
                    transition-colors hover:bg-[rgba(46,196,182,0.12)]
                    disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="replay" size={13} />
                  {reactivate.isPending ? t('agents.reactivating') : t('agents.reactivate')}
                </button>
              }
            />
          ) : null}
        </>
      )}

      {/* Grants tab */}
      {activeTab === 'grants' && <GrantsTabContent />}

      {/* Logs tab */}
      {activeTab === 'logs' && <LogsTabContent agent={agent} />}

      <ApproveAgentDialog
        open={approveOpen}
        agentName={name}
        isPending={approve.isPending}
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
    </>
  )
}

// ---------------------------------------------------------------------------
// Grants tab — empty state (Grants tab is disabled for non-active agents)
// ---------------------------------------------------------------------------

function GrantsTabContent() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-full
          bg-[var(--cv-empty-bg)]"
      >
        <Icon name="key" size={22} color="var(--cv-t3)" />
      </span>
      <p className="text-[13px] font-medium text-[var(--cv-t2)]">
        {t('agents.grantsEmpty')}
      </p>
      <p className="max-w-[240px] text-[11px] text-[var(--cv-t3)]">
        {t('agents.grantsEmptyHint')}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logs tab — lifecycle timeline
// ---------------------------------------------------------------------------

function LogsTabContent({ agent }: { agent: Agent }) {
  const { t } = useTranslation()

  const events: { labelKey: string; date: string; detail?: string }[] = [
    {
      labelKey: 'agents.logsFirstConnected',
      date: formatAgentDateTime(agent.createdAt),
    },
    ...(agent.enrolledAt
      ? [
          {
            labelKey: 'agents.logsEnrolled',
            date: formatAgentDateTime(agent.enrolledAt),
            detail: agent.enrolledByName ?? undefined,
          },
        ]
      : []),
    ...(agent.deactivatedAt
      ? [
          {
            labelKey: 'agents.logsDeactivated',
            date: formatAgentDateTime(agent.deactivatedAt),
            detail: agent.deactivatedByName ?? undefined,
          },
        ]
      : []),
  ]

  return (
    <div
      className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
        dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
    >
      <ul className="flex flex-col">
        {events.map(({ labelKey, date, detail }, i) => (
          <li
            key={labelKey}
            className={`flex items-start gap-3 py-3 ${
              i < events.length - 1 ? 'border-b border-[var(--cv-divider)]' : ''
            }`}
          >
            <span
              className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center
                rounded-full bg-[var(--cv-empty-bg)]"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--cv-t3)]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-[var(--cv-t1)]">
                {t(labelKey)}
              </p>
              {detail ? (
                <p className="mt-0.5 text-[11px] text-[var(--cv-t3)]">{detail}</p>
              ) : null}
            </div>
            <span className="shrink-0 text-[11px] text-[var(--cv-t3)]">{date}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

interface ActionZoneProps {
  tone: 'positive' | 'danger'
  title: string
  heading: string
  hint: string
  action: React.ReactNode
}

function ActionZone({ tone, title, heading, hint, action }: ActionZoneProps) {
  const isPositive = tone === 'positive'
  const containerClass = isPositive
    ? 'border-[rgba(46,196,182,0.25)] bg-[rgba(46,196,182,0.04)]'
    : 'border-[rgba(255,79,79,0.25)] bg-[rgba(255,79,79,0.04)]'
  const titleClass = isPositive ? 'text-[#2EC4B6]' : 'text-[#FF4F4F]'

  return (
    <section className={`rounded-xl border p-4 ${containerClass}`}>
      <h2
        className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${titleClass}`}
      >
        {title}
      </h2>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-[var(--cv-t1)]">
            {heading}
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--cv-t3)]">{hint}</p>
        </div>
        {action}
      </div>
    </section>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-[12px] text-[var(--cv-t3)]">{label}</dt>
      <dd
        className={`text-right text-[12px] font-medium text-[var(--cv-t1)]${
          mono ? ' font-mono' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  )
}

/** Empty-state shown in the right panel when no agent is selected (wide mode). */
export function AgentDetailEmpty() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 text-center">
      <span
        className="flex h-14 w-14 items-center justify-center rounded-full
          bg-[var(--cv-empty-bg)]"
      >
        <Icon name="smart_toy" size={26} color="var(--cv-t3)" />
      </span>
      <p className="text-[13px] text-[var(--cv-t3)]">
        {t('agents.selectAgent')}
      </p>
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

function DeactivateAgentDialog({
  open,
  agentName,
  isPending,
  onConfirm,
  onCancel,
}: DeactivateAgentDialogProps) {
  const { t } = useTranslation()
  if (!open) return null

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('agents.deactivateConfirmTitle')}
      width={420}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('agents.deactivateConfirmTitle')}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('agents.deactivateConfirmBody', { name: agentName })}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="subtle"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1"
          >
            {t('agents.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-[2]"
          >
            {isPending ? t('agents.deactivating') : t('agents.deactivate')}
          </Button>
        </div>
      </div>
    </ModalShell>
  )
}
