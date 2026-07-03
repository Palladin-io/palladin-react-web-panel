import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type {
  ColumnMapping,
  MappableField,
  UnmappedCsv,
} from '../import'

const FIELDS: MappableField[] = [
  'label',
  'username',
  'password',
  'url',
  'notes',
  'totp',
]

export interface ImportColumnMapperProps {
  unmapped: UnmappedCsv
  mapping: ColumnMapping
  onChange: (next: ColumnMapping) => void
}

/**
 * Fallback mapper for CSVs no profile recognised. The user assigns each Palladin
 * field to a source column (or leaves it unset); a 3-row preview shows the raw
 * data so the mapping can be sanity-checked. Values are never logged.
 */
export function ImportColumnMapper({
  unmapped,
  mapping,
  onChange,
}: ImportColumnMapperProps) {
  const { t } = useTranslation()
  const previewRows = unmapped.rows.slice(0, 3)

  const setField = (field: MappableField, column: string) => {
    const next = { ...mapping }
    if (column) next[field] = column
    else delete next[field]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-[var(--cv-t3)]">
        {t('vault.import.mapper.description')}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => (
          <div key={field}>
            <label
              htmlFor={`map-${field}`}
              className="mb-1 block text-[11px] font-semibold text-[var(--cv-label-text)]"
            >
              {t(`vault.import.field.${field}`)}
            </label>
            <div className="relative">
              <select
                id={`map-${field}`}
                value={mapping[field] ?? ''}
                onChange={(e) => setField(field, e.target.value)}
                className="w-full appearance-none rounded-lg border border-[var(--cv-input-border)]
                  bg-[var(--cv-input-bg)] pl-3 pr-9 py-2 text-[12px] text-[var(--cv-input-text)]
                  focus:border-[var(--cv-t1)] focus:outline-none"
              >
                <option value="">{t('vault.import.mapper.unset')}</option>
                {unmapped.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <Icon
                name="expand_more"
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cv-t3)]"
              />
            </div>
          </div>
        ))}
      </div>

      {previewRows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--cv-border)]">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-[var(--cv-border)] text-[var(--cv-t3)]">
                {unmapped.headers.map((header) => (
                  <th key={header} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--cv-divider)] last:border-0">
                  {unmapped.headers.map((header) => (
                    <td key={header} className="max-w-[160px] truncate px-2 py-1.5 text-[var(--cv-t2)]">
                      {row[header]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
