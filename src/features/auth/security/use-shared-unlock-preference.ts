import { combineAbortSignals } from "../../../shared/lib/combine-abort-signals";
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { SharedUnlockApi, SharedUnlockApiError } from '../shared-unlock/api'
import type { SharedUnlockPreference } from '../shared-unlock/api-types'
import { acceptSharedUnlockPreference, getSharedUnlockSourceSnapshot } from '../shared-unlock/manual-source'
import { sharedUnlockPreferenceGate } from '../shared-unlock/preference-runtime'
import { saveSharedUnlockPreference } from '../shared-unlock/save-preference'
import { sharedUnlockPreferences } from '../shared-unlock/preference-state-runtime'

const api = new SharedUnlockApi((...args) => fetch(...args), () => env.apiUrl)

function captureOwnSession(accountId: string | null, generation: number) {
  const own = useAuthStore.getState(), apiUrl = env.apiUrl, abort = new AbortController()
  if (!accountId || own.userId !== accountId || !own.accessToken || !own.sessionId
    || own.cryptoSessionGeneration !== generation) throw new SharedUnlockApiError('unauthorized')
  const session = { userId: accountId, apiUrl, accessToken: own.accessToken, sessionId: own.sessionId }
  const check = () => {
    const current = useAuthStore.getState()
    if (abort.signal.aborted || current.userId !== accountId || current.cryptoSessionGeneration !== generation
      || current.accessToken !== session.accessToken || current.sessionId !== session.sessionId
      || env.apiUrl !== apiUrl) throw new SharedUnlockApiError('cancelled')
  }
  const unsubscribe = useAuthStore.subscribe(() => { try { check() } catch { abort.abort() } })
  return { session, signal: abort.signal, check, dispose: () => { unsubscribe(); abort.abort() },
    accept: (preference: SharedUnlockPreference) => {
      check()
      const source = getSharedUnlockSourceSnapshot()
      if (source.authorization?.accountId === accountId && source.sourceGeneration) {
        acceptSharedUnlockPreference(preference, source.sourceGeneration)
      }
      sharedUnlockPreferences.observe({ accountId, apiUrl }, preference)
    } }
}

export function useSharedUnlockPreference() {
  const accountId = useAuthStore(state => state.userId)
  const generation = useAuthStore(state => state.cryptoSessionGeneration)
  const client = useQueryClient()
  const queryKey = ['account', 'shared-unlock-preference', env.apiUrl, accountId, generation] as const
  const preference = useQuery({
    queryKey,
    enabled: Boolean(accountId),
    retry: false,
    refetchInterval: 15_000,
    queryFn: async ({ signal }) => {
      const own = captureOwnSession(accountId, generation)
      const timeout = AbortSignal.timeout(10_000)
      try {
        const result = await api.readPreference(own.session, combineAbortSignals([signal, own.signal, timeout]))
        own.check(); own.accept(result)
        const locallyAllowed = await sharedUnlockPreferenceGate.isAllowed({ accountId: own.session.userId, apiUrl: own.session.apiUrl })
        own.check()
        return { ...result, locallyPaused: !locallyAllowed }
      } finally { own.dispose() }
    },
  })
  const save = useMutation({
    mutationFn: async ({ enabled, revision, pause }: { enabled: boolean; revision: number; pause?: ReturnType<typeof sharedUnlockPreferenceGate.pause> }) => {
      const own = captureOwnSession(accountId, generation)
      try {
        return await saveSharedUnlockPreference({ session: own.session, signal: own.signal,
          assertCurrent: own.check, accept: value => {
            own.accept(value)
            sharedUnlockPreferences.saved({ accountId: own.session.userId, apiUrl: own.session.apiUrl })
          }, enabled, revision, pause }, api, sharedUnlockPreferenceGate)
      } finally { own.dispose() }
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  })
  useEffect(() => sharedUnlockPreferenceGate.subscribe(scope => {
    if (scope.accountId === accountId && scope.apiUrl === env.apiUrl) {
      void client.invalidateQueries({ queryKey: ['account', 'shared-unlock-preference', env.apiUrl, accountId, generation] })
    }
  }), [accountId, generation, client])
  useEffect(() => sharedUnlockPreferences.subscribe(({ scope }) => {
    if (scope.accountId === accountId && scope.apiUrl === env.apiUrl) {
      void client.invalidateQueries({ queryKey: ['account', 'shared-unlock-preference', env.apiUrl, accountId, generation] })
    }
  }), [accountId, generation, client])

  const change = (input: { enabled: boolean; revision: number }) => {
    let pause: ReturnType<typeof sharedUnlockPreferenceGate.pause> | undefined
    try {
      const own = captureOwnSession(accountId, generation)
      try {
        own.check()
        pause = sharedUnlockPreferenceGate.pause({ accountId: own.session.userId, apiUrl: own.session.apiUrl })
      } finally { own.dispose() }
    } catch { /* The mutation reports an unavailable own session through the UI. */ }
    save.mutate({ ...input, pause })
  }
  return { preference, save: { ...save, mutate: change } }
}
