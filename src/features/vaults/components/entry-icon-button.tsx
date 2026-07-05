import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EntryIcon } from './entry-icon'
import { EntryIconPicker } from './entry-icon-picker'
import type { EntryType } from '../types'

export interface EntryIconButtonProps {
  icon: string | undefined
  color: string
  type: EntryType
  onChange: (icon: string | undefined) => void
  onColorChange: (color: string) => void
  onFileSelected: (file: File, previewUrl: string) => void
  disabled?: boolean
}

/**
 * The entry icon shown inline next to the Label input (approved redesign). It
 * auto-fills from the site favicon; clicking opens the full icon/colour picker
 * in a popover so the picker no longer occupies its own form section.
 */
export function EntryIconButton({
  icon,
  color,
  type,
  onChange,
  onColorChange,
  onFileSelected,
  disabled,
}: EntryIconButtonProps) {
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
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label={t('vault.entries.iconLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-[10px] border border-[var(--cv-input-border)]
          transition-colors hover:border-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <EntryIcon icon={icon} type={type} color={color} className="grid h-8 w-8 place-items-center rounded-lg" />
      </button>
      {open ? (
        <div
          role="dialog"
          className="absolute left-0 z-30 mt-1 w-[288px] rounded-xl border border-[var(--cv-border)]
            bg-[var(--cv-modal-bg)] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
        >
          <EntryIconPicker
            value={icon}
            onChange={onChange}
            onColorChange={onColorChange}
            selectedColor={color}
            rowClassName="grid grid-cols-6 gap-1.5 justify-items-center"
            maxVisible={30}
            onFileSelected={(file, previewUrl) => {
              onFileSelected(file, previewUrl)
              setOpen(false)
            }}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  )
}
