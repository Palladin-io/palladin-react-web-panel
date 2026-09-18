import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CopyButton } from '../../../shared/components/copy-button'
import { useTotp } from '../../../shared/hooks/use-totp'
import { parseOtpauthUri } from '../../../shared/crypto/totp'
import type { TotpParams } from '../types'

export interface TotpDisplayProps {
  params: TotpParams
  /** Compact variant for inline rows (smaller code, no issuer subtitle). */
  compact?: boolean
}

/**
 * Live TOTP code with an icon-sized countdown ring. The 6/8-digit code is generated
 * client-side (see `shared/crypto/totp.ts`), grouped for readability, and
 * auto-rolls at the window boundary. Copy uses the plain clipboard path — the
 * code is inherently short-lived (≤ one period), unlike a stored secret.
 */
export function TotpDisplay({ params, compact }: TotpDisplayProps) {
  const { t } = useTranslation()
  const code = useTotp(params)

  const grouped = code ? groupDigits(code.code) : '••• •••'
  const fraction = code ? code.expiresIn / code.period : 0
  const almostGone = code ? code.expiresIn <= 5 : false
  const circumference = 2 * Math.PI * 7

  return (
    <div className="flex items-center gap-2">
      <span
        className={`ph-no-capture whitespace-nowrap font-mono tracking-wider tabular-nums text-[var(--cv-t1)] ${compact ? 'text-heading-sm' : 'text-heading font-semibold'}`}
        aria-label={t('vault.entries.totp.currentCode')}
      >
        {grouped}
      </span>
      <div
        role="timer"
        aria-live="off"
        aria-label={code ? t('vault.entries.totp.remaining', { seconds: code.expiresIn }) : undefined}
        className={`flex shrink-0 items-center gap-1.5 ${almostGone ? 'text-[var(--cv-primary)]' : 'text-[var(--cv-success)]'}`}
      >
        <svg viewBox="0 0 16 16" className="size-4 -rotate-90" fill="none" aria-hidden>
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            style={{ strokeDashoffset: circumference * (1 - fraction) }}
            className={fraction < 1 ? 'motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear' : undefined}
          />
        </svg>
        <span className="w-[4ch] text-meta tabular-nums" aria-hidden>
          {code ? t('vault.entries.totp.seconds', { seconds: code.expiresIn }) : '—'}
        </span>
      </div>
      {code ? <CopyButton value={code.code} label={t('vault.entries.totp.copyCode')} /> : null}
    </div>
  )
}

/**
 * Live TOTP for a raw `otpauth://` URI (the legacy credential-level `totp`
 * field, kept for import/export round-trip). Parses once and reuses the same
 * {@link TotpDisplay}; renders nothing if the URI can't be parsed.
 */
export function OtpauthTotp({ uri, compact }: { uri: string; compact?: boolean }) {
  const params = useMemo(() => parseOtpauthUri(uri), [uri])
  if (!params) return null
  return <TotpDisplay params={params} compact={compact} />
}

function groupDigits(code: string): string {
  const half = Math.ceil(code.length / 2)
  return `${code.slice(0, half)} ${code.slice(half)}`
}
