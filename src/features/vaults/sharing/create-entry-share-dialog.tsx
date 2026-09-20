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
import { WarningZone } from '../../../shared/components/warning-zone'
import { EncryptionNotice } from '../../../shared/components/encryption-notice'
import { entryShareFieldChoices } from '../../../shared/crypto/entry-share-selection'
import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import { SectionHeader } from '../components/section-header'
import { initialSharingForm, sharingFieldInvalid, sharingFormSchema, type SharingForm } from './sharing-form'
import { SharingFieldPreview } from './sharing-field-preview'
import { useShareCreation, type ShareSourceScope } from './use-share-creation'

interface CreateEntryShareDialogProps {
  scope: ShareSourceScope
  onClose: () => void
  onCreated: () => void
}

export function CreateEntryShareDialog({ scope, onClose, onCreated }: CreateEntryShareDialogProps) {
  const { t } = useTranslation()
  const creation = useShareCreation(scope, onCreated)
  if (creation.link) return <CreatedShareDialog link={creation.link} onClose={onClose} />
  if (creation.source) return <SharingDraftDialog source={creation.source} creation={creation} onClose={onClose} />
  return <ModalShell title={t('sharing.create')} ariaLabel={t('sharing.create')} width={560} trapFocus
    onClose={onClose} footer={<DialogFooter><Button size="sm" variant="subtle" onClick={onClose} className="flex-1">{t('sharing.close')}</Button></DialogFooter>}>
    {creation.loadError ? <ErrorState message={t('sharing.loadError')} onRetry={creation.retryLoad} /> : <SkeletonBlock className="h-32" />}
  </ModalShell>
}

function SharingDraftDialog({ source, creation, onClose }: {
  source: MemberSecretV1
  creation: ReturnType<typeof useShareCreation>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const choices = useMemo(() => entryShareFieldChoices(source), [source])
  const [selected, setSelected] = useState(() => new Set(choices.fields.filter((field) => field.selectedByDefault).map((field) => field.id)))
  const [form, setForm] = useState<SharingForm>(initialSharingForm)
  const [errors, setErrors] = useState<Partial<Record<keyof SharingForm, boolean>>>({})
  const [shown, setShown] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const disabled = creation.busy || creation.retryPending
  const valid = sharingFormSchema.safeParse(form).success && selected.size > 0 && confirmed
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
    const result = await creation.submit(form, [...selected])
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
      <EncryptionNotice>{t('sharing.encryption')}</EncryptionNotice>
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.snapshotNotice')}</p>
      <FormInput id="sharing-title" label={t('sharing.titleIncluded')} value={source.memberLabel} readOnly />
      <SectionHeader>{t('sharing.selectedFields')}</SectionHeader>
      {choices.fields.map((field) => <SharingFieldPreview key={field.id} field={field} selected={selected.has(field.id)} disabled={disabled}
        onChange={(included) => {
          setSelected((current) => { const next = new Set(current); if (included) next.add(field.id); else next.delete(field.id); return next })
          setConfirmed(false)
        }} />)}
      {choices.unsupported.length > 0 ? <p className="text-meta text-[var(--cv-t3)]">
        {t('sharing.unsupportedFields', { fields: choices.unsupported.map((field) => field.label).join(', ') })}
      </p> : null}
      <p className="text-meta text-[var(--cv-t3)]">{t('sharing.sensitiveFieldsNotice')}</p>
      {source.entryType === 'script' ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.scriptNotice')}</p> : null}
      <div className="flex items-center justify-between gap-3 text-meta text-[var(--cv-t2)]">
        <span>{t('sharing.confirmFields')}</span>
        <ToggleSwitch checked={confirmed} onChange={setConfirmed} disabled={disabled} label={t('sharing.confirmFields')} />
      </div>
      <SectionHeader>{t('sharing.recipient')}</SectionHeader>
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
      </div> : <WarningZone title={t('sharing.anyoneWarningTitle')}>{t('sharing.anyoneWarning')}</WarningZone>}
      <SectionHeader>{t('sharing.protection')}</SectionHeader>
      <FormSelect id="sharing-protection" label={t('sharing.additionalProtection')} value={form.protection} disabled={disabled}
        onChange={(event) => { change('protection', event.target.value as SharingForm['protection']); change('protectionSecret', ''); setShown(false) }}>
        <option value="none">{t('sharing.none')}</option><option value="password">{t('sharing.password')}</option><option value="pin">{t('sharing.pin')}</option>
      </FormSelect>
      {form.protection !== 'none' ? <>
        <div><SecretInput id="sharing-protection-secret" label={t(form.protection === 'pin' ? 'sharing.pin' : 'sharing.password')}
          value={form.protectionSecret} onChange={(value) => change('protectionSecret', value)} shown={shown} onToggleShown={() => setShown(!shown)}
          disabled={disabled} error={errors.protectionSecret} onBlur={() => blur('protectionSecret')} />
          <FeedbackSlot visible={!!errors.protectionSecret} color="red">{t(form.protection === 'pin' ? 'sharing.invalidPin' : 'sharing.invalidPassword')}</FeedbackSlot>
        </div>
        <p className="text-meta text-[var(--cv-t3)]">{t('sharing.separateChannel')}</p>
        {form.protection === 'pin' ? <WarningZone title={t('sharing.pinWarningTitle')}>{t('sharing.pinWarning')}</WarningZone> : null}
      </> : null}
      <SectionHeader>{t('sharing.limits')}</SectionHeader>
      <FormSelect id="sharing-lifetime" label={t('sharing.validFor')} value={form.lifetimeHours} disabled={disabled}
        onChange={(event) => change('lifetimeHours', event.target.value as SharingForm['lifetimeHours'])}>
        <option value="1">{t('sharing.oneHour')}</option><option value="24">{t('sharing.oneDay')}</option>
        <option value="72">{t('sharing.threeDays')}</option><option value="168">{t('sharing.sevenDays')}</option>
      </FormSelect>
      <div><FormInput id="sharing-limit" label={t('sharing.receiptLimit')} value={form.maximumReceipts} inputMode="numeric"
        disabled={disabled} error={errors.maximumReceipts} onChange={(event) => change('maximumReceipts', event.target.value)} onBlur={() => blur('maximumReceipts')} />
        <FeedbackSlot visible={!!errors.maximumReceipts} color="red">{t('sharing.invalidLimit')}</FeedbackSlot>
      </div>
      <div className="flex items-center justify-between gap-3 text-meta text-[var(--cv-t2)]">
        <span>{t('sharing.notify')}</span><ToggleSwitch checked={form.notifyOnFirstReceipt} disabled={disabled} label={t('sharing.notify')}
          onChange={(value) => change('notifyOnFirstReceipt', value)} />
      </div>
      <p className="text-meta text-[var(--cv-t3)]">{t('sharing.notifyNotice')}</p>
      {creation.retryPending ? <WarningZone title={t('sharing.retryTitle')}>{t('sharing.retryNotice')}</WarningZone> : null}
    </form>
  </ModalShell>
}

function CreatedShareDialog({ link, onClose }: { link: string; onClose: () => void }) {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  return <ModalShell title={t('sharing.created')} ariaLabel={t('sharing.created')} width={560} trapFocus onClose={onClose}
    footer={<DialogFooter><Button size="sm" variant="accent" onClick={onClose} className="flex-1">{t('sharing.done')}</Button></DialogFooter>}>
    <div className="flex flex-col gap-3">
      <SecretInput id="sharing-created-link" label={t('sharing.link')} value={link} onChange={() => undefined} readOnly
        shown={shown} onToggleShown={() => setShown(!shown)} copyable copyLabel={t('sharing.copyLink')} />
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.linkOnce')}</p>
      {typeof navigator.share === 'function' ? <Button size="sm" variant="subtle" onClick={() => {
        void navigator.share({ url: link }).catch(() => undefined)
      }}>{t('sharing.shareVia')}</Button> : null}
    </div>
  </ModalShell>
}
