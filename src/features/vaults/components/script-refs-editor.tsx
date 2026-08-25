import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_CREDIT_CARD,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type ScriptRef,
} from '../types'
import type { MenuEntry } from './popover-menu'
import { useAuthStore } from '../../auth'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { fromMemberSecret } from '../../../shared/crypto/entry-draft'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import { getCanonicalEntry } from '../api/vault-api'
import { getEncryptedVault } from '../sync/member-sync-api'
import { isScriptReferenceFieldSelectable } from '../script-refs'
import { buildMemberEntryList, type MemberEntryListItem } from '../sync/member-entry-list'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { ScriptMappingRow } from './script-mapping-row'

export interface ScriptRefsEditorProps {
  vaultId: string
  /** Exclude the entry being edited from its own ref picker. */
  currentEntryId?: string
  refs: ScriptRef[]
  onChange: (next: ScriptRef[]) => void
  disabled?: boolean
}

interface ReferenceFieldOption { id: string; label: string }

/**
 * "Injected vault data" — the SCRIPT `refs[]` as a grouped list matching the
 * approved redesign: each row is `$ ENV → entry · field`. Every ref written here
 * carries its vault id (sources are same-vault). Every non-Script Entry is
 * eligible; selecting it decrypts its current field schema locally so custom
 * and TOTP selectors never cross the backend in plaintext.
 */
export function ScriptRefsEditor({
  vaultId,
  currentEntryId,
  refs,
  onChange,
  disabled,
}: ScriptRefsEditorProps) {
  const { t } = useTranslation()
  const memberVault = useMemberSyncStore((store) => store.vaults.get(vaultId))
  const [fieldOptions, setFieldOptions] = useState<Map<string, ReferenceFieldOption[]>>(new Map())

  const sources = useMemo(
    () =>
      buildMemberEntryList(memberVault).filter(
        (entry) => entry.state === 'active'
          && !entry.corrupt
          && entry.id !== currentEntryId
          && entry.type !== ENTRY_TYPE_SCRIPT,
      ),
    [memberVault, currentEntryId],
  )

  const update = (index: number, patch: Partial<ScriptRef>) =>
    onChange(refs.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const remove = (index: number) => onChange(refs.filter((_, i) => i !== index))

  const add = () => onChange([...refs, { env: '', vaultId, entryId: '', field: '' }])

  const loadFields = useCallback(async (entryId: string) => {
    if (!entryId || fieldOptions.has(entryId)) return
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) return
    let vaultKey: Uint8Array | undefined
    try {
      const [vault, detail] = await Promise.all([
        getEncryptedVault(vaultId),
        getCanonicalEntry(vaultId, entryId),
      ])
      vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      const secret = fromMemberSecret(await openMemberSecret(
        detail.entryKey,
        detail.memberSecret,
        vaultKey,
        { organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision },
      ))
      if (useAuthStore.getState().privateKey !== privateKey) return
      const content = secret.content
      const options: ReferenceFieldOption[] = content.type === ENTRY_TYPE_KEY
        ? [{ id: 'value', label: t('vault.entries.valueLabel') }]
        : content.type === ENTRY_TYPE_CREDENTIAL
          ? [
              { id: 'username', label: t('vault.entries.usernameLabel') },
              { id: 'password', label: t('vault.entries.passwordLabel') },
              ...(content.url ? [{ id: 'url', label: t('vault.entries.urlLabel') }] : []),
              ...(content.totp
                ? [{ id: 'totp', label: t('vault.entries.totp.section') }]
                : []),
            ]
          : content.type === ENTRY_TYPE_CREDIT_CARD
            ? [
                { id: 'cardholderName', label: t('vault.entries.card.cardholderName') },
                { id: 'cardNumber', label: t('vault.entries.card.cardNumber') },
                { id: 'expiryMonth', label: t('vault.entries.card.expiryMonth') },
                { id: 'expiryYear', label: t('vault.entries.card.expiryYear') },
                ...(content.billingAddress
                  ? [{ id: 'billingAddress', label: t('vault.entries.card.billingAddress') }]
                  : []),
              ]
            : []
      for (const field of content.fields ?? []) {
        options.push({ id: `custom:${field.id.replace(/^custom:/, '')}`, label: field.label })
      }
      if (content.notes) options.push({ id: 'notes', label: t('vault.entries.notesLabel') })
      setFieldOptions((current) => new Map(current).set(
        entryId,
        options.filter((option) => isScriptReferenceFieldSelectable(
          secret.agentVisibilityPolicy,
          option.id,
        )),
      ))
    } catch {
      setFieldOptions((current) => new Map(current).set(entryId, []))
    } finally {
      if (vaultKey) wipe(vaultKey)
    }
  }, [fieldOptions, t, vaultId])

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)]">
      {refs.map((ref, index) => (
        <RefRow
          key={index}
          ref_={ref}
          vaultId={vaultId}
          sources={sources}
          fieldOptions={ref.entryId ? fieldOptions.get(ref.entryId) : undefined}
          loadFields={loadFields}
          first={index === 0}
          disabled={disabled}
          onChange={(patch) => update(index, patch)}
          onRemove={() => remove(index)}
        />
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled}
        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-ui
          text-[var(--cv-btn-ghost-text)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
          ${refs.length > 0 ? 'border-t border-[var(--cv-divider)]' : ''}
          disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Icon name="add" size={14} />
        {t('vault.entries.script.addRef')}
      </button>
    </div>
  )
}

function RefRow({
  ref_,
  vaultId,
  sources,
  fieldOptions,
  loadFields,
  first,
  disabled,
  onChange,
  onRemove,
}: {
  ref_: ScriptRef
  vaultId: string
  sources: MemberEntryListItem[]
  fieldOptions?: ReferenceFieldOption[]
  loadFields: (entryId: string) => Promise<void>
  first: boolean
  disabled?: boolean
  onChange: (patch: Partial<ScriptRef>) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const selectedEntry = sources.find((e) => e.id === ref_.entryId)
  useEffect(() => {
    if (selectedEntry) void loadFields(selectedEntry.id)
  }, [loadFields, selectedEntry])

  const selectClass =
    'min-w-0 max-w-[8.125rem] cursor-pointer appearance-none border-0 bg-transparent p-0 text-ui text-[var(--cv-t1)] outline-none disabled:cursor-not-allowed'

  return (
    <ScriptMappingRow
      first={first}
      icon="attach_money"
      name={ref_.env}
      nameLabel={t('vault.entries.script.envLabel')}
      namePlaceholder="GITHUB_TOKEN"
      onNameChange={(env) => onChange({ env })}
      disabled={disabled}
      right={<div className="flex min-w-0 items-center justify-end gap-1.5">
        <select
          aria-label={t('vault.entries.script.sourceEntry')}
          value={ref_.entryId}
          onChange={(e) => onChange({ entryId: e.target.value, vaultId, field: '' })}
          disabled={disabled}
          className={selectClass}
        >
          <option value="">{t('vault.entries.script.selectEntry')}</option>
          {sources.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <span className="text-[var(--cv-t3)]">·</span>
        <select
          aria-label={t('vault.entries.script.sourceField')}
          value={ref_.field}
          onChange={(e) => onChange({ field: e.target.value })}
          disabled={disabled || !selectedEntry}
          className={selectClass}
        >
          <option value="">{t('vault.entries.script.selectField')}</option>
          {(fieldOptions ?? []).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>}
      menuItems={[{ icon: 'delete', label: t('common.remove'), danger: true, onSelect: onRemove } as MenuEntry]}
      menuLabel={t('common.moreActions')}
    />
  )
}
