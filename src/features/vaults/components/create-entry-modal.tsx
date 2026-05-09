import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryPlaintext,
  type EntryType,
  type Vault,
} from '../types'
import { useCreateEntry } from '../use-create-entry'
import { entriesQueryKey } from '../use-entries'
import { extensionFromMime } from '../use-vault-icon-upload'
import { presignEntryIcon, updateEntry, uploadToS3 } from '../api/vault-api'
import {
  ENTRY_ICON_COLORS,
  ENTRY_ICON_OPTIONS,
  extractDomain,
  isCustomIconUrl,
} from './entry-presentation'
import { ModalShell } from './modal-shell'
import { hexWithAlpha } from './vault-color'

export interface CreateEntryModalProps {
  open: boolean
  vault: Vault
  onClose: () => void
}

/**
 * Wrapper that mounts/unmounts the dialog body on each open so the
 * form starts with clean defaults — same pattern as the create-vault
 * dialog.
 */
export function CreateEntryModal({ open, vault, onClose }: CreateEntryModalProps) {
  if (!open) return null
  return <CreateEntryModalBody vault={vault} onClose={onClose} />
}

interface CreateEntryModalBodyProps {
  vault: Vault
  onClose: () => void
}

function CreateEntryModalBody({ vault, onClose }: CreateEntryModalBodyProps) {
  const { t } = useTranslation()
  const create = useCreateEntry()
  const queryClient = useQueryClient()

  const [type, setType] = useState<EntryType>(ENTRY_TYPE_KEY)
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    analytics.capture('vault', 'create-entry-wizard-opened')
  }, [])

  const isPending = create.isPending

  const accentColor = type === ENTRY_TYPE_KEY ? '#2EC4B6' : '#60A5FA'

  const canSubmit = useMemo(() => {
    if (isPending) return false
    if (!label.trim()) return false
    if (type === ENTRY_TYPE_KEY) return keyValue.trim().length > 0
    return username.trim().length > 0 && password.trim().length > 0
  }, [isPending, label, type, keyValue, username, password])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setErrorMessage(null)

    const payload = buildPlaintext({ type, keyValue, username, password, url, notes })

    if (!vault.wrappedVK) {
      setErrorMessage(t('vault.entries.errorMissingVaultKey'))
      return
    }

    create.mutate(
      {
        vaultId: vault.id,
        wrappedVK: vault.wrappedVK,
        label: label.trim(),
        description: description.trim() || undefined,
        // Custom image uploaded after creation — send no icon so the list
        // uses the type default until the PATCH lands.
        icon: pendingIconFile ? undefined : icon,
        type,
        payload,
        urlDomain: type === ENTRY_TYPE_CREDENTIAL ? extractDomain(url) : undefined,
      },
      {
        onSuccess: async (data) => {
          if (pendingIconFile) {
            try {
              const ext = extensionFromMime(pendingIconFile.type)
              const { uploadUrl, publicUrl } = await presignEntryIcon(vault.id, data.id, ext)
              await uploadToS3(uploadUrl, pendingIconFile)
              await updateEntry(vault.id, data.id, { icon: publicUrl })
              queryClient.invalidateQueries({ queryKey: entriesQueryKey(vault.id) })
            } catch {
              // Icon upload failed — entry was created, proceed without custom icon
            }
          }
          analytics.capture('vault', 'create-entry-wizard-completed', { type })
          toast.success(t('vault.entries.createSuccess'))
          onClose()
        },
        onError: () => {
          analytics.capture('vault', 'create-entry-wizard-failed', { type })
          setErrorMessage(t('vault.entries.errorCreate'))
        },
      },
    )
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('vault.entries.addEntry')}
      width={480}
    >
      <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
        <header className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
            {t('vault.entries.addEntry')}
          </h2>
          <button
            type="button"
            onClick={isPending ? undefined : onClose}
            disabled={isPending}
            aria-label={t('common.close')}
            className="text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
              disabled:cursor-not-allowed"
          >
            <Icon name="close" size={18} />
          </button>
        </header>

        <FormInput
          id="entry-label"
          label={t('vault.entries.labelLabel')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('vault.entries.labelPlaceholder')}
          autoFocus
          autoComplete="off"
          disabled={isPending}
          maxLength={120}
          required
        />

        <FormInput
          id="entry-description"
          label={t('vault.entries.descriptionLabel')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('vault.entries.descriptionPlaceholder')}
          autoComplete="off"
          disabled={isPending}
          maxLength={500}
        />

        <EntryIconPicker
          value={icon}
          onChange={(next) => {
            setIcon(next)
            setPendingIconFile(null)
          }}
          selectedColor={accentColor}
          disabled={isPending}
          onFileSelected={(file, previewUrl) => {
            setPendingIconFile(file)
            setIcon(previewUrl)
          }}
        />

        <div>
          <label
            htmlFor="entry-type"
            className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
          >
            {t('vault.entries.typeLabel')}
          </label>
          <select
            id="entry-type"
            value={String(type)}
            onChange={(e) => setType(Number(e.target.value) as EntryType)}
            disabled={isPending}
            className="w-full rounded-lg border border-[var(--cv-input-border)]
              bg-[var(--cv-input-bg)] pl-3 pr-8 py-2 text-sm text-[var(--cv-input-text)]
              focus:border-[var(--cv-t1)] focus:outline-none"
          >
            <option value={String(ENTRY_TYPE_KEY)}>{t('vault.entries.typeKeyOption')}</option>
            <option value={String(ENTRY_TYPE_CREDENTIAL)}>
              {t('vault.entries.typeCredentialOption')}
            </option>
          </select>
        </div>

        {type === ENTRY_TYPE_KEY ? (
          <SecretInput
            id="entry-value"
            label={t('vault.entries.valueLabel')}
            value={keyValue}
            onChange={setKeyValue}
            visible={keyVisible}
            onToggleVisible={() => setKeyVisible((prev) => !prev)}
            placeholder={t('vault.entries.valuePlaceholder')}
            disabled={isPending}
            monospace
          />
        ) : (
          <>
            <div className="flex gap-3">
              <div className="flex-1">
                <FormInput
                  id="entry-username"
                  label={t('vault.entries.usernameLabel')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('vault.entries.usernamePlaceholder')}
                  autoComplete="off"
                  disabled={isPending}
                  required
                />
              </div>
              <div className="flex-1">
                <SecretInput
                  id="entry-password"
                  label={t('vault.entries.passwordLabel')}
                  value={password}
                  onChange={setPassword}
                  visible={passwordVisible}
                  onToggleVisible={() => setPasswordVisible((prev) => !prev)}
                  placeholder={t('vault.entries.passwordPlaceholder')}
                  disabled={isPending}
                />
              </div>
            </div>
            <FormInput
              id="entry-url"
              label={t('vault.entries.urlLabel')}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('vault.entries.urlPlaceholder')}
              autoComplete="off"
              disabled={isPending}
              type="url"
              inputMode="url"
            />
          </>
        )}

        <FormTextarea
          id="entry-notes"
          label={t('vault.entries.notesLabel')}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('vault.entries.notesPlaceholder')}
          autoComplete="off"
          disabled={isPending}
          rows={2}
          maxLength={2000}
        />

        <div style={{ perspective: '600px' }} className="relative h-[38px]">
          <div
            className="relative h-full w-full transition-transform duration-500 ease-in-out"
            style={{
              transformStyle: 'preserve-3d',
              transform: errorMessage ? 'rotateX(180deg)' : 'rotateX(0deg)',
            }}
          >
            <div
              className="absolute inset-0 flex items-center gap-2 rounded-lg border
                border-[rgba(46,196,182,0.25)] bg-[rgba(46,196,182,0.08)] px-3 py-2"
              style={{ backfaceVisibility: 'hidden' }}
            >
              <Icon name="enhanced_encryption" size={14} className="shrink-0" color="#2EC4B6" />
              <span className="text-[11px] text-[var(--cv-t2)]">
                {t('vault.entries.encryptionNotice')}
              </span>
            </div>
            <div
              className="absolute inset-0 flex items-center gap-2 rounded-lg border
                border-[rgba(255,79,79,0.3)] bg-[rgba(255,79,79,0.08)] px-3 py-2"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateX(180deg)' }}
            >
              <Icon name="error_outline" size={14} className="shrink-0" color="#FF4F4F" />
              <span className="text-[11px] text-[#FF4F4F] leading-tight">{errorMessage}</span>
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="subtle"
            size="md"
            onClick={onClose}
            disabled={isPending}
            className="flex-1"
          >
            {t('vault.cancel')}
          </Button>
          <Button
            variant="accent"
            size="md"
            type="submit"
            disabled={!canSubmit}
            className="flex-[2]"
          >
            {isPending ? t('vault.entries.saving') : t('vault.entries.saveEntry')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

// ---------------------------------------------------------------------------
// EntryIconPicker
// ---------------------------------------------------------------------------

interface EntryIconPickerProps {
  value: string | undefined
  onChange: (next: string | undefined) => void
  selectedColor: string
  disabled?: boolean
  onFileSelected?: (file: File, previewUrl: string) => void
}

function EntryIconPicker({
  value,
  onChange,
  selectedColor,
  disabled = false,
  onFileSelected,
}: EntryIconPickerProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <fieldset>
      <legend className="mb-2 block text-[11px] font-semibold text-[var(--cv-label-text)]">
        {t('vault.entries.iconLabel')}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ENTRY_ICON_OPTIONS.map((opt) => {
          const selected = !isCustomIconUrl(value) && opt === value
          const iconColor = ENTRY_ICON_COLORS[opt] ?? '#8A95A6'
          const background = selected
            ? hexWithAlpha(selectedColor, 0.15)
            : hexWithAlpha(iconColor, 0.10)
          const border = selected ? `2px solid ${selectedColor}` : 'none'
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(selected ? undefined : opt)}
              disabled={disabled}
              aria-pressed={selected}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ background, border }}
            >
              <Icon name={opt} size={14} color={selected ? selectedColor : iconColor} />
            </button>
          )
        })}

        {onFileSelected && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  const previewUrl = URL.createObjectURL(file)
                  onFileSelected(file, previewUrl)
                }
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              aria-label={t('vault.entries.iconUpload')}
              className="flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors
                disabled:cursor-not-allowed disabled:opacity-40 text-[var(--cv-t3)]"
              style={
                isCustomIconUrl(value)
                  ? {
                      background: hexWithAlpha(selectedColor, 0.15),
                      border: `2px solid ${selectedColor}`,
                    }
                  : {
                      background: 'transparent',
                      border: '1.5px dashed var(--cv-input-border)',
                    }
              }
            >
              {isCustomIconUrl(value) ? (
                <img src={value} alt="" className="h-5 w-5 rounded-full object-cover" />
              ) : (
                <Icon name="upload" size={14} />
              )}
            </button>
          </>
        )}
      </div>
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// SecretInput
// ---------------------------------------------------------------------------

interface SecretInputProps {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  visible: boolean
  onToggleVisible: () => void
  placeholder?: string
  disabled?: boolean
  monospace?: boolean
}

function SecretInput({
  id,
  label,
  value,
  onChange,
  visible,
  onToggleVisible,
  placeholder,
  disabled,
  monospace,
}: SecretInputProps) {
  const { t } = useTranslation()
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required
          className={`w-full rounded-lg border border-[var(--cv-input-border)]
            bg-[var(--cv-input-bg)] px-3 py-2 pr-10 text-sm text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:border-[var(--cv-t1)]
            focus:outline-none ${monospace ? 'font-mono' : ''}`}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? t('vault.entry.hide') : t('vault.entry.reveal')}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-7 w-7
            items-center justify-center rounded text-[var(--cv-t3)]
            hover:text-[var(--cv-t1)]"
        >
          <Icon name={visible ? 'visibility_off' : 'visibility'} size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface BuildPayloadInput {
  type: EntryType
  keyValue: string
  username: string
  password: string
  url: string
  notes: string
}

function buildPlaintext(input: BuildPayloadInput): EntryPlaintext {
  const trimmedNotes = input.notes.trim() || undefined
  if (input.type === ENTRY_TYPE_KEY) {
    return {
      type: ENTRY_TYPE_KEY,
      value: input.keyValue.trim(),
      notes: trimmedNotes,
    }
  }
  const trimmedUrl = input.url.trim() || undefined
  return {
    type: ENTRY_TYPE_CREDENTIAL,
    username: input.username.trim(),
    password: input.password.trim(),
    url: trimmedUrl,
    notes: trimmedNotes,
  }
}
