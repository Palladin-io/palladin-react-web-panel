import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../features/auth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => {
    const { accessToken } = useAuthStore.getState()
    if (!accessToken) {
      throw redirect({ to: '/login' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return <Outlet />
}
