import { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '../auth'
import { analytics } from '../../shared/lib/analytics'
import { matchesCurrentAnalyticsActivation, readLocalAnalyticsActivation, setLocalAnalyticsActivation } from '../../shared/lib/local-analytics-consent'
import { useConsents, useLocalActivation } from './use-consents'

export function ConsentRuntime() {
  const consents = useConsents()
  const activation = useLocalActivation(consents.userId)
  const accessToken = useAuthStore(state => state.accessToken)
  const routeId = useRouterState({ select: state => state.matches.at(-1)?.routeId ?? '__root__' })
  const consent = consents.data?.consents.find(value => value.purpose === 'product_analytics')
  const locallyActive = matchesCurrentAnalyticsActivation(consent, activation)
  const activationRevision = activation?.activationRevision
  const deadline = (consents.data?.observedAt ?? 0) + (consents.data?.maxAgeSeconds ?? 0) * 1000

  useEffect(() => {
    const userId = consents.userId
    if (!consents.sessionAllowed || !userId || !accessToken || consents.isError || !locallyActive) {
      analytics.reset()
      if (userId && consent && consent.status !== 'granted' && activationRevision) setLocalAnalyticsActivation(userId, null)
      return
    }
    analytics.authorize(userId, deadline, () => {
      const current = readLocalAnalyticsActivation(userId)
      return useAuthStore.getState().userId === userId && !!useAuthStore.getState().accessToken
        && matchesCurrentAnalyticsActivation(consent, current)
    })
  }, [consents.sessionAllowed, consents.userId, accessToken, consents.isError, consent, locallyActive, activationRevision, deadline])

  useEffect(() => {
    if (consents.sessionAllowed) analytics.pageview(routeId)
  }, [consents.sessionAllowed, routeId, consent?.activationRevision, activation?.activationRevision])

  useEffect(() => {
    const suspend = () => analytics.reset()
    window.addEventListener('offline', suspend)
    window.addEventListener('pagehide', suspend)
    return () => { window.removeEventListener('offline', suspend); window.removeEventListener('pagehide', suspend); analytics.reset() }
  }, [])
  return null
}
