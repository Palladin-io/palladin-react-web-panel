import { useTranslation } from 'react-i18next'
import { Icon } from '../../shared/components/icon'

export function PrivacyPolicyLink() {
  const { t, i18n } = useTranslation()
  const href = i18n.language.startsWith('pl')
    ? 'https://palladin.io/pl/polityka-prywatnosci#8-analityka-marketing-i-prawa'
    : 'https://palladin.io/privacy/#8-analytics-marketing-and-rights'
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className="mt-3 inline-flex items-center gap-1 text-meta text-[var(--cv-t2)] underline underline-offset-4 hover:text-[var(--cv-t1)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--cv-primary)]">
    {t('privacy.policyLink')}<Icon name="open_in_new" size={14} />
    <span className="sr-only"> ({t('privacy.policyLinkNewTab')})</span>
  </a>
}
