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

      logout: () => set(initialState),
    }),
    {
      name: 'palladin-auth',
      // Only tokens + onboarding state survive a refresh.
      // Crypto keys (masterKey, privateKey) and isVaultLocked are intentionally
      // left out — the vault must be re-unlocked after every page reload.
      //
      // ─── Threat model: tokens in localStorage ───────────────────────────────
      // We persist accessToken + refreshToken via `persist` (default
      // localStorage). This is deliberate, but worth spelling out so future
      // contributors don't change it without thinking through the trade-off.
      //
      // Mitigations that make this acceptable:
      //   • Strict CSP (no inline scripts, no eval, SRI on libsodium WASM —
      //     see CLAUDE.md → Security section). XSS injection surface is
      //     limited to package supply-chain compromise, which would compromise
      //     httpOnly cookies just as effectively (the malicious code would
      //     simply call /api with the user's credentials directly).
      //   • Refresh tokens rotate aggressively when within 7 days of
      //     expiry (see Identity module API doc).
      //   • Crypto keys (MK, privateKey, VK) are NEVER persisted — the
      //     zero-knowledge guarantee survives a stolen JWT because vault
      //     contents stay encrypted.
      //   • Session lifetime is bounded by master-password unlock UX: closing
      //     the tab destroys the in-memory keys, forcing a re-unlock.
      //
      // Why not httpOnly cookies?
      //   • The web panel is a pure SPA fetched from a different origin than
      //     the API in staging/prod, so SameSite=Lax cookies wouldn't carry.
      //     SameSite=None requires every request to be CORS-aware and adds a
      //     CSRF token on top — net complexity outweighs the marginal XSS
      //     hardening given the CSP above.
      //   • Browser extension and mobile clients pull tokens via the SDK;
      //     httpOnly would block that path.
      //
      // Revisit if: CSP weakens, we adopt third-party iframe widgets, or
      // refresh-token TTL grows to multi-day.
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        userId: state.userId,
        isOnboarded: state.isOnboarded,
        permissions: state.permissions,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state?.accessToken) return
        const payload = parseJwtPayload(state.accessToken)
        const raw = payload['permissions']
        const derived =
          typeof raw === 'number' ? raw
          : typeof raw === 'string' ? parseInt(raw, 10)
          : null
        if (derived !== null && !isNaN(derived)) {
          state.permissions = derived
        }
      },
    },
  ),
)

export function getIsAuthenticated() {
  return useAuthStore.getState().accessToken !== null
}
