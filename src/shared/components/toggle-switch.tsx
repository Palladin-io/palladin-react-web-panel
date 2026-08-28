export function ToggleSwitch({
  checked,
  label,
  onChange,
  disabled,
}: {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative h-[1.125rem] w-[1.875rem] shrink-0 rounded-full transition-colors
        disabled:cursor-not-allowed disabled:opacity-40 ${
          checked ? 'bg-[var(--cv-primary)]' : 'bg-[var(--cv-input-border)]'
        }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[0.125rem] h-[0.875rem] w-[0.875rem] rounded-full bg-white
          transition-[left] ${checked ? 'left-[0.875rem]' : 'left-[0.125rem]'}`}
      />
    </button>
  )
}
