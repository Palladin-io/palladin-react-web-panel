import { useTranslation } from 'react-i18next'
import { FormSelect } from '../../../shared/components/form-select'
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
          <FormSelect
            key={field}
            id={`map-${field}`}
            label={t(`vault.import.field.${field}`)}
            value={mapping[field] ?? ''}
            onChange={(e) => setField(field, e.target.value)}
          >
            <option value="">{t('vault.import.mapper.unset')}</option>
            {unmapped.headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </FormSelect>
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
