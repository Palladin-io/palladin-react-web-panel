import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'

/**
 * Calm exec-only annotation shown under the script editor — a script runs on the
 * agent (`palladin exec`) and is never readable. Uses the script accent, not a
 * WarningZone (this is informative, not a caution).
 */
export function ScriptExecHint() {
  const { t } = useTranslation()
  return (
    <p className="mt-1.5 flex items-start gap-2 text-meta text-[var(--cv-t3)]">
      <Icon name="terminal" size={13} className="mt-px shrink-0 text-[var(--cv-script)]" />
      <span>{t('vault.entries.script.execHint')}</span>
    </p>
  )
}
