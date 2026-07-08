/**
 * Section divider used across the entry form: a small muted label followed by a
 * thin rule. Matches the approved redesign's `[name ── line]` rhythm.
 */
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <span className="text-[11.5px] text-[var(--cv-label-text)]">{children}</span>
      <span className="h-px flex-1 bg-[var(--cv-divider)]" />
    </div>
  )
}
