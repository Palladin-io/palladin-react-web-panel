import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Icon } from './icon'

const ACCENT = '#FF4F4F'

const pad = (n: number) => String(n).padStart(2, '0')

/** Build a `datetime-local` string (`YYYY-MM-DDTHH:mm`, local time) from parts. */
function toLocalString(date: Date, hours: number, minutes: number): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}`
}

/** Parse a `datetime-local` string back into a Date, or `null` if invalid. */
function parseLocal(value: string): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Midnight-normalised copy so date-only comparisons ignore the time of day. */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** All day cells (leading/trailing nulls for padding) for a given month grid. */
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1)
  // Monday-first week (getDay: 0=Sun → 6, 1=Mon → 0).
  const lead = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export interface DateTimePickerProps {
  /** Current `datetime-local` value (`YYYY-MM-DDTHH:mm`). Empty = nothing picked. */
  value: string
  /** Earliest selectable moment. Defaults to now. */
  min?: Date
  onChange: (value: string) => void
  onClose: () => void
  /** Element the popover is anchored to (positioned just below it). */
  anchorRef: React.RefObject<HTMLElement | null>
}

/**
 * On-brand date + time picker rendered as an anchored popover. Replaces the
 * native `<input type="datetime-local">` popup, which cannot be styled. Renders
 * a month calendar (‹ › navigation), hour/minute selects and a Today shortcut.
 *
 * The component is always wrapped in a `.dark` container so the `--cv-*` tokens
 * resolve to their dark-mode values, matching the dialogs it lives in.
 *
 * Past dates are disabled (days before `min`'s day; on the min day, times before
 * `min`). Value in/out is a local `datetime-local` string, matching `expiresAt`.
 */
export function DateTimePicker({
  value,
  min,
  onChange,
  onClose,
  anchorRef,
}: DateTimePickerProps) {
  const { t } = useTranslation()
  const popoverRef = useRef<HTMLDivElement>(null)
  const minDate = useMemo(() => min ?? new Date(), [min])

  const initial = useMemo(() => parseLocal(value) ?? minDate, [value, minDate])
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(initial))
  const [hours, setHours] = useState(initial.getHours())
  const [minutes, setMinutes] = useState(initial.getMinutes())

  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(
    null,
  )

  // Anchor the popover just under the trigger field; re-measure on scroll/resize.
  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setCoords({ left: rect.left, top: rect.bottom + 6, width: rect.width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchorRef])

  // Close on Escape or a click outside the popover (and outside the trigger).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
    }
  }, [onClose, anchorRef])

  const minDay = startOfDay(minDate)
  const grid = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth])

  const isDayDisabled = useCallback(
    (day: Date) => startOfDay(day).getTime() < minDay.getTime(),
    [minDay],
  )

  /** On the min day, hours/minutes before now are off-limits. */
  const isTimeDisabled = useCallback(
    (h: number, m: number) => {
      if (!sameDay(selectedDay, minDate)) return false
      if (h < minDate.getHours()) return true
      if (h === minDate.getHours() && m < minDate.getMinutes()) return true
      return false
    },
    [selectedDay, minDate],
  )

  const goPrevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  const goNextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
  }
  // Disable navigating to a month entirely before the min month.
  const prevDisabled =
    viewYear < minDay.getFullYear() ||
    (viewYear === minDay.getFullYear() && viewMonth <= minDay.getMonth())

  const selectDay = (day: Date) => {
    setSelectedDay(startOfDay(day))
    // If switching onto the min day makes the current time invalid, bump it up.
    if (sameDay(day, minDate) && isTimeDisabled(hours, minutes)) {
      setHours(minDate.getHours())
      setMinutes(minDate.getMinutes())
    }
  }

  const goToday = () => {
    setViewYear(minDate.getFullYear())
    setViewMonth(minDate.getMonth())
    setSelectedDay(startOfDay(minDate))
    setHours(minDate.getHours())
    setMinutes(minDate.getMinutes())
  }

  const confirm = () => {
    onChange(toLocalString(selectedDay, hours, minutes))
    onClose()
  }

  const confirmDisabled =
    isDayDisabled(selectedDay) || isTimeDisabled(hours, minutes)

  const weekdays = useMemo(() => t('datetimePicker.weekdays').split(','), [t])
  const monthLabel = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [viewYear, viewMonth],
  )

  if (!coords) return null

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={t('datetimePicker.ariaLabel')}
      className="dark fixed z-[120] w-[260px] rounded-xl border border-[var(--cv-border)]
        bg-[var(--cv-modal-bg)] p-3 text-[var(--cv-t1)]
        shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
      style={{ left: coords.left, top: coords.top, minWidth: coords.width }}
    >
      {/* Month navigation */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t('datetimePicker.prevMonth')}
          disabled={prevDisabled}
          onClick={goPrevMonth}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--cv-t2)]
            transition-colors hover:bg-[var(--cv-input-bg)] hover:text-[var(--cv-t1)]
            disabled:cursor-not-allowed disabled:opacity-30"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <span className="text-[12px] font-semibold capitalize text-[var(--cv-t1)]">
          {monthLabel}
        </span>
        <button
          type="button"
          aria-label={t('datetimePicker.nextMonth')}
          onClick={goNextMonth}
          className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--cv-t2)]
            transition-colors hover:bg-[var(--cv-input-bg)] hover:text-[var(--cv-t1)]"
        >
          <Icon name="chevron_right" size={18} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7 gap-0.5">
        {weekdays.map((w, i) => (
          <span
            key={i}
            className="flex h-6 items-center justify-center text-[9px] font-semibold uppercase text-[var(--cv-t3)]"
          >
            {w}
          </span>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {grid.map((day, i) => {
          if (!day) return <span key={i} className="h-7" />
          const disabled = isDayDisabled(day)
          const selected = sameDay(day, selectedDay)
          const today = sameDay(day, minDate)
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              aria-pressed={selected}
              onClick={() => selectDay(day)}
              className={`flex h-7 items-center justify-center rounded-md text-[11px] transition-colors
                disabled:cursor-not-allowed disabled:opacity-25 ${
                  selected
                    ? 'font-semibold text-white'
                    : today
                      ? 'font-semibold text-[var(--cv-t1)] hover:bg-[var(--cv-input-bg)]'
                      : 'text-[var(--cv-t2)] hover:bg-[var(--cv-input-bg)] hover:text-[var(--cv-t1)]'
                }`}
              style={selected ? { backgroundColor: ACCENT } : undefined}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>

      {/* Time selects */}
      <div className="mt-3 flex items-center gap-2">
        <Icon name="schedule" size={16} color="var(--cv-t3)" />
        <select
          aria-label={t('datetimePicker.hours')}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="flex-1 rounded-md border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
            px-2 py-1 text-[12px] text-[var(--cv-input-text)] focus:border-[var(--cv-t1)] focus:outline-none"
        >
          {Array.from({ length: 24 }, (_, h) => (
            <option key={h} value={h} disabled={isTimeDisabled(h, minutes)}>
              {pad(h)}
            </option>
          ))}
        </select>
        <span className="text-[12px] font-semibold text-[var(--cv-t3)]">:</span>
        <select
          aria-label={t('datetimePicker.minutes')}
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="flex-1 rounded-md border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
            px-2 py-1 text-[12px] text-[var(--cv-input-text)] focus:border-[var(--cv-t1)] focus:outline-none"
        >
          {Array.from({ length: 60 }, (_, m) => (
            <option key={m} value={m} disabled={isTimeDisabled(hours, m)}>
              {pad(m)}
            </option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={goToday}
          className="flex-1 rounded-md border border-[var(--cv-input-border)] bg-[var(--cv-input-bg)]
            px-2 py-1.5 text-[11px] font-medium text-[var(--cv-t2)] transition-colors
            hover:border-[#FF4F4F] hover:text-[var(--cv-t1)]"
        >
          {t('datetimePicker.today')}
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={confirmDisabled}
          className="flex-[2] rounded-md px-2 py-1.5 text-[11px] font-semibold text-white
            transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
        >
          {t('datetimePicker.confirm')}
        </button>
      </div>
    </div>,
    document.body,
  )
}
