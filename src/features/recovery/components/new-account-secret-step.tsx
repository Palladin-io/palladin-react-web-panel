import { useTranslation } from 'react-i18next'
import { AccountSecretDisplay } from '../../../shared/components/account-secret-display'
import { RecoveryShell } from './recovery-shell'

interface NewAccountSecretStepProps {
  accountSecret: Uint8Array
  onFinish: () => void
}

export function NewAccountSecretStep({
  accountSecret,
  onFinish,
}: NewAccountSecretStepProps) {
  const { t } = useTranslation()
  return (
    <RecoveryShell
      title={t('accountSecret.title')}
      subtitle={t('accountSecret.recoverySubtitle')}
    >
      <AccountSecretDisplay accountSecret={accountSecret} onContinue={onFinish} />
    </RecoveryShell>
  )
}
