import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
import type { SavedShareCopy } from './use-save-share-copy'

interface SaveShareCopyDialogProps {
  snapshot: EntryShareSnapshot
  onClose: () => void
  onSaved: (entry: SavedShareCopy) => void
}

export function SaveShareCopyDialog({ snapshot, onClose, onSaved }: SaveShareCopyDialogProps) {
  const { t } = useTranslation()
  const saving = useSaveShareCopy(snapshot)
  const [destinationMode, setDestinationMode] = useState<'existing' | 'new'>('existing')
  const [vaultInput, setVaultInput] = useState('')
  const [selectedVaultId, setSelectedVaultId] = useState('')
  const [vaultSuggestionsOpen, setVaultSuggestionsOpen] = useState(false)
  const [activeVaultIndex, setActiveVaultIndex] = useState(0)
  const [vaultMenuPosition, setVaultMenuPosition] = useState<React.CSSProperties>({})
  const vaultInputRef = useRef<HTMLDivElement>(null)
  const vaultMenuRef = useRef<HTMLDivElement>(null)
  const [createdVaultId, setCreatedVaultId] = useState<string | null>(null)
  const [title, setTitle] = useState(snapshot.title)
  const [additions, setAdditions] = useState<Record<string, string>>({})
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set())
  const [shown, setShown] = useState(false)
  const missing = missingEntryShareCopyFields(snapshot)
  const form = { title, additions }
  const valid = entryShareCopyFormSchema.safeParse(form).success
    && missing.every((id) => entryShareCopyAdditionSchemas[id].safeParse(additions[id] ?? '').success)
  const mode = saving.pendingVaultName ? 'new' : saving.vaults.length ? destinationMode : 'new'
  const frozen = saving.busy || saving.retryPending || saving.saved || !!saving.pendingVaultName
  const namedVaults = saving.vaults.filter((vault) => vault.name !== null)
  const usedLabels = new Set<string>()
  const vaultChoices = namedVaults.map((vault) => {
    const repeatedName = namedVaults.some((other) => other !== vault && other.name === vault.name)
    const base = repeatedName ? `${vault.name} (${shortenKey(vault.id)})` : vault.name!
    let label = base
    if (namedVaults.some((other) => other !== vault && other.name === base) || usedLabels.has(label)) {
      label = `${vault.name} (${vault.id})`
    }
    let suffix = 2
    while (usedLabels.has(label)) label = `${vault.name} (${vault.id}) ${suffix++}`
    usedLabels.add(label)
    return { ...vault, label }
  })
  const visibleVaultChoices = vaultChoices.filter((vault) => vault.label.toLocaleLowerCase()
    .includes(vaultInput.toLocaleLowerCase()))
  useEffect(() => {
    if (!vaultSuggestionsOpen || !vaultInputRef.current) return
    const rect = vaultInputRef.current.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 8
    const above = rect.top - 8
    setVaultMenuPosition({ position: 'fixed', left: rect.left, width: rect.width,
      ...(below >= 180 || below >= above
        ? { top: rect.bottom + 4, maxHeight: Math.max(40, below) }
        : { bottom: window.innerHeight - rect.top + 4, maxHeight: Math.max(40, above) }) })
    const close = () => setVaultSuggestionsOpen(false)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [vaultSuggestionsOpen, vaultInput])
  const destinationVaultId = mode === 'existing' && vaultChoices.some((vault) => vault.id === selectedVaultId)
    ? selectedVaultId : undefined
  const newVaultName = vaultInput.trim().normalize('NFC')
  const destinationReady = saving.retryPending || (saving.pendingVaultName
    ? valid && newVaultName === saving.pendingVaultName
    : valid && (createdVaultId !== null || !!destinationVaultId
      || mode === 'new' && newVaultName.length > 0 && newVaultName.length <= 64))
  const canSave = !saving.busy && !saving.saved && !saving.loading && !saving.loadError
    && destinationReady
  function feedback(id: string, show: boolean) {
    setInvalid((current) => { const next = new Set(current); if (show) next.add(id); else next.delete(id); return next })
  }
  function add(id: string, value: string) { setAdditions((current) => ({ ...current, [id]: value })); feedback(id, false) }
  function chooseVault(id: string, label: string) {
    setSelectedVaultId(id); setVaultInput(label); setVaultSuggestionsOpen(false)
  }
  async function submit() {
    if (!canSave) return
    let vaultId = createdVaultId ?? destinationVaultId
    let newVaultId = createdVaultId
    if (!vaultId && !saving.retryPending) {
      const created = await saving.createNamedVault(newVaultName)
      if (created === 'failed') { toast.error(t('sharing.copy.createVaultError')); return }
      if (created === 'cancelled') return
      vaultId = created.vaultId
      newVaultId = vaultId
      setDestinationMode('new')
      setCreatedVaultId(vaultId)
    }
    if (!vaultId && !saving.retryPending) return
    const outcome = newVaultId ? await saving.save(vaultId ?? '', form, newVaultId)
      : await saving.save(vaultId ?? '', form)
    if (typeof outcome === 'object') { toast.success(t('sharing.copy.saved')); onSaved(outcome) }
    else if (outcome === 'failed') toast.error(t('sharing.copy.error'))
  }
  return <ModalShell width={560} title={t('sharing.copy.title')} ariaLabel={t('sharing.copy.title')} trapFocus
    onClose={saving.busy || saving.pendingVaultName ? undefined : onClose} footer={<DialogFooter>
      <Button size="sm" variant="subtle" className="flex-1" disabled={saving.busy || !!saving.pendingVaultName} onClick={onClose}>{t('sharing.cancel')}</Button>
      <Button size="sm" variant="accent" className="flex-[2]" disabled={!canSave} type="submit" form="save-share-copy">
        {t(saving.pendingVaultName ? 'sharing.copy.retryVault' : saving.retryPending ? 'sharing.copy.retry' : 'sharing.copy.save')}
      </Button>
    </DialogFooter>}>
    <form id="save-share-copy" noValidate className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p className="text-meta text-[var(--cv-t2)]">{t('sharing.copy.notice')}</p>
      {saving.loading ? <SkeletonBlock height="5rem" /> : saving.loadError ? <ErrorState onRetry={saving.retryLoad} retryLabel={t('sharing.retry')} message={t('sharing.copy.vaultError')} /> : <>
        {saving.vaults.length ? <div className="flex gap-2" role="group" aria-label={t('sharing.copy.destinationMode')}>
          <Button size="sm" variant={mode === 'existing' ? 'subtle' : 'ghost'} aria-pressed={mode === 'existing'}
            disabled={frozen} onClick={() => { setDestinationMode('existing'); setVaultInput(''); setSelectedVaultId(''); setCreatedVaultId(null) }}>
            {t('sharing.copy.existingVault')}
          </Button>
          <Button size="sm" variant={mode === 'new' ? 'subtle' : 'ghost'} aria-pressed={mode === 'new'}
            disabled={frozen} onClick={() => { setDestinationMode('new'); setVaultInput(''); setSelectedVaultId(''); setCreatedVaultId(null) }}>
            {t('sharing.copy.newVault')}
          </Button>
        </div> : null}
        {mode === 'existing' ? <>
          <div ref={vaultInputRef} className="relative" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget) && !vaultMenuRef.current?.contains(event.relatedTarget)) {
              setVaultSuggestionsOpen(false)
            }
          }}>
            <FormInput id="copy-vault" label={t('sharing.copy.vault')} value={vaultInput}
              placeholder={t('sharing.copy.chooseExistingVault')} autoComplete="off" maxLength={80} disabled={frozen}
              role="combobox" aria-autocomplete="list" aria-expanded={vaultSuggestionsOpen && visibleVaultChoices.length > 0}
              aria-controls="copy-vault-options" aria-activedescendant={vaultSuggestionsOpen && visibleVaultChoices[activeVaultIndex]
                ? `copy-vault-option-${visibleVaultChoices[activeVaultIndex].id}` : undefined}
              onFocus={() => { setActiveVaultIndex(0); setVaultSuggestionsOpen(true) }}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { setVaultSuggestionsOpen(false); return }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault(); setVaultSuggestionsOpen(true)
                  setActiveVaultIndex((index) => Math.max(0, Math.min(visibleVaultChoices.length - 1,
                    index + (event.key === 'ArrowDown' ? 1 : -1))))
                } else if (event.key === 'Enter' && vaultSuggestionsOpen && visibleVaultChoices[activeVaultIndex]) {
                  event.preventDefault()
                  const vault = visibleVaultChoices[activeVaultIndex]
                  chooseVault(vault.id, vault.label)
                }
              }}
              onChange={(event) => { setVaultInput(event.target.value); setSelectedVaultId(''); setActiveVaultIndex(0); setVaultSuggestionsOpen(true) }} />
            {vaultSuggestionsOpen && visibleVaultChoices.length > 0 ? createPortal(<div id="copy-vault-options" role="listbox"
              ref={vaultMenuRef} style={vaultMenuPosition}
              className="z-[100] overflow-y-auto rounded-lg border border-[var(--cv-input-border)] bg-[var(--cv-modal-bg)] shadow-xl">
              {visibleVaultChoices.map((vault) => <button key={vault.id} type="button" role="option"
                id={`copy-vault-option-${vault.id}`} aria-selected={vault.id === selectedVaultId} disabled={frozen}
                className="block w-full px-3 py-2 text-left text-ui text-[var(--cv-input-text)] hover:bg-[var(--cv-bg-subtle)]"
                onClick={() => chooseVault(vault.id, vault.label)}>
                {vault.label}
              </button>)}
            </div>, document.body) : null}
          </div>
          {saving.vaults.filter((vault) => vault.name === null).map((vault) => <p key={vault.id} aria-disabled="true"
            className="text-meta text-[var(--cv-t3)]">{t('sharing.copy.unavailableVault', { id: shortenKey(vault.id) })}</p>)}
        </> : <>
          <FormInput id="copy-vault" label={t('sharing.copy.newVaultName')} value={vaultInput}
            placeholder={t('sharing.copy.enterNewVaultName')} autoComplete="off" maxLength={64} disabled={frozen}
            onChange={(event) => { setVaultInput(event.target.value); setCreatedVaultId(null) }} />
          {newVaultName ? <p className="text-meta text-[var(--cv-t3)]">{t('sharing.copy.newVaultHint', { name: newVaultName })}</p> : null}
        </>}
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
      {saving.pendingVaultName && !saving.busy ? <WarningZone title={t('sharing.copy.retryVault')}>
        {t('sharing.copy.vaultRetry')}
      </WarningZone> : null}
    </form>
  </ModalShell>
}
