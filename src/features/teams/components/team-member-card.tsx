import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { METADATA_BADGE_CLASSES, ENTITY_ICON_FRAME_CLASSES } from '../../../shared/lib/styles'
import type { OrganizationMember } from '../api/team-members-api'

export interface TeamMemberCardProps {
  member: OrganizationMember
}

export function TeamMemberCard({ member }: TeamMemberCardProps) {
  const { t } = useTranslation()
  const displayName = member.displayName.trim() || member.email

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-3 px-3 py-3">
        <div
          aria-hidden="true"
          className={`${ENTITY_ICON_FRAME_CLASSES} size-8 bg-[rgb(var(--cv-info-rgb)/0.14)] text-meta font-medium text-[var(--cv-info)]`}
        >
          {memberInitials(displayName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h2 className="min-w-0 flex-1 truncate text-ui font-medium text-[var(--cv-t1)]">
              {displayName}
            </h2>
            {member.isOwner ? <OwnerBadge /> : null}
          </div>
          <p className="truncate text-meta text-[var(--cv-t3)]"><span>{member.email}</span> · <span>{t('team.roleCount', { count: member.roles.length })}</span></p>
        </div>
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
