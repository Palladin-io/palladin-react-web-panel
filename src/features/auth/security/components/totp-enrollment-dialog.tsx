import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Download } from 'lucide-react'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { FieldFeedback, FormInput } from '../../../../shared/components/form-field'
import { QrCode } from '../../../../shared/components/qr-code'
import { useTotpEnrollment } from '../../hooks/use-totp'

export interface TotpEnrollmentDialogProps {
  open: boolean
  onClose: () => void
}

/**
 * Two-step TOTP enrollment: scan the QR (or enter the secret) and confirm a
 * code, then view the one-time recovery codes exactly once. The recovery codes
 * are shown only in this dialog — the server keeps only their hashes — so the
 * "Done" action is deliberately the sole way out of the recovery step.
 */
export function TotpEnrollmentDialog({ open, onClose }: TotpEnrollmentDialogProps) {
  const { t } = useTranslation()
  const { enroll, confirm } = useTotpEnrollment()

  const [step, setStep] = useState<'setup' | 'recovery'>('setup')
  const [code, setCode] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch a fresh secret once on mount. The parent conditionally mounts this
  // dialog per open, so local state is always fresh — no reset-on-close needed.
  // The ref guards against StrictMode's double-invoke.
  const enrollMutate = enroll.mutate
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    enrollMutate()
  }, [enrollMutate])

  if (!open) return null

  const codeValid = /^\d{6}$/.test(code.trim())

  const handleConfirm = () => {
    if (!codeValid) return
    setConfirmError(null)
    confirm.mutate(code, {
      onSuccess: (data) => {
        setRecoveryCodes(data.recoveryCodes)
        setStep('recovery')
      },
      onError: () => setConfirmError(t('totpEnroll.errorInvalidCode')),
    })
  }

  const handleCopyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy recovery codes', error)
    }
  }

  const handleDownloadRecovery = () => {
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'palladin-2fa-recovery-codes.txt'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (step === 'recovery') {
    return (
      <ModalShell
        ariaLabel={t('totpEnroll.recoveryTitle')}
        title={t('totpEnroll.recoveryTitle')}
        width={440}
        footer={
          <DialogFooter>
            <Button variant="accent" size="sm" onClick={onClose} className="flex-1">
              {t('totpEnroll.done')}
            </Button>
          </DialogFooter>
        }
      >
        <p className="mb-3 text-[12px] text-[var(--cv-t2)]">
          {t('totpEnroll.recoverySubtitle')}
        </p>
        <ol className="ph-no-capture grid grid-cols-2 gap-2 rounded-lg border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3">
          {recoveryCodes.map((rc) => (
            <li key={rc} className="font-mono text-[12px] text-[var(--cv-t1)]">
              {rc}
            </li>
          ))}
        </ol>
        <div className="mt-3 flex gap-2">
          <Button
            variant="subtle"
            size="sm"
            onClick={handleCopyRecovery}
            className="flex-1"
          >
            {copied ? (
              <>
                <Check size={14} /> {t('totpEnroll.copied')}
              </>
            ) : (
              <>
                <Copy size={14} /> {t('totpEnroll.copyCodes')}
              </>
            )}
          </Button>
          <Button variant="subtle" size="sm" onClick={handleDownloadRecovery} className="flex-1">
            <Download size={14} /> {t('totpEnroll.downloadCodes')}
          </Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell
      onClose={confirm.isPending ? undefined : onClose}
      ariaLabel={t('totpEnroll.setupTitle')}
      title={t('totpEnroll.setupTitle')}
      width={440}
      footer={
        <DialogFooter>
          <Button
            variant="subtle"
            size="sm"
            onClick={onClose}
            disabled={confirm.isPending}
            className="flex-1"
          >
            {t('common.close')}
          </Button>
          <Button
            variant="accent"
            size="sm"
            onClick={handleConfirm}
            disabled={!codeValid || confirm.isPending || !enroll.data}
            className="flex-[2]"
          >
            {confirm.isPending ? t('totpEnroll.enabling') : t('totpEnroll.enable')}
          </Button>
        </DialogFooter>
      }
    >
      {enroll.isError ? (
        <p className="text-[12px] text-[var(--cv-primary)]">{t('totpEnroll.errorEnroll')}</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <p className="text-center text-[12px] text-[var(--cv-t2)]">
            {t('totpEnroll.setupSubtitle')}
          </p>

          {enroll.data ? (
            <QrCode value={enroll.data.otpauthUri} alt={t('totpEnroll.qrAlt')} />
          ) : (
            <div className="h-44 w-44 animate-pulse rounded-lg bg-[var(--cv-card-bg)]" />
          )}

          {enroll.data && (
            <div className="w-full">
              <p className="mb-1 text-center text-[11px] text-[var(--cv-t3)]">
                {t('totpEnroll.manualEntry')}
              </p>
              <FormInput
                id="totp-secret"
                label={t('totpEnroll.secretLabel')}
                labelClassName="sr-only"
                value={enroll.data.secret}
                readOnly
                monospace
                copyable
                copyLabel={t('totpEnroll.copySecret')}
              />
            </div>
          )}

          <div className="w-full">
            <FormInput
              id="totp-confirm-code"
              label={t('totpEnroll.codeLabel')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              monospace
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                if (confirmError) setConfirmError(null)
              }}
              placeholder={t('totpEnroll.codePlaceholder')}
              disabled={confirm.isPending || !enroll.data}
              error={confirmError !== null}
            />
            <FieldFeedback visible={confirmError !== null} color="red">
              {confirmError}
            </FieldFeedback>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
