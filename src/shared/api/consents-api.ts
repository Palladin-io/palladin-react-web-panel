import { api } from './client'
import { consentNotice } from '../lib/consent-notices'

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
type ConsentReceipt = Omit<UserConsent, 'currentNotice'>
interface ConsentReceipts { consents: ConsentReceipt[]; maxAgeSeconds: number }
const withNotice = (receipt: ConsentReceipt, locale: string): UserConsent => ({
  ...receipt, currentNotice: consentNotice(receipt.purpose, locale),
})

export const getConsents = async (locale: string, signal?: AbortSignal): Promise<UserConsents> => {
  const response = await api.get('api/account/consents', { searchParams: { locale }, signal, cache: 'no-store' }).json<ConsentReceipts>()
  return { ...response, consents: response.consents.map(receipt => withNotice(receipt, locale)) }
}
export const updateConsent = async (purpose: ConsentPurpose, decision: UpdateConsent): Promise<UserConsent> => {
  const receipt = await api.put(`api/account/consents/${purpose}`, { json: decision, retry: 0 }).json<ConsentReceipt>()
  return withNotice(receipt, decision.locale)
}
