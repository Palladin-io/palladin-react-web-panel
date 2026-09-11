import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { AuthStepShell } from '../../shared/components/auth-step-shell'
import { ConsentChoices } from './consent-choices'

export function PrivacyOnboardingPage({ redirectTo = '/' }: { redirectTo?: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return <AuthStepShell title={t('privacy.title')} subtitle={t('privacy.subtitle')}>
    <ConsentChoices source="web_onboarding" onContinue={() => { void navigate({ href: redirectTo }) }} />
  </AuthStepShell>
}
