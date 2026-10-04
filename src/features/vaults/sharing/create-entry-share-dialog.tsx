import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { ModalShell } from '../../../shared/components/modal-shell'
import { ErrorState } from '../../../shared/components/error-state'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { FormInput, FeedbackSlot } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { SecretInput } from '../../../shared/components/secret-input'
import { ToggleSwitch } from '../../../shared/components/toggle-switch'
import { entryShareFields } from '../../../shared/crypto/entry-share-selection'
import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import { FormSection } from '../../../shared/components/form-section'
import { Icon } from '../../../shared/components/icon'
import { Tooltip } from '../../../shared/components/tooltip'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { fromMemberSecret } from '../../../shared/crypto/entry-draft'
import { EntryIcon } from '../components/entry-icon'
import { DEFAULT_VAULT_ICON } from '../components/vault-presentation'
import { useVault } from '../use-vault'
import { initialSharingForm, sharingFieldInvalid, sharingFormSchema, type SharingForm } from './sharing-form'
import { useShareCreation, type CreatedShareLink, type ShareSourceScope } from './use-share-creation'

interface CreateEntryShareDialogProps {
  scope: ShareSourceScope
  onClose: () => void
  onCreated: () => void
}

export function CreateEntryShareDialog({ scope, onClose, onCreated }: CreateEntryShareDialogProps) {
  const { t } = useTranslation()
  const creation = useShareCreation(scope, onCreated)
  if (creation.links.length) return <CreatedShareDialog links={creation.links} busy={creation.busy}
    retryPending={creation.retryPending} onRetry={() => { void creation.retry() }} onClose={onClose} />
  if (creation.source) return <SharingDraftDialog scope={scope} source={creation.source} creation={creation} onClose={onClose} />
  return <ModalShell title={t('sharing.create')} ariaLabel={t('sharing.create')} width={560} trapFocus
    onClose={onClose} footer={<DialogFooter><Button size="sm" variant="subtle" onClick={onClose} className="flex-1">{t('sharing.close')}</Button></DialogFooter>}>
    {creation.loadError ? <ErrorState message={t('sharing.loadError')} onRetry={creation.retryLoad} /> : <SkeletonBlock className="h-32" />}
  </ModalShell>
}

function SharingDraftDialog({ scope, source, creation, onClose }: {
  scope: ShareSourceScope
  source: MemberSecretV1
  creation: ReturnType<typeof useShareCreation>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { data: vault } = useVault(scope.vaultId)
  const presentation = useMemo(() => fromMemberSecret(source), [source])
  const { unsupported } = useMemo(() => entryShareFields(source), [source])
  const [form, setForm] = useState<SharingForm>(initialSharingForm)
  const [errors, setErrors] = useState<Partial<Record<keyof SharingForm, boolean>>>({})
  const [shown, setShown] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [confirmationError, setConfirmationError] = useState(false)
  const disabled = creation.busy || creation.retryPending
  const valid = sharingFormSchema.safeParse(form).success && unsupported.length === 0 &&
    (form.protection === 'none' || confirmation === form.protectionSecret)
  function change<K extends keyof SharingForm>(field: K, value: SharingForm[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: false }))
  }
  function blur(field: keyof SharingForm) {
    setErrors((current) => ({ ...current, [field]: sharingFieldInvalid(form, field) }))
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid && !creation.retryPending) return
    const result = await creation.submit(form)
    if (result === 'failed') toast.error(t('sharing.createError'))
    if (result === 'created') toast.success(t('sharing.created'))
  }
  return <ModalShell title={t('sharing.create')} ariaLabel={t('sharing.create')} width={560} trapFocus
    onClose={creation.busy ? undefined : onClose}
    footer={<DialogFooter>
      <Button size="sm" variant="subtle" className="flex-1" onClick={onClose} disabled={creation.busy}>{t('sharing.cancel')}</Button>
      <Button size="sm" variant="accent" className="flex-[2]" type="submit" form="create-entry-share"
        disabled={creation.busy || (!valid && !creation.retryPending)}>
        {t(creation.busy ? 'sharing.creating' : creation.retryPending ? 'sharing.retryCreation' : 'sharing.create')}
      </Button>
    </DialogFooter>}>
    <form id="create-entry-share" noValidate onSubmit={(event) => { void submit(event) }} className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-4 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <EntryIcon icon={presentation.iconReference} type={presentation.entryType} color={presentation.color} />
          <div className="min-w-0 flex-1 break-words text-heading-sm font-semibold text-[var(--cv-t1)]">{source.memberLabel}</div>
        </div>
        <div className="flex min-w-0 max-w-[40%] items-center gap-1.5 text-meta text-[var(--cv-t3)]">
          <Icon name={vault?.icon ?? DEFAULT_VAULT_ICON} size={14} className="shrink-0" />
          <Tooltip content={vault?.name ?? shortenKey(scope.vaultId)} className="min-w-0 truncate">{vault?.name ?? shortenKey(scope.vaultId)}</Tooltip>
        </div>
      </div>
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.snapshotNotice')}</p>
      {unsupported.length > 0 ? <p className="text-meta text-[var(--cv-t3)]">
        {t('sharing.unsupportedFields', { fields: unsupported.map((field) => field.label).join(', ') })}
      </p> : null}
      {source.entryType === 'script' ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.scriptNotice')}</p> : null}
      <div>
      <FormSection label={t('sharing.recipient')} error={errors.recipientEmail ? t('sharing.invalidEmail') : undefined} summary={form.recipientMode === 'anyoneWithLink'
        ? t('sharing.anyoneWithLink') : form.recipientEmail || t('sharing.namedRecipient')}>
      <FormSelect id="sharing-recipient-mode" label={t('sharing.recipientMode')} value={form.recipientMode} disabled={disabled}
        onChange={(event) => { change('recipientMode', event.target.value as SharingForm['recipientMode']); change('recipientEmail', '') }}>
        <option value="namedRecipient">{t('sharing.namedRecipient')}</option>
        <option value="anyoneWithLink">{t('sharing.anyoneWithLink')}</option>
      </FormSelect>
      {form.recipientMode === 'namedRecipient' ? <div>
        <FormInput id="sharing-email" label={t('sharing.email')} value={form.recipientEmail} autoComplete="off" inputMode="email"
          disabled={disabled} error={errors.recipientEmail} onChange={(event) => change('recipientEmail', event.target.value)} onBlur={() => blur('recipientEmail')} />
        <FeedbackSlot visible={!!errors.recipientEmail} color="red">{t('sharing.invalidEmail')}</FeedbackSlot>
        <p className="mt-2 text-meta text-[var(--cv-t3)]">{t('sharing.emailNotice')}</p>
        <p className="mt-2 text-meta text-[var(--cv-t3)]">{t('sharing.multipleEmailNotice')}</p>
      </div> : <p className="text-meta text-[var(--cv-t3)]">{t('sharing.anyoneWarning')}</p>}
      </FormSection>
      <FormSection label={t('sharing.protection')} summary={t(form.protection === 'none' ? 'sharing.noProtection' : `sharing.${form.protection}`)}
        error={errors.protectionSecret ? t(form.protection === 'pin' ? 'sharing.invalidPin' : 'sharing.invalidPassword') : confirmationError ? t('sharing.secretMismatch') : undefined}>
      <FormSelect id="sharing-protection" label={t('sharing.additionalProtection')} value={form.protection} disabled={disabled}
        onChange={(event) => { change('protection', event.target.value as SharingForm['protection']); change('protectionSecret', ''); setShown(false); setConfirmation(''); setConfirmationError(false) }}>
        <option value="none">{t('sharing.none')}</option><option value="password">{t('sharing.password')}</option><option value="pin">{t('sharing.pin')}</option>
      </FormSelect>
      {form.protection !== 'none' ? <>
        <div><SecretInput id="sharing-protection-secret" label={t(form.protection === 'pin' ? 'sharing.pin' : 'sharing.password')}
          value={form.protectionSecret} onChange={(value) => change('protectionSecret', value)} shown={shown} onToggleShown={() => setShown(!shown)}
          disabled={disabled} error={errors.protectionSecret} onBlur={() => blur('protectionSecret')} />
          <FeedbackSlot visible={!!errors.protectionSecret} color="red">{t(form.protection === 'pin' ? 'sharing.invalidPin' : 'sharing.invalidPassword')}</FeedbackSlot>
        </div>
        <div><SecretInput id="sharing-protection-confirmation" label={t('sharing.confirmSecret')}
          value={confirmation} onChange={(value) => { setConfirmation(value); setConfirmationError(false) }}
          shown={shown} onToggleShown={() => setShown(!shown)} disabled={disabled} error={confirmationError}
          onBlur={() => setConfirmationError(confirmation !== form.protectionSecret)} />
          <FeedbackSlot visible={confirmationError} color="red">{t('sharing.secretMismatch')}</FeedbackSlot>
        </div>
        <p className="text-meta text-[var(--cv-t3)]">{t('sharing.separateChannel')}</p>
        {form.protection === 'pin' ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.pinWarning')}</p> : null}
      </> : null}
      </FormSection>
      <FormSection label={t('sharing.validFor')} summary={t(`sharing.${({ '1': 'oneHour', '24': 'oneDay', '72': 'threeDays', '168': 'sevenDays' } as const)[form.lifetimeHours]}`)}>
      <FormSelect id="sharing-lifetime" label={t('sharing.validFor')} value={form.lifetimeHours} disabled={disabled}
        onChange={(event) => change('lifetimeHours', event.target.value as SharingForm['lifetimeHours'])}>
        <option value="1">{t('sharing.oneHour')}</option><option value="24">{t('sharing.oneDay')}</option>
        <option value="72">{t('sharing.threeDays')}</option><option value="168">{t('sharing.sevenDays')}</option>
      </FormSelect>
      </FormSection>
      <FormSection label={t('sharing.receiptLimit')} summary={form.maximumReceipts || t('sharing.unlimited')}
        error={errors.maximumReceipts ? t('sharing.invalidLimit') : undefined}>
      <div><FormInput id="sharing-limit" label={t('sharing.receiptLimit')} value={form.maximumReceipts} inputMode="numeric" placeholder={t('sharing.unlimited')}
        disabled={disabled} error={errors.maximumReceipts} onChange={(event) => change('maximumReceipts', event.target.value)} onBlur={() => blur('maximumReceipts')} />
        <FeedbackSlot visible={!!errors.maximumReceipts} color="red">{t('sharing.invalidLimit')}</FeedbackSlot>
      </div>
      </FormSection>
      </div>
      <div className="flex items-center justify-between gap-3 text-meta text-[var(--cv-t2)]">
        <span>{t('sharing.notify')}</span><ToggleSwitch checked={form.notifyOnFirstReceipt} disabled={disabled} label={t('sharing.notify')}
          onChange={(value) => change('notifyOnFirstReceipt', value)} />
      </div>
      {creation.retryPending ? <p role="status" className="text-meta text-[var(--cv-t2)]">{t('sharing.retryNotice')}</p> : null}
    </form>
  </ModalShell>
}

function CreatedShareDialog({ links, busy, retryPending, onRetry, onClose }: {
  links: CreatedShareLink[]; busy: boolean; retryPending: boolean; onRetry: () => void; onClose: () => void
}) {
  const { t } = useTranslation()
  const [shown, setShown] = useState<string[]>([])
  return <ModalShell title={t('sharing.created')} ariaLabel={t('sharing.created')} width={560} trapFocus onClose={busy ? undefined : onClose}
    footer={<DialogFooter>{retryPending ? <Button size="sm" variant="subtle" onClick={onRetry} disabled={busy} className="flex-1">
      {t(busy ? 'sharing.creating' : 'sharing.retryCreation')}</Button> : null}
      <Button size="sm" variant="accent" onClick={onClose} disabled={busy} className="flex-[2]">{t('sharing.done')}</Button></DialogFooter>}>
    <div className="flex flex-col gap-3">
      {retryPending ? <p role="status" className="text-meta text-[var(--cv-t2)]">{t('sharing.partialCreation')}</p> : null}
      {links.map(({ recipientEmail, link }, index) => <div key={link}>
        <SecretInput id={`sharing-created-link-${index}`} label={recipientEmail ?? t('sharing.link')} value={link}
          onChange={() => undefined} readOnly shown={shown.includes(link)} onToggleShown={() => setShown((current) => current.includes(link)
            ? current.filter((value) => value !== link) : [...current, link])} copyable copyLabel={t('sharing.copyLink')}
          copyFeedback clearCopiedSecret={false}
          trailingAction={typeof navigator.share === 'function' ? { icon: 'share', label: t('sharing.shareVia'), onClick: () => {
            void navigator.share({ url: link }).catch(() => undefined)
          } } : undefined} />
      </div>)}
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.linkOnce')}</p>
    </div>
  </ModalShell>
}
