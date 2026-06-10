import { Trans } from 'react-i18next'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import i18n from '../../shared/lib/i18n'
import type { NotificationPayload } from './notification-types'

/**
 * Renders a notification as a Sonner toast. The Toaster is mounted once in
 * `Providers` (top-right); this helper picks the variant per type and localises
 * the copy on the client from the resolved names the backend puts in `data`,
 * rendering agent / entry / vault / actor in bold (no quotes).
 *
 * For every known type the title comes from i18n (not the server `title`) and
 * the description is a `<Trans>` with bold names. When required names are
 * missing (older payloads / FCM) we fall back to the plain server `body`.
 * Sonner escapes string content, so there's no XSS surface.
 *
 * Variants: approved=success, denied/revoked=error, pending/agent_pending=info.
 */
export function showNotificationToast(payload: NotificationPayload) {
  const { type } = payload

  switch (type) {
    case 'grant_approved':
      toast.success(i18n.t('notifications.grantApproved.title'), {
        description: withDivider(grantDecisionBody(payload, 'grantApproved')),
      })
      break
    case 'grant_denied':
      toast.error(i18n.t('notifications.grantDenied.title'), {
        description: withDivider(grantDeniedBody(payload)),
      })
      break
    case 'grant_revoked':
      toast.error(i18n.t('notifications.grantRevoked.title'), {
        description: withDivider(grantDecisionBody(payload, 'grantRevoked')),
      })
      break
    case 'grant_pending':
      toast.info(i18n.t('notifications.grantPending.title'), {
        description: withDivider(grantPendingBody(payload)),
      })
      break
    case 'agent_pending':
      toast.info(i18n.t('notifications.agentPending.title'), {
        description: withDivider(agentPendingBody(payload)),
      })
      break
    case 'credential_accessed':
      toast.info(i18n.t('notifications.credentialAccessed.title'), {
        description: withDivider(credentialAccessedBody(payload)),
      })
      break
    default:
      // Unknown type — show the server-supplied copy verbatim.
      toast.info(payload.title, { description: withDivider(payload.body) })
      break
  }
}

/**
 * Wraps the toast body so a thin rule separates it from the title. Returns
 * `undefined` when there's no body (no empty divider row).
 */
function withDivider(content: ReactNode): ReactNode {
  if (!content) return undefined
  return (
    <span className="mt-1 block border-t border-[var(--cv-divider)] pt-1.5">
      {content}
    </span>
  )
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
  if (!agent || !entry || !vault) return payload.body
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

  if (!agent || !vault) return payload.body
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
  if (!agent || !entry || !vault) return payload.body
  return transBody('notifications.grantDenied.body', { agent, entry, vault })
}

/** agent_pending — "{agent} is awaiting approval". */
function agentPendingBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  if (!agent) return payload.body
  return transBody('notifications.agentPending.body', { agent })
}

/**
 * credential_accessed — "{agent} accessed {entry} in {vault}" with bold names,
 * falling back to the plain server body when names are absent.
 */
function credentialAccessedBody(payload: NotificationPayload): ReactNode {
  const agent = payload.data['agentName']
  const entry = payload.data['entryLabel']
  const vault = payload.data['vaultName']
  if (!agent || !entry) return payload.body
  return transBody(
    vault
      ? 'notifications.credentialAccessed.body'
      : 'notifications.credentialAccessed.bodyNoVault',
    { agent, entry, vault: vault ?? '' },
  )
}
