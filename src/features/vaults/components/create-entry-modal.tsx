import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot, FormInput } from '../../../shared/components/form-field'
import { NotesField } from './notes-field'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import { analytics } from '../../../shared/lib/analytics'
import {
  allowedAgentFieldAccess,
  defaultAgentVisibilityPolicy,
  ENTRY_FIELD,
  type AgentVisibilityPolicy,
} from '../../../shared/crypto/entry-draft'
import { firstError, required, validUrl } from '../../../shared/lib/validation'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
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
import { DiscoveryToggle, discoveryAction } from './discovery-toggle'
import {
  ensureWebsiteIconsWithin,
  normalizePublicHostname,
} from '../../../shared/api/public-assets-api'
import { publicAssetIconReference } from '../../../shared/crypto/vault-plaintext'

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
  const navigate = useNavigate()
  const create = useCreateEntry()

  const [type, setType] = useState<EntryType>(ENTRY_TYPE_CREDENTIAL)
  const [color, setColor] = useState(defaultColorFor(ENTRY_TYPE_CREDENTIAL))
  // Pre-select the type's default glyph so a tile is always visibly chosen;
  // switching type follows along until the user picks a local icon.
  const [icon, setIcon] = useState<string | undefined>(defaultIconFor(ENTRY_TYPE_CREDENTIAL))
  const [iconFile, setIconFile] = useState<File | undefined>()
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
  const [cardholderName, setCardholderName] = useState('')
  const [cardholderNameError, setCardholderNameError] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [cardNumberError, setCardNumberError] = useState(false)
  const [expiryMonth, setExpiryMonth] = useState('')
  const [expiryMonthError, setExpiryMonthError] = useState(false)
  const [expiryYear, setExpiryYear] = useState('')
  const [expiryYearError, setExpiryYearError] = useState(false)
  const [securityCode, setSecurityCode] = useState('')
  const [securityCodeError, setSecurityCodeError] = useState(false)
  const [cardPin, setCardPin] = useState('')
  const [billingAddress, setBillingAddress] = useState('')
  const [cardNumberVisible, setCardNumberVisible] = useState(false)
  const [securityCodeVisible, setSecurityCodeVisible] = useState(false)
  const [cardPinVisible, setCardPinVisible] = useState(false)
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
  const [automaticIcon, setAutomaticIcon] = useState<{ hostname: string; reference: string } | null>(null)
  const [discoverable, setDiscoverable] = useState(true)
  const [policyOverrides, setPolicyOverrides] = useState<AgentVisibilityPolicy['fields']>({})
  const [resolvingIcon, setResolvingIcon] = useState(false)

  const allFields = useMemo(
    () => type === ENTRY_TYPE_CREDENTIAL
      ? mergeCredentialTotp(credentialTotp, customFields)
      : customFields,
    [credentialTotp, customFields, type],
  )
  const agentLabel = label
  const policy = useMemo<AgentVisibilityPolicy>(() => {
    const defaults = defaultAgentVisibilityPolicy(type, allFields)
    const customTypes = new Map(allFields.map((field) => [`custom:${field.id}`, field.type]))
    return {
      discoverable,
      fields: Object.fromEntries(Object.entries(defaults.fields).map(([fieldId, fallback]) => {
        const candidate = policyOverrides[fieldId]
        const access = candidate && allowedAgentFieldAccess(type, fieldId, customTypes.get(fieldId)).includes(candidate)
          ? candidate
          : fallback
        return [fieldId, fieldId === ENTRY_FIELD.agentLabel ? (discoverable ? 'discovery' : 'never') : access]
      })),
    }
  }, [allFields, discoverable, policyOverrides, type])

  useEffect(() => {
    analytics.capture('vault', 'create-entry-wizard-opened')
  }, [])

  useEffect(() => {
    if (iconTouched || type === ENTRY_TYPE_SCRIPT) return
    const hostname = normalizePublicHostname(url)
    if (!hostname) return
    let active = true
    const timer = window.setTimeout(() => {
      // A new catalog record is initially Pending. Keep this URL-specific
      // preview bounded, but allow acquisition to reach Ready instead of
      // permanently leaving the type glyph after a single ensure response.
      void ensureWebsiteIconsWithin([hostname], 5_000).then((assets) => {
        const asset = assets.get(hostname)
        if (active && asset) {
          const reference = publicAssetIconReference({ assetId: asset.id, revision: asset.revision, url: asset.url })
          setAutomaticIcon({ hostname, reference })
          setIcon(reference)
        }
      }).catch(() => undefined)
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [iconTouched, type, url])

  const isPending = create.isPending || resolvingIcon

  const canSubmit = useMemo(() => {
    if (isPending) return false
    if (!label.trim()) return false
    if (type === ENTRY_TYPE_KEY) return keyValue.trim().length > 0
    if (type === ENTRY_TYPE_SCRIPT) return script.trim().length > 0
    if (type === ENTRY_TYPE_CREDIT_CARD) return cardholderName.trim().length > 0
      && cardholderName.trim().length <= 256
      && /^\d{12,19}$/.test(cardNumber.replace(/[ -]/g, ''))
      && /^(0[1-9]|1[0-2])$/.test(expiryMonth) && /^\d{4}$/.test(expiryYear)
      && /^\d{3,4}$/.test(securityCode)
    return username.trim().length > 0 && password.trim().length > 0
  }, [isPending, label, type, keyValue, username, password, script, cardholderName, cardNumber, expiryMonth, expiryYear, securityCode])

  const fieldsInvalid = validateCustomFields(allFields).hasError

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl)
    setUrlError(false)
    if (!iconTouched) {
      setAutomaticIcon(null)
      setIcon(defaultIconFor(type))
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
      cardholderName, cardNumber, expiryMonth, expiryYear, securityCode, cardPin, billingAddress,
    })

    const hostname = !iconTouched && type !== ENTRY_TYPE_SCRIPT ? normalizePublicHostname(url) : null
    let iconReference = iconTouched
      ? icon
      : automaticIcon?.hostname === hostname
        ? automaticIcon.reference
        : defaultIconFor(type)
    if (hostname) {
      setResolvingIcon(true)
      try {
        const asset = (await ensureWebsiteIconsWithin([hostname], 1_500)).get(hostname)
        if (asset) iconReference = publicAssetIconReference({ assetId: asset.id, revision: asset.revision, url: asset.url })
      } finally {
        setResolvingIcon(false)
      }
    }

    create.mutate(
      {
        vaultId: vault.id,
        label: label.trim(),
        agentLabel: agentLabel.trim(),
        description: description.trim() || undefined,
        iconReference,
        ...(iconFile ? { iconFile } : {}),
        type,
        payload,
        policy,
      },
      {
        onSuccess: ({ id: entryId }) => {
          analytics.capture('vault', 'create-entry-wizard-completed', { type })
          toast.success(t('vault.entries.createSuccess'))
          onClose()
          void navigate({
            to: '/vaults/$vaultId/entries/$entryId',
            params: { vaultId: vault.id, entryId },
          })
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
      title={t('vault.entries.addEntry')}
      width={560}
      footer={
        <DialogFooter>
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
        </DialogFooter>
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
                setDiscoverable(true)
                setPolicyOverrides({})
                setKeyValueError(false)
                setUsernameError(false)
                setPasswordError(false)
                setScriptError(false)
                if (!iconTouched) {
                  setAutomaticIcon(null)
                  setIcon(defaultIconFor(nextType))
                  setColor((current) =>
                    current === defaultColorFor(previousType) ? defaultColorFor(nextType) : current,
                  )
                }
              }}
              disabled={isPending}
            >
              <option value={String(ENTRY_TYPE_CREDENTIAL)}>{t('vault.entries.typeCredentialOption')}</option>
              <option value={String(ENTRY_TYPE_KEY)}>{t('vault.entries.typeKeyOption')}</option>
              <option value={String(ENTRY_TYPE_SCRIPT)}>{t('vault.entries.typeScriptOption')}</option>
              <option value={String(ENTRY_TYPE_CREDIT_CARD)}>{t('vault.entries.typeCreditCardOption')}</option>
            </FormSelect>
          </div>

          <div>
            <label htmlFor="entry-label" className="mb-1 block text-meta font-semibold text-[var(--cv-label-text)]">
              {t('vault.entries.labelLabel')}
            </label>
            <div className="flex gap-2">
              <EntryIconButton
                icon={icon}
                color={color}
                type={type}
                onChange={(next) => { setIcon(next); setIconTouched(true) }}
                onColorChange={(next) => { setColor(next); setIconTouched(true) }}
                onFileSelected={(file, previewUrl) => {
                  setIconFile(file)
                  setIcon(previewUrl)
                  setIconTouched(true)
                }}
                disabled={isPending}
              />
              <div className="min-w-0 flex-1">
                <FormInput
                  id="entry-label"
                  label={t('vault.entries.labelLabel')}
                  labelClassName="sr-only"
                  trailingActions={[{
                    icon: 'smart_toy',
                    label: t(discoverable
                      ? 'vault.entries.visibility.hideFromDiscovery'
                      : 'vault.entries.visibility.showInDiscovery'),
                    active: discoverable,
                    disabled: isPending,
                    onClick: () => setDiscoverable(!discoverable),
                  }]}
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
            trailingActions={[discoveryAction(
              policy.fields[ENTRY_FIELD.description] === 'discovery',
              isPending || !discoverable,
              (active) => setPolicyOverrides((current) => ({
                ...current, [ENTRY_FIELD.description]: active ? 'discovery' : 'never',
              })),
              t,
            )]}
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
              <WebsiteField url={url} onChange={handleUrlChange} urlError={urlError} setUrlError={setUrlError} disabled={isPending} />
            </>
          ) : type === ENTRY_TYPE_CREDIT_CARD ? (
            <>
              <div>
                <FormInput id="entry-cardholder" label={t('vault.entries.card.cardholderName')} value={cardholderName}
                  onChange={(e) => { setCardholderName(e.target.value); setCardholderNameError(false) }}
                  onBlur={() => setCardholderNameError(!cardholderName.trim())}
                  autoComplete="cc-name" maxLength={256} disabled={isPending} error={cardholderNameError} />
                <FeedbackSlot visible={cardholderNameError} color="red">{t('validation.required')}</FeedbackSlot>
              </div>
              <div>
                <SecretInput id="entry-card-number" label={t('vault.entries.card.cardNumber')} value={cardNumber}
                  onChange={(value) => { setCardNumber(value); setCardNumberError(false) }}
                  onBlur={() => setCardNumberError(!/^\d{12,19}$/.test(cardNumber.replace(/[ -]/g, '')))}
                  shown={cardNumberVisible} onToggleShown={() => setCardNumberVisible((value) => !value)}
                  disabled={isPending} monospace error={cardNumberError} />
                <FeedbackSlot visible={cardNumberError} color="red">{t('vault.entries.card.invalidCardNumber')}</FeedbackSlot>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <FormInput id="entry-expiry-month" label={t('vault.entries.card.expiryMonth')} value={expiryMonth}
                    onChange={(e) => { setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2)); setExpiryMonthError(false) }}
                    onBlur={() => setExpiryMonthError(!/^(0[1-9]|1[0-2])$/.test(expiryMonth))}
                    autoComplete="cc-exp-month" disabled={isPending} error={expiryMonthError} />
                  <FeedbackSlot visible={expiryMonthError} color="red">{t('vault.entries.card.invalidExpiryMonth')}</FeedbackSlot>
                </div>
                <div>
                  <FormInput id="entry-expiry-year" label={t('vault.entries.card.expiryYear')} value={expiryYear}
                    onChange={(e) => { setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4)); setExpiryYearError(false) }}
                    onBlur={() => setExpiryYearError(!/^\d{4}$/.test(expiryYear))}
                    autoComplete="cc-exp-year" disabled={isPending} error={expiryYearError} />
                  <FeedbackSlot visible={expiryYearError} color="red">{t('vault.entries.card.invalidExpiryYear')}</FeedbackSlot>
                </div>
                <div>
                  <SecretInput id="entry-security-code" label={t('vault.entries.card.securityCode')} value={securityCode}
                    onChange={(value) => { setSecurityCode(value.replace(/\D/g, '').slice(0, 4)); setSecurityCodeError(false) }}
                    onBlur={() => setSecurityCodeError(!/^\d{3,4}$/.test(securityCode))}
                    shown={securityCodeVisible} onToggleShown={() => setSecurityCodeVisible((value) => !value)}
                    disabled={isPending} monospace error={securityCodeError} />
                  <FeedbackSlot visible={securityCodeError} color="red">{t('vault.entries.card.invalidSecurityCode')}</FeedbackSlot>
                </div>
              </div>
              <SecretInput id="entry-card-pin" label={t('vault.entries.card.pin')} value={cardPin}
                onChange={setCardPin} shown={cardPinVisible} onToggleShown={() => setCardPinVisible((value) => !value)} disabled={isPending} monospace />
              <FormInput id="entry-billing-address" label={t('vault.entries.card.billingAddress')} value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)} autoComplete="street-address" disabled={isPending} />
            </>
          ) : type === ENTRY_TYPE_CREDENTIAL ? (
            <>
              <div>
                <FormInput
                  id="entry-username"
                  label={t('vault.entries.usernameLabel')}
                  trailingActions={[discoveryAction(
                    policy.fields[ENTRY_FIELD.username] === 'discovery',
                    isPending || !discoverable,
                    (active) => setPolicyOverrides((current) => ({
                      ...current, [ENTRY_FIELD.username]: active ? 'discovery' : 'never',
                    })),
                    t,
                  )]}
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
              <WebsiteField url={url} onChange={handleUrlChange} urlError={urlError} setUrlError={setUrlError}
                disabled={isPending} discovery={policy.fields[ENTRY_FIELD.urlDomain] === 'discovery'}
                discoveryDisabled={!discoverable} onDiscoveryChange={(active) => setPolicyOverrides((current) => ({
                  ...current, [ENTRY_FIELD.urlDomain]: active ? 'discovery' : 'never',
                }))} />
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
                  <DiscoveryToggle
                    active={policy.fields[ENTRY_FIELD.interpreter] === 'discovery'}
                    disabled={isPending || !discoverable}
                    onChange={(active) => setPolicyOverrides((current) => ({
                      ...current, [ENTRY_FIELD.interpreter]: active ? 'discovery' : 'never',
                    }))}
                  />
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
  onChange,
  urlError,
  setUrlError,
  disabled,
  discovery,
  discoveryDisabled,
  onDiscoveryChange,
}: {
  url: string
  onChange: (v: string) => void
  urlError: boolean
  setUrlError: (v: boolean) => void
  disabled: boolean
  discovery?: boolean
  discoveryDisabled?: boolean
  onDiscoveryChange?: (active: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <div>
      <FormInput
        id="entry-url"
        label={t('vault.entries.urlLabel')}
        trailingActions={onDiscoveryChange ? [discoveryAction(
          discovery ?? false,
          disabled || discoveryDisabled,
          onDiscoveryChange,
          t,
        )] : undefined}
        value={url}
        onChange={(e) => onChange(e.target.value)}
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
  cardholderName: string
  cardNumber: string
  expiryMonth: string
  expiryYear: string
  securityCode: string
  cardPin: string
  billingAddress: string
}

function buildPlaintext(input: BuildPayloadInput): EntryPlaintext {
  const trimmedNotes = input.notes.trim() || undefined
  if (input.type === ENTRY_TYPE_KEY) {
    return withCustomFields(
      {
        type: ENTRY_TYPE_KEY,
        value: input.keyValue.trim(),
        url: input.url.trim() || undefined,
        notes: trimmedNotes,
      },
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
  if (input.type === ENTRY_TYPE_CREDIT_CARD) return withCustomFields({
    v: BLOB_VERSION_V2, type: ENTRY_TYPE_CREDIT_CARD,
    cardholderName: input.cardholderName.trim(), cardNumber: input.cardNumber.replace(/[ -]/g, ''),
    expiryMonth: input.expiryMonth, expiryYear: input.expiryYear, securityCode: input.securityCode,
    pin: input.cardPin.trim() || undefined, billingAddress: input.billingAddress.trim() || undefined,
    notes: trimmedNotes,
  }, input.fields)
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
