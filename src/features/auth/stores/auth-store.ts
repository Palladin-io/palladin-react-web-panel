import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { parseJwtPayload } from '../../../shared/lib/jwt'

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
  /**
   * Idle / absolute session timeout. Wipes the in-memory crypto keys (like
   * `lockVault`) AND drops the in-memory access token, so a walked-away tab
   * holds neither the vault keys nor a usable bearer token. The persisted
   * refresh token still lets the API client silently mint a new access token on
   * the next request; the user must re-enter their master password to unlock.
   */
  expireSession: () => void
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
        set((state) => {
          const jwtPayload = parseJwtPayload(data.accessToken)
          const rawPerm = jwtPayload['permissions']
          const permissions =
            typeof rawPerm === 'number'
              ? rawPerm
              : typeof rawPerm === 'string'
                ? parseInt(rawPerm, 10)
                : (data.permissions ?? 0)

          return {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            userId: data.userId,
            // Never regress isOnboarded from true to false. The JWT claim can
            // return false during a token refresh (backend omission or stale
            // claim), which would break the lock-redirect logic and cause the
            // wizard to appear for already-onboarded users.
            isOnboarded: state.isOnboarded || data.isOnboarded,
            permissions,
            // isVaultLocked is intentionally NOT set here — see lockVault().
          }
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

      expireSession: () =>
        set({
          masterKey: null,
          privateKey: null,
          isVaultLocked: true,
          // Drop the in-memory access token too. The persisted refresh token
          // survives, so the ky client silently re-authenticates on the next
          // request — but no bearer token sits idle in memory in the meantime.
          accessToken: null,
        }),

      logout: () => set(initialState),
    }),
    {
      name: 'palladin-auth',
      // ─── What survives a page reload ────────────────────────────────────────
      // Persisted (localStorage): refresh token + onboarding/permissions hints.
      // NOT persisted:
      //   • accessToken — kept in memory ONLY. On reload it is null; the ky
      //     client silently mints a fresh one from the refresh token on the
      //     first request (see shared/api/client.ts). A short-lived bearer
      //     token no longer sits in localStorage where XSS could read it.
      //   • masterKey / privateKey / isVaultLocked — the vault must be
      //     re-unlocked with the master password after every reload.
      //
      // Threat model / mitigations:
      //   • The refresh token alone cannot decrypt any vault content — the
      //     zero-knowledge crypto keys (MK, privateKey, VK) are never persisted.
      //   • Idle + absolute session timeouts (see `expireSession` +
      //     useSessionTimeout) wipe the keys and drop the access token when the
      //     user walks away.
      //   • Refresh tokens rotate when within 7 days of expiry (Identity API).
      //
      // FOLLOW-UP (backend-coordinated, out of scope for this repo): move the
      // refresh token itself into an httpOnly, Secure, SameSite cookie so it is
      // never readable from JS at all. That requires the API to set/read the
      // cookie and a CSRF-token scheme on state-changing requests; tracked
      // separately.
      partialize: (state) => ({
        // Deliberately NO accessToken here — in-memory only.
        refreshToken: state.refreshToken,
        userId: state.userId,
        isOnboarded: state.isOnboarded,
        permissions: state.permissions,
      }),
    },
  ),
)

export function getIsAuthenticated() {
  // A restorable session counts as authenticated: after a reload the access
  // token is gone (in-memory only) but a persisted refresh token can silently
  // mint a new one.
  const { accessToken, refreshToken } = useAuthStore.getState()
  return accessToken !== null || refreshToken !== null
}
