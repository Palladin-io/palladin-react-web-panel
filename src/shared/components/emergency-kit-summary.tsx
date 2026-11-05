import { useTranslation } from 'react-i18next'
import type { EmergencyKitMaterial } from '../crypto/secret-key'
import { QrCode } from './qr-code'

export interface EmergencyKitSummaryProps {
  kit: EmergencyKitMaterial
  /** `auth` on full-screen auth surfaces, `panel` inside app dialogs. */
  surface: 'auth' | 'panel'
}

const SURFACE_CLASSES = {
  auth: {
    card: 'border-[var(--cv-auth-control-border)] bg-[var(--cv-auth-control-bg)]',
    label: 'text-[var(--cv-auth-muted)]',
  },
  panel: {
    card: 'border-[var(--cv-border)] bg-[var(--cv-card-bg)]',
    label: 'text-[var(--cv-t3)]',
  },
} as const

/** Account, Secret Key and QR exactly as they appear in the Emergency Kit PDF. */
export function EmergencyKitSummary({ kit, surface }: EmergencyKitSummaryProps) {
  const { t } = useTranslation()
  const classes = SURFACE_CLASSES[surface]
  return (
    <div className={`ph-no-capture flex items-start gap-3 rounded-lg border p-3 ${classes.card}`}>
      <div className="min-w-0 flex-1">
        <p className={`text-micro ${classes.label}`}>{t('emergencyKit.accountLabel')}</p>
        <p className="mb-2 truncate text-ui text-[var(--cv-t1)]">{kit.email}</p>
        <p className={`text-micro ${classes.label}`}>{t('emergencyKit.secretKeyLabel')}</p>
        <p className="break-all font-mono text-meta font-semibold text-[var(--cv-t1)]">{kit.secretKey}</p>
      </div>
      <QrCode value={kit.qrPayload} size={96} alt={t('emergencyKit.qrAlt')} />
    </div>
  )
}
