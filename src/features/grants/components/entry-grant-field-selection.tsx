import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../auth'
import { getCanonicalEntry } from '../../vaults/api/vault-api'
import { getEncryptedVault } from '../../vaults/sync/member-sync-api'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { listGrantableFields, type GrantableField } from '../../../shared/crypto/grant-protocol'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import type { GrantFieldSelection } from '../../../shared/types/grant-field-selection'
import { GrantFieldSelectionFields } from './grant-field-selection'

export function EntryGrantFieldSelection({ vaultId, entryId, value, onChange, disabled }: {
  vaultId: string; entryId: string; value: GrantFieldSelection
  onChange: (next: GrantFieldSelection) => void; disabled: boolean
}) {
  const { t } = useTranslation()
  const privateKey = useAuthStore((state) => state.privateKey)
  const [loaded, setLoaded] = useState<{ key: Uint8Array; vaultId: string; entryId: string; fields: GrantableField[]; failed: boolean } | null>(null)
  const current = loaded?.key === privateKey && loaded?.vaultId === vaultId && loaded?.entryId === entryId ? loaded : null
  const fields = current?.fields
  const failed = current?.failed ?? false
  useEffect(() => {
    if (value.mode !== 'selected' || !privateKey) return
    let active = true
    void (async () => {
      let vaultKey: Uint8Array | undefined
      try {
        const [vault, detail] = await Promise.all([
          getEncryptedVault(vaultId), getCanonicalEntry(vaultId, entryId),
        ])
        if (!active || useAuthStore.getState().privateKey !== privateKey) return
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
        if (!active || useAuthStore.getState().privateKey !== privateKey) return
        const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        })
        if (active && useAuthStore.getState().privateKey === privateKey) setLoaded({ key: privateKey, vaultId, entryId, fields: listGrantableFields(secret), failed: false })
      } catch {
        if (active && useAuthStore.getState().privateKey === privateKey) setLoaded({ key: privateKey, vaultId, entryId, fields: [], failed: true })
      } finally {
        if (vaultKey) wipe(vaultKey)
      }
    })()
    return () => { active = false }
  }, [entryId, privateKey, value.mode, vaultId])
  return <>
    <GrantFieldSelectionFields fields={privateKey ? fields ?? [] : []} value={value}
      onChange={onChange} disabled={disabled || !privateKey} />
    {value.mode === 'selected' && (!fields || failed) ? <p className="text-meta text-[var(--cv-t3)]">
      {t(failed ? 'grants.fields.unavailable' : 'grants.fields.loading')}
    </p> : null}
  </>
}
