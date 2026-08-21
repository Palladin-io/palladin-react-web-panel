import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
import type { OrganizationMember } from '../api/team-members-api'

export interface TeamMemberCardProps {
  member: OrganizationMember
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const { t, i18n } = useTranslation()
  const displayName = member.displayName.trim() || member.email

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-3 px-4 py-3">
        <div
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full
            bg-[rgb(var(--cv-info-rgb)/0.14)] text-ui font-bold text-[var(--cv-info)]"
        >
          {memberInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="min-w-0 flex-1 truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
              {displayName}
            </h2>
            {member.isOwner ? <OwnerBadge /> : null}
          </div>
          <p className="truncate text-meta text-[var(--cv-t3)]">{member.email}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-micro text-[var(--cv-t3)]">
          <Icon name="calendar_today" size={12} color="var(--cv-t3)" />
          {t('team.joinedLabel', {
            date: formatJoinedDate(member.joinedAt, i18n.resolvedLanguage),
          })}
        </span>
        <span className="shrink-0 text-micro text-[var(--cv-t3)]">
          {t('team.roleCount', { count: member.roles.length })}
        </span>
      </div>
    </div>
  )
}

function OwnerBadge() {
  const { t } = useTranslation()

  return (
    <span
      className={`${METADATA_BADGE_CLASSES} bg-[var(--cv-bg-subtle)] text-[var(--cv-premium)]`}
    >
      <Icon name="shield_person" size={14} color="var(--cv-premium)" />
      {t('team.owner')}
    </span>
  )
}

function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatJoinedDate(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
