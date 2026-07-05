import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Icon } from '../../../shared/components/icon'
import { copySecretToClipboard, copyToClipboard } from '../../../shared/lib/clipboard'
import {
  type CustomField,
  type CustomFieldType,
  type TotpParams,
  canBeAgentVisible,
  isKnownFieldType,
} from '../types'
import { blankField, validateCustomFields, type CustomFieldError } from '../entry-blob'
import { PopoverMenu, type MenuEntry } from './popover-menu'
import { TotpSetup } from './totp-setup'

export interface CustomFieldsEditorProps {
  fields: CustomField[]
  onChange: (next: CustomField[]) => void
  disabled?: boolean
  /** Show copy buttons on value rows (the edit-detail surface). */
  copyable?: boolean
}

const FIELD_TYPE_META: Record<CustomFieldType, { icon: string; labelKey: string; descKey: string }> = {
  text: { icon: 'text_fields', labelKey: 'vault.entries.customFields.typeText', descKey: 'vault.entries.customFields.typeTextDesc' },
  multiline: { icon: 'notes', labelKey: 'vault.entries.customFields.typeMultiline', descKey: 'vault.entries.customFields.typeMultilineDesc' },
  concealed: { icon: 'password', labelKey: 'vault.entries.customFields.typeConcealed', descKey: 'vault.entries.customFields.typeConcealedDesc' },
  totp: { icon: 'lock_clock', labelKey: 'vault.entries.customFields.typeTotp', descKey: 'vault.entries.customFields.typeTotpDesc' },
}

const TYPE_ORDER: CustomFieldType[] = ['text', 'multiline', 'concealed', 'totp']

/**
 * "Additional fields" — a grouped, bordered list shared by the create-entry
 * modal and the entry-detail edit panel (approved redesign). Each row is a
 * single line: drag grip, a type-icon menu (Text / Multiline / Hidden / TOTP),
 * an inline label, a type-appropriate value, and a right action cluster
 * (agent-visible marker, copy, ⋯ menu). The "+ Add field" ghost row opens the
 * type menu. Ids are stable across edits/reorder (the agent CLI addresses fields
 * by id); trimming/dropping empty rows happens at fold time. Validation
 * (required label when valued, unique labels) is surfaced inline and gated by
 * the parent on save.
 */
export function CustomFieldsEditor({ fields, onChange, disabled, copyable }: CustomFieldsEditorProps) {
  const { t } = useTranslation()
  const { errors } = validateCustomFields(fields)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

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

  // Live-reorder while dragging — the list previews its final order before drop.
  const dragOver = (index: number) => {
    if (dragIndex === null || dragIndex === index) return
    const next = [...fields]
    const [dragged] = next.splice(dragIndex, 1)
    next.splice(index, 0, dragged)
    setDragIndex(index)
    onChange(next)
  }

  const addItems: MenuEntry[] = TYPE_ORDER.map((type) => ({
    icon: FIELD_TYPE_META[type].icon,
    label: t(FIELD_TYPE_META[type].labelKey),
    hint: t(FIELD_TYPE_META[type].descKey),
    onSelect: () => add(type),
  }))

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      {fields.map((field, index) => (
        <FieldRow
          key={field.id}
          field={field}
          error={errors[field.id]}
          disabled={disabled}
          copyable={copyable}
          first={index === 0}
          canMoveUp={index > 0}
          canMoveDown={index < fields.length - 1}
          dragging={dragIndex === index}
          onDragStart={() => setDragIndex(index)}
          onDragOver={() => dragOver(index)}
          onDragEnd={() => setDragIndex(null)}
          onChange={(patch) => update(field.id, patch)}
          onRemove={() => remove(field.id)}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
        />
      ))}
      <PopoverMenu
        trigger={
          <span className="inline-flex items-center gap-2">
            <Icon name="add" size={14} />
            {t('vault.entries.customFields.add')}
          </span>
        }
        items={addItems}
        ariaLabel={t('vault.entries.customFields.add')}
        disabled={disabled}
        alignLeft
        openUp
        triggerClassName={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px]
          text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          ${fields.length > 0 ? 'border-t border-[var(--cv-divider)]' : ''}
          disabled:cursor-not-allowed disabled:opacity-40`}
      />
    </div>
  )
}

interface FieldRowProps {
  field: CustomField
  error?: CustomFieldError
  disabled?: boolean
  copyable?: boolean
  first: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  dragging: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
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
  first,
  canMoveUp,
  canMoveDown,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: FieldRowProps) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const rowType = isKnownFieldType(field.type) ? field.type : 'text'
  const stringValue = typeof field.value === 'string' ? field.value : ''
  const agentVisible = !!field.agentVisible && canBeAgentVisible(rowType)

  const changeType = (nextType: CustomFieldType) => {
    if (nextType === rowType) return
    // Reset value to the new type's empty shape; keep the stable id + label.
    // agentVisible is only valid for text-ish types — drop it otherwise.
    const patch: Partial<CustomField> = { type: nextType, value: blankField(nextType).value }
    if (!canBeAgentVisible(nextType)) patch.agentVisible = undefined
    onChange(patch)
  }

  const copy = async (secret: boolean) => {
    const ok = await (secret ? copySecretToClipboard(stringValue) : copyToClipboard(stringValue))
    toast[ok ? 'success' : 'error'](
      ok
        ? t('vault.entries.copied', { label: field.label || t('vault.entries.customFields.title') })
        : t('vault.entries.copyFailed'),
    )
  }

  const typeMenuItems: MenuEntry[] = TYPE_ORDER.map((type) => ({
    icon: FIELD_TYPE_META[type].icon,
    label: t(FIELD_TYPE_META[type].labelKey),
    hint: type === rowType ? '✓' : undefined,
    hintColor: 'var(--cv-primary)',
    onSelect: () => changeType(type),
  }))

  const dotsItems: MenuEntry[] = [
    ...(canBeAgentVisible(rowType)
      ? ([
          {
            icon: 'smart_toy',
            label: t('vault.entries.customFields.visibleToAgents'),
            hint: agentVisible ? t('common.on') : t('common.off'),
            hintColor: agentVisible ? 'var(--cv-info)' : undefined,
            onSelect: () => onChange({ agentVisible: agentVisible ? undefined : true }),
          },
        ] as MenuEntry[])
      : []),
    { icon: 'keyboard_arrow_up', label: t('common.moveUp'), disabled: !canMoveUp, onSelect: onMoveUp },
    { icon: 'keyboard_arrow_down', label: t('common.moveDown'), disabled: !canMoveDown, onSelect: onMoveDown },
    'separator',
    { icon: 'delete', label: t('common.remove'), danger: true, onSelect: onRemove },
  ]

  // Multiline + TOTP get a stacked layout: label row on top, the value below at
  // full row width — an inline value column is too cramped for either.
  const stacked = rowType === 'multiline' || rowType === 'totp'

  return (
    <div
      className={`${first ? '' : 'border-t border-[var(--cv-divider)]'} ${dragging ? 'opacity-50' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver()
      }}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <span
          draggable={!disabled}
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            onDragStart()
          }}
          onDragEnd={onDragEnd}
          className="flex cursor-grab text-[var(--cv-icon-muted)] opacity-60 active:cursor-grabbing"
          aria-label={t('vault.entries.customFields.dragToReorder')}
          role="button"
        >
          <Icon name="drag_indicator" size={14} />
        </span>

        <PopoverMenu
          trigger={<Icon name={FIELD_TYPE_META[rowType].icon} size={14} />}
          items={typeMenuItems}
          ariaLabel={t('vault.entries.customFields.typeLabel')}
          disabled={disabled}
          alignLeft
          triggerClassName="mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md
            bg-[var(--cv-bg-subtle)] text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)]
            disabled:cursor-not-allowed disabled:opacity-40"
        />

        <input
          aria-label={t('vault.entries.customFields.labelLabel')}
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder={t('vault.entries.customFields.labelPlaceholder')}
          disabled={disabled}
          maxLength={80}
          className={`mt-px border-0 bg-transparent p-0 text-[12px] outline-none
            placeholder:text-[11px] placeholder:text-[var(--cv-input-placeholder)]
            ${stacked ? 'min-w-0 flex-1' : 'w-[126px] shrink-0'}
            ${error ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-t2)]'}`}
        />

        {!stacked ? (
          <div className="flex min-w-0 flex-1 items-start">
            <FieldValue
              type={rowType}
              value={field.value}
              stringValue={stringValue}
              shown={shown}
              disabled={disabled}
              onChangeString={(v) => onChange({ value: v })}
              onChangeTotp={(v) => onChange({ value: v })}
            />
          </div>
        ) : null}

        <div className="flex shrink-0 items-center gap-0.5">
          {agentVisible ? <AgentVisibleBadge /> : null}
          {rowType === 'concealed' ? (
            <RowIconButton
              icon={shown ? 'visibility_off' : 'visibility'}
              label={shown ? t('vault.entry.hide') : t('vault.entry.reveal')}
              onClick={() => setShown((v) => !v)}
              disabled={disabled}
            />
          ) : null}
          {copyable && rowType !== 'totp' && stringValue ? (
            <RowIconButton
              icon="content_copy"
              label={t('common.copy')}
              onClick={() => void copy(rowType === 'concealed')}
              disabled={disabled}
            />
          ) : null}
          <PopoverMenu
            trigger={<Icon name="more_horiz" size={16} />}
            items={dotsItems}
            ariaLabel={t('common.moreActions')}
            disabled={disabled}
          />
        </div>
      </div>

      {stacked ? (
        <div className="px-2.5 pb-2.5 pl-[54px]">
          <FieldValue
            type={rowType}
            value={field.value}
            stringValue={stringValue}
            shown={shown}
            disabled={disabled}
            onChangeString={(v) => onChange({ value: v })}
            onChangeTotp={(v) => onChange({ value: v })}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="px-2.5 pb-1.5 pl-[76px] text-[10px] text-[var(--cv-primary)]">
          {error === 'duplicate-label'
            ? t('vault.entries.customFields.duplicateLabel')
            : t('vault.entries.customFields.labelRequired')}
        </p>
      ) : null}
    </div>
  )
}

interface FieldValueProps {
  type: CustomFieldType
  value: string | TotpParams
  stringValue: string
  shown: boolean
  disabled?: boolean
  onChangeString: (v: string) => void
  onChangeTotp: (v: TotpParams) => void
}

function FieldValue({ type, stringValue, value, shown, disabled, onChangeString, onChangeTotp }: FieldValueProps) {
  const { t } = useTranslation()

  if (type === 'totp') {
    return (
      <div className="min-w-0 flex-1">
        <TotpSetup value={value as TotpParams} onChange={onChangeTotp} disabled={disabled} />
      </div>
    )
  }
  if (type === 'multiline') {
    return (
      <textarea
        aria-label={t('vault.entries.customFields.valueLabel')}
        value={stringValue}
        onChange={(e) => onChangeString(e.target.value)}
        placeholder={t('vault.entries.customFields.valuePlaceholder')}
        disabled={disabled}
        rows={2}
        className="ph-no-capture min-h-[42px] w-full resize-y border-0 bg-transparent p-0 font-mono
          text-[11.5px] leading-relaxed text-[var(--cv-t1)] outline-none
          placeholder:text-[var(--cv-input-placeholder)]"
      />
    )
  }
  // text + concealed share an inline input; concealed masks unless revealed.
  return (
    <input
      aria-label={t('vault.entries.customFields.valueLabel')}
      value={stringValue}
      onChange={(e) => onChangeString(e.target.value)}
      placeholder={t('vault.entries.customFields.valuePlaceholder')}
      disabled={disabled}
      type="text"
      autoComplete="off"
      data-1p-ignore
      data-lpignore="true"
      className={`ph-no-capture w-full border-0 bg-transparent p-0 text-[12.5px] text-[var(--cv-t1)]
        outline-none placeholder:text-[var(--cv-input-placeholder)]
        ${type === 'concealed' ? 'font-mono' : ''} ${type === 'concealed' && !shown ? 'secret-mask' : ''}`}
    />
  )
}

/** The info marker shown on an agent-visible field, with an explanatory hover hint. */
function AgentVisibleBadge() {
  const { t } = useTranslation()
  return (
    <span className="group relative inline-flex">
      <span
        className="inline-flex h-6 w-6 items-center justify-center text-[var(--cv-info)]"
        aria-label={t('vault.entries.customFields.agentVisibleHint')}
      >
        <Icon name="smart_toy" size={13} />
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-52 -translate-x-1/2
          rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] px-2.5 py-1.5 text-[11px]
          leading-snug text-[var(--cv-t1)] opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.25)]
          transition-opacity group-hover:opacity-100"
      >
        {t('vault.entries.customFields.agentVisibleHint')}
      </span>
    </span>
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
      className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--cv-icon-muted)]
        transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]
        disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={14} />
    </button>
  )
}
