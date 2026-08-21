import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import { PERMISSION_ORGANIZATION_MANAGEMENT } from '../../shared/lib/permissions'
import { PermissionsPage } from './permissions-page'

const navigate = vi.hoisted(() => vi.fn())

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigate,
}))

vi.mock('../../shared/components/responsive-master-detail', () => ({
  ResponsiveMasterDetail: ({ master }: { master: ReactNode }) => <>{master}</>,
}))

vi.mock('./components/create-role-dialog', () => ({
  CreateRoleDialog: () => null,
}))

vi.mock('./components/role-detail', () => ({
  RoleDetail: () => null,
}))

vi.mock('./use-organization-roles', () => ({
  useOrganizationRoles: () => ({
    data: {
      items: [{
        id: 'administrator',
        name: 'Administrator',
        permissions: 2_147_483_647,
        isSystem: true,
        canAssign: true,
        assignedMemberCount: 1,
      }],
      assignablePermissions: [],
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))

describe('PermissionsPage', () => {
  beforeEach(() => {
    navigate.mockReset()
    useAuthStore.setState({ permissions: PERMISSION_ORGANIZATION_MANAGEMENT })
  })

  it('places the role type badge in the primary-name row using status-pill geometry', () => {
    render(<PermissionsPage />)

    const roleName = screen.getByText('Administrator')
    const roleType = screen.getByText('System')

    expect(roleType).toHaveClass('h-5', 'px-2', 'text-micro', 'font-semibold')
    expect(roleType.parentElement).toBe(roleName.parentElement)
  })

  it('hides cached roles and leaves the route when OrganizationManagement is revoked', () => {
    render(<PermissionsPage />)
    expect(screen.getByText('Administrator')).toBeInTheDocument()

    act(() => useAuthStore.setState({ permissions: 0 }))

    expect(screen.queryByText('Administrator')).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith({ to: '/settings/general', replace: true })
  })
})
