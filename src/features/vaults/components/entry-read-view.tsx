import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { CopyButton } from '../../../shared/components/copy-button'
import { Icon } from '../../../shared/components/icon'
import type { MemberSecretView } from '../../../shared/crypto/entry-draft'
import { ENTITY_ICON_FRAME_CLASSES } from '../../../shared/lib/styles'

const READ_CARD_CLASSES = 'rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { readCustomFields } from '../entry-blob'
import { readSignInMethods } from '../sign-in-method'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  isTotpField,
  type CustomField,
  type EntryType,
  type TotpParams,
} from '../types'
import { EntryIcon } from './entry-icon'
import { extractDomain, openExternalUrl } from './entry-presentation'
import { ScriptEditor } from './script-editor'
import { SectionHeader } from './section-header'
import { useTotp } from '../../../shared/hooks/use-totp'
import { parseOtpauthUri } from '../../../shared/crypto/totp'

export interface EntryReadViewProps {
  vaultId: string
  vaultName: string
  entryType: EntryType
  icon: string | undefined
  color?: string
  secret: MemberSecretView
  onEdit: () => void
  shareAction?: ReactNode
  footer?: ReactNode
}

const TYPE_LABEL_KEYS: Record<EntryType, string> = {
  [ENTRY_TYPE_KEY]: 'entries.type.key',
  [ENTRY_TYPE_CREDENTIAL]: 'entries.type.credential',
  [ENTRY_TYPE_SCRIPT]: 'entries.type.script',
  [ENTRY_TYPE_CREDIT_CARD]: 'entries.type.creditCard',
}

/**
 * Read-only Entry details, mirroring the browser extension: an identity card
 * with the primary actions, then label/value rows with reveal and copy. Agent
 * visibility controls stay in edit mode only.
 */
export function EntryReadView({
  vaultId, vaultName, entryType, icon, color, secret, onEdit, shareAction, footer,
}: EntryReadViewProps) {
  const { t } = useTranslation()
  const content = secret.content
  const url = 'url' in content ? content.url ?? '' : ''
  const customFields = readCustomFields(content)
  const signIn = content.type === ENTRY_TYPE_CREDENTIAL ? readSignInMethods(customFields) : []
  // Same precedence as the editor: a parseable native TOTP wins and keeps every custom field;
  // otherwise the first custom TOTP field is pinned.
  const nativeTotp = content.type === ENTRY_TYPE_CREDENTIAL && content.totp ? parseOtpauthUri(content.totp) : null
  const pinnedField = content.type === ENTRY_TYPE_CREDENTIAL && !nativeTotp
    ? customFields.find((field) => field.type === 'totp')
    : undefined
  const pinnedTotp = pinnedField && isRenderableTotp(pinnedField) ? pinnedField : undefined
  const totpParams = nativeTotp ?? pinnedTotp?.value ?? null
  const renderedSignInIds = new Set(signIn.map(({ fieldId }) => fieldId))
  const otherFields = customFields.filter((field) => field !== pinnedTotp && !renderedSignInIds.has(field.id))
  const notes = content.notes?.trim() ?? ''
  const description = content.type === ENTRY_TYPE_SCRIPT
    ? content.execution?.description ?? secret.description
    : secret.description

  return (
    <div className="ph-no-capture flex flex-col gap-3.5">
      <div className={`${READ_CARD_CLASSES} flex items-center gap-3 p-4`}>
        <EntryIcon icon={icon} type={entryType} color={color}
          className={`${ENTITY_ICON_FRAME_CLASSES} h-11 w-11 shrink-0`} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]" title={secret.memberLabel}>
            {secret.memberLabel}
          </h2>
          <p className="truncate text-meta text-[var(--cv-t3)]">
            {vaultName} · {t(TYPE_LABEL_KEYS[entryType])}
          </p>
        </div>
        {extractDomain(url) ? (
          <Button variant="subtle" size="sm" icon="open_in_new" onClick={() => openExternalUrl(url)}>
            {t('vault.entry.detail.openWebsite')}
          </Button>
        ) : null}
        <Button variant="subtle" size="sm" icon="edit" onClick={onEdit}>
          {t('vault.entry.detail.edit')}
        </Button>
        {shareAction}
      </div>

      <ReadCard>
        {description ? <ValueRow label={t('vault.entries.descriptionLabel')} value={description} multiline /> : null}
        {content.type === ENTRY_TYPE_CREDENTIAL ? (
          <>
            {content.username ? (
              <ValueRow label={t('vault.entries.usernameLabel')} value={content.username}
                copyLabel={t('vault.entry.copyUsername')} />
            ) : null}
            {content.password ? (
              <SecretRow label={t('vault.entries.passwordLabel')} value={content.password}
                copyLabel={t('vault.entry.copyPassword')} />
            ) : null}
            {url ? <ValueRow label={t('vault.entries.urlLabel')} value={url} copyLabel={t('vault.entry.copyUrl')} /> : null}
            {signIn.map(({ fieldId, binding }) => (
              <Row key={fieldId}
                label={t('vault.entries.signInMethod.signInWithProvider', {
                  provider: t(`vault.entries.signInMethod.providers.${binding.provider}`),
                })}
                actions={
                  <span className="inline-flex h-action w-action items-center justify-center">
                    <img src={`/sign-in-providers/${binding.provider}.svg`} alt=""
                      className={`h-6 w-6 object-contain ${binding.provider === 'apple' || binding.provider === 'github' ? 'brightness-0 dark:invert' : ''}`} />
                  </span>
                }>
                <span className="block truncate">
                  {binding.account ?? <span className="text-[var(--cv-t3)]">{t('vault.entries.signInMethod.accountNotSpecified')}</span>}
                </span>
              </Row>
            ))}
            {totpParams ? <TotpRow label={t('vault.entries.totp.section')} params={totpParams} /> : null}
          </>
        ) : null}
        {content.type === ENTRY_TYPE_KEY ? (
          <>
            <SecretRow label={t('vault.entries.valueLabel')} value={content.value} copyLabel={t('vault.entry.copyKey')} monospace />
            {url ? <ValueRow label={t('vault.entries.urlLabel')} value={url} copyLabel={t('vault.entry.copyUrl')} /> : null}
          </>
        ) : null}
        {content.type === ENTRY_TYPE_CREDIT_CARD ? (
          <>
            <ValueRow label={t('vault.entries.card.cardholderName')} value={content.cardholderName} />
            <SecretRow label={t('vault.entries.card.cardNumber')} value={content.cardNumber}
              display={(shown) => shown ? groupCardNumber(content.cardNumber) : `•••• ${content.cardNumber.slice(-4)}`}
              copyLabel={t('vault.entry.copyCardNumber')} monospace />
            <ValueRow label={t('vault.entry.detail.expiry')} value={`${content.expiryMonth}/${content.expiryYear}`} />
            {content.cvv ? <SecretRow label={t('vault.entries.card.cvv')} value={content.cvv} monospace /> : null}
            {content.billingAddress ? (
              <ValueRow label={t('vault.entry.detail.billingAddress')} value={content.billingAddress} multiline />
            ) : null}
          </>
        ) : null}
        {content.type === ENTRY_TYPE_SCRIPT ? (
          <Row label={t('vault.entries.script.bodyLabel')} meta={content.interpreter}
            actions={<CopyButton value={content.script} label={t('vault.entry.copyScript')} secret />}
            stacked>
            <ScriptEditor value={content.script} onChange={() => {}} interpreter={content.interpreter} disabled />
          </Row>
        ) : null}
      </ReadCard>

      {content.type === ENTRY_TYPE_SCRIPT ? (
        <ScriptContract vaultId={vaultId} refs={content.refs ?? []}
          parameters={content.execution?.parameters ?? []}
          returnsResult={content.execution?.returnResultToAgent === true} />
      ) : null}

      {otherFields.length > 0 ? (
        <>
          <SectionHeader>{t('vault.entries.customFields.title')}</SectionHeader>
          <ReadCard>
            {otherFields.map((field) => <CustomFieldRow key={field.id} field={field} />)}
          </ReadCard>
        </>
      ) : null}

      {notes ? <NotesCard notes={notes} /> : null}

      {footer}
    </div>
  )
}

function ReadCard({ children }: { children: ReactNode }) {
  return <div className={`${READ_CARD_CLASSES} flex flex-col divide-y divide-[var(--cv-divider)]`}>{children}</div>
}

function Row({ label, meta, hideLabel, actions, stacked, children }: {
  label: string
  meta?: string
  hideLabel?: boolean
  actions?: ReactNode
  stacked?: boolean
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {hideLabel ? null : (
            <p className="text-meta text-[var(--cv-t3)]">
              {label}{meta ? <span className="text-[var(--cv-t3)]"> · {meta}</span> : null}
            </p>
          )}
          {stacked ? null : <div className="mt-0.5 min-w-0 text-ui text-[var(--cv-t1)]">{children}</div>}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {stacked ? <div className="mt-1">{children}</div> : null}
    </div>
  )
}

function ValueRow({ label, value, copyLabel, multiline }: {
  label: string
  value: string
  copyLabel?: string
  multiline?: boolean
}) {
  return (
    <Row label={label} actions={<CopyButton value={value} label={copyLabel} />}>
      <span className={multiline ? 'whitespace-pre-wrap break-words' : 'block truncate'} title={multiline ? undefined : value}>
        {value}
      </span>
    </Row>
  )
}

function SecretRow({ label, value, copyLabel, monospace, display }: {
  label: string
  value: string
  copyLabel?: string
  monospace?: boolean
  display?: (shown: boolean) => string
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const text = display ? display(shown) : shown ? value : '•'.repeat(Math.min(Math.max(value.length, 8), 18))
  return (
    <Row label={label} actions={<>
      <button
        type="button"
        onClick={() => setShown((current) => !current)}
        aria-label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
        title={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
        className="inline-flex h-action w-action items-center justify-center rounded text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]"
      >
        <Icon name={shown ? 'visibility_off' : 'visibility'} size={16} />
      </button>
      <CopyButton value={value} label={copyLabel} secret />
    </>}>
      <span className={`block break-all ${monospace || !shown ? 'font-mono tracking-wide' : ''}`}>{text}</span>
    </Row>
  )
}

function TotpRow({ label, params }: { label: string; params: TotpParams }) {
  const { t } = useTranslation()
  const code = useTotp(params)
  const half = code ? Math.ceil(code.code.length / 2) : 0
  return (
    <Row label={label} actions={<>
      <span
        role="timer"
        aria-live="off"
        aria-label={code ? t('vault.entries.totp.remaining', { seconds: code.expiresIn }) : undefined}
        className={`w-[4ch] text-center text-meta tabular-nums ${code && code.expiresIn < 10 ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t3)]'}`}
      >
        {code ? t('vault.entries.totp.seconds', { seconds: code.expiresIn }) : null}
      </span>
      <CopyButton value={code?.code ?? ''} label={t('vault.entries.totp.copyCode')} />
    </>}>
      <span className="block font-mono tracking-wide tabular-nums" aria-label={t('vault.entries.totp.currentCode')}>
        {code ? `${code.code.slice(0, half)} ${code.code.slice(half)}` : '••• •••'}
      </span>
    </Row>
  )
}

const NOTES_PREVIEW_LINES = 6

function NotesCard({ notes }: { notes: string }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const long = notes.split('\n').length > NOTES_PREVIEW_LINES || notes.length > 600
  return (
    <ReadCard>
      <Row label={t('vault.entries.notesLabel')} actions={<CopyButton value={notes} />}>
        <p className={`whitespace-pre-wrap break-words leading-relaxed text-[var(--cv-t2)] ${long && !expanded ? 'line-clamp-6' : ''}`}>
          {notes}
        </p>
        {long ? (
          <button type="button" onClick={() => setExpanded((value) => !value)}
            className="mt-1 text-meta font-medium text-[var(--cv-t1)] underline-offset-2 hover:underline">
            {t(expanded ? 'vault.entry.detail.notesShowLess' : 'vault.entry.detail.notesShowAll')}
          </button>
        ) : null}
      </Row>
    </ReadCard>
  )
}

function CustomFieldRow({ field }: { field: CustomField }) {
  if (isRenderableTotp(field)) return <TotpRow label={field.label} params={field.value} />
  const value = typeof field.value === 'string' ? field.value : JSON.stringify(field.value) ?? ''
  if (field.type === 'text') return <ValueRow label={field.label} value={value} />
  if (field.type === 'multiline') return <ValueRow label={field.label} value={value} multiline />
  return <SecretRow label={field.label} value={value} monospace />
}

function ScriptContract({ vaultId, refs, parameters, returnsResult }: {
  vaultId: string
  refs: { env: string; entryId: string; field: string; vaultId?: string }[]
  parameters: { name: string; type: string; required: boolean; description: string }[]
  returnsResult: boolean
}) {
  const { t } = useTranslation()
  const entries = useMemberSyncStore((store) => store.vaults.get(vaultId)?.entries)
  return (
    <>
      {refs.length > 0 ? (
        <>
          <SectionHeader>{t('vault.entries.script.refsTitle')}</SectionHeader>
          <ReadCard>
            {refs.map((ref) => (
              <Row key={ref.env} label={ref.env}>
                <span className="block truncate">
                  {entries?.get(ref.entryId)?.payload?.memberLabel ?? ref.entryId}
                  <span className="text-[var(--cv-t3)]"> · {ref.field}</span>
                </span>
              </Row>
            ))}
          </ReadCard>
        </>
      ) : null}
      {parameters.length > 0 ? (
        <>
          <SectionHeader>{t('vault.entries.script.parametersTitle')}</SectionHeader>
          <ReadCard>
            {parameters.map((parameter) => (
              <Row key={parameter.name} label={parameter.name}
                meta={`${t(`vault.entries.script.parameterType${capitalize(parameter.type)}`)} · ${t(parameter.required
                  ? 'vault.entries.script.parameterRequired'
                  : 'vault.entries.script.parameterOptional')}`}>
                <span className="whitespace-pre-wrap break-words">{parameter.description}</span>
              </Row>
            ))}
          </ReadCard>
        </>
      ) : null}
      <ReadCard>
        <Row label={t('vault.entries.script.returnResultLabel')}>
          {t(returnsResult ? 'vault.entry.detail.yes' : 'vault.entry.detail.no')}
        </Row>
      </ReadCard>
    </>
  )
}

// Unknown or empty TOTP payloads fall back to a concealed value instead of a fake code.
function isRenderableTotp(field: CustomField): field is CustomField & { value: TotpParams } {
  return isTotpField(field) && field.value.secret.length > 0
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function groupCardNumber(value: string): string {
  return value.replace(/[ -]/g, '').replace(/(.{4})(?=.)/g, '$1 ')
}
