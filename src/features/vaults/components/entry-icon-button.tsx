import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  onFileSelected?: (file: File, previewUrl: string) => void
  disabled?: boolean
}

/**
 * The entry icon shown inline next to the Label input (approved redesign). It
 * opens the full local icon/colour picker in a popover. The popover is portaled to `document.body` with fixed position
 * anchored to the button, so the entry modal's scrolling/overflow body can't
 * clip it.
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
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = btnRef.current?.getBoundingClientRect()
    if (rect) setCoords({ left: rect.left, top: rect.bottom + 4 })
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const onScroll = () => setOpen(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={t('vault.entries.iconLabel')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="grid h-9 w-9 place-items-center rounded-[0.625rem] border border-[var(--cv-input-border)]
          transition-colors hover:border-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <EntryIcon icon={icon} type={type} color={color} className="grid h-8 w-8 place-items-center rounded-lg" />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              style={{ position: 'fixed', left: coords.left, top: coords.top }}
              className="z-[100] w-[18rem] rounded-xl border border-[var(--cv-border)]
                bg-[var(--cv-modal-bg)] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
            >
              <EntryIconPicker
                value={icon}
                onChange={onChange}
                onColorChange={onColorChange}
                selectedColor={color}
                rowClassName="grid grid-cols-6 gap-1.5 justify-items-center"
                maxVisible={30}
                onFileSelected={onFileSelected
                  ? (file, previewUrl) => {
                      onFileSelected(file, previewUrl)
                      setOpen(false)
                    }
                  : undefined}
                disabled={disabled}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
