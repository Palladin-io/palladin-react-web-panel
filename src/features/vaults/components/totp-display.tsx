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
 * Live TOTP code with a countdown ring. The 6/8-digit code is generated
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

  return (
    <div className="flex items-center gap-2">
      <CountdownRing fraction={fraction} label={code ? String(code.expiresIn) : ''} urgent={almostGone} />
      <span
        className={`ph-no-capture font-mono tracking-[0.15em] tabular-nums text-[var(--cv-t1)] ${
          compact ? 'text-[13px]' : 'text-[15px] font-semibold'
        }`}
        aria-label={t('vault.entries.totp.currentCode')}
      >
        {grouped}
      </span>
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

function CountdownRing({
  fraction,
  label,
  urgent,
}: {
  fraction: number
  label: string
  urgent: boolean
}) {
  const size = 22
  const stroke = 2.5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const color = urgent ? 'var(--cv-primary)' : 'var(--cv-t2)'
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--cv-divider)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <span
        className="absolute text-[8px] font-semibold tabular-nums"
        style={{ color }}
        aria-hidden
      >
        {label}
      </span>
    </span>
  )
}
