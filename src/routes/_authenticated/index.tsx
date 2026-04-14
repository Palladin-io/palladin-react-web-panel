import { createFileRoute } from '@tanstack/react-router'
import { OnboardingWizard, useAccount } from '../../features/onboarding'

export const Route = createFileRoute('/_authenticated/')({
  component: AuthenticatedHome,
})

function AuthenticatedHome() {
  const account = useAccount()

  if (account.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#6B7A8E]">Loading...</p>
      </div>
    )
  }

  if (account.isError || !account.data) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-[#FF4F4F]">
          Could not load your account. Please reload the page.
        </p>
      </div>
    )
  }

  if (!account.data.hasPublicKey) {
    return <OnboardingWizard />
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Dashboard (coming soon)</h1>
    </div>
  )
}
