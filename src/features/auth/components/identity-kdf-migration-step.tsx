import { useTranslation } from 'react-i18next'
import { AccountSecretDisplay } from '../../../shared/components/account-secret-display'

interface IdentityKdfMigrationStepProps {
  accountSecret: Uint8Array
  isPending: boolean
  error: string | null
  onMigrate: () => void
}

export function IdentityKdfMigrationStep({
  accountSecret,
  isPending,
  error,
  onMigrate,
}: IdentityKdfMigrationStepProps) {
  const { t } = useTranslation()
  return (
    <div className="text-left">
      <h1 className="mb-1 text-display font-bold text-[var(--cv-t1)]">
        {t('accountSecret.upgradeTitle')}
      </h1>
      <p className="mb-6 text-heading-sm text-[var(--cv-t3)]">
        {t('accountSecret.upgradeSubtitle')}
      </p>
      <AccountSecretDisplay
        accountSecret={accountSecret}
        isPending={isPending}
        error={error}
        onContinue={onMigrate}
      />
    </div>
  )
}
