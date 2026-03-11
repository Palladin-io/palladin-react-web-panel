import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold">Claw Vault</h1>
    </div>
  )
}
