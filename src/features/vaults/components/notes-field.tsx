import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { FormTextarea } from '../../../shared/components/form-textarea'

export interface NotesFieldProps {
  id: string
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

/**
 * Add-on-demand Notes. Hidden behind a discreet "+ Add notes" affordance
 * (matching the "+ Add field" ghost row) until the user opens it — or shown
 * immediately when the entry already has notes (edit / detail). Collapses back
 * to the affordance if left empty on blur. Purely presentational: the top-level
 * `notes` value and blob layout are unchanged.
 */
export function NotesField({ id, value, onChange, disabled }: NotesFieldProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(() => value.trim().length > 0)

  // Open when notes arrive after mount (the detail panel populates `notes`
  // asynchronously once the entry is decrypted). Never auto-collapses here —
  // that only happens on blur while empty.
  useEffect(() => {
    if (value.trim().length > 0) setOpen(true)
  }, [value])

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[12px]
          text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="add" size={14} />
        {t('vault.entries.addNotes')}
      </button>
    )
  }

  return (
    <FormTextarea
      id={id}
      label={t('vault.entries.notesLabel')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        if (value.trim().length === 0) setOpen(false)
      }}
      placeholder={t('vault.entries.notesPlaceholder')}
      autoComplete="off"
      // Focus only when the user just opened an empty field, not on initial
      // mount of an entry that already has notes.
      autoFocus={value.trim().length === 0}
      disabled={disabled}
      rows={2}
      maxLength={2000}
    />
  )
}
