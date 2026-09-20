import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { useShareCreation } from './use-share-creation'
import { initialSharingForm } from './sharing-form'
import { sharingId, sharingScope, sharingSource, sharingTestAccessToken } from './sharing-test-fixtures'
import { openEntryShare } from '../../../shared/crypto/entry-share'
import { clearEntryShareLink, parseEntryShareFragment } from '../../../shared/crypto/entry-share-link'
import { encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'

const mocks = vi.hoisted(() => ({ open: vi.fn(), challenge: vi.fn(), create: vi.fn(), retrySync: vi.fn() }))
vi.mock('../sync/current-member-entry-reader', () => ({ openCurrentMemberEntrySecret: mocks.open }))
vi.mock('../sync/member-sync-store', () => ({ useMemberSyncStore: { getState: () => ({ retry: mocks.retrySync }) } }))
vi.mock('./sharing-api', () => ({ issueShareCreationChallenge: mocks.challenge, createEntryShare: mocks.create }))

const form = { ...initialSharingForm, recipientEmail: 'recipient@example.test', notifyOnFirstReceipt: true }

beforeEach(() => {
  vi.resetAllMocks()
  useAuthStore.setState({ userId: 'member', accessToken: sharingTestAccessToken(), isVaultLocked: false,
    privateKey: new Uint8Array(32).fill(9), cryptoSessionGeneration: 7, permissions: 8 })
  mocks.open.mockResolvedValue(sharingSource)
  mocks.challenge.mockResolvedValue({ shareId: sharingId, sourceRevision: sharingScope.revision, expiresAt: '2099-01-01T00:00:00Z' })
  mocks.create.mockResolvedValue(undefined)
})

describe('Entry sharing sender operation', () => {
  it('posts only the selected encrypted snapshot and exposes the separately held link after success', async () => {
    const onCreated = vi.fn()
    const { result } = renderHook(() => useShareCreation(sharingScope, onCreated))
    await waitFor(() => expect(result.current.source).toBe(sharingSource))
    await act(async () => { expect(await result.current.submit(form, ['credential.password'])).toBe('created') })
    const request = mocks.create.mock.calls[0][2]
    const url = new URL(result.current.link!)
    const secrets = parseEntryShareFragment(url.hash)
    try {
      expect(url.pathname).toBe(`/share/${sharingId}`)
      expect(url.search).toBe('')
      expect(request.accessToken).toBe(encodeBase64Url(secrets.accessToken))
      expect(request).not.toHaveProperty('key')
      expect(JSON.stringify(request)).not.toContain('fixture-password')
      expect(JSON.stringify(request)).not.toContain('private-note')
      expect(request.notifyOnFirstReceipt).toBe(true)
      const opened = await openEntryShare(request, { ...sharingScope, shareId: sharingId,
        sourceRevision: sharingScope.revision, expiresAt: request.expiresAt }, sharingId, secrets.key)
      expect(opened.fields.map((field) => field.id)).toEqual(['credential.password'])
      expect(opened.fields[0].value).toBe('fixture-password')
      expect(onCreated).toHaveBeenCalledOnce()
      expect(result.current.source).toBeNull()
    } finally { clearEntryShareLink(secrets) }
  })

  it('retries the exact same request after an ambiguous network failure', async () => {
    mocks.create.mockRejectedValueOnce(new Error('network'))
    const { result } = renderHook(() => useShareCreation(sharingScope, vi.fn()))
    await waitFor(() => expect(result.current.source).not.toBeNull())
    await act(async () => { expect(await result.current.submit(form, ['credential.password'])).toBe('failed') })
    expect(result.current.retryPending).toBe(true)
    const firstRequest = mocks.create.mock.calls[0][2]
    await act(async () => { expect(await result.current.submit(form, ['credential.password'])).toBe('created') })
    expect(mocks.challenge).toHaveBeenCalledOnce()
    expect(mocks.create.mock.calls[1][2]).toBe(firstRequest)
    expect(result.current.retryPending).toBe(false)
  })

  it('rejects a changed source revision before encrypting or posting', async () => {
    mocks.challenge.mockResolvedValue({ shareId: sharingId, sourceRevision: '5', expiresAt: '2099-01-01T00:00:00Z' })
    const { result } = renderHook(() => useShareCreation(sharingScope, vi.fn()))
    await waitFor(() => expect(result.current.source).not.toBeNull())
    await act(async () => { expect(await result.current.submit(form, ['credential.password'])).toBe('failed') })
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.retrySync).toHaveBeenCalledOnce()
  })

  it('does not decrypt under a foreign authenticated organization', async () => {
    const { result } = renderHook(() => useShareCreation({ ...sharingScope, organizationId: sharingId }, vi.fn()))
    await waitFor(() => expect(result.current.loadError).toBe(true))
    expect(mocks.open).not.toHaveBeenCalled()
  })

  it('drops a delayed decrypt result after lock and re-unlock', async () => {
    let resolve!: (source: typeof sharingSource) => void
    mocks.open.mockReturnValue(new Promise((done) => { resolve = done }))
    const { result } = renderHook(() => useShareCreation(sharingScope, vi.fn()))
    act(() => useAuthStore.setState({ cryptoSessionGeneration: 8 }))
    await act(async () => { resolve(sharingSource) })
    expect(result.current.source).toBeNull()
    expect(result.current.loadError).toBe(true)
  })

  it('aborts a pending creation on lock and never exposes its late link', async () => {
    let finish!: () => void
    mocks.create.mockReturnValue(new Promise<void>((done) => { finish = done }))
    const onCreated = vi.fn()
    const { result } = renderHook(() => useShareCreation(sharingScope, onCreated))
    await waitFor(() => expect(result.current.source).not.toBeNull())
    let outcome!: Promise<unknown>
    act(() => { outcome = result.current.submit(form, ['credential.password']) })
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    const signal: AbortSignal = mocks.create.mock.calls[0][3]
    act(() => useAuthStore.setState({ isVaultLocked: true, privateKey: null, cryptoSessionGeneration: 8 }))
    await act(async () => { finish(); expect(await outcome).toBe('cancelled') })
    expect(signal.aborted).toBe(true)
    expect(result.current.source).toBeNull()
    expect(result.current.link).toBeNull()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('aborts on unmount and blocks double submits synchronously', async () => {
    let finish!: () => void
    mocks.create.mockReturnValue(new Promise<void>((done) => { finish = done }))
    const { result, unmount } = renderHook(() => useShareCreation(sharingScope, vi.fn()))
    await waitFor(() => expect(result.current.source).not.toBeNull())
    let outcome!: Promise<unknown>
    act(() => { outcome = result.current.submit(form, ['credential.password']) })
    expect(await result.current.submit(form, ['credential.password'])).toBe('cancelled')
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    unmount()
    expect(mocks.create.mock.calls[0][3].aborted).toBe(true)
    finish()
    expect(await outcome).toBe('cancelled')
  })

  it('clears a generated link on pagehide, including BFCache', async () => {
    const { result } = renderHook(() => useShareCreation(sharingScope, vi.fn()))
    await waitFor(() => expect(result.current.source).not.toBeNull())
    await act(async () => { await result.current.submit(form, ['credential.password']) })
    act(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })))
    expect(result.current.link).toBeNull()
  })
})
