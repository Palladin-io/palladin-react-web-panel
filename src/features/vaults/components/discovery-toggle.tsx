import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'

export function DiscoveryToggle({ active, disabled, onChange }: {
  active: boolean
  disabled?: boolean
  onChange: (active: boolean) => void
}) {
  const { t } = useTranslation()
  const label = active
    ? t('vault.entries.visibility.hideFromDiscovery')
    : t('vault.entries.visibility.showInDiscovery')
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onChange(!active) }}
      className={`ml-1 inline-flex h-5 w-5 items-center justify-center rounded transition-colors
        disabled:cursor-not-allowed disabled:opacity-40 ${active
          ? 'text-[var(--cv-primary)]'
          : 'text-[var(--cv-t3)] hover:text-[var(--cv-t1)]'}`}
    >
      <Icon name="smart_toy" size={14} />
    </button>
  )
}

export function discoveryAction(
  active: boolean,
  disabled: boolean | undefined,
  onChange: (active: boolean) => void,
  t: (key: string) => string,
) {
  return {
    icon: 'smart_toy',
    label: t(active
      ? 'vault.entries.visibility.hideFromDiscovery'
      : 'vault.entries.visibility.showInDiscovery'),
    active,
    disabled,
    onClick: () => onChange(!active),
  }
}
