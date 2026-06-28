import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  TypeFilterDropdown,
  type TypeFilterOption,
} from '../../../shared/components/type-filter-dropdown'
import { useThemeStore } from '../../../shared/stores/theme-store'
import { AUDIT_EVENT_TYPES, type AuditEventType } from '../api/audit-api'
import { auditEventConfig } from './audit-event-config'

export interface AuditFilterOption {
  value: string
  label: string
}

export interface AuditFilterState {
  search: string
  /** Multi-select filters — empty array = no filter. */
  eventType: string[]
  agentId: string[]
  userId: string[]
  /** Only meaningful when `vaultOptions` is provided (global screen). */
  vaultId: string[]
  /** `YYYY-MM-DD` (from a native date input) or empty. */
  from: string
  to: string
}

export interface AuditFilterBarProps {
  value: AuditFilterState
  onChange: (next: AuditFilterState) => void
  agentOptions: AuditFilterOption[]
  /** Acting-user options (human actors); omit to hide the user filter. */
  userOptions?: AuditFilterOption[]
  /** Provide to show a vault filter (global screen); omit on the vault tab. */
  vaultOptions?: AuditFilterOption[]
  /** Event types offered in the dropdown — defaults to the full taxonomy. */
  eventTypes?: AuditEventType[]
}

const TRIGGER_CLASS = 'h-8'
const DATE_CLASS =
  'h-8 rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)] px-2.5 ' +
  'text-[12px] text-[var(--cv-input-text)] transition-colors focus:border-[var(--cv-t1)] focus:outline-none'

/**
 * Search + collapsible filter bar shared by the vault Audit Log tab and the
 * global Audit Log screen. The search field height matches the canonical list
 * search (`px-3 py-2`). Every dropdown is the shared `TypeFilterDropdown`
 * multi-select (same control as the Inbox type filter), so any combination of
 * event types / agents / users / vaults can be applied at once. A `tune` icon
 * toggles the filter row with a smooth height+opacity animation, and a count
 * badge shows how many filter dimensions are active. Filter state stays as
 * `string[]` (CSV-serialised for the API); the Set the dropdown speaks is
 * bridged at the boundary.
 */
export function AuditFilterBar({
  value,
  onChange,
  agentOptions,
  userOptions,
  vaultOptions,
  eventTypes = [...AUDIT_EVENT_TYPES],
}: AuditFilterBarProps) {
  const { t } = useTranslation()
  // Drive the native date popup + calendar indicator to match the app theme.
  const theme = useThemeStore((s) => s.theme)
  const [open, setOpen] = useState(false)

  const set = <K extends keyof AuditFilterState>(key: K, v: AuditFilterState[K]) =>
    onChange({ ...value, [key]: v })

  const setList = (key: 'eventType' | 'agentId' | 'userId' | 'vaultId') => (next: Set<string>) =>
    set(key, [...next])

  const eventTypeOptions = useMemo<TypeFilterOption[]>(
    () => eventTypes.map((type) => ({ value: type, label: t(auditEventConfig(type).labelKey) })),
    [eventTypes, t],
  )

  // One active dimension per non-empty multi-select + each date bound.
  const activeCount =
    (value.eventType.length ? 1 : 0) +
    (value.agentId.length ? 1 : 0) +
    (value.userId.length && userOptions ? 1 : 0) +
    (value.vaultId.length && vaultOptions ? 1 : 0) +
    (value.from ? 1 : 0) +
    (value.to ? 1 : 0)

  const clearFilters = () =>
    onChange({
      ...value,
      eventType: [],
      agentId: [],
      userId: [],
      vaultId: [],
      from: '',
      to: '',
    })

  return (
    <div className="mb-3">
      <div
        className="flex items-center gap-2 rounded-lg border border-[var(--cv-input-border)]
          bg-[var(--cv-input-bg)] px-3 py-2 transition-colors focus-within:border-[var(--cv-t1)]"
      >
        <Icon name="search" size={16} className="shrink-0 text-[var(--cv-input-placeholder)]" />
        <input
          type="text"
          value={value.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder={t('audit.searchPlaceholder')}
          className="flex-1 border-none bg-transparent text-[12px] text-[var(--cv-input-text)]
            placeholder:text-[var(--cv-input-placeholder)] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={t('audit.filtersToggle')}
          title={t('audit.filtersToggle')}
          className="relative flex shrink-0 items-center justify-center rounded transition-colors
            hover:bg-[var(--cv-card-hover)]"
          style={{ color: activeCount > 0 ? 'var(--cv-primary)' : 'var(--cv-t3)' }}
        >
          <Icon name="tune" size={18} />
          {activeCount > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center
                rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: 'var(--cv-primary)' }}
            >
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Animated expand/collapse: the grid-rows 0fr→1fr trick animates to the
          panel's natural height; it clips the inner padding when collapsed so the
          margin below the bar is identical in both states. The inner `pt-3`
          (12px) equals the outer `mb-3`, so the gap above the panel matches the
          gap below it. `overflow` is hidden only while collapsed, so the open
          dropdowns (absolute popups) are never clipped. */}
      {/* `inert` (React 19) when collapsed removes the dropdowns/date inputs from
          tab order + the a11y tree — avoids the aria-hidden-with-focusable-content
          violation without needing pointer-events-none. */}
      <div
        className="grid transition-all duration-200 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
        inert={!open || undefined}
      >
        <div className={open ? 'overflow-visible' : 'overflow-hidden'}>
          <div className="flex flex-wrap items-center gap-2 pt-3">
            <TypeFilterDropdown
              triggerClassName={TRIGGER_CLASS}
              options={eventTypeOptions}
              selected={new Set(value.eventType)}
              onChange={setList('eventType')}
              placeholder={t('audit.filterEventLabel')}
              ariaLabel={t('audit.filterEvent')}
            />

            <TypeFilterDropdown
              triggerClassName={TRIGGER_CLASS}
              options={agentOptions}
              selected={new Set(value.agentId)}
              onChange={setList('agentId')}
              placeholder={t('audit.filterAgentLabel')}
              ariaLabel={t('audit.filterAgent')}
            />

            {userOptions && (
              <TypeFilterDropdown
                triggerClassName={TRIGGER_CLASS}
                options={userOptions}
                selected={new Set(value.userId)}
                onChange={setList('userId')}
                placeholder={t('audit.filterUserLabel')}
                ariaLabel={t('audit.filterUser')}
              />
            )}

            {vaultOptions && (
              <TypeFilterDropdown
                triggerClassName={TRIGGER_CLASS}
                options={vaultOptions}
                selected={new Set(value.vaultId)}
                onChange={setList('vaultId')}
                placeholder={t('audit.filterVaultLabel')}
                ariaLabel={t('audit.filterVault')}
              />
            )}

            <label className="flex items-center gap-1.5 text-[11px] text-[var(--cv-t3)]">
              {t('audit.dateFrom')}
              <input
                type="date"
                value={value.from}
                max={value.to || undefined}
                onChange={(e) => set('from', e.target.value)}
                aria-label={t('audit.dateFrom')}
                className={DATE_CLASS}
                style={{ colorScheme: theme }}
              />
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-[var(--cv-t3)]">
              {t('audit.dateTo')}
              <input
                type="date"
                value={value.to}
                min={value.from || undefined}
                onChange={(e) => set('to', e.target.value)}
                aria-label={t('audit.dateTo')}
                className={DATE_CLASS}
                style={{ colorScheme: theme }}
              />
            </label>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[11px]
                  font-semibold text-[var(--cv-t3)] transition-colors hover:text-[var(--cv-primary)]"
              >
                <Icon name="close" size={14} />
                {t('audit.clearFilters')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
