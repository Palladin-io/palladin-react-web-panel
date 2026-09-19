import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { FormSelect } from '../../../shared/components/form-select'
import { TypeFilterDropdown } from '../../../shared/components/type-filter-dropdown'
import { FeedbackSlot } from '../../../shared/components/form-field'
import type { GrantableField } from '../../../shared/crypto/grant-protocol'
import type { GrantFieldSelection } from '../../../shared/types/grant-field-selection'

export function GrantFieldSelectionFields({ fields, value, onChange, disabled = false }: {
  fields: GrantableField[]
  value: GrantFieldSelection
  onChange: (next: GrantFieldSelection) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const id = useId()
  return <fieldset disabled={disabled} className="min-w-0 space-y-2">
    <FormSelect id={id} label={t('grants.fields.title')} value={value.mode}
      onChange={(event) => onChange(event.target.value === 'all'
        ? { mode: 'all' } : { mode: 'selected', fieldIds: fields.map((field) => field.id) })}>
      <option value="all">{t('grants.fields.all')}</option>
      <option value="selected">{t('grants.fields.selected')}</option>
    </FormSelect>
    {value.mode === 'all'
      ? <p className="text-meta text-[var(--cv-t3)]">{t('grants.fields.future')}</p>
      : <>
        <TypeFilterDropdown options={fields.map((field) => ({ value: field.id, label: field.label }))}
          selected={new Set(value.fieldIds)} onChange={(next) => onChange({ mode: 'selected', fieldIds: [...next] })}
          placeholder={t('grants.fields.choose')} ariaLabel={t('grants.fields.choose')} triggerClassName="h-control" />
        <FeedbackSlot visible={value.fieldIds.length === 0} color="red">{t('grants.fields.required')}</FeedbackSlot>
      </>}
  </fieldset>
}
