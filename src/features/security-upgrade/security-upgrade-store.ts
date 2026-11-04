import { create } from 'zustand'
import { wipe } from '../../shared/crypto/sodium'
import { wipeSecurityUpgradeMaterial, type SecurityUpgradeMaterial } from '../../shared/crypto/account-security'
import { useAuthStore } from '../auth/stores/auth-store'
import type { SecurityUpgradeRequest } from './security-upgrade-api'

/**
 * A v1 account unlocked by password: the v2 material is ready but not committed.
 * Memory only — a closed tab restarts the upgrade at the next unlock.
 */
export interface PendingUpgrade {
  kind: 'upgrade'
  accountId: string
  email: string
  recoveryMnemonic: string[]
  material: SecurityUpgradeMaterial
  request: SecurityUpgradeRequest
  legacyPrivateKey: Uint8Array
  legacyMemberKeyVersion: number
}

/** A committed upgrade whose Vault envelopes still address the legacy key. */
export interface PendingResume {
  kind: 'resume'
  legacyPrivateKey: Uint8Array
  legacyMemberKeyVersion: number
}

export type PendingSecurityUpgrade = PendingUpgrade | PendingResume

interface SecurityUpgradeState {
  pending: PendingSecurityUpgrade | null
  begin: (pending: PendingSecurityUpgrade) => void
  clear: () => void
}

function wipePending(pending: PendingSecurityUpgrade | null): void {
  if (!pending) return
  wipe(pending.legacyPrivateKey)
  if (pending.kind === 'upgrade') wipeSecurityUpgradeMaterial(pending.material)
}

export const useSecurityUpgradeStore = create<SecurityUpgradeState>()((set, get) => ({
  pending: null,
  begin: (pending) => {
    wipePending(get().pending)
    set({ pending })
  },
  clear: () => {
    wipePending(get().pending)
    set({ pending: null })
  },
}))

// Lock, expiry and logout wipe the session keys; the pending upgrade goes with them.
useAuthStore.subscribe((state, previous) => {
  if (state.isVaultLocked && !previous.isVaultLocked) useSecurityUpgradeStore.getState().clear()
})

export function cancelSecurityUpgrade(): void {
  useSecurityUpgradeStore.getState().clear()
}
