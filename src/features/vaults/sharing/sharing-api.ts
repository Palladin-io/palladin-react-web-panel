import { api } from '../../../shared/api/client'

export type ShareRecipientMode = 'namedRecipient' | 'anyoneWithLink'
export type ShareProtection = 'none' | 'password' | 'pin'

export interface ShareCreationChallenge {
  shareId: string
  sourceRevision: string
  expiresAt: string
}

export interface CreateEntryShareInput {
  shareId: string
  sourceRevision: string
  expiresAt: string
  maximumReceipts: number
  recipientMode: ShareRecipientMode
  recipientEmail: string | null
  protection: ShareProtection
  protectionSecret: string | null
  accessToken: string
  nonce: string
  ciphertext: string
  notifyOnFirstReceipt: boolean
}

export interface EntryShareListItem {
  shareId: string
  status: string
  createdAt: string
  expiresAt: string
  maximumReceipts: number
  deliveryCount: number
  firstDeliveredAt: string | null
  lastDeliveredAt: string | null
  firstConfirmedAt: string | null
  notifyOnFirstReceipt: boolean
  recipientMode: string
  recipientEmail: string | null
  protection: string
  sourceChanged: boolean
}

export interface EntrySharesPage {
  items: EntryShareListItem[]
  nextCursor: string | null
}

function sharingPath(vaultId: string, entryId: string): string {
  return `api/vaults/${encodeURIComponent(vaultId)}/entries/${encodeURIComponent(entryId)}/sharing`
}

export function issueShareCreationChallenge(vaultId: string, entryId: string, signal: AbortSignal) {
  return api.post(`${sharingPath(vaultId, entryId)}/creation-challenge`, {
    signal, retry: 0, cache: 'no-store', redirect: 'error',
  }).json<ShareCreationChallenge>()
}

export async function createEntryShare(vaultId: string, entryId: string, input: CreateEntryShareInput, signal: AbortSignal): Promise<void> {
  await api.post(sharingPath(vaultId, entryId), {
    signal, retry: 0, cache: 'no-store', redirect: 'error',
    json: {
      shareId: input.shareId, sourceRevision: input.sourceRevision, expiresAt: input.expiresAt,
      maximumReceipts: input.maximumReceipts, recipientMode: input.recipientMode,
      recipientEmail: input.recipientEmail, protection: input.protection,
      protectionSecret: input.protectionSecret, accessToken: input.accessToken,
      nonce: input.nonce, ciphertext: input.ciphertext, notifyOnFirstReceipt: input.notifyOnFirstReceipt,
    },
  })
}

export function listEntryShares(vaultId: string, entryId: string, cursor: string | undefined, signal: AbortSignal) {
  return api.get(sharingPath(vaultId, entryId), {
    signal, cache: 'no-store', searchParams: cursor ? { cursor } : undefined,
  }).json<EntrySharesPage>()
}

export async function revokeEntryShare(vaultId: string, entryId: string, shareId: string, signal: AbortSignal): Promise<void> {
  await api.delete(`${sharingPath(vaultId, entryId)}/${encodeURIComponent(shareId)}`, {
    signal, cache: 'no-store', retry: 0, redirect: 'error',
  })
}
