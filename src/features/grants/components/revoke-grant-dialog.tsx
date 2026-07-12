import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FieldFeedback } from '../../../shared/components/form-field'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { ModalShell } from '../../../shared/components/modal-shell'

const REASON_MAX_LEN = 500

export interface RevokeGrantDialogProps {
  open: boolean
  targetLabel: string
  isPending: boolean
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/**
 * Confirmation dialog for revoking an active grant, with an optional reason.
 * Revoking is immediate and irreversible — the agent loses access at once.
 */
export function RevokeGrantDialog({
  open,
  targetLabel,
  isPending,
  onConfirm,
  onCancel,
}: RevokeGrantDialogProps) {
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
      ariaLabel={t('grants.revoke.confirmTitle', { name: targetLabel })}
      title={t('grants.revoke.confirmTitle', { name: targetLabel })}
      width={420}
      footer={
        <DialogFooter>
          <Button variant="subtle" size="sm" onClick={onCancel} disabled={isPending} className="flex-1">
            {t('grants.cancel')}
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm} disabled={isPending || tooLong} className="flex-[2]">
            {isPending ? t('grants.revoke.revoking') : t('grants.revoke.confirm')}
          </Button>
        </DialogFooter>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-ui text-[var(--cv-t2)]">
          {t('grants.revoke.confirmText')}
        </p>

        <div className="-mb-4">
          <FormTextarea
            id="revoke-reason"
            label={t('grants.revoke.reasonLabel')}
            placeholder={t('grants.revoke.reasonPlaceholder')}
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
            {t('grants.revoke.reasonTooLong', { max: REASON_MAX_LEN })}
          </FieldFeedback>
        </div>

      </div>
    </ModalShell>
  )
}
