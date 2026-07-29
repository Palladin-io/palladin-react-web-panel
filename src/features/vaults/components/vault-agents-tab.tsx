import { OrgGrantsPanel } from '../../grants'

export function VaultAgentsTab({ vaultId }: { vaultId: string }) {
  return <OrgGrantsPanel vaultId={vaultId} allowRegrant={false} />
}
