import { useTranslation } from 'react-i18next'
import { Ban, Check, Timer } from 'lucide-react'
import { Button } from '../../../../shared/components/button'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { QrCode } from '../../../../shared/components/qr-code'
import { useCountdown } from '../../../../shared/hooks/use-countdown'
import { useAddPhoneTransfer } from '../../hooks/use-add-phone-transfer'

export interface AddPhoneDialogProps {
  accountId: string
  onClose: () => void
}

/** `sender-shows-qr`: the new phone scans, both devices show a code, the user approves only on a match. */
export function AddPhoneDialog({ accountId, onClose }: AddPhoneDialogProps) {
  const { t } = useTranslation()
  const { state, approve, reject, restart } = useAddPhoneTransfer(accountId)
  const remaining = useCountdown(state.step === 'waiting' || state.step === 'compare' ? state.expiresAt : null)
  const busy = state.step === 'sending' || state.step === 'starting'

  const footer = state.step === 'compare' ? (
    <DialogFooter>
      <Button variant="subtle" size="sm" className="flex-1" onClick={reject}>{t('secretKey.addPhone.reject')}</Button>
      <Button variant="accent" size="sm" className="flex-[2]" onClick={() => void approve()}>
        <Check size={14} /> {t('secretKey.addPhone.approve')}
      </Button>
    </DialogFooter>
  ) : state.step === 'expired' || state.step === 'failed' || state.step === 'rejected' ? (
    <DialogFooter>
      <Button variant="subtle" size="sm" className="flex-1" onClick={onClose}>{t('common.close')}</Button>
      <Button variant="accent" size="sm" className="flex-[2]" onClick={() => void restart()}>{t('secretKey.newCode')}</Button>
    </DialogFooter>
  ) : (
    <DialogFooter>
      <Button variant={state.step === 'done' ? 'accent' : 'subtle'} size="sm" className="flex-1" onClick={onClose}
        disabled={state.step === 'sending'}>
        {state.step === 'done' ? t('secretKey.addPhone.done') : t('common.cancel')}
      </Button>
    </DialogFooter>
  )

  return (
    <ModalShell
      onClose={busy ? undefined : onClose}
      ariaLabel={t('secretKey.addPhone.title')}
      title={t('secretKey.addPhone.title')}
      width={440}
      footer={footer}
    >
      <div className="flex flex-col items-center gap-3 text-center" aria-live="polite">
        {state.step === 'waiting' && (
          <>
            <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.instructions')}</p>
            <QrCode value={state.qr} size={176} alt={t('secretKey.addPhone.qrAlt')} />
            <p className="text-meta text-[var(--cv-t2)]">{t('secretKey.addPhone.waiting')}</p>
          </>
        )}
        {state.step === 'compare' && (
          <>
            <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.compare')}</p>
            <p className="font-mono text-heading font-semibold tracking-wide text-[var(--cv-t1)]" data-testid="pairing-sas">
              {state.sas}
            </p>
          </>
        )}
        {(state.step === 'waiting' || state.step === 'compare') && remaining && (
          <p className="flex items-center gap-1 text-meta text-[var(--cv-t3)]">
            <Timer size={12} /> {t('secretKey.expiresIn', { time: remaining })}
          </p>
        )}
        {state.step === 'starting' && (
          <>
            <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.instructions')}</p>
            <div className="h-44 w-44 animate-pulse rounded-lg bg-[var(--cv-card-bg)]" role="status"
              aria-label={t('common.loading')} />
          </>
        )}
        {state.step === 'sending' && <p className="text-ui text-[var(--cv-t2)]">{t('common.loading')}</p>}
        {state.step === 'done' && (
          <>
            <Check size={24} className="text-[var(--cv-success)]" />
            <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.doneBody')}</p>
          </>
        )}
        {state.step === 'rejected' && (
          <>
            <Ban size={24} className="text-[var(--cv-t3)]" />
            <p className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.rejectedBody')}</p>
          </>
        )}
        {state.step === 'expired' && <p role="alert" className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.expired')}</p>}
        {state.step === 'failed' && <p role="alert" className="text-ui text-[var(--cv-t2)]">{t('secretKey.addPhone.failed')}</p>}
      </div>
    </ModalShell>
  )
}
