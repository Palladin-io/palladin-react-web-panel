import { createDefaultVault, getAccount } from '../api/account-api'
import { api } from '../api/client'
import { createVaultProtocolPayload } from '../crypto/create-vault-protocol'
import { useAuthStore } from '../../features/auth'
import { parseJwtPayload } from './jwt'

export async function createDefaultVaultSafe(privateKey: Uint8Array, name: string): Promise<void> {
  try {
    const { accessToken, userId } = useAuthStore.getState()
    if (!accessToken || !userId) return
    const organizationId = parseJwtPayload(accessToken)['org_id']
    if (typeof organizationId !== 'string') return
    const [challenge, account] = await Promise.all([
      api.post('api/vaults/creation-challenges').json<{ vaultId: string }>(), getAccount(),
    ])
    if (!account.memberKeyVersion) return
    const payload = await createVaultProtocolPayload({ vaultId: challenge.vaultId, organizationId,
      memberId: userId, memberKeyVersion: account.memberKeyVersion, memberPrivateKey: privateKey,
      metadata: { schema: 'palladin.member-vault-metadata.v1', name: name.normalize('NFC'),
        description: null, icon: { kind: 'glyph', value: 'shield' }, color: '#EB4747', grantMode: 'granular' } })
    await createDefaultVault(payload)
  } catch { /* default Vault creation remains non-blocking and idempotent */ }
}
