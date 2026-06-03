import { PendingGrantsPanel } from './components/pending-grants-panel'

/**
 * Standalone Approvals screen at `/approvals` — the cross-vault queue of
 * GRANULAR grants awaiting the user's decision. A single centred column; the
 * approve/deny flows (including zero-knowledge re-encryption) live in the panel.
 */
export function PendingGrantsPage() {
  return (
    <div className="min-h-full text-[var(--cv-t1)]">
      <div className="mx-auto max-w-[640px] px-6 py-8">
        <PendingGrantsPanel />
      </div>
    </div>
  )
}
