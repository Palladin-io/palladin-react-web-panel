import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { FieldFeedback, FormInput } from '../../../../shared/components/form-field'
import { WarningZone } from '../../../../shared/components/warning-zone'
import { useTotpEnrollment } from '../../hooks/use-totp'

export interface TotpDisableDialogProps {
  open: boolean
  onClose: () => void
}

/** Confirm-with-code dialog for turning off two-factor authentication. */
export function TotpDisableDialog({ open, onClose }: TotpDisableDialogProps) {
  const { t } = useTranslation()
  const { disable } = useTotpEnrollment()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const codeValid = /^\d{6}$/.test(code.trim())

  const handleDisable = () => {
    if (!codeValid) return
    setError(null)
    disable.mutate(code, {
      onSuccess: () => {
        toast.success(t('security.totp.disableSuccess'))
        setCode('')
        onClose()
      },
      onError: () => setError(t('security.totp.errorInvalidCode')),
    })
  }

  return (
    <ModalShell
      onClose={disable.isPending ? undefined : onClose}
      ariaLabel={t('security.totp.disableTitle')}
      title={t('security.totp.disableTitle')}
      width={420}
      footer={
        <DialogFooter>
          <Button
            variant="subtle"
            size="sm"
            onClick={onClose}
            disabled={disable.isPending}
            className="flex-1"
          >
            {t('common.close')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleDisable}
            disabled={!codeValid || disable.isPending}
            className="flex-[2]"
          >
            {disable.isPending ? t('security.totp.disabling') : t('security.totp.disableConfirm')}
          </Button>
        </DialogFooter>
      }
    >
      <WarningZone title={t('security.totp.disableWarningTitle')}>
        {t('security.totp.disableWarningBody')}
      </WarningZone>
      <div className="mt-3">
        <FormInput
          id="totp-disable-code"
          label={t('security.totp.disableCodeLabel')}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          monospace
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
            if (error) setError(null)
          }}
          placeholder={t('security.totp.codePlaceholder')}
          disabled={disable.isPending}
          error={error !== null}
        />
        <FieldFeedback visible={error !== null} color="red">
          {error}
        </FieldFeedback>
      </div>
    </ModalShell>
  )
}
