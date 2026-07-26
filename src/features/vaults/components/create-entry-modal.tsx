import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { NotesField } from './notes-field'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import { analytics } from '../../../shared/lib/analytics'
import { firstError, required, validUrl } from '../../../shared/lib/validation'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  SCRIPT_INTERPRETERS,
  type CustomField,
  type EntryPlaintext,
  type EntryType,
  type ScriptInterpreter,
  type ScriptRef,
  type Vault,
} from '../types'
import {
  agentFieldsFrom,
  foldScriptRefs,
  mergeCredentialTotp,
  validateCustomFields,
  withCustomFields,
} from '../entry-blob'
import { CustomFieldsEditor } from './custom-fields-editor'
import { CredentialTotpField } from './credential-totp-field'
import { EntryIconButton } from './entry-icon-button'
import { ScriptEditor } from './script-editor'
import { ScriptExecHint } from './script-exec-hint'
import { ScriptRefsEditor } from './script-refs-editor'
import { SectionHeader } from './section-header'
import { useCreateEntry } from '../use-create-entry'
import { extractDomain, openExternalUrl } from './entry-presentation'
import { defaultColorFor, defaultIconFor } from './entry-presentation'
import { FormSelect } from '../../../shared/components/form-select'
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

  const [type, setType] = useState<EntryType>(ENTRY_TYPE_KEY)
  const [color, setColor] = useState(defaultColorFor(ENTRY_TYPE_KEY))
  // Pre-select the type's default glyph so a tile is always visibly chosen;
  // switching type follows along until the user picks a local icon.
  const [icon, setIcon] = useState<string | undefined>(defaultIconFor(ENTRY_TYPE_KEY))
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
  const [customFields, setCustomFields] = useState<CustomField[]>([])
  const [credentialTotp, setCredentialTotp] = useState<CustomField | null>(null)
  const [script, setScript] = useState('')
  const [scriptError, setScriptError] = useState(false)
  const [interpreter, setInterpreter] = useState<ScriptInterpreter>('bash')
  const [refs, setRefs] = useState<ScriptRef[]>([])
  const [iconTouched, setIconTouched] = useState(false)

  useEffect(() => {
    analytics.capture('vault', 'create-entry-wizard-opened')
  }, [])

  useEffect(() => {
    setKeyValueError(false)
    setUsernameError(false)
    setPasswordError(false)
    setScriptError(false)
  }, [type])

  const isPending = create.isPending

  const canSubmit = useMemo(() => {
    if (isPending) return false
    if (!label.trim()) return false
    if (type === ENTRY_TYPE_KEY) return keyValue.trim().length > 0
    if (type === ENTRY_TYPE_SCRIPT) return script.trim().length > 0
    return username.trim().length > 0 && password.trim().length > 0
  }, [isPending, label, type, keyValue, username, password, script])

  // Credential 2FA is stored as the first fields[] TOTP entry; merge it with the
  // additional fields for validation and folding.
  const allFields =
    type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(credentialTotp, customFields)
      : customFields
  const fieldsInvalid = validateCustomFields(allFields).hasError

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit || fieldsInvalid) return

    const payload = buildPlaintext({
      type,
      keyValue,
      username,
      password,
      url,
      notes,
      fields: allFields,
      script,
      interpreter,
      refs,
    })

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
        icon,
        color,
        type,
        payload,
        urlDomain: type === ENTRY_TYPE_SCRIPT ? undefined : extractDomain(url) || undefined,
        agentFields: agentFieldsFrom(allFields),
      },
      {
        onSuccess: () => {
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

  const visibleNote = <>· {t('vault.entries.agentVisibleNote')}</>

  return (
    <ModalShell
      onClose={isPending ? undefined : onClose}
      ariaLabel={t('vault.entries.addEntry')}
      title={t('vault.entries.addEntry')}
      width={560}
      footer={
        <div className="flex gap-2.5">
          <Button variant="subtle" size="sm" onClick={onClose} disabled={isPending} className="flex-1">
            {t('vault.cancel')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            type="submit"
            form="entry-create-form"
            disabled={!canSubmit || fieldsInvalid}
            className="flex-[2]"
          >
            {isPending ? t('vault.entries.saving') : t('vault.entries.saveEntry')}
          </Button>
        </div>
      }
    >
      <form id="entry-create-form" className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <FormInput
              id="entry-vault"
              label={t('vault.vault')}
              value={vault.name}
              disabled
              readOnly
            />
            <FormSelect
              id="entry-type"
              label={t('vault.entries.typeLabel')}
              value={String(type)}
              onChange={(e) => {
                const nextType = Number(e.target.value) as EntryType
                const previousType = type
                setType(nextType)
                if (!iconTouched) {
                  const typeDefaults = [
                    defaultIconFor(ENTRY_TYPE_KEY),
                    defaultIconFor(ENTRY_TYPE_CREDENTIAL),
                    defaultIconFor(ENTRY_TYPE_SCRIPT),
                  ]
                  setIcon((current) =>
                    current === undefined || typeDefaults.includes(current)
                      ? defaultIconFor(nextType)
                      : current,
                  )
                  setColor((current) =>
                    current === defaultColorFor(previousType) ? defaultColorFor(nextType) : current,
                  )
                }
              }}
              disabled={isPending}
            >
              <option value={String(ENTRY_TYPE_KEY)}>{t('vault.entries.typeKeyOption')}</option>
              <option value={String(ENTRY_TYPE_CREDENTIAL)}>{t('vault.entries.typeCredentialOption')}</option>
              <option value={String(ENTRY_TYPE_SCRIPT)}>{t('vault.entries.typeScriptOption')}</option>
            </FormSelect>
          </div>

          <div>
            <label
              htmlFor="entry-label"
              className="mb-1 block text-meta font-semibold text-[var(--cv-label-text)]"
            >
              {t('vault.entries.labelLabel')}
              <span className="ml-1.5 font-normal text-[var(--cv-t3)]">{visibleNote}</span>
            </label>
            <div className="flex gap-2">
              <EntryIconButton
                icon={icon}
                color={color}
                type={type}
                onChange={(next) => { setIcon(next); setIconTouched(true) }}
                onColorChange={(next) => { setColor(next); setIconTouched(true) }}
                disabled={isPending}
              />
              <div className="min-w-0 flex-1">
                <FormInput
                  id="entry-label"
                  label={t('vault.entries.labelLabel')}
                  labelClassName="sr-only"
                  value={label}
                  onChange={(e) => { setLabel(e.target.value); setLabelError(false) }}
                  onBlur={() => setLabelError(firstError(label, [required(t('validation.required'))]) !== null)}
                  placeholder={t('vault.entries.labelPlaceholder')}
                  autoFocus
                  autoComplete="off"
                  disabled={isPending}
                  maxLength={120}
                  error={labelError}
                />
                <FeedbackSlot visible={labelError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
              </div>
            </div>
          </div>

          <FormInput
            id="entry-description"
            label={t('vault.entries.descriptionLabel')}
            labelSuffix={visibleNote}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('vault.entries.descriptionPlaceholder')}
            autoComplete="off"
            disabled={isPending}
            maxLength={500}
          />

          {type === ENTRY_TYPE_KEY ? (
            <>
              <div>
                <SecretInput
                  id="entry-value"
                  label={t('vault.entries.valueLabel')}
                  value={keyValue}
                  onChange={(next) => { setKeyValue(next); setKeyValueError(false) }}
                  onBlur={() => setKeyValueError(firstError(keyValue, [required(t('validation.required'))]) !== null)}
                  shown={keyVisible}
                  onToggleShown={() => setKeyVisible((prev) => !prev)}
                  onGenerate={(pw) => { setKeyValue(pw); setKeyVisible(true); setKeyValueError(false) }}
                  placeholder={t('vault.entries.valuePlaceholder')}
                  disabled={isPending}
                  monospace
                  error={keyValueError}
                />
                <FeedbackSlot visible={keyValueError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
              </div>
              <WebsiteField url={url} setUrl={setUrl} urlError={urlError} setUrlError={setUrlError} disabled={isPending} />
            </>
          ) : type === ENTRY_TYPE_CREDENTIAL ? (
            <>
              <div>
                <FormInput
                  id="entry-username"
                  label={t('vault.entries.usernameLabel')}
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setUsernameError(false) }}
                  onBlur={() => setUsernameError(firstError(username, [required(t('validation.required'))]) !== null)}
                  placeholder={t('vault.entries.usernamePlaceholder')}
                  autoComplete="off"
                  disabled={isPending}
                  error={usernameError}
                />
                <FeedbackSlot visible={usernameError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
              </div>
              <div>
                <SecretInput
                  id="entry-password"
                  label={t('vault.entries.passwordLabel')}
                  value={password}
                  onChange={(next) => { setPassword(next); setPasswordError(false) }}
                  onBlur={() => setPasswordError(firstError(password, [required(t('validation.required'))]) !== null)}
                  shown={passwordVisible}
                  onToggleShown={() => setPasswordVisible((prev) => !prev)}
                  onGenerate={(pw) => { setPassword(pw); setPasswordVisible(true); setPasswordError(false) }}
                  placeholder={t('vault.entries.passwordPlaceholder')}
                  disabled={isPending}
                  error={passwordError}
                />
                <FeedbackSlot visible={passwordError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
              </div>
              <WebsiteField url={url} setUrl={setUrl} urlError={urlError} setUrlError={setUrlError} disabled={isPending} />
              <SectionHeader>{t('vault.entries.totp.section')}</SectionHeader>
              <CredentialTotpField value={credentialTotp} onChange={setCredentialTotp} disabled={isPending} />
            </>
          ) : (
            <>
              <div>
                <label
                  htmlFor="entry-interpreter"
                  className="mb-1 flex items-center gap-2 text-meta font-semibold text-[var(--cv-label-text)]"
                >
                  <span>{t('vault.entries.script.bodyLabel')}</span>
                  <span className="flex-1" />
                  <select
                    id="entry-interpreter"
                    aria-label={t('vault.entries.script.interpreterLabel')}
                    value={interpreter}
                    onChange={(e) => setInterpreter(e.target.value as ScriptInterpreter)}
                    disabled={isPending}
                    className="cursor-pointer appearance-none border-0 bg-transparent pr-1 text-meta
                      font-normal text-[var(--cv-t2)] outline-none disabled:cursor-not-allowed"
                  >
                    {SCRIPT_INTERPRETERS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <Icon name="expand_more" size={13} className="-ml-1 text-[var(--cv-icon-muted)]" />
                </label>
                <ScriptEditor
                  value={script}
                  onChange={(next) => { setScript(next); setScriptError(false) }}
                  interpreter={interpreter}
                  disabled={isPending}
                  placeholder={t('vault.entries.script.bodyPlaceholder')}
                />
                <FeedbackSlot visible={scriptError} color="red">
                  {t('validation.required')}
                </FeedbackSlot>
                <ScriptExecHint />
              </div>
              <SectionHeader>{t('vault.entries.script.refsTitle')}</SectionHeader>
              <ScriptRefsEditor vaultId={vault.id} refs={refs} onChange={setRefs} disabled={isPending} />
            </>
          )}

          <SectionHeader>{t('vault.entries.customFields.title')}</SectionHeader>
          <CustomFieldsEditor fields={customFields} onChange={setCustomFields} disabled={isPending} />

          <NotesField id="entry-notes" value={notes} onChange={setNotes} disabled={isPending} />
      </form>
    </ModalShell>
  )
}

/** Shared Website/URL field (KEY + CREDENTIAL) — feeds the favicon and urlDomain. */
function WebsiteField({
  url,
  setUrl,
  urlError,
  setUrlError,
  disabled,
}: {
  url: string
  setUrl: (v: string) => void
  urlError: boolean
  setUrlError: (v: boolean) => void
  disabled: boolean
}) {
  const { t } = useTranslation()
  return (
    <div>
      <FormInput
        id="entry-url"
        label={t('vault.entries.urlLabel')}
        value={url}
        onChange={(e) => { setUrl(e.target.value); setUrlError(false) }}
        onBlur={() => setUrlError(firstError(url.trim(), [validUrl(t('validation.invalidUrl'))]) !== null)}
        placeholder={t('vault.entries.urlPlaceholder')}
        autoComplete="off"
        disabled={disabled}
        inputMode="url"
        error={urlError}
        trailingAction={{
          icon: 'open_in_new',
          label: t('vault.entry.openInBrowser'),
          onClick: () => openExternalUrl(url),
          show: !!extractDomain(url),
        }}
      />
      <FeedbackSlot visible={urlError} color="red">
        {t('validation.invalidUrl')}
      </FeedbackSlot>
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
  /** Merged fields (additional + pinned credential TOTP). */
  fields: CustomField[]
  script: string
  interpreter: ScriptInterpreter
  refs: ScriptRef[]
}

function buildPlaintext(input: BuildPayloadInput): EntryPlaintext {
  const trimmedNotes = input.notes.trim() || undefined
  if (input.type === ENTRY_TYPE_KEY) {
    return withCustomFields(
      { type: ENTRY_TYPE_KEY, value: input.keyValue.trim(), notes: trimmedNotes },
      input.fields,
    )
  }
  if (input.type === ENTRY_TYPE_SCRIPT) {
    const refs = foldScriptRefs(input.refs)
    return withCustomFields(
      {
        v: BLOB_VERSION_V2,
        type: ENTRY_TYPE_SCRIPT,
        script: input.script.trim(),
        interpreter: input.interpreter,
        notes: trimmedNotes,
        ...(refs.length > 0 ? { refs } : {}),
      },
      input.fields,
    )
  }
  const trimmedUrl = input.url.trim() || undefined
  return withCustomFields(
    {
      type: ENTRY_TYPE_CREDENTIAL,
      username: input.username.trim(),
      password: input.password.trim(),
      url: trimmedUrl,
      notes: trimmedNotes,
    },
    input.fields,
  )
}
