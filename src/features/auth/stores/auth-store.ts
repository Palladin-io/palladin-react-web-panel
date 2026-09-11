import type { AuthResponse } from '../../../shared/api/types'
import type { SharedUnlockKeys } from '../../../shared/crypto/shared-unlock-keys'
import { IDLE_TIMEOUT_MS, sessionDeadline, unlockLimits, type SessionUnlockLimits } from '../lib/session-limits'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { parseJwtPayload } from '../../../shared/lib/jwt'
import { wipe } from '../../../shared/crypto/sodium'
import { isWaitlistDeveloperBenefitActive } from '../lib/waitlist-developer-benefit'

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
  /** Active waitlist Developer benefit window. Never persisted. */
  waitlistDeveloperBenefitStartedAt: string | null
  waitlistDeveloperBenefitEndsAt: string | null
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
  /** Non-secret cache namespace changed for every unlocked crypto session. */
  cryptoSessionGeneration: number
  unlockLimits: SessionUnlockLimits | null
  recordActivity: (at: number) => void

  setTokens: (data: AuthResponse & { permissions?: number }) => void
  /** Own Identity response + independently verified keys; one synchronous publication. */
  installSharedUnlock: (input: {
    expected: { userId: string | null; accessToken: string | null; refreshToken: string | null; cryptoSessionGeneration: number }
    accountId: string
    session: AuthResponse
    keys: SharedUnlockKeys
    limits: SessionUnlockLimits
  }) => number
  markOnboarded: () => void
  /** Flip to verified after the user consumes their verification link. */
  markEmailVerified: () => void
  /** Apply an active verified waitlist benefit to this in-memory session. */
  setWaitlistDeveloperBenefit: (
    startedAt: string | null | undefined,
    endsAt: string | null | undefined,
  ) => void
  unlockVault: (
    masterKey: Uint8Array,
    privateKey: Uint8Array,
    inheritedLimits?: SessionUnlockLimits,
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
  waitlistDeveloperBenefitStartedAt: null,
  waitlistDeveloperBenefitEndsAt: null,
  permissions: 0,
  isVaultLocked: true,
  masterKey: null,
  privateKey: null,
  cryptoSessionGeneration: 0,
  unlockLimits: null,
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setTokens: (data) => set((state) => tokenState(state, data)),

      installSharedUnlock: ({ expected, accountId, session, keys, limits }) => {
        const previous = get()
        let owned: SharedUnlockKeys | null = null
        let installedGeneration: number | null = null
        try {
          set((state) => {
            // The captured receiver session is independent of the peer payload.
            // A new login, refresh, manual unlock, lock or logout wins this race.
            if (!state.isVaultLocked || state.masterKey || state.privateKey
              || state.cryptoSessionGeneration !== expected.cryptoSessionGeneration
              || state.userId !== expected.userId || state.accessToken !== expected.accessToken
              || state.refreshToken !== expected.refreshToken
              || (state.userId !== null && state.userId !== accountId)
              || session.userId !== accountId) throw new Error('Shared unlock installation cancelled')
            const inherited = unlockLimits(Date.now(), limits)
            if (keys.masterKey.length !== 32 || keys.privateKey.length !== 32) throw new Error('Invalid shared unlock keys')
            const tokens = tokenState(state, session)
            owned = { masterKey: new Uint8Array(keys.masterKey), privateKey: new Uint8Array(keys.privateKey) }
            installedGeneration = state.cryptoSessionGeneration + 1
            return { ...tokens, ...owned, unlockLimits: inherited, isVaultLocked: false,
              cryptoSessionGeneration: installedGeneration }
          })
          const current = get()
          if (current.cryptoSessionGeneration !== installedGeneration || current.isVaultLocked) {
            throw new Error('Shared unlock installation cancelled')
          }
          return installedGeneration!
        } catch (error) {
          if (owned) {
            const allocated = owned as SharedUnlockKeys
            wipe(allocated.masterKey)
            wipe(allocated.privateKey)
            const current = get()
            // Persistence or a synchronous subscriber can fail after set() has
            // published. Roll back only this new lineage; never undo logout or
            // overwrite another login/unlock. An intervening expiry stays expired.
            if (current.userId === session.userId && current.refreshToken === session.refreshToken
              && (current.cryptoSessionGeneration === installedGeneration || current.isVaultLocked)) {
              try {
                set({ ...previous, accessToken: current.accessToken === null ? null : previous.accessToken,
                  cryptoSessionGeneration: current.cryptoSessionGeneration + 1,
                  masterKey: null, privateKey: null, unlockLimits: null, isVaultLocked: true })
              } catch { /* set updates memory before storage/subscriber errors; owned keys are already erased. */ }
            }
          }
          throw error
        }
      },

      markOnboarded: () => set({ isOnboarded: true }),

      markEmailVerified: () => set({ emailVerified: true }),

      setWaitlistDeveloperBenefit: (startedAt, endsAt) =>
        set(() => {
          const benefit = activeBenefitPeriod(startedAt, endsAt)
          return {
            waitlistDeveloperBenefitStartedAt: benefit.startedAt,
            waitlistDeveloperBenefitEndsAt: benefit.endsAt,
          }
        }),

      unlockVault: (masterKey, privateKey, inheritedLimits) =>
        // Store independent copies — callers routinely `wipe()` their local
        // buffers right after handing them off, which would zero out our
        // references too if we kept them.
        set((state) => {
          const limits = unlockLimits(Date.now(), inheritedLimits)
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return {
            unlockLimits: limits,
            masterKey: new Uint8Array(masterKey),
            privateKey: new Uint8Array(privateKey),
            isVaultLocked: false,
            cryptoSessionGeneration: (state.cryptoSessionGeneration ?? 0) + 1,
          }
        }),

      recordActivity: (at) => set((state) => {
        const limits = state.unlockLimits
        const now = Date.now()
        if (!Number.isSafeInteger(at) || state.isVaultLocked || !limits || at > now || at < limits.unlockedAtMs
          || now >= sessionDeadline(limits)) return state
        return { unlockLimits: { ...limits, idleDeadlineMs: Math.min(
          Math.max(limits.idleDeadlineMs, at + IDLE_TIMEOUT_MS), limits.absoluteDeadlineMs, limits.offlineDeadlineMs,
        ) } }
      }),

      lockVault: () =>
        set((state) => {
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return { masterKey: null, privateKey: null, unlockLimits: null, isVaultLocked: true,
            cryptoSessionGeneration: state.cryptoSessionGeneration + 1 }
        }),

      expireSession: () =>
        set((state) => {
          if (state.masterKey) wipe(state.masterKey)
          if (state.privateKey) wipe(state.privateKey)
          return { masterKey: null, privateKey: null, unlockLimits: null, isVaultLocked: true, accessToken: null,
            cryptoSessionGeneration: state.cryptoSessionGeneration + 1 }
        }),

      logout: () => set((state) => {
        if (state.masterKey) wipe(state.masterKey)
        if (state.privateKey) wipe(state.privateKey)
        return {
          ...initialState,
          cryptoSessionGeneration: (state.cryptoSessionGeneration ?? 0) + 1,
        }
      }),
    }),
    {
      name: 'palladin-auth',
      merge: (persisted, current) => {
        const saved = typeof persisted === 'object' && persisted !== null ? persisted as Partial<AuthState> : {}
        return {
          ...current,
          refreshToken: typeof saved.refreshToken === 'string' ? saved.refreshToken : null,
          userId: typeof saved.userId === 'string' ? saved.userId : null,
          isOnboarded: saved.isOnboarded === true,
          emailVerified: saved.emailVerified === true,
          permissions: typeof saved.permissions === 'number' ? saved.permissions : 0,
        }
      },
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

function activeBenefitPeriod(
  startedAt: string | null | undefined,
  endsAt: string | null | undefined,
): { startedAt: string | null; endsAt: string | null } {
  if (typeof startedAt !== 'string' || typeof endsAt !== 'string') {
    return { startedAt: null, endsAt: null }
  }

  if (!isWaitlistDeveloperBenefitActive(startedAt, endsAt)) {
    return { startedAt: null, endsAt: null }
  }

  return { startedAt, endsAt }
}

export function getIsAuthenticated() {
  // A persisted refresh token counts as authenticated — accessToken is null after a reload.
  const { accessToken, refreshToken } = useAuthStore.getState()
  return accessToken !== null || refreshToken !== null
}

function tokenState(state: AuthState, data: AuthResponse & { permissions?: number }) {
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

  const sameUser = state.userId === data.userId
  const responseOmittedBenefit =
    data.waitlistDeveloperBenefitStartedAt === undefined &&
    data.waitlistDeveloperBenefitEndsAt === undefined
  const benefit = responseOmittedBenefit && sameUser
    ? {
        startedAt: state.waitlistDeveloperBenefitStartedAt,
        endsAt: state.waitlistDeveloperBenefitEndsAt,
      }
    : activeBenefitPeriod(
        data.waitlistDeveloperBenefitStartedAt,
        data.waitlistDeveloperBenefitEndsAt,
      )

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
    waitlistDeveloperBenefitStartedAt: benefit.startedAt,
    waitlistDeveloperBenefitEndsAt: benefit.endsAt,
    permissions,
    // isVaultLocked is intentionally NOT set here — see lockVault().
  }
}
