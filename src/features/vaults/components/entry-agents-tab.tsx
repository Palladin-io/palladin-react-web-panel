import { OrgGrantsPanel } from '../../grants'
import type { CanonicalEntryDetail } from '../api/vault-api'
import type { EntryType } from '../types'

interface EntryAgentsTabProps {
  vaultId: string
  entryId: string
  entryType: EntryType
  memberLabel: string
  detail: CanonicalEntryDetail
}

/**
 * Entry Discovery visibility is edited in-place beside safe fields on the
 * Details tab. This tab is intentionally limited to scoped Agent grants.
 */
export function EntryAgentsTab({ entryId }: EntryAgentsTabProps) {
  return (
    <OrgGrantsPanel entryId={entryId} allowRegrant={false} />
  )
}
