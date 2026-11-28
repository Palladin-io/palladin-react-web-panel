import { Trans, useTranslation } from 'react-i18next'
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

const strong = { b: <strong className="font-semibold text-[var(--cv-t1)]" /> }

export function KeyProtectionInfo() {
  const { t } = useTranslation()
  return (
    <InfoZone title={t('agents.keyProtection.label')}>
      <p><Trans i18nKey="agents.keyProtection.infoHardened" components={strong} /></p>
      <p><Trans i18nKey="agents.keyProtection.infoConvenience" components={strong} /></p>
    </InfoZone>
  )
}
