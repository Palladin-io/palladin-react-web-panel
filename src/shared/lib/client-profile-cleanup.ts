export type ClientProfileCleanup = (userId: string) => void | Promise<void>

const profileCleanups = new Set<ClientProfileCleanup>()

export function registerClientProfileCleanup(cleanup: ClientProfileCleanup): () => void {
  profileCleanups.add(cleanup)
  return () => profileCleanups.delete(cleanup)
}

export async function runClientProfileCleanups(userId: string | null): Promise<void> {
  if (!userId) return
  const results = await Promise.allSettled(Array.from(profileCleanups, (cleanup) => cleanup(userId)))
  if (results.some((result) => result.status === 'rejected')) {
    throw new Error('Client profile cleanup did not complete')
  }
}
