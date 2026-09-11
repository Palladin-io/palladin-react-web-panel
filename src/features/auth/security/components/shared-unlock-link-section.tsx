import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../../shared/components/button'
import { ModalShell } from '../../../../shared/components/modal-shell'
import { DialogFooter } from '../../../../shared/components/dialog-footer'
import { useSharedUnlockLink } from '../use-shared-unlock-link'

export function SharedUnlockLinkSection() {
  const { t } = useTranslation(), { configured, link, act } = useSharedUnlockLink()
  const [confirm, setConfirm] = useState<{ action: 'disconnect' | 'reconnect'; linkId: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const marker = link.data, disconnected = Boolean(marker?.disconnectId)
  const action = disconnected ? 'reconnect' : 'disconnect'
  const label = t('security.sharedUnlock.link.' + action)
  const submit = () => {
    if (!confirm || busy) return
    setBusy(true)
    void act(confirm.action, confirm.linkId).catch(() => toast.error(t('security.sharedUnlock.link.failed')))
      .finally(() => { setBusy(false); setConfirm(null); void link.refetch() })
  }
  return <div className="mt-4 border-t border-[var(--cv-divider)] pt-4">
    <h3 className="text-ui font-semibold text-[var(--cv-t1)]">{t('security.sharedUnlock.link.title')}</h3>
    <p role="status" className="mt-1 text-ui text-[var(--cv-t3)]">{t(!configured ? 'security.sharedUnlock.link.unavailable'
      : link.isPending ? 'security.sharedUnlock.loading' : link.isError ? 'security.sharedUnlock.link.failed'
        : !marker ? 'security.sharedUnlock.link.missing' : disconnected ? 'security.sharedUnlock.link.disconnected' : 'security.sharedUnlock.link.saved')}</p>
    {marker && <Button className="mt-3" variant="subtle" size="sm" disabled={busy}
      onClick={() => setConfirm({ action, linkId: marker.linkId })}>{label}</Button>}
    {link.isError && <Button className="mt-3" variant="subtle" size="sm" onClick={() => { void link.refetch() }}>{t('security.sharedUnlock.retry')}</Button>}
    {confirm && <ModalShell title={t('security.sharedUnlock.link.' + confirm.action)} ariaLabel={t('security.sharedUnlock.link.' + confirm.action)}
      trapFocus onClose={busy ? undefined : () => setConfirm(null)} footer={<DialogFooter>
        <Button variant="subtle" size="sm" className="flex-1" disabled={busy} onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
        <Button variant={confirm.action === 'disconnect' ? 'danger' : 'accent'} size="sm" className="flex-[2]" disabled={busy} onClick={submit}>
          {t('security.sharedUnlock.link.' + confirm.action)}</Button>
      </DialogFooter>}>
      <p className="text-ui text-[var(--cv-t2)]">{t('security.sharedUnlock.link.' + confirm.action + 'Confirm')}</p>
    </ModalShell>}
  </div>
}
