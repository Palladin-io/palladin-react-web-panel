import { shortenKey } from '../../shared/lib/shorten-key'
import type { NotificationItem } from './notifications-api'

/**
 * Client-side presentation for Notification Center cards (CVT-164).
 *
 * The backend sends a `titleKey` (i18n key) + presentational `metadata` (names
 * + ids, never secrets). This module turns a `NotificationItem` into the visual
 * pieces of a card — header avatar, name, subtitle and detail rows. It is PURE
 * DATA (no JSX/hooks) so it is trivial to unit-test and the card component owns
 * all rendering + localisation.
 *
 * A notification card is an IMMUTABLE LOG of an event, not a live control panel:
 * the title + card colour carry the meaning of the event, so there is no live
 * status pill that would claim to reflect the resource's CURRENT state.
 *
 * Forward-compatible: an unknown `type` falls back to a generic card that just
 * carries the `titleKey` with no rows.
 */

/**
 * A detail row value:
 * - `text`   → a plain string value (tooltip + truncate); `'—'` when absent
 * - `entry`  → bold entry label with an optional "· vault" suffix
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
  | {
      kind: 'agent'
      agentName: string | null
      agentId: string | null
      agentIconKey: string | null
    }
  | { kind: 'glyph'; glyph: string; tone: 'red' | 'amber' | 'teal' | 'grey' }

export interface CardPresentation {
  header: CardHeaderIcon
  /**
   * Bold card title = the localized **type name** (e.g. "New agent", "Access
   * request"). i18n key, resolved by the card. Matches mobile's
   * `notificationTitle` (title=type, agent/context moves to the subtitle).
   */
  titleKey: string
  /**
   * Subtitle under the title — carries the agent name + context. i18n key with
   * an `{ agent }` placeholder; the card resolves `t(subtitleKey, { agent })`.
   */
  subtitleKey: string
  /** Agent name for the subtitle, or `null` to use {@link subtitleAgentFallbackKey}. */
  subtitleAgent: string | null
  /**
   * i18n key the card uses for the agent placeholder when `subtitleAgent` is
   * null — `grants.unknownAgent` for agent-centric cards, the softer
   * `notifications.agentSoftFallback` for grant/credential cards.
   */
  subtitleAgentFallbackKey: string
  rows: DetailRow[]
}

const FALLBACK = '—'

function meta(item: NotificationItem, key: string): string | undefined {
  return item.metadata?.[key] || undefined
}

/**
 * Labelled text row that ALWAYS renders — missing values show the em-dash
 * placeholder (mirrors org-grants `reason ?? '—'`) so every card keeps a stable
 * three-row body instead of collapsing.
 */
function textRow(labelKey: string, text: string | undefined): DetailRow {
  return { labelKey, value: { kind: 'text', text: text ?? FALLBACK } }
}

/** Convenience: a text row sourced directly from a metadata key (with `—`). */
function metaRow(item: NotificationItem, labelKey: string, key: string): DetailRow {
  return textRow(labelKey, meta(item, key))
}

/** Entry row: bold entry label + optional vault suffix. */
function entryRow(item: NotificationItem): DetailRow {
  const entry = meta(item, 'entryLabel') ?? FALLBACK
  const vault = meta(item, 'vaultName') ?? null
  return { labelKey: 'notifications.card.rowEntry', value: { kind: 'entry', entry, vault } }
}

/**
 * Combined "host · ip" value for the agent card — keeps the agent rows at three
 * max. The host is shortened (prefix+suffix) so a long FQDN doesn't push the IP
 * off the row. Returns just one side when only one is present, or `undefined`
 * when neither is (the row then shows the em-dash placeholder).
 */
function agentHostIp(item: NotificationItem): string | undefined {
  const host = meta(item, 'host')
  const ip = meta(item, 'ip')
  const shortHost = host ? shortenKey(host, 12, 8) : undefined
  if (shortHost && ip) return `${shortHost} · ${ip}`
  return shortHost ?? ip ?? undefined
}

/**
 * Agent identity block: Public key · Type · Agent Id · Host · Ip. Missing
 * values show the em-dash placeholder so the grid stays uniform.
 */
function agentPublicKeyShort(item: NotificationItem): string | undefined {
  const pk = meta(item, 'agentPublicKey')
  return pk ? shortenKey(pk, 8, 6) : undefined
}

function agentRows(item: NotificationItem): DetailRow[] {
  return [
    textRow('notifications.card.rowPublicKey', agentPublicKeyShort(item)),
    metaRow(item, 'notifications.card.rowAgentId', 'agentId'),
    metaRow(item, 'notifications.card.rowType', 'agentType'),
    textRow('notifications.card.rowHostIp', agentHostIp(item)),
  ]
}

/**
 * Build the visual card presentation for a notification. Pure — no hooks/JSX —
 * so it is trivial to unit-test against fixed metadata.
 */
/** Localized type-name i18n key per type — the CARD TITLE (matches mobile). */
export function notificationTypeNameKey(type: string): string {
  switch (type) {
    case 'grant_pending':
      return 'notifications.type.grantPending'
    case 'agent_pending':
      return 'notifications.type.agentPending'
    case 'agent_approved':
      return 'notifications.type.agentApproved'
    case 'grant_revoked':
      return 'notifications.type.grantRevoked'
    case 'grant_approved':
      return 'notifications.type.grantApproved'
    case 'grant_denied':
      return 'notifications.type.grantDenied'
    case 'credential_stale':
      return 'notifications.type.credentialStale'
    default:
      return 'notifications.type.generic'
  }
}

export function notificationCardPresentation(
  item: NotificationItem,
): CardPresentation {
  const agentName = meta(item, 'agentName') ?? null
  const agentId = meta(item, 'agentId') ?? null
  const agentIconKey = meta(item, 'agentIconKey') ?? null

  // Title = the localized type name (e.g. "New agent"). Subtitle = agent +
  // context. Two agent fallback keys mirror mobile: the softer "An agent"
  // (SOFT) for grant/credential cards, "Unknown agent" (UNKNOWN) for
  // agent-centric cards (an agent registered via `search` has no name).
  const titleKey = notificationTypeNameKey(item.type)
  const SOFT = 'notifications.agentSoftFallback'
  const UNKNOWN = 'grants.unknownAgent'

  // Every card shows a FIXED 3-row set per type (missing values → em-dash) so
  // the grid stays uniform and never collapses.
  switch (item.type) {
    case 'grant_pending':
      return {
        header: { kind: 'agent', agentName, agentId, agentIconKey },
        titleKey,
        subtitleKey: 'notifications.sub.grantPending',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [
          entryRow(item),
          metaRow(item, 'notifications.card.rowMethods', 'methods'),
          metaRow(item, 'notifications.card.rowReason', 'reason'),
        ],
      }

    case 'agent_pending':
      return {
        header: { kind: 'glyph', glyph: 'smart_toy', tone: 'teal' },
        titleKey,
        subtitleKey: 'notifications.sub.agentPending',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: UNKNOWN,
        rows: agentRows(item),
      }

    case 'agent_approved':
      return {
        header: { kind: 'agent', agentName, agentId, agentIconKey },
        titleKey,
        subtitleKey: 'notifications.sub.agentApproved',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: UNKNOWN,
        // Approved record: Agent Id first, no public key, approver ("By") last.
        rows: [
          metaRow(item, 'notifications.card.rowAgentId', 'agentId'),
          metaRow(item, 'notifications.card.rowType', 'agentType'),
          textRow('notifications.card.rowHostIp', agentHostIp(item)),
          metaRow(item, 'notifications.card.rowBy', 'actorName'),
        ],
      }

    case 'credential_stale':
      return {
        header: { kind: 'glyph', glyph: 'error', tone: 'red' },
        titleKey,
        subtitleKey: 'notifications.sub.credentialStale',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [
          entryRow(item),
          metaRow(item, 'notifications.card.rowReason', 'errorHint'),
          metaRow(item, 'notifications.card.rowNote', 'note'),
          textRow('notifications.card.rowHostIp', agentHostIp(item)),
        ],
      }

    case 'grant_approved':
      return {
        header: { kind: 'agent', agentName, agentId, agentIconKey },
        titleKey,
        subtitleKey: 'notifications.sub.grantUpdate',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [
          entryRow(item),
          metaRow(item, 'notifications.card.rowMethods', 'methods'),
          metaRow(item, 'notifications.card.rowReason', 'reason'),
          metaRow(item, 'notifications.card.rowBy', 'actorName'),
        ],
      }

    // Backend no longer emits grant_revoked, but a historical row must still
    // render as an immutable log (no actions, no pill) rather than crash.
    case 'grant_revoked':
      return {
        header: { kind: 'agent', agentName, agentId, agentIconKey },
        titleKey,
        subtitleKey: 'notifications.sub.grantUpdate',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [
          entryRow(item),
          metaRow(item, 'notifications.card.rowReason', 'reason'),
          metaRow(item, 'notifications.card.rowBy', 'actorName'),
        ],
      }

    case 'grant_denied':
      return {
        header: { kind: 'agent', agentName, agentId, agentIconKey },
        titleKey,
        subtitleKey: 'notifications.sub.grantUpdate',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [
          entryRow(item),
          metaRow(item, 'notifications.card.rowMethods', 'methods'),
          metaRow(item, 'notifications.card.rowReason', 'denyReason'),
          metaRow(item, 'notifications.card.rowBy', 'actorName'),
        ],
      }

    default:
      // Unknown future type — generic title, agent name (or soft fallback).
      return {
        header: { kind: 'glyph', glyph: 'notifications', tone: 'grey' },
        titleKey: 'notifications.type.generic',
        subtitleKey: 'notifications.sub.generic',
        subtitleAgent: agentName,
        subtitleAgentFallbackKey: SOFT,
        rows: [],
      }
  }
}
