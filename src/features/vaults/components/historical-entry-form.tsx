import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import type { MemberSecretView } from '../../../shared/crypto/entry-draft'
import { shortenKey } from '../../../shared/lib/shorten-key'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
} from '../types'
import { readCustomFields } from '../entry-blob'
import { CustomFieldsView } from './custom-fields-view'
import { compareEntryVersionToPrevious, type HistoricalEntryField } from './entry-history-diff'
import { EntryIcon } from './entry-icon'
import { OtpauthTotp } from './totp-display'
import { ScriptEditor } from './script-editor'
import { SectionHeader } from './section-header'

export interface HistoricalEntryFormProps {
  revision: string
  secret: MemberSecretView
  previousSecret?: MemberSecretView
}

const CHANGE_BORDER_CLASS =
  'border-2 border-[var(--cv-change)] bg-[rgb(var(--cv-change-rgb)/0.08)] focus:border-[var(--cv-change)]'

const NO_CHANGES = {
  fields: new Set<HistoricalEntryField>(),
  customFieldIds: new Set<string>(),
  hasChanges: false,
}

export function HistoricalEntryForm({ revision, secret, previousSecret }: HistoricalEntryFormProps) {
  const { t } = useTranslation()
  const [cvvShown, setCvvShown] = useState(false)
  const [mainSecretShown, setMainSecretShown] = useState(false)
  const content = secret.content
  const inputId = (field: string) => `entry-history-${revision}-${field}`
  const customFields = readCustomFields(content)
  const diff = previousSecret ? compareEntryVersionToPrevious(secret, previousSecret) : NO_CHANGES
  const changeDescriptionId = inputId('change-description')
  const changedInputProps = (field: HistoricalEntryField) => {
    const changed = diff.fields.has(field)
    return {
      borderClass: changed ? CHANGE_BORDER_CLASS : undefined,
      'aria-describedby': changed ? changeDescriptionId : undefined,
      'data-history-changed': changed || undefined,
    }
  }
  const changedSurfaceProps = (field: HistoricalEntryField) => {
    const changed = diff.fields.has(field)
    return {
      role: changed ? 'group' as const : undefined,
      'aria-describedby': changed ? changeDescriptionId : undefined,
      'data-history-changed': changed || undefined,
    }
  }
  const changedSurfaceClass = (field: HistoricalEntryField) => diff.fields.has(field)
    ? 'rounded-xl border-2 border-[var(--cv-change)] bg-[rgb(var(--cv-change-rgb)/0.08)]'
    : ''

  return (
    <div className="ph-no-capture flex flex-col gap-3" data-testid="historical-entry-form">
      {diff.hasChanges ? (
        <div
          id={changeDescriptionId}
          className="flex items-center gap-2 rounded-lg bg-[rgb(var(--cv-change-rgb)/0.1)] px-3 py-2
            text-meta font-medium text-[var(--cv-change)]"
        >
          <Icon name="difference" size={15} className="shrink-0" />
          <span>{t('vault.entry.history.changedInRevision')}</span>
        </div>
      ) : null}
      <div>
        <label
          htmlFor={inputId('label')}
          className="mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]"
        >
          {t('vault.entries.labelLabel')}
        </label>
        <div className="flex gap-2">
          <EntryIcon
            icon={secret.iconReference}
            color={secret.color}
            type={secret.entryType}
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-[0.625rem] border ${
              diff.fields.has('icon')
                ? 'border-2 border-[var(--cv-change)] bg-[rgb(var(--cv-change-rgb)/0.08)]'
                : 'border-[var(--cv-input-border)]'
            }`}
          />
          <div className="min-w-0 flex-1">
            <FormInput
              id={inputId('label')}
              label={t('vault.entries.labelLabel')}
              labelClassName="sr-only"
              value={secret.memberLabel}
              readOnly
              {...changedInputProps('memberLabel')}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormInput
          id={inputId('type')}
          label={t('vault.entries.typeLabel')}
          value={t(`vault.entry.history.type.${secret.entryType}`)}
          readOnly
          {...changedInputProps('entryType')}
        />
        <FormInput
          id={inputId('agent-label')}
          label={t('vault.entries.visibility.agentLabel')}
          value={secret.agentLabel}
          readOnly
          {...changedInputProps('agentLabel')}
        />
      </div>

      <FormInput
        id={inputId('description')}
        label={t('vault.entries.descriptionLabel')}
        value={secret.description ?? ''}
        readOnly
        {...changedInputProps('description')}
      />

      {(content.type === ENTRY_TYPE_KEY || content.type === ENTRY_TYPE_CREDENTIAL) ? (
        <FormInput
          id={inputId('url')}
          label={t('vault.entries.urlLabel')}
          value={content.url ?? ''}
          readOnly
          {...changedInputProps('url')}
        />
      ) : null}

      {content.type === ENTRY_TYPE_KEY ? (
        <SecretInput
          id={inputId('value')}
          label={t('vault.entries.valueLabel')}
          value={content.value}
          onChange={() => undefined}
          shown={mainSecretShown}
          onToggleShown={() => setMainSecretShown((shown) => !shown)}
          readOnly
          monospace
          copyable
          copyLabel={t('vault.entry.copyKey')}
          {...changedInputProps('value')}
        />
      ) : null}

      {content.type === ENTRY_TYPE_CREDENTIAL ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormInput
              id={inputId('username')}
              label={t('vault.entries.usernameLabel')}
              value={content.username}
              readOnly
              copyable
              copyLabel={t('vault.entry.copyUsername')}
              {...changedInputProps('username')}
            />
            <SecretInput
              id={inputId('password')}
              label={t('vault.entries.passwordLabel')}
              value={content.password}
              onChange={() => undefined}
              shown={mainSecretShown}
              onToggleShown={() => setMainSecretShown((shown) => !shown)}
              readOnly
              monospace
              copyable
              copyLabel={t('vault.entry.copyPassword')}
              {...changedInputProps('password')}
            />
          </div>
          {content.totp ? (
            <div>
              <SectionHeader>{t('vault.entries.totp.section')}</SectionHeader>
              <div
                {...changedSurfaceProps('totp')}
                className={`mt-2 px-3 py-2.5 ${diff.fields.has('totp')
                  ? changedSurfaceClass('totp')
                  : 'rounded-xl border border-[var(--cv-input-border)]'}`}
              >
                <OtpauthTotp uri={content.totp} />
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {content.type === ENTRY_TYPE_SCRIPT ? (
        <>
          <FormInput
            id={inputId('interpreter')}
            label={t('vault.entries.script.interpreterLabel')}
            value={content.interpreter}
            readOnly
            {...changedInputProps('interpreter')}
          />
          <div>
            <label className="mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]">
              {t('vault.entries.script.bodyLabel')}
            </label>
            <div
              {...changedSurfaceProps('script')}
              className={changedSurfaceClass('script')}
            >
              <ScriptEditor
                value={content.script}
                onChange={() => undefined}
                interpreter={content.interpreter}
                disabled
              />
            </div>
          </div>
          {content.refs && content.refs.length > 0 ? (
            <div
              {...changedSurfaceProps('refs')}
              className={`flex flex-col gap-2 ${diff.fields.has('refs') ? 'p-2' : ''} ${
                changedSurfaceClass('refs')
              }`}
            >
              <SectionHeader>{t('vault.entries.script.refsTitle')}</SectionHeader>
              {content.refs.map((ref, index) => (
                <div
                  key={`${ref.env}-${ref.entryId}-${ref.field}-${index}`}
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
                >
                  <FormInput
                    id={inputId(`ref-${index}-env`)}
                    label={t('vault.entries.script.envLabel')}
                    value={ref.env}
                    readOnly
                    monospace
                  />
                  <FormInput
                    id={inputId(`ref-${index}-source`)}
                    label={t('vault.entries.script.sourceEntry')}
                    value={`${shortenKey(ref.entryId)} · ${ref.field}`}
                    readOnly
                    monospace
                  />
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {content.type === ENTRY_TYPE_CREDIT_CARD ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormInput
            id={inputId('cardholder')}
            label={t('vault.entries.card.cardholderName')}
            value={content.cardholderName}
            readOnly
            {...changedInputProps('cardholderName')}
          />
          <SecretInput
            id={inputId('card-number')}
            label={t('vault.entries.card.cardNumber')}
            value={content.cardNumber}
            onChange={() => undefined}
            shown={mainSecretShown}
            onToggleShown={() => setMainSecretShown((shown) => !shown)}
            readOnly
            monospace
            copyable
            {...changedInputProps('cardNumber')}
          />
          <div className="sm:col-span-2">
            <SecretInput id={inputId('cvv')} label={t('vault.entries.card.cvv')}
              value={content.cvv ?? ''} onChange={() => undefined}
              shown={cvvShown} onToggleShown={() => setCvvShown((shown) => !shown)}
              readOnly monospace copyable {...changedInputProps('cvv')} />
          </div>
          <FormInput
            id={inputId('expiry-month')}
            label={t('vault.entries.card.expiryMonth')}
            value={content.expiryMonth}
            readOnly
            {...changedInputProps('expiryMonth')}
          />
          <FormInput
            id={inputId('expiry-year')}
            label={t('vault.entries.card.expiryYear')}
            value={content.expiryYear}
            readOnly
            {...changedInputProps('expiryYear')}
          />
          <div className="sm:col-span-2">
            <FormInput
              id={inputId('billing-address')}
              label={t('vault.entries.card.billingAddress')}
              value={content.billingAddress ?? ''}
              readOnly
              {...changedInputProps('billingAddress')}
            />
          </div>
        </div>
      ) : null}

      {customFields.length > 0 ? (
        <CustomFieldsView
          fields={customFields}
          changedFieldIds={diff.customFieldIds}
          changeDescriptionId={changeDescriptionId}
        />
      ) : null}

      <FormTextarea
        id={inputId('notes')}
        label={t('vault.entries.notesLabel')}
        value={content.notes ?? ''}
        readOnly
        rows={2}
        {...changedInputProps('notes')}
      />
    </div>
  )
}
