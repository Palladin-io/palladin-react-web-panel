import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import { hexWithAlpha } from './vault-color'
import type { MockEntry } from './vault-entries-mock'

export interface VaultEntriesListProps {
  entries: MockEntry[]
}

/**
 * Single card containing every entry as a row, separated by hairline
 * dividers — mirrors the Astro `VaultDetailEntries.astro` design. Each
 * row hosts an icon, name, meta, and four action buttons. The reveal
 * action expands an animated panel showing the URL plus either the
 * key value or the credential username/password.
 *
 * Reveal state is local (per-row, transient). Once CVT-9 wires the
 * entry API + zero-knowledge decrypt, the reveal action will trigger
 * a vault-key decrypt instead of toggling stub data.
 */
export function VaultEntriesList({ entries }: VaultEntriesListProps) {
  return (
    <div
      className="rounded-2xl border border-[rgba(253,249,228,0.08)] bg-[rgba(13,27,62,0.6)]
        px-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
    >
      {entries.map((entry, index) => (
        <EntryRow
          key={entry.id}
          entry={entry}
          showDivider={index > 0}
        />
      ))}
    </div>
  )
}

interface EntryRowProps {
  entry: MockEntry
  showDivider: boolean
}

function EntryRow({ entry, showDivider }: EntryRowProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [revealedSecret, setRevealedSecret] = useState(false)

  return (
    <div
      style={
        showDivider
          ? { borderTop: '1px solid rgba(138,149,166,0.08)' }
          : undefined
      }
    >
      <div className="flex items-center gap-3 py-2.5">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: hexWithAlpha(entry.iconColor, 0.12) }}
        >
          <Icon name={entry.icon} size={16} color={entry.iconColor} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-[#FDF9E4]">
            {entry.name}
          </span>
          <span className="text-[11px] text-[#8A95A6]">{entry.meta}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <RowAction
            icon={open ? 'visibility_off' : 'visibility'}
            ariaLabel={open ? t('vault.entry.hide') : t('vault.entry.reveal')}
            onClick={() => {
              setOpen((prev) => {
                if (prev) setRevealedSecret(false)
                return !prev
              })
            }}
          />
          <RowAction
            icon="content_copy"
            ariaLabel={
              entry.type === 'key'
                ? t('vault.entry.copyKey')
                : t('vault.entry.copyPassword')
            }
            onClick={() => copyToClipboard(getSecret(entry))}
          />
          <RowAction
            icon="open_in_new"
            ariaLabel={t('vault.entry.openUrl')}
            onClick={() => openExternal(entry.url)}
          />
          <RowAction
            icon="arrow_forward"
            ariaLabel={t('vault.entry.viewDetails')}
            onClick={() => {
              // Detail navigation lands with CVT-9. For the design pass
              // we keep the affordance visible without a destination.
              console.info('view entry', entry.id)
            }}
            tone="prominent"
          />
        </div>
      </div>

      <RevealPanel
        entry={entry}
        open={open}
        revealedSecret={revealedSecret}
        onToggleSecret={() => setRevealedSecret((prev) => !prev)}
      />
    </div>
  )
}

interface RevealPanelProps {
  entry: MockEntry
  open: boolean
  revealedSecret: boolean
  onToggleSecret: () => void
}

function RevealPanel({
  entry,
  open,
  revealedSecret,
  onToggleSecret,
}: RevealPanelProps) {
  const { t } = useTranslation()
  return (
    <div
      style={{
        maxHeight: open ? 220 : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.25s ease, opacity 0.2s ease',
      }}
    >
      <div className="flex flex-col gap-2 pb-3 pl-11 pr-1 pt-0.5">
        <DetailRow icon="link">
          <span className="flex-1 text-[12px] text-[#C4BAA1]">{entry.url}</span>
          <RowAction
            icon="content_copy"
            size="sm"
            ariaLabel={t('vault.entry.copyUrl')}
            onClick={() => copyToClipboard(entry.url)}
          />
          <RowAction
            icon="open_in_new"
            size="sm"
            ariaLabel={t('vault.entry.openInBrowser')}
            onClick={() => openExternal(entry.url)}
          />
        </DetailRow>

        {entry.type === 'key' ? (
          <DetailRow icon="vpn_key">
            <SecretValue
              value={entry.value}
              revealed={revealedSecret}
              monoSpacing="0.5px"
            />
            <RowAction
              icon={revealedSecret ? 'visibility_off' : 'visibility'}
              size="sm"
              ariaLabel={
                revealedSecret ? t('vault.entry.hide') : t('vault.entry.reveal')
              }
              onClick={onToggleSecret}
            />
            <RowAction
              icon="content_copy"
              size="sm"
              ariaLabel={t('vault.entry.copyKey')}
              onClick={() => copyToClipboard(entry.value)}
            />
          </DetailRow>
        ) : (
          <>
            <DetailRow icon="person">
              <span className="flex-1 text-[12px] text-[#FDF9E4]">
                {entry.username}
              </span>
              <RowAction
                icon="content_copy"
                size="sm"
                ariaLabel={t('vault.entry.copyUsername')}
                onClick={() => copyToClipboard(entry.username)}
              />
            </DetailRow>
            <DetailRow icon="lock">
              <SecretValue
                value={entry.password}
                revealed={revealedSecret}
                monoSpacing="2px"
              />
              <RowAction
                icon={revealedSecret ? 'visibility_off' : 'visibility'}
                size="sm"
                ariaLabel={
                  revealedSecret
                    ? t('vault.entry.hide')
                    : t('vault.entry.reveal')
                }
                onClick={onToggleSecret}
              />
              <RowAction
                icon="content_copy"
                size="sm"
                ariaLabel={t('vault.entry.copyPassword')}
                onClick={() => copyToClipboard(entry.password)}
              />
            </DetailRow>
          </>
        )}
      </div>
    </div>
  )
}

interface DetailRowProps {
  icon: string
  children: React.ReactNode
}

function DetailRow({ icon, children }: DetailRowProps) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={13} color="#8A95A6" />
      {children}
    </div>
  )
}

interface SecretValueProps {
  value: string
  revealed: boolean
  monoSpacing: string
}

function SecretValue({ value, revealed, monoSpacing }: SecretValueProps) {
  return (
    <span
      className="flex-1 truncate text-[12px] text-[#FDF9E4]"
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        letterSpacing: revealed ? '0.5px' : monoSpacing,
      }}
    >
      {revealed ? value : '••••••••••••••••'}
    </span>
  )
}

interface RowActionProps {
  icon: string
  ariaLabel: string
  onClick: () => void
  size?: 'sm' | 'md'
  tone?: 'normal' | 'prominent'
}

function RowAction({
  icon,
  ariaLabel,
  onClick,
  size = 'md',
  tone = 'normal',
}: RowActionProps) {
  const buttonSize = size === 'sm' ? 'h-6 w-6' : 'h-7 w-7'
  const glyphSize = size === 'sm' ? 13 : 17
  const color = tone === 'prominent' ? '#C4BAA1' : '#8A95A6'
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      title={ariaLabel}
      className={`inline-flex items-center justify-center rounded-md transition-colors
        hover:bg-[rgba(253,249,228,0.06)] hover:text-[#FDF9E4] ${buttonSize}`}
    >
      <Icon name={icon} size={glyphSize} color={color} />
    </button>
  )
}

function copyToClipboard(value: string) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  void navigator.clipboard.writeText(value).catch(() => {
    /* clipboard write can be blocked in iframes / insecure contexts — silent */
  })
}

function openExternal(url: string) {
  if (typeof window === 'undefined') return
  const target = url.startsWith('http://') || url.startsWith('https://')
    ? url
    : `https://${url}`
  window.open(target, '_blank', 'noopener,noreferrer')
}

function getSecret(entry: MockEntry): string {
  return entry.type === 'key' ? entry.value : entry.password
}
