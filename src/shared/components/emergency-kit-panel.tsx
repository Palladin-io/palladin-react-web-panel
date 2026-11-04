import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Download } from 'lucide-react'
import type { EmergencyKitMaterial } from '../crypto/secret-key'
import { useEmergencyKitDownload } from '../hooks/use-emergency-kit-download'
import { AuthSubmitButton } from './auth-submit-button'
import { Button } from './button'
import { QrCode } from './qr-code'
import { WarningZone } from './warning-zone'

export interface EmergencyKitPanelProps {
  kit: EmergencyKitMaterial
  continueLabel: string
  onContinue: () => void
}

/** Gate shared by onboarding, recovery and the security upgrade: download, then acknowledge. */
export function EmergencyKitPanel({ kit, continueLabel, onContinue }: EmergencyKitPanelProps) {
  const { t } = useTranslation()
  const { download, downloading } = useEmergencyKitDownload(kit)
  const [downloaded, setDownloaded] = useState(false)
  const [acknowledged, setAcknowledged] = useState(false)

  return (
    <div className="flex flex-col gap-3">
      <div className="ph-no-capture flex items-start gap-3 rounded-xl border border-[var(--cv-border)]
        bg-[var(--cv-card-bg)] p-4">
        <div className="min-w-0 flex-1">
          <p className="text-micro text-[var(--cv-t3)]">{t('emergencyKit.accountLabel')}</p>
          <p className="mb-2 truncate text-ui text-[var(--cv-t1)]">{kit.email}</p>
          <p className="text-micro text-[var(--cv-t3)]">{t('emergencyKit.secretKeyLabel')}</p>
          <p className="break-all font-mono text-meta font-semibold text-[var(--cv-t1)]">{kit.secretKey}</p>
        </div>
        <QrCode value={kit.qrPayload} size={96} alt={t('emergencyKit.qrAlt')} />
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={downloading}
        onClick={async () => { if (await download()) setDownloaded(true) }}
      >
        <Download size={14} />
        {t('emergencyKit.download')}
      </Button>

      <WarningZone title={t('emergencyKit.storeSeparatelyTitle')}>
        {t('emergencyKit.storeSeparatelyBody')}
      </WarningZone>

      <label className="flex cursor-pointer items-center gap-2 text-meta text-[var(--cv-auth-secondary)]">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={!downloaded}
          onChange={(event) => setAcknowledged(event.target.checked)}
          className="h-4 w-4 rounded border-[var(--cv-input-border)] bg-transparent accent-[var(--cv-success)]"
        />
        {t('emergencyKit.savedCheckbox')}
      </label>

      <AuthSubmitButton type="button" onClick={onContinue} disabled={!downloaded || !acknowledged}>
        <Check size={14} />
        {continueLabel}
      </AuthSubmitButton>
    </div>
  )
}
