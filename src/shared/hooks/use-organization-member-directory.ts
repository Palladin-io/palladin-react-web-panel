import { useEffect, useMemo, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getOrganizationMemberDirectory,
  ORGANIZATION_MEMBER_DIRECTORY_QUERY_KEY,
} from '../api/organization-member-directory-api'

const DIRECTORY_STALE_TIME_MS = 5 * 60 * 1000

export function useOrganizationMemberDirectory(
  organizationId: string | null,
  requiredUserIds: readonly string[] = [],
  enabled = true,
) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: [
      ...ORGANIZATION_MEMBER_DIRECTORY_QUERY_KEY,
      organizationId ?? 'no-organization',
    ],
    queryFn: getOrganizationMemberDirectory,
    staleTime: DIRECTORY_STALE_TIME_MS,
    enabled: enabled && organizationId !== null,
  })

  const nameById = useMemo(() => {
    const names: Record<string, string> = {}
    for (const entry of query.data ?? []) {
      const displayName = entry.displayName.trim()
      if (displayName) names[entry.userId] = displayName
    }
    return names
  }, [query.data])

  const attemptedMissingIds = useRef({
    organizationId,
    ids: new Set<string>(),
  })
  const previousOrganizationId = useRef(organizationId)
  useEffect(() => {
    const previous = previousOrganizationId.current
    if (previous !== null && previous !== organizationId) {
      queryClient.removeQueries({
        queryKey: [...ORGANIZATION_MEMBER_DIRECTORY_QUERY_KEY, previous],
        exact: true,
      })
    }
    previousOrganizationId.current = organizationId
  }, [organizationId, queryClient])

  useEffect(() => {
    attemptedMissingIds.current = { organizationId, ids: new Set<string>() }
  }, [organizationId])

  const { isFetching, isSuccess, refetch } = query
  useEffect(() => {
    if (!enabled || !isSuccess || isFetching || organizationId === null) return

    const newlyMissing = [...new Set(requiredUserIds)]
      .filter((userId) => !nameById[userId])
      .filter((userId) => !attemptedMissingIds.current.ids.has(userId))
    if (newlyMissing.length === 0) return

    for (const userId of newlyMissing) attemptedMissingIds.current.ids.add(userId)
    void refetch()
  }, [enabled, isFetching, isSuccess, nameById, organizationId, refetch, requiredUserIds])

  return { ...query, nameById }
}
