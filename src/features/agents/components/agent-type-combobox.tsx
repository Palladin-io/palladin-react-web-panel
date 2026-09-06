import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { agentTypeLabelKey } from './agent-presentation'

export function typeLabel(value: string, t: (key: string) => string): string {
  const key = agentTypeLabelKey(value)
  return key ? t(key) : value
}

interface AgentTypeComboboxProps {
  typeValues: string[]
  inputValue: string
  onInputChange: (text: string) => void
  onSelect: (value: string, label: string) => void
  disabled?: boolean
  error?: boolean
  describedBy?: string
  onBlur?: () => void
}

export function AgentTypeCombobox({
  typeValues,
  inputValue,
  onInputChange,
  onSelect,
  disabled,
  error,
  describedBy,
  onBlur,
}: AgentTypeComboboxProps) {
  const { t } = useTranslation()
  const listId = useId()
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 0, upward: false })
  const openOptions = () => {
    const rect = inputRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    const upward = below < 200 && above > below
    setPosition({ left: rect.left, top: upward ? rect.top : rect.bottom,
      width: rect.width, upward, maxHeight: Math.max(0, Math.min(260, upward ? above : below)) })
    setOpen(true)
  }
  useEffect(() => {
    if (!open) return
    const closeOptions = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', closeOptions, true)
    window.addEventListener('resize', closeOptions)
    return () => {
      window.removeEventListener('scroll', closeOptions, true)
      window.removeEventListener('resize', closeOptions)
    }
  }, [open])
  const optionRefs = useRef<Array<HTMLLIElement | null>>([])

  const filtered = inputValue.trim()
    ? typeValues.filter((v) =>
        typeLabel(v, t).toLowerCase().includes(inputValue.toLowerCase()),
      )
    : typeValues

  useEffect(() => {
    if (activeIndex >= 0) {
      const option = optionRefs.current[activeIndex]
      if (typeof option?.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [activeIndex])

  return (
    <div className="w-full min-w-0">
      <label
        htmlFor={inputId}
        className="mb-1 block text-meta font-semibold text-[var(--cv-label-text)]"
      >
        {t('agents.agentType')}
      </label>
      <div className="relative w-full min-w-0">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open && filtered.length > 0 ? listId : undefined}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={error || undefined}
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value)
            openOptions()
            setActiveIndex(-1)
          }}
          onFocus={openOptions}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && open) {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              setActiveIndex(-1)
              return
            }
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              openOptions()
              setActiveIndex((current) => {
                if (filtered.length === 0) return -1
                if (event.key === 'ArrowDown') return (current + 1) % filtered.length
                return current <= 0 ? filtered.length - 1 : current - 1
              })
              return
            }
            if (event.key === 'Enter' && open && activeIndex >= 0) {
              const value = filtered[activeIndex]
              if (value) {
                event.preventDefault()
                onSelect(value, typeLabel(value, t))
                setOpen(false)
                setActiveIndex(-1)
              }
            }
          }}
          onBlur={() => {
            onBlur?.()
            setTimeout(() => setOpen(false), 120)
          }}
          placeholder={t('agents.typePlaceholder')}
          disabled={disabled}
          autoComplete="off"
          className={`h-control w-full rounded-lg border ${error ? 'border-[var(--cv-primary)]' : 'border-[var(--cv-input-border)]'}
            bg-[var(--cv-input-bg)] px-3 pr-9 text-ui text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)]
            focus:border-[var(--cv-t1)] focus:outline-none transition-colors
            disabled:cursor-not-allowed disabled:opacity-40`}
        />
        <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
          <Icon name="expand_more" size={16} color="var(--cv-t3)" />
        </div>

        {open && filtered.length > 0 ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={t('agents.agentType')}
            style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, transform: position.upward ? 'translateY(-100%)' : undefined }}
            className="subtle-scrollbar fixed z-[60] overflow-y-auto overscroll-contain
              rounded-lg border border-[var(--cv-border)] bg-[var(--cv-modal-bg)] py-1"
          >
            {filtered.map((value, index) => (
              <li
                ref={(element) => { optionRefs.current[index] = element }}
                id={`${listId}-${index}`}
                key={value}
                role="option"
                aria-selected={index === activeIndex}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onSelect(value, typeLabel(value, t))
                    setOpen(false)
                    setActiveIndex(-1)
                  }}
                  className={`w-full px-3 py-2 text-left text-ui text-[var(--cv-t1)]
                    transition-colors hover:bg-[var(--cv-list-item-hover)] ${index === activeIndex
                      ? 'bg-[var(--cv-list-item-hover)]'
                      : ''}`}
                >
                  {typeLabel(value, t)}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        ) : null}
      </div>
    </div>
  )
}
