import { useState } from 'react'
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
 * immediately when the entry already has notes (edit / detail), including when
 * `value` arrives asynchronously after decrypt. Collapses back to the affordance
 * if left empty on blur. Purely presentational: the top-level `notes` value and
 * blob layout are unchanged.
 */
export function NotesField({ id, value, onChange, disabled }: NotesFieldProps) {
  const { t } = useTranslation()
  // `userOpened` tracks explicit interaction; a non-empty value opens the field
  // on its own. Deriving `open` from the value (rather than syncing via an
  // effect) means notes that arrive after mount render the field open in the
  // same paint — no one-render flash of the affordance. Focusing keeps it open
  // while editing so clearing the text doesn't collapse it mid-edit; blur while
  // empty collapses it back.
  const [userOpened, setUserOpened] = useState(false)
  const hasValue = value.trim().length > 0
  const open = userOpened || hasValue

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setUserOpened(true)}
        disabled={disabled}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-ui
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
      onFocus={() => setUserOpened(true)}
      onBlur={() => {
        if (!hasValue) setUserOpened(false)
      }}
      placeholder={t('vault.entries.notesPlaceholder')}
      autoComplete="off"
      // Focus only when the user just opened an empty field, not on initial
      // mount of an entry that already has notes.
      autoFocus={!hasValue}
      disabled={disabled}
      rows={2}
      maxLength={2000}
    />
  )
}
