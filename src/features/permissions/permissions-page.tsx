import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../shared/components/button'
import { EmptyState } from '../../shared/components/empty-state'
import { ErrorState } from '../../shared/components/error-state'
import { Icon } from '../../shared/components/icon'
import { ResponsiveMasterDetail } from '../../shared/components/responsive-master-detail'
import { ScrollArea } from '../../shared/components/scroll-area'
import { SkeletonBlock } from '../../shared/components/skeleton-block'
import {
  HOVERABLE_CARD_CLASSES,
  METADATA_BADGE_CLASSES,
  SETTINGS_MASTER_HEADER_CLASSES,
} from '../../shared/lib/styles'
import { PERMISSION_ORGANIZATION_MANAGEMENT } from '../../shared/lib/permissions'
import { useAuthStore } from '../auth'
import { CreateRoleDialog } from './components/create-role-dialog'
import { RoleDetail } from './components/role-detail'
import { useOrganizationRoles } from './use-organization-roles'

export function PermissionsPage({ roleId }: { roleId?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const query = useOrganizationRoles()
  const permissions = useAuthStore((state) => state.permissions)
  const canManage = (permissions & PERMISSION_ORGANIZATION_MANAGEMENT) !== 0
  const [createOpen, setCreateOpen] = useState(false)
  const roles = query.data?.items ?? []
  const selectedRole = roleId ? roles.find((role) => role.id === roleId) : undefined
  const assignablePermissions = query.data?.assignablePermissions ?? []

  useEffect(() => {
    if (!canManage) {
      void navigate({ to: '/settings/general', replace: true })
    }
  }, [canManage, navigate])

  if (!canManage) return null

  return (
    <>
      <ResponsiveMasterDetail
        hasSelection={Boolean(roleId)}
        masterLabel={t('permissions.listLabel')}
        detailLabel={t('permissions.detailLabel')}
        master={
          <div className="flex h-full min-h-0 flex-col px-4 py-4 text-[var(--cv-t1)]">
            <header className={SETTINGS_MASTER_HEADER_CLASSES}>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-heading font-bold text-[var(--cv-t1)]">{t('permissions.title')}</h1>
                <p className="truncate text-meta text-[var(--cv-t3)]">{t('permissions.subtitle')}</p>
              </div>
              {canManage ? (
                <Button variant="accent" size="sm" icon="add" onClick={() => setCreateOpen(true)}>
                  {t('permissions.create')}
                </Button>
              ) : null}
            </header>

            <ScrollArea>
              {query.isPending ? (
                <div className="flex flex-col gap-2">{[0, 1, 2].map((item) => <SkeletonBlock key={item} height="4.5rem" />)}</div>
              ) : query.isError ? (
                <ErrorState message={t('permissions.errorLoad')} onRetry={query.refetch} />
              ) : roles.length === 0 ? (
                <EmptyState icon="admin_panel_settings" title={t('permissions.empty')} />
              ) : (
                <ul className="flex flex-col gap-2">
                  {roles.map((role) => (
                    <li key={role.id}>
                      <Link
                        to="/settings/permissions/$roleId"
                        params={{ roleId: role.id }}
                        className={`flex items-center gap-3 px-4 py-3 ${HOVERABLE_CARD_CLASSES}${
                          role.id === roleId ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''
                        }`}
                      >
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${
                          role.isSystem
                            ? 'bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]'
                            : 'bg-[var(--cv-bg-subtle)] text-[var(--cv-t2)]'
                        }`}>
                          <Icon name={role.isSystem ? 'verified_user' : 'shield_person'} size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center justify-between gap-2">
                            <span className="min-w-0 flex-1 truncate text-ui font-semibold">{role.name}</span>
                            {role.isSystem ? <span className={`${METADATA_BADGE_CLASSES} bg-[rgb(var(--cv-info-rgb)/0.12)] text-[var(--cv-info)]`}>{t('permissions.system')}</span> : null}
                          </span>
                          <span className="block text-meta text-[var(--cv-t3)]">{t('permissions.assignedMembers', { count: role.assignedMemberCount })}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        }
        detail={
          query.isPending ? (
            <div className="p-4"><SkeletonBlock height="18rem" /></div>
          ) : query.isError ? (
            <div className="p-4"><ErrorState message={t('permissions.errorLoad')} onRetry={query.refetch} /></div>
          ) : roleId && !selectedRole ? (
            <div className="p-4"><EmptyState icon="admin_panel_settings" title={t('permissions.notFound')} /></div>
          ) : (
            <RoleDetail
              role={selectedRole}
              assignablePermissions={assignablePermissions}
              canManage={canManage}
              callerPermissions={permissions}
            />
          )
        }
      />
      <CreateRoleDialog open={createOpen} permissions={assignablePermissions} onClose={() => setCreateOpen(false)} />
    </>
  )
}
