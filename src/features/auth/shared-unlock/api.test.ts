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

for (const fixture of fixtures.responses.filter(r => r.type === 'operation' || r.type === 'commit')) {
  it(`receives ${fixture.name} directly from Identity without any peer/own bearer or cookies`, async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(fixture.body)))
    const api = new SharedUnlockApi(fetcher, () => apiUrl)
    const action = fixture.type === 'commit' ? 'commit' : 'consume'
    const result = await api[action](apiUrl, 'operation/with?#characters', 'synthetic-receiver-proof', new AbortController().signal)
    expect(result).toEqual(fixture.body)
    expect(fetcher).toHaveBeenCalledOnce()
    const [url, options] = fetcher.mock.lastCall!
    expect(url).toBe(`${apiUrl}/api/auth/shared-unlock/operations/operation%2Fwith%3F%23characters/${action}`)
    expect(options).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
    expect(new Headers(options?.headers).has('authorization')).toBe(false)
    expect(JSON.parse(String(options?.body))).toEqual({ signature: 'synthetic-receiver-proof' })
  })
}

for (const status of [401, 403, 404, 409, 429, 503]) {
  it(`does not retry or refresh a receiver proof after HTTP ${status}`, async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status }))
    const api = new SharedUnlockApi(fetcher, () => apiUrl)
    await expect(api.commit(apiUrl, 'operation', 'synthetic-receiver-proof', new AbortController().signal)).rejects.toThrow('Shared unlock request failed')
    expect(fetcher).toHaveBeenCalledOnce()
  })
}

it('reports an available late commit body for own-lineage cleanup before rejecting cancellation', async () => {
  const body = fixtures.responses.find(r => r.type === 'commit')!.body
  let respond!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(resolve => { respond = resolve }))
  let currentApiUrl = apiUrl
  const api = new SharedUnlockApi(fetcher, () => currentApiUrl)
  const issued = vi.fn()
  const abort = new AbortController()
  const pending = api.commit(apiUrl, 'operation', 'synthetic-proof', abort.signal, issued)
  const rejected = expect(pending).rejects.toMatchObject({ code: 'cancelled' })
  abort.abort()
  currentApiUrl = 'https://other.example.test'
  respond(new Response(JSON.stringify(body)))
  await rejected
  expect(issued).toHaveBeenCalledExactlyOnceWith(body)
})

it('bounds cleanup to two seconds on the original API without changing the current session', async () => {
  vi.useFakeTimers()
  try {
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(() => {}))
    const api = new SharedUnlockApi(fetcher, () => 'https://new-environment.example.test')
    const pending = api.revokeIssuedSession(apiUrl, 'synthetic-new-own-refresh')
    await vi.advanceTimersByTimeAsync(2000)
    await pending
    const [url, options] = fetcher.mock.lastCall!
    expect(url).toBe(`${apiUrl}/api/auth/logout`)
    expect(new Headers(options?.headers).has('authorization')).toBe(false)
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(options?.signal?.aborted).toBe(true)
    expect(JSON.parse(String(options?.body))).toEqual({ refreshToken: 'synthetic-new-own-refresh' })
    expect(fetcher).toHaveBeenCalledOnce()
  } finally { vi.useRealTimers() }
})

for (const fixture of fixtures.responses.filter(row => row.type === 'operation')) {
  it(`creates ${fixture.name} using only the source own Identity session`, async () => {
    const operation = fixture.body as import('./api-types').SharedUnlockOperation
    const context = operation.context
    const request: import('./api-types').SharedUnlockOperationInput = {
      authorizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', linkId: context.linkId, linkEpoch: context.linkEpoch,
      expectedPreferenceRevision: context.preferenceRevision, recipientOrganizationId: context.organizationId,
      idleDeadlineMs: context.idleDeadlineMs, absoluteDeadlineMs: context.absoluteDeadlineMs, offlineDeadlineMs: context.offlineDeadlineMs,
      direction: context.direction, apiOrigin: context.apiOrigin, webOrigin: context.webOrigin, extensionId: context.extensionId,
      documentBinding: context.documentBinding, webGeneration: context.webGeneration, extensionGeneration: context.extensionGeneration,
      sourcePublicKey: operation.sourcePublicKey, recipientPublicKey: operation.recipientPublicKey,
      recipientProofPublicKey: operation.recipientProofPublicKey,
    }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(operation)))
    const api = new SharedUnlockApi(fetcher, () => apiUrl)
    const extended = { ...request, refreshToken: 'peer-must-not-choose-this' }
    expect(await api.createOperation(own, extended, new AbortController().signal)).toEqual(operation)
    const [url, init] = fetcher.mock.lastCall!
    expect(url).toBe(apiUrl + '/api/account/shared-unlock/operations')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer' })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer own-access')
    expect(JSON.parse(String(init?.body))).toEqual({ ...request, refreshToken: own.refreshToken })
  })
}
