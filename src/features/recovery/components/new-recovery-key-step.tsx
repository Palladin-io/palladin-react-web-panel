import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { analytics } from '../../../shared/lib/analytics'
import { AuthSubmitButton } from '../../../shared/components/auth-submit-button'
import { RecoveryMnemonicPanel } from '../../../shared/components/recovery-mnemonic-panel'
import { RecoveryShell } from './recovery-shell'

export interface NewRecoveryKeyStepProps {
  mnemonic: string[]
  onFinish: () => void
}

export function NewRecoveryKeyStep({ mnemonic, onFinish }: NewRecoveryKeyStepProps) {
  const { t } = useTranslation()
  const [acknowledged, setAcknowledged] = useState(false)

  useEffect(() => {
    analytics.capture('recovery', 'new-recovery-key-page-viewed')
  }, [])

  return (
    <RecoveryShell
      title={t('recovery.newRecoveryKeyTitle')}
      subtitle={t('recovery.newRecoveryKeySubtitle')}
    >
      <div className="flex flex-col gap-3">
        <RecoveryMnemonicPanel mnemonic={mnemonic} />

        <label className="flex cursor-pointer items-center gap-2 text-meta text-[var(--cv-auth-secondary)]">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-4 w-4 rounded border-[var(--cv-input-border)] bg-transparent
              accent-[var(--cv-success)]"
          />
          {t('recovery.savedCheckbox')}
        </label>

        <AuthSubmitButton type="button" onClick={onFinish} disabled={!acknowledged}>
          {t('recovery.finish')}
        </AuthSubmitButton>
      </div>
    </RecoveryShell>
  )
}
