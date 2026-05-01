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

const ICON_OPTIONS = ['🔒', '🔑', '🗝️', '🏦', '📁', '💼', '🛡️', '⚙️', '🔐', '🌐']
const COLOR_OPTIONS = [
  '#2EC4B6',
  '#FF4F4F',
  '#F59E0B',
  '#60A5FA',
  '#A78BFA',
  '#34D399',
  '#F97316',
  '#EC4899',
  '#6B7A8E',
]

const DEFAULT_ICON = ICON_OPTIONS[0]
const DEFAULT_COLOR = COLOR_OPTIONS[0]

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
  const [icon, setIcon] = useState(DEFAULT_ICON)
  const [color, setColor] = useState(DEFAULT_COLOR)
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

        <ModeSelector
          value={grantMode}
          onChange={setGrantMode}
          canUseFullMode={canUseFullMode}
          disabled={isPending}
        />

        <IconPicker value={icon} onChange={setIcon} disabled={isPending} />

        <ColorPicker value={color} onChange={setColor} disabled={isPending} />

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

interface ModeSelectorProps {
  value: GrantMode
  onChange: (next: GrantMode) => void
  canUseFullMode: boolean
  disabled: boolean
}

function ModeSelector({
  value,
  onChange,
  canUseFullMode,
  disabled,
}: ModeSelectorProps) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.modeLabel')}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <ModeOption
          label={t('vault.modeFull')}
          description={t('vault.modeFullDescription')}
          selected={value === GRANT_MODE_FULL}
          locked={!canUseFullMode}
          lockedLabel={t('vault.modeFullPro')}
          disabled={disabled || !canUseFullMode}
          onClick={() => canUseFullMode && onChange(GRANT_MODE_FULL)}
        />
        <ModeOption
          label={t('vault.modeGranular')}
          description={t('vault.modeGranularDescription')}
          selected={value === GRANT_MODE_GRANULAR}
          disabled={disabled}
          onClick={() => onChange(GRANT_MODE_GRANULAR)}
        />
      </div>
    </fieldset>
  )
}

interface ModeOptionProps {
  label: string
  description: string
  selected: boolean
  locked?: boolean
  lockedLabel?: string
  disabled: boolean
  onClick: () => void
}

function ModeOption({
  label,
  description,
  selected,
  locked,
  lockedLabel,
  disabled,
  onClick,
}: ModeOptionProps) {
  const borderClass = selected
    ? 'border-[#2EC4B6] bg-[rgba(46,196,182,0.08)]'
    : 'border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors
        disabled:cursor-not-allowed disabled:opacity-60 ${borderClass}`}
    >
      <span className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[#FDF9E4]">{label}</span>
        {locked && lockedLabel ? (
          <span
            className="rounded-full border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.12)]
              px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#F59E0B]"
          >
            {lockedLabel}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] text-[#6B7A8E]">{description}</span>
    </button>
  )
}

interface IconPickerProps {
  value: string
  onChange: (next: string) => void
  disabled: boolean
}

function IconPicker({ value, onChange, disabled }: IconPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ICON_OPTIONS.map((opt) => {
          const selected = opt === value
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-pressed={selected}
              className={`flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 ${
                selected
                  ? 'border-[#2EC4B6] bg-[rgba(46,196,182,0.12)]'
                  : 'border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)] hover:bg-[rgba(253,249,228,0.08)]'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

interface ColorPickerProps {
  value: string
  onChange: (next: string) => void
  disabled: boolean
}

function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  const { t } = useTranslation()
  return (
    <fieldset>
      <legend className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#B8C5D4]">
        {t('vault.colorLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {COLOR_OPTIONS.map((opt) => {
          const selected = opt === value
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              disabled={disabled}
              aria-label={opt}
              aria-pressed={selected}
              className={`h-7 w-7 rounded-full border-2 transition-transform disabled:cursor-not-allowed
                disabled:opacity-40 ${selected ? 'scale-110 border-[#FDF9E4]' : 'border-transparent'}`}
              style={{ backgroundColor: opt }}
            />
          )
        })}
      </div>
    </fieldset>
  )
}
