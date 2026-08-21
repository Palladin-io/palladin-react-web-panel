import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { useWideScreen } from '../../../shared/hooks/use-wide-screen'
import { METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
import type { OrganizationInvitation } from '../api/organization-invitations-api'
import { useInvitationRoles } from '../use-invitation-roles'
import {
  useResendOrganizationInvitation,
  useUpdateOrganizationInvitationRole,
} from '../use-organization-invitations'

export interface OrganizationInvitationDetailProps {
  invitation?: OrganizationInvitation
  hasSelection: boolean
  isLoading: boolean
  isError: boolean
  isCancelling: boolean
  onCancel: (invitation: OrganizationInvitation) => void
  onRetry: () => void
}

export function OrganizationInvitationDetail({
  invitation,
  hasSelection,
  isLoading,
  isError,
  isCancelling,
  onCancel,
  onRetry,
}: OrganizationInvitationDetailProps) {
  const { t } = useTranslation()

  if (isLoading) {
    return <div className="m-4 h-64 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  }
  if (isError) {
    return <div className="p-4"><ErrorState message={t('team.invitations.errorLoad')} onRetry={onRetry} /></div>
  }
  if (!invitation) {
    return (
      <div className="p-4">
        <EmptyState
          icon={hasSelection ? 'mail_off' : 'mail'}
          title={t(hasSelection ? 'team.invitations.notFound' : 'team.noSelection')}
        />
      </div>
    )
  }

  const invitedBy = invitation.invitedByName?.trim() || t('team.invitations.inviterUnavailable')

  return (
    <OrganizationInvitationDetailBody
      key={invitation.id}
      invitation={invitation}
      invitedBy={invitedBy}
      isCancelling={isCancelling}
      onCancel={onCancel}
    />
  )
}

function OrganizationInvitationDetailBody({
  invitation,
  invitedBy,
  isCancelling,
  onCancel,
}: {
  invitation: OrganizationInvitation
  invitedBy: string
  isCancelling: boolean
  onCancel: (invitation: OrganizationInvitation) => void
}) {
  const { t, i18n } = useTranslation()
  const isWide = useWideScreen()
  const [activeTab, setActiveTab] = useState<InvitationDetailTab>('general')
  const [selectedRoleId, setSelectedRoleId] = useState(invitation.roleId)
  const roles = useInvitationRoles(activeTab === 'roles')
  const updateRole = useUpdateOrganizationInvitationRole()
  const resendInvitation = useResendOrganizationInvitation()
  const resendAvailableAtMs = new Date(invitation.resendAvailableAt).getTime()
  const [nowMs, setNowMs] = useState(() => Date.now())
  const resendCoolingDown = Number.isFinite(resendAvailableAtMs) && nowMs < resendAvailableAtMs
  useEffect(() => {
    const delay = resendAvailableAtMs - Date.now()
    if (!Number.isFinite(delay) || delay <= 0) return
    const timeout = window.setTimeout(() => setNowMs(Date.now()), delay + 50)
    return () => window.clearTimeout(timeout)
  }, [resendAvailableAtMs])
  const roleOptions = useMemo(() => {
    const items = roles.data ?? []
    if (items.some((role) => role.id === invitation.roleId)) return items
    return [{ id: invitation.roleId, name: invitation.roleName }, ...items]
  }, [invitation.roleId, invitation.roleName, roles.data])
  const isDirty = selectedRoleId !== invitation.roleId

  const handleSaveRole = () => {
    if (!selectedRoleId || !isDirty || updateRole.isPending) return
    updateRole.mutate(
      { invitationId: invitation.id, roleId: selectedRoleId },
      {
        onSuccess: () => toast.success(t('team.invitations.roleUpdateSuccess')),
        onError: () => toast.error(t('team.invitations.roleUpdateError')),
      },
    )
  }

  const handleResend = () => {
    if (resendInvitation.isPending || resendCoolingDown) return
    resendInvitation.mutate(invitation.id, {
      onSuccess: () => toast.success(t('team.invitations.resendSuccess')),
      onError: () => toast.error(t('team.invitations.resendError')),
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 text-[var(--cv-t1)]">
      <DetailTabBar
        tabs={[
          { id: 'general', label: t('team.tabs.general') },
          { id: 'roles', label: t('team.tabs.roles') },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel={t('team.invitations.detailTabsLabel')}
        wide={isWide}
        leading={!isWide ? (
          <Link
            to="/settings/team"
            className="flex h-action w-action items-center justify-center rounded-lg text-[var(--cv-t3)] hover:bg-[var(--cv-list-item-hover)]"
            aria-label={t('common.back')}
          >
            <Icon name="arrow_back" size={18} />
          </Link>
        ) : undefined}
      />

      <ScrollArea>
        {activeTab === 'general' ? (
          <section className="w-full rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
            <div className="flex min-w-0 items-center gap-3 border-b border-[var(--cv-divider)] pb-4">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]"
              >
                <Icon name="mail" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <h1 className="min-w-0 flex-1 truncate text-heading font-bold">{invitation.email}</h1>
                  <span className={`${METADATA_BADGE_CLASSES} bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]`}>
                    {t('team.invitations.pending')}
                  </span>
                </div>
                <p className="truncate text-meta text-[var(--cv-t3)]">{t('team.invitations.detailSubtitle')}</p>
              </div>
            </div>

            <dl className="mt-4 flex flex-col gap-3">
              <InvitationDetailRow
                label={t('team.invitations.details.sent')}
                value={formatInvitationDateTime(invitation.sentAt, i18n.resolvedLanguage)}
              />
              <InvitationDetailRow label={t('team.invitations.details.invitedBy')} value={invitedBy} />
              <InvitationDetailRow
                label={t('team.invitations.details.expires')}
                value={formatInvitationDateTime(invitation.expiresAt, i18n.resolvedLanguage)}
              />
            </dl>

            <div className="mt-5 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
              <Button
                variant="outline"
                size="sm"
                icon="forward_to_inbox"
                disabled={resendInvitation.isPending || resendCoolingDown}
                title={resendCoolingDown ? t('team.invitations.resendCooldown') : undefined}
                onClick={handleResend}
              >
                {resendInvitation.isPending
                  ? t('team.invitations.resending')
                  : t('team.invitations.resend')}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="cancel"
                disabled={isCancelling}
                onClick={() => onCancel(invitation)}
              >
                {isCancelling ? t('team.invitations.cancelling') : t('team.invitations.confirmCancel')}
              </Button>
            </div>
          </section>
        ) : null}

        {activeTab === 'roles' ? (
          <section className="w-full rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
            <fieldset disabled={roles.isPending || roles.isError || updateRole.isPending}>
              <legend className="text-heading-sm font-semibold text-[var(--cv-t1)]">
                {t('team.invitations.roleEditorTitle')}
              </legend>
              <p className="mt-1 text-meta text-[var(--cv-t3)]">
                {t('team.invitations.roleEditorDescription')}
              </p>

              {roles.isPending ? (
                <div className="mt-4 h-24 animate-pulse rounded-xl bg-[var(--cv-bg-subtle)]" />
              ) : roles.isError ? (
                <div className="mt-4">
                  <ErrorState message={t('team.invite.rolesError')} onRetry={() => void roles.refetch()} />
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-2">
                  {roleOptions.map((role) => {
                    const unavailableCurrentRole = role.id === invitation.roleId
                      && !roles.data?.some((availableRole) => availableRole.id === role.id)
                    return (
                      <label
                        key={role.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--cv-border)] p-3 transition-colors hover:bg-[var(--cv-list-item-hover)] has-[:disabled]:cursor-not-allowed"
                      >
                        <input
                          type="radio"
                          name={`invitation-role-${invitation.id}`}
                          value={role.id}
                          checked={selectedRoleId === role.id}
                          disabled={unavailableCurrentRole}
                          onChange={() => setSelectedRoleId(role.id)}
                          className="accent-[var(--cv-primary)] disabled:opacity-60"
                        />
                        <span className="min-w-0 flex-1 truncate text-ui font-semibold text-[var(--cv-t1)]">
                          {role.name}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}

              {!roles.isPending && !roles.isError ? (
                <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
                  <Button
                    variant="subtle"
                    size="sm"
                    disabled={!isDirty || updateRole.isPending}
                    onClick={() => setSelectedRoleId(invitation.roleId)}
                  >
                    {t('common.discard')}
                  </Button>
                  <Button
                    variant="accent"
                    size="sm"
                    disabled={!isDirty || updateRole.isPending}
                    onClick={handleSaveRole}
                  >
                    {updateRole.isPending ? t('common.saving') : t('common.saveChanges')}
                  </Button>
                </div>
              ) : null}
            </fieldset>
          </section>
        ) : null}
      </ScrollArea>
    </div>
  )
}

type InvitationDetailTab = 'general' | 'roles'

function InvitationDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4">
      <dt className="text-meta font-medium text-[var(--cv-t3)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ui text-[var(--cv-t1)]">{value}</dd>
    </div>
  )
}

function formatInvitationDateTime(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}
