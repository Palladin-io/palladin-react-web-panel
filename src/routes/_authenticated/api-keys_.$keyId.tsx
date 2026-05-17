import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysPage } from '../../features/api-keys'

export const Route = createFileRoute('/_authenticated/api-keys_/$keyId')({
  component: ApiKeyDetailRoute,
})

function ApiKeyDetailRoute() {
  const { keyId } = Route.useParams()
  return <ApiKeysPage keyId={keyId} />
}
