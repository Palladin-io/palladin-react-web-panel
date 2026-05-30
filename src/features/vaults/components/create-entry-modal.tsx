import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
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
  extractDomain,
} from './entry-presentation'
import { EntryIconPicker } from './entry-icon-picker'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'

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
  const [color, setColor] = useState('#2EC4B6')
  const [icon, setIcon] = useState<string | undefined>(undefined)
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [labelError, setLabelError] = useState(false)
  const [description, setDescription] = useState('')
  const [keyValue, setKeyValue] = useState('')
  const [keyValueError, setKeyValueError] = useState(false)
  const [keyVisible, setKeyVisible] = useState(false)
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState(false)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState(false)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    analytics.capture('vault', 'create-entry-wizard-opened')
  }, [])

  useEffect(() => {
    setKeyValueError(false)
    setUsernameError(false)
    setPasswordError(false)
  }, [type])

  const isPending = create.isPending

  const canSubmit = useMemo(() => {
    if (isPending) return false
    if (!label.trim()) return false
    if (type === ENTRY_TYPE_KEY) return keyValue.trim().length > 0
    return username.trim().length > 0 && password.trim().length > 0
  }, [isPending, label, type, keyValue, username, password])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    const payload = buildPlaintext({ type, keyValue, username, password, url, notes })

    if (!vault.wrappedVK) {
      toast.error(t('vault.entries.errorMissingVaultKey'))
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
        color,
        type,
        payload,
        urlDomain: extractDomain(url) || undefined,
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
          toast.error(t('vault.entries.errorCreate'))
        },
      },
    )
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('vault.entries.addEntry')}
      width={520}
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

        <div className="-mb-3">
          <FormInput
            id="entry-label"
            label={t('vault.entries.labelLabel')}
            value={label}
            onChange={(e) => { setLabel(e.target.value); setLabelError(false) }}
            onBlur={() => setLabelError(!label.trim())}
            placeholder={t('vault.entries.labelPlaceholder')}
            autoFocus
            autoComplete="off"
            disabled={isPending}
            maxLength={120}
            error={labelError}
          />
          <FieldFeedback visible={labelError} color="red">
            {t('validation.required')}
          </FieldFeedback>
        </div>

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

        <div className="-mb-3">
          <FormInput
            id="entry-url"
            label={t('vault.entries.urlLabel')}
            value={url}
            onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
            onBlur={() => {
              if (url.trim()) {
                try { new URL(url.trim()); setUrlError(false) }
                catch { setUrlError(true) }
              }
            }}
            placeholder={t('vault.entries.urlPlaceholder')}
            autoComplete="off"
            disabled={isPending}
            inputMode="url"
            error={urlError}
          />
          <FieldFeedback visible={urlError} color="red">
            {t('validation.invalidUrl')}
          </FieldFeedback>
        </div>

        <div>
          <label
            htmlFor="entry-type"
            className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
          >
            {t('vault.entries.typeLabel')}
          </label>
          <div className="relative">
            <select
              id="entry-type"
              value={String(type)}
              onChange={(e) => setType(Number(e.target.value) as EntryType)}
              disabled={isPending}
              className="w-full appearance-none rounded-lg border border-[var(--cv-input-border)]
                bg-[var(--cv-input-bg)] pl-3 pr-10 py-2 text-[12px] text-[var(--cv-input-text)]
                focus:border-[var(--cv-t1)] focus:outline-none disabled:cursor-not-allowed
                disabled:opacity-40"
            >
              <option value={String(ENTRY_TYPE_KEY)}>{t('vault.entries.typeKeyOption')}</option>
              <option value={String(ENTRY_TYPE_CREDENTIAL)}>
                {t('vault.entries.typeCredentialOption')}
              </option>
            </select>
            <Icon
              name="expand_more"
              size={16}
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cv-t3)]"
            />
          </div>
        </div>

        {type === ENTRY_TYPE_KEY ? (
          <div className="-mb-3">
            <SecretInput
              id="entry-value"
              label={t('vault.entries.valueLabel')}
              value={keyValue}
              onChange={(next) => { setKeyValue(next); setKeyValueError(false) }}
              onBlur={() => setKeyValueError(!keyValue.trim())}
              shown={keyVisible}
              onToggleShown={() => setKeyVisible((prev) => !prev)}
              placeholder={t('vault.entries.valuePlaceholder')}
              disabled={isPending}
              monospace
              error={keyValueError}
            />
            <FieldFeedback visible={keyValueError} color="red">
              {t('validation.required')}
            </FieldFeedback>
          </div>
        ) : (
          <div className="flex gap-3 -mb-3">
            <div className="flex-1">
              <FormInput
                id="entry-username"
                label={t('vault.entries.usernameLabel')}
                value={username}
                onChange={(e) => { setUsername(e.target.value); setUsernameError(false) }}
                onBlur={() => setUsernameError(!username.trim())}
                placeholder={t('vault.entries.usernamePlaceholder')}
                autoComplete="off"
                disabled={isPending}
                error={usernameError}
              />
              <FieldFeedback visible={usernameError} color="red">
                {t('validation.required')}
              </FieldFeedback>
            </div>
            <div className="flex-1">
              <SecretInput
                id="entry-password"
                label={t('vault.entries.passwordLabel')}
                value={password}
                onChange={(next) => { setPassword(next); setPasswordError(false) }}
                onBlur={() => setPasswordError(!password.trim())}
                shown={passwordVisible}
                onToggleShown={() => setPasswordVisible((prev) => !prev)}
                placeholder={t('vault.entries.passwordPlaceholder')}
                disabled={isPending}
                error={passwordError}
              />
              <FieldFeedback visible={passwordError} color="red">
                {t('validation.required')}
              </FieldFeedback>
            </div>
          </div>
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

        <EntryIconPicker
          value={icon}
          onChange={(next) => { setIcon(next); setPendingIconFile(null) }}
          onColorChange={setColor}
          selectedColor={color}
          rowClassName="flex justify-between"
          onFileSelected={(file, previewUrl) => { setPendingIconFile(file); setIcon(previewUrl) }}
          disabled={isPending}
        />

        <div
          className="flex items-center gap-2 rounded-lg border
            border-[rgba(46,196,182,0.25)] bg-[rgba(46,196,182,0.08)] px-3 py-2"
        >
          <Icon name="enhanced_encryption" size={14} className="shrink-0" color="#2EC4B6" />
          <span className="text-[11px] text-[var(--cv-t2)]">
            {t('vault.entries.encryptionNotice')}
          </span>
        </div>

        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onClose} disabled={isPending} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button variant="accent" size="sm" type="submit" disabled={!canSubmit} className="flex-[2]">
            {isPending ? t('vault.entries.saving') : t('vault.entries.saveEntry')}
          </Button>
        </DialogFooter>
      </form>
    </ModalShell>
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
