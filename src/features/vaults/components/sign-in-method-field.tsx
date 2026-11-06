import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { SectionHeader } from './section-header'
import { useTranslation } from 'react-i18next'
import { AddButton } from '../../../shared/components/add-button'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import { env } from '../../../shared/lib/env'
import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import {
  SIGN_IN_ACCOUNT_MAX_LENGTH,
  type SignInBinding,
  type SignInProvider,
  normalizeSignInAccount,
  readSignInMethods,
  updateSignInMethod,
} from '../sign-in-method'
import type { CustomField } from '../types'
import { useSignInAccountCandidates, useSignInEntryLabel } from '../use-sign-in-account-candidates'

const PROVIDER_DISPLAY_ORDER = ['google', 'github', 'apple', 'microsoft', 'facebook'] as const satisfies readonly SignInProvider[]

export interface SignInMethodAgentVisibility {
  isVisible: (fieldId: string) => boolean
  onChange: (fieldId: string, visible: boolean) => void
  disabled?: boolean
  newMethodVisible?: boolean
}

export interface SignInMethodFieldProps {
  /** The Credential's additional custom fields; bindings live among them. */
  fields: CustomField[]
  onChange: (next: CustomField[]) => void
  disabled?: boolean
  /** The edited Credential itself is never offered as its own provider account. */
  entryId?: string
  /** Owner-facing Discovery switch for a recognized binding. */
  agentVisibility?: SignInMethodAgentVisibility
}

/** Login-only collection editor; changes are committed from the modal by stable field ID. */
export function SignInMethodField({ fields, onChange, disabled, entryId, agentVisibility }: SignInMethodFieldProps) {
  const { t } = useTranslation()
  const methods = readSignInMethods(fields)
  const [editing, setEditing] = useState<{ fieldId: string | null; binding: SignInBinding; visible: boolean } | null>(null)
  const close = () => setEditing(null)
  const save = () => {
    if (!editing) return
    const next = updateSignInMethod(fields, editing.fieldId, editing.binding, t('vault.entries.signInMethod.title'))
    onChange(next)
    const id = editing.fieldId ?? next[next.length - 1].id
    // Preserve existing policy unless the owner explicitly changed its switch.
    if (agentVisibility && (editing.fieldId === null || editing.visible !== agentVisibility.isVisible(id))) agentVisibility.onChange(id, editing.visible)
    close()
  }
  return (
    <section className="ph-no-capture flex flex-col gap-3">
      <div className="flex items-center gap-2 pr-[calc(0.75rem+1px)]">
        <div className="min-w-0 flex-1"><SectionHeader>{t('vault.entries.signInMethod.title')}</SectionHeader></div>
        <AddButton label={t('vault.entries.signInMethod.add')} disabled={disabled}
          onClick={() => setEditing({ fieldId: null, binding: { provider: 'google', account: null, entry: null }, visible: agentVisibility?.newMethodVisible ?? false })} />
      </div>
      {methods.length > 0 ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {methods.map((method) => <div key={method.fieldId}
          className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--cv-input-border)] p-3">
          <img src={`/sign-in-providers/${method.binding.provider}.svg`} alt="" className={`h-6 w-6 shrink-0 object-contain ${method.binding.provider === 'apple' || method.binding.provider === 'github' ? 'brightness-0 dark:invert' : ''}`}  />
          <div className="min-w-0 flex-1">
            <div className="truncate text-ui font-medium text-[var(--cv-t1)]">{t(`vault.entries.signInMethod.providers.${method.binding.provider}`)}</div>
            <Tooltip content={method.binding.account ?? t('vault.entries.signInMethod.accountNotSpecified')} className="block truncate text-meta text-[var(--cv-t3)]">
              {method.binding.account ?? t('vault.entries.signInMethod.accountNotSpecified')}
            </Tooltip>
          </div>
          <Button variant="ghost" size="sm" icon="edit" aria-label={t('vault.entries.signInMethod.edit')}
            disabled={disabled} onClick={() => setEditing({ ...method, visible: agentVisibility?.isVisible(method.fieldId) ?? false })} />
        </div>)}
      </div> : null}
      {editing ? createPortal(<ModalShell title={t(editing.fieldId ? 'vault.entries.signInMethod.edit' : 'vault.entries.signInMethod.add')}
        ariaLabel={t('vault.entries.signInMethod.title')} onClose={close} trapFocus width={560}
        footer={<DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={close}>{t('common.cancel')}</Button>
          <Button variant="accent" size="sm" className="flex-[2]" disabled={disabled} onClick={save}>{t('vault.entries.signInMethod.save')}</Button>
        </DialogFooter>}>
        <AnimatedEditorBody>
          <p className="text-meta text-[var(--cv-t3)]">{t('vault.entries.signInMethod.editorHint')}</p>
          <RecognizedBinding binding={editing.binding} entryId={entryId} disabled={disabled}
            onChange={(binding) => setEditing({ ...editing, binding })} />
          {agentVisibility ? <div className="flex items-center justify-between gap-3">
            <div className="min-w-0"><span className="text-ui text-[var(--cv-t2)]">{t('vault.entries.signInMethod.agentVisible')}</span><p className="mt-1 text-meta text-[var(--cv-t3)]">{t('vault.entries.signInMethod.visibilityHint')}</p></div>
            <ToggleSwitch label={t('vault.entries.signInMethod.agentVisible')} checked={editing.visible}
              onChange={(visible) => setEditing({ ...editing, visible })} disabled={disabled || agentVisibility.disabled} />
          </div> : null}
          {editing.fieldId ? <Button variant="ghost" size="sm" icon="delete" disabled={disabled}
            onClick={() => { onChange(updateSignInMethod(fields, editing.fieldId, null, '')); close() }}>
            {t('vault.entries.signInMethod.remove')}
          </Button> : null}
        </AnimatedEditorBody>
      </ModalShell>, document.body) : null}
    </section>
  )
}

const LINK_SEPARATOR = '/'

function RecognizedBinding({
  binding,
  onChange,
  disabled,
  entryId,
}: {
  binding: SignInBinding
  onChange: (next: SignInBinding) => void
  disabled?: boolean
  entryId?: string
}) {
  const { t } = useTranslation()
  const { candidates } = useSignInAccountCandidates(binding.provider, entryId)
  const linkedLabel = useSignInEntryLabel(binding.entry)
  const [accountDraft, setAccountDraft] = useState(binding.account ?? '')
  // Keep the user's raw typing (e.g. a trailing space) while it still maps to the
  // stored canonical account; an external reset (Discard) shows the stored value.
  const accountShown = normalizeSignInAccount(accountDraft) === binding.account
    ? accountDraft
    : binding.account ?? ''
  const linkValue = binding.entry ? `${binding.entry.vaultId}${LINK_SEPARATOR}${binding.entry.entryId}` : ''
  const linkedIsCandidate = candidates.some((candidate) =>
    candidate.vaultId === binding.entry?.vaultId && candidate.entryId === binding.entry?.entryId)

  // A typed account is not a verified Palladin Credential, so it drops the link.
  const changeAccount = (raw: string) => {
    if (raw.normalize('NFC').trim().length > SIGN_IN_ACCOUNT_MAX_LENGTH) return
    setAccountDraft(raw)
    onChange({ provider: binding.provider, account: normalizeSignInAccount(raw), entry: null })
  }

  const changeLink = (value: string) => {
    const candidate = candidates.find((item) => `${item.vaultId}${LINK_SEPARATOR}${item.entryId}` === value)
    if (!candidate) {
      onChange({ provider: binding.provider, account: binding.account, entry: null })
      return
    }
    setAccountDraft(candidate.username)
    onChange({
      provider: binding.provider,
      account: normalizeSignInAccount(candidate.username),
      entry: { vaultId: candidate.vaultId, entryId: candidate.entryId },
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <ProviderChoices id="entry-sign-in-provider" value={binding.provider} disabled={disabled}
        onChange={(provider) => onChange({ provider, account: binding.account, entry: null })} />
      <div role="group" aria-label={t('vault.entries.signInMethod.palladinAccount')} className="flex flex-col gap-2">
        <span className="text-meta text-[var(--cv-label-text)]">{t('vault.entries.signInMethod.providerAccountTitle', { provider: t(`vault.entries.signInMethod.providers.${binding.provider}`) })}</span>
        {binding.entry && !linkedIsCandidate ? <button type="button" disabled aria-pressed className={accountChoiceClasses}>
          <img src={`/sign-in-providers/${binding.provider}.svg`} alt="" className={`h-6 w-6 shrink-0 object-contain ${binding.provider === 'apple' || binding.provider === 'github' ? 'brightness-0 dark:invert' : ''}`} />
          <span className="min-w-0 flex-1 text-left"><span className="block truncate font-medium">{linkedLabel ?? t('vault.entries.signInMethod.linkedEntryUnavailable')}</span><span className="block truncate text-meta text-[var(--cv-t3)]">{binding.account ?? t('vault.entries.signInMethod.accountNotSpecified')}</span></span>
        </button> : null}
        {candidates.map((candidate) => {
          const value = `${candidate.vaultId}${LINK_SEPARATOR}${candidate.entryId}`
          return <button key={value} type="button" disabled={disabled} aria-pressed={linkValue === value}
            className={accountChoiceClasses} onClick={() => changeLink(value)}>
            <img src={`/sign-in-providers/${binding.provider}.svg`} alt="" className={`h-6 w-6 shrink-0 object-contain ${binding.provider === 'apple' || binding.provider === 'github' ? 'brightness-0 dark:invert' : ''}`} />
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate font-medium">{candidate.label}</span>
              <span className="block truncate text-meta text-[var(--cv-t3)]">{candidate.username}</span>
            </span>
            {linkValue === value ? <Icon name="check" size={16} /> : null}
          </button>
        })}
        <button type="button" disabled={disabled} aria-pressed={!binding.entry}
          className={accountChoiceClasses} onClick={() => changeLink('')}>
          <Icon name="key" size={18} />
          <span className="min-w-0 flex-1 text-left">{t('vault.entries.signInMethod.manualAccount')}</span>
          {!binding.entry ? <Icon name="check" size={16} /> : null}
        </button>
      </div>
      {!binding.entry ? <FormInput id="entry-sign-in-account" label={t('vault.entries.signInMethod.account')}
        value={accountShown} onChange={(e) => changeAccount(e.target.value)}
        placeholder={t('vault.entries.signInMethod.accountPlaceholder')} maxLength={SIGN_IN_ACCOUNT_MAX_LENGTH}
        autoComplete="off" data-1p-ignore data-lpignore="true" disabled={disabled} /> : null}

    </div>
  )
}

function ProviderChoices({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: SignInProvider
  onChange: (provider: SignInProvider) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const rail = useRef<HTMLDivElement>(null)
  const scroll = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * 0.75, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-meta text-[var(--cv-label-text)]">{t('vault.entries.signInMethod.provider')}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon="chevron_left" aria-label={t('vault.entries.signInMethod.previousProviders')} disabled={disabled} onClick={() => scroll(-1)} />
          <Button variant="ghost" size="sm" icon="chevron_right" aria-label={t('vault.entries.signInMethod.nextProviders')} disabled={disabled} onClick={() => scroll(1)} />
        </div>
      </div>
      <div ref={rail} id={id} role="group" aria-label={t('vault.entries.signInMethod.provider')}
        className="subtle-scrollbar flex gap-2 overflow-x-auto p-1 pb-2">
        {PROVIDER_DISPLAY_ORDER.map((provider) => <button key={provider} type="button" disabled={disabled}
          aria-pressed={value === provider} onClick={() => { if (value !== provider) onChange(provider) }}
          className={`${HOVERABLE_CARD_CLASSES} flex w-28 shrink-0 flex-col items-center gap-2 rounded-lg border border-[var(--cv-input-border)] p-3 text-action text-[var(--cv-t1)] aria-pressed:border-[var(--cv-t1)] focus-visible:outline-2 focus-visible:outline-[var(--cv-primary)] disabled:opacity-50`}>
          <img src={`/sign-in-providers/${provider}.svg`} alt="" className={`h-6 w-6 object-contain ${provider === 'apple' || provider === 'github' ? 'brightness-0 dark:invert' : ''}`} />
          {t(`vault.entries.signInMethod.providers.${provider}`)}
        </button>)}
      </div>
      {env.contactEmail ? <a className="mb-2 inline-block text-meta text-[var(--cv-primary)] underline underline-offset-2"
        href={`mailto:${env.contactEmail}?subject=${encodeURIComponent(t('vault.entries.signInMethod.missingProviderSubject'))}`}>
        {t('vault.entries.signInMethod.missingProvider')}
      </a> : null}
    </div>
  )
}

const accountChoiceClasses = `${HOVERABLE_CARD_CLASSES} flex w-full min-w-0 items-center gap-3 rounded-lg border border-[var(--cv-input-border)] p-3 text-ui text-[var(--cv-t1)] aria-pressed:border-[var(--cv-t1)] focus-visible:outline-2 focus-visible:outline-[var(--cv-primary)] disabled:opacity-50`

// Measure the whole editor so async candidates and manual-account changes move
// the centered dialog smoothly without replacing controls or interrupting focus.
function AnimatedEditorBody({ children }: { children: ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useLayoutEffect(() => {
    const element = content.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setHeight(element.getBoundingClientRect().height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return <div className="transition-[height] duration-200 ease-out motion-reduce:transition-none" style={{ height }}>
    <div ref={content} className="ph-no-capture flex flex-col gap-3">{children}</div>
  </div>
}
