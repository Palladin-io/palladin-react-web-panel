import { useTranslation } from 'react-i18next'
import { GRANT_METHOD_LABEL_KEY, type GrantMethod } from '../grant-methods'

export interface GrantMethodsBadgesProps {
  methods: GrantMethod[]
}

/**
 * Compact read-only chips showing which methods a grant permits. Rendered on grant cards/detail so
 * a vault owner can see at a glance whether an agent can read the plaintext (`get`) or only use it
 * indirectly (`exec`/`inject`). Renders nothing when the set is empty.
 */
export function GrantMethodsBadges({ methods }: GrantMethodsBadgesProps) {
  const { t } = useTranslation()
  if (methods.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1">
      {methods.map((method) => (
        <span
          key={method}
          className="rounded-[4px] border border-[var(--cv-input-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--cv-t2)]"
        >
          {t(GRANT_METHOD_LABEL_KEY[method])}
        </span>
      ))}
    </div>
  )
}
