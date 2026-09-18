import { describe, expect, it, vi } from 'vitest'
import fixture from './fixtures/consents-v2.json'
import { consentNotice, consentNoticeVersion } from '../lib/consent-notices'
import { getConsents, updateConsent, type UpdateConsent } from './consents-api'

const client = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('./client', () => ({ api: client }))

describe('versioned Identity consent contract', () => {
  it('reads receipts without API text and supplies the displayed client version', async () => {
    client.get.mockReturnValue({ json: async () => JSON.parse(JSON.stringify(fixture)) })
    const result = await getConsents('en')
    expect(result.consents[0]).toMatchObject({ revision: 3, activationRevision: 1, status: 'granted' })
    expect(result.consents[0].currentNotice?.text).toBe(consentNotice('product_analytics', 'en').text)
    expect(result.consents[1]).toMatchObject({ status: 'unknown', currentNotice: { version: consentNoticeVersion, locale: 'en' }, recordedAt: null })
    expect(result.maxAgeSeconds).toBe(60)
    expect(client.get).toHaveBeenCalledWith('api/account/consents', expect.objectContaining({
      cache: 'no-store', searchParams: { locale: 'en' },
    }))
  })

  it('sends the observed revision and explicit request ID without an automatic retry', async () => {
    const decision: UpdateConsent = { granted: false, expectedRevision: 3,
      requestId: '00000000-0000-4000-8000-000000000609', noticeVersion: 'test-v1', locale: 'en', source: 'web_settings' }
    client.put.mockReturnValue({ json: async () => fixture.consents[0] })
    await updateConsent('product_analytics', decision)
    expect(client.put).toHaveBeenCalledWith('api/account/consents/product_analytics', { json: decision, retry: 0 })
  })

  it('uses Polish client text even when an older API includes different server text', async () => {
    const legacy = structuredClone(fixture)
    client.get.mockReturnValue({ json: async () => ({ ...legacy, consents: legacy.consents.map(c => ({
      ...c, currentNotice: { version: 'server-old', locale: 'en', text: 'Old API text' },
    })) }) })
    const result = await getConsents('pl')
    expect(result.consents[0].currentNotice).toEqual(consentNotice('product_analytics', 'pl'))
    expect(result.consents[0].noticeVersion).toBe(fixture.consents[0].noticeVersion)
  })
})
