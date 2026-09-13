import { useEffect, useState } from 'react'
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouterState } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useAuthStore, captureClientSessionGeneration, clientSessionGenerationMatches } from '../auth'
import { consentQueryKey, getConsents, updateConsent, type ConsentPurpose, type UpdateConsent } from '../../shared/api/consents-api'
import { analytics } from '../../shared/lib/analytics'
import { readLocalAnalyticsActivation, setLocalAnalyticsActivation, subscribeLocalAnalyticsConsent } from '../../shared/lib/local-analytics-consent'

export function useConsents() {
  const sessionAllowed = useRouterState({ select: state => state.matches.some(match => match.staticData.consentSession === true) })
  const queryClient = useQueryClient()
  const userId = useAuthStore(state => state.userId)
  const accessToken = useAuthStore(state => state.accessToken)
  const refreshToken = useAuthStore(state => state.refreshToken)
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
      return { ...response, observedAt }
    },
    enabled: sessionAllowed && !!userId && !!(accessToken || refreshToken),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false,
  })
  useEffect(() => {
    if (!sessionAllowed) void queryClient.cancelQueries({ queryKey: ['account-consents'] })
  }, [sessionAllowed, queryClient])
  return { ...query, userId, locale, sessionAllowed }
}

export function useLocalActivation(userId: string | null) {
  const [, rerender] = useState(0)
  useEffect(() => subscribeLocalAnalyticsConsent(() => rerender(value => value + 1)), [])
  return userId ? readLocalAnalyticsActivation(userId) : null
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
        setLocalAnalyticsActivation(userId, null)
      }
      await queryClient.cancelQueries({ queryKey: ['account-consents', userId] })
      if (!onlineManager.isOnline()) throw new Error('Consent save is offline')
      const result = await updateConsent(purpose, decision)
      if (!clientSessionGenerationMatches(generation) || useAuthStore.getState().userId !== userId) {
        throw new Error('Stale account session')
      }
      // Refresh the old (possibly unknown/denied) query before publishing a local
      // activation. Otherwise the runtime correctly clears it against that old row.
      await queryClient.invalidateQueries({ queryKey: ['account-consents', userId] }, { throwOnError: true })
      if (!clientSessionGenerationMatches(generation) || useAuthStore.getState().userId !== userId) {
        throw new Error('Stale account session')
      }
      if (!onlineManager.isOnline()) throw new Error('Consent confirmation is offline')
      if (purpose === 'product_analytics' && decision.granted && result.status === 'granted'
        && result.revision === decision.expectedRevision + 1 && result.noticeVersion === decision.noticeVersion) {
        if (!setLocalAnalyticsActivation(userId, { noticeVersion: result.noticeVersion, noticeLocale: decision.locale, activationRevision: result.activationRevision })) {
          throw new Error('Local activation could not be saved')
        }
      }
      return result
    },
    onError: async () => { await queryClient.invalidateQueries({ queryKey: ['account-consents'] }) },
  })
}
