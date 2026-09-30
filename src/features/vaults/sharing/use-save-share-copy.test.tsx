import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../auth'
import { useMemberSyncStore } from '../sync/member-sync-store'
import { useSaveShareCopy } from './use-save-share-copy'
import type { EntryShareSnapshot } from '../../../shared/crypto/entry-share'
import fixture from '../../../shared/crypto/fixtures/entry-share-v1.json'

const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), challenge: vi.fn(), create: vi.fn(), name: vi.fn(), seal: vi.fn(),
  vaultChallenge: vi.fn(), account: vi.fn(), createVault: vi.fn(), createDefaultVault: vi.fn(), vaultPayload: vi.fn() }))
vi.mock('../sync/member-sync-api', () => ({ listEncryptedVaults: api.list, getEncryptedVault: api.get }))
vi.mock('../api/vault-api', () => ({ issueEntryCreationChallenge: api.challenge, createEntry: api.create,
  issueVaultCreationChallenge: api.vaultChallenge, createVault: api.createVault }))
vi.mock('../../../shared/crypto/entry-share-copy-encryption', () => ({ readEntryShareCopyVaultName: api.name, sealEntryShareCopy: api.seal }))
vi.mock('../../../shared/crypto/create-vault-protocol', () => ({ createVaultProtocolPayload: api.vaultPayload }))
vi.mock('../../../shared/api/account-api', () => ({ getAccount: api.account, createDefaultVault: api.createDefaultVault }))

const snapshot = fixture.snapshot as EntryShareSnapshot
const organizationId = '11111111-1111-4111-8111-111111111111'
const vaultId = '22222222-2222-4222-8222-222222222222'
const memberId = '33333333-3333-4333-8333-333333333333'
const entryId = '44444444-4444-4444-8444-444444444444'
const form = { title: 'Recipient copy', additions: {} }
const material = { entryKey: { encrypted: 'fresh-key' }, memberSecret: { encrypted: 'fresh-secret' },
  memberIndex: { encrypted: 'fresh-index' }, agentDiscovery: null }
beforeEach(() => {
  vi.resetAllMocks()
  useMemberSyncStore.getState().clear()
  useAuthStore.setState({ userId: memberId, emailVerified: true, privateKey: new Uint8Array(32).fill(7), cryptoSessionGeneration: 1,
    accessToken: `header.${btoa(JSON.stringify({ sub: memberId, org_id: organizationId }))}.signature`, isVaultLocked: false, permissions: 8 })
  api.list.mockResolvedValue([{ id: vaultId }])
  api.name.mockResolvedValue('Destination')
  api.get.mockResolvedValue({ id: vaultId, organizationId })
  api.challenge.mockResolvedValue({ entryId })
  api.seal.mockResolvedValue(material)
  api.create.mockResolvedValue({ id: entryId, currentRevision: '1' })
  api.vaultChallenge.mockResolvedValue({ vaultId })
  api.account.mockResolvedValue({ userId: memberId, memberKeyVersion: 1 })
  api.vaultPayload.mockResolvedValue({ vaultId, ciphertext: 'synthetic' })
  api.createVault.mockResolvedValue(undefined)
  api.createDefaultVault.mockResolvedValue(undefined)
})
afterEach(cleanup)

async function ready() {
  const hook = renderHook(() => useSaveShareCopy(snapshot))
  await waitFor(() => expect(hook.result.current.loading).toBe(false))
  return hook
}

describe('Explicit received-copy save lifecycle', () => {
  it('creates a named Vault within the scoped operation, then saves only after explicit confirmation', async () => {
    api.list.mockResolvedValueOnce([])
    api.name.mockResolvedValue('New vault')
    const { result } = await ready()
    expect(api.createDefaultVault).not.toHaveBeenCalled()
    await act(async () => { expect(await result.current.createNamedVault('New vault')).toEqual({ vaultId }) })
    expect(api.vaultPayload.mock.calls[0][0]).toMatchObject({ organizationId, vaultId, memberId,
      metadata: { name: 'New vault' } })
    expect(api.createDefaultVault).toHaveBeenCalledWith({ vaultId, ciphertext: 'synthetic' }, expect.any(AbortSignal))
    expect(result.current.vaults).toEqual([{ id: vaultId, name: 'New vault' }])
    expect(api.create).not.toHaveBeenCalled()
    await act(async () => { expect(await result.current.save(vaultId, form)).toEqual({ vaultId, entryId }) })
    expect(useMemberSyncStore.getState().retryGeneration).toBe(2)
  })

  it('does not post a Vault after the session locks during encryption', async () => {
    let finish!: (value: unknown) => void
    api.vaultPayload.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result } = await ready()
    let pending!: Promise<unknown>
    act(() => { pending = result.current.createNamedVault('New vault') })
    await waitFor(() => expect(api.vaultPayload).toHaveBeenCalledOnce())
    act(() => useAuthStore.setState({ isVaultLocked: true }))
    await act(async () => { finish({ vaultId }); expect(await pending).toBe('cancelled') })
    expect(api.createDefaultVault).not.toHaveBeenCalled()
  })

  it('aborts an in-flight Vault create on page disposal', async () => {
    let finish!: (value: unknown) => void
    api.createVault.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result, unmount } = await ready()
    let pending!: Promise<unknown>
    act(() => { pending = result.current.createNamedVault('New vault') })
    await waitFor(() => expect(api.createVault).toHaveBeenCalledOnce())
    unmount()
    await act(async () => { finish(undefined); expect(await pending).toBe('cancelled') })
    expect(api.createVault.mock.calls[0][1].aborted).toBe(true)
  })

  it('reconciles an ambiguous Vault response against the same exact encrypted request', async () => {
    api.name.mockResolvedValue('New vault')
    api.createDefaultVault.mockRejectedValueOnce(new Error('lost response'))
    api.list.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const { result } = await ready()
    await act(async () => { expect(await result.current.createNamedVault('New vault')).toBe('failed') })
    expect(result.current.pendingVaultName).toBe('New vault')
    await act(async () => { expect(await result.current.createNamedVault('Another vault')).toBe('failed') })
    expect(api.vaultChallenge).toHaveBeenCalledOnce()
    await act(async () => { expect(await result.current.createNamedVault('New vault')).toEqual({ vaultId }) })
    expect(api.createDefaultVault.mock.calls[1][0]).toBe(api.createDefaultVault.mock.calls[0][0])
    expect(api.vaultChallenge).toHaveBeenCalledOnce()
    expect(result.current.pendingVaultName).toBeNull()
  })

  it('loads names locally and does not create anything before an explicit save', async () => {
    const { result } = await ready()
    expect(result.current.vaults).toEqual([{ id: vaultId, name: 'Destination' }])
    expect(api.name.mock.calls[0][1]).toEqual({ organizationId, memberId, vaultId })
    expect(api.challenge).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('creates a new encrypted entry in the explicitly selected own scope, then refreshes sync', async () => {
    const { result } = await ready()
    await act(async () => { expect(await result.current.save(vaultId, form)).toEqual({ vaultId, entryId }) })
    expect(api.seal.mock.calls[0][0]).toMatchObject({ memberLabel: 'Recipient copy', discoverable: true,
      content: { password: 'fixture-only' } })
    expect(api.seal.mock.calls[0][2]).toEqual({ organizationId, memberId, vaultId, entryId })
    expect(api.create).toHaveBeenCalledWith(vaultId, { entryId, ...material, deliveryPolicy: 'standard' }, expect.any(AbortSignal))
    expect(JSON.stringify(api.create.mock.calls[0][1])).not.toContain('fixture-only')
    expect(useMemberSyncStore.getState().retryGeneration).toBe(1)
    await act(async () => { expect(await result.current.save(vaultId, form)).toBe('cancelled') })
    expect(api.create).toHaveBeenCalledOnce()
  })

  it('retries exactly the same entry and ciphertext after a lost create response', async () => {
    api.create.mockRejectedValueOnce(new Error('lost response'))
    const { result } = await ready()
    await act(async () => { expect(await result.current.save(vaultId, form)).toBe('failed') })
    expect(result.current.retryPending).toBe(true)
    const request = api.create.mock.calls[0][1]
    await act(async () => { expect(await result.current.save('changed-vault', { title: 'Changed', additions: {} })).toEqual({ vaultId, entryId }) })
    expect(api.create.mock.calls[1][0]).toBe(vaultId)
    expect(api.create.mock.calls[1][1]).toBe(request)
    expect(api.challenge).toHaveBeenCalledOnce()
    expect(api.seal).toHaveBeenCalledOnce()
    expect(result.current.retryPending).toBe(false)
  })

  it('rejects a target which was not offered by the own authenticated list', async () => {
    const { result } = await ready()
    await act(async () => { expect(await result.current.save('foreign', form)).toBe('failed') })
    expect(api.get).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
  })

  it.each(['lock', 'account', 'organization', 'permission', 'pagehide'] as const)('cancels preparation on %s before any create', async (change) => {
    let finish!: (value: unknown) => void
    api.seal.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result } = await ready()
    let saving!: Promise<unknown>
    act(() => { saving = result.current.save(vaultId, form) })
    await waitFor(() => expect(api.seal).toHaveBeenCalledOnce())
    act(() => {
      if (change === 'lock') useAuthStore.setState({ isVaultLocked: true, cryptoSessionGeneration: 2 })
      else if (change === 'account') useAuthStore.setState({ userId: 'another' })
      else if (change === 'organization') useAuthStore.setState({ accessToken: `h.${btoa(JSON.stringify({ org_id: 'another' }))}.s` })
      else if (change === 'permission') useAuthStore.setState({ permissions: 0 })
      else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }))
    })
    await act(async () => { finish(material); expect(await saving).toBe('cancelled') })
    expect(api.seal.mock.calls[0][4].aborted).toBe(true)
    expect(api.create).not.toHaveBeenCalled()
    expect(result.current.vaults).toEqual([])
  })

  it('discards a late successful save after unmount without refreshing a replacement session', async () => {
    let finish!: (value: unknown) => void
    api.create.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const { result, unmount } = await ready()
    let saving!: Promise<unknown>
    act(() => { saving = result.current.save(vaultId, form) })
    await waitFor(() => expect(api.create).toHaveBeenCalledOnce())
    unmount()
    await act(async () => { finish({ id: entryId }); expect(await saving).toBe('cancelled') })
    expect(api.create.mock.calls[0][2].aborted).toBe(true)
    expect(useMemberSyncStore.getState().retryGeneration).toBe(0)
  })

  it('does not load private vaults for a locked guest', async () => {
    useAuthStore.setState({ userId: null, privateKey: null, isVaultLocked: true, accessToken: null })
    const { result } = await ready()
    expect(result.current.loadError).toBe(true)
    expect(api.list).not.toHaveBeenCalled()
  })

  it('keeps healthy Vault choices when a sibling fails local authentication', async () => {
    const corruptId = '55555555-5555-4555-8555-555555555555'
    api.list.mockResolvedValue([{ id: corruptId }, { id: vaultId }])
    api.name.mockRejectedValueOnce(new Error('invalid ciphertext'))
    const { result } = await ready()
    expect(result.current.loadError).toBe(false)
    expect(result.current.vaults).toEqual([{ id: corruptId, name: null }, { id: vaultId, name: 'Destination' }])
    await act(async () => { expect(await result.current.save(corruptId, form)).toBe('failed') })
    expect(api.create).not.toHaveBeenCalled()
    await act(async () => { expect(await result.current.save(vaultId, form)).toEqual({ vaultId, entryId }) })
  })
})
