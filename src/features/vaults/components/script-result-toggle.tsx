import { useTranslation } from 'react-i18next'

import { Icon } from '../../../shared/components/icon'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'

export function ScriptResultToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const label = t('vault.entries.script.returnResultLabel')

  return (
    <div
      className="flex items-center gap-3 rounded-xl border border-[var(--cv-border)]
        bg-[var(--cv-card-bg)] px-3 py-2.5"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg
        bg-[rgb(var(--cv-primary-rgb)/0.08)] text-[var(--cv-primary)]" aria-hidden="true">
        <Icon name="output" size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-ui font-semibold text-[var(--cv-t1)]">{label}</span>
        <span className="block text-meta leading-snug text-[var(--cv-t2)]">
          {t('vault.entries.script.returnResultHint')}
        </span>
      </span>
      <ToggleSwitch checked={checked} label={label} onChange={onChange} disabled={disabled} />
    </div>
  )
}
