import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../shared/components/form-field'
import { FormTextarea } from '../../shared/components/form-textarea'
import { useAuthStore } from '../auth'
import { DeleteConfirmDialog } from './components/delete-confirm-dialog'
import { VaultColorPicker } from './components/vault-color-picker'
import { VaultIconPicker } from './components/vault-icon-picker'
import { VaultModeSelector } from './components/vault-mode-selector'
import {
  DEFAULT_VAULT_COLOR,
  DEFAULT_VAULT_ICON,
} from './components/vault-presentation'
import {
  type GrantMode,
  PERMISSION_FULL_GRANT_MODE,
  type UpdateVaultInput,
  type Vault,
} from './types'
import { useDeleteVault } from './use-delete-vault'
import { useUpdateVault } from './use-update-vault'
import { useVault } from './use-vault'

const PAGE_BACKGROUND =
  'linear-gradient(160deg, #000B2E 0%, #0A1A3E 30%, #0E1230 60%, #000B2E 100%)'

export interface VaultSettingsPageProps {
  vaultId: string
}

/**
 * Wrapper that handles the load lifecycle. The form itself is split into
 * {@link SettingsForm} so it only mounts once `vault` data is available —
 * that way `useState` can seed directly from the loaded vault and we
 * avoid the "sync state in an effect" antipattern.
 */
export function VaultSettingsPage({ vaultId }: VaultSettingsPageProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const vault = useVault(vaultId)

  return (
    <div className="min-h-screen text-[#FDF9E4]" style={{ background: PAGE_BACKGROUND }}>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <button
          type="button"
          onClick={() =>
            navigate({ to: '/vaults/$vaultId', params: { vaultId } })
          }
          className="mb-6 text-[12px] text-[#6B7A8E] transition-colors hover:text-[#FDF9E4]"
        >
          ← {t('vault.backToDetail')}
        </button>

        <h1 className="mb-6 text-2xl font-bold">{t('vault.settings')}</h1>

        {vault.isPending ? (
          <div className="h-64 animate-pulse rounded-2xl bg-[#1A2A4A]" />
        ) : vault.isError || !vault.data ? (
          <div className="rounded-2xl border border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.06)] p-6 text-sm text-[#FF4F4F]">
            {t('vault.errorLoad')}
          </div>
        ) : (
          // Re-key on the vault id so navigating between two vaults wipes
          // all local form state — the new mount seeds from fresh props.
          <SettingsForm key={vault.data.id} vault={vault.data} />
        )}
      </div>
    </div>
  )
}

interface SettingsFormProps {
  vault: Vault
}

function SettingsForm({ vault }: SettingsFormProps) {
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
      navigate({ to: '/vaults/$vaultId', params: { vaultId: vault.id } })
      return
    }

    update.mutate(patch, {
      onSuccess: () => {
        navigate({ to: '/vaults/$vaultId', params: { vaultId: vault.id } })
      },
      onError: () => setErrorMessage(t('vault.errorSave')),
    })
  }

  const handleDelete = () => {
    remove.mutate(vault.id, {
      onSuccess: () => {
        navigate({ to: '/vaults' })
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
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-2xl border border-[rgba(253,249,228,0.08)] bg-[#1A2A4A] p-6"
      >
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

        <VaultIconPicker value={icon} onChange={setIcon} disabled={isPending} />

        <VaultColorPicker value={color} onChange={setColor} disabled={isPending} />

        <FieldFeedback visible={errorMessage !== null} color="red">
          {errorMessage}
        </FieldFeedback>

        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-[#2EC4B6] px-4 py-2 text-sm font-semibold text-[#000B2E]
              transition-colors hover:bg-[#26a89d] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? t('vault.saving') : t('vault.saveChanges')}
          </button>
        </div>
      </form>

      <section className="mt-8 rounded-2xl border border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.04)] p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.06em] text-[#FF4F4F]">
          {t('vault.dangerZone')}
        </h2>
        <p className="mt-2 text-sm text-[#B8C5D4]">
          {t('vault.deleteVaultDescription')}
        </p>
        <button
          type="button"
          onClick={() => setShowDelete(true)}
          className="mt-4 rounded-lg border border-[#FF4F4F] bg-transparent px-4 py-2
            text-sm font-semibold text-[#FF4F4F] transition-colors hover:bg-[rgba(255,79,79,0.08)]"
        >
          {t('vault.deleteVault')}
        </button>
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
