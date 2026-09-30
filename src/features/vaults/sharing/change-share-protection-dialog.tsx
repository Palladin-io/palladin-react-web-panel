import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FeedbackSlot } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SecretInput } from '../../../shared/components/secret-input'
import { changeEntryShareProtection, type ShareProtection } from './sharing-api'
import { initialSharingForm, sharingFieldInvalid } from './sharing-form'
import type { ShareSourceScope } from './use-share-creation'

interface Props {
  scope: ShareSourceScope
  shareId: string
  protection: ShareProtection
  isCurrent: () => boolean
  onClose: () => void
  onChanged: () => void
}

export function ChangeShareProtectionDialog({ scope, shareId, protection: initialProtection, isCurrent, onClose, onChanged }: Props) {
  const { t } = useTranslation()
  const [protection, setProtection] = useState(initialProtection)
  const [secret, setSecret] = useState('')
  const [shown, setShown] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [confirmationInvalid, setConfirmationInvalid] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const owner = useRef<AbortController | null>(null)
  const closeOwner = useRef(onClose)
  const pending = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    owner.current = controller
    const retire = () => { controller.abort(); setSecret(''); setConfirmation(''); setShown(false); setBusy(true); closeOwner.current() }
    window.addEventListener('pagehide', retire)
    return () => { controller.abort(); window.removeEventListener('pagehide', retire) }
  }, [])
  const secretInvalid = () => sharingFieldInvalid({ ...initialSharingForm, protection, protectionSecret: secret }, 'protectionSecret')
  const valid = !secretInvalid() && (protection !== 'none' ? confirmation === secret : initialProtection !== 'none')
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const controller = owner.current
    if (!controller || controller.signal.aborted || !isCurrent() || pending.current || !valid) return
    pending.current = true; setBusy(true)
    const current = () => !controller.signal.aborted && isCurrent()
    try {
      await changeEntryShareProtection(scope.vaultId, scope.entryId, shareId, protection,
        protection === 'none' ? null : secret, controller.signal)
      if (!current()) return
      setSecret(''); setConfirmation(''); toast.success(t('sharing.protectionChanged')); onChanged()
    } catch { if (current()) toast.error(t('sharing.protectionChangeError')) }
    finally { pending.current = false; if (current()) setBusy(false) }
  }
  return <ModalShell title={t('sharing.changeProtection')} ariaLabel={t('sharing.changeProtection')} trapFocus
    onClose={busy ? undefined : onClose} footer={<DialogFooter>
      <Button size="sm" variant="subtle" className="flex-1" disabled={busy} onClick={onClose}>{t('sharing.cancel')}</Button>
      <Button size="sm" variant="accent" className="flex-[2]" type="submit" form="share-protection-form" disabled={busy || !valid}>{t('sharing.saveProtection')}</Button>
    </DialogFooter>}>
    <form id="share-protection-form" onSubmit={(event) => { void submit(event) }} className="flex flex-col gap-3">
      <p className="text-ui text-[var(--cv-t2)]">{t('sharing.protectionChangeNotice')}</p>
      <FormSelect id="share-protection-kind" label={t('sharing.additionalProtection')} value={protection} disabled={busy}
        onChange={(event) => { setProtection(event.target.value as ShareProtection); setSecret(''); setConfirmation(''); setShown(false); setInvalid(false); setConfirmationInvalid(false) }}>
        {(['none', 'password', 'pin'] as const).map((value) => <option key={value} value={value}>{t(`sharing.${value}`)}</option>)}
      </FormSelect>
      {protection !== 'none' ? <div>
        <SecretInput id="share-new-protection-secret" label={t(`sharing.${protection}`)} value={secret} disabled={busy}
          shown={shown} onToggleShown={() => setShown(!shown)} onChange={(value) => { setSecret(value); setInvalid(false) }}
          onBlur={() => setInvalid(secretInvalid())} />
        <FeedbackSlot visible={invalid} color="red">{t(protection === 'pin' ? 'sharing.invalidPin' : 'sharing.invalidPassword')}</FeedbackSlot>
        <SecretInput id="share-confirm-protection-secret" label={t('sharing.confirmSecret')} value={confirmation} disabled={busy}
          shown={shown} onToggleShown={() => setShown(!shown)} onChange={(value) => { setConfirmation(value); setConfirmationInvalid(false) }}
          onBlur={() => setConfirmationInvalid(confirmation !== secret)} />
        <FeedbackSlot visible={confirmationInvalid} color="red">{t('sharing.secretMismatch')}</FeedbackSlot>
      </div> : null}
      {protection === 'pin' ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.pinWarning')}</p> : null}
    </form>
  </ModalShell>
}
