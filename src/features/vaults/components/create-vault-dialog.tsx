import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { GRANT_MODE_GRANULAR } from '../types'
import { useCreateVault } from '../use-create-vault'
import { extensionFromMime } from '../use-vault-icon-upload'
import { VAULTS_QUERY_KEY } from '../use-vaults'
import { presignVaultIcon, uploadToS3, updateVault } from '../api/vault-api'
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
  const create = useCreateVault()
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string>(DEFAULT_VAULT_ICON)
  const [color, setColor] = useState<string>(DEFAULT_VAULT_COLOR)
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null)

  // Mount-only side effect: emit analytics for "wizard opened". The form
  // reset that used to live here is now implicit — opening the dialog
  // mounts a fresh component instance.
  useEffect(() => {
    analytics.capture('vault', 'create-wizard-opened')
  }, [])

  const isPending = create.isPending
  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    // Grant mode selector intentionally omitted from the create dialog
    // (per CVT-30 design): mode is a property of grants, not the vault.
    // The vault still needs a default — granular is the safe default
    // since any account can use it; users with the Pro permission can
    // switch to Full from the settings tab.
    create.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        // Use a material icon for the initial create; custom icon is uploaded
        // as a second step once the vault ID is known.
        icon: pendingIconFile ? DEFAULT_VAULT_ICON : icon,
        color,
        grantMode: GRANT_MODE_GRANULAR,
      },
      {
        onSuccess: async (vault) => {
          if (pendingIconFile) {
            try {
              const ext = extensionFromMime(pendingIconFile.type)
              const { uploadUrl, publicUrl } = await presignVaultIcon(vault.id, ext)
              await uploadToS3(uploadUrl, pendingIconFile)
              await updateVault(vault.id, { icon: publicUrl })
              queryClient.invalidateQueries({ queryKey: VAULTS_QUERY_KEY })
            } catch {
              // Icon upload failed — vault was created, proceed without custom icon
            }
          }
          analytics.capture('vault', 'create-wizard-completed')
          onCreated?.(vault.id)
          onClose()
        },
        onError: () => {
          analytics.capture('vault', 'create-wizard-failed')
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
          disabled={isPending}
          maxLength={64}
        />

        <FormTextarea
          id="vault-description"
          label={t('vault.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('vault.descriptionPlaceholder')}
          disabled={isPending}
          rows={2}
          maxLength={500}
        />

        <VaultIconPicker
          value={icon}
          onChange={setIcon}
          onColorChange={setColor}
          selectedColor={color}
          onFileSelected={(file, previewUrl) => {
            setPendingIconFile(file)
            setIcon(previewUrl)
          }}
          disabled={isPending}
          rowClassName="flex justify-between"
        />
      </form>
    </ModalShell>
  )
}

