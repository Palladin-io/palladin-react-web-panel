import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { SecretInput } from '../../../shared/components/secret-input'
import type { SubmissionCustomField } from '../../../shared/crypto/agent-submission-v2'

/** Every proposed attribute is visible in the review; secret values require reveal. */
export function SubmissionCustomFields({ fields }: { fields: readonly SubmissionCustomField[] }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const text = (id: string, label: string, value: string) => /[\r\n]/.test(value)
    ? <FormTextarea id={id} label={label} value={value} readOnly />
    : <FormInput id={id} label={label} value={value} readOnly />
  const secret = (id: string, label: string, value: string) => /[\r\n]/.test(value) ? <div className="flex flex-col items-end gap-2 ph-no-capture">
    <FormTextarea id={id} label={label} value={shown[id] ? value : '••••••••'} readOnly monospace autoComplete="off" />
    <Button size="sm" variant="subtle" onClick={() => setShown(current => ({ ...current, [id]: !current[id] }))}>
      {t(shown[id] ? 'vault.entry.hide' : 'vault.entry.reveal')}
    </Button>
  </div> : <SecretInput id={id} label={label} value={value}
    readOnly onChange={() => undefined} shown={Boolean(shown[id])} onToggleShown={() => setShown(current => ({ ...current, [id]: !current[id] }))} />
  return <>
    <p className="text-meta text-[var(--cv-t3)]">{t('submissions.review.customPolicy')}</p>
    {fields.map(field => <fieldset key={field.id} className="flex min-w-0 flex-col gap-3 border-t border-[var(--cv-divider)] pt-3">
      <legend className="whitespace-pre-wrap text-ui font-semibold text-[var(--cv-t2)]">{field.label ?? t('submissions.review.keepFieldLabel')}</legend>
      <p className="break-all text-micro text-[var(--cv-t3)]">{field.id}</p>
      <FormInput id={`${field.id}-type`} label={t('submissions.review.fieldType')} value={t(`submissions.review.fieldTypes.${field.type}`)} readOnly />
      {field.type === 'totp' ? <>
        {secret(`${field.id}-secret`, t('submissions.review.totpSecret'), field.value.secret)}
        <FormInput id={`${field.id}-algorithm`} label={t('submissions.review.algorithm')} value={field.value.algorithm} readOnly />
        <FormInput id={`${field.id}-digits`} label={t('submissions.review.digits')} value={String(field.value.digits)} readOnly />
        <FormInput id={`${field.id}-period`} label={t('submissions.review.period')} value={String(field.value.period)} readOnly />
        {text(`${field.id}-issuer`, t('submissions.review.issuer'), field.value.issuer ?? '')}
        {text(`${field.id}-account`, t('submissions.review.account'), field.value.account ?? '')}
      </> : field.type === 'concealed' ? secret(`${field.id}-value`, t('submissions.review.value'), field.value)
        : field.type === 'multiline' ? <FormTextarea id={`${field.id}-value`} label={t('submissions.review.value')} value={field.value} readOnly />
          : text(`${field.id}-value`, t('submissions.review.value'), field.value)}
    </fieldset>)}
  </>
}
