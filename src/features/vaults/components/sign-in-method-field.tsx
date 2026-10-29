import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddButton } from '../../../shared/components/add-button'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import {
  SIGN_IN_ACCOUNT_MAX_LENGTH,
  SIGN_IN_PROVIDERS,
  type SignInBinding,
  type SignInProvider,
  normalizeSignInAccount,
  readSignInMethod,
  replaceSignInMethod,
} from '../sign-in-method'
import type { CustomField } from '../types'
import { useSignInAccountCandidates, useSignInEntryLabel } from '../use-sign-in-account-candidates'

export interface SignInMethodAgentVisibility {
  isVisible: (fieldId: string) => boolean
  onChange: (fieldId: string, visible: boolean) => void
  disabled?: boolean
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

/**
 * Dedicated Credential "Sign-in method" (`palladin.signin.v1`) editor. A single
 * recognized binding is edited through a provider select, an optional link to
 * the provider's own discoverable Palladin Credential and an optional account
 * input; unrecognized or ambiguous bindings are never decoded into the form
 * and stay untouched until the user explicitly replaces or removes them. Every
 * edit goes through {@link replaceSignInMethod}, so at most one binding remains.
 */
export function SignInMethodField({ fields, onChange, disabled, entryId, agentVisibility }: SignInMethodFieldProps) {
  const { t } = useTranslation()
  const state = readSignInMethod(fields)
  const [choosing, setChoosing] = useState(false)

  const apply = (binding: SignInBinding | null) =>
    onChange(replaceSignInMethod(fields, binding, t('vault.entries.signInMethod.title')))

  if (state.kind === 'recognized') {
    return (
      <div className="flex flex-col gap-3">
        <RecognizedBinding
          key={state.fieldId}
          binding={state.binding}
          onChange={apply}
          disabled={disabled}
          entryId={entryId}
        />
        {agentVisibility ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-ui text-[var(--cv-t2)]">{t('vault.entries.signInMethod.agentVisible')}</div>
              <div className="text-meta text-[var(--cv-t3)]">{t('vault.entries.signInMethod.agentVisibleHint')}</div>
            </div>
            <ToggleSwitch
              label={t('vault.entries.signInMethod.agentVisible')}
              checked={agentVisibility.isVisible(state.fieldId)}
              onChange={(visible) => agentVisibility.onChange(state.fieldId, visible)}
              disabled={disabled || agentVisibility.disabled}
            />
          </div>
        ) : null}
      </div>
    )
  }

  if (choosing) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--cv-input-border)] p-3">
        <ProviderSelect
          id="entry-sign-in-provider-new"
          value=""
          disabled={disabled}
          onChange={(provider) => {
            apply({ provider, account: null, entry: null })
            setChoosing(false)
          }}
        />
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => setChoosing(false)} disabled={disabled}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  if (state.kind === 'none') {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--cv-input-border)] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-ui text-[var(--cv-t1)]">{t('vault.entries.signInMethod.emptyTitle')}</div>
          <div className="text-meta text-[var(--cv-t3)]">{t('vault.entries.signInMethod.emptySubtitle')}</div>
        </div>
        <AddButton onClick={() => setChoosing(true)} disabled={disabled} label={t('vault.entries.signInMethod.add')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[var(--cv-input-border)] px-3 py-2.5">
      <p className="text-meta text-[var(--cv-t2)]">
        {t(state.kind === 'ambiguous'
          ? 'vault.entries.signInMethod.ambiguous'
          : 'vault.entries.signInMethod.unrecognized')}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" icon="delete" onClick={() => apply(null)} disabled={disabled}>
          {t('vault.entries.signInMethod.remove')}
        </Button>
        <Button variant="subtle" size="sm" icon="refresh" onClick={() => setChoosing(true)} disabled={disabled}>
          {t('vault.entries.signInMethod.replace')}
        </Button>
      </div>
    </div>
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
  onChange: (next: SignInBinding | null) => void
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
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" icon="delete" onClick={() => onChange(null)} disabled={disabled}>
          {t('vault.entries.signInMethod.remove')}
        </Button>
      </div>
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
