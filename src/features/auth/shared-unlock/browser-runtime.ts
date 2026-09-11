import { randomBytes, wipe } from '../../../shared/crypto/sodium'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { env } from '../../../shared/lib/env'
import { sessionDeadline } from '../lib/session-limits'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from './api'
import { startSharedUnlockBrowserCoordinator } from './browser-coordinator'
import type { SharedUnlockBrowserRoute } from './browser-channel'
import { sharedUnlockLinks as links } from './link-runtime'
import { acceptSharedUnlockPreference, adoptSharedUnlockSource, getSharedUnlockSourceSnapshot, subscribeSharedUnlockSource } from './manual-source'
import { beginSharedUnlockSource } from './source'
import { beginSharedUnlockReceiver } from './receiver'

export function coordinateSharedUnlockBrowser(route: SharedUnlockBrowserRoute) {
  const api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)
  const scope = (accountId: string) => ({ accountId, apiUrl: route.apiUrl, webOrigin: route.webOrigin, extensionId: route.extensionId })
  const admissible = async (accountId: string, linkId: string) => {
    route.assertCurrent()
    const marker = await links.adopt(scope(accountId), linkId)
    route.assertCurrent()
    if (marker.pending.length || marker.disconnectId || marker.observed?.state === 'revoked') throw new Error('Shared unlock local link unavailable')
    return marker
  }
  return startSharedUnlockBrowserCoordinator(route, {
    role: 'web',
    nonce: async () => { const bytes = await randomBytes(32); try { return encodeBase64Url(bytes) } finally { wipe(bytes) } },
    readState: async () => {
      const own = useAuthStore.getState()
      if (!own.isVaultLocked && own.unlockLimits && Date.now() >= sessionDeadline(own.unlockLimits)) own.expireSession()
      const current = useAuthStore.getState(), state = getSharedUnlockSourceSnapshot()
      const status = current.isVaultLocked ? (current.userId ? 'locked' : 'signed-out') : 'unlocked'
      const source = status === 'unlocked' && state.authorization?.accountId === current.userId && state.sourceGeneration && state.preference?.sharedUnlockEnabled
        ? { organizationId: state.authorization.organizationId, generation: state.sourceGeneration } : null
      return { accountId: current.userId, status, source }
    },
    subscribe: changed => {
      const unwatch = useAuthStore.subscribe((own, before) => {
        if (own.cryptoSessionGeneration !== before.cryptoSessionGeneration || own.userId !== before.userId
          || own.accessToken !== before.accessToken || own.refreshToken !== before.refreshToken) changed()
      })
      const unsubscribe = subscribeSharedUnlockSource(changed)
      return () => { unwatch(); unsubscribe() }
    },
    selectLink: async (accountId, proposed) => {
      if (!proposed) throw new Error('Extension must select the profile link')
      return (await admissible(accountId, proposed)).linkId
    },
    prepareSource: async (accountId, organizationId, linkId, signal, assertCurrent) => {
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
      const marker = await admissible(binding.accountId, binding.linkId)
      if (signal.aborted || (marker.observed && binding.linkEpoch < marker.observed.epoch)) throw new Error('Shared unlock receiver selection expired')
    },
    source: (binding, signal, assertCurrent) => beginSharedUnlockSource({ apiUrl: route.apiUrl, binding, signal, assertCurrent }, api),
    receiver: (binding, signal, assertCurrent) => beginSharedUnlockReceiver({ apiUrl: route.apiUrl, binding,
      assertCurrent: () => { if (signal.aborted) throw new Error('Shared unlock attempt cancelled'); assertCurrent() } }, api,
    (authorization, generation, assertOwnCurrent) => adoptSharedUnlockSource(authorization, generation,
      { sharedUnlockEnabled: true, revision: binding.preferenceRevision }, () => {
        assertOwnCurrent(); if (env.apiUrl !== route.apiUrl) throw new Error('Shared unlock own environment changed')
      })),
  })
}
