import type { ReactNode } from 'react'

export interface DetailTab<T extends string> {
  id: T
  label: string
  disabled?: boolean
}

export interface DetailTabBarProps<T extends string> {
  tabs: readonly DetailTab<T>[]
  active: T
  onChange: (tab: T) => void
  ariaLabel: string
  wide?: boolean
  /** Back/navigation control aligned on the same baseline as the tabs. */
  leading?: ReactNode
  actions?: ReactNode
}

export function DetailTabBar<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  wide = false,
  leading,
  actions,
}: DetailTabBarProps<T>) {
  const buttons = tabs.map((tab) => {
    const selected = tab.id === active
    return (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={selected}
        disabled={tab.disabled}
        onClick={() => onChange(tab.id)}
        className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3.5 py-2 text-ui font-semibold transition-colors ${
          tab.disabled
            ? 'cursor-not-allowed border-transparent text-[var(--cv-t3)] opacity-40'
            : selected
              ? 'border-[var(--cv-primary)] text-[var(--cv-primary)]'
              : 'border-transparent text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'
        }`}
      >
        {tab.label}
      </button>
    )
  })

  if (!wide && !leading && !actions) {
    return (
      <div
        className="tab-strip-scroll mb-3 flex shrink-0 overflow-x-auto border-b border-[var(--cv-divider)]"
        role="tablist"
        aria-label={ariaLabel}
      >
        {buttons}
      </div>
    )
  }

  return (
    <div className="mb-4 flex h-10 shrink-0 items-end border-b border-[var(--cv-divider)]">
      {leading ? (
        <div className="mr-1 flex shrink-0 self-center items-center">{leading}</div>
      ) : null}
      <div
        className="tab-strip-scroll flex min-w-0 flex-1 overflow-x-auto"
        role="tablist"
        aria-label={ariaLabel}
      >
        {buttons}
      </div>
      {actions ? <div className="ml-2 flex shrink-0 self-center items-center gap-1">{actions}</div> : null}
    </div>
  )
}
