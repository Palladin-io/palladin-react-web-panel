import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getOrganizationMemberDirectory } from '../api/organization-member-directory-api'
import { useOrganizationMemberDirectory } from './use-organization-member-directory'

vi.mock('../api/organization-member-directory-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../api/organization-member-directory-api')>(),
  getOrganizationMemberDirectory: vi.fn(),
}))

const getDirectoryMock = vi.mocked(getOrganizationMemberDirectory)

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })}>
      {children}
    </QueryClientProvider>
  )
}

function wrapperFor(queryClient: QueryClient) {
  return function TestQueryClientProvider({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

describe('useOrganizationMemberDirectory', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes the shared directory once when a required user is missing', async () => {
    getDirectoryMock
      .mockResolvedValueOnce([{ userId: 'known', displayName: 'Known Member' }])
      .mockResolvedValueOnce([
        { userId: 'known', displayName: 'Known Member' },
        { userId: 'new-member', displayName: 'New Member' },
      ])

    const { result } = renderHook(
      () => useOrganizationMemberDirectory('organization-a', ['new-member']),
      { wrapper },
    )

    await waitFor(() => expect(result.current.nameById['new-member']).toBe('New Member'))
    expect(getDirectoryMock).toHaveBeenCalledTimes(2)
  })

  it('does not loop when an id remains unresolved after refresh', async () => {
    getDirectoryMock.mockResolvedValue([])

    const { result } = renderHook(
      () => useOrganizationMemberDirectory('organization-a', ['unknown-member']),
      { wrapper },
    )

    await waitFor(() => {
      expect(getDirectoryMock).toHaveBeenCalledTimes(2)
      expect(result.current.isFetching).toBe(false)
    })
    expect(result.current.nameById).toEqual({})
  })

  it('does not fetch or repair while the consumer is disabled', async () => {
    renderHook(
      () => useOrganizationMemberDirectory('organization-a', ['unknown-member'], false),
      { wrapper },
    )

    await waitFor(() => expect(getDirectoryMock).not.toHaveBeenCalled())
  })

  it('removes the previous organization directory when the organization changes', async () => {
    getDirectoryMock.mockResolvedValue([{ userId: 'member', displayName: 'Member' }])
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { rerender } = renderHook(
      ({ organizationId }) => useOrganizationMemberDirectory(organizationId),
      {
        initialProps: { organizationId: 'organization-a' },
        wrapper: wrapperFor(queryClient),
      },
    )
    await waitFor(() => expect(getDirectoryMock).toHaveBeenCalledTimes(1))

    rerender({ organizationId: 'organization-b' })

    await waitFor(() => {
      expect(queryClient.getQueryData([
        'organization',
        'member-directory',
        'organization-a',
      ])).toBeUndefined()
      expect(getDirectoryMock).toHaveBeenCalledTimes(2)
    })
  })
})
