import type { MemberSecretV1 } from '../../../shared/crypto/vault-plaintext'
import type { ShareSourceScope } from './use-share-creation'
import type { EntryShareListItem } from './sharing-api'

export const sharingScope: ShareSourceScope = {
  organizationId: '11112233-4455-4677-8899-aabbccddeeff', vaultId: '22222233-4455-4677-8899-aabbccddeeff',
  entryId: '33332233-4455-4677-8899-aabbccddeeff', revision: '4', keyVersion: 2,
}
export const sharingId = '00112233-4455-4677-8899-aabbccddeeff'
export const sharingSource: MemberSecretV1 = {
  schema: 'palladin.member-secret.v1', memberLabel: 'Example login', agentLabel: null,
  discoverable: false, description: null, icon: null, color: null, agentFieldAccess: {},
  entryType: 'credential', content: { username: 'alice', password: 'fixture-password',
    url: null, urlDomain: null, totp: null, notes: 'private-note', customFields: [],
  },
}
export const sharingListItem: EntryShareListItem = {
  shareId: sharingId, status: 'active', createdAt: '2026-09-20T12:00:00Z', expiresAt: '2026-09-21T12:00:00Z',
  maximumReceipts: 3, deliveryCount: 1, firstDeliveredAt: '2026-09-20T13:00:00Z',
  lastDeliveredAt: '2026-09-20T13:00:00Z', firstConfirmedAt: null, notifyOnFirstReceipt: true,
  recipientMode: 'namedRecipient', recipientEmail: 'recipient@example.test', protection: 'none', sourceChanged: false,
}
export function sharingTestAccessToken() {
  return `test.${btoa(JSON.stringify({ org_id: sharingScope.organizationId }))}.test`
}
