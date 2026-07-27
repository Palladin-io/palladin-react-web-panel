import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { analytics } from '../../../shared/lib/analytics'
import { firstError, required } from '../../../shared/lib/validation'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { VaultIconPicker } from './vault-icon-picker'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './vault-presentation'
import {
  type Vault,
} from '../types'
import { useDeleteVault } from '../use-delete-vault'
import { useUpdateVault } from '../use-update-vault'
import { VaultMetadataConflictError } from '../vault-settings-service'
import { useVaultEncryptedAssetUrl } from '../assets/use-vault-encrypted-asset-url'

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

  const [baseMetadata, setBaseMetadata] = useState(() => ({
    name: vault.name,
    ...(vault.description ? { description: vault.description } : {}),
    ...(vault.icon ? { iconReference: vault.icon } : {}),
    ...(vault.color ? { color: vault.color } : {}),
  }))

  const [name, setName] = useState(baseMetadata.name)
  const [description, setDescription] = useState(baseMetadata.description ?? '')
  const [icon, setIcon] = useState(
    baseMetadata.iconReference?.startsWith('asset:') ? DEFAULT_VAULT_ICON : baseMetadata.iconReference ?? DEFAULT_VAULT_ICON,
  )
  const [color, setColor] = useState(baseMetadata.color ?? DEFAULT_VAULT_COLOR)
  const [iconChanged, setIconChanged] = useState(false)
  const [iconFile, setIconFile] = useState<File | undefined>()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)
  const [showDelete, setShowDelete] = useState(false)
  const baseAssetId = baseMetadata.iconReference?.startsWith('asset:')
    ? baseMetadata.iconReference.slice('asset:'.length)
    : null
  const encryptedAsset = useVaultEncryptedAssetUrl(vault.id, baseAssetId)

  const isPending = update.isPending
  const isRemoving = remove.isPending

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    if (firstError(name, [required(t('validation.required'))]) !== null) {
      setNameError(true)
      return
    }

    const trimmedDescription = description.trim()
    const nextMetadata = {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...((iconChanged && !iconFile ? icon : baseMetadata.iconReference)
        ? { iconReference: iconChanged && !iconFile ? icon : baseMetadata.iconReference }
        : {}),
      ...(color ? { color } : {}),
    }

    const unchanged = trimmedName === baseMetadata.name
      && trimmedDescription === (baseMetadata.description ?? '')
      && !iconChanged
      && color === (baseMetadata.color ?? DEFAULT_VAULT_COLOR)
    if (unchanged) {
      onSaved?.()
      return
    }

    update.mutate({ expectedMetadata: baseMetadata, nextMetadata, ...(iconFile ? { iconFile } : {}) }, {
      onSuccess: (committedMetadata) => {
        setBaseMetadata(committedMetadata)
        setIconFile(undefined)
        setPreviewUrl(null)
        setIcon(committedMetadata.iconReference?.startsWith('asset:')
          ? DEFAULT_VAULT_ICON
          : committedMetadata.iconReference ?? DEFAULT_VAULT_ICON)
        setIconChanged(false)
        analytics.capture('vault', 'settings-saved')
        onSaved?.()
      },
      onError: (error) => toast.error(t(error instanceof VaultMetadataConflictError
        ? 'vault.errorConflict'
        : 'vault.errorSave')),
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
                onBlur={() =>
                  setNameError(
                    firstError(name, [required(t('validation.required'))]) !== null,
                  )
                }
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
              value={!iconChanged && encryptedAsset.url ? encryptedAsset.url : icon}
              onChange={(next) => {
                setIcon(next)
                setIconFile(undefined)
                setPreviewUrl(null)
                setIconChanged(true)
              }}
              onFileSelected={(file, localUrl) => {
                setIconFile(file)
                setPreviewUrl(localUrl)
                setIcon(localUrl)
                setIconChanged(true)
              }}
              onColorChange={setColor}
              selectedColor={color}
              disabled={isPending}
              rowClassName="grid grid-cols-5 gap-1.5 justify-items-center"
            />
            {encryptedAsset.corrupt && !iconChanged ? (
              <p role="alert" className="text-meta text-red-400">{t('vault.iconCorrupt')}</p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-[var(--cv-divider)] pt-4">
          <Button
            variant="subtle"
            size="sm"
            type="button"
            onClick={() => {
              setName(baseMetadata.name)
              setDescription(baseMetadata.description ?? '')
              setIcon(baseMetadata.iconReference?.startsWith('asset:')
                ? DEFAULT_VAULT_ICON
                : baseMetadata.iconReference ?? DEFAULT_VAULT_ICON)
              setColor(baseMetadata.color ?? DEFAULT_VAULT_COLOR)
              setIconFile(undefined)
              setPreviewUrl(null)
              setIconChanged(false)
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
        className="mt-4 rounded-xl border border-[rgb(var(--cv-primary-rgb)/0.25)]
          bg-[rgb(var(--cv-primary-rgb)/0.04)] p-4"
      >
        <h2 className="text-meta font-semibold uppercase tracking-[0.06em] text-[var(--cv-primary)]">
          {t('vault.dangerZone')}
        </h2>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-ui font-semibold text-[var(--cv-t1)]">
              {t('vault.deleteVault')}
            </div>
            <p className="mt-1 text-meta text-[var(--cv-t3)]">
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
