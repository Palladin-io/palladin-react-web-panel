import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { createDefaultVaultSafe } from '../../../shared/lib/create-default-vault-safe'
import i18n from '../../../shared/lib/i18n'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
} from '../../auth/session/session-boundary'
import { registerAuthenticatedPrincipalProducerStop } from '../../../shared/lib/authenticated-principal-reset'
import { useMemberSyncStore } from './member-sync-store'

const RETRY_DELAYS_MS = [0, 250, 750] as const

interface DefaultVaultReconcilerProps {
  enabled: boolean
  memberPrivateKey: Uint8Array | null
}

/**
 * Repairs the required default-Vault invariant after an interrupted onboarding
 * attempt. It runs only after an authoritative member sync proves that no
 * default Vault exists and while the private key is available in memory.
 */
export function DefaultVaultReconciler({ enabled, memberPrivateKey }: DefaultVaultReconcilerProps) {
  const status = useMemberSyncStore((state) => state.status)
  const vaults = useMemberSyncStore((state) => state.vaults)
  const inFlight = useRef(false)
  const conflictSeen = useRef(false)

  const hasDefaultVault = Array.from(vaults.values()).some((vault) => vault.structure.isDefault)

  useEffect(() => {
    if (!enabled || !memberPrivateKey || hasDefaultVault) conflictSeen.current = false
  }, [enabled, hasDefaultVault, memberPrivateKey])

  useEffect(() => {
    if (!enabled || !memberPrivateKey || status !== 'ready'
      || hasDefaultVault || conflictSeen.current || inFlight.current) return

    const session = captureAuthenticatedSession()
    if (!authenticatedSessionMatches(session) || session.sessionBoundaryActive) return
    let cancelled = false
    const unregisterProducerStop = registerAuthenticatedPrincipalProducerStop(() => {
      cancelled = true
    })
    inFlight.current = true
    const reconcile = async () => {
      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length && !cancelled; attempt++) {
        if (RETRY_DELAYS_MS[attempt] > 0) {
          await new Promise((resolve) => window.setTimeout(resolve, RETRY_DELAYS_MS[attempt]))
        }
        if (cancelled) break
        const result = await createDefaultVaultSafe(
          memberPrivateKey,
          i18n.t('vault.defaultName'),
          session,
        )
        if (cancelled || !authenticatedSessionMatches(session)) return
        if (result === 'created') {
          if (!cancelled) useMemberSyncStore.getState().retry()
          return
        }
        if (result === 'already-exists') {
          conflictSeen.current = true
          if (!cancelled) useMemberSyncStore.getState().retry()
          return
        }
      }
      if (!cancelled) toast.error(i18n.t('vault.errorCreate'))
    }
    void reconcile().finally(() => {
      inFlight.current = false
    })
    return () => {
      cancelled = true
      inFlight.current = false
      unregisterProducerStop()
    }
  }, [enabled, hasDefaultVault, memberPrivateKey, status])

  return null
}
