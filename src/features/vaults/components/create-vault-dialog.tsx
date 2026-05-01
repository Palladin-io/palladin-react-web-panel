import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { useAuthStore } from '../../auth'
import {
  GRANT_MODE_FULL,
  GRANT_MODE_GRANULAR,
  type GrantMode,
  PERMISSION_FULL_GRANT_MODE,
} from '../types'
import { useCreateVault } from '../use-create-vault'
import { ModalShell } from './modal-shell'
import { VaultColorPicker } from './vault-color-picker'
import { VaultIconPicker } from './vault-icon-picker'
import { VaultModeSelector } from './vault-mode-selector'
import { DEFAULT_VAULT_COLOR, DEFAULT_VAULT_ICON } from './vault-presentation'

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
  const permissions = useAuthStore((s) => s.permissions)
  const canUseFullMode = (permissions & PERMISSION_FULL_GRANT_MODE) !== 0

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [icon, setIcon] = useState<string>(DEFAULT_VAULT_ICON)
  const [color, setColor] = useState<string>(DEFAULT_VAULT_COLOR)
  const [grantMode, setGrantMode] = useState<GrantMode>(
    canUseFullMode ? GRANT_MODE_FULL : GRANT_MODE_GRANULAR,
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

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
    setErrorMessage(null)

    create.mutate(
      {
        name: trimmedName,
        description: description.trim() || undefined,
        icon,
        color,
        grantMode,
      },
      {
        onSuccess: (vault) => {
          onCreated?.(vault.id)
          onClose()
        },
        onError: () => {
          analytics.capture('vault', 'create-wizard-failed')
          setErrorMessage(t('vault.errorCreate'))
        },
      },
    )
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('vault.createVault')}
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-[#FDF9E4]">
            {t('vault.createVault')}
          </h2>
        </header>

        <div>
          <FormInput
            id="vault-name"
            label={t('vault.nameLabel')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('vault.namePlaceholder')}
            autoFocus
            disabled={isPending}
            maxLength={64}
            required
          />
        </div>

        <FormTextarea
          id="vault-description"
          label={t('vault.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('vault.descriptionPlaceholder')}
          disabled={isPending}
          rows={3}
          maxLength={500}
        />

        <VaultModeSelector
          value={grantMode}
          onChange={setGrantMode}
          canUseFullMode={canUseFullMode}
          disabled={isPending}
          showDescriptions
        />

        <VaultIconPicker value={icon} onChange={setIcon} disabled={isPending} />

        <VaultColorPicker value={color} onChange={setColor} disabled={isPending} />

        <FieldFeedback visible={errorMessage !== null} color="red">
          {errorMessage}
        </FieldFeedback>

        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg border border-[rgba(253,249,228,0.1)] bg-transparent px-4 py-2
              text-sm text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.04)]
              disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('vault.cancel')}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[#2EC4B6] px-4 py-2 text-sm font-semibold text-[#000B2E]
              transition-colors hover:bg-[#26a89d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? t('vault.creating') : t('vault.createVault')}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}
