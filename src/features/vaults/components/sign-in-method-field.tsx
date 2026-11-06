import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { SectionHeader } from './section-header'
import { useTranslation } from 'react-i18next'
import { AddButton } from '../../../shared/components/add-button'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Tooltip } from '../../../shared/components/tooltip'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import {
  SIGN_IN_ACCOUNT_MAX_LENGTH,
  SIGN_IN_PROVIDERS,
  type SignInBinding,
  type SignInProvider,
  normalizeSignInAccount,
  readSignInMethods,
  updateSignInMethod,
} from '../sign-in-method'
import type { CustomField } from '../types'
import { useSignInAccountCandidates, useSignInEntryLabel } from '../use-sign-in-account-candidates'

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
  const [editing, setEditing] = useState<{ fieldId: string | null; binding: SignInBinding | null; visible: boolean } | null>(null)
  const close = () => setEditing(null)
  const save = () => {
    if (!editing?.binding) return
    const next = updateSignInMethod(fields, editing.fieldId, editing.binding, t('vault.entries.signInMethod.title'))
    onChange(next)
    const id = editing.fieldId ?? next[next.length - 1].id
    // Preserve existing policy unless the owner explicitly changed its switch.
    if (agentVisibility && (editing.fieldId === null || editing.visible !== agentVisibility.isVisible(id))) agentVisibility.onChange(id, editing.visible)
    close()
  }
  return (
    <section className="ph-no-capture flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><SectionHeader>{t('vault.entries.signInMethod.title')}</SectionHeader></div>
        <AddButton label={t('vault.entries.signInMethod.add')} disabled={disabled}
          onClick={() => setEditing({ fieldId: null, binding: null, visible: agentVisibility?.newMethodVisible ?? false })} />
      </div>
      {methods.length > 0 ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {methods.map((method) => <div key={method.fieldId}
          className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--cv-input-border)] p-3">
          <img src={`/sign-in-providers/${method.binding.provider}.svg`} alt="" className="h-6 w-6 shrink-0 object-contain" />
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
          <Button variant="accent" size="sm" className="flex-[2]" disabled={disabled || !editing.binding} onClick={save}>{t('vault.entries.signInMethod.save')}</Button>
        </DialogFooter>}>
        <div className="ph-no-capture flex flex-col gap-3">
          {editing.binding ? <RecognizedBinding binding={editing.binding} entryId={entryId} disabled={disabled}
            onChange={(binding) => setEditing({ ...editing, binding })} /> :
            <ProviderSelect id="entry-sign-in-provider-new" value="" disabled={disabled}
              onChange={(provider) => setEditing({ ...editing, binding: { provider, account: null, entry: null } })} />}
          {agentVisibility && editing.binding ? <div className="flex items-center justify-between gap-3">
            <span className="text-ui text-[var(--cv-t2)]">{t('vault.entries.signInMethod.agentVisible')}</span>
            <ToggleSwitch label={t('vault.entries.signInMethod.agentVisible')} checked={editing.visible}
              onChange={(visible) => setEditing({ ...editing, visible })} disabled={disabled || agentVisibility.disabled} />
          </div> : null}
          {editing.fieldId ? <Button variant="ghost" size="sm" icon="delete" disabled={disabled}
            onClick={() => { onChange(updateSignInMethod(fields, editing.fieldId, null, '')); close() }}>
            {t('vault.entries.signInMethod.remove')}
          </Button> : null}
        </div>
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
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="sm:w-44 sm:shrink-0">
          <ProviderSelect
            id="entry-sign-in-provider"
            value={binding.provider}
            disabled={disabled}
            onChange={(provider) => onChange({ provider, account: binding.account, entry: null })}
          />
        </div>
        <div className="min-w-0 flex-1">
          <FormInput
            id="entry-sign-in-account"
            label={t('vault.entries.signInMethod.account')}
            value={accountShown}
            onChange={(e) => changeAccount(e.target.value)}
            placeholder={t('vault.entries.signInMethod.accountPlaceholder')}
            maxLength={SIGN_IN_ACCOUNT_MAX_LENGTH}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            disabled={disabled}
          />
        </div>
      </div>
      {candidates.length > 0 || binding.entry ? (
        <FormSelect
          id="entry-sign-in-palladin-account"
          label={t('vault.entries.signInMethod.palladinAccount')}
          value={linkValue}
          disabled={disabled}
          onChange={(e) => changeLink(e.target.value)}
        >
          <option value="">{t('vault.entries.signInMethod.palladinAccountNone')}</option>
          {binding.entry && !linkedIsCandidate ? (
            <option value={linkValue} disabled>
              {linkedLabel ?? t('vault.entries.signInMethod.linkedEntryUnavailable')}
            </option>
          ) : null}
          {candidates.map((candidate) => (
            <option
              key={`${candidate.vaultId}${LINK_SEPARATOR}${candidate.entryId}`}
              value={`${candidate.vaultId}${LINK_SEPARATOR}${candidate.entryId}`}
            >
              {candidate.username
                ? t('vault.entries.signInMethod.palladinAccountOption', { label: candidate.label, username: candidate.username })
                : candidate.label}
            </option>
          ))}
        </FormSelect>
      ) : null}

    </div>
  )
}

function ProviderSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string
  value: SignInProvider | ''
  onChange: (provider: SignInProvider) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <FormSelect
      id={id}
      label={t('vault.entries.signInMethod.provider')}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        const provider = SIGN_IN_PROVIDERS.find((candidate) => candidate === e.target.value)
        if (provider) onChange(provider)
      }}
    >
      {value === '' ? (
        <option value="" disabled>{t('vault.entries.signInMethod.providerPlaceholder')}</option>
      ) : null}
      {SIGN_IN_PROVIDERS.map((provider) => (
        <option key={provider} value={provider}>
          {t(`vault.entries.signInMethod.providers.${provider}`)}
        </option>
      ))}
    </FormSelect>
  )
}
