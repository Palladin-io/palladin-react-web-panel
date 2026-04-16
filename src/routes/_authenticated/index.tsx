import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useAuthStore } from '../../features/auth'
import { OnboardingWizard, useAccount } from '../../features/onboarding'

export const Route = createFileRoute('/_authenticated/')({
  component: AuthenticatedHome,
})

function AuthenticatedHome() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)
  const isVaultLocked = useAuthStore((s) => s.isVaultLocked)
  const account = useAccount()

  // Safety net: account has key material on the server but the vault isn't
  // unlocked. This can happen when isOnboarded was false in the JWT (so
  // _authenticated.tsx didn't redirect to /unlock) but the account turns out
  // to be fully set up. Redirect imperatively once the account data arrives.
  useEffect(() => {
    if (account.data?.hasPublicKey && isVaultLocked) {
      navigate({ to: '/unlock' })
    }
  }, [account.data?.hasPublicKey, isVaultLocked, navigate])

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

  // Show the onboarding wizard only when the account genuinely has no key
  // material AND the vault is still locked (first-time setup). If the vault
  // is already unlocked — because setup just completed, or because unlock
  // succeeded with temporarily-stale hasPublicKey data — skip the wizard so
  // the user isn't looped back into onboarding right after unlocking.
  if (!account.data.hasPublicKey && isVaultLocked) {
    return <OnboardingWizard />
  }

  // hasPublicKey: true but vault still locked — redirect is in flight via
  // the effect above. Render nothing while the navigation resolves.
  if (isVaultLocked) {
    return null
  }

  function handleLogout() {
    logout()
    navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="mb-6 text-2xl font-bold">Dashboard (coming soon)</h1>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-lg border border-[rgba(253,249,228,0.1)] bg-[rgba(253,249,228,0.04)]
            px-4 py-2 text-sm text-[#FDF9E4] transition-colors hover:bg-[rgba(253,249,228,0.08)]"
        >
          Log out
        </button>
      </div>
    </div>
  )
}
