import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { EmergencyKitMaterial } from '../crypto/secret-key'
import { createEmergencyKitPdf, downloadEmergencyKit } from '../lib/emergency-kit-pdf'

/** Builds the kit PDF on demand from in-memory values and hands it to the browser download. */
export function useEmergencyKitDownload(kit: EmergencyKitMaterial) {
  const { t, i18n } = useTranslation()
  const [downloading, setDownloading] = useState(false)
  const download = async (): Promise<boolean> => {
    setDownloading(true)
    try {
      const pdf = await createEmergencyKitPdf({
        ...kit,
        signInAddress: window.location.origin,
        generatedOn: t('emergencyKit.pdf.generatedOn', {
          date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(new Date()),
        }),
        labels: {
          title: t('emergencyKit.pdf.title'),
          intro: t('emergencyKit.pdf.intro'),
          signInAddress: t('emergencyKit.pdf.signInAddress'),
          account: t('emergencyKit.pdf.account'),
          secretKey: t('emergencyKit.secretKeyLabel'),
          secretKeyHint: t('emergencyKit.pdf.secretKeyHint'),
          scan: t('emergencyKit.pdf.scan'),
          masterPassword: t('emergencyKit.pdf.masterPassword'),
          masterPasswordHint: t('emergencyKit.pdf.masterPasswordHint'),
          howTo: t('emergencyKit.pdf.howTo'),
          steps: [t('emergencyKit.pdf.step1'), t('emergencyKit.pdf.step2'), t('emergencyKit.pdf.step3')],
          keepPrivate: t('emergencyKit.pdf.keepPrivate'),
        },
      })
      downloadEmergencyKit(pdf, t('emergencyKit.pdf.fileName'))
      return true
    } catch {
      toast.error(t('emergencyKit.downloadFailed'))
      return false
    } finally {
      setDownloading(false)
    }
  }
  return { download, downloading }
}
