import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { SharedUnlockApi } from './api'
import { SharedUnlockSourceAuthority, type ManualUnlockContext } from './source-authority'
import fixtures from './fixtures/session-api-v1.json'

const authorization = fixtures.operations[0].sourceAuthorization
const apiUrl = 'https://api.example.test'
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const context = (): ManualUnlockContext => ({
  session: { apiUrl, accessToken: 'own-access', refreshToken: 'own-refresh', userId: authorization.accountId },
  account: { userId: authorization.accountId, email: 'synthetic@example.test', displayName: 'Synthetic', avatarUrl: null,
    isOnboarded: true, kdf: { securityVersion: 1, minimumSecurityVersion: 1, profileId: 'identity-argon2id-password-v1',
      kdfSalt: encodeBase64Url(new Uint8Array(16)), credentialRevision: 3, privateKeyWrapRevision: 5, deviceWrapperMetadata: null } },
  authCredential: new Uint8Array(32).fill(17), limits: authorization, assertCurrent: () => {},
})

afterEach(() => vi.useRealTimers())

describe('Web manual source authority', () => {
  for (const preference of fixtures.responses.filter(r => r.type === 'preference')) {
    it(`preserves ${preference.name} and sends only own session plus fresh proof`, async () => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(preference.body)).mockResolvedValueOnce(response(authorization))
      const remembered = vi.fn()
      const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), () => authorization.unlockedAtMs + 1, undefined, remembered)
      const own = context()
      await source.prepare(own)
      expect(source.snapshot().preference).toEqual(preference.body)
      expect(remembered).toHaveBeenCalledExactlyOnceWith(authorization, own.session)
      expect(source.snapshot().authorization).toEqual(authorization)
      expect(source.snapshot().sourceGeneration).toMatch(/^[A-Za-z0-9_-]{43}$/)
      const sent = fetcher.mock.calls[1][1]!
      expect(JSON.parse(String(sent.body))).toEqual({
        authCredential: encodeBase64Url(new Uint8Array(32).fill(17)), refreshToken: 'own-refresh',
        sourceGeneration: source.snapshot().sourceGeneration,
        expectedPreferenceRevision: (preference.body as { revision: number }).revision,
        expectedCredentialRevision: 3, expectedPrivateKeyWrapRevision: 5,
        idleDeadlineMs: authorization.idleDeadlineMs, absoluteDeadlineMs: authorization.absoluteDeadlineMs,
        offlineDeadlineMs: authorization.offlineDeadlineMs,
      })
      expect(sent).toMatchObject({ headers: { authorization: 'Bearer own-access' }, credentials: 'omit',
        cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' })
      expect(fetcher.mock.calls.map(([, options]) => options?.method)).toEqual(['GET', 'POST'])
      expect(own.authCredential).toEqual(new Uint8Array(32))
    })
  }

  for (const status of [401, 403, 409, 429, 503]) {
    it(`does not retry or change OFF after Identity ${status}`, async () => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sharedUnlockEnabled: false, revision: 3 }))
        .mockResolvedValueOnce(response({}, status))
      const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl))
      const own = context()
      await source.prepare(own)
      expect(source.snapshot()).toEqual({ preference: { sharedUnlockEnabled: false, revision: 3 }, authorization: null, sourceGeneration: null })
      expect(own.authCredential).toEqual(new Uint8Array(32))
      expect(fetcher).toHaveBeenCalledTimes(2)
    })
  }

  for (const stage of ['preference', 'authorization'] as const) {
    it(`wipes immediately on cancel and discards a late ${stage} response`, async () => {
      let resolve!: (r: Response) => void
      const pending = new Promise<Response>(r => { resolve = r })
      const fetcher = vi.fn<typeof fetch>()
      if (stage === 'authorization') fetcher.mockResolvedValueOnce(response({ sharedUnlockEnabled: true, revision: 3 }))
      fetcher.mockReturnValueOnce(pending)
      const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl))
      const own = context()
      const prepared = source.prepare(own)
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(stage === 'preference' ? 1 : 2))
      source.reset()
      expect(own.authCredential).toEqual(new Uint8Array(32))
      expect(fetcher.mock.lastCall![1]!.signal!.aborted).toBe(true)
      resolve(response(stage === 'preference' ? { sharedUnlockEnabled: true, revision: 3 } : authorization))
      await prepared
      expect(source.snapshot()).toEqual({ preference: null, authorization: null, sourceGeneration: null })
    })
  }

  it('does not accept a different account as the source of the proof', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl))
    const own = context()
    await source.prepare({ ...own, session: { ...own.session, userId: 'another-account' } })
    expect(fetcher).not.toHaveBeenCalled()
    expect(own.authCredential).toEqual(new Uint8Array(32))
  })

  it('invalidates expired and locally replaced authority without extending its age', async () => {
    let now = authorization.unlockedAtMs + 1
    let current = true
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => String(url).endsWith('authorizations')
      ? response(authorization) : response({ sharedUnlockEnabled: true, revision: 3 }))
    const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), () => now)
    await source.prepare({ ...context(), assertCurrent: () => { if (!current) throw new Error('replaced') } })
    current = false
    expect(source.snapshot().authorization).toBeNull()
    await source.prepare(context())
    now = authorization.idleDeadlineMs
    expect(source.snapshot().authorization).toBeNull()
  })

  it('wipes the pending proof and aborts the request at ten seconds', async () => {
    vi.useFakeTimers()
    let resolve!: (r: Response) => void
    const fetcher = vi.fn<typeof fetch>().mockReturnValue(new Promise(r => { resolve = r }))
    const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl))
    const own = context()
    const prepared = source.prepare(own)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(10_000)
    expect(own.authCredential).toEqual(new Uint8Array(32))
    expect(fetcher.mock.lastCall![1]!.signal!.aborted).toBe(true)
    resolve(response({ sharedUnlockEnabled: true, revision: 3 }))
    await prepared
    expect(source.snapshot().authorization).toBeNull()
  })
})


it("adopts only a still-current own verified receiver root without requesting a manual proof", () => {
  const fetcher = vi.fn<typeof fetch>(); let current = true;
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), () => authorization.unlockedAtMs + 1);
  const changed = vi.fn(); const unsubscribe = source.subscribe(changed);
  source.adopt(authorization, "A".repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => { if (!current) throw new Error("own session retired"); });
  expect(source.snapshot().authorization).toEqual(authorization);
  expect(source.snapshot().sourceGeneration).toBe("A".repeat(43));
  expect(changed).toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  current = false;
  expect(source.snapshot().authorization).toBeNull();
  expect(() => source.adopt(authorization, "E".repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => { throw new Error("new own session"); })).toThrow();
  expect(source.snapshot().authorization).toBeNull(); unsubscribe();
});


it("does not overwrite a newer explicit OFF while adopting a completed own receiver root", () => {
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(vi.fn<typeof fetch>(), () => apiUrl), () => authorization.unlockedAtMs + 1);
  source.adopt(authorization, "A".repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => {});
  source.acceptPreference({ sharedUnlockEnabled: false, revision: 2 }, "A".repeat(43));
  source.adopt(authorization, "E".repeat(43), { sharedUnlockEnabled: true, revision: 1 }, () => {});
  expect(source.snapshot().preference).toEqual({ sharedUnlockEnabled: false, revision: 2 });
});


it("settles previous closings before reading fresh preference and authorizing a new root", async () => {
  let finish!: () => void;
  const beforeAuthorize = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ sharedUnlockEnabled: true, revision: 6 }))
    .mockResolvedValueOnce(response({ ...authorization, sequence: authorization.sequence + 2 }));
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), () => authorization.unlockedAtMs + 1, beforeAuthorize);
  const own = context(); const prepared = source.prepare(own);
  await vi.waitFor(() => expect(beforeAuthorize).toHaveBeenCalledOnce());
  expect(fetcher).not.toHaveBeenCalled();
  finish(); await prepared;
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body)).expectedPreferenceRevision).toBe(6);
  expect(source.snapshot().authorization?.sequence).toBe(authorization.sequence + 2);
  expect(own.authCredential).toEqual(new Uint8Array(32));
});
it("never sends a fresh proof after closing repair completes for a superseded manual attempt", async () => {
  let finish!: () => void;
  const beforeAuthorize = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const fetcher = vi.fn<typeof fetch>();
  const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), Date.now, beforeAuthorize);
  const own = context(); const prepared = source.prepare(own);
  await vi.waitFor(() => expect(beforeAuthorize).toHaveBeenCalledOnce());
  source.reset(); finish(); await prepared;
  expect(fetcher).not.toHaveBeenCalled(); expect(own.authCredential).toEqual(new Uint8Array(32));
});


it("does not extend the manual proof deadline while a suspended closing repair resumes", async () => {
  vi.useFakeTimers();
  try {
    const fetcher = vi.fn<typeof fetch>();
    const beforeAuthorize = async () => { vi.setSystemTime(Date.now() + 10_001); };
    const source = new SharedUnlockSourceAuthority(new SharedUnlockApi(fetcher, () => apiUrl), Date.now, beforeAuthorize);
    const own = context(); await source.prepare(own);
    expect(fetcher).not.toHaveBeenCalled(); expect(own.authCredential).toEqual(new Uint8Array(32));
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
