import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { analytics } from '../../../shared/lib/analytics'
import type { EntryPlaintext, EntryType, Vault } from '../types'
import { useCreateEntry } from '../use-create-entry'
import { extractDomain } from './entry-presentation'
import { ModalShell } from './modal-shell'

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

  const [type, setType] = useState<EntryType>('KEY')
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

  const canSubmit = useMemo(() => {
    if (isPending) return false
    if (!label.trim()) return false
    if (type === 'KEY') return keyValue.trim().length > 0
    return username.trim().length > 0 && password.trim().length > 0
  }, [isPending, label, type, keyValue, username, password])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return
    setErrorMessage(null)

    const payload = buildPlaintext({
      type,
      keyValue,
      username,
      password,
      url,
      notes,
    })

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
        type,
        payload,
        urlDomain: type === 'CREDENTIAL' ? extractDomain(url) : undefined,
      },
      {
        onSuccess: () => {
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
          disabled={isPending}
          maxLength={500}
        />

        <div>
          <label
            htmlFor="entry-type"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]
              text-[var(--cv-label-text)]"
          >
            {t('vault.entries.typeLabel')}
          </label>
          <select
            id="entry-type"
            value={type}
            onChange={(e) => setType(e.target.value as EntryType)}
            disabled={isPending}
            className="w-full rounded-lg border border-[var(--cv-input-border)]
              bg-[var(--cv-input-bg)] px-3 py-2 text-sm text-[var(--cv-input-text)]
              focus:border-[var(--cv-t1)] focus:outline-none"
          >
            <option value="KEY">{t('vault.entries.typeKeyOption')}</option>
            <option value="CREDENTIAL">{t('vault.entries.typeCredentialOption')}</option>
          </select>
        </div>

        {type === 'KEY' ? (
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
          disabled={isPending}
          rows={2}
          maxLength={2000}
        />

        <div className="flex items-center gap-2 rounded-lg border border-[rgba(46,196,182,0.25)]
          bg-[rgba(46,196,182,0.08)] px-3 py-2">
          <Icon
            name="enhanced_encryption"
            size={14}
            className="shrink-0"
            color="#2EC4B6"
          />
          <span className="text-[11px] text-[var(--cv-t2)]">
            {t('vault.entries.encryptionNotice')}
          </span>
        </div>

        <FieldFeedback visible={errorMessage !== null} color="red">
          {errorMessage}
        </FieldFeedback>

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
        className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.04em]
          text-[var(--cv-label-text)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
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
  if (input.type === 'KEY') {
    return {
      type: 'KEY',
      value: input.keyValue.trim(),
      notes: trimmedNotes,
    }
  }
  const trimmedUrl = input.url.trim() || undefined
  return {
    type: 'CREDENTIAL',
    username: input.username.trim(),
    password: input.password.trim(),
    url: trimmedUrl,
    notes: trimmedNotes,
  }
}
