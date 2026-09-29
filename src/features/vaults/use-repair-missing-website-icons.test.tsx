import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { useMemberSyncStore, type MemberIndexRecord } from './sync/member-sync-store'
import { useRepairMissingWebsiteIcons } from './use-repair-missing-website-icons'

const mocks = vi.hoisted(() => ({
  ensureIcons: vi.fn(),
  getVault: vi.fn(),
  getEntry: vi.fn(),
  openVaultKey: vi.fn(),
  openSecret: vi.fn(),
  update: vi.fn(),
  invalidate: vi.fn(),
  wipe: vi.fn(),
  order: [] as string[],
}))

vi.mock('../../shared/api/public-assets-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../shared/api/public-assets-api')>(),
  ensureWebsiteIconsUntilSettled: mocks.ensureIcons,
}))
vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('./api/vault-api', () => ({ getCanonicalEntry: mocks.getEntry }))
vi.mock('../../shared/crypto/vault-protocol', () => ({
  openMemberVaultKey: mocks.openVaultKey,
}))
vi.mock('../../shared/crypto/entry-protocol', () => ({ openMemberSecret: mocks.openSecret }))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))
vi.mock('./use-update-canonical-entry', () => ({
  updateCanonicalEntryNow: mocks.update,
  invalidateCanonicalEntryQueries: mocks.invalidate,
}))

const VAULT_ID = '22222222-2222-4222-8222-222222222222'

function record(
  entryId: string,
  hostname: string | null,
  overrides: Partial<MemberIndexRecord> = {},
): MemberIndexRecord {
  return {
    entryId,
    state: 'active',
    updatedAt: '2026-08-22T12:00:00Z',
    currentRevision: '1',
    memberIndexRevision: '1',
    currentKeyVersion: 1,
    payload: {
      schema: 'palladin.member-index.v1',
      memberLabel: entryId,
      entryType: 'credential',
      description: null,
      icon: null,
      color: null,
      username: 'user',
      urlDomain: hostname,
      customIndex: [],
    },
    corrupt: false,
    ...overrides,
  }
}

function publish(entries: MemberIndexRecord[]) {
  useMemberSyncStore.getState().publishVault({
    vaultId: VAULT_ID,
    metadata: { name: 'Production' },
    structure: {
      isDefault: false,
      createdAt: '2026-08-22T12:00:00Z',
      updatedAt: '2026-08-22T12:00:00Z',
      memberCount: 1,
      entryCount: entries.length,
      activeGrantCount: 0,
    },
    entries: new Map(entries.map((entry) => [entry.entryId, entry])),
    appliedThroughSequence: '1',
    status: 'ready',
    failureKind: null,
  })
  useMemberSyncStore.getState().complete()
}

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } }) }, children)
}

function canonicalSecret(icon: null | { kind: 'glyph'; value: string } = null) {
  return {
    schema: 'palladin.member-secret.v1',
    memberLabel: 'GitHub',
    agentLabel: 'GitHub',
    discoverable: true,
    description: null,
    icon,
    color: null,
    entryType: 'credential',
    content: {
      username: 'user', password: 'secret', url: 'https://github.com/login',
      totp: null, notes: null, customFields: [],
    },
    agentFieldAccess: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.order.length = 0
  useMemberSyncStore.getState().clear()
  useAuthStore.setState({ privateKey: new Uint8Array(32).fill(3) })
  mocks.getVault.mockResolvedValue({ memberVaultKey: {} })
  mocks.getEntry.mockImplementation(async (_vaultId: string, entryId: string) => ({
    id: entryId,
    vaultId: VAULT_ID,
    organizationId: 'org-1',
    state: 'active',
    currentRevision: '1',
    entryKey: {},
    memberSecret: {},
  }))
  mocks.openVaultKey.mockImplementation(async () => {
    mocks.order.push('open-key')
    return new Uint8Array(32).fill(4)
  })
  mocks.openSecret.mockResolvedValue(canonicalSecret())
  mocks.update.mockImplementation(async () => {
    mocks.order.push('update')
    return { currentRevision: '2' }
  })
})

describe('useRepairMissingWebsiteIcons', () => {
  it('limits a detail repair to its selected Entry even when other Entries lack icons', async () => {
    publish([record('reddit', 'www.reddit.com'), record('other', 'github.com')])
    const redditSecret = canonicalSecret()
    redditSecret.content.url = 'https://www.reddit.com/login'
    mocks.openSecret.mockResolvedValue(redditSecret)
    mocks.ensureIcons.mockResolvedValue(new Map([['www.reddit.com', {
      id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon',
      name: 'www.reddit.com', revision: 1,
      url: 'https://assets.palladin.io/published/reddit.png',
    }]]))
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID, 'reddit'), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({})
    })

    expect(result.current.candidateCount).toBe(1)
    expect(mocks.ensureIcons).toHaveBeenCalledWith(['www.reddit.com'], expect.anything(), expect.anything())
    expect(mocks.getEntry).toHaveBeenCalledExactlyOnceWith(VAULT_ID, 'reddit')
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith(VAULT_ID, expect.objectContaining({
      detail: expect.objectContaining({ id: 'reddit' }),
    }))
    expect(repairResult).toEqual({ candidates: 1, repaired: 1, skipped: 0, failed: 0 })
  })

  it('prepares the catalog before opening keys and updates only eligible ready Entries', async () => {
    publish([
      record('github', 'github.com'),
      record('gitlab', 'gitlab.com'),
      record('archived', 'archived.example.com', { state: 'archived' }),
      record('key', 'key.example.com', {
        payload: {
          ...record('key-payload', 'key.example.com').payload!,
          entryType: 'key',
        },
      }),
      record('with-icon', 'icon.example.com', {
        payload: {
          ...record('icon-payload', 'icon.example.com').payload!,
          icon: { kind: 'glyph', value: 'lock' },
        },
      }),
      record('corrupt', 'corrupt.example.com', { corrupt: true }),
      record('no-domain', null),
    ])
    mocks.ensureIcons.mockImplementation(async (
      hostnames: string[],
      onProgress?: (done: number, total: number) => void,
      assertActive?: () => void,
    ) => {
      mocks.order.push('catalog')
      expect(hostnames).toEqual(['github.com', 'gitlab.com'])
      assertActive?.()
      onProgress?.(2, 2)
      return new Map([['github.com', {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'websiteIcon' as const,
        name: 'github.com',
        revision: 2,
        url: 'https://assets.palladin.io/published/github.png',
      }]])
    })
    const onProgress = vi.fn()
    const retryGeneration = useMemberSyncStore.getState().retryGeneration
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({ onProgress })
    })

    expect(result.current.candidateCount).toBe(2)
    expect(mocks.order).toEqual(['catalog', 'open-key', 'update'])
    expect(mocks.getEntry).toHaveBeenCalledWith(VAULT_ID, 'github')
    expect(mocks.getEntry).not.toHaveBeenCalledWith(VAULT_ID, 'gitlab')
    expect(mocks.update).toHaveBeenCalledWith(VAULT_ID, expect.objectContaining({
      detail: expect.objectContaining({ id: 'github' }),
      cryptoSessionGeneration: expect.any(Number),
      draft: expect.objectContaining({
        memberLabel: 'GitHub',
        iconReference: 'public-asset:11111111-1111-4111-8111-111111111111|2|https%3A%2F%2Fassets.palladin.io%2Fpublished%2Fgithub.png',
        content: expect.objectContaining({ username: 'user', password: 'secret' }),
      }),
    }))
    expect(mocks.invalidate).toHaveBeenCalledWith(expect.anything(), VAULT_ID, 'github')
    expect(repairResult).toEqual({ candidates: 2, repaired: 1, skipped: 1, failed: 0 })
    expect(onProgress).toHaveBeenCalledWith({ phase: 'prepare', done: 2, total: 2 })
    expect(useMemberSyncStore.getState().retryGeneration).toBe(retryGeneration + 1)
    expect(mocks.wipe).toHaveBeenCalledTimes(1)
  })

  it('rechecks the canonical secret and never replaces an icon selected after the index snapshot', async () => {
    publish([record('github', 'github.com')])
    mocks.ensureIcons.mockResolvedValue(new Map([['github.com', {
      id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon', name: 'github.com',
      revision: 1, url: 'https://assets.palladin.io/published/github.png',
    }]]))
    mocks.openSecret.mockResolvedValue(canonicalSecret({ kind: 'glyph', value: 'star' }))
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({})
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(repairResult).toEqual({ candidates: 1, repaired: 0, skipped: 1, failed: 0 })
  })

  it('skips an Entry archived after the MemberIndex snapshot', async () => {
    publish([record('github', 'github.com')])
    mocks.ensureIcons.mockResolvedValue(new Map([['github.com', {
      id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon', name: 'github.com',
      revision: 1, url: 'https://assets.palladin.io/published/github.png',
    }]]))
    mocks.getEntry.mockResolvedValue({
      id: 'github', vaultId: VAULT_ID, organizationId: 'org-1', state: 'archived',
      currentRevision: '2', entryKey: {}, memberSecret: {},
    })
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({})
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(repairResult).toEqual({ candidates: 1, repaired: 0, skipped: 1, failed: 0 })
  })

  it('skips an Entry whose canonical URL changed after the MemberIndex snapshot', async () => {
    publish([record('github', 'github.com')])
    mocks.ensureIcons.mockResolvedValue(new Map([['github.com', {
      id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon', name: 'github.com',
      revision: 1, url: 'https://assets.palladin.io/published/github.png',
    }]]))
    const changed = canonicalSecret()
    changed.content.url = 'https://gitlab.com/login'
    mocks.openSecret.mockResolvedValue(changed)
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({})
    })

    expect(mocks.update).not.toHaveBeenCalled()
    expect(repairResult).toEqual({ candidates: 1, repaired: 0, skipped: 1, failed: 0 })
  })

  it('continues with the next Entry when one canonical update fails', async () => {
    publish([record('github', 'github.com'), record('gitlab', 'gitlab.com')])
    mocks.ensureIcons.mockResolvedValue(new Map([
      ['github.com', {
        id: '11111111-1111-4111-8111-111111111111', type: 'websiteIcon', name: 'github.com',
        revision: 1, url: 'https://assets.palladin.io/published/github.png',
      }],
      ['gitlab.com', {
        id: '33333333-3333-4333-8333-333333333333', type: 'websiteIcon', name: 'gitlab.com',
        revision: 1, url: 'https://assets.palladin.io/published/gitlab.png',
      }],
    ]))
    const gitlabSecret = canonicalSecret()
    gitlabSecret.content.url = 'https://gitlab.com/login'
    mocks.openSecret.mockResolvedValueOnce(canonicalSecret()).mockResolvedValueOnce(gitlabSecret)
    mocks.update.mockRejectedValueOnce(new Error('first Entry failed'))
      .mockResolvedValueOnce({ currentRevision: '2' })
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    let repairResult
    await act(async () => {
      repairResult = await result.current.mutateAsync({})
    })

    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.invalidate).toHaveBeenCalledTimes(1)
    expect(repairResult).toEqual({ candidates: 2, repaired: 1, skipped: 0, failed: 1 })
    expect(mocks.wipe).toHaveBeenCalledTimes(2)
  })

  it('aborts before opening a key when the unlock session changes during catalog preparation', async () => {
    publish([record('github', 'github.com')])
    mocks.ensureIcons.mockImplementation(async () => {
      useAuthStore.setState({ privateKey: new Uint8Array(32).fill(9) })
      return new Map()
    })
    const { result } = renderHook(() => useRepairMissingWebsiteIcons(VAULT_ID), { wrapper })

    await expect(act(async () => result.current.mutateAsync({}))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(mocks.getVault).not.toHaveBeenCalled()
    expect(mocks.openVaultKey).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
