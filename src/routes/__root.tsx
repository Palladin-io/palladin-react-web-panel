import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ConsentRuntime } from '../features/privacy'
import { EntryShareContinuationGuard } from '../features/vaults'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-gray-950 font-sans text-white antialiased">
      <ConsentRuntime />
      <EntryShareContinuationGuard />
      <Outlet />
    </div>
  )
}
