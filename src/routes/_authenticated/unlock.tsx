import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '../../features/auth'
import { UnlockPage } from '../../features/unlock'

export const Route = createFileRoute('/_authenticated/unlock')({
  beforeLoad: () => {
    // An already-unlocked vault has no reason to visit this screen —
    // bounce back to the dashboard rather than let the user type a
    // password that will never be used.
    const { isVaultLocked } = useAuthStore.getState()
    if (!isVaultLocked) {
      throw redirect({ to: '/' })
    }
  },
  component: UnlockPage,
})
