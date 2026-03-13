import { createFileRoute } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'

export const Route = createFileRoute('/_authenticated/')({
  component: AuthenticatedHome,
})

function AuthenticatedHome() {
  const isOnboarded = useAuthStore((s) => s.isOnboarded)

  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">
        {isOnboarded ? 'Dashboard (coming soon)' : 'Onboarding (coming soon)'}
      </h1>
    </div>
  )
}
