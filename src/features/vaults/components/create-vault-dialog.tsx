import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { useCreateVault } from '../use-create-vault'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { VaultIconPicker } from './vault-icon-picker'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './vault-presentation'

export interface CreateVaultDialogProps {
  open: boolean
  onClose: () => void
  onCreated?: (vaultId: string) => void
}

/**
 * Thin wrapper that mounts/unmounts the dialog body. By keying the body
 * on `open`, every "open" produces a fresh component instance with clean
 * `useState` defaults — no synchronizing effect needed to reset the form.
 */
export function CreateVaultDialog({
  open,
  onClose,
  onCreated,
}: CreateVaultDialogProps) {
  if (!open) return null
  return <CreateVaultDialogBody onClose={onClose} onCreated={onCreated} />
}

interface CreateVaultDialogBodyProps {
  onClose: () => void
  onCreated?: (vaultId: string) => void
}

function CreateVaultDialogBody({ onClose, onCreated }: CreateVaultDialogBodyProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateVault()

  const [name, setName] = useState(create.pendingInput?.name ?? '')
  const [description, setDescription] = useState(create.pendingInput?.description ?? '')
  const [icon, setIcon] = useState<string>(create.pendingInput?.icon ?? DEFAULT_VAULT_ICON)
  const [iconFile, setIconFile] = useState<File | undefined>(create.pendingInput?.iconFile)
  const [previewUrl, setPreviewUrl] = useState<string | null>(() =>
    create.pendingInput?.iconFile ? URL.createObjectURL(create.pendingInput.iconFile) : null)
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])
  const [color, setColor] = useState<string>(create.pendingInput?.color ?? DEFAULT_VAULT_COLOR)

  // Mount-only side effect: emit analytics for "wizard opened". The form
  // reset that used to live here is now implicit — opening the dialog
  // mounts a fresh component instance.
  useEffect(() => {
    analytics.capture('vault', 'create-wizard-opened')
  }, [])

  const isPending = create.isPending
  const isRetryLocked = create.pendingInput !== null
  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    create.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        icon,
        color,
        ...(iconFile ? { iconFile } : {}),
      },
      {
        onSuccess: ({ vaultId, iconUploadFailed }) => {
          if (iconUploadFailed) toast.error(t('vault.iconUploadFailedAfterCreate'))
          analytics.capture('vault', 'create-wizard-completed')
          if (onCreated) { onCreated(vaultId); return }
          onClose()
          void navigate({ to: '/vaults/$vaultId', params: { vaultId } })
        },
        onError: (error) => {
          analytics.capture('vault', 'create-wizard-failed')
          if (error instanceof Error && error.name === 'VaultLockedError') {
            onClose()
            navigate({ to: '/unlock' })
            return
          }
          toast.error(t('vault.errorCreate'))
        },
      },
    )
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('vault.createVault')}
      title={t('vault.createVault')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} disabled={isPending} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" size="sm" type="submit" form="create-vault-form" disabled={!canSubmit} className="flex-[2]">
            {isPending ? t('vault.creating') : t('vault.createVault')}
          </Button>
        </DialogFooter>
      }
    >
      <form id="create-vault-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormInput
          id="vault-name"
          label={t('vault.nameLabel')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('vault.namePlaceholder')}
          autoFocus
          disabled={isPending || isRetryLocked}
          maxLength={64}
        />

        <FormTextarea
          id="vault-description"
          label={t('vault.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('vault.descriptionPlaceholder')}
          disabled={isPending || isRetryLocked}
          rows={2}
          maxLength={500}
        />

        <VaultIconPicker
          value={previewUrl ?? icon}
          onChange={(next) => { setIcon(next); setIconFile(undefined); setPreviewUrl(null) }}
          onFileSelected={(file, url) => { setIconFile(file); setPreviewUrl(url) }}
          onColorChange={setColor}
          selectedColor={color}
          disabled={isPending || isRetryLocked}
          rowClassName="flex justify-between"
        />

        {isRetryLocked && !isPending && (
          <p className="text-meta text-[var(--cv-t3)]">
            {t('vault.pendingCreateRetry')}
          </p>
        )}
      </form>
    </ModalShell>
  )
}
