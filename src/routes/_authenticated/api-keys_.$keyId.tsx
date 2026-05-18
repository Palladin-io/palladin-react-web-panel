import { createFileRoute, redirect } from '@tanstack/react-router'
import { ApiKeysPage } from '../../features/api-keys'
import { useAuthStore } from '../../features/auth'
import { PERMISSION_READ_API_KEY } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/api-keys_/$keyId')({
  beforeLoad: () => {
    const { permissions } = useAuthStore.getState()
    if ((permissions & PERMISSION_READ_API_KEY) === 0) {
      throw redirect({ to: '/vaults' })
    }
  },
  component: ApiKeyDetailRoute,
})

function ApiKeyDetailRoute() {
  const { keyId } = Route.useParams()
  return <ApiKeysPage keyId={keyId} />
}
