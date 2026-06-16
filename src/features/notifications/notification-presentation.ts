import type { NotificationItem } from './notifications-api'

/**
 * Client-side presentation for Notification Center cards (CVT-164).
 *
 * The backend sends a `titleKey` (i18n key) + presentational `metadata` (names
 * + ids, never secrets). This module turns a `NotificationItem` into the visual
 * pieces of a grant-style card — header avatar, name, subtitle, status pill and
 * detail rows. It is PURE DATA (no JSX/hooks) so it is trivial to unit-test and
 * the card component owns all rendering + localisation.
 *
 * Forward-compatible: an unknown `type` falls back to a generic card that just
 * carries the `titleKey` with no rows/pill.
 */

/** Status pill colour family — on-palette tokens (green/red/amber). */
export type PillTone = 'green' | 'red' | 'amber'

export interface StatusPill {
  /** i18n key for the pill label. */
  labelKey: string
  tone: PillTone
}

/**
 * A detail row value:
 * - `text`  → a plain string value (tooltip + truncate)
 * - `entry` → bold entry label with an optional "· vault" suffix
 */
export type DetailRowValue =
  | { kind: 'text'; text: string }
  | { kind: 'entry'; entry: string; vault: string | null }

/** One labelled detail row inside a card. */
export interface DetailRow {
  /** i18n key for the muted label column. */
  labelKey: string
  value: DetailRowValue
}

/** Avatar treatment for the card header. */
export type CardHeaderIcon =
  | { kind: 'agent'; agentName: string | null; agentIconKey: string | null }
  | { kind: 'glyph'; glyph: string; tone: 'red' | 'amber' | 'teal' | 'grey' }

export interface CardPresentation {
  header: CardHeaderIcon
  /** Bold name (or fallback) shown as the card's primary name. */
  name: string
  /** i18n key for the small subtitle under the name. */
  subtitleKey: string
  /** Optional status pill (History items). */
  pill: StatusPill | null
  rows: DetailRow[]
}

const FALLBACK = '—'

function meta(item: NotificationItem, key: string): string | undefined {
  return item.metadata?.[key] || undefined
}

function textRow(labelKey: string, text: string): DetailRow {
  return { labelKey, value: { kind: 'text', text } }
}

/** Entry row: bold entry label + optional vault suffix. */
function entryRow(item: NotificationItem): DetailRow {
  const entry = meta(item, 'entryLabel') ?? FALLBACK
  const vault = meta(item, 'vaultName') ?? null
  return { labelKey: 'notifications.card.rowEntry', value: { kind: 'entry', entry, vault } }
}

/**
 * Build the visual card presentation for a notification. Pure — no hooks/JSX —
 * so it is trivial to unit-test against fixed metadata.
 */
export function notificationCardPresentation(
  item: NotificationItem,
): CardPresentation {
  const agentName = meta(item, 'agentName') ?? null
  const agentIconKey = meta(item, 'agentIconKey') ?? null
  const reason = meta(item, 'reason')
  const actor = meta(item, 'actorName')

  switch (item.type) {
    case 'grant_pending':
      return {
        header: { kind: 'agent', agentName, agentIconKey },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.grantPending.subtitle',
        pill: null,
        rows: [
          entryRow(item),
          ...(meta(item, 'methods')
            ? [textRow('notifications.card.rowMethods', meta(item, 'methods')!)]
            : []),
          ...(reason ? [textRow('notifications.card.rowReason', reason)] : []),
        ],
      }

    case 'agent_pending':
      return {
        header: { kind: 'glyph', glyph: 'smart_toy', tone: 'teal' },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.agentPending.subtitle',
        pill: null,
        rows: [
          ...(meta(item, 'host')
            ? [textRow('notifications.card.rowHost', meta(item, 'host')!)]
            : []),
          ...(meta(item, 'keyHint')
            ? [textRow('notifications.card.rowKey', meta(item, 'keyHint')!)]
            : []),
        ],
      }

    case 'credential_stale':
      return {
        header: { kind: 'glyph', glyph: 'error', tone: 'red' },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.credentialStale.subtitle',
        pill: null,
        rows: [
          entryRow(item),
          ...(meta(item, 'errorHint')
            ? [textRow('notifications.card.rowError', meta(item, 'errorHint')!)]
            : []),
          ...(meta(item, 'attempts')
            ? [textRow('notifications.card.rowAttempts', meta(item, 'attempts')!)]
            : []),
        ],
      }

    case 'grant_approved':
      return {
        header: { kind: 'agent', agentName, agentIconKey },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.grantApproved.subtitle',
        pill: { labelKey: 'notifications.card.pill.active', tone: 'green' },
        rows: [
          entryRow(item),
          ...(actor ? [textRow('notifications.card.rowBy', actor)] : []),
        ],
      }

    case 'grant_revoked':
      return {
        header: { kind: 'agent', agentName, agentIconKey },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.grantRevoked.subtitle',
        pill: { labelKey: 'notifications.card.pill.revoked', tone: 'red' },
        rows: [
          entryRow(item),
          ...(reason ? [textRow('notifications.card.rowReason', reason)] : []),
          ...(actor ? [textRow('notifications.card.rowBy', actor)] : []),
        ],
      }

    case 'grant_denied':
      return {
        header: { kind: 'agent', agentName, agentIconKey },
        name: agentName ?? FALLBACK,
        subtitleKey: 'notifications.card.grantDenied.subtitle',
        pill: { labelKey: 'notifications.card.pill.denied', tone: 'amber' },
        rows: [
          entryRow(item),
          ...(reason ? [textRow('notifications.card.rowReason', reason)] : []),
          ...(actor ? [textRow('notifications.card.rowBy', actor)] : []),
        ],
      }

    default:
      // Unknown future type — render the server titleKey, no rows/pill.
      return {
        header: { kind: 'glyph', glyph: 'notifications', tone: 'grey' },
        name: agentName ?? FALLBACK,
        subtitleKey: item.titleKey,
        pill: null,
        rows: [],
      }
  }
}
