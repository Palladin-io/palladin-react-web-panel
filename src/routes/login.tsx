import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage, useAuthStore } from '../features/auth'

export const Route = createFileRoute('/login')({
  beforeLoad: () => {
    const { accessToken } = useAuthStore.getState()
    if (accessToken) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})
