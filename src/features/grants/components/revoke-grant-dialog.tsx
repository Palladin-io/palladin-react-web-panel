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
  /** Label of the grant's target (agent name / entry) for the confirm copy. */
  targetLabel: string
  isPending: boolean
  /** Confirm with an optional reason (empty string = no reason). */
  onConfirm: (reason: string) => void
  onCancel: () => void
}

/**
 * Confirmation dialog for revoking a grant. Revoking is irreversible — the
 * agent loses access immediately — so it is gated behind an explicit confirm.
 * An optional reason (max 500 chars) is recorded in the audit log.
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
      ariaLabel={t('grants.revokeConfirmTitle', { name: targetLabel })}
      width={420}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-[15px] font-bold text-[var(--cv-t1)]">
          {t('grants.revokeConfirmTitle', { name: targetLabel })}
        </h2>
        <p className="text-[12px] text-[var(--cv-t2)]">
          {t('grants.revokeConfirmText')}
        </p>

        <div className="-mb-4">
          <FormTextarea
            id="revoke-reason"
            label={t('grants.revokeReasonLabel')}
            placeholder={t('grants.revokeReasonPlaceholder')}
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
            {t('grants.revokeReasonTooLong', { max: REASON_MAX_LEN })}
          </FieldFeedback>
        </div>

        <DialogFooter>
          <Button
            variant="subtle"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1"
          >
            {t('grants.cancel')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={handleConfirm}
            disabled={isPending || tooLong}
            className="flex-[2]"
          >
            {isPending ? t('grants.revoking') : t('grants.confirmRevoke')}
          </Button>
        </DialogFooter>
      </div>
    </ModalShell>
  )
}
