import { SharedUnlockReconnectStaging } from './reconnect-staging'
import { sharedUnlockPreferences } from './preference-state-runtime'
import { startSharedUnlockPreferenceMonitor, type SharedUnlockPreferenceMonitorClient } from './preference-monitor'
import { startSharedUnlockReconnectMonitor } from './reconnect-monitor'
import { sharedUnlockPreferenceGate } from "./preference-runtime"
import { sharedUnlockExpiry } from './expiry-runtime'
import { randomBytes, wipe } from '../../../shared/crypto/sodium'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { env } from '../../../shared/lib/env'
import { sessionDeadline } from '../lib/session-limits'
import { useAuthStore } from '../stores/auth-store'
import { clearClientSession } from '../session/client-session'
import { startSharedUnlockLinkMonitor } from './link-monitor'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import { startSharedUnlockBrowserCoordinator } from './browser-coordinator'
import type { SharedUnlockBrowserRoute } from './browser-channel'
import { sharedUnlockLinks as links } from './link-runtime'
import { acceptSharedUnlockPreference, adoptSharedUnlockSource, getSharedUnlockClosingWitness, getSharedUnlockSourceSnapshot, isManualSharedUnlockPreparing, subscribeSharedUnlockSource } from './manual-source'
import { beginSharedUnlockSource } from './source'
import { beginSharedUnlockReceiver } from './receiver'

export function coordinateSharedUnlockBrowser(route: SharedUnlockBrowserRoute) {
  const api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)
  const scope = (accountId: string) => ({ accountId, apiUrl: route.apiUrl, webOrigin: route.webOrigin, extensionId: route.extensionId })
  const staging = new SharedUnlockReconnectStaging(route, accountId => coordinator.cancelPending(accountId))
  const admissible = async (accountId: string, linkId: string, receiving = false, linkEpoch?: number) => {
    route.assertCurrent()
    if (sharedUnlockPreferences.isDisabled(scope(accountId)) || !await sharedUnlockPreferenceGate.isAllowed(scope(accountId))) throw new Error("Shared unlock is locally paused")
    route.assertCurrent()
    const marker = await links.adopt(scope(accountId), linkId)
    route.assertCurrent()
    if (marker.pending.length || ((marker.disconnectId || marker.observed?.state === 'revoked') && !(receiving && staging.canStage(marker, linkEpoch)))) throw new Error('Shared unlock local link unavailable')
    return marker
  }
  const nonce = async () => { const bytes = await randomBytes(32); try { return encodeBase64Url(bytes) } finally { wipe(bytes) } }
  const subscribe = (changed: () => void) => {
    const unwatch = useAuthStore.subscribe((own, before) => {
      if (own.cryptoSessionGeneration !== before.cryptoSessionGeneration || own.userId !== before.userId
        || own.accessToken !== before.accessToken || own.refreshToken !== before.refreshToken) changed()
    })
    const unsubscribe = subscribeSharedUnlockSource(changed)
    return () => { unwatch(); unsubscribe() }
  }
  const monitor = startSharedUnlockLinkMonitor(route, {
    nonce, subscribe,
    capture: () => {
      const own = useAuthStore.getState(), root = getSharedUnlockClosingWitness()
      if (!own.userId || !own.accessToken || !own.refreshToken) return null
      const abort = new AbortController()
      const check = () => {
        const current = useAuthStore.getState(), authority = getSharedUnlockClosingWitness()
        if (abort.signal.aborted || current.cryptoSessionGeneration !== own.cryptoSessionGeneration || current.isVaultLocked !== own.isVaultLocked
          || current.userId !== own.userId || current.accessToken !== own.accessToken || current.refreshToken !== own.refreshToken
          || authority?.authorizationId !== root?.authorizationId || authority?.sourceGeneration !== root?.sourceGeneration) throw new Error('Shared link own root changed')
      }
      const unwatch = subscribe(() => { try { check() } catch { abort.abort() } })
      return { session: { apiUrl: route.apiUrl, userId: own.userId, accessToken: own.accessToken, refreshToken: own.refreshToken },
        sequence: root?.sequence, signal: abort.signal, assertCurrent: check, dispose: () => { unwatch(); abort.abort() } }
    },
    closeSession: async action => {
      if (action === 'logout') await clearClientSession()
      else if (!useAuthStore.getState().isVaultLocked) {
        // During fresh own manual authorization, a rootless Identity read
        // still refers to the previous root. Completion notifies the monitor
        // to compare against the new root; failure/timeout ends this deferral.
        if (!getSharedUnlockClosingWitness() && isManualSharedUnlockPreparing()) return
        useAuthStore.getState().lockVault()
      }
    },
  }, links, api)
  const coordinator = startSharedUnlockBrowserCoordinator(route, {
    role: 'web',
    nonce,
    readState: async () => {
      const own = useAuthStore.getState()
      if (!own.isVaultLocked && own.unlockLimits && Date.now() >= sessionDeadline(own.unlockLimits)) own.expireSession()
      const current = useAuthStore.getState(), state = getSharedUnlockSourceSnapshot()
      const status = current.isVaultLocked ? (current.userId ? 'locked' : 'signed-out') : 'unlocked'
      const source = status === 'unlocked' && current.userId && !sharedUnlockPreferences.isDisabled(scope(current.userId)) && await sharedUnlockPreferenceGate.isAllowed(scope(current.userId)) && state.authorization?.accountId === current.userId && state.sourceGeneration && state.preference?.sharedUnlockEnabled
        ? { organizationId: state.authorization.organizationId, generation: state.sourceGeneration } : null
      return { accountId: current.userId, status, source }
    },
    subscribe,
    selectLink: async (accountId, proposed, direction) => {
      if (!proposed) throw new Error('Extension must select the profile link')
      return (await admissible(accountId, proposed, direction === 'receiver')).linkId
    },
    prepareSource: async (accountId, organizationId, linkId, signal, assertAttempt) => {
      const assertCurrent = () => { assertAttempt(); sharedUnlockPreferenceGate.assertAllowed(scope(accountId)); sharedUnlockPreferences.assertNotDisabled(scope(accountId)) }
      const own = useAuthStore.getState(), state = getSharedUnlockSourceSnapshot()
      if (!own.accessToken || !own.refreshToken || own.userId !== accountId || own.isVaultLocked
        || state.authorization?.accountId !== accountId || state.authorization.organizationId !== organizationId || !state.sourceGeneration) throw new Error('Shared unlock source unavailable')
      const wait = <T>(promise: Promise<T>): Promise<T> => new Promise((resolve, reject) => {
        const cancelled = () => reject(new Error('Shared unlock preparation cancelled'));
        if (signal.aborted) cancelled(); else signal.addEventListener('abort', cancelled, { once: true });
        promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancelled));
      });
      const session = { apiUrl: route.apiUrl, userId: accountId, accessToken: own.accessToken, refreshToken: own.refreshToken }
      const root = state.authorization, generation = state.sourceGeneration
      const check = () => {
        assertCurrent()
        const current = useAuthStore.getState(), authority = getSharedUnlockSourceSnapshot()
        if (signal.aborted || current.cryptoSessionGeneration !== own.cryptoSessionGeneration || current.isVaultLocked
          || current.accessToken !== session.accessToken || current.refreshToken !== session.refreshToken || current.userId !== accountId
          || !current.unlockLimits || Date.now() >= sessionDeadline(current.unlockLimits)
          || authority.authorization?.authorizationId !== root.authorizationId || authority.sourceGeneration !== generation) throw new Error('Shared unlock source changed')
      }
      check(); await wait(route.verifyCurrent()); check()
      const preference = await wait(api.readPreference(session, signal)); check()
      acceptSharedUnlockPreference(preference, generation)
      if (!preference.sharedUnlockEnabled) throw new Error('Shared unlock is disabled')
      const marker = await wait(admissible(accountId, linkId)); check()
      let link
      try { link = await wait(api.readLink(session, linkId, signal)) }
      catch (error) {
        if (!(error instanceof SharedUnlockApiError) || error.code !== 'not-found' || marker.observed) throw error
        await wait(admissible(accountId, linkId)); check()
        link = await wait(api.createLink(session, linkId, preference.revision, signal))
      }
      check(); await wait(links.observe(scope(accountId), link)); await wait(admissible(accountId, linkId)); check()
      const active = await wait(api.activate(session, linkId, { authorizationId: root.authorizationId, sourceGeneration: generation,
        expectedRevision: link.revision, expectedPreferenceRevision: preference.revision }, signal))
      check(); await wait(links.observe(scope(accountId), active)); await wait(route.verifyCurrent()); check()
      const latest = await wait(admissible(accountId, linkId)); check()
      if (latest.observed?.revision !== active.revision) throw new Error('Shared unlock link changed')
      return { linkEpoch: active.epoch, preferenceRevision: preference.revision }
    },
    checkReceiver: async (binding, signal) => {
      const marker = await admissible(binding.accountId, binding.linkId, true, binding.linkEpoch)
      if (signal.aborted || (marker.observed && binding.linkEpoch < marker.observed.epoch)) throw new Error('Shared unlock receiver selection expired')
    },
    source: (binding, signal, assertCurrent) => beginSharedUnlockSource({ apiUrl: route.apiUrl, binding, signal,
      assertCurrent: () => { assertCurrent(); sharedUnlockPreferenceGate.assertAllowed(scope(binding.accountId)); sharedUnlockPreferences.assertNotDisabled(scope(binding.accountId)) } }, api),
    receiver: async (binding, signal, assertCurrent) => {
      const marker = await admissible(binding.accountId, binding.linkId, true, binding.linkEpoch); assertCurrent()
      const localLink = staging.capture(marker, binding, links, api)
      return beginSharedUnlockReceiver({ apiUrl: route.apiUrl, binding,
        confirmLocalLink: localLink.confirm,
        // One local publication transaction, after the fresh own Identity read.
        // All writers take their corresponding lock; never perform network IO here.
        publishWithLocalGuards: (sequence, deadlineMs, hardDeadlineMs, publish) =>
          sharedUnlockPreferenceGate.withAllowed(scope(binding.accountId), () =>
            links.withInstallable(scope(binding.accountId), binding.linkId, binding.linkEpoch, sequence, () =>
              sharedUnlockExpiry.withCheckpoint(scope(binding.accountId), sequence, deadlineMs, hardDeadlineMs, publish))),
        assertFreshAuthorization: (sequence, deadlineMs, hardDeadlineMs) => sharedUnlockExpiry.checkpoint(scope(binding.accountId), sequence, deadlineMs, hardDeadlineMs),
        assertCurrent: () => { if (signal.aborted) throw new Error('Shared unlock attempt cancelled'); assertCurrent(); localLink.assertCurrent(); sharedUnlockPreferenceGate.assertAllowed(scope(binding.accountId)); sharedUnlockPreferences.assertNotDisabled(scope(binding.accountId)) } }, api,
      (authorization, generation, assertOwnCurrent) => adoptSharedUnlockSource(authorization, generation,
        { sharedUnlockEnabled: true, revision: binding.preferenceRevision }, () => {
          assertOwnCurrent(); if (env.apiUrl !== route.apiUrl) throw new Error('Shared unlock own environment changed')
        }))
    },
  })
  const unsubscribeGate = sharedUnlockPreferenceGate.subscribe(changed => {
    if (changed.apiUrl === route.apiUrl) coordinator.cancelPending(changed.accountId)
  })
  const unsubscribePreferences = sharedUnlockPreferences.subscribe(change => {
    if (change.scope.apiUrl !== route.apiUrl) return
    try {
      const current = getSharedUnlockSourceSnapshot()
      if (change.preference && current.authorization?.accountId === change.scope.accountId && current.sourceGeneration) {
        acceptSharedUnlockPreference(change.preference, current.sourceGeneration)
      }
    } finally { coordinator.cancelPending(change.scope.accountId) }
  })
  const preferenceClient: SharedUnlockPreferenceMonitorClient = {
    nonce,
    subscribe: changed => {
      const remove = useAuthStore.subscribe((current, previous) => {
        if (current.userId !== previous.userId || current.cryptoSessionGeneration !== previous.cryptoSessionGeneration
          || current.accessToken !== previous.accessToken || current.refreshToken !== previous.refreshToken) changed()
      })
      const visible = () => { if (document.visibilityState === 'visible') changed() }
      window.addEventListener('focus', changed); window.addEventListener('online', changed)
      document.addEventListener('visibilitychange', visible)
      return () => { remove(); window.removeEventListener('focus', changed); window.removeEventListener('online', changed); document.removeEventListener('visibilitychange', visible) }
    },
    capture: () => {
      const { userId, accessToken, refreshToken, cryptoSessionGeneration } = useAuthStore.getState()
      if (!userId || !accessToken || !refreshToken) return null
      const abort = new AbortController()
      const check = () => {
        const current = useAuthStore.getState()
        if (abort.signal.aborted || current.userId !== userId || current.cryptoSessionGeneration !== cryptoSessionGeneration
          || current.accessToken !== accessToken || current.refreshToken !== refreshToken || env.apiUrl !== route.apiUrl) throw new Error('Own preference session changed')
      }
      const unsubscribe = useAuthStore.subscribe(() => { try { check() } catch { abort.abort() } })
      return { session: { apiUrl: route.apiUrl, userId, accessToken, refreshToken },
        signal: abort.signal, assertCurrent: check, dispose: () => { unsubscribe(); abort.abort() } }
    },
  }
  const preferenceMonitor = startSharedUnlockPreferenceMonitor(route, preferenceClient, sharedUnlockPreferences, api)
  const reconnectMonitor = startSharedUnlockReconnectMonitor(route, preferenceClient, links, api, accountId => coordinator.cancelPending(accountId), staging)
  return { close: () => { unsubscribeGate(); unsubscribePreferences(); preferenceMonitor.close(); reconnectMonitor.close(); coordinator.close(); monitor.close() } }
}
