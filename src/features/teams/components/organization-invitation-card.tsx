import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { Icon } from '../../../shared/components/icon'
import { HOVERABLE_CARD_CLASSES, METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
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
        className={`block overflow-hidden ${HOVERABLE_CARD_CLASSES}${
          isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-3 px-4 py-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]"
          >
            <Icon name="mail" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-ui font-semibold text-[var(--cv-t1)]">
                {invitation.email}
              </p>
              <span className={`${METADATA_BADGE_CLASSES} bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]`}>
                {t('team.invitations.pending')}
              </span>
            </div>
            <p className="truncate text-meta text-[var(--cv-t3)]">{invitation.roleName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-[var(--cv-divider)] bg-[var(--cv-card-footer)] px-4 py-2 pr-20">
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
        className="absolute bottom-1 right-4 !h-6 !rounded-md !px-2 !text-micro text-[var(--cv-primary)]"
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
