import { parseJwtPayload } from './jwt'

export function organizationIdFromAccessToken(accessToken: string | null): string | null {
  if (!accessToken) return null
  const value = parseJwtPayload(accessToken)['org_id']
  return typeof value === 'string' ? value : null
}
