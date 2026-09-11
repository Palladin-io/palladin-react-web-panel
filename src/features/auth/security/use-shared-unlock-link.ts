import { useQuery } from '@tanstack/react-query'
import { env } from '../../../shared/lib/env'
import { useAuthStore } from '../stores/auth-store'
import { sharedUnlockLinks } from '../shared-unlock/link-runtime'
import { disconnectSharedUnlockLink, reconnectSharedUnlockLink } from '../shared-unlock/link-actions'

export function useSharedUnlockLink() {
  const accountId = useAuthStore(state => state.userId)
  const generation = useAuthStore(state => state.cryptoSessionGeneration)
  const apiUrl = env.apiUrl, extensionId = env.sharedUnlockExtensionId, webOrigin = window.location.origin
  const configured = Boolean(extensionId)
  const link = useQuery({
    queryKey: ['account', 'shared-unlock-link', apiUrl, webOrigin, extensionId, accountId, generation],
    enabled: configured && Boolean(accountId), retry: false, refetchInterval: 15_000,
    queryFn: () => sharedUnlockLinks.read({ accountId: accountId!, apiUrl, extensionId, webOrigin }),
  })
  const act = (action: 'disconnect' | 'reconnect', linkId: string) => {
    if (!accountId || env.apiUrl !== apiUrl || env.sharedUnlockExtensionId !== extensionId || window.location.origin !== webOrigin) {
      return Promise.reject(new Error('Shared link own scope changed'))
    }
    const input = { accountId, generation, linkId }
    return action === 'disconnect' ? disconnectSharedUnlockLink(input) : reconnectSharedUnlockLink(input)
  }
  return { configured, link, act }
}
