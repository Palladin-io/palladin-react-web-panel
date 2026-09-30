import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { AppWordmark } from '../../../shared/components/app-wordmark'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { DialogSurface } from '../../../shared/components/dialog-surface'
import { SecretInput } from '../../../shared/components/secret-input'
import { CopyButton } from '../../../shared/components/copy-button'
import { ModalShell } from '../../../shared/components/modal-shell'
import { Icon } from '../../../shared/components/icon'
import type { EntryShareField } from '../../../shared/crypto/entry-share'
import { EntryIcon } from '../components/entry-icon'
import { normalizeEntryType } from '../../../shared/types/entry-type'
import { sharingFieldLabel } from './sharing-field-label'
import { shareExpiryLabel } from './share-expiry-label'
import { RecipientProofForm } from './recipient-proof-form'
import { useShareReception } from './use-share-reception'
import { useAuthStore } from '../../auth'
import { PERMISSION_VAULT_MANAGE } from '../../../shared/lib/permissions'
import { SaveShareCopyDialog } from './save-share-copy-dialog'
import type { SavedShareCopy } from './use-save-share-copy'
import { readEntryShareIngressVersion, subscribePendingEntryShare } from '../../../shared/lib/entry-share-ingress'
import { mobilePlatform, mobileStoreLink } from '../../../shared/lib/mobile-store-link'
import { env } from '../../../shared/lib/env'

interface EntryShareReceiverPageProps {
  shareId: string
  onContinueToAccount?: (target: 'login' | 'register' | 'unlock' | 'verify-email') => void | Promise<void>
  onSavedToEntry?: (entry: SavedShareCopy) => void | Promise<void>
}

export function EntryShareReceiverPage(props: EntryShareReceiverPageProps) {
  const version = useSyncExternalStore(subscribePendingEntryShare, () => readEntryShareIngressVersion(props.shareId))
  return <ScopedReceiver key={`${props.shareId}:${version}`} {...props} />
}

function ScopedReceiver({ shareId, onContinueToAccount, onSavedToEntry }: EntryShareReceiverPageProps) {
  const { t, i18n } = useTranslation()
  const reception = useShareReception(shareId)
  const storeLink = mobileStoreLink(mobilePlatform(navigator.userAgent, navigator.maxTouchPoints),
    env.appleAppStoreUrl, env.googlePlayStoreUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const hasAccount = useAuthStore((auth) => !!auth.accessToken || !!auth.refreshToken)
  const emailVerified = useAuthStore((auth) => auth.emailVerified)
  const canSave = useAuthStore((auth) => !auth.isVaultLocked && !!auth.userId && !!auth.privateKey
    && !!auth.accessToken && auth.emailVerified && (auth.permissions & PERMISSION_VAULT_MANAGE) !== 0)
  const confirmDisplay = useEffectEvent(() => { void reception.confirmDisplay() })
  useEffect(() => {
    if (reception.snapshot && reception.phase === 'received') confirmDisplay()
  }, [reception.snapshot, reception.phase])

  const attempted = useRef(new Set<string>())
  const advanceReception = useEffectEvent(() => {
    const step = reception.phase === 'welcome' ? 'open'
      : canSave && reception.recipientMode === 'namedRecipient' && !reception.emailVerified ? 'account'
        : reception.canReceive ? 'receive' : null
    if (!step || attempted.current.has(step)) return
    attempted.current.add(step)
    if (step === 'open') void perform(reception.open())
    // A different account retains the ordinary OTP path without claiming that the email matched.
    else if (step === 'account') void reception.verifyAccount()
    else void perform(reception.receive())
  })
  useEffect(() => {
    if (!reception.busy && (reception.phase === 'welcome' || reception.phase === 'verification')) advanceReception()
  }, [canSave, reception.busy, reception.phase, reception.emailVerified, reception.canReceive])

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
  const [clockNow, setClockNow] = useState(Date.now)
  useEffect(() => {
    if (!reception.shareExpiresAt) return
    const timer = setInterval(() => setClockNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [reception.shareExpiresAt])
  const expiryLabel = reception.shareExpiresAt ? shareExpiryLabel(reception.shareExpiresAt, i18n.language, clockNow) : null
  const otpWaiting = !reception.otpRetry && reception.otpRetryAfterSeconds > 0

  const received = reception.phase === 'received' && !!reception.snapshot
  const canContinueAccount = !!onContinueToAccount && !canSave
  const hasAction = available && ((reception.phase === 'welcome' && !reception.busy)
    || (reception.phase === 'verification' && supported)
    || (received && (canSave || canContinueAccount)))
  const accountTarget = !hasAccount ? 'register' : !emailVerified ? 'verify-email' : 'unlock'
  const linkPolicy = ongoing && (reception.shareExpiresAt || reception.maximumReceipts != null) ? <dl className="share-policy">
    {reception.shareExpiresAt ? <div className="share-received-row">
      <div><dt className="share-field-label">{t('sharing.receiver.expires')}</dt>
      <dd className="share-field-value">{expiryLabel ?? (Number.isFinite(Date.parse(reception.shareExpiresAt)) ? t('sharing.receiver.expired') : '—')}</dd></div>
    </div> : null}
    {reception.maximumReceipts != null ? <div className="share-received-row">
      <div><dt className="share-field-label">{t('sharing.receiptLimit')}</dt>
      <dd className="share-field-value">{reception.maximumReceipts}</dd></div>
    </div> : null}
  </dl> : null

  return <main className="entry-share-receiver auth-surface flex min-h-dvh items-center justify-center px-4 py-8">
    <div className="auth-logo-glow relative flex w-full max-w-[30rem] flex-col items-center">
      <DialogSurface width={480} surface="card" className="share-reception-card" title={<AppWordmark size="sharing" />} titleClassName="w-full"
        footer={<>
        {hasAction ? <DialogFooter>
          {reception.phase === 'welcome' ? <Button size="sm" variant="accent" className="min-w-0 flex-1" disabled={reception.busy}
            onClick={() => { void perform(reception.open()) }}>{t('sharing.receiver.open')}</Button> : null}
          {reception.phase === 'verification' && supported ? <Button size="sm" variant="accent" className="min-w-0 flex-1"
            disabled={reception.busy || !reception.canReceive} onClick={() => { void perform(reception.receive()) }}>{t('sharing.receiver.receive')}</Button> : null}
          {received && canSave ? <Button size="sm" variant="accent" className="min-w-0 flex-1" disabled={saved || reception.busy}
            onClick={() => setSaving(true)}>{t(saved ? 'sharing.copy.saved' : 'sharing.copy.save')}</Button> : null}
          {received && canContinueAccount ? <Button size="sm" variant="accent" className="min-w-0 flex-1" disabled={reception.busy}
            onClick={() => { void continueToAccount(accountTarget) }}>
            {t(!hasAccount ? 'sharing.receiver.saveToPalladin' : !emailVerified ? 'sharing.receiver.verifyAccount' : 'sharing.receiver.unlock')}
          </Button> : null}
        </DialogFooter> : null}
        <aside className="share-product-footer">
          <p>{t('sharing.receiver.productTitle')}</p>
          <a href="https://palladin.io/" target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            {t('sharing.receiver.aboutPalladin')}<Icon name="north_east" size={14} />
          </a>
        </aside>
        {storeLink ? <aside className="px-5 pb-5 text-meta text-[var(--cv-t2)]">
          <a href={storeLink} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="text-[var(--cv-t1)] transition-colors hover:text-[var(--cv-primary)] focus-visible:underline">
            {t('sharing.receiver.downloadApp')}
          </a>
          <p className="mt-2 leading-relaxed">{t(received
            ? saved ? 'sharing.receiver.installAfterSave' : 'sharing.receiver.installAfterReceipt'
            : 'sharing.receiver.installBeforeReceipt')}</p>
        </aside> : null}
        </>}>
        <div className="flex w-full flex-col gap-3">
        {!available ? <p className="text-ui text-[var(--cv-t2)]">{t('sharing.receiver.unavailable')}</p> : <>
          {reception.phase === 'welcome' ? <>
            <p role="status" className="text-ui leading-relaxed text-[var(--cv-t2)]">{t(reception.busy ? 'common.loading' : 'sharing.receiver.requestError')}</p>
          </> : null}
          {!received && linkPolicy ? <div className="share-received-data">{linkPolicy}</div> : null}
          {ongoing && !supported ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.unsupported')}</p> : null}
          {reception.phase === 'verification' && supported ? <>
            {reception.recipientMode === 'namedRecipient' ? <>
              {reception.emailVerified ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.emailVerified')}</p> : <>
                <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.otpNotice')}</p>
                <Button size="sm" variant="subtle" disabled={reception.busy || otpWaiting} onClick={() => {
                  void perform(reception.requestOtp(i18n.language.startsWith('pl') ? 'pl' : 'en'))
                }}>{otpWaiting ? t('sharing.receiver.otpCountdown', { seconds: reception.otpRetryAfterSeconds })
                  : t(reception.otpRetry ? 'sharing.receiver.retryOtp' : reception.otpRequested ? 'sharing.receiver.resendOtp' : 'sharing.receiver.sendOtp')}</Button>
                {reception.otpRequested && !reception.otpRetry ? <RecipientProofForm kind="otp" disabled={reception.busy}
                  onVerify={(code) => perform(reception.verifyOtp(code))} /> : null}
              </>}
            </> : null}
            {reception.protection === 'password' || reception.protection === 'pin' ? <>
              {!reception.secretVerified ? <p className="text-ui text-[var(--cv-t1)]">{t(reception.protection === 'pin' ? 'sharing.receiver.pinPrompt' : 'sharing.receiver.passwordPrompt')}</p> : null}
              {reception.secretVerified ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.receiver.secretVerified')}</p> :
                <RecipientProofForm kind={reception.protection} disabled={reception.busy} onVerify={(secret) => perform(reception.verifySecret(secret))} />}
            </> : null}
          </> : null}
          {reception.snapshot ? <>
            <div className="share-received-data">
            <div className="share-received-identity">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <EntryIcon icon={null} type={normalizeEntryType(reception.snapshot.entryType)} />
                <h2 className="min-w-0 flex-1 break-words text-heading-sm font-semibold text-[var(--cv-t1)]">{reception.snapshot.title}</h2>
              </div>
              <p className="share-field-label">{t(`sharing.type.${reception.snapshot.entryType}`)}</p>
            </div>
            <div>
              {reception.snapshot.fields.map((field) => <ReceivedField key={field.id} field={field} />)}
            </div>
            {received ? linkPolicy : null}
            </div>
            {reception.phase === 'received' ? <>
              {reception.confirmation === 'failed' ? <p role="status" className="text-meta text-[var(--cv-t3)]">{t('sharing.receiver.confirmation.failed')}</p> : null}
              {reception.confirmation === 'failed' ? <Button size="sm" variant="subtle" disabled={reception.busy}
                onClick={() => { void perform(reception.confirmDisplay()) }}>{t('sharing.receiver.retryConfirmation')}</Button> : null}
            </> : null}
          </> : null}
          {received && canContinueAccount ? <p className="text-meta leading-relaxed text-[var(--cv-t2)]">
            {t('sharing.receiver.keepTabOpen')}
          </p> : null}
          {received && saved ? <p role="status" className="text-meta leading-relaxed text-[var(--cv-t2)]">
            {t('sharing.receiver.syncAfterSave')}
          </p> : null}
        </>}
        </div>
      </DialogSurface>
      <footer className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-micro text-[var(--cv-auth-muted)]">
        {[
          ['sharing.receiver.privacy', 'https://palladin.io/privacy/'],
          ['sharing.receiver.terms', 'https://palladin.io/terms/'],
        ].map(([label, href]) => <a key={label} href={href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
          className="underline-offset-4 transition-colors hover:text-[var(--cv-t1)] hover:underline focus-visible:underline">{t(label)}</a>)}
      </footer>
    </div>
    {saving && canSave && reception.snapshot ? <SaveShareCopyDialog snapshot={reception.snapshot}
      onClose={() => setSaving(false)} onSaved={(entry) => {
        setSaved(true); setSaving(false)
        if (onSavedToEntry) void Promise.resolve(onSavedToEntry(entry)).catch(() => {
          toast.error(t('sharing.copy.openSavedError'))
        })
      }} /> : null}
  </main>
}

function ReceivedField({ field }: { field: EntryShareField }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const label = sharingFieldLabel(field, t)
  const concealed = field.type !== 'text'
  return <div data-share-field className="share-received-row">
    <div className="min-w-0">
    <span className="share-field-label">{label}</span>
    <SecretInput id={`received-${field.id}`} label={label} labelClassName="sr-only" value={field.value} onChange={() => undefined} readOnly appearance="display"
      shown={field.type === 'multiline' ? false : concealed ? shown : !shown} onToggleShown={() => setShown(!shown)} copyable copyFeedback clearCopiedSecret={false} />
    </div>
    {shown && field.type === 'multiline' ? <ModalShell ariaLabel={label} title={label} onClose={() => setShown(false)} trapFocus
      footer={<DialogFooter><Button size="sm" variant="subtle" className="flex-1" onClick={() => setShown(false)}>{t('common.close')}</Button>
        <CopyButton value={field.value} feedback label={t('common.copy')} />
      </DialogFooter>}>
      <pre className={`ph-no-capture whitespace-pre-wrap break-words text-ui text-[var(--cv-t1)] ${field.id === 'script.source' ? 'font-mono' : 'font-sans'}`}>{field.value}</pre>
    </ModalShell> : null}
    {field.type === 'totp' ? <p className="col-span-2 text-meta text-[var(--cv-t3)]">{t('sharing.receiver.totpNotice')}</p> : null}
  </div>
}
