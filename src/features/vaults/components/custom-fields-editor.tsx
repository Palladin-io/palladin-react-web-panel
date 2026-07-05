import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import {
  type CustomField,
  type CustomFieldType,
  type TotpParams,
  isKnownFieldType,
} from '../types'
import { blankField } from '../entry-blob'
import { TotpSetup } from './totp-setup'

export interface CustomFieldsEditorProps {
  fields: CustomField[]
  onChange: (next: CustomField[]) => void
  disabled?: boolean
  /** Render copy buttons on value inputs (used in the edit-detail surface). */
  copyable?: boolean
}

/**
 * Editable list of custom fields — shared by the create-entry modal and the
 * entry-detail edit panel. Each row carries a label, a type (text / concealed /
 * totp), and a type-appropriate value editor. Rows can be reordered and removed;
 * order here is the persisted display order. Trimming/dropping empty rows happens
 * at fold time (`foldCustomFields`), not here, so a half-typed row isn't lost.
 */
export function CustomFieldsEditor({
  fields,
  onChange,
  disabled,
  copyable,
}: CustomFieldsEditorProps) {
  const { t } = useTranslation()

  const update = (id: string, patch: Partial<CustomField>) =>
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const remove = (id: string) => onChange(fields.filter((f) => f.id !== id))

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  const add = () => onChange([...fields, blankField('text')])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-[var(--cv-label-text)]">
          {t('vault.entries.customFields.title')}
        </h3>
        <Button variant="ghost" size="sm" icon="add" onClick={add} disabled={disabled}>
          {t('vault.entries.customFields.add')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-[11px] text-[var(--cv-t3)]">
          {t('vault.entries.customFields.empty')}
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              disabled={disabled}
              copyable={copyable}
              canMoveUp={index > 0}
              canMoveDown={index < fields.length - 1}
              onChange={(patch) => update(field.id, patch)}
              onRemove={() => remove(field.id)}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

interface FieldRowProps {
  field: CustomField
  disabled?: boolean
  copyable?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onChange: (patch: Partial<CustomField>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function FieldRow({
  field,
  disabled,
  copyable,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FieldRowProps) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)

  const changeType = (nextType: CustomFieldType) => {
    if (nextType === field.type) return
    // Reset the value to the new type's empty shape so we never carry a string
    // into a totp slot (or a TotpParams into a text slot).
    onChange({ type: nextType, value: blankField(nextType).value })
  }

  const rowType = isKnownFieldType(field.type) ? field.type : 'text'

  return (
    <div className="rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-empty-bg)] p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <FormInput
            id={`field-label-${field.id}`}
            label={t('vault.entries.customFields.labelLabel')}
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={t('vault.entries.customFields.labelPlaceholder')}
            autoComplete="off"
            disabled={disabled}
            maxLength={80}
          />
        </div>
        <div className="w-32 shrink-0">
          <FormSelect
            id={`field-type-${field.id}`}
            label={t('vault.entries.customFields.typeLabel')}
            value={rowType}
            onChange={(e) => changeType(e.target.value as CustomFieldType)}
            disabled={disabled}
          >
            <option value="text">{t('vault.entries.customFields.typeText')}</option>
            <option value="concealed">{t('vault.entries.customFields.typeConcealed')}</option>
            <option value="totp">{t('vault.entries.customFields.typeTotp')}</option>
          </FormSelect>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-0.5 pt-[18px]">
          <RowIconButton icon="keyboard_arrow_up" label={t('common.moveUp')} onClick={onMoveUp} disabled={disabled || !canMoveUp} />
          <RowIconButton icon="keyboard_arrow_down" label={t('common.moveDown')} onClick={onMoveDown} disabled={disabled || !canMoveDown} />
        </div>
        <div className="shrink-0 pt-[18px]">
          <RowIconButton icon="delete" label={t('common.remove')} onClick={onRemove} disabled={disabled} />
        </div>
      </div>

      <div className="mt-2">
        {rowType === 'totp' ? (
          <TotpSetup
            value={field.value as TotpParams}
            onChange={(params) => onChange({ value: params })}
            disabled={disabled}
          />
        ) : rowType === 'concealed' ? (
          <SecretInput
            id={`field-value-${field.id}`}
            label={t('vault.entries.customFields.valueLabel')}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(next) => onChange({ value: next })}
            shown={shown}
            onToggleShown={() => setShown((v) => !v)}
            placeholder={t('vault.entries.customFields.valuePlaceholder')}
            disabled={disabled}
            monospace
            copyable={copyable}
            copyLabel={t('common.copy')}
          />
        ) : (
          <FormInput
            id={`field-value-${field.id}`}
            label={t('vault.entries.customFields.valueLabel')}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={t('vault.entries.customFields.valuePlaceholder')}
            autoComplete="off"
            disabled={disabled}
            copyable={copyable}
            copyLabel={t('common.copy')}
          />
        )}
      </div>
    </div>
  )
}

function RowIconButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded
        text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
        hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={16} />
    </button>
  )
}
