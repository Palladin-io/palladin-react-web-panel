import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { useAuthStore } from '../../auth'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { VaultColorPicker } from './vault-color-picker'
import { VaultIconPicker } from './vault-icon-picker'
import { VaultModeSelector } from './vault-mode-selector'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './vault-presentation'
import {
  type GrantMode,
  PERMISSION_FULL_GRANT_MODE,
  type UpdateVaultInput,
  type Vault,
} from '../types'
import { useDeleteVault } from '../use-delete-vault'
import { useUpdateVault } from '../use-update-vault'

export interface VaultSettingsFormProps {
  vault: Vault
  /**
   * Stable HTML form id so the detail header's "Save Changes" button
   * (rendered outside the form) can submit it via `form` attribute.
   */
  formId?: string
  /** When true, navigates to /vaults after a successful delete. */
  onDeleted?: () => void
  /** When true, navigates to detail after a successful save. */
  onSaved?: () => void
}

/**
 * The vault settings form, factored out so it can be embedded inside
 * the detail page's Settings tab AND served as a standalone page via
 * the dedicated settings route. Layout is two-column (matching the
 * Astro `VaultDetailSettings.astro` design): inputs on the left, icon
 * + colour pickers on the right, danger zone below.
 */
export function VaultSettingsForm({
  vault,
  formId = 'vault-settings-form',
  onDeleted,
  onSaved,
}: VaultSettingsFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const update = useUpdateVault(vault.id)
  const remove = useDeleteVault()
  const permissions = useAuthStore((s) => s.permissions)
  const canUseFullMode = (permissions & PERMISSION_FULL_GRANT_MODE) !== 0

  const [name, setName] = useState(vault.name)
  const [description, setDescription] = useState(vault.description ?? '')
  const [icon, setIcon] = useState(vault.icon ?? DEFAULT_VAULT_ICON)
  const [color, setColor] = useState(vault.color ?? DEFAULT_VAULT_COLOR)
  const [grantMode, setGrantMode] = useState<GrantMode>(vault.grantMode)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  const isPending = update.isPending
  const isRemoving = remove.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setErrorMessage(t('vault.nameRequired'))
      return
    }
    setErrorMessage(null)

    // Build a minimal patch — only ship the fields that actually changed.
    // The backend treats null as "leave alone", but we'd rather not
    // transmit unchanged values at all (smaller payload, cleaner audit).
    const patch: UpdateVaultInput = {}
    if (trimmedName !== vault.name) patch.name = trimmedName
    const trimmedDescription = description.trim()
    if (trimmedDescription !== (vault.description ?? '')) {
      patch.description = trimmedDescription
    }
    if (icon !== (vault.icon ?? DEFAULT_VAULT_ICON)) patch.icon = icon
    if (color !== (vault.color ?? DEFAULT_VAULT_COLOR)) patch.color = color
    if (grantMode !== vault.grantMode) patch.grantMode = grantMode

    if (Object.keys(patch).length === 0) {
      onSaved?.()
      return
    }

    update.mutate(patch, {
      onSuccess: () => {
        onSaved?.()
      },
      onError: () => setErrorMessage(t('vault.errorSave')),
    })
  }

  const handleDelete = () => {
    remove.mutate(vault.id, {
      onSuccess: () => {
        if (onDeleted) {
          onDeleted()
        } else {
          navigate({ to: '/vaults' })
        }
      },
      onError: () => {
        setShowDelete(false)
        setErrorMessage(t('vault.errorDelete'))
      },
    })
  }

  return (
    <>
      <form
        id={formId}
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[rgba(253,249,228,0.08)] bg-[rgba(13,27,62,0.6)] p-5
          shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
          <div className="flex flex-1 flex-col gap-4">
            <FormInput
              id="settings-name"
              label={t('vault.nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('vault.namePlaceholder')}
              disabled={isPending}
              maxLength={64}
              required
            />
            <FormTextarea
              id="settings-description"
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
            />
          </div>

          <div className="flex flex-col gap-4 lg:min-w-[220px]">
            <VaultIconPicker
              value={icon}
              onChange={setIcon}
              selectedColor={color}
              disabled={isPending}
              vaultId={vault.id}
            />
            <VaultColorPicker
              value={color}
              onChange={setColor}
              disabled={isPending}
            />
          </div>
        </div>

        <FieldFeedback visible={errorMessage !== null} color="red">
          {errorMessage}
        </FieldFeedback>
      </form>

      <section
        className="mt-4 rounded-xl border border-[rgba(255,79,79,0.25)]
          bg-[rgba(255,79,79,0.04)] p-4"
      >
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#FF4F4F]">
          {t('vault.dangerZone')}
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[12px] font-semibold text-[#FDF9E4]">
              {t('vault.deleteVault')}
            </div>
            <p className="mt-1 text-[11px] text-[#8A95A6]">
              {t('vault.deleteVaultDescription')}
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDelete(true)}
            disabled={isRemoving}
          >
            {t('vault.deleteVault')}
          </Button>
        </div>
      </section>

      <DeleteConfirmDialog
        open={showDelete}
        vaultName={vault.name}
        isPending={isRemoving}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </>
  )
}
