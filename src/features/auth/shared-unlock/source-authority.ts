import type { AccountResponse } from '../../../shared/api/account-api'
import { randomBytes, wipe } from '../../../shared/crypto/sodium'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import type { SessionUnlockLimits } from '../lib/session-limits'
import { SharedUnlockApi, SharedUnlockApiError, type SharedUnlockOwnSession } from './api'
import type { SharedUnlockAuthorization, SharedUnlockPreference } from './api-types'

export interface ManualUnlockContext {
  readonly session: SharedUnlockOwnSession
  readonly account: AccountResponse
  readonly authCredential: Uint8Array
  readonly limits: SessionUnlockLimits
  assertCurrent(): void
}

export class SharedUnlockSourceAuthority {
  private version = 0
  private controller: AbortController | null = null
  private pendingProof: Uint8Array | null = null
  private checkSession: (() => void) | null = null
  private state: {
    preference: SharedUnlockPreference | null
    authorization: SharedUnlockAuthorization | null
    sourceGeneration: string | null
  } = { preference: null, authorization: null, sourceGeneration: null }

  private readonly api: SharedUnlockApi
  private readonly now: () => number
  private readonly beforeAuthorize: ((session: SharedUnlockOwnSession, signal: AbortSignal, check: () => void) => Promise<void>) | undefined
  private readonly onAuthorized: ((authorization: SharedUnlockAuthorization, session: SharedUnlockOwnSession) => void | number | Promise<number>) | undefined
  constructor(api: SharedUnlockApi, now: () => number = Date.now,
    beforeAuthorize?: (session: SharedUnlockOwnSession, signal: AbortSignal, check: () => void) => Promise<void>,
    onAuthorized?: (authorization: SharedUnlockAuthorization, session: SharedUnlockOwnSession) => void | number | Promise<number>) {
    this.onAuthorized = onAuthorized
    this.api = api
    this.now = now
    this.beforeAuthorize = beforeAuthorize
  }

  private closingRoot: { authorizationId: string; sequence: number; sourceGeneration: string } | null = null;
  /** RAM-only closing witness for this own key generation. Expiry removes sharing
   * authority, but must not disable authenticated lock/logout repair. */
  closingWitness() {
    try { this.checkSession?.(); } catch { this.reset(); }
    return this.closingRoot ? { ...this.closingRoot } : null;
  }

  private readonly activities = new Set<symbol>();
  /** Borrowed own RAM authority for input already admitted by the local key
   * session. A pending own renewal never advertises an expired source to peers. */
  captureActivity() {
    this.checkSession?.();
    const root = this.state.authorization, generation = this.state.sourceGeneration;
    if (!root || !generation || (this.activities.size === 0 && this.now() >= Math.min(root.idleDeadlineMs, root.absoluteDeadlineMs, root.offlineDeadlineMs))) {
      throw new SharedUnlockApiError("cancelled");
    }
    const version = this.version, ticket = Symbol();
    this.activities.add(ticket);
    const assertCurrent = () => {
      if (version !== this.version || !this.activities.has(ticket) || this.state.authorization?.authorizationId !== root.authorizationId
        || this.state.sourceGeneration !== generation) throw new SharedUnlockApiError("cancelled");
      this.checkSession?.();
      if (version !== this.version || !this.activities.has(ticket)) throw new SharedUnlockApiError("cancelled");
    };
    return { authorization: { ...root }, generation, assertCurrent,
      apply: (authorization: SharedUnlockAuthorization) => { assertCurrent(); this.state = { ...this.state, authorization: { ...authorization } }; this.notify(); },
      dispose: () => { this.activities.delete(ticket); },
    };
  }

  private readonly listeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private notify(): void {
    for (const listener of [...this.listeners]) {
      try { listener(); } catch { /* Sharing observers cannot undo own login/unlock. */ }
    }
  }
  /** Only the verified local receiver transaction supplies this own inherited
   * root. This never derives a password proof or renews original ceilings. */
  adopt(authorization: SharedUnlockAuthorization, generation: string, preference: SharedUnlockPreference,
    assertOwnCurrent: () => void): void {
    assertOwnCurrent();
    const selectedPreference = this.state.preference && this.state.preference.revision > preference.revision
      ? { ...this.state.preference } : { ...preference };
    this.reset();
    assertOwnCurrent();
    this.checkSession = assertOwnCurrent;
    this.closingRoot = { authorizationId: authorization.authorizationId, sequence: authorization.sequence, sourceGeneration: generation };
    this.state = { authorization: { ...authorization }, preference: selectedPreference, sourceGeneration: generation };
    this.notify();
  }

  reset(): void {
    this.closingRoot = null;
    this.activities.clear();
    this.version += 1
    this.controller?.abort()
    this.controller = null
    if (this.pendingProof) wipe(this.pendingProof)
    this.pendingProof = null
    this.checkSession = null
    this.state = { preference: null, authorization: null, sourceGeneration: null }
    this.notify();
  }

  snapshot() {
    try {
      this.checkSession?.()
      const a = this.state.authorization
      if (a && this.now() >= Math.min(a.idleDeadlineMs, a.absoluteDeadlineMs, a.offlineDeadlineMs)) {
        const expired = { ...this.state, authorization: null, sourceGeneration: null };
        if (!this.activities.size) this.state = expired;
        return { ...expired, preference: expired.preference ? { ...expired.preference } : null };
      }
    } catch { this.reset() }
    return { ...this.state,
      preference: this.state.preference ? { ...this.state.preference } : null,
      authorization: this.state.authorization ? { ...this.state.authorization } : null }
  }

  acceptPreference(preference: SharedUnlockPreference, generation: string): void {
    const current = this.snapshot();
    if (!current.authorization || current.sourceGeneration !== generation) throw new SharedUnlockApiError('cancelled');
    if (current.preference && preference.revision < current.preference.revision) return;
    this.state = { ...this.state, preference: { sharedUnlockEnabled: preference.sharedUnlockEnabled, revision: preference.revision } };
    if (current.preference?.sharedUnlockEnabled !== preference.sharedUnlockEnabled) this.notify();
  }

  async prepare(context: ManualUnlockContext): Promise<void> {
    this.reset()
    const version = this.version
    const controller = new AbortController()
    this.controller = controller
    this.pendingProof = context.authCredential
    const deadline = Date.now() + 10_000
    const timeout = setTimeout(() => { controller.abort(); wipe(context.authCredential) }, 10_000)
    const check = () => {
      if (version !== this.version || controller.signal.aborted || Date.now() >= deadline) throw new SharedUnlockApiError('cancelled')
      context.assertCurrent()
      if (version !== this.version || controller.signal.aborted || Date.now() >= deadline) throw new SharedUnlockApiError('cancelled')
    }
    try {
      check()
      const { account, session, limits } = context
      if (account.userId !== session.userId || !account.kdf) throw new SharedUnlockApiError('unauthorized')
      const bytes = await randomBytes(32)
      const generation = encodeBase64Url(bytes)
      wipe(bytes)
      check()
      await this.beforeAuthorize?.(session, controller.signal, check)
      check()
      const preference = await this.api.readPreference(session, controller.signal)
      check()
      this.state = { preference, authorization: null, sourceGeneration: null }
      let authorization = await this.api.authorize(session, {
        authCredential: encodeBase64Url(context.authCredential), sourceGeneration: generation,
        expectedPreferenceRevision: preference.revision,
        expectedCredentialRevision: account.kdf.credentialRevision,
        expectedPrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
        idleDeadlineMs: limits.idleDeadlineMs, absoluteDeadlineMs: limits.absoluteDeadlineMs,
        offlineDeadlineMs: limits.offlineDeadlineMs,
      }, controller.signal)
      check()
      const persistedDeadline = await new Promise<void | number>((resolve, reject) => {
        const cancelled = () => reject(new SharedUnlockApiError("cancelled"));
        if (controller.signal.aborted) { cancelled(); return; }
        controller.signal.addEventListener("abort", cancelled, { once: true });
        Promise.resolve().then(() => { check(); return this.onAuthorized?.(authorization, session); })
          .then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", cancelled));
      });
      if (persistedDeadline !== undefined) authorization = { ...authorization, idleDeadlineMs: Math.min(authorization.idleDeadlineMs, persistedDeadline) };
      check()
      this.closingRoot = { authorizationId: authorization.authorizationId, sequence: authorization.sequence, sourceGeneration: generation };
      this.checkSession = context.assertCurrent
      this.state = { preference, authorization, sourceGeneration: generation }
    } catch {
      // Own manual unlock remains valid when sharing is unavailable or requires step-up.
      if (version === this.version) this.state = { ...this.state, authorization: null, sourceGeneration: null }
    } finally {
      clearTimeout(timeout)
      wipe(context.authCredential)
      if (this.pendingProof === context.authCredential) this.pendingProof = null
      if (this.controller === controller) this.controller = null
      this.notify();
    }
  }
}
