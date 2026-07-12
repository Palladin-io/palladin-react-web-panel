import { createFileRoute, redirect } from '@tanstack/react-router'
import { RegisterPage, useAuthStore } from '../features/auth'

export const Route = createFileRoute('/register')({
  beforeLoad: () => {
    // A persisted refresh token counts as a live (restorable) session even
    // when the in-memory access token is null after a reload.
    const { accessToken, refreshToken } = useAuthStore.getState()
    if (accessToken || refreshToken) {
      throw redirect({ to: '/' })
    }
  },
  component: RegisterPage,
})
