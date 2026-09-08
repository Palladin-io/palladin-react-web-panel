import type { ComponentType } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PERMISSION_AGENT_MANAGE, PERMISSION_READ_API_KEY, PERMISSION_WRITE_API_KEY } from '../../shared/lib/permissions'
import { Route } from '../../routes/_authenticated/agent-pairing.$pairingId'

const mocks = vi.hoisted(() => ({ permissions: 0, navigate: vi.fn(), page: vi.fn() }))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({
    options, useParams: () => ({ pairingId: 'pairing' }),
  }),
  redirect: vi.fn(),
  useNavigate: () => mocks.navigate,
}))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('../auth', () => ({
  useAuthStore: (select: (state: { permissions: number }) => unknown) => select({ permissions: mocks.permissions }),
}))
vi.mock('../api-keys', () => ({ API_KEYS_QUERY_KEY: ['api-keys'] }))
vi.mock('../vaults', () => ({ reconcileAgentDiscovery: vi.fn() }))
vi.mock('./index', () => ({
  AgentPairingPage: (props: { canReadApiKeys: boolean; canWriteApiKeys: boolean }) => {
    mocks.page(props)
    return <div>Pairing approval</div>
  },
}))

const Component = Route.options.component
if (!Component) throw new Error('Pairing route component is required')

describe('pairing route permission changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.permissions = PERMISSION_AGENT_MANAGE | PERMISSION_READ_API_KEY | PERMISSION_WRITE_API_KEY
  })

  it.each([PERMISSION_READ_API_KEY, PERMISSION_AGENT_MANAGE])('hides approval and redirects after permissions become insufficient (%s)', async (permissions) => {
    const { rerender } = render(<Component />)
    expect(screen.getByText('Pairing approval')).toBeInTheDocument()
    mocks.permissions = permissions
    rerender(<Component />)
    expect(screen.queryByText('Pairing approval')).not.toBeInTheDocument()
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: '/vaults', replace: true }))
  })

  it('propagates loss of write capability while read pairing remains allowed', () => {
    const { rerender } = render(<Component />)
    mocks.permissions = PERMISSION_AGENT_MANAGE | PERMISSION_READ_API_KEY
    rerender(<Component />)
    expect(mocks.page).toHaveBeenLastCalledWith(expect.objectContaining({ canReadApiKeys: true, canWriteApiKeys: false }))
    expect(mocks.navigate).not.toHaveBeenCalled()
  })
})
