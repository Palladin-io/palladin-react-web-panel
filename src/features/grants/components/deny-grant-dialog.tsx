import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FieldFeedback } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { ModalShell } from '../../../shared/components/modal-shell'

const REASON_MAX_LEN = 500

export interface DenyGrantDialogProps {
  open: boolean
  targetLabel: string
  isPending: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/** Confirmation dialog for denying a pending grant, with an optional reason. */
export function DenyGrantDialog({
  open,
  targetLabel,
  isPending,
  onConfirm,
  onCancel,
}: DenyGrantDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)

  if (!open) return null
  const tooLong = reason.length > REASON_MAX_LEN

  function handleConfirm() {
    if (tooLong) {
      setReasonError(true)
      return
    }
    onConfirm(reason.trim())
  }

  return (
    <ModalShell
      onClose={isPending ? undefined : onCancel}
      ariaLabel={t('grants.deny.confirmTitle', { name: targetLabel })}
      title={t('grants.deny.confirmTitle', { name: targetLabel })}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('grants.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm} disabled={isPending || tooLong} className="flex-[2]">
            {isPending ? t('grants.deny.denying') : t('grants.deny.confirm')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('grants.deny.confirmText')}
        </p>

        <div className="-mb-4">
          <FormTextarea
            id="deny-reason"
            label={t('grants.deny.reasonLabel')}
            placeholder={t('grants.deny.reasonPlaceholder')}
            rows={3}
            value={reason}
            hasError={reasonError}
            disabled={isPending}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError(false)
            }}
            onBlur={() => setReasonError(reason.length > REASON_MAX_LEN)}
          />
          <FieldFeedback visible={reasonError} color="red">
            {t('grants.deny.reasonTooLong', { max: REASON_MAX_LEN })}
          </FieldFeedback>
        </div>

      </div>
    </ModalShell>
  )
}
