import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DetailTabBar } from '../../../shared/components/detail-tab-bar'
import { EmptyState } from '../../../shared/components/empty-state'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { ScrollArea } from '../../../shared/components/scroll-area'
import { hasApiErrorKey } from '../../../shared/api/error-response'
import type { AssignablePermission, OrganizationRole } from '../../../shared/api/organization-roles-api'
import { useWideScreen } from '../../../shared/hooks/use-wide-screen'
import { firstError, required } from '../../../shared/lib/validation'
import { DeleteRoleDialog } from './delete-role-dialog'
import { PermissionFields } from './permission-fields'
import { RoleMembersSection } from './role-members-section'
import { useDeleteRole, useUpdateRole } from '../use-role-mutations'

const GRANT_MANAGE_CUTOVER_ERROR = 'organization-role-grant-manage-cutover-unavailable'
type RoleDetailTab = 'general' | 'permissions' | 'members'

export function RoleDetail({
  role,
  assignablePermissions,
  canManage,
  callerPermissions,
}: {
  role?: OrganizationRole
  assignablePermissions: AssignablePermission[]
  canManage: boolean
  callerPermissions: number
}) {
  const { t } = useTranslation()
  if (!role) {
    return <div className="p-4"><EmptyState icon="admin_panel_settings" title={t('permissions.noSelection')} /></div>
  }
  return (
    <RoleDetailBody
      key={role.id}
      role={role}
      assignablePermissions={assignablePermissions}
      canManage={canManage}
      callerPermissions={callerPermissions}
    />
  )
}

function RoleDetailBody({
  role,
  assignablePermissions,
  canManage,
  callerPermissions,
}: {
  role: OrganizationRole
  assignablePermissions: AssignablePermission[]
  canManage: boolean
  callerPermissions: number
}) {
  const { t } = useTranslation()
  const isWide = useWideScreen()
  const navigate = useNavigate()
  const update = useUpdateRole()
  const remove = useDeleteRole()
  const [name, setName] = useState(role.name)
  const [permissions, setPermissions] = useState(role.permissions)
  const [nameError, setNameError] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<RoleDetailTab>('general')

  const modifiableMask = useMemo(
    () => assignablePermissions.reduce(
      (mask, permission) => permission.canAssign ? mask | permission.value : mask,
      0,
    ),
    [assignablePermissions],
  )
  const normalizedPermissions = (role.permissions & ~modifiableMask) | (permissions & modifiableMask)
  const isNameDirty = name.trim() !== role.name
  const isPermissionsDirty = normalizedPermissions !== role.permissions
  const canEdit = canManage && !role.isSystem && role.canAssign
  const canSaveName = canEdit && isNameDirty && name.trim().length > 0 && !update.isPending
  const canSavePermissions = canEdit && isPermissionsDirty && !update.isPending
  const canDelete = canManage && !role.isSystem && role.canAssign && role.assignedMemberCount === 0

  const saveRole = (nextName: string, nextPermissions: number) => {
    update.mutate(
      { roleId: role.id, input: { name: nextName, permissions: nextPermissions } },
      {
        onSuccess: () => toast.success(t('permissions.updateSuccess')),
        onError: async (error) => {
          if (
            await hasApiErrorKey(error, GRANT_MANAGE_CUTOVER_ERROR)
            || await hasApiErrorKey(error, `errors.backend.${GRANT_MANAGE_CUTOVER_ERROR}`)
          ) {
            toast.error(t('permissions.grantManageCutoverUnavailable'))
            return
          }
          toast.error(t('permissions.updateError'))
        },
      },
    )
  }

  const tabs = [
    { id: 'general' as const, label: t('permissions.tabs.general') },
    { id: 'permissions' as const, label: t('permissions.tabs.permissions') },
    {
      id: 'members' as const,
      label: t('permissions.tabs.members', { count: role.assignedMemberCount }),
    },
  ]

  const handleDelete = () => {
    remove.mutate(role.id, {
      onSuccess: () => {
        toast.success(t('permissions.deleteSuccess'))
        setDeleteOpen(false)
        void navigate({ to: '/settings/permissions' })
      },
      onError: () => {
        setDeleteOpen(false)
        toast.error(t('permissions.deleteError'))
      },
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col text-[var(--cv-t1)]">
      <div className="shrink-0 px-4 pt-4">
        <DetailTabBar
          tabs={tabs}
          active={activeTab}
          onChange={setActiveTab}
          ariaLabel={t('permissions.tabs.label')}
          wide={isWide}
          leading={!isWide ? (
            <Link
              to="/settings/permissions"
              className="flex h-action w-action items-center justify-center rounded-lg text-[var(--cv-t3)] hover:bg-[var(--cv-list-item-hover)]"
              aria-label={t('common.back')}
            >
              <Icon name="arrow_back" size={18} />
            </Link>
          ) : undefined}
        />
      </div>

      <ScrollArea>
        <div className="flex w-full flex-col gap-4 px-4 pb-4">
          {!role.canAssign && !role.isSystem ? (
            <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--cv-premium-rgb)/0.28)] bg-[rgb(var(--cv-premium-rgb)/0.08)] p-3">
              <Icon name="lock" size={18} color="var(--cv-premium)" />
              <p className="text-ui text-[var(--cv-t2)]">{t('permissions.cannotManageRole')}</p>
            </div>
          ) : null}

          {activeTab === 'general' ? (
            <>
              <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
                <div>
                  <FormInput
                    id="role-name"
                    label={t('permissions.nameLabel')}
                    value={name}
                    onChange={(event) => { setName(event.target.value); setNameError(false) }}
                    onBlur={() => setNameError(firstError(name, [required(t('validation.required'))]) !== null)}
                    error={nameError}
                    disabled={!canEdit || update.isPending}
                    maxLength={100}
                  />
                  <FeedbackSlot visible={nameError} color="red">{t('validation.required')}</FeedbackSlot>
                </div>
                {canEdit ? (
                  <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
                    <Button variant="subtle" size="sm" onClick={() => setName(role.name)} disabled={!isNameDirty || update.isPending}>{t('common.discard')}</Button>
                    <Button variant="accent" size="sm" onClick={() => saveRole(name.trim(), role.permissions)} disabled={!canSaveName}>{update.isPending ? t('common.saving') : t('common.saveChanges')}</Button>
                  </div>
                ) : null}
              </section>

              {!role.isSystem && canManage ? (
                <section className="rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)] bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4">
                  <h2 className="text-meta font-semibold text-[var(--cv-primary)]">{t('permissions.deleteSectionTitle')}</h2>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-meta text-[var(--cv-t3)]">
                      {role.assignedMemberCount > 0 ? t('permissions.deleteAssignedHint') : t('permissions.deleteHint')}
                    </p>
                    <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)} disabled={!canDelete}>{t('permissions.delete')}</Button>
                  </div>
                </section>
              ) : null}
            </>
          ) : null}

          {activeTab === 'permissions' ? (
            <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
              <PermissionFields permissions={assignablePermissions} value={permissions} disabled={!canEdit || update.isPending} onChange={setPermissions} />
              {canEdit ? (
                <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
                  <Button variant="subtle" size="sm" onClick={() => setPermissions(role.permissions)} disabled={!isPermissionsDirty || update.isPending}>{t('common.discard')}</Button>
                  <Button variant="accent" size="sm" onClick={() => saveRole(role.name, normalizedPermissions)} disabled={!canSavePermissions}>{update.isPending ? t('common.saving') : t('common.saveChanges')}</Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {activeTab === 'members' ? (
            <RoleMembersSection
              role={role}
              canManage={canManage}
              callerPermissions={callerPermissions}
            />
          ) : null}
        </div>
      </ScrollArea>

      <DeleteRoleDialog open={deleteOpen} roleName={role.name} pending={remove.isPending} onConfirm={handleDelete} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}
