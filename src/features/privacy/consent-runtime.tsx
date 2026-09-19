import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAuthStore, clientSessionGenerationMatches } from '../auth'
import { analytics } from '../../shared/lib/analytics'
import { isAnalyticsPaused } from '../../shared/lib/analytics-pause'
import { useConsents, useAnalyticsPaused } from './use-consents'

export function ConsentRuntime() {
  const consents = useConsents()
  const paused = useAnalyticsPaused(consents.userId)
  const accessToken = useAuthStore(state => state.accessToken)
  const routeId = useRouterState({ select: state => state.matches.at(-1)?.routeId ?? '__root__' })
  const consent = consents.data?.consents.find(value => value.purpose === 'product_analytics')
  const granted = consent?.status === 'granted' && !!consent.currentNotice
    && consent.noticeVersion === consent.currentNotice.version
  const deadline = (consents.data?.observedAt ?? 0) + (consents.data?.maxAgeSeconds ?? 0) * 1000

  useEffect(() => {
    const userId = consents.userId
    const generation = consents.data?.generation
    if (!consents.sessionAllowed || !userId || !accessToken || consents.isError || !granted || paused
      || generation === undefined || !clientSessionGenerationMatches(generation)) {
      analytics.reset()
      return
    }
    analytics.authorize(userId, deadline, () => {
      return useAuthStore.getState().userId === userId && !!useAuthStore.getState().accessToken
        && clientSessionGenerationMatches(generation) && !isAnalyticsPaused(userId)
    })
  }, [consents.sessionAllowed, consents.userId, accessToken, consents.isError, consent, granted, paused, deadline, consents.data?.generation])

  useEffect(() => {
    if (consents.sessionAllowed) analytics.pageview(routeId)
  }, [consents.sessionAllowed, routeId, consent?.activationRevision, granted, paused])

  useEffect(() => {
    const suspend = () => analytics.reset()
    window.addEventListener('offline', suspend)
    window.addEventListener('pagehide', suspend)
    return () => { window.removeEventListener('offline', suspend); window.removeEventListener('pagehide', suspend); analytics.reset() }
  }, [])
  return null
}
