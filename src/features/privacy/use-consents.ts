import { useEffect, useRef, useSyncExternalStore } from 'react'
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore, captureClientSessionGeneration, clientSessionGenerationMatches } from '../auth'
import { consentQueryKey, getConsents, updateConsent, type ConsentPurpose, type UpdateConsent } from '../../shared/api/consents-api'
import { analytics } from '../../shared/lib/analytics'
import { isAnalyticsPaused, pauseAnalytics, subscribeAnalyticsPause } from '../../shared/lib/analytics-pause'

export function useConsents() {
  const sessionAllowed = useRouterState({ select: state => state.matches.some(match => match.staticData.consentSession === true) })
  const queryClient = useQueryClient()
  const userId = useAuthStore(state => state.userId)
  const accessToken = useAuthStore(state => state.accessToken)
  const sessionId = useAuthStore(state => state.sessionId)
  const { i18n } = useTranslation()
  const locale = i18n.language.startsWith('pl') ? 'pl' : 'en'
  const query = useQuery({
    queryKey: consentQueryKey(userId, locale),
    queryFn: async ({ signal }) => {
      if (!sessionAllowed) throw new Error('Consent is unavailable on this route')
      const observedAt = Date.now()
      const generation = captureClientSessionGeneration()
      const response = await getConsents(locale, signal)
      if (!clientSessionGenerationMatches(generation) || useAuthStore.getState().userId !== userId) {
        throw new Error('Stale account session')
      }
      return { ...response, observedAt, generation }
    },
    enabled: sessionAllowed && !!userId && !!(accessToken || sessionId),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false,
  })
  useEffect(() => {
    if (!sessionAllowed) void queryClient.cancelQueries({ queryKey: ['account-consents'] })
  }, [sessionAllowed, queryClient])
  return { ...query, userId, locale, sessionAllowed, invalidated: queryClient.getQueryState(consentQueryKey(userId, locale))?.isInvalidated ?? true }
}

// A form can suspend capture while editing/saving, but never stores a second consent.
export function useAnalyticsPause(userId: string | null) {
  const release = useRef<(() => void) | null>(null)
  const resume = () => { release.current?.(); release.current = null }
  useEffect(() => () => { release.current?.(); release.current = null }, [userId])
  return {
    pause: () => { if (userId && !release.current) release.current = pauseAnalytics(userId) },
    resume,
  }
}

export function useAnalyticsPaused(userId: string | null) {
  return useSyncExternalStore(subscribeAnalyticsPause, () => !!userId && isAnalyticsPaused(userId))
}

export function useChangeConsent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['account-consent-decision'],
    // Optional decisions must fail immediately offline, never queue for reconnect.
    networkMode: 'always',
    retry: false,
    mutationFn: async ({ purpose, decision }: { purpose: ConsentPurpose; decision: UpdateConsent }) => {
      const userId = useAuthStore.getState().userId
      const generation = captureClientSessionGeneration()
      if (!userId) throw new Error('Missing account session')
      if (purpose === 'product_analytics') {
        analytics.reset()
      }
      await queryClient.cancelQueries({ queryKey: ['account-consents', userId] })
      if (!onlineManager.isOnline()) throw new Error('Consent save is offline')
      const result = await updateConsent(purpose, decision)
      if (!clientSessionGenerationMatches(generation) || useAuthStore.getState().userId !== userId) {
        throw new Error('Stale account session')
      }
      // Only a fresh authenticated read can authorize capture after a write.
      await queryClient.invalidateQueries({ queryKey: ['account-consents', userId] }, { throwOnError: true })
      if (!clientSessionGenerationMatches(generation) || useAuthStore.getState().userId !== userId) {
        throw new Error('Stale account session')
      }
      if (!onlineManager.isOnline()) throw new Error('Consent confirmation is offline')
      return result
    },
    onError: async () => { await queryClient.invalidateQueries({ queryKey: ['account-consents'] }) },
  })
}
