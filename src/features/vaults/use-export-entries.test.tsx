import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { ENTRY_TYPE_CREDENTIAL } from './types'
import { useMemberSyncStore } from './sync/member-sync-store'
import { useExportEntries } from './use-export-entries'

const mocks = vi.hoisted(() => ({
  getVault: vi.fn(),
  getEntry: vi.fn(),
  getHistory: vi.fn(),
  openVaultKey: vi.fn(async () => new Uint8Array(32).fill(7)),
  decryptCurrent: vi.fn(),
  decryptHistorical: vi.fn(),
  wipe: vi.fn((value: Uint8Array) => value.fill(0)),
}))

vi.mock('./sync/member-sync-api', () => ({ getEncryptedVault: mocks.getVault }))
vi.mock('./api/vault-api', () => ({
  getCanonicalEntry: mocks.getEntry,
  getEntryHistory: mocks.getHistory,
}))
vi.mock('../../shared/crypto/vault-v2-member-sync', () => ({ openMemberVaultKey: mocks.openVaultKey }))
vi.mock('../../shared/crypto/vault-v2-entry', () => ({
  decryptMemberSecret: mocks.decryptCurrent,
  decryptHistoricalMemberSecret: mocks.decryptHistorical,
}))
vi.mock('../../shared/crypto/sodium', () => ({ wipe: mocks.wipe }))

const privateKey = new Uint8Array(32).fill(3)
const records = [
  { entryId: 'active', state: 'active' as const },
  { entryId: 'archived', state: 'archived' as const },
  { entryId: 'deleted', state: 'deleted' as const },
]

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: {
    queries: { retry: false }, mutations: { retry: false },
  } }) }, children)
}

function secret(label: string, password = `secret-${label}`) {
  return {
    schemaVersion: 1,
    memberLabel: label,
    agentLabel: label,
    entryType: ENTRY_TYPE_CREDENTIAL,
    content: { type: ENTRY_TYPE_CREDENTIAL, username: `user-${label}`, password },
    agentVisibilityPolicy: { discoverable: false, fields: {} },
  }
}

describe('useExportEntries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.setState({ privateKey })
    useMemberSyncStore.setState({
      status: 'ready',
      vaults: new Map([['vault', {
        vaultId: 'vault',
        metadata: { name: 'Production' },
        structure: {},
        entries: new Map(records.map((record) => [record.entryId, {
          ...record,
          currentRevision: '2',
          memberIndexRevision: '2',
          currentKeyVersion: 1,
          payload: { memberLabel: record.entryId, searchFields: [] },
          corrupt: false,
        }])),
        appliedThroughSequence: '3',
        status: 'ready',
        failureKind: null,
      } as never]]),
      error: null,
    })
    mocks.getVault.mockResolvedValue({
      memberVaultKey: { organizationId: 'org', memberId: 'member' },
      currentKeyEpoch: { vaultKeyVersion: 1 },
      memberKeyGeneration: 1,
    })
    mocks.getEntry.mockImplementation((_vaultId: string, entryId: string) => Promise.resolve({
      organizationId: 'org', vaultId: 'vault', id: entryId, currentRevision: '2',
    }))
    mocks.decryptCurrent.mockImplementation((detail: { id: string }) => Promise.resolve(secret(detail.id)))
    mocks.getHistory.mockResolvedValue({ items: [], nextBeforeRevision: null })
  })

  it('exports active current entries by default and wipes the delivered byte buffer', async () => {
    let delivered: Uint8Array | undefined
    let plaintext = ''
    const { result } = renderHook(useExportEntries, { wrapper })
    result.current.mutate({
      vaults: [{ id: 'vault', name: 'ignored-server-label' }],
      format: 'json',
      includeArchived: false,
      includeDeleted: false,
      includeHistory: false,
      onFileReady: ({ content }) => {
        delivered = content
        plaintext = new TextDecoder().decode(content)
      },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mocks.getEntry).toHaveBeenCalledTimes(1)
    expect(mocks.getEntry).toHaveBeenCalledWith('vault', 'active', undefined)
    expect(plaintext).toContain('secret-active')
    expect(plaintext).toContain('Production')
    expect(plaintext).not.toContain('secret-archived')
    expect(plaintext).not.toContain('ignored-server-label')
    expect(delivered).toBeDefined()
    expect([...delivered!]).toEqual(new Array(delivered!.length).fill(0))
    expect(result.current.data).toEqual({
      totalEntries: 1,
      perVault: [{ id: 'vault', count: 1 }],
      format: 'json',
    })
    expect(result.current.data).not.toHaveProperty('content')
  })

  it('includes archived, deleted, and historical versions only when explicitly selected', async () => {
    mocks.getHistory.mockImplementation((_vault: string, entryId: string) => Promise.resolve({
      items: [{ revision: '1', memberSecret: { entryId }, entryKey: { entryId } }],
      nextBeforeRevision: null,
    }))
    mocks.decryptHistorical.mockImplementation((_detail: unknown, member: { entryId: string }) => (
      Promise.resolve(secret(`${member.entryId}-history`))
    ))
    let plaintext = ''
    const { result } = renderHook(useExportEntries, { wrapper })
    result.current.mutate({
      vaults: [{ id: 'vault', name: 'ignored' }],
      format: 'json',
      includeArchived: true,
      includeDeleted: true,
      includeHistory: true,
      onFileReady: ({ content }) => { plaintext = new TextDecoder().decode(content) },
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totalEntries).toBe(6)
    expect(plaintext).toContain('secret-archived')
    expect(plaintext).toContain('secret-deleted')
    expect(plaintext).toContain('secret-active-history')
    expect(plaintext).toContain('"historical": true')
  })

  it('fails closed without creating a file when the Vault locks during export', async () => {
    const onFileReady = vi.fn()
    const { result } = renderHook(useExportEntries, { wrapper })
    result.current.mutate({
      vaults: [{ id: 'vault', name: 'ignored' }],
      format: 'json',
      includeArchived: false,
      includeDeleted: false,
      includeHistory: false,
      onProgress: (done) => { if (done === 1) useAuthStore.setState({ privateKey: null }) },
      onFileReady,
    })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(onFileReady).not.toHaveBeenCalled()
    expect(result.current.error).toMatchObject({ name: 'AbortError' })
  })
})
