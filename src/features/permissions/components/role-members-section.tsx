import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { EmptyState } from '../../../shared/components/empty-state'
import { ErrorState } from '../../../shared/components/error-state'
import { Icon } from '../../../shared/components/icon'
import { METADATA_BADGE_CLASSES } from '../../../shared/lib/styles'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { hasApiErrorKey } from '../../../shared/api/error-response'
import type { OrganizationMember } from '../../../shared/api/organization-members-api'
import type { OrganizationRole } from '../../../shared/api/organization-roles-api'
import { useRemoveRoleFromMember, useRoleMembers } from '../use-role-members'

const GRANT_MANAGE_CUTOVER_ERROR = 'organization-role-grant-manage-cutover-unavailable'

interface RoleMembersSectionProps {
  role: OrganizationRole
  canManage: boolean
  callerPermissions: number
}

export function RoleMembersSection({
  role,
  canManage,
  callerPermissions,
}: RoleMembersSectionProps) {
  const { t } = useTranslation()
  const membersQuery = useRoleMembers()
  const removeRole = useRemoveRoleFromMember()
  const members = useMemo(
    () => (membersQuery.data ?? []).filter((member) =>
      member.roles.some((memberRole) => memberRole.id === role.id)),
    [membersQuery.data, role.id],
  )

  const handleRemove = (member: OrganizationMember) => {
    const roleIds = member.roles
      .filter((memberRole) => memberRole.id !== role.id)
      .map((memberRole) => memberRole.id)

    removeRole.mutate(
      { userId: member.userId, roleIds },
      {
        onSuccess: () => toast.success(t('permissions.members.removeSuccess', { name: displayName(member) })),
        onError: async (error) => {
          if (
            await hasApiErrorKey(error, GRANT_MANAGE_CUTOVER_ERROR)
            || await hasApiErrorKey(error, `errors.backend.${GRANT_MANAGE_CUTOVER_ERROR}`)
          ) {
            toast.error(t('permissions.grantManageCutoverUnavailable'))
            return
          }
          toast.error(t('permissions.members.removeError'))
        },
      },
    )
  }

  if (membersQuery.isPending) {
    return (
      <div role="status" aria-label={t('permissions.members.loading')} className="flex flex-col gap-2">
        <SkeletonBlock height="4.75rem" />
        <SkeletonBlock height="4.75rem" />
      </div>
    )
  }

  if (membersQuery.isError) {
    return <ErrorState message={t('permissions.members.loadError')} onRetry={membersQuery.refetch} />
  }

  if (members.length === 0) {
    return (
      <EmptyState
        icon="group"
        title={t('permissions.members.empty')}
        description={t('permissions.members.emptyHint')}
      />
    )
  }

  return (
    <ul className="flex flex-col gap-2" aria-label={t('permissions.members.listLabel')}>
      {members.map((member) => {
        const name = displayName(member)
        const targetExceedsCaller = (member.effectivePermissions & ~callerPermissions) !== 0
        const isOnlyRole = member.roles.length <= 1
        const canRemove = canManage
          && role.canAssign
          && !member.isOwner
          && !targetExceedsCaller
          && !isOnlyRole

        return (
          <li
            key={member.userId}
            className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] px-4 py-3"
          >
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--cv-info-rgb)/0.14)] text-ui font-bold text-[var(--cv-info)]"
            >
              {memberInitials(name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="truncate text-ui font-semibold text-[var(--cv-t1)]">{name}</h2>
                {member.isOwner ? (
                  <span className={`${METADATA_BADGE_CLASSES} bg-[var(--cv-bg-subtle)] text-[var(--cv-premium)]`}>
                    <Icon name="shield_person" size={14} color="var(--cv-premium)" />
                    {t('team.owner')}
                  </span>
                ) : null}
              </div>
              <p className="truncate text-meta text-[var(--cv-t3)]">{member.email}</p>
              {isOnlyRole && !member.isOwner ? (
                <p className="mt-1 text-micro text-[var(--cv-t3)]">{t('permissions.members.onlyRoleHint')}</p>
              ) : null}
            </div>
            {!member.isOwner ? (
              <Button
                variant="outline"
                size="sm"
                icon="person_remove"
                onClick={() => handleRemove(member)}
                disabled={!canRemove || removeRole.isPending}
              >
                {t('permissions.members.remove')}
              </Button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function displayName(member: OrganizationMember): string {
  return member.displayName.trim() || member.email
}

function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}
