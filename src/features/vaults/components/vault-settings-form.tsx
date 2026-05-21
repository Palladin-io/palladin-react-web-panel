import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { VaultIconPicker } from './vault-icon-picker'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './vault-presentation'
import {
  type UpdateVaultInput,
  type Vault,
} from '../types'
import { useDeleteVault } from '../use-delete-vault'
import { useUpdateVault } from '../use-update-vault'

export interface VaultSettingsFormProps {
  vault: Vault
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
  onDeleted,
  onSaved,
}: VaultSettingsFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const update = useUpdateVault(vault.id)
  const remove = useDeleteVault()

  const [name, setName] = useState(vault.name)
  const [description, setDescription] = useState(vault.description ?? '')
  const [icon, setIcon] = useState(vault.icon ?? DEFAULT_VAULT_ICON)
  const [color, setColor] = useState(vault.color ?? DEFAULT_VAULT_COLOR)
  const [nameError, setNameError] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const isPending = update.isPending
  const isRemoving = remove.isPending

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      setNameError(true)
      return
    }

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

    if (Object.keys(patch).length === 0) {
      onSaved?.()
      return
    }

    update.mutate(patch, {
      onSuccess: () => {
        analytics.capture('vault', 'settings-saved')
        onSaved?.()
      },
      onError: () => toast.error(t('vault.errorSave')),
    })
  }

  const handleDelete = () => {
    remove.mutate(vault.id, {
      onSuccess: () => {
        analytics.capture('vault', 'deleted')
        if (onDeleted) {
          onDeleted()
        } else {
          navigate({ to: '/vaults' })
        }
      },
      onError: () => {
        setShowDelete(false)
        toast.error(t('vault.errorDelete'))
      },
    })
  }

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5
          dark:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      >
        <div className="flex gap-5 items-start">
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <div className="-mb-4">
              <FormInput
                id="settings-name"
                label={t('vault.nameLabel')}
                value={name}
                onChange={(e) => { setName(e.target.value); setNameError(false) }}
                onBlur={() => setNameError(name.trim().length === 0)}
                placeholder={t('vault.namePlaceholder')}
                disabled={isPending}
                maxLength={64}
                error={nameError}
              />
              <FieldFeedback visible={nameError} color="red">
                {t('validation.required')}
              </FieldFeedback>
            </div>
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
          </div>
          <div className="w-60 shrink-0 flex flex-col gap-4">
            <VaultIconPicker
              value={icon}
              onChange={setIcon}
              onColorChange={setColor}
              selectedColor={color}
              disabled={isPending}
              vaultId={vault.id}
              rowClassName="grid grid-cols-5 gap-1.5 justify-items-center"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
          <Button
            variant="subtle"
            size="sm"
            type="button"
            onClick={() => {
              setName(vault.name)
              setDescription(vault.description ?? '')
              setIcon(vault.icon ?? DEFAULT_VAULT_ICON)
              setColor(vault.color ?? DEFAULT_VAULT_COLOR)
              setNameError(false)
            }}
            disabled={isPending}
          >
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" size="sm" type="submit" disabled={isPending}>
            {isPending ? t('vault.saving') : t('vault.saveChanges')}
          </Button>
        </div>
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
            <div className="text-[12px] font-semibold text-[var(--cv-t1)]">
              {t('vault.deleteVault')}
            </div>
            <p className="mt-1 text-[11px] text-[var(--cv-t3)]">
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
