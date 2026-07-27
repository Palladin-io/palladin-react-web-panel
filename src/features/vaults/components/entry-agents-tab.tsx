import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '../../../shared/components/button'
import { FormInput } from '../../../shared/components/form-field'
import { openMemberSecret } from '../../../shared/crypto/entry-protocol'
import { fromMemberSecret, toMemberSecret, type AgentVisibilityPolicy, type MemberSecretView } from '../../../shared/crypto/entry-draft'
import { projectAgentDiscovery } from '../../../shared/crypto/vault-plaintext'
import { openMemberVaultKey } from '../../../shared/crypto/vault-protocol'
import { wipe } from '../../../shared/crypto/sodium'
import { OrgGrantsPanel } from '../../grants'
import { useAuthStore } from '../../auth'
import { getEncryptedVault } from '../sync/member-sync-api'
import type { CanonicalEntryDetail } from '../api/vault-api'
import type { EntryType } from '../types'
import { useUpdateCanonicalEntry } from '../use-update-canonical-entry'
import { AgentVisibilityPolicyEditor } from './agent-visibility-policy-editor'
import { SectionHeader } from './section-header'

interface EntryAgentsTabProps {
  vaultId: string
  entryId: string
  entryType: EntryType
  memberLabel: string
  detail: CanonicalEntryDetail
}

export function EntryAgentsTab({ vaultId, entryId, entryType, memberLabel, detail }: EntryAgentsTabProps) {
  const { t } = useTranslation()
  const update = useUpdateCanonicalEntry(vaultId, entryId)
  const [secret, setSecret] = useState<MemberSecretView | null>(null)
  const [agentLabel, setAgentLabel] = useState('')
  const [policy, setPolicy] = useState<AgentVisibilityPolicy | null>(null)
  const [decrypting, setDecrypting] = useState(false)
  const [decryptError, setDecryptError] = useState(false)

  const preview = useMemo(() => {
    if (!secret || !policy) return null
    return projectAgentDiscovery(toMemberSecret({
      label: secret.memberLabel,
      agentLabel,
      ...(secret.description ? { description: secret.description } : {}),
      ...(secret.iconReference ? { iconReference: secret.iconReference } : {}),
      type: secret.entryType,
      payload: secret.content,
      policy,
      vaultId,
    }))
  }, [agentLabel, policy, secret, vaultId])

  const changed = Boolean(secret && policy && (
    agentLabel !== secret.agentLabel
      || JSON.stringify(policy) !== JSON.stringify(secret.agentVisibilityPolicy)
  ))

  const decrypt = async () => {
    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey) {
      setDecryptError(true)
      return
    }
    setDecrypting(true)
    setDecryptError(false)
    try {
      const vault = await getEncryptedVault(vaultId)
      const vaultKey = await openMemberVaultKey(vault.memberVaultKey, privateKey)
      try {
        const opened = fromMemberSecret(await openMemberSecret(detail.entryKey, detail.memberSecret, vaultKey, {
          organizationId: detail.organizationId, vaultId, entryId, revision: detail.currentRevision,
        }))
        setSecret(opened)
        setAgentLabel(opened.agentLabel)
        setPolicy(opened.agentVisibilityPolicy)
      } finally {
        wipe(vaultKey)
      }
    } catch {
      setDecryptError(true)
    } finally {
      setDecrypting(false)
    }
  }

  const save = () => {
    if (!secret || !policy) return
    update.mutate({
      detail,
      previous: secret,
      draft: {
        memberLabel: secret.memberLabel,
        agentLabel: agentLabel.trim(),
        ...(secret.description ? { description: secret.description } : {}),
        ...(secret.iconReference ? { iconReference: secret.iconReference } : {}),
        entryType: secret.entryType,
        content: secret.content,
        policy,
      },
    }, {
      onSuccess: () => toast.success(t('vault.entry.agents.policySaved')),
      onError: () => toast.error(t('vault.entry.agents.policySaveError')),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl border border-[var(--cv-border)] bg-[var(--cv-card-bg)] p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-heading font-bold text-[var(--cv-t1)]">{t('vault.entry.agents.policyTitle')}</h3>
            <p className="mt-1 text-meta text-[var(--cv-t3)]">{t('vault.entry.agents.policyDescription')}</p>
          </div>
          {!secret ? (
            <Button variant="subtle" size="sm" icon="visibility" onClick={() => void decrypt()} disabled={decrypting}>
              {t('vault.entry.reveal')}
            </Button>
          ) : null}
        </div>
        {decryptError ? (
          <p className="text-meta text-[var(--cv-primary)]">{t('vault.entry.detail.decryptError')}</p>
        ) : secret && policy ? (
          <div className="flex flex-col gap-4">
            <FormInput id="entry-agent-label" label={t('vault.entries.visibility.agentLabel')} value={agentLabel}
              onChange={(event) => setAgentLabel(event.target.value)} disabled={update.isPending} maxLength={200} />
            <AgentVisibilityPolicyEditor type={entryType} customFields={secret.content.fields ?? []}
              policy={policy} disabled={update.isPending} onChange={setPolicy} />
            <SectionHeader>{t('vault.entry.agents.discoveryPreview')}</SectionHeader>
            {preview ? (
              <div className="rounded-xl border border-[var(--cv-border)] bg-[var(--cv-input-bg)] p-3">
                <p className="text-ui font-semibold text-[var(--cv-t1)]">{preview.agentLabel}</p>
                {preview.fields.map((field) => (
                  <div key={field.id} className="mt-2 flex gap-3 text-meta">
                    <span className="w-28 shrink-0 text-[var(--cv-t3)]">{field.id}</span>
                    <span className="min-w-0 break-all text-[var(--cv-t1)]">{
                      typeof field.value === 'string' ? field.value : JSON.stringify(field.value)
                    }</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-meta text-[var(--cv-t3)]">{t('vault.entry.agents.notDiscoverable')}</p>
            )}
            <div className="flex justify-end">
              <Button variant="accent" size="sm" onClick={save}
                disabled={!changed || !agentLabel.trim() || update.isPending}>
                {update.isPending ? t('vault.entry.detail.saving') : t('vault.entry.detail.save')}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <SectionHeader>{t('vault.entry.agents.grantsTitle', { entry: memberLabel })}</SectionHeader>
        <div className="mt-3">
          <OrgGrantsPanel entryId={entryId} allowRegrant={false} />
        </div>
      </section>
    </div>
  )
}
