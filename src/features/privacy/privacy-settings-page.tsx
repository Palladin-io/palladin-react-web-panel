import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SecurityPage } from '../auth'
import { ConsentChoices } from './consent-choices'
import { useConsents } from './use-consents'
import { dismissPrivacyPrompt } from './privacy-prompt-state'

/** A direct privacy link has Security behind it; menu actions keep their current page. */
export function PrivacySettingsPage() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(true)
  return <>
    <SecurityPage />
    {open && <PrivacySettingsDialog onClose={() => {
      setOpen(false)
      void navigate({ to: '/settings/security', replace: true })
    }} />}
  </>
}

export function PrivacySettingsDialog({ onClose }: { onClose: () => void }) {
  const { userId } = useConsents()
  useEffect(() => { dismissPrivacyPrompt(userId) }, [userId])
  return <ConsentChoices source="web_settings" onContinue={onClose} />
}
