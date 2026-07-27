import type { ReactNode } from 'react'

interface RotationProviderProps {
  children: ReactNode
  enabled: boolean
  memberId: string | null
  memberPrivateKey: Uint8Array | null
}

/**
 * Rotation is intentionally fail-closed during the canonical-envelope cutover.
 * The previous engine emitted the superseded flattened protocol and must never
 * run against Vault protocol v2. A canonical rotation engine will re-enable
 * polling once every rotation batch DTO is descriptor-based end to end.
 */
export function RotationProvider({ children }: RotationProviderProps) {
  return children
}
