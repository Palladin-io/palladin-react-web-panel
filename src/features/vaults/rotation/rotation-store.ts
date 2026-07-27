import { create } from 'zustand'

export type RotationPhase = 'idle' | 'claiming' | 'seeding' | 'members' | 'metadata' | 'entry-keys' | 'discoveries' | 'agents' | 'committing' | 'paused' | 'error'

interface RotationProgressState {
  phase: RotationPhase
  vaultId: string | null
  rotationId: string | null
  processedItems: number
  errorCode: string | null
  update: (progress: Partial<Omit<RotationProgressState, 'update' | 'clear'>>) => void
  clear: () => void
}

const empty = { phase: 'idle' as const, vaultId: null, rotationId: null, processedItems: 0, errorCode: null }

/** Structural UI progress only. This store must never contain keys, ciphertext, labels, or cursors. */
export const useRotationStore = create<RotationProgressState>((set) => ({
  ...empty,
  update: (progress) => set(progress),
  clear: () => set(empty),
}))
