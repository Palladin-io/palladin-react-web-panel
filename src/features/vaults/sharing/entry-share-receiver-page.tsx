import { useEffect, useEffectEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppWordmark } from '../../../shared/components/app-wordmark'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { SecretInput } from '../../../shared/components/secret-input'
import { FormTextarea } from '../../../shared/components/form-textarea'
import { CopyButton } from '../../../shared/components/copy-button'
import { EncryptionNotice } from '../../../shared/components/encryption-notice'
import type { EntryShareField } from '../../../shared/crypto/entry-share'
import { SectionHeader } from '../components/section-header'
import { sharingFieldLabel } from './sharing-field-label'
import { RecipientProofForm } from './recipient-proof-form'
import { useShareReception } from './use-share-reception'
import { useAuthStore } from '../../auth'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { SaveShareCopyDialog } from './save-share-copy-dialog'

interface EntryShareReceiverPageProps {
  shareId: string
  onContinueToAccount?: (target: 'login' | 'register' | 'unlock' | 'verify-email') => void | Promise<void>
}

export function EntryShareReceiverPage(props: EntryShareReceiverPageProps) {
  return <ScopedReceiver key={props.shareId} {...props} />
}

function ScopedReceiver({ shareId, onContinueToAccount }: EntryShareReceiverPageProps) {
  const { t, i18n } = useTranslation()
  const reception = useShareReception(shareId)
  const [ending, setEnding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const hasAccount = useAuthStore((auth) => !!auth.accessToken || !!auth.refreshToken)
  const locked = useAuthStore((auth) => auth.isVaultLocked)
  const emailVerified = useAuthStore((auth) => auth.emailVerified)
  const canSave = useAuthStore((auth) => !auth.isVaultLocked && !!auth.userId && !!auth.privateKey
    && !!auth.accessToken && auth.emailVerified && (auth.permissions & PERMISSION_VAULT_MANAGE) !== 0)
  const confirmDisplay = useEffectEvent(() => { void reception.confirmDisplay() })
  useEffect(() => {
    if (reception.snapshot && reception.phase === 'received') confirmDisplay()
  }, [reception.snapshot, reception.phase])

  async function perform(outcome: Promise<'ok' | 'failed' | 'cancelled'>) {
    if (await outcome === 'failed') toast.error(t('sharing.receiver.requestError'))
  }
  async function continueToAccount(target: 'login' | 'register' | 'unlock' | 'verify-email') {
    if (!onContinueToAccount || !reception.continueToAccount()) return
    try { await onContinueToAccount(target) }
    catch { reception.forget(); toast.error(t('sharing.receiver.requestError')) }
  }
  const available = reception.phase !== 'unavailable'
  const ongoing = reception.phase === 'verification' || reception.phase === 'received'
  const supported = ['namedRecipient', 'anyoneWithLink'].includes(reception.recipientMode)
    && ['none', 'password', 'pin'].includes(reception.protection)

  return <main className="auth-surface min-h-screen px-4 py-4">
    <div className="relative w-full max-w-[36rem]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <AppWordmark size="sm" />
        {available ? <Button size="sm" variant="subtle" onClick={reception.forget}>{t('sharing.receiver.forget')}</Button> : null}
      </header>
      <section className="flex flex-col gap-4 rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-4">
        <h1 className="text-heading font-semibold text-[var(--cv-t1)]">{t('sharing.receiver.title')}</h1>
        {!available ? <p className="text-ui text-[var(--cv-t2)]">{t('sharing.receiver.unavailable')}</p> : <>
          <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.guestNotice')}</p>
          {onContinueToAccount && (!hasAccount || locked || !emailVerified) ? <>
            <p className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.accountNotice')}</p>
            <div className="flex flex-wrap gap-2">
              {!hasAccount ? <>
                <Button size="sm" variant="subtle" disabled={reception.busy} onClick={() => { void continueToAccount('login') }}>{t('sharing.receiver.login')}</Button>
                <Button size="sm" variant="subtle" disabled={reception.busy} onClick={() => { void continueToAccount('register') }}>{t('sharing.receiver.register')}</Button>
              </> : <Button size="sm" variant="subtle" disabled={reception.busy}
                onClick={() => { void continueToAccount(!emailVerified ? 'verify-email' : 'unlock') }}>
                {t(!emailVerified ? 'sharing.receiver.verifyAccount' : 'sharing.receiver.unlock')}
              </Button>}
            </div>
          </> : null}
          {reception.phase === 'welcome' ? <>
            <p className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.openNotice')}</p>
            <Button size="sm" variant="accent" disabled={reception.busy} onClick={() => { void perform(reception.open()) }}>
              {t('sharing.receiver.open')}
            </Button>
          </> : null}
          {ongoing && !supported ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.unsupported')}</p> : null}
          {reception.phase === 'verification' && supported ? <>
            {reception.recipientMode === 'namedRecipient' ? <>
              <SectionHeader>{t('sharing.receiver.emailGate')}</SectionHeader>
              {reception.emailVerified ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.emailVerified')}</p> : <>
                <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.otpNotice')}</p>
                <Button size="sm" variant="subtle" disabled={reception.busy} onClick={() => {
                  void perform(reception.requestOtp(i18n.language.startsWith('pl') ? 'pl' : 'en'))
                }}>{t(reception.otpRetry ? 'sharing.receiver.retryOtp' : reception.otpRequested ? 'sharing.receiver.resendOtp' : 'sharing.receiver.sendOtp')}</Button>
                {reception.otpRequested && !reception.otpRetry ? <RecipientProofForm kind="otp" disabled={reception.busy}
                  onVerify={(code) => perform(reception.verifyOtp(code))} /> : null}
              </>}
            </> : null}
            {reception.protection === 'password' || reception.protection === 'pin' ? <>
              <SectionHeader>{t('sharing.additionalProtection')}</SectionHeader>
              {reception.secretVerified ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.secretVerified')}</p> :
                <RecipientProofForm kind={reception.protection} disabled={reception.busy} onVerify={(secret) => perform(reception.verifySecret(secret))} />}
            </> : null}
            <p className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.receiveNotice')}</p>
            <Button size="sm" variant="accent" disabled={reception.busy || !reception.canReceive} onClick={() => { void perform(reception.receive()) }}>
              {t('sharing.receiver.receive')}
            </Button>
          </> : null}
          {reception.snapshot ? <>
            <EncryptionNotice>{t('sharing.receiver.decrypted')}</EncryptionNotice>
            <h2 className="break-words text-heading-sm font-semibold text-[var(--cv-t1)]">{reception.snapshot.title}</h2>
            {reception.snapshot.fields.map((field) => <ReceivedField key={field.id} field={field} />)}
            <p className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.copyNotice')}</p>
            {canSave ? <Button size="sm" variant="accent" disabled={saved || reception.busy} onClick={() => setSaving(true)}>
              {t(saved ? 'sharing.copy.saved' : 'sharing.copy.save')}
            </Button> : null}
            {reception.phase === 'received' ? <>
              <p role="status" className="text-meta text-[var(--cv-t3)]">{t(`sharing.receiver.confirmation.${reception.confirmation}`)}</p>
              {reception.confirmation === 'failed' ? <Button size="sm" variant="subtle" disabled={reception.busy}
                onClick={() => { void perform(reception.confirmDisplay()) }}>{t('sharing.receiver.retryConfirmation')}</Button> : null}
            </> : null}
          </> : null}
          {reception.phase === 'ended' ? <p role="status" className="text-ui text-[var(--cv-t2)]">{t('sharing.receiver.ended')}</p> : null}
          {ongoing && reception.canReceive ? <Button size="sm" variant="danger" disabled={reception.busy} onClick={() => setEnding(true)}>
            {t('sharing.receiver.end')}
          </Button> : null}
        </>}
      </section>
    </div>
    {saving && canSave && reception.snapshot ? <SaveShareCopyDialog snapshot={reception.snapshot}
      onClose={() => setSaving(false)} onSaved={() => { setSaved(true); setSaving(false) }} /> : null}
    {ending && ongoing ? <ModalShell title={t('sharing.receiver.end')} ariaLabel={t('sharing.receiver.end')} trapFocus
      onClose={reception.busy ? undefined : () => setEnding(false)} footer={<DialogFooter>
        <Button size="sm" variant="subtle" className="flex-1" disabled={reception.busy} onClick={() => setEnding(false)}>{t('sharing.cancel')}</Button>
        <Button size="sm" variant="danger" className="flex-[2]" disabled={reception.busy} onClick={() => { void perform(reception.end()) }}>
          {t('sharing.receiver.end')}
        </Button>
      </DialogFooter>}>
      <p className="text-ui text-[var(--cv-t2)]">{t('sharing.receiver.endNotice')}</p>
    </ModalShell> : null}
  </main>
}

function ReceivedField({ field }: { field: EntryShareField }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const label = sharingFieldLabel(field, t)
  return <div className="flex flex-col gap-2">
    {shown && field.type === 'multiline' ? <>
      <FormTextarea id={`received-full-${field.id}`} label={label} value={field.value} readOnly rows={6} monospace={field.id === 'script.source'} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="subtle" onClick={() => setShown(false)}>{t('vault.entry.hide')}</Button>
        <CopyButton value={field.value} secret />
      </div>
    </> : <SecretInput id={`received-${field.id}`} label={label} value={field.value} onChange={() => undefined} readOnly
      shown={shown} onToggleShown={() => setShown(!shown)} copyable />}
    {field.type === 'totp' ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.totpNotice')}</p> : null}
  </div>
}
