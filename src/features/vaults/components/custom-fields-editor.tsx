import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FieldFeedback, FormInput } from '../../../shared/components/form-field'
import { Icon } from '../../../shared/components/icon'
import { SecretInput } from '../../../shared/components/secret-input'
import {
  type CustomField,
  type CustomFieldType,
  type TotpParams,
  isKnownFieldType,
} from '../types'
import { blankField, validateCustomFields, type CustomFieldError } from '../entry-blob'
import { TotpSetup } from './totp-setup'

export interface CustomFieldsEditorProps {
  fields: CustomField[]
  onChange: (next: CustomField[]) => void
  disabled?: boolean
  /** Render copy buttons on value inputs (used in the edit-detail surface). */
  copyable?: boolean
}

const FIELD_TYPE_META: Record<CustomFieldType, { icon: string; labelKey: string }> = {
  text: { icon: 'text_fields', labelKey: 'vault.entries.customFields.typeText' },
  concealed: { icon: 'password', labelKey: 'vault.entries.customFields.typeConcealed' },
  totp: { icon: 'lock_clock', labelKey: 'vault.entries.customFields.typeTotp' },
}

/**
 * "Additional fields" — a compact, add-on-demand list of user-defined fields
 * shared by the create-entry modal and the entry-detail edit panel. Field type
 * is chosen at add time from a small menu (Text / Hidden / TOTP) and can be
 * changed per row; rows are single-line (text/hidden) and reorderable with
 * arrows. Ids are stable across edits and reorder (the agent CLI addresses
 * fields by id). Trimming/dropping empty rows happens at fold time; this editor
 * only surfaces the validation the parent gates save on (required label when a
 * value is present, unique labels).
 */
export function CustomFieldsEditor({
  fields,
  onChange,
  disabled,
  copyable,
}: CustomFieldsEditorProps) {
  const { t } = useTranslation()
  const { errors } = validateCustomFields(fields)

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

  const add = (type: CustomFieldType) => onChange([...fields, blankField(type)])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold text-[var(--cv-label-text)]">
          {t('vault.entries.customFields.title')}
        </h3>
        <FieldTypeMenu
          trigger={
            <span className="inline-flex items-center gap-1">
              <Icon name="add" size={14} />
              {t('vault.entries.customFields.add')}
            </span>
          }
          disabled={disabled}
          onPick={add}
        />
      </div>

      {fields.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {fields.map((field, index) => (
            <FieldRow
              key={field.id}
              field={field}
              error={errors[field.id]}
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
      ) : null}
    </section>
  )
}

interface FieldRowProps {
  field: CustomField
  error?: CustomFieldError
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
  error,
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
  const rowType = isKnownFieldType(field.type) ? field.type : 'text'

  const changeType = (nextType: CustomFieldType) => {
    if (nextType === field.type) return
    // Reset value to the new type's empty shape; keep the stable id + label.
    onChange({ type: nextType, value: blankField(nextType).value })
  }

  const valueInput =
    rowType === 'concealed' ? (
      <SecretInput
        id={`field-value-${field.id}`}
        label={t('vault.entries.customFields.valueLabel')}
        labelClassName="sr-only"
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
        labelClassName="sr-only"
        value={typeof field.value === 'string' ? field.value : ''}
        onChange={(e) => onChange({ value: e.target.value })}
        placeholder={t('vault.entries.customFields.valuePlaceholder')}
        autoComplete="off"
        disabled={disabled}
        copyable={copyable}
        copyLabel={t('common.copy')}
      />
    )

  return (
    <div className="rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-empty-bg)] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <FieldTypeMenu
          trigger={<Icon name={FIELD_TYPE_META[rowType].icon} size={16} />}
          ariaLabel={t('vault.entries.customFields.typeLabel')}
          current={rowType}
          disabled={disabled}
          onPick={changeType}
        />
        <div className="w-32 shrink-0">
          <FormInput
            id={`field-label-${field.id}`}
            label={t('vault.entries.customFields.labelLabel')}
            labelClassName="sr-only"
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder={t('vault.entries.customFields.labelPlaceholder')}
            autoComplete="off"
            disabled={disabled}
            maxLength={80}
            error={error === 'label-required'}
          />
        </div>
        {rowType !== 'totp' ? (
          <div className="min-w-0 flex-1">{valueInput}</div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex shrink-0 items-center">
          <RowIconButton icon="keyboard_arrow_up" label={t('common.moveUp')} onClick={onMoveUp} disabled={disabled || !canMoveUp} />
          <RowIconButton icon="keyboard_arrow_down" label={t('common.moveDown')} onClick={onMoveDown} disabled={disabled || !canMoveDown} />
          <RowIconButton icon="delete" label={t('common.remove')} onClick={onRemove} disabled={disabled} />
        </div>
      </div>

      {rowType === 'totp' ? (
        <div className="mt-1.5">
          <TotpSetup
            value={field.value as TotpParams}
            onChange={(params) => onChange({ value: params })}
            disabled={disabled}
          />
        </div>
      ) : null}

      <FieldFeedback visible={!!error} color="red">
        {error === 'duplicate-label'
          ? t('vault.entries.customFields.duplicateLabel')
          : t('vault.entries.customFields.labelRequired')}
      </FieldFeedback>
    </div>
  )
}

interface FieldTypeMenuProps {
  trigger: React.ReactNode
  ariaLabel?: string
  current?: CustomFieldType
  disabled?: boolean
  onPick: (type: CustomFieldType) => void
}

/** Small popover menu of field types — used for "+ Add field" and per-row type change. */
function FieldTypeMenu({ trigger, ariaLabel, current, disabled, onPick }: FieldTypeMenuProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center justify-center gap-1 rounded-md px-1.5
          text-[11px] font-semibold text-[var(--cv-t2)] transition-colors
          hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        {trigger}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border
            border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1 shadow-xl"
        >
          {(Object.keys(FIELD_TYPE_META) as CustomFieldType[]).map((type) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(type)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px]
                text-[var(--cv-t1)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]"
            >
              <Icon name={FIELD_TYPE_META[type].icon} size={15} className="text-[var(--cv-t3)]" />
              <span className="flex-1">{t(FIELD_TYPE_META[type].labelKey)}</span>
              {current === type ? <Icon name="check" size={14} className="text-[var(--cv-primary)]" /> : null}
            </button>
          ))}
        </div>
      ) : null}
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
