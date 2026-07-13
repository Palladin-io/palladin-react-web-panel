import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type { OrganizationMember } from '../api/team-members-api'

export interface TeamMemberCardProps {
  member: OrganizationMember
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const { t, i18n } = useTranslation()
  const displayName = member.displayName.trim() || member.email

  return (
    <article
      className="grid gap-4 rounded-2xl border border-[var(--cv-border)]
        bg-[var(--cv-card-bg)] p-4 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto]
        md:items-center"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-full
            bg-[rgb(var(--cv-info-rgb)/0.14)] text-ui font-bold text-[var(--cv-info)]"
        >
          {memberInitials(displayName)}
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
              {displayName}
            </h2>
            {member.isOwner ? <OwnerBadge /> : null}
          </div>
          <p className="truncate text-meta text-[var(--cv-t3)]">{member.email}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-micro font-medium text-[var(--cv-t3)]">
          {t('team.rolesLabel')}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {member.roles.length > 0 ? (
            member.roles.map((role) => (
              <span
                key={role.id}
                className={`max-w-full break-words rounded-full px-2.5 py-1 text-micro font-medium ${
                  role.isSystem
                    ? 'bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]'
                    : 'bg-[var(--cv-bg-subtle)] text-[var(--cv-t2)]'
                }`}
              >
                {role.name}
              </span>
            ))
          ) : (
            <span className="text-meta text-[var(--cv-t3)]">
              {t('team.noRoles')}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-meta text-[var(--cv-t3)] md:justify-end">
        <Icon name="calendar_today" size={16} color="var(--cv-t3)" />
        <span>
          {t('team.joinedLabel', {
            date: formatJoinedDate(member.joinedAt, i18n.resolvedLanguage),
          })}
        </span>
      </div>
    </article>
  )
}

function OwnerBadge() {
  const { t } = useTranslation()

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full
        bg-[var(--cv-bg-subtle)] px-2 py-1 text-micro font-semibold
        text-[var(--cv-premium)]"
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
