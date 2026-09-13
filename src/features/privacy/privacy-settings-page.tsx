import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsSectionPage } from '../../shared/components/settings-section-page'
import { Button } from '../../shared/components/button'
import { ConsentChoices } from './consent-choices'
import { useConsents } from './use-consents'
import { dismissPrivacyPrompt } from './privacy-prompt-state'

/** The route owns a launcher; consent fields exist only in the dialog. */
export function PrivacySettingsPage() {
  const { t } = useTranslation()
  const { userId } = useConsents()
  const [open, setOpen] = useState(true)
  const launcher = useRef<HTMLDivElement>(null)
  useEffect(() => { dismissPrivacyPrompt(userId) }, [userId])
  useEffect(() => { if (!open) launcher.current?.querySelector('button')?.focus() }, [open])
  return <SettingsSectionPage>
    <h2 className="text-heading font-semibold">{t('privacy.title')}</h2>
    <div ref={launcher}><Button size="sm" variant="subtle" aria-haspopup="dialog" onClick={() => setOpen(true)}>{t('privacy.manageChoices')}</Button></div>
    {open && <ConsentChoices source="web_settings" onContinue={() => setOpen(false)} />}
  </SettingsSectionPage>
}
