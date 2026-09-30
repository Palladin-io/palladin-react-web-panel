import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { ModalShell } from '../../../shared/components/modal-shell'
import { DialogFooter } from '../../../shared/components/dialog-footer'
import { FormInput, FeedbackSlot } from '../../../shared/components/form-field'
import { FormSelect } from '../../../shared/components/form-select'
import { SecretInput } from '../../../shared/components/secret-input'
import { ErrorState } from '../../../shared/components/error-state'
import { SkeletonBlock } from '../../../shared/components/skeleton-block'
import { WarningZone } from '../../../shared/components/warning-zone'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import { entryShareCopyFormSchema, entryShareCopyAdditionSchemas, missingEntryShareCopyFields } from '../../../shared/crypto/entry-share-copy'
import { sharingFieldLabel } from './sharing-field-label'
import { useSaveShareCopy } from './use-save-share-copy'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useCreateVault } from '../use-create-vault'
import type { SavedShareCopy } from './use-save-share-copy'

interface SaveShareCopyDialogProps {
  snapshot: EntryShareSnapshot
  onClose: () => void
  onSaved: (entry: SavedShareCopy) => void
}

export function SaveShareCopyDialog({ snapshot, onClose, onSaved }: SaveShareCopyDialogProps) {
  const { t } = useTranslation()
  const saving = useSaveShareCopy(snapshot)
  const createVault = useCreateVault()
  const [vaultInput, setVaultInput] = useState(createVault.pendingInput?.name ?? '')
  const [createdVaultId, setCreatedVaultId] = useState<string | null>(null)
  const [title, setTitle] = useState(snapshot.title)
  const [additions, setAdditions] = useState<Record<string, string>>({})
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set())
  const [shown, setShown] = useState(false)
  const missing = missingEntryShareCopyFields(snapshot)
  const form = { title, additions }
  const valid = entryShareCopyFormSchema.safeParse(form).success
    && missing.every((id) => entryShareCopyAdditionSchemas[id].safeParse(additions[id] ?? '').success)
  const frozen = saving.busy || saving.retryPending || saving.saved || createVault.isPending || !!createVault.pendingInput
  const vaultChoices = saving.vaults.filter((vault) => vault.name !== null).map((vault) => ({
    ...vault, label: saving.vaults.filter((candidate) => candidate.name === vault.name).length > 1
      ? `${vault.name} (${shortenKey(vault.id)})` : vault.name!,
  }))
  const selectedVaultId = vaultChoices.find((vault) => vault.label === vaultInput)?.id
  const newVaultName = vaultInput.trim()
  const canSave = !saving.busy && !saving.saved && !saving.loading && !saving.loadError
    && !createVault.isPending && (saving.retryPending || valid && (createdVaultId !== null || !!selectedVaultId
      || createVault.pendingInput?.name === newVaultName
      || newVaultName.length > 0 && newVaultName.length <= 64))
  function feedback(id: string, show: boolean) {
    setInvalid((current) => { const next = new Set(current); if (show) next.add(id); else next.delete(id); return next })
  }
  function add(id: string, value: string) { setAdditions((current) => ({ ...current, [id]: value })); feedback(id, false) }
  async function submit() {
    if (!canSave) return
    let vaultId = createdVaultId ?? selectedVaultId
    let newVaultId = createdVaultId
    if (!vaultId && !saving.retryPending) {
      try {
        const created = await createVault.mutateAsync({ name: createVault.pendingInput?.name ?? newVaultName })
        vaultId = created.vaultId
        newVaultId = vaultId
        setCreatedVaultId(vaultId)
      } catch { toast.error(t('sharing.copy.createVaultError')); return }
    }
    if (!vaultId && !saving.retryPending) return
    const outcome = newVaultId ? await saving.save(vaultId ?? '', form, newVaultId)
      : await saving.save(vaultId ?? '', form)
    if (typeof outcome === 'object') { toast.success(t('sharing.copy.saved')); onSaved(outcome) }
    else if (outcome === 'failed') toast.error(t('sharing.copy.error'))
  }
  return <ModalShell width={560} title={t('sharing.copy.title')} ariaLabel={t('sharing.copy.title')} trapFocus
    onClose={saving.busy || createVault.isPending ? undefined : onClose} footer={<DialogFooter>
      <Button size="sm" variant="subtle" className="flex-1" disabled={saving.busy || createVault.isPending} onClick={onClose}>{t('sharing.cancel')}</Button>
      <Button size="sm" variant="accent" className="flex-[2]" disabled={!canSave} type="submit" form="save-share-copy">
        {t(saving.retryPending ? 'sharing.copy.retry' : 'sharing.copy.save')}
      </Button>
    </DialogFooter>}>
    <form id="save-share-copy" noValidate className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.copy.notice')}</p>
      {saving.loading ? <SkeletonBlock height="5rem" /> : saving.loadError ? <ErrorState onRetry={saving.retryLoad} retryLabel={t('sharing.retry')} message={t('sharing.copy.vaultError')} /> : <>
        <FormInput id="copy-vault" label={t('sharing.copy.vault')} value={vaultInput} list="copy-vault-options"
          placeholder={t('sharing.copy.chooseOrCreateVault')} autoComplete="off" maxLength={80} disabled={frozen}
          onChange={(event) => { setVaultInput(event.target.value); setCreatedVaultId(null) }} />
        <datalist id="copy-vault-options">{vaultChoices.map((vault) => <option key={vault.id} value={vault.label} />)}</datalist>
        {!selectedVaultId && newVaultName ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.copy.newVaultHint', { name: newVaultName })}</p> : null}
        {!saving.vaults.length ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.copy.noVaults')}</p> : null}
        <div>
          <FormInput id="copy-title" label={t('sharing.copy.label')} value={title} disabled={frozen} error={invalid.has('title')}
            onChange={(event) => { setTitle(event.target.value); feedback('title', false) }}
            onBlur={() => feedback('title', !entryShareCopyFormSchema.shape.title.safeParse(title).success)} />
          <FeedbackSlot visible={invalid.has('title')} color="red">{t('sharing.copy.invalidTitle')}</FeedbackSlot>
        </div>
        {missing.length ? <p className="text-meta text-[var(--cv-t2)]">{t('sharing.copy.missing')}</p> : null}
        {missing.map((id) => {
          const label = sharingFieldLabel({ id, label: '' }, t)
          const blur = () => feedback(id, !entryShareCopyAdditionSchemas[id].safeParse(additions[id] ?? '').success)
          return <div key={id}>
            {id === 'script.interpreter' ? <FormSelect id={`copy-${id}`} label={label} value={additions[id] ?? ''} disabled={frozen}
              onChange={(event) => add(id, event.target.value)} onBlur={blur}>
              <option value="">{t('sharing.copy.chooseInterpreter')}</option>
              {['bash', 'sh', 'node', 'python'].map((value) => <option key={value} value={value}>{value}</option>)}
            </FormSelect> : id === 'creditCard.cardNumber' ? <SecretInput id={`copy-${id}`} label={label} value={additions[id] ?? ''}
              onChange={(value) => add(id, value)} shown={shown} onToggleShown={() => setShown(!shown)} disabled={frozen} error={invalid.has(id)} onBlur={blur} /> :
              <FormInput id={`copy-${id}`} label={label} value={additions[id] ?? ''} disabled={frozen} error={invalid.has(id)}
                onChange={(event) => add(id, event.target.value)} onBlur={blur} />}
            <FeedbackSlot visible={invalid.has(id)} color="red">{t('sharing.copy.invalidField')}</FeedbackSlot>
          </div>
        })}
      </>}
      {saving.retryPending ? <WarningZone title={t('sharing.copy.retry')}>{t('sharing.copy.ambiguous')}</WarningZone> : null}
      {createVault.pendingInput ? <WarningZone title={t('vault.createVault')}>{t('sharing.copy.vaultRetry')}</WarningZone> : null}
    </form>
  </ModalShell>
}
