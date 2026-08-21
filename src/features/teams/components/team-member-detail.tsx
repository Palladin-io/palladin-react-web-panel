import { useMemo, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { hasApiErrorKey } from '../../../shared/api/error-response'
import { METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
import type { OrganizationRole } from '../../../shared/api/organization-roles-api'
import { useWideScreen } from '../../../shared/hooks/use-wide-screen'
import type { OrganizationMember } from '../api/team-members-api'
import { useUpdateMemberRoles } from '../use-update-member-roles'

const GRANT_MANAGE_CUTOVER_ERROR = 'organization-role-grant-manage-cutover-unavailable'
const ALL_PERMISSIONS_MASK = 2_147_483_647

export interface TeamMemberDetailProps {
  member?: OrganizationMember
  hasSelection: boolean
  roles?: OrganizationRole[]
  isLoading: boolean
  isError: boolean
  canManage: boolean
  callerPermissions: number
  renderLogs?: (memberId: string) => ReactNode
  onRetry: () => void
}

export function TeamMemberDetail({
  member,
  hasSelection,
  roles,
  isLoading,
  isError,
  canManage,
  callerPermissions,
  renderLogs,
  onRetry,
}: TeamMemberDetailProps) {
  const { t } = useTranslation()
  if (isLoading) {
    return <div className="m-4 h-64 animate-pulse rounded-2xl bg-[var(--cv-card-bg)]" />
  }
  if (isError) return <div className="p-4"><ErrorState message={t('team.rolesErrorLoad')} onRetry={onRetry} /></div>
  if (!member) {
    return (
      <div className="p-4">
        <EmptyState
          icon={hasSelection ? 'person_search' : 'group'}
          title={t(hasSelection ? 'team.memberNotFound' : 'team.noSelection')}
        />
      </div>
    )
  }

  return (
    <TeamMemberDetailBody
      key={member.userId}
      member={member}
      roles={roles ?? []}
      canManage={canManage}
      callerPermissions={callerPermissions}
      renderLogs={renderLogs}
    />
  )
}

function TeamMemberDetailBody({
  member,
  roles,
  canManage,
  callerPermissions,
  renderLogs,
}: {
  member: OrganizationMember
  roles: OrganizationRole[]
  canManage: boolean
  callerPermissions: number
  renderLogs?: (memberId: string) => ReactNode
}) {
  const { t, i18n } = useTranslation()
  const isWide = useWideScreen()
  const update = useUpdateMemberRoles()
  const [activeTab, setActiveTab] = useState<TeamMemberTab>('general')
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>(
    member.roles.map((role) => role.id),
  )
  const originalRoleIds = useMemo(
    () => member.roles.map((role) => role.id).sort(),
    [member.roles],
  )
  const isDirty = selectedRoleIds.slice().sort().join('|') !== originalRoleIds.join('|')
  const targetExceedsCaller = (member.effectivePermissions & ~callerPermissions) !== 0
  const canEdit = canManage && !member.isOwner && !targetExceedsCaller
  const canSubmit = canEdit && isDirty && selectedRoleIds.length > 0 && !update.isPending

  const displayName = member.displayName.trim() || member.email

  const toggleRole = (role: OrganizationRole) => {
    if (!role.canAssign) return
    setSelectedRoleIds((current) =>
      current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id],
    )
  }

  const handleSave = () => {
    if (!canSubmit) return
    update.mutate(
      { userId: member.userId, roleIds: selectedRoleIds },
      {
        onSuccess: () => toast.success(t('team.rolesSaved')),
        onError: async (error) => {
          if (
            await hasApiErrorKey(error, GRANT_MANAGE_CUTOVER_ERROR)
            || await hasApiErrorKey(error, `errors.backend.${GRANT_MANAGE_CUTOVER_ERROR}`)
          ) {
            toast.error(t('permissions.grantManageCutoverUnavailable'))
            return
          }
          toast.error(t('team.rolesErrorSave'))
        },
      },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 text-[var(--cv-t1)]">
      <TeamMemberTabs
        active={activeTab}
        onChange={setActiveTab}
        showAuditLog={renderLogs !== undefined}
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

      {activeTab === 'audit-log' && renderLogs ? (
        <div className="min-h-0 flex-1">{renderLogs(member.userId)}</div>
      ) : (
        <ScrollArea>
          <div className="flex w-full flex-col gap-4">
            {activeTab === 'general' ? (
              <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
                <div className="flex min-w-0 items-center gap-3 border-b border-[var(--cv-divider)] pb-4">
                  <div
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--cv-info-rgb)/0.14)] text-ui font-bold text-[var(--cv-info)]"
                  >
                    {memberInitials(displayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <h1 className="min-w-0 flex-1 truncate text-heading font-bold">{displayName}</h1>
                      {member.isOwner ? (
                        <span className={`${METADATA_BADGE_CLASSES} bg-[var(--cv-bg-subtle)] text-[var(--cv-premium)]`}>
                          <Icon name="shield_person" size={14} color="var(--cv-premium)" />
                          {t('team.owner')}
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate text-meta text-[var(--cv-t3)]">{member.email}</p>
                  </div>
                </div>
                <dl className="mt-4 flex flex-col gap-3">
                  <MemberDetailRow label={t('team.details.joined')} value={formatMemberDate(member.joinedAt, i18n.resolvedLanguage)} />
                  <MemberDetailRow label={t('team.details.roles')} value={t('team.roleCount', { count: member.roles.length })} />
                  <MemberDetailRow label={t('team.details.status')} value={t(`team.status.${member.status.toLowerCase()}`)} />
                </dl>
              </section>
            ) : null}

            {activeTab === 'roles' ? (
              <>
          {member.isOwner ? (
            <div className="flex items-start gap-2 rounded-xl border border-[var(--cv-border)] bg-[var(--cv-bg-subtle)] p-3">
              <Icon name="shield_person" size={18} color="var(--cv-premium)" />
              <p className="text-ui text-[var(--cv-t2)]">{t('team.ownerRolesReadOnly')}</p>
            </div>
          ) : null}

          {targetExceedsCaller ? (
            <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--cv-premium-rgb)/0.28)] bg-[rgb(var(--cv-premium-rgb)/0.08)] p-3">
              <Icon name="lock" size={18} color="var(--cv-premium)" />
              <p className="text-ui text-[var(--cv-t2)]">{t('team.higherPeerReadOnly')}</p>
            </div>
          ) : null}

          <fieldset disabled={!canEdit || update.isPending} className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
            <legend className="sr-only">{t('team.rolesLabel')}</legend>
            <p className="mb-3 truncate text-meta text-[var(--cv-t3)]">{t('team.rolesHelp')}</p>
            <div className="flex flex-col gap-2">
              {roles.map((role) => (
                <label key={role.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--cv-border)] p-3 transition-colors hover:bg-[var(--cv-list-item-hover)] has-[:disabled]:cursor-not-allowed">
                  <input
                    type="checkbox"
                    checked={selectedRoleIds.includes(role.id)}
                    disabled={!role.canAssign}
                    onChange={() => toggleRole(role)}
                    className="mt-1 accent-[var(--cv-primary)] disabled:opacity-60"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-ui font-semibold">
                      {role.name}
                      {role.isSystem ? <span className={`${METADATA_BADGE_CLASSES} bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]`}>{t('permissions.system')}</span> : null}
                    </span>
                    <span className="text-meta text-[var(--cv-t3)]">
                      {role.permissions === ALL_PERMISSIONS_MASK
                        ? t('permissions.allPermissions')
                        : t('permissions.permissionCount', { count: countKnownBits(role.permissions) })}
                    </span>
                    {!role.canAssign ? (
                      <span className="mt-1 block text-meta text-[var(--cv-premium)]">
                        {t('team.cannotDelegateRole')}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            {canEdit ? (
              <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
                <Button variant="subtle" size="sm" onClick={() => setSelectedRoleIds(originalRoleIds)} disabled={!isDirty || update.isPending}>
                  {t('common.discard')}
                </Button>
                <Button variant="accent" size="sm" onClick={handleSave} disabled={!canSubmit}>
                  {update.isPending ? t('common.saving') : t('common.saveChanges')}
                </Button>
              </div>
            ) : null}
          </fieldset>
              </>
            ) : null}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

type TeamMemberTab = 'general' | 'roles' | 'audit-log'

function TeamMemberTabs({
  active,
  onChange,
  showAuditLog,
  wide,
  leading,
}: {
  active: TeamMemberTab
  onChange: (tab: TeamMemberTab) => void
  showAuditLog: boolean
  wide: boolean
  leading?: ReactNode
}) {
  const { t } = useTranslation()
  const tabs: { id: TeamMemberTab; label: string }[] = [
    { id: 'general', label: t('team.tabs.general') },
    { id: 'roles', label: t('team.tabs.roles') },
    ...(showAuditLog ? [{ id: 'audit-log' as const, label: t('team.tabs.auditLog') }] : []),
  ]

  return (
    <DetailTabBar
      tabs={tabs}
      active={active}
      onChange={onChange}
      ariaLabel={t('team.tabs.label')}
      wide={wide}
      leading={leading}
    />
  )
}

function MemberDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-baseline gap-4">
      <dt className="text-meta font-medium text-[var(--cv-t3)]">{label}</dt>
      <dd className="min-w-0 break-words text-right text-ui text-[var(--cv-t1)]">{value}</dd>
    </div>
  )
}

function memberInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function formatMemberDate(value: string, locale?: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function countKnownBits(value: number): number {
  let remaining = value >>> 0
  let count = 0
  while (remaining !== 0) {
    count += remaining & 1
    remaining >>>= 1
  }
  return count
}
