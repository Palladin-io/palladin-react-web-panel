import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { decryptEntry } from '../../../shared/crypto/entry-crypto'
import { wipe } from '../../../shared/crypto/sodium'
import { unsealVaultKey } from '../../../shared/crypto/vault-key'
import { Icon } from '../../../shared/components/icon'
import { useAuthStore } from '../../auth'
import { analytics } from '../../../shared/lib/analytics'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  type EntryListItem,
  type EntryPlaintext,
} from '../types'
import { useEntryDetail } from '../use-entries'
import { presentationForType } from './entry-presentation'

export interface EntryRowProps {
  vaultId: string
  /** Caller's wrapped VK from the vault detail response (base64). */
  wrappedVK: string | undefined
  entry: EntryListItem
  showDivider?: boolean
}

/**
 * Single entry row + lazy reveal panel.
 *
 * The list endpoint never returns the encrypted blob — when the user
 * clicks the visibility action, this row triggers a one-shot fetch of
 * the full entry (`GET /vaults/{id}/entries/{eid}`), unseals VK with
 * the in-memory private key, decrypts the blob, and renders the
 * plaintext fields. Decrypt failures translate into a toast error so
 * the row stays interactive (the user can re-attempt or move on).
 */
export function EntryRow({ vaultId, wrappedVK, entry, showDivider }: EntryRowProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presentation = presentationForType(entry.type)
  const icon = entry.icon ?? presentation.defaultIcon

  const [revealOpen, setRevealOpen] = useState(false)
  const [plaintext, setPlaintext] = useState<EntryPlaintext | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)

  // Trigger the detail fetch only after the user opens the panel.
  const detail = useEntryDetail(vaultId, entry.id, revealOpen)

  // Decrypt when the blob arrives; reset state on close.
  useEffect(() => {
    if (!revealOpen) {
      setPlaintext(null)
      setShowSecret(false)
      setDecryptError(null)
      return
    }
    if (!detail.data) return

    const privateKey = useAuthStore.getState().privateKey
    if (!privateKey || !wrappedVK) {
      setDecryptError(t('vault.entries.decryptVaultLocked'))
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const vaultKey = await unsealVaultKey(wrappedVK, privateKey)
        try {
          const result = await decryptEntry(detail.data.content, vaultKey)
          if (!cancelled) {
            setPlaintext(result)
          }
        } finally {
          wipe(vaultKey)
        }
      } catch {
        if (!cancelled) {
          setDecryptError(t('vault.entries.decryptFailed'))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [revealOpen, detail.data, wrappedVK, t])

  const meta = entry.urlDomain ?? formatLastAccessed(entry, t)
  const isLoadingDetail = revealOpen && detail.isPending

  return (
    <div
      className={`flex flex-col px-4 cursor-pointer transition-colors hover:bg-[var(--cv-bg-subtle)] ${showDivider ? 'border-t border-[var(--cv-divider)]' : ''}`}
    >
      <div
        className="flex items-center gap-3 py-2.5"
        onClick={() =>
          navigate({
            to: '/vaults/$vaultId/entries/$entryId',
            params: { vaultId, entryId: entry.id },
          })
        }
      >
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: presentation.iconBg, color: presentation.iconColor }}
        >
          <Icon name={icon} size={16} color={presentation.iconColor} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-[var(--cv-t1)]">
            {entry.label}
          </span>
          {meta ? (
            <span className="truncate text-[11px] text-[var(--cv-t3)]">{meta}</span>
          ) : null}
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <RowAction
            icon={revealOpen ? 'visibility_off' : 'visibility'}
            label={revealOpen ? t('vault.entry.hide') : t('vault.entry.reveal')}
            onClick={() => {
              const next = !revealOpen
              setRevealOpen(next)
              if (next) {
                analytics.capture('vault', 'entry-reveal-opened', { type: entry.type })
              }
            }}
          />
          <RowAction
            icon="content_copy"
            label={
              entry.type === ENTRY_TYPE_KEY
                ? t('vault.entry.copyKey')
                : t('vault.entry.copyPassword')
            }
            disabled={!plaintext}
            onClick={() => copySecret(plaintext, entry.type, t)}
          />
          {entry.urlDomain ? (
            <RowAction
              icon="open_in_new"
              label={t('vault.entry.openInBrowser')}
              onClick={() => openUrl(entry.urlDomain)}
            />
          ) : null}
          <RowAction
            icon="arrow_forward"
            label={t('vault.entry.viewDetails')}
            onClick={() =>
              navigate({
                to: '/vaults/$vaultId/entries/$entryId',
                params: { vaultId, entryId: entry.id },
              })
            }
          />
        </div>
      </div>

      {revealOpen ? (
        <RevealPanel
          isLoading={isLoadingDetail}
          error={decryptError}
          plaintext={plaintext}
          showSecret={showSecret}
          onToggleShow={() => setShowSecret((prev) => !prev)}
        />
      ) : null}
    </div>
  )
}

interface RowActionProps {
  icon: string
  label: string
  onClick: () => void
  disabled?: boolean
}

function RowAction({ icon, label, onClick, disabled }: RowActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md
        text-[var(--cv-t3)] transition-colors hover:bg-[var(--cv-btn-ghost-hover)]
        hover:text-[var(--cv-t1)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name={icon} size={17} />
    </button>
  )
}

interface RevealPanelProps {
  isLoading: boolean
  error: string | null
  plaintext: EntryPlaintext | null
  showSecret: boolean
  onToggleShow: () => void
}

function RevealPanel({
  isLoading,
  error,
  plaintext,
  showSecret,
  onToggleShow,
}: RevealPanelProps) {
  const { t } = useTranslation()

  return (
    <div className="border-t border-[var(--cv-divider)] bg-[var(--cv-empty-bg)] px-4 py-3">
      {isLoading ? (
        <div className="h-4 animate-pulse rounded bg-[var(--cv-divider)]" />
      ) : error ? (
        <p className="text-[11px] text-[#FF4F4F]">{error}</p>
      ) : plaintext ? (
        <div className="flex flex-col gap-2 text-[11px]">
          {plaintext.type === ENTRY_TYPE_CREDENTIAL && plaintext.url ? (
            <RevealRow
              icon="link"
              value={plaintext.url}
              actions={
                <>
                  <CopyAction value={plaintext.url} label={t('vault.entry.copyUrl')} />
                  <OpenAction url={plaintext.url} />
                </>
              }
            />
          ) : null}

          {plaintext.type === ENTRY_TYPE_KEY ? (
            <RevealRow
              icon="vpn_key"
              value={showSecret ? plaintext.value : maskValue(plaintext.value.length)}
              monospace
              actions={
                <>
                  <ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                  <CopyAction value={plaintext.value} label={t('vault.entry.copyKey')} />
                </>
              }
            />
          ) : null}

          {plaintext.type === ENTRY_TYPE_CREDENTIAL ? (
            <>
              <RevealRow
                icon="person"
                value={plaintext.username}
                actions={
                  <CopyAction
                    value={plaintext.username}
                    label={t('vault.entry.copyUsername')}
                  />
                }
              />
              <RevealRow
                icon="lock"
                value={
                  showSecret ? plaintext.password : maskValue(plaintext.password.length)
                }
                monospace
                actions={
                  <>
                    <ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                    <CopyAction
                      value={plaintext.password}
                      label={t('vault.entry.copyPassword')}
                    />
                  </>
                }
              />
            </>
          ) : null}

          {plaintext.notes ? (
            <p className="text-[11px] text-[var(--cv-t3)]">{plaintext.notes}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function RevealRow({
  icon,
  value,
  monospace,
  actions,
}: {
  icon: string
  value: string
  monospace?: boolean
  actions: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={13} className="shrink-0 text-[var(--cv-t3)]" />
      <span
        className={`min-w-0 flex-1 truncate text-[var(--cv-t1)] ${
          monospace ? 'font-mono tracking-wide' : ''
        }`}
      >
        {value}
      </span>
      <span className="flex shrink-0 items-center gap-1">{actions}</span>
    </div>
  )
}

function CopyAction({ value, label }: { value: string; label: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => copyText(value, label, t)}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded
        text-[var(--cv-t3)] hover:bg-[var(--cv-btn-ghost-hover)]
        hover:text-[var(--cv-t1)]"
    >
      <Icon name="content_copy" size={13} />
    </button>
  )
}

function ToggleVisibilityAction({
  shown,
  onToggle,
}: {
  shown: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const label = shown ? t('vault.entry.hide') : t('vault.entry.reveal')
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded
        text-[var(--cv-t3)] hover:bg-[var(--cv-btn-ghost-hover)]
        hover:text-[var(--cv-t1)]"
    >
      <Icon name={shown ? 'visibility_off' : 'visibility'} size={13} />
    </button>
  )
}

function OpenAction({ url }: { url: string }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => openUrl(url)}
      title={t('vault.entry.openInBrowser')}
      aria-label={t('vault.entry.openInBrowser')}
      className="inline-flex h-6 w-6 items-center justify-center rounded
        text-[var(--cv-t3)] hover:bg-[var(--cv-btn-ghost-hover)]
        hover:text-[var(--cv-t1)]"
    >
      <Icon name="open_in_new" size={13} />
    </button>
  )
}

function maskValue(length: number): string {
  // Cap the bullet count so very long keys don't break the row layout.
  const target = Math.min(Math.max(length, 8), 18)
  return '•'.repeat(target)
}

function formatLastAccessed(
  entry: EntryListItem,
  t: ReturnType<typeof useTranslation>['t'],
): string | null {
  if (!entry.lastAccessedAt) return null
  const ts = Date.parse(entry.lastAccessedAt)
  if (Number.isNaN(ts)) return null
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) {
    return t('vault.entry.metaAccessed', { time: t('vault.relativeJustNow') })
  }
  if (minutes < 60) {
    return t('vault.entry.metaAccessed', {
      time: t('vault.relativeMinutesAgo', { count: minutes }),
    })
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return t('vault.entry.metaAccessed', {
      time: t('vault.relativeHoursAgo', { count: hours }),
    })
  }
  const days = Math.floor(hours / 24)
  return t('vault.entry.metaAccessed', {
    time: t('vault.relativeDaysAgo', { count: days }),
  })
}

function copySecret(
  plaintext: EntryPlaintext | null,
  type: EntryListItem['type'],
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (!plaintext) return
  const value =
    plaintext.type === ENTRY_TYPE_KEY ? plaintext.value : plaintext.password
  const label =
    type === ENTRY_TYPE_KEY
      ? t('vault.entry.copyKey')
      : t('vault.entry.copyPassword')
  copyText(value, label, t)
}

function copyText(
  value: string,
  label: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(t('vault.entries.copied', { label })))
    .catch(() => toast.error(t('vault.entries.copyFailed')))
}

function openUrl(rawUrl: string | undefined) {
  if (!rawUrl) return
  const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  window.open(target, '_blank', 'noopener,noreferrer')
}
