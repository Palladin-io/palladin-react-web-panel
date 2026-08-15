import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from './button'
import { Icon } from './icon'
import { analytics } from '../lib/analytics'
import {
  PASSWORD_DEFAULT_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  generatePassword,
} from '../crypto/password-generator'

export interface PasswordGeneratorPopoverProps {
  /** Called with the accepted password when the user clicks "Use password". */
  onUse: (password: string) => void
  disabled?: boolean
  /** Trigger button classes so it blends into the host input's action cluster. */
  triggerClassName?: string
  iconSize?: number
}

interface Coords {
  left: number
  top: number
}

/**
 * Trigger + portal popover that generates a strong password. The panel is
 * rendered through a portal to `document.body` with `position: fixed` (per
 * dialogs.md) so a scrolling/overflow-clipped ancestor — e.g. the entry modal
 * body — can never clip it. Closes on outside click, Escape, or scroll.
 *
 * The preview is a live secret: it carries `ph-no-capture` and is never logged
 * or sent to analytics. Only non-sensitive parameters (length, charset flags)
 * are tracked, and only when the user commits the value.
 */
export function PasswordGeneratorPopover({
  onUse,
  disabled,
  triggerClassName,
  iconSize = 15,
}: PasswordGeneratorPopoverProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<Coords | null>(null)
  const [length, setLength] = useState(PASSWORD_DEFAULT_LENGTH)
  const [digits, setDigits] = useState(true)
  const [symbols, setSymbols] = useState(true)
  const [preview, setPreview] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // Regenerate whenever the panel is open and the recipe changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setPreview(generatePassword({ length, digits, symbols }))
  }, [open, length, digits, symbols])

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
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

  const toggle = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) setCoords({ left: rect.right, top: rect.bottom })
    setOpen(true)
  }

  const regenerate = () => setPreview(generatePassword({ length, digits, symbols }))

  const use = () => {
    analytics.capture('vault', 'password-generated', { length, digits, symbols })
    onUse(preview)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={t('vault.entries.generator.trigger')}
        title={t('vault.entries.generator.trigger')}
        disabled={disabled}
        onClick={toggle}
        className={
          triggerClassName ??
          'inline-flex h-action w-action items-center justify-center rounded text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40'
        }
      >
        <Icon name="casino" size={iconSize} />
      </button>
      {open && coords
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-label={t('vault.entries.generator.title')}
              style={{ position: 'fixed', left: coords.left, top: coords.top, transform: 'translateX(-100%) translateY(0.375rem)' }}
              className="z-[100] w-[16.75rem] rounded-xl border border-[var(--cv-border)]
                bg-[var(--cv-modal-bg)] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.25)]"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <div
                  className="ph-no-capture min-w-0 flex-1 break-all rounded-lg border border-[var(--cv-input-border)]
                    bg-[var(--cv-input-bg)] px-2.5 py-1.5 font-mono text-ui leading-snug text-[var(--cv-input-text)]"
                >
                  {preview}
                </div>
                <button
                  type="button"
                  onClick={regenerate}
                  aria-label={t('vault.entries.generator.regenerate')}
                  title={t('vault.entries.generator.regenerate')}
                  className="inline-flex h-action w-action shrink-0 items-center justify-center rounded
                    text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)] hover:text-[var(--cv-t1)]"
                >
                  <Icon name="autorenew" size={16} />
                </button>
              </div>

              <div className="mb-2.5">
                <div className="mb-1 flex items-center justify-between text-meta font-semibold text-[var(--cv-label-text)]">
                  <span>{t('vault.entries.generator.length')}</span>
                  <span className="tabular-nums text-[var(--cv-t2)]">{length}</span>
                </div>
                <input
                  type="range"
                  min={PASSWORD_MIN_LENGTH}
                  max={PASSWORD_MAX_LENGTH}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                  aria-label={t('vault.entries.generator.length')}
                  className="w-full accent-[var(--cv-primary)]"
                />
              </div>

              <div className="mb-3 flex flex-col gap-1.5">
                <GeneratorToggle
                  label={t('vault.entries.generator.digits')}
                  checked={digits}
                  onChange={setDigits}
                />
                <GeneratorToggle
                  label={t('vault.entries.generator.symbols')}
                  checked={symbols}
                  onChange={setSymbols}
                />
                <p className="text-micro leading-snug text-[var(--cv-t3)]">
                  {t('vault.entries.generator.alwaysHint')}
                </p>
              </div>

              <Button variant="accent" size="sm" onClick={use} className="w-full">
                {t('vault.entries.generator.use')}
              </Button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function GeneratorToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-ui text-[var(--cv-t1)]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-[1.125rem] w-[1.875rem] shrink-0 rounded-full transition-colors ${
          checked ? 'bg-[var(--cv-primary)]' : 'bg-[var(--cv-input-border)]'
        }`}
      >
        <span
          className={`absolute top-[0.125rem] h-[0.875rem] w-[0.875rem] rounded-full bg-white transition-[left] ${
            checked ? 'left-[0.875rem]' : 'left-[0.125rem]'
          }`}
        />
      </button>
    </label>
  )
}
