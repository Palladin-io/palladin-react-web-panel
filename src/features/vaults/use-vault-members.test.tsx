import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ORGANIZATION_MEMBERS_QUERY_KEY } from '../../shared/api/organization-members-api'
import { useRequestMemberRemoval, vaultMembersQueryKey } from './use-vault-members'

const requestRemoval = vi.hoisted(() => vi.fn())
vi.mock('../../shared/api/organization-members-api', async (importActual) => {
  const actual = await importActual<typeof import('../../shared/api/organization-members-api')>()
  return { ...actual, requestOrganizationMemberRemoval: requestRemoval }
})

describe('useRequestMemberRemoval', () => {
  it('invalidates both Vault and organization member directories after a request', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    requestRemoval.mockResolvedValue(undefined)
    const { result } = renderHook(() => useRequestMemberRemoval('vault-1'), { wrapper })

    await act(() => result.current.mutateAsync('member-1'))

    expect(invalidate).toHaveBeenCalledWith({ queryKey: vaultMembersQueryKey('vault-1') })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ORGANIZATION_MEMBERS_QUERY_KEY })
  })
})
