import { createRootRoute, Outlet } from '@tanstack/react-router'
import { ConsentRuntime } from '../features/privacy'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="min-h-screen bg-gray-950 font-sans text-white antialiased">
      <ConsentRuntime />
      <Outlet />
    </div>
  )
}
