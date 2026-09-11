import { api } from './client'

export type ConsentPurpose = 'product_analytics' | 'email_marketing'
export type ConsentSource = 'web_onboarding' | 'web_settings'
export interface ConsentNotice { version: string; locale: string; text: string }
export interface UserConsent {
  purpose: ConsentPurpose
  scope: string
  status: 'unknown' | 'granted' | 'denied' | 'withdrawn'
  revision: number
  activationRevision: number
  recordedAt: string | null
  noticeVersion: string | null
  noticeLocale: string | null
  currentNotice: ConsentNotice | null
}
export interface UserConsents { consents: UserConsent[]; maxAgeSeconds: number }
export interface UpdateConsent {
  granted: boolean
  expectedRevision: number
  requestId: string
  noticeVersion: string
  locale: string
  source: ConsentSource
}

export const consentQueryKey = (userId: string | null, locale: string) => ['account-consents', userId, locale] as const
export const getConsents = (locale: string, signal?: AbortSignal) =>
  api.get('api/account/consents', { searchParams: { locale }, signal, cache: 'no-store' }).json<UserConsents>()
export const updateConsent = (purpose: ConsentPurpose, decision: UpdateConsent) =>
  api.put(`api/account/consents/${purpose}`, { json: decision, retry: 0 }).json<UserConsent>()
