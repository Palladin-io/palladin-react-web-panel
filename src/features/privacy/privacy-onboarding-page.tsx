import { useNavigate } from '@tanstack/react-router'
import { AppWordmark } from '../../shared/components/app-wordmark'
import { useAuthStore } from '../auth'
import { dismissPrivacyPrompt } from './privacy-prompt-state'
import { ConsentChoices } from './consent-choices'

export function PrivacyOnboardingPage({ redirectTo = '/' }: { redirectTo?: string }) {
  const navigate = useNavigate()
  const userId = useAuthStore(state => state.userId)
  // OAuth can reach this step before key setup; never mount the unlocked shell here.
  return <div className="auth-surface flex min-h-screen items-start justify-center p-8">
    <div aria-hidden="true"><AppWordmark size="lg" /></div>
    <ConsentChoices source="web_onboarding" onContinue={() => { dismissPrivacyPrompt(userId); void navigate({ href: redirectTo }) }} />
  </div>
}
