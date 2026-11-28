import { useTranslation } from 'react-i18next'
import { InfoZone } from '../../../shared/components/info-zone'
import { Tooltip } from '../../../shared/components/tooltip'
import type { AgentKeyProtection } from '../api/agents-api'

export function KeyProtectionValue({ value }: { value: AgentKeyProtection }) {
  const { t } = useTranslation()
  const hint = t(`agents.keyProtection.${value}Hint`)
  return (
    <Tooltip content={hint} always>
      <span tabIndex={0} className="rounded-sm focus-visible:outline focus-visible:outline-1">
        {t(`agents.keyProtection.${value}`)}
        <span className="sr-only">{`. ${hint}`}</span>
      </span>
    </Tooltip>
  )
}

export function KeyProtectionInfo({ identityLifetimeDays }: { identityLifetimeDays?: number }) {
  const { t } = useTranslation()
  return (
    <InfoZone title={t('agents.keyProtection.label')}>
      <p>{t('agents.keyProtection.infoHardened')}</p>
      <p>{t('agents.keyProtection.infoConvenience')}</p>
      <p>{identityLifetimeDays
        ? t('agents.keyProtection.infoLimitsDays', { count: identityLifetimeDays })
        : t('agents.keyProtection.infoLimits')}</p>
    </InfoZone>
  )
}
