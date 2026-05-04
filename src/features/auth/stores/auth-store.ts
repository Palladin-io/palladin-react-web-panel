import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: string | null
  isOnboarded: boolean
  permissions: number

  /**
   * Vault lock state. True whenever we do not currently hold the in-memory
   * master key + private key. A fresh login always starts locked; onboarding
   * and unlock both flip this to false by calling `unlockVault`.
   */
  isVaultLocked: boolean
  /** 32-byte Argon2id-derived master key. Never persisted. */
  masterKey: Uint8Array | null
  /** 32-byte X25519 private key recovered by decrypting the server blob. */
  privateKey: Uint8Array | null

  setTokens: (data: {
    accessToken: string
    refreshToken: string
    userId: string
    isOnboarded: boolean
    permissions?: number
  }) => void
  markOnboarded: () => void
  unlockVault: (masterKey: Uint8Array, privateKey: Uint8Array) => void
  lockVault: () => void
  logout: () => void
}

const initialState = {
  accessToken: null,
  refreshToken: null,
  userId: null,
  isOnboarded: false,
  permissions: 0,
  isVaultLocked: true,
  masterKey: null,
  privateKey: null,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      ...initialState,

      setTokens: (data) =>
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          userId: data.userId,
          isOnboarded: data.isOnboarded,
          permissions: data.permissions ?? 0,
          // isVaultLocked is intentionally NOT set here. On first load it is
          // true from initialState (not persisted). Silent token refreshes via
          // the 401 interceptor must not re-lock the vault mid-session — the
          // user should not need to re-enter their master password just because
          // the access token expired. Explicit locking uses lockVault().
        }),

      markOnboarded: () => set({ isOnboarded: true }),

      unlockVault: (masterKey, privateKey) =>
        // Store independent copies — callers routinely `wipe()` their local
        // buffers right after handing them off, which would zero out our
        // references too if we kept them.
        set({
          masterKey: new Uint8Array(masterKey),
          privateKey: new Uint8Array(privateKey),
          isVaultLocked: false,
        }),

      lockVault: () =>
        set({
          masterKey: null,
          privateKey: null,
          isVaultLocked: true,
        }),

      logout: () => set(initialState),
    }),
    {
      name: 'claw-vault-auth',
      // Only tokens + onboarding state survive a refresh.
      // Crypto keys (masterKey, privateKey) and isVaultLocked are intentionally
      // left out — the vault must be re-unlocked after every page reload.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userId: state.userId,
        isOnboarded: state.isOnboarded,
        permissions: state.permissions,
      }),
    },
  ),
)

export function getIsAuthenticated() {
  return useAuthStore.getState().accessToken !== null
}
