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
  constructor(api: SharedUnlockApi, now: () => number = Date.now) {
    this.api = api
    this.now = now
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
    this.state = { authorization: { ...authorization }, preference: selectedPreference, sourceGeneration: generation };
    this.notify();
  }

  reset(): void {
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
      if (a && this.now() >= Math.min(a.idleDeadlineMs, a.absoluteDeadlineMs, a.offlineDeadlineMs)) this.reset()
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
  }

  async prepare(context: ManualUnlockContext): Promise<void> {
    this.reset()
    const version = this.version
    const controller = new AbortController()
    this.controller = controller
    this.pendingProof = context.authCredential
    const timeout = setTimeout(() => { controller.abort(); wipe(context.authCredential) }, 10_000)
    const check = () => {
      if (version !== this.version || controller.signal.aborted) throw new SharedUnlockApiError('cancelled')
      context.assertCurrent()
      if (version !== this.version || controller.signal.aborted) throw new SharedUnlockApiError('cancelled')
    }
    try {
      check()
      const { account, session, limits } = context
      if (account.userId !== session.userId || !account.kdf) throw new SharedUnlockApiError('unauthorized')
      const bytes = await randomBytes(32)
      const generation = encodeBase64Url(bytes)
      wipe(bytes)
      check()
      const preference = await this.api.readPreference(session, controller.signal)
      check()
      this.state = { preference, authorization: null, sourceGeneration: null }
      const authorization = await this.api.authorize(session, {
        authCredential: encodeBase64Url(context.authCredential), sourceGeneration: generation,
        expectedPreferenceRevision: preference.revision,
        expectedCredentialRevision: account.kdf.credentialRevision,
        expectedPrivateKeyWrapRevision: account.kdf.privateKeyWrapRevision,
        idleDeadlineMs: limits.idleDeadlineMs, absoluteDeadlineMs: limits.absoluteDeadlineMs,
        offlineDeadlineMs: limits.offlineDeadlineMs,
      }, controller.signal)
      check()
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
