type PrincipalStateResetter = () => void
type PrincipalProducerStopper = () => void

const resetters = new Set<PrincipalStateResetter>()
const producerStoppers = new Set<PrincipalProducerStopper>()

export function registerAuthenticatedPrincipalReset(
  resetter: PrincipalStateResetter,
): () => void {
  resetters.add(resetter)
  return () => resetters.delete(resetter)
}

/**
 * Registers an in-memory producer that must be fenced synchronously when a
 * principal transition starts. Stoppers invalidate their local epoch and
 * abort/queue transport shutdown; the boundary does not wait for network I/O
 * before advancing the auth generation.
 */
export function registerAuthenticatedPrincipalProducerStop(
  stopper: PrincipalProducerStopper,
): () => void {
  producerStoppers.add(stopper)
  return () => producerStoppers.delete(stopper)
}

export function stopAuthenticatedPrincipalProducers(): void {
  for (const stop of producerStoppers) {
    try {
      stop()
    } catch {
      // One producer must never prevent the boundary from fencing the rest.
    }
  }
}

export function resetAuthenticatedPrincipalState(): void {
  for (const reset of resetters) {
    try {
      reset()
    } catch {
      // Continue wiping other principal-scoped state even if one resetter fails.
    }
  }
}
