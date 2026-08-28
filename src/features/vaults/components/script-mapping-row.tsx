import type { ReactNode } from 'react'

import { Icon } from '../../../shared/components/icon'
import { PopoverMenu, type MenuEntry } from './popover-menu'

export interface ScriptMappingRowProps {
  first: boolean
  icon: string
  name: string
  nameLabel: string
  namePlaceholder: string
  onNameChange: (name: string) => void
  right: ReactNode
  menuItems: MenuEntry[]
  menuLabel: string
  disabled?: boolean
}

export function ScriptMappingRow({
  first,
  icon,
  name,
  nameLabel,
  namePlaceholder,
  onNameChange,
  right,
  menuItems,
  menuLabel,
  disabled,
}: ScriptMappingRowProps) {
  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2 px-2.5 py-2
        ${first ? '' : 'border-t border-[var(--cv-divider)]'}`}
    >
      <div className="min-w-0">
        <div
          className="group -ml-1.5 inline-flex max-w-full items-center gap-2 rounded-lg px-1.5 py-1
            transition-colors hover:bg-[var(--cv-bg-subtle)] focus-within:bg-[var(--cv-bg-subtle)]"
        >
          <span className="flex shrink-0 text-[var(--cv-info)]" aria-hidden="true">
            <Icon name={icon} size={14} />
          </span>
          <input
            aria-label={nameLabel}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={namePlaceholder}
            disabled={disabled}
            maxLength={64}
            size={Math.max(8, Math.min(24, name.length || namePlaceholder.length))}
            autoComplete="off"
            className="min-w-0 max-w-full border-0 bg-transparent p-0 font-mono text-meta
              text-[var(--cv-info)] outline-none placeholder:text-[var(--cv-input-placeholder)]
              disabled:cursor-not-allowed disabled:opacity-40"
          />
          <span
            className="flex shrink-0 text-[var(--cv-icon-muted)] opacity-70 transition-opacity
              group-focus-within:opacity-100 group-hover:opacity-100"
            aria-hidden="true"
          >
            <Icon name="edit" size={13} />
          </span>
        </div>
      </div>
      <span className="flex justify-center text-[var(--cv-t3)]" aria-hidden="true">
        <Icon name="arrow_back" size={14} />
      </span>
      <div className="flex min-w-0 items-center justify-end gap-2">
        {right}
        <PopoverMenu
          trigger={<Icon name="more_horiz" size={16} />}
          items={menuItems}
          ariaLabel={menuLabel}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
