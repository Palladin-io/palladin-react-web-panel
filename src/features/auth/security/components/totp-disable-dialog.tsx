import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { FeedbackSlot, FieldFeedback, FormInput } from '../../../../shared/components/form-field'
import { WarningZone } from '../../../../shared/components/warning-zone'
import { IncorrectCurrentPasswordError } from '../../hooks/use-change-master-password'
import { useTotpEnrollment } from '../../hooks/use-totp'

export interface TotpDisableDialogProps {
  open: boolean
  onClose: () => void
}

/** Confirm-with-password-and-code dialog for turning off two-factor authentication. */
export function TotpDisableDialog({ open, onClose }: TotpDisableDialogProps) {
  const { t } = useTranslation()
  const { disable } = useTotpEnrollment()
  const [currentPassword, setCurrentPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const codeValid = /^\d{6}$/.test(code.trim())

  const handleDisable = () => {
    if (!codeValid || !currentPassword) return
    setError(null)
    setPasswordError(null)
    disable.mutate({ code, currentPassword }, {
      onSuccess: () => {
        toast.success(t('security.totp.disableSuccess'))
        setCurrentPassword('')
        setCode('')
        onClose()
      },
      onError: (err) => {
        if (err instanceof IncorrectCurrentPasswordError) {
          setPasswordError(t('security.password.errorCurrentIncorrect'))
        } else {
          setError(t('security.totp.errorInvalidCode'))
        }
      },
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
            disabled={!codeValid || !currentPassword || disable.isPending}
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
          id="totp-disable-password"
          label={t('security.password.currentLabel')}
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value)
            if (passwordError) setPasswordError(null)
          }}
          placeholder={t('security.password.currentPlaceholder')}
          disabled={disable.isPending}
          error={passwordError !== null}
        />
        <FeedbackSlot visible={passwordError !== null} color="red">
          {passwordError}
        </FeedbackSlot>
      </div>
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
