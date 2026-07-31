import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { parseJwtPayload } from '../../../shared/lib/jwt'
import { wipe } from '../../../shared/crypto/sodium'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: string | null
  isOnboarded: boolean
  /**
   * Whether the account's email is verified. OAuth accounts are always
   * verified; password accounts start unverified until they consume the
   * verification link. Feeds the hard email-verification gate's `beforeLoad`
   * fast path (see `_authenticated.tsx`) — a `false` here redirects to
   * `/verify-email`. Persisted so a reload has an immediate signal before the
   * server-authoritative account query resolves.
   */
  emailVerified: boolean
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
    emailVerified?: boolean
    permissions?: number
  }) => void
  markOnboarded: () => void
  /** Flip to verified after the user consumes their verification link. */
  markEmailVerified: () => void
  unlockVault: (
    masterKey: Uint8Array,
    privateKey: Uint8Array,
  ) => void
  lockVault: () => void
  /** Session timeout: wipes crypto keys AND the access token, so a walked-away tab holds neither. */
  expireSession: () => void
  logout: () => void
}

const initialState = {
  accessToken: null,
  refreshToken: null,
  userId: null,
  isOnboarded: false,
  emailVerified: false,
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

          // Prefer the JWT `email_verified` claim; fall back to the response
          // body. Like isOnboarded, this never regresses true→false: a stale
          // refresh claim must not resurrect the banner for a verified user.
          const claimVerified = jwtPayload['email_verified']
          const emailVerified =
            state.emailVerified ||
            claimVerified === true ||
            data.emailVerified === true

          return {
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            userId: data.userId,
            // Never regress isOnboarded from true to false. The JWT claim can
            // return false during a token refresh (backend omission or stale
            // claim), which would break the lock-redirect logic and cause the
            // wizard to appear for already-onboarded users.
            isOnboarded: state.isOnboarded || data.isOnboarded,
            emailVerified,
            permissions,
            // isVaultLocked is intentionally NOT set here — see lockVault().
          }
        }),

      markOnboarded: () => set({ isOnboarded: true }),

      markEmailVerified: () => set({ emailVerified: true }),

      unlockVault: (masterKey, privateKey) =>
        // Store independent copies — callers routinely `wipe()` their local
        // buffers right after handing them off, which would zero out our
        // references too if we kept them.
        set((state) => {
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return {
            masterKey: new Uint8Array(masterKey),
            privateKey: new Uint8Array(privateKey),
            isVaultLocked: false,
          }
        }),

      lockVault: () =>
        set((state) => {
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return { masterKey: null, privateKey: null, isVaultLocked: true }
        }),

      expireSession: () =>
        set((state) => {
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return { masterKey: null, privateKey: null, isVaultLocked: true, accessToken: null }
        }),

      logout: () => set((state) => {
        if (state.masterKey) wipe(state.masterKey)
        if (state.privateKey) wipe(state.privateKey)
        return initialState
      }),
    }),
    {
      name: 'palladin-auth',
      // accessToken and crypto keys are in-memory only; only the refresh token
      // (which alone can't decrypt any vault content) is persisted, pending a
      // backend-coordinated move to an httpOnly cookie. See docs/architecture/security.md.
      partialize: (state) => ({
        refreshToken: state.refreshToken,
        userId: state.userId,
        isOnboarded: state.isOnboarded,
        emailVerified: state.emailVerified,
        permissions: state.permissions,
      }),
    },
  ),
)

export function getIsAuthenticated() {
  // A persisted refresh token counts as authenticated — accessToken is null after a reload.
  const { accessToken, refreshToken } = useAuthStore.getState()
  return accessToken !== null || refreshToken !== null
}
