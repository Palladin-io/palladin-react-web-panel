import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { fromMemberSecret } from '../../../shared/crypto/entry-draft'
import { Icon } from '../../../shared/components/icon'
import { Button } from '../../../shared/components/button'
import { useAuthStore } from '../../auth'
import { analytics } from '../../../shared/lib/analytics'
import { copySecretToClipboard, copyToClipboard } from '../../../shared/lib/clipboard'
import { HOVERABLE_CARD_CLASSES } from '../../../shared/lib/styles'
import {
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type EntryListItem,
  type EntryPlaintext,
} from '../types'
import { readCustomFields } from '../entry-blob'
import {
  isCurrentMemberEntryStructuralHeadMismatchError,
  openCurrentMemberEntrySecret,
} from '../sync/current-member-entry-reader'
import { EntryIcon } from './entry-icon'
import { CustomFieldsView } from './custom-fields-view'
import { OtpauthTotp } from './totp-display'
import { EntryShareAction } from '../sharing/entry-share-action'
import { organizationIdFromAccessToken } from '../../../shared/lib/organization-scope'

export interface EntryRowProps {
  vaultId: string
  entry: EntryListItem & { currentRevision: string; currentKeyVersion: number }
  /** Highlight this row as the currently viewed entry (split-view left panel). */
  isSelected?: boolean
}

/**
 * Single entry row + lazy reveal panel.
 *
 * Reveal and copy open only this row's complete current item from the
 * authenticated IndexedDB generation. No per-Entry API request is allowed.
 */
export function EntryRow({ vaultId, entry, isSelected }: EntryRowProps) {
  const { t } = useTranslation()

  const [revealOpen, setRevealOpen] = useState(false)
  const [plaintext, setPlaintext] = useState<EntryPlaintext | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [decryptError, setDecryptError] = useState<string | null>(null)
  const [decrypting, setDecrypting] = useState(false)
  const cryptoSessionGeneration = useAuthStore((state) => state.cryptoSessionGeneration)
  const organizationId = useAuthStore((state) => organizationIdFromAccessToken(state.accessToken))
  const decryptPromise = useRef<Promise<EntryPlaintext> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const decrypt = (): Promise<EntryPlaintext> => {
    if (plaintext) return Promise.resolve(plaintext)
    if (decryptPromise.current) return decryptPromise.current
    const auth = useAuthStore.getState()
    if (!auth.userId || !auth.privateKey) {
      setDecryptError(t('vault.entries.decryptVaultLocked'))
      return Promise.reject(new Error('Vault is locked'))
    }
    const userId = auth.userId
    const privateKey = auth.privateKey
    const sessionGeneration = auth.cryptoSessionGeneration
    const sessionChanged = () => {
      const current = useAuthStore.getState()
      return current.privateKey !== privateKey
        || current.cryptoSessionGeneration !== sessionGeneration
        || !mounted.current
    }
    setDecryptError(null)
    setDecrypting(true)
    const operation = openCurrentMemberEntrySecret({
      userId,
      vaultId,
      entryId: entry.id,
      expectedRevision: entry.currentRevision,
      expectedKeyVersion: entry.currentKeyVersion,
      memberPrivateKey: privateKey,
    }).then((secret) => {
      if (sessionChanged()) {
        throw new Error('Vault lock session changed')
      }
      const result = fromMemberSecret(secret).content
      setPlaintext(result)
      return result
    }).catch((error: unknown) => {
      const structuralHeadChanged = isCurrentMemberEntryStructuralHeadMismatchError(error)
      if (mounted.current) {
        setDecryptError(t(structuralHeadChanged
          ? 'vault.entries.decryptChanged'
          : 'vault.entries.decryptFailed'))
      }
      throw error
    }).finally(() => {
      decryptPromise.current = null
      if (mounted.current) setDecrypting(false)
    })
    decryptPromise.current = operation
    return operation
  }

  // Collapsing the panel only hides the plaintext — it stays decrypted so a
  // subsequent copy (or re-open) doesn't round-trip again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!revealOpen) setShowSecret(false)
  }, [revealOpen])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaintext(null)
    setDecryptError(null)
    setRevealOpen(false)
  }, [cryptoSessionGeneration])

  const meta = [entry.username, entry.urlDomain].filter(Boolean).join(' · ') || formatLastAccessed(entry, t)
  const isLoadingDetail = revealOpen && decrypting

  return (
    <div className={`flex flex-col ${HOVERABLE_CARD_CLASSES}${isSelected ? ' !border-[var(--cv-t1)] bg-[var(--cv-btn-subtle-bg)]' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* The title/icon area navigates — use a real <Link> so it is
            focusable and keyboard-operable. The action buttons live in a
            sibling container, never nested inside the link. */}
        <Link
          to="/vaults/$vaultId/entries/$entryId"
          params={{ vaultId, entryId: entry.id }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-[var(--cv-t1)] focus-visible:ring-offset-2
            focus-visible:ring-offset-[var(--cv-card-bg)]"
        >
          <EntryIcon icon={entry.icon} type={entry.type} color={entry.color} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-heading-sm font-semibold text-[var(--cv-t1)]">
              {entry.label}
            </span>
            {meta ? (
              <span className="truncate text-meta text-[var(--cv-t3)]">{meta}</span>
            ) : null}
          </div>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <RowAction
            icon={revealOpen ? 'visibility_off' : 'visibility'}
            label={revealOpen ? t('vault.entry.hide') : t('vault.entry.reveal')}
            onClick={() => {
              const next = !revealOpen
              setRevealOpen(next)
              if (next) {
                void decrypt().catch(() => undefined)
                analytics.capture('vault', 'entry-reveal-opened', { type: entry.type })
              }
            }}
          />
          <RowAction
            icon="content_copy"
            label={
              entry.type === ENTRY_TYPE_KEY
                ? t('vault.entry.copyKey')
                : entry.type === ENTRY_TYPE_SCRIPT
                  ? t('vault.entry.copyScript')
                  : entry.type === 3
                    ? t('vault.entry.copyCardNumber')
                  : t('vault.entry.copyPassword')
            }
            onClick={() => {
              void decrypt()
                .then((secret) => copySecret(secret, entry.type, t))
                .catch(() => toast.error(t('vault.entries.copyFailed')))
            }}
          />
          {organizationId ? <EntryShareAction iconOnly scope={{ organizationId, vaultId, entryId: entry.id,
            revision: entry.currentRevision, keyVersion: entry.currentKeyVersion }} /> : null}
          {entry.urlDomain ? (
            <RowAction
              icon="open_in_new"
              label={t('vault.entry.openInBrowser')}
              onClick={() => openUrl(entry.urlDomain)}
            />
          ) : null}
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
    <Button size="sm" variant="ghost"
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="w-action shrink-0 !px-0"
    >
      <Icon name={icon} size={16} />
    </Button>
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
    // `ph-no-capture`: the reveal panel holds decrypted secrets (password/key)
    // as well as username/URL — block PostHog from capturing any of it.
    <div className="ph-no-capture border-t border-[var(--cv-divider)] bg-[var(--cv-empty-bg)] px-4 py-3">
      {isLoading ? (
        <div className="h-4 animate-pulse rounded bg-[var(--cv-divider)]" />
      ) : error ? (
        <p className="text-meta text-[var(--cv-primary)]">{error}</p>
      ) : plaintext ? (
        <div className="flex flex-col gap-2 text-meta">
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
              copyValue={plaintext.value}
              copyLabel={t('vault.entry.copyKey')}
              secret
              actions={
                <>
                  <ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                  <CopyAction value={plaintext.value} label={t('vault.entry.copyKey')} secret />
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
                copyValue={plaintext.password}
                copyLabel={t('vault.entry.copyPassword')}
                secret
                actions={
                  <>
                    <ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                    <CopyAction
                      value={plaintext.password}
                      label={t('vault.entry.copyPassword')}
                      secret
                    />
                  </>
                }
              />
              {plaintext.totp ? (
                <div className="flex items-center gap-2">
                  <Icon name="schedule" size={13} className="shrink-0 text-[var(--cv-t3)]" />
                  <OtpauthTotp uri={plaintext.totp} compact />
                </div>
              ) : null}
            </>
          ) : null}

          {plaintext.type === ENTRY_TYPE_SCRIPT ? (
            <>
              <RevealRow
                icon="terminal"
                value={
                  showSecret
                    ? firstLine(plaintext.script)
                    : maskValue(plaintext.script.length)
                }
                monospace
                copyValue={plaintext.script}
                copyLabel={t('vault.entry.copyScript')}
                secret
                actions={
                  <>
                    <ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                    <CopyAction value={plaintext.script} label={t('vault.entry.copyScript')} secret />
                  </>
                }
              />
              <RevealRow icon="code" value={plaintext.interpreter} actions={null} />
            </>
          ) : null}
          {plaintext.type === 3 ? (
            <>
              <RevealRow icon="person" value={plaintext.cardholderName}
                actions={<CopyAction value={plaintext.cardholderName} label={t('vault.entries.card.cardholderName')} />} />
              <RevealRow icon="credit_card" value={showSecret ? plaintext.cardNumber : maskValue(plaintext.cardNumber.length)}
                monospace secret actions={<><ToggleVisibilityAction shown={showSecret} onToggle={onToggleShow} />
                  <CopyAction value={plaintext.cardNumber} label={t('vault.entries.card.cardNumber')} secret /></>} />
              <RevealRow icon="calendar_month" value={`${plaintext.expiryMonth}/${plaintext.expiryYear}`} actions={null} />
            </>
          ) : null}

          <CustomFieldsView fields={readCustomFields(plaintext)} />
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
  copyValue,
  copyLabel,
  secret,
}: {
  icon: string
  value: string
  monospace?: boolean
  actions: React.ReactNode
  /** When set, clicking the displayed value copies this secret to the clipboard. */
  copyValue?: string
  copyLabel?: string
  /** Route the click-to-copy through the auto-clearing clipboard path. */
  secret?: boolean
}) {
  const { t } = useTranslation()
  const valueClass = `min-w-0 flex-1 truncate text-[var(--cv-t1)] ${
    monospace ? 'font-mono tracking-wide' : ''
  }`
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} size={13} className="shrink-0 text-[var(--cv-t3)]" />
      {copyValue !== undefined ? (
        <button
          type="button"
          onClick={() => copyText(copyValue, copyLabel ?? t('common.copy'), t, secret)}
          title={t('vault.entry.clickToCopy')}
          aria-label={copyLabel ?? t('common.copy')}
          className={`${valueClass} cursor-pointer text-left hover:text-[var(--cv-primary)]`}
        >
          {value}
        </button>
      ) : (
        <span className={valueClass}>{value}</span>
      )}
      <span className="flex shrink-0 items-center gap-1">{actions}</span>
    </div>
  )
}

function CopyAction({
  value,
  label,
  secret,
}: {
  value: string
  label: string
  /** Route through the auto-clearing clipboard path (passwords/keys). */
  secret?: boolean
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => copyText(value, label, t, secret)}
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

/** First non-empty line of a script, so the reveal row stays single-line. */
function firstLine(script: string): string {
  const line = script.split('\n').find((l) => l.trim().length > 0) ?? script
  return line.length > 80 ? `${line.slice(0, 80)}…` : line
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
    plaintext.type === ENTRY_TYPE_KEY
      ? plaintext.value
      : plaintext.type === ENTRY_TYPE_SCRIPT
        ? plaintext.script
        : plaintext.type === 3
          ? plaintext.cardNumber
          : plaintext.password
  const label =
    type === ENTRY_TYPE_KEY
      ? t('vault.entry.copyKey')
      : type === ENTRY_TYPE_SCRIPT
        ? t('vault.entry.copyScript')
        : type === 3
          ? t('vault.entry.copyCardNumber')
        : t('vault.entry.copyPassword')
  copyText(value, label, t, true)
}

function copyText(
  value: string,
  label: string,
  t: ReturnType<typeof useTranslation>['t'],
  secret = false,
) {
  // Secrets (passwords, keys) go through the auto-clearing clipboard path so
  // they don't linger on the OS clipboard; non-secrets (username, URL) use the
  // plain copy.
  const copy = secret ? copySecretToClipboard(value) : copyToClipboard(value)
  void copy
    .then((ok) => {
      if (!ok) {
        toast.error(t('vault.entries.copyFailed'))
        return
      }
      toast.success(
        secret
          ? t('vault.entries.copiedSecret', { label })
          : t('vault.entries.copied', { label }),
      )
    })
    .catch(() => toast.error(t('vault.entries.copyFailed')))
}

function openUrl(rawUrl: string | undefined) {
  if (!rawUrl) return
  const target = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`
  window.open(target, '_blank', 'noopener,noreferrer')
}
