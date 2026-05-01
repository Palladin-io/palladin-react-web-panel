import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type {
  AgentType,
  GrantStatus,
  MockAgentGrant,
} from './vault-agent-grants-mock'

export interface VaultAgentGrantCardProps {
  grant: MockAgentGrant
  onRevoke: (grant: MockAgentGrant) => void
  onRegrant: (grant: MockAgentGrant) => void
  onRestore: (grant: MockAgentGrant) => void
}

/**
 * Card representation of a single agent grant. Two zones:
 *  - Identity: agent icon + name + mode + status badge.
 *  - Footer: who/when (granted or revoked) + entry-status counts for
 *    granular grants + the right-hand action button (Revoke / Re-grant /
 *    Restore depending on status).
 *
 * Grants without a real backend yet — actions just log. Once CVT-46
 * lands the real API, the parent wires `useRevokeGrant` /
 * `useRegrantGrant` mutations into the callbacks.
 */
export function VaultAgentGrantCard({
  grant,
  onRevoke,
  onRegrant,
  onRestore,
}: VaultAgentGrantCardProps) {
  const isActive = grant.status === 'active'
  const isRevoked = grant.status === 'revoked'

  const cardStyle: React.CSSProperties = {
    borderRadius: 12,
    overflow: 'hidden',
    background: 'var(--cv-card-bg)',
    border: isRevoked
      ? '1px solid rgba(255,79,79,0.18)'
      : '1px solid var(--cv-border)',
    borderLeft: isRevoked ? '3px solid rgba(255,79,79,0.4)' : undefined,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    opacity: isActive ? 1 : 0.72,
  }

  return (
    <div style={cardStyle}>
      <IdentityZone grant={grant} />
      <FooterZone
        grant={grant}
        onRevoke={onRevoke}
        onRegrant={onRegrant}
        onRestore={onRestore}
      />
    </div>
  )
}

function IdentityZone({ grant }: { grant: MockAgentGrant }) {
  const { t } = useTranslation()
  const isRevoked = grant.status === 'revoked'
  return (
    <div className="flex items-center gap-2.5 px-3.5 py-3">
      <AgentBadge type={grant.agent.type} initials={grant.agent.initials} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
          {grant.agent.name}
        </div>
        <div className="mt-0.5 text-[11px] text-[var(--cv-t3)]">
          {grant.mode === 'full'
            ? t('vault.agent.fullAccess')
            : t('vault.agent.granular')}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {isRevoked && grant.revokedReason ? (
          <span
            title={`${t('vault.agent.revocationReason')}: ${grant.revokedReason}`}
            className="cursor-default"
          >
            <Icon name="flag" size={14} color="#FF4F4F" />
          </span>
        ) : null}
        <StatusBadge status={grant.status} />
      </div>
    </div>
  )
}

function FooterZone({
  grant,
  onRevoke,
  onRegrant,
  onRestore,
}: {
  grant: MockAgentGrant
  onRevoke: (g: MockAgentGrant) => void
  onRegrant: (g: MockAgentGrant) => void
  onRestore: (g: MockAgentGrant) => void
}) {
  const { t } = useTranslation()
  const isActive = grant.status === 'active'
  const isRevoked = grant.status === 'revoked'

  const verbKey = isRevoked ? 'vault.agent.revokedBy' : 'vault.agent.grantedBy'
  const person = isRevoked ? grant.revokedBy : grant.grantedBy
  const date = isRevoked
    ? grant.revokedAt && grant.revokedRelative
      ? `${grant.revokedAt} (${grant.revokedRelative})`
      : (grant.revokedAt ?? grant.revokedRelative ?? '')
    : grant.expiresAt
      ? `${grant.expiresAt} (${grant.expires})`
      : grant.expires

  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5"
      style={{
        borderTop: '1px solid var(--cv-divider)',
        background: 'rgba(0,0,0,0.06)',
      }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <Icon
          name={isRevoked ? 'block' : 'person'}
          size={13}
          color={isRevoked ? '#FF4F4F' : undefined}
          className={isRevoked ? '' : 'text-[var(--cv-t3)]'}
        />
        <span className="truncate text-[11px] text-[var(--cv-t3)]">
          {person ? (
            <>
              {t(verbKey)}{' '}
              <span className="font-medium text-[var(--cv-t2)]">{person}</span>
              {date ? (
                <>
                  {' · '}
                  <span className="text-[var(--cv-t1)]">{date}</span>
                </>
              ) : null}
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      {grant.mode === 'granular' && grant.entries && grant.entries.length > 0 ? (
        <EntryCounts entries={grant.entries} />
      ) : null}

      {isActive ? (
        <FooterAction
          icon="cancel"
          tone="danger"
          label={t('vault.agent.revoke')}
          onClick={() => onRevoke(grant)}
        />
      ) : isRevoked ? (
        <FooterAction
          icon="replay"
          tone="success"
          label={t('vault.agent.regrant')}
          onClick={() => onRegrant(grant)}
        />
      ) : (
        <FooterAction
          icon="refresh"
          tone="success"
          label={t('vault.agent.restore')}
          onClick={() => onRestore(grant)}
        />
      )}
    </div>
  )
}

function EntryCounts({
  entries,
}: {
  entries: NonNullable<MockAgentGrant['entries']>
}) {
  const counts = entries.reduce(
    (acc, entry) => {
      acc[entry.status] = (acc[entry.status] ?? 0) + 1
      return acc
    },
    {} as Record<GrantStatus, number>,
  )
  const active = counts.active ?? 0
  const expired = counts.expired ?? 0
  const revoked = counts.revoked ?? 0
  const summary = [
    active > 0 && { label: `${active} active`, color: '#2EC4B6' },
    expired > 0 && { label: `${expired} expired`, color: '#8A95A6' },
    revoked > 0 && { label: `${revoked} revoked`, color: '#FF4F4F' },
  ].filter(Boolean) as { label: string; color: string }[]

  return (
    <div
      title={summary.map((s) => s.label).join(' · ')}
      className="flex shrink-0 cursor-default items-center gap-1"
      style={{ margin: '0 6px' }}
    >
      <Icon name="key" size={13} color="#8A95A6" />
      <span className="whitespace-nowrap text-[11px]">
        {active > 0 ? (
          <span style={{ color: '#2EC4B6', fontWeight: 600 }}>{active}</span>
        ) : null}
        {active > 0 && (expired > 0 || revoked > 0) ? (
          <span className="text-[#8A95A6]"> · </span>
        ) : null}
        {expired > 0 ? (
          <span style={{ color: '#8A95A6', fontWeight: 600 }}>{expired}</span>
        ) : null}
        {expired > 0 && revoked > 0 ? (
          <span className="text-[#8A95A6]"> · </span>
        ) : null}
        {revoked > 0 ? (
          <span style={{ color: '#FF4F4F', fontWeight: 600 }}>{revoked}</span>
        ) : null}
      </span>
    </div>
  )
}

function FooterAction({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: string
  label: string
  tone: 'danger' | 'success'
  onClick: () => void
}) {
  const isDanger = tone === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 text-[11px]
        font-semibold transition-colors"
      style={{
        borderColor: isDanger
          ? 'rgba(255,79,79,0.25)'
          : 'rgba(46,196,182,0.3)',
        background: isDanger
          ? 'rgba(255,79,79,0.06)'
          : 'rgba(46,196,182,0.06)',
        color: isDanger ? '#FF4F4F' : '#2EC4B6',
      }}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  )
}

function AgentBadge({ type, initials }: { type: AgentType; initials: string }) {
  const palette: Record<AgentType, { bg: string; color: string }> = {
    claude: { bg: 'rgba(46,196,182,0.18)', color: '#2EC4B6' },
    cursor: { bg: 'rgba(96,165,250,0.18)', color: '#60A5FA' },
    copilot: { bg: 'rgba(167,139,250,0.18)', color: '#A78BFA' },
    openclaw: { bg: 'rgba(255,171,135,0.18)', color: '#FFAB87' },
    generic: { bg: 'rgba(138,149,166,0.18)', color: '#8A95A6' },
  }
  const tones = palette[type]
  return (
    <span
      aria-hidden
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full
        text-[11px] font-bold"
      style={{ background: tones.bg, color: tones.color }}
    >
      {initials}
    </span>
  )
}

function StatusBadge({ status }: { status: GrantStatus }) {
  const { t } = useTranslation()
  const palette: Record<GrantStatus, { bg: string; color: string; key: string }> = {
    active: {
      bg: 'rgba(46,196,182,0.1)',
      color: '#2EC4B6',
      key: 'vault.agent.statusActive',
    },
    expired: {
      bg: 'rgba(138,149,166,0.08)',
      color: '#8A95A6',
      key: 'vault.agent.statusExpired',
    },
    revoked: {
      bg: 'rgba(255,79,79,0.1)',
      color: '#FF4F4F',
      key: 'vault.agent.statusRevoked',
    },
  }
  const tones = palette[status]
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold"
      style={{ background: tones.bg, color: tones.color }}
    >
      ● {t(tones.key)}
    </span>
  )
}
