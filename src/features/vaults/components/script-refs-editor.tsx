import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryListItem,
  type ScriptRef,
} from '../types'
import { useAllEntries } from '../use-entries'

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
 * Builds the SCRIPT `refs[]` — explicit `ENV_NAME → (entry, field)` mappings the
 * agent injects as environment variables before running the script. There is no
 * `{{...}}` substitution in the script body (v1); the script just reads the env
 * vars named here. Only KEY/CREDENTIAL entries are offered as sources (a script
 * can't inject another script). Field options are the well-known aliases for the
 * chosen entry's type — custom-field refs are out of scope for v1.
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

  const add = () => onChange([...refs, { env: '', entryId: '', field: '' }])

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[11px] font-semibold text-[var(--cv-label-text)]">
            {t('vault.entries.script.refsTitle')}
          </h3>
          <p className="text-[10px] text-[var(--cv-t3)]">{t('vault.entries.script.refsHint')}</p>
        </div>
        <Button variant="ghost" size="sm" icon="add" onClick={add} disabled={disabled}>
          {t('vault.entries.script.addRef')}
        </Button>
      </div>

      {refs.length === 0 ? (
        <p className="text-[11px] text-[var(--cv-t3)]">{t('vault.entries.script.refsEmpty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {refs.map((ref, index) => (
            <RefRow
              key={index}
              ref_={ref}
              sources={sources}
              disabled={disabled}
              onChange={(patch) => update(index, patch)}
              onRemove={() => remove(index)}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function RefRow({
  ref_,
  sources,
  disabled,
  onChange,
  onRemove,
}: {
  ref_: ScriptRef
  sources: EntryListItem[]
  disabled?: boolean
  onChange: (patch: Partial<ScriptRef>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const selectedEntry = sources.find((e) => e.id === ref_.entryId)
  const fieldOptions = selectedEntry ? (FIELD_ALIASES[selectedEntry.type] ?? []) : []

  return (
    <div className="flex items-end gap-2">
      <div className="w-40 shrink-0">
        <FormInput
          id={`ref-env-${ref_.entryId}-${ref_.field}`}
          label={t('vault.entries.script.envLabel')}
          value={ref_.env}
          onChange={(e) => onChange({ env: e.target.value })}
          placeholder="GITHUB_TOKEN"
          autoComplete="off"
          disabled={disabled}
          monospace
          maxLength={100}
        />
      </div>
      <Icon name="arrow_back" size={16} className="mb-2 shrink-0 text-[var(--cv-t3)]" />
      <div className="flex-1 min-w-0">
        <FormSelect
          id={`ref-entry-${ref_.env}`}
          label={t('vault.entries.script.sourceEntry')}
          value={ref_.entryId}
          onChange={(e) => onChange({ entryId: e.target.value, field: '' })}
          disabled={disabled}
        >
          <option value="">{t('vault.entries.script.selectEntry')}</option>
          {sources.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </FormSelect>
      </div>
      <div className="w-32 shrink-0">
        <FormSelect
          id={`ref-field-${ref_.env}`}
          label={t('vault.entries.script.sourceField')}
          value={ref_.field}
          onChange={(e) => onChange({ field: e.target.value })}
          disabled={disabled || !selectedEntry}
        >
          <option value="">{t('vault.entries.script.selectField')}</option>
          {fieldOptions.map((alias) => (
            <option key={alias} value={alias}>
              {alias}
            </option>
          ))}
        </FormSelect>
      </div>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={t('common.remove')}
        title={t('common.remove')}
        className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded
          text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="delete" size={16} />
      </button>
    </div>
  )
}
