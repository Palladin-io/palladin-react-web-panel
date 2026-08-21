import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../auth'
import {
  PERMISSION_ORGANIZATION_MANAGEMENT,
  PERMISSION_READ_API_KEY,
} from '../../shared/lib/permissions'
import { SettingsLayout } from './settings-layout'

let pathname = '/settings/general'
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children: ReactNode; to: string }) => <a href={to} {...props}>{children}</a>,
  Outlet: () => <div>Section content</div>,
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
    select({ location: { pathname } }),
}))

describe('SettingsLayout', () => {
  beforeEach(() => {
    pathname = '/settings/general'
    useAuthStore.setState({ permissions: PERMISSION_READ_API_KEY })
  })

  it('starts with organization links directly and keeps the account group', () => {
    render(<SettingsLayout />)
    expect(screen.getByRole('heading', { name: 'Settings' }).parentElement?.parentElement)
      .toHaveClass('h-[4.5rem]', 'items-center')
    expect(screen.queryByText('Organization')).not.toBeInTheDocument()
    expect(screen.getAllByText('Account').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /api keys/i }).length).toBeGreaterThan(0)
    expect(screen.getByText('Section content')).toBeInTheDocument()
  })

  it('hides API keys when the session lacks read permission', () => {
    useAuthStore.setState({ permissions: 0 })
    render(<SettingsLayout />)
    expect(screen.queryByRole('link', { name: /api keys/i })).not.toBeInTheDocument()
  })

  it('shows Permissions only to organization managers', () => {
    useAuthStore.setState({ permissions: PERMISSION_ORGANIZATION_MANAGEMENT })
    const { rerender } = render(<SettingsLayout />)
    expect(screen.getAllByRole('link', { name: /permissions/i }).length).toBeGreaterThan(0)

    useAuthStore.setState({ permissions: 0 })
    rerender(<SettingsLayout />)
    expect(screen.queryByRole('link', { name: /permissions/i })).not.toBeInTheDocument()
  })
})
