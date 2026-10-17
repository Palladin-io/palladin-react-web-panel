import { Trans } from 'react-i18next'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { Icon } from '../../shared/components/icon'
import i18n from '../../shared/lib/i18n'
import type { NotificationPayload } from './notification-types'

/**
 * Renders a notification as a Sonner toast. The Toaster is mounted once in
 * `Providers` (top-right); this helper picks the variant per type and localises
 * the copy on the client from names resolved out of unlocked local state,
 * rendering agent / entry / vault / actor in bold (no quotes).
 *
 * For every known type the title comes from i18n (not the server `title`) and
 * the description is a `<Trans>` with bold names. When required names are
 * missing (for example, a thin FCM payload), we use generic local copy.
 * Sonner escapes string content, so there's no XSS surface.
 *
 * Variants: approved=success, denied/revoked=error, pending/agent_pending=info.
 */
export function showNotificationToast(
  payload: NotificationPayload,
  /** Invoked from the toast's "Open" action — wired to navigate to the inbox. */
  onOpen?: () => void,
  /** Override the auto-dismiss time (ms). `Infinity` keeps it open — used by the
   *  dev toast showcase so every variant can be styled side by side. */
  durationMs?: number,
) {
  const { type } = payload

  // agent_resolved is an invisible collapse marker; agent_approved and
  // agent_deactivated are informational and the actor already sees an action
  // toast. None pop their own toast (the inbox + badge still update). Also
  // avoids an empty toast — none had a case, so they fell through to the empty
  // wire copy.
  if (type === 'agent_resolved' || type === 'agent_approved' || type === 'agent_deactivated'
    || type === 'entry_share_received') return

  // The "Open" action is a small icon button in the toast's top-right corner
  // (rendered as real toast content). Styling in index.css (`cv-toast-*`).
  const openBtn = onOpen ? (
    <button
      type="button"
      className="cv-toast-open"
      onClick={onOpen}
      aria-label={i18n.t('notifications.toast.open')}
    >
      <Icon name="open_in_new" size={15} />
    </button>
  ) : null
  const opts = (description: ReactNode) => ({
    description: (
      <span className="cv-toast-wrap">
        {openBtn}
        {withDivider(description)}
      </span>
    ),
    ...(durationMs !== undefined ? { duration: durationMs } : {}),
  })

  switch (type) {
    case 'grant_approved':
      toast.success(i18n.t('notifications.grantApproved.title'), opts(grantDecisionBody(payload, 'grantApproved')))
      break
    case 'grant_denied':
      toast.error(i18n.t('notifications.grantDenied.title'), opts(grantDeniedBody(payload)))
      break
    case 'grant_revoked':
      toast.error(i18n.t('notifications.grantRevoked.title'), opts(grantDecisionBody(payload, 'grantRevoked')))
      break
    case 'grant_pending':
      toast.info(i18n.t('notifications.grantPending.title'), opts(grantPendingBody(payload)))
      break
    case 'agent_pending':
      toast.info(i18n.t('notifications.agentPending.title'), opts(agentPendingBody(payload)))
      break
    case 'credential_accessed':
      toast.info(i18n.t('notifications.credentialAccessed.title'), opts(credentialAccessedBody(payload)))
      break
    case 'credential_stale':
      toast.warning(i18n.t('notifications.credentialStale.title'), opts(credentialStaleBody(payload)))
      break
    default:
      toast.info(
        i18n.t('notifications.type.generic'),
        opts(i18n.t('notifications.toast.genericBody')),
      )
      break
  }
}

/**
 * Wraps the toast body so a thin rule separates it from the title. Returns
 * `undefined` when there's no body (no empty divider row).
 */
function withDivider(content: ReactNode): ReactNode {
  if (!content) return undefined
  // No rule — just spacing below the title (styled in index.css). The accent
  // is carried by the left border + coloured icon, not a divider line.
  return <span className="cv-toast-body block">{content}</span>
}

/** Shared bold-name renderer for a Trans body. */
function transBody(
  i18nKey: string,
  values: Record<string, string>,
): ReactNode {
  return (
    <Trans
      i18nKey={i18nKey}
      values={values}
      components={{ b: <strong className="font-semibold" /> }}
    />
  )
}

/** grant_pending — "{agent} requested access to {entry} in {vault}". */
function grantPendingBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  if (!agent || !entry || !vault) return i18n.t('notifications.toast.genericBody')
  return transBody('notifications.grantPending.body', { agent, entry, vault })
}

/**
 * grant_approved / grant_revoked — both have a FULL variant (no entry, whole
 * vault) and a GRANULAR variant (specific entry). FULL is detected by
 * `grantType === 'full'` or a missing `entryLabel`.
 */
function grantDecisionBody(
  payload: NotificationPayload,
  keyBase: 'grantApproved' | 'grantRevoked',
): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  const isFull = payload.data['grantType'] === 'full' || !entry

  if (!agent || !vault) return i18n.t('notifications.toast.genericBody')
  if (isFull) {
    return transBody(`notifications.${keyBase}.bodyFull`, { agent, vault })
  }
  return transBody(`notifications.${keyBase}.body`, { agent, entry: entry!, vault })
}

/** grant_denied — always references a specific entry (granular request). */
function grantDeniedBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  if (!agent || !entry || !vault) return i18n.t('notifications.toast.genericBody')
  return transBody('notifications.grantDenied.body', { agent, entry, vault })
}

/** agent_pending — "{agent} is awaiting approval". */
function agentPendingBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  if (!agent) return i18n.t('notifications.toast.genericBody')
  return transBody('notifications.agentPending.body', { agent })
}

/**
 * credential_accessed — "{agent} accessed {entry} in {vault}" with bold names,
 * falling back to generic local copy when names are absent.
 */
function credentialAccessedBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  if (!agent || !entry) return i18n.t('notifications.toast.genericBody')
  return transBody(
    vault
      ? 'notifications.credentialAccessed.body'
      : 'notifications.credentialAccessed.bodyNoVault',
    { agent, entry, vault: vault ?? '' },
  )
}

/**
 * credential_stale — "{agent} reported {entry} in {vault} isn't working" with
 * bold names, falling back to generic local copy when names are absent.
 */
function credentialStaleBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  if (!agent || !entry) return i18n.t('notifications.toast.genericBody')
  return transBody(
    vault
      ? 'notifications.credentialStale.body'
      : 'notifications.credentialStale.bodyNoVault',
    { agent, entry, vault: vault ?? '' },
  )
}
