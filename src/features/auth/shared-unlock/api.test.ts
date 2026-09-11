import { expect, it, vi } from 'vitest'
import { SharedUnlockApi } from './api'
import fixtures from './fixtures/session-api-v1.json'

const apiUrl = 'https://api.example.test'
const own = { apiUrl, userId: 'account', accessToken: 'own-access', refreshToken: 'own-refresh' }
const input = { authCredential: 'synthetic-proof', sourceGeneration: 'generation', expectedPreferenceRevision: 3,
  expectedCredentialRevision: 3, expectedPrivateKeyWrapRevision: 5,
  idleDeadlineMs: 1800000100000, absoluteDeadlineMs: 1800000200000, offlineDeadlineMs: 1800000300000 }

for (const fixture of fixtures.responses.filter(r => r.type === 'authorization')) {
  it(`decodes provider ${fixture.name} without restating Identity invariants`, async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture.body)))
    const api = new SharedUnlockApi(fetcher, () => apiUrl)
    const result = await api.authorize(own, { ...input, refreshToken: 'untrusted-input' } as typeof input, new AbortController().signal)
    expect(result).toEqual(fixture.body)
    expect(JSON.parse(String(fetcher.mock.lastCall![1]!.body)).refreshToken).toBe('own-refresh')
  })
}

for (const stage of ['before-fetch', 'after-headers', 'after-json'] as const) {
  it(`rejects an environment change ${stage}`, async () => {
    let currentApiUrl = apiUrl
    let resolveHeaders!: (r: Response) => void
    let resolveJson!: (body: object) => void
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(r => { resolveHeaders = r }))
    const api = new SharedUnlockApi(fetcher, () => currentApiUrl)
    if (stage === 'before-fetch') currentApiUrl = 'https://other.example.test'
    const request = api.readPreference(own, new AbortController().signal)
    const rejected = expect(request).rejects.toMatchObject({ code: 'cancelled' })
    if (stage !== 'before-fetch') {
      const response = new Response('{}')
      if (stage === 'after-json') {
        vi.spyOn(response, 'json').mockImplementation(() => new Promise(r => { resolveJson = r }))
        resolveHeaders(response)
        await vi.waitFor(() => expect(response.json).toHaveBeenCalledOnce())
        currentApiUrl = 'https://other.example.test'
        resolveJson({ sharedUnlockEnabled: true, revision: 3 })
      } else {
        currentApiUrl = 'https://other.example.test'
        resolveHeaders(response)
      }
    }
    await rejected
    expect(fetcher).toHaveBeenCalledTimes(stage === 'before-fetch' ? 0 : 1)
  })
}
