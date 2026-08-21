import { useQuery } from '@tanstack/react-query'
import { parseJwtPayload } from '../../shared/lib/jwt'
import { useAuthStore } from '../auth'
import { getOrganization } from './api/org-api'

export const ORG_QUERY_KEY = ['organization'] as const

export function useOrg() {
  const accessToken = useAuthStore((state) => state.accessToken)
  const organizationId = organizationIdFromToken(accessToken)

  return useQuery({
    queryKey: [...ORG_QUERY_KEY, organizationId ?? 'session'],
    queryFn: getOrganization,
    staleTime: 5 * 60 * 1000,
    enabled: organizationId !== null,
  })
}

function organizationIdFromToken(accessToken: string | null): string | null {
  if (!accessToken) return null
  const value = parseJwtPayload(accessToken)['org_id']
  return typeof value === 'string' ? value : null
}
