import { useState, type ReactNode } from 'react'
import { ConsentChoices } from './consent-choices'
import { useConsents } from './use-consents'
import { dismissedPrivacyAccounts, dismissPrivacyPrompt } from './privacy-prompt-state'

export function PrivacyPrompt({ fallback = null }: { fallback?: ReactNode }) {
  const query = useConsents()
  if (!query.userId || !query.data) return fallback
  return <DiscoveredPrompt key={query.userId} userId={query.userId}
    initiallyNeeded={query.data.consents.some(c => c.status === 'unknown')} fallback={fallback} />
}

function DiscoveredPrompt({ userId, initiallyNeeded, fallback }: { userId: string; initiallyNeeded: boolean; fallback: ReactNode }) {
  // Once opened, a failed refresh or a partial save must not dismiss the error/retry UI.
  const [open, setOpen] = useState(() => initiallyNeeded && !dismissedPrivacyAccounts.has(userId))
  return open ? <ConsentChoices source="web_onboarding" onContinue={() => {
    dismissPrivacyPrompt(userId)
    setOpen(false)
  }} /> : fallback
}
