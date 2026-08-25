import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { WarningZone } from '../../../shared/components/warning-zone'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import {
  effectiveReturnResultToAgent,
  normalizeScriptExecutionMetadata,
  type ScriptExecutionMetadataV1,
} from '../../../shared/crypto/script-execution'
import { wipe } from '../../../shared/crypto/sodium'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { shortenKey } from '../../../shared/lib/shorten-key'
import { useAuthStore } from '../../auth'
import { getCanonicalEntry } from '../../vaults/api/vault-api'
import { getEncryptedVault } from '../../vaults/sync/member-sync-api'

export function ScriptGrantSummary({
  vaultId,
  scriptEntryId,
  onStatusChange,
}: {
  vaultId: string
  scriptEntryId: string
  onStatusChange: (reviewedRevision: string | null) => void
}) {
  const { t } = useTranslation()
  const subjectKey = `${vaultId}:${scriptEntryId}`
  const [review, setReview] = useState<{
    subjectKey: string
    metadata: ScriptExecutionMetadataV1 | null
    references: Array<{ env: string; entryId: string; fieldId: string }>
    unavailable: boolean
  } | null>(null)
  const currentReview = review?.subjectKey === subjectKey ? review : null
  const privateKeyAvailable = Boolean(useAuthStore.getState().privateKey)

  useEffect(() => {
    let active = true
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      onStatusChange(null)
      return () => { active = false }
    }

    void (async () => {
      let vaultKey: Uint8Array | undefined
      try {
        const [vault, detail] = await Promise.all([
          getEncryptedVault(vaultId),
          getCanonicalEntry(vaultId, scriptEntryId),
        ])
        vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
        const secret = await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId,
          vaultId,
          entryId: scriptEntryId,
          revision: detail.currentRevision,
        })
        if (!active || useAuthStore.getState().privateKey !== privateKey) return
        if (secret.entryType !== 'script') {
          setReview({ subjectKey, metadata: null, references: [], unavailable: true })
          onStatusChange(null)
          return
        }
        setReview({
          subjectKey,
          metadata: normalizeScriptExecutionMetadata(secret.content.execution, secret.description),
          references: secret.content.refs.map(({ env, entryId, fieldId }) => ({ env, entryId, fieldId })),
          unavailable: false,
        })
        onStatusChange(detail.currentRevision)
      } catch {
        if (active) {
          setReview({ subjectKey, metadata: null, references: [], unavailable: true })
          onStatusChange(null)
        }
      } finally {
        if (vaultKey) wipe(vaultKey)
      }
    })()
    return () => { active = false }
  }, [onStatusChange, scriptEntryId, subjectKey, vaultId])

  if (!privateKeyAvailable || currentReview?.unavailable) {
    return <WarningZone title={t('grants.create.scriptUnavailableTitle')}>
      {t('grants.create.scriptUnavailableBody')}
    </WarningZone>
  }
  if (!currentReview?.metadata) {
    return <p className="text-meta text-[var(--cv-t3)]">{t('grants.create.scriptLoading')}</p>
  }
  const { metadata, references } = currentReview
  return (
    <div className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-3">
      <p className="text-ui font-semibold text-[var(--cv-t1)]">{metadata.description}</p>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-meta text-[var(--cv-t2)]">
        <div><dt>{t('grants.create.scriptParameters')}</dt><dd>{metadata.parameters.length}</dd></div>
        <div><dt>{t('grants.create.scriptReferences')}</dt><dd>{references.length}</dd></div>
        <div className="col-span-2"><dt>{t('grants.create.scriptResult')}</dt><dd>
          {t(effectiveReturnResultToAgent(metadata)
            ? 'grants.create.scriptResultReturned'
            : 'grants.create.scriptResultWithheld')}
        </dd></div>
      </dl>
      {references.length > 0 ? (
        <div className="mt-3">
          <p className="text-meta font-semibold text-[var(--cv-t1)]">
            {t('grants.create.scriptReferenceDetails')}
          </p>
          <ul className="mt-1 space-y-1 text-meta text-[var(--cv-t2)]">
            {references.map((reference) => (
              <li key={`${reference.env}:${reference.entryId}:${reference.fieldId}`} className="font-mono">
                ${reference.env} ← {shortenKey(reference.entryId)} · {reference.fieldId}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {effectiveReturnResultToAgent(metadata) ? (
        <p className="mt-2 text-meta text-[var(--cv-pending)]">
          {t('grants.create.scriptResultTrust')}
        </p>
      ) : null}
    </div>
  )
}
