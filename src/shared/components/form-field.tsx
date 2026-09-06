import type { InputHTMLAttributes, ReactNode } from 'react'
import { CopyButton } from './copy-button'
import { Icon } from './icon'
import { Tooltip } from './tooltip'

/**
 * Styled text input with label for onboarding and settings forms.
 *
 * Pass `borderClass` to override the border/focus-border classes when the
 * border must change dynamically (e.g. correct/wrong state on confirm step).
 * Pass `error` for a standard red-border error state without a custom borderClass.
 */
interface FormInputAction {
  icon: string
  onClick: () => void
  label: string
  show?: boolean
  active?: boolean
  disabled?: boolean
}

export interface FormInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string
  /** Optional muted adornment after the label (e.g. "· visible to agents"). */
  labelSuffix?: ReactNode
  /** Override the default label className when different styling is needed. */
  labelClassName?: string
  /** Override border + focus-border classes. Defaults to subtle/teal. */
  borderClass?: string
  /** Render the input value in a monospace font (e.g. API keys, tokens). */
  monospace?: boolean
  /** Show a red border to signal a validation error. */
  error?: boolean
  /** Render a copy-to-clipboard button that copies the current value. */
  copyable?: boolean
  /** Accessible label for the copy button (e.g. "Copy username"). */
  copyLabel?: string
  /**
   * A trailing icon-button inside the input (like the eye/copy on a password) —
   * e.g. "open URL". Rendered only when `trailingAction.show` is not false, so
   * callers can gate it on a valid value.
   */
  trailingAction?: {
    icon: string
    onClick: () => void
    label: string
    show?: boolean
  }
  /** Multiple icon actions rendered in the input's right action cluster. */
  trailingActions?: FormInputAction[]
}

export function FormInput({
  label,
  labelSuffix,
  id,
  labelClassName,
  borderClass,
  monospace,
  error,
  copyable,
  copyLabel,
  trailingAction,
  trailingActions,
  ...props
}: FormInputProps) {
  const visibleActions: FormInputAction[] = [
    ...(trailingActions ?? []).filter((action) => action.show !== false),
    ...(trailingAction && trailingAction.show !== false ? [trailingAction] : []),
  ]
  const actionCount = visibleActions.length + (copyable ? 1 : 0)
  const hasTrailing = actionCount > 0
  const trailingPadding = actionCount <= 1 ? 'pr-10' : actionCount === 2 ? 'pr-16' : 'pr-[5.375rem]'
  return (
    <div className="w-full min-w-0">
      {labelSuffix ? (
        <div className="mb-1.5 flex items-center text-meta font-semibold text-[var(--cv-label-text)]">
          <label htmlFor={id} className={labelClassName}>{label}</label>
          <span className="ml-1.5 font-normal text-[var(--cv-t3)]">{labelSuffix}</span>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={labelClassName ?? 'mb-1.5 block text-meta font-semibold text-[var(--cv-label-text)]'}
        >
          {label}
        </label>
      )}
      <div className="relative w-full min-w-0">
        <input
          id={id}
          className={`h-control w-full rounded-lg border bg-[var(--cv-input-bg)] pl-3 text-ui
            text-[var(--cv-input-text)] placeholder:text-[var(--cv-input-placeholder)]
            focus:outline-none transition-colors duration-200 ${hasTrailing ? trailingPadding : 'pr-3'} ${
            borderClass ?? (error
              ? 'border-[var(--cv-primary)] focus:border-[var(--cv-primary)]'
              : 'border-[var(--cv-input-border)] focus:border-[var(--cv-t1)]')
          }${monospace ? ' font-mono' : ''}`}
          {...props}
        />
        {hasTrailing ? (
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            {visibleActions.map((action) => (
              <Tooltip key={action.label} content={action.label} always>
                <button
                  type="button"
                  onClick={action.onClick}
                  disabled={action.disabled}
                  aria-label={action.label}
                  aria-pressed={action.active}
                  className={`inline-flex h-action w-action items-center justify-center rounded transition-colors
                    disabled:cursor-not-allowed disabled:opacity-40 ${action.active
                      ? 'text-[var(--cv-info)]'
                      : 'text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'}`}
                >
                  <Icon name={action.icon} size={16} />
                </button>
              </Tooltip>
            ))}
            {copyable ? <CopyButton value={String(props.value ?? '')} label={copyLabel} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * Fixed-height (`h-feedback`, 20 px rendered) feedback row below an input.
 *
 * Always occupies the same height regardless of visibility. Legacy callers may still
 * compensate for this fixed row; new forms should prefer FeedbackSlot below.
 */
export interface FieldFeedbackProps {
  visible: boolean
  color: 'red' | 'teal'
  children: ReactNode
  /** Allow wrapped messages inside the collapsing feedback slot. */
  autoHeight?: boolean
}

export function FieldFeedback({ visible, color, children, autoHeight = false }: FieldFeedbackProps) {
  return (
    <p
      role={color === 'red' && visible ? 'alert' : undefined}
      aria-hidden={!visible || undefined}
      className={`${autoHeight ? '' : 'h-feedback'} pt-1 pl-2 text-micro font-medium
        transition-[opacity,transform] duration-200 ease-out ${
        color === 'teal' ? 'text-[var(--cv-success)]' : 'text-[var(--cv-primary)]'
      } ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'}`}
    >
      {children}
    </p>
  )
}

/**
 * Feedback that animates its OWN height so the fields below slide down/up
 * smoothly when it appears/disappears (instead of jumping). Uses the
 * grid `0fr → 1fr` rows trick — stays mounted, so it animates both ways.
 * No reserved space when hidden (the row collapses to 0).
 */
export function FeedbackSlot({ visible, color, children }: FieldFeedbackProps) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: visible ? '1fr' : '0fr' }}
    >
      <div className="overflow-hidden">
        <FieldFeedback visible={visible} color={color} autoHeight>
          {children}
        </FieldFeedback>
      </div>
    </div>
  )
}
