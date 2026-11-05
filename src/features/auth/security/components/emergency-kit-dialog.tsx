import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { FeedbackSlot } from '../../../../shared/components/form-field'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { EmergencyKitSummary } from '../../../../shared/components/emergency-kit-summary'
import { SecretInput } from '../../../../shared/components/secret-input'
import { useEmergencyKitDownload } from '../../../../shared/hooks/use-emergency-kit-download'
import type { EmergencyKitMaterial } from '../../../../shared/crypto/secret-key'
import { IncorrectCurrentPasswordError } from '../../hooks/use-change-master-password'
import { useRevealEmergencyKit } from '../../hooks/use-secret-key'

export interface EmergencyKitDialogProps {
  onClose: () => void
}

/** Password confirmation, then a fresh client-side PDF of the current kit. */
export function EmergencyKitDialog({ onClose }: EmergencyKitDialogProps) {
  const { t } = useTranslation()
  const reveal = useRevealEmergencyKit()
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kit, setKit] = useState<EmergencyKitMaterial | null>(null)

  if (kit) return <KitReady kit={kit} onClose={onClose} />

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!password || reveal.isPending) return
    setError(null)
    reveal.mutate(password, {
      onSuccess: (material) => { setPassword(''); setKit(material) },
      onError: (failure) => setError(t(failure instanceof IncorrectCurrentPasswordError
        ? 'security.password.errorCurrentIncorrect' : 'emergencyKit.downloadFailed')),
    })
  }

  return (
    <ModalShell
      onClose={reveal.isPending ? undefined : onClose}
      ariaLabel={t('emergencyKit.dialogTitle')}
      title={t('emergencyKit.dialogTitle')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose} disabled={reveal.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="accent" size="sm" className="flex-[2]" type="submit" form="emergency-kit-password"
            disabled={!password || reveal.isPending}>
            {t('common.continue')}
          </Button>
        </DialogFooter>
      }
    >
      <form id="emergency-kit-password" onSubmit={submit}>
        <p className="mb-3 text-ui text-[var(--cv-t2)]">{t('emergencyKit.passwordPrompt')}</p>
        <SecretInput
          id="emergency-kit-current-password"
          label={t('security.password.currentLabel')}
          autoComplete="current-password"
          value={password}
          onChange={(next) => { setPassword(next); if (error) setError(null) }}
          shown={shown}
          onToggleShown={() => setShown((value) => !value)}
          disabled={reveal.isPending}
          error={error !== null}
        />
        <FeedbackSlot visible={error !== null} color="red">{error}</FeedbackSlot>
      </form>
    </ModalShell>
  )
}

function KitReady({ kit, onClose }: { kit: EmergencyKitMaterial; onClose: () => void }) {
  const { t } = useTranslation()
  const { download, downloading } = useEmergencyKitDownload(kit)

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={t('emergencyKit.dialogTitle')}
      title={t('emergencyKit.dialogTitle')}
      width={440}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" className="flex-1" onClick={onClose}>{t('common.close')}</Button>
          <Button variant="accent" size="sm" className="flex-[2]" disabled={downloading} onClick={() => void download()}>
            <Download size={14} /> {t('emergencyKit.download')}
          </Button>
        </DialogFooter>
      }
    >
      <EmergencyKitSummary kit={kit} surface="panel" />
      <p className="mt-3 text-meta text-[var(--cv-t3)]">{t('emergencyKit.storeSeparatelyBody')}</p>
    </ModalShell>
  )
}
