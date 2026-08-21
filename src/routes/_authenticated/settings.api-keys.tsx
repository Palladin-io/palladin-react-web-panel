import { createFileRoute, redirect } from '@tanstack/react-router'
import { ApiKeysPage } from '../../features/api-keys'
import { useAuthStore } from '../../features/auth'
import { PERMISSION_READ_API_KEY } from '../../shared/lib/permissions'

export const Route = createFileRoute('/_authenticated/settings/api-keys')({
  beforeLoad: requireApiKeyRead,
  component: ApiKeysPage,
})

function requireApiKeyRead() {
  if ((useAuthStore.getState().permissions & PERMISSION_READ_API_KEY) === 0) {
    throw redirect({ to: '/settings/general' })
  }
}
