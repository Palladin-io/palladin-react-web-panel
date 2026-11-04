import { useCallback, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { HTTPError } from 'ky'
import { ACCOUNT_QUERY_KEY, getAccount, memberKeySuiteOf } from '../../shared/api/account-api'
import { KEY_WRAPPER_SUITE } from '../../shared/crypto/key-wrapper'
import { emergencyKitMaterial, storeDeviceSecretKey, type EmergencyKitMaterial } from '../../shared/crypto/secret-key'
import { rewrapOwnMemberVaultKey } from '../../shared/crypto/vault-protocol'
import { organizationIdFromAccessToken } from '../../shared/lib/organization-scope'
import { useAuthStore } from '../auth/stores/auth-store'
import { listEncryptedVaults } from '../vaults/sync/member-sync-api'
import {
  deleteLegacyMemberKey,
  getKeyMigrationReport,
  replaceOwnMemberVaultKey,
  submitSecurityUpgrade,
} from './security-upgrade-api'
import { useSecurityUpgradeStore, type PendingSecurityUpgrade } from './security-upgrade-store'

export type UpgradeStage = 'phrase' | 'confirm' | 'commit' | 'rewrap' | 'cleanup' | 'kit'
export type UpgradeFailure = 'network' | 'conflict'

export interface UpgradeProgress {
  done: number
  total: number | null
}

function isConflict(error: unknown): boolean {
  return error instanceof HTTPError && error.response.status === 409
}

async function commitUpgrade(pending: Extract<PendingSecurityUpgrade, { kind: 'upgrade' }>): Promise<EmergencyKitMaterial> {
  const { material } = pending
  // Kept on this browser before the commit so an interrupted tab never loses the new Secret Key.
  await storeDeviceSecretKey(pending.accountId, material.secretKey)
  await submitSecurityUpgrade(pending.request)
  const kit = emergencyKitMaterial(pending.accountId, pending.email, material.secretKey)
  useAuthStore.getState().unlockVault(
    material.masterKey, material.memberKey.privateKey, undefined, material.memberKey.keySuiteId,
  )
  return kit
}

async function rewrapVaults(
  pending: PendingSecurityUpgrade,
  onProgress: (progress: UpgradeProgress) => void,
): Promise<void> {
  const account = await getAccount()
  const { privateKey, accessToken, userId } = useAuthStore.getState()
  const organizationId = organizationIdFromAccessToken(accessToken)
  const keySuiteId = memberKeySuiteOf(account)
  if (!privateKey || !userId || !organizationId || account.userId !== userId || !account.memberKeyVersion
    || keySuiteId !== useAuthStore.getState().memberKeySuiteId) {
    throw new Error('Vault was locked')
  }
  const vaults = await listEncryptedVaults()
  const stale = vaults.filter(({ memberVaultKey }) => {
    const descriptor = memberVaultKey.wrappedVaultKey.descriptor
    return descriptor.wrapperSuiteId !== keySuiteId || descriptor.recipientKeyVersion !== account.memberKeyVersion
  })
  onProgress({ done: 0, total: stale.length })
  for (const [index, vault] of stale.entries()) {
    const envelope = await rewrapOwnMemberVaultKey({
      vault: { ...vault, organizationId },
      memberId: userId,
      legacyKey: { keySuiteId: KEY_WRAPPER_SUITE.legacy, privateKey: pending.legacyPrivateKey },
      nextKey: { keySuiteId, privateKey, keyVersion: account.memberKeyVersion },
    })
    if (useAuthStore.getState().privateKey !== privateKey) throw new Error('Vault was locked')
    await replaceOwnMemberVaultKey(vault.id, vault.memberVaultKey.wrappedVaultKey.descriptor.recipientKeyVersion, envelope)
    onProgress({ done: index + 1, total: stale.length })
  }
}

/** Removes the legacy-key record once no Member envelope addresses the old key in any organization. */
async function cleanUp(pending: PendingSecurityUpgrade): Promise<void> {
  const report = await getKeyMigrationReport()
  if (report.memberEnvelopesPendingRewrap === 0) await deleteLegacyMemberKey(pending.legacyMemberKeyVersion)
}

/**
 * identity-kdf v3 migration, client side. Every stage is resumable: the commit
 * is idempotent per `migrationId`, re-wrap skips envelopes already addressed
 * to the current key, and a committed account resumes from its legacy-key record.
 */
export function useSecurityUpgradeRun(pending: PendingSecurityUpgrade) {
  const queryClient = useQueryClient()
  const [stage, setStage] = useState<UpgradeStage>(pending.kind === 'upgrade' ? 'phrase' : 'rewrap')
  const [progress, setProgress] = useState<UpgradeProgress>({ done: 0, total: null })
  const [failure, setFailure] = useState<UpgradeFailure | null>(null)
  const [running, setRunning] = useState(false)
  const [kit, setKit] = useState<EmergencyKitMaterial | null>(null)
  const runningRef = useRef(false)

  const run = useCallback(async (from: UpgradeStage) => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setFailure(null)
    let current = from
    try {
      if (current === 'commit' && pending.kind === 'upgrade') {
        setStage('commit')
        setKit(await commitUpgrade(pending))
        void queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
        current = 'rewrap'
      }
      if (current === 'rewrap') {
        setStage('rewrap')
        await rewrapVaults(pending, setProgress)
        current = 'cleanup'
      }
      if (current === 'cleanup') {
        setStage('cleanup')
        await cleanUp(pending)
        void queryClient.invalidateQueries({ queryKey: ACCOUNT_QUERY_KEY })
        void queryClient.invalidateQueries({ queryKey: ['vaults'] })
      }
      if (pending.kind === 'upgrade') setStage('kit')
      else useSecurityUpgradeStore.getState().clear()
    } catch (error) {
      setFailure(isConflict(error) ? 'conflict' : 'network')
    } finally {
      runningRef.current = false
      setRunning(false)
    }
  }, [pending, queryClient])

  const finish = useCallback(() => {
    setKit(null)
    useSecurityUpgradeStore.getState().clear()
  }, [])

  return { stage, setStage, progress, failure, running, kit, run, finish }
}
