import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../auth'
import { isProviderAccountDomain, type SignInEntryReference, type SignInProvider } from './sign-in-method'
import { openCurrentMemberEntrySecret } from './sync/current-member-entry-reader'
import { useMemberSyncStore } from './sync/member-sync-store'

export interface SignInAccountCandidate {
  vaultId: string
  entryId: string
  label: string
  username: string
}

interface CandidateHead extends SignInAccountCandidate {
  currentRevision: string
  currentKeyVersion: number
}

/**
 * Palladin Credentials of the provider's own account service that an Agent
 * could later request — the only entries a sign-in method may reference.
 * MemberIndex narrows candidates by registrable domain; `discoverable` exists
 * only in the encrypted MemberSecret, so each remaining candidate is opened
 * locally (no request) and only that flag is retained.
 */
export function useSignInAccountCandidates(
  provider: SignInProvider | null,
  excludeEntryId?: string,
): { candidates: SignInAccountCandidate[]; loading: boolean } {
  const vaults = useMemberSyncStore((state) => state.vaults)
  const heads = useMemo(() => {
    if (!provider) return []
    const matches: CandidateHead[] = []
    for (const vault of vaults.values()) {
      for (const record of vault.entries.values()) {
        const payload = record.payload
        if (record.state !== 'active' || record.corrupt || !payload || payload.entryType !== 'credential') continue
        if (record.entryId === excludeEntryId || !isProviderAccountDomain(provider, payload.urlDomain)) continue
        matches.push({
          vaultId: vault.vaultId, entryId: record.entryId, label: payload.memberLabel,
          username: payload.username ?? '', currentRevision: record.currentRevision,
          currentKeyVersion: record.currentKeyVersion,
        })
      }
    }
    return matches.sort((left, right) => left.label.localeCompare(right.label) || left.entryId.localeCompare(right.entryId))
  }, [vaults, provider, excludeEntryId])
  const headsKey = heads.map((head) => `${head.vaultId}:${head.entryId}:${head.currentRevision}:${head.currentKeyVersion}`).join('|')
  const [resolved, setResolved] = useState<{ key: string; candidates: SignInAccountCandidate[] }>({ key: '', candidates: [] })

  useEffect(() => {
    if (heads.length === 0) return
    let active = true
    void (async () => {
      const { userId, privateKey } = useAuthStore.getState()
      const candidates: SignInAccountCandidate[] = []
      if (userId && privateKey) {
        for (const head of heads) {
          try {
            const secret = await openCurrentMemberEntrySecret({
              userId, vaultId: head.vaultId, entryId: head.entryId,
              expectedRevision: head.currentRevision, expectedKeyVersion: head.currentKeyVersion,
              memberPrivateKey: privateKey,
            })
            if (secret.discoverable) {
              candidates.push({ vaultId: head.vaultId, entryId: head.entryId, label: head.label, username: head.username })
            }
          } catch {
            // An unreadable candidate is simply not offered.
          }
          if (!active) return
        }
      }
      if (active) setResolved({ key: headsKey, candidates })
    })()
    return () => { active = false }
    // headsKey captures every input of the resolution; `heads` is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headsKey])

  if (heads.length === 0) return { candidates: [], loading: false }
  return resolved.key === headsKey
    ? { candidates: resolved.candidates, loading: false }
    : { candidates: [], loading: true }
}

/** Presentation label of a referenced provider Credential from the in-memory MemberIndex, if present. */
export function useSignInEntryLabel(entry: SignInEntryReference | null): string | null {
  return useMemberSyncStore((state) => {
    if (!entry) return null
    const record = state.vaults.get(entry.vaultId)?.entries.get(entry.entryId)
    return record && record.state === 'active' && !record.corrupt ? record.payload?.memberLabel ?? null : null
  })
}
