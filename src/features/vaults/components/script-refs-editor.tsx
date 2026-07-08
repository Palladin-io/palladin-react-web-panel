import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryListItem,
  type ScriptRef,
} from '../types'
import { useAllEntries } from '../use-entries'
import { PopoverMenu, type MenuEntry } from './popover-menu'

export interface ScriptRefsEditorProps {
  vaultId: string
  /** Exclude the entry being edited from its own ref picker. */
  currentEntryId?: string
  refs: ScriptRef[]
  onChange: (next: ScriptRef[]) => void
  disabled?: boolean
}

/** Well-known, addressable fields per entry type — the values an agent can inject. */
const FIELD_ALIASES: Record<number, string[]> = {
  [ENTRY_TYPE_KEY]: ['value'],
  [ENTRY_TYPE_CREDENTIAL]: ['username', 'password', 'url'],
}

/**
 * "Injected vault data" — the SCRIPT `refs[]` as a grouped list matching the
 * approved redesign: each row is `$ ENV → entry · field`. Every ref written here
 * carries its vault id (sources are same-vault). Only KEY/CREDENTIAL entries are
 * offered (a script can't inject another script); fields are the well-known
 * aliases for the chosen entry's type.
 */
export function ScriptRefsEditor({
  vaultId,
  currentEntryId,
  refs,
  onChange,
  disabled,
}: ScriptRefsEditorProps) {
  const { t } = useTranslation()
  const entriesQuery = useAllEntries(vaultId)

  const sources = useMemo(
    () =>
      (entriesQuery.data ?? []).filter(
        (e) => e.id !== currentEntryId && e.type !== undefined && FIELD_ALIASES[e.type] !== undefined,
      ),
    [entriesQuery.data, currentEntryId],
  )

  const update = (index: number, patch: Partial<ScriptRef>) =>
    onChange(refs.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const remove = (index: number) => onChange(refs.filter((_, i) => i !== index))

  const add = () => onChange([...refs, { env: '', vaultId, entryId: '', field: '' }])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      {refs.map((ref, index) => (
        <RefRow
          key={index}
          ref_={ref}
          vaultId={vaultId}
          sources={sources}
          first={index === 0}
          disabled={disabled}
          onChange={(patch) => update(index, patch)}
          onRemove={() => remove(index)}
        />
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-[12px]
          text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          ${refs.length > 0 ? 'border-t border-[var(--cv-divider)]' : ''}
          disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Icon name="add" size={14} />
        {t('vault.entries.script.addRef')}
      </button>
    </div>
  )
}

function RefRow({
  ref_,
  vaultId,
  sources,
  first,
  disabled,
  onChange,
  onRemove,
}: {
  ref_: ScriptRef
  vaultId: string
  sources: EntryListItem[]
  first: boolean
  disabled?: boolean
  onChange: (patch: Partial<ScriptRef>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const selectedEntry = sources.find((e) => e.id === ref_.entryId)
  const fieldOptions = selectedEntry ? (FIELD_ALIASES[selectedEntry.type] ?? []) : []

  const selectClass =
    'min-w-0 max-w-[130px] cursor-pointer appearance-none border-0 bg-transparent p-0 text-[12px] text-[var(--cv-t1)] outline-none disabled:cursor-not-allowed'

  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 ${first ? '' : 'border-t border-[var(--cv-divider)]'}`}>
      <span className="flex text-[var(--cv-icon-muted)] opacity-60" aria-hidden>
        <Icon name="drag_indicator" size={14} />
      </span>
      <span className="flex text-[var(--cv-info)]" aria-hidden>
        <Icon name="attach_money" size={14} />
      </span>
      <input
        aria-label={t('vault.entries.script.envLabel')}
        value={ref_.env}
        onChange={(e) => onChange({ env: e.target.value })}
        placeholder="GITHUB_TOKEN"
        disabled={disabled}
        maxLength={100}
        className="w-36 shrink-0 border-0 bg-transparent p-0 font-mono text-[11.5px] text-[var(--cv-info)]
          outline-none placeholder:text-[var(--cv-input-placeholder)]"
      />
      <span className="flex flex-1 justify-center text-[var(--cv-t3)]" aria-hidden>
        <Icon name="arrow_back" size={14} />
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        <select
          aria-label={t('vault.entries.script.sourceEntry')}
          value={ref_.entryId}
          onChange={(e) => onChange({ entryId: e.target.value, vaultId, field: '' })}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">{t('vault.entries.script.selectEntry')}</option>
          {sources.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <span className="text-[var(--cv-t3)]">·</span>
        <select
          aria-label={t('vault.entries.script.sourceField')}
          value={ref_.field}
          onChange={(e) => onChange({ field: e.target.value })}
          disabled={disabled || !selectedEntry}
          className={selectClass}
        >
          <option value="">{t('vault.entries.script.selectField')}</option>
          {fieldOptions.map((alias) => (
            <option key={alias} value={alias}>
              {alias}
            </option>
          ))}
        </select>
      </div>
      <PopoverMenu
        trigger={<Icon name="more_horiz" size={16} />}
        items={[{ icon: 'delete', label: t('common.remove'), danger: true, onSelect: onRemove } as MenuEntry]}
        ariaLabel={t('common.moreActions')}
        disabled={disabled}
      />
    </div>
  )
}
