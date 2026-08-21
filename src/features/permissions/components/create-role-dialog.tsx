import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { ModalShell } from '../../../shared/components/modal-shell'
import type { AssignablePermission } from '../../../shared/api/organization-roles-api'
import { firstError, required } from '../../../shared/lib/validation'
import { PermissionFields } from './permission-fields'
import { useCreateRole } from '../use-role-mutations'

export function CreateRoleDialog({
  open,
  permissions,
  onClose,
}: {
  open: boolean
  permissions: AssignablePermission[]
  onClose: () => void
}) {
  if (!open) return null
  return <CreateRoleDialogBody permissions={permissions} onClose={onClose} />
}

function CreateRoleDialogBody({ permissions, onClose }: { permissions: AssignablePermission[]; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateRole()
  const [name, setName] = useState('')
  const [permissionValue, setPermissionValue] = useState(0)
  const [nameError, setNameError] = useState(false)
  const canSubmit = name.trim().length > 0 && !create.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) {
      setNameError(true)
      return
    }
    create.mutate(
      { name: name.trim(), permissions: permissionValue },
      {
        onSuccess: (role) => {
          toast.success(t('permissions.createSuccess'))
          onClose()
          void navigate({ to: '/settings/permissions/$roleId', params: { roleId: role.id } })
        },
        onError: () => toast.error(t('permissions.createError')),
      },
    )
  }

  return (
    <ModalShell
      onClose={create.isPending ? undefined : onClose}
      ariaLabel={t('permissions.createTitle')}
      title={t('permissions.createTitle')}
      width={560}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="accent" size="sm" className="flex-[2]" type="submit" form="create-role-form" disabled={!canSubmit}>
            {create.isPending ? t('permissions.creating') : t('permissions.create')}
          </Button>
        </DialogFooter>
      }
    >
      <form id="create-role-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <FormInput
            id="create-role-name"
            label={t('permissions.nameLabel')}
            value={name}
            onChange={(event) => { setName(event.target.value); setNameError(false) }}
            onBlur={() => setNameError(firstError(name, [required(t('validation.required'))]) !== null)}
            error={nameError}
            maxLength={100}
            autoFocus
          />
          <FeedbackSlot visible={nameError} color="red">{t('validation.required')}</FeedbackSlot>
        </div>
        <PermissionFields permissions={permissions} value={permissionValue} disabled={create.isPending} onChange={setPermissionValue} />
      </form>
    </ModalShell>
  )
}
