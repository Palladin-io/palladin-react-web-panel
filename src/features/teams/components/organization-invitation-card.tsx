import { MetadataBadge } from '../../../shared/components/metadata-badge'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { SELECTED_NAVIGATION_CARD_CLASSES, NAVIGATION_ROW_CLASSES, ENTITY_ICON_FRAME_CLASSES } from '../../../shared/lib/styles'
import type { OrganizationInvitation } from '../api/organization-invitations-api'

export function OrganizationInvitationCard({
  invitation,
  isSelected,
  onCancel,
}: {
  invitation: OrganizationInvitation
  isSelected: boolean
  onCancel: (invitation: OrganizationInvitation) => void
}) {
  const { t, i18n } = useTranslation()

  return (
    <article className="relative">
      <Link
        to="/settings/team/invitations/$invitationId"
        params={{ invitationId: invitation.id }}
        aria-current={isSelected ? 'page' : undefined}
        className={`block overflow-hidden ${NAVIGATION_ROW_CLASSES}${
          isSelected ? ` ${SELECTED_NAVIGATION_CARD_CLASSES}` : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-3 px-3 py-3">
          <span
            aria-hidden="true"
            className={`${ENTITY_ICON_FRAME_CLASSES} size-8 bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]`}
          >
            <Icon name="mail" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-ui font-medium text-[var(--cv-t1)]">
                {invitation.email}
              </p>
              <MetadataBadge color="var(--cv-pending)">
                {t('team.invitations.pending')}
              </MetadataBadge>
            </div>
            <p className="truncate text-meta text-[var(--cv-t3)]">{invitation.roleName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-3 pb-3 pr-20">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-micro text-[var(--cv-t3)]">
            <Icon name="calendar_today" size={12} color="var(--cv-t3)" className="shrink-0" />
            {t('team.invitations.sentLabel', {
              date: formatInvitationDate(invitation.sentAt, i18n.resolvedLanguage),
            })}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-micro text-[var(--cv-t3)]">
            <Icon name="schedule" size={12} color="var(--cv-t3)" className="shrink-0" />
            {t('team.invitations.expiresRelative', {
              relative: formatTimeUntil(invitation.expiresAt, i18n.resolvedLanguage),
            })}
          </span>
        </div>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        className="absolute bottom-2 right-3 !h-6 !rounded-md !px-2 !text-micro text-[var(--cv-primary)]"
        onClick={() => onCancel(invitation)}
      >
        {t('team.invitations.cancel')}
      </Button>
    </article>
  )
}

function formatTimeUntil(value: string, locale?: string): string {
  const expiresAt = new Date(value)
  if (Number.isNaN(expiresAt.getTime())) return value
  const hours = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 3_600_000))
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })
  return hours < 24
    ? formatter.format(hours, 'hour')
    : formatter.format(Math.ceil(hours / 24), 'day')
}

function formatInvitationDate(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
