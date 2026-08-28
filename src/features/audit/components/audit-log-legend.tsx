import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type { AuditEventType } from '../api/audit-api'
import {
  auditEventConfig,
  type AuditEventCategory,
  ENTRY_RELEVANT_EVENT_TYPES,
} from './audit-event-config'

export interface AuditLogLegendProps {
  /** Flat list of event types to document — defaults to the entry-relevant set. */
  eventTypes?: AuditEventType[]
  /** When provided, render grouped sections with category headings instead of
   *  a flat list. Takes precedence over `eventTypes`. */
  categories?: AuditEventCategory[]
}

/**
 * Colour/icon guide for the audit log — one row per event type with its tile,
 * label and a short description. Shown inline beside the log on wide containers
 * and inside a modal on narrow ones (the parent picks the placement). Pass
 * `categories` to render the full taxonomy grouped by category (global screen).
 */
export function AuditLogLegend({
  eventTypes = ENTRY_RELEVANT_EVENT_TYPES,
  categories,
}: AuditLogLegendProps) {
  const { t } = useTranslation()
  return (
    <div>
      <p className="mb-4 text-meta text-[var(--cv-t3)]">
        {t('audit.legend.subtitle')}
      </p>
      {categories ? (
        <div className="flex flex-col gap-4">
          {categories.map((category) => (
            <div key={category.labelKey}>
              <div className="mb-1.5 text-micro font-bold uppercase tracking-wide text-[var(--cv-t3)]">
                {t(category.labelKey)}
              </div>
              <LegendRows types={category.types} />
            </div>
          ))}
        </div>
      ) : (
        <LegendRows types={eventTypes} />
      )}
    </div>
  )
}

function LegendRows({ types }: { types: AuditEventType[] }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1.5">
      {types.map((type) => {
        const cfg = auditEventConfig(type)
        return (
          <div
            key={type}
            className="flex items-start gap-3 rounded-lg border border-[var(--cv-border)]
              bg-[var(--cv-bg-subtle)] px-3 py-2.5"
          >
            <div
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
              style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              <Icon name={cfg.icon} size={15} style={{ color: cfg.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 text-ui font-bold" style={{ color: cfg.color }}>
                {t(cfg.labelKey)}
              </div>
              <p className="text-meta leading-snug text-[var(--cv-t3)]">
                {t(`audit.legend.desc.${SENTENCE_DESC[type]}`)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** event type → camelCase suffix of its description i18n key. */
const SENTENCE_DESC: Record<AuditEventType, string> = {
  'auth.login-failed': 'loginFailed',
  'credential.accessed': 'credentialAccessed',
  'credential.access-denied': 'credentialAccessDenied',
  'grant.requested': 'grantRequested',
  'grant.created': 'grantCreated',
  'grant.approved': 'grantApproved',
  'grant.denied': 'grantDenied',
  'grant.revoked': 'grantRevoked',
  'grant.consumed': 'grantConsumed',
  'grant.expired': 'grantExpired',
  'grant.superseded': 'grantSuperseded',
  'agent.enrolled': 'agentEnrolled',
  'agent.blocked': 'agentBlocked',
  'agent.reactivated': 'agentReactivated',
  'agent.deleted': 'agentDeleted',
  'vault.created': 'vaultCreated',
  'vault.updated': 'vaultUpdated',
  'vault.deleted': 'vaultDeleted',
  'vault.exported': 'vaultExported',
  'entry.created': 'entryCreated',
  'entry.updated': 'entryUpdated',
  'entry.deleted': 'entryDeleted',
  'apikey.created': 'apikeyCreated',
  'apikey.activated': 'apikeyActivated',
  'apikey.revoked': 'apikeyRevoked',
  'apikey.deleted': 'apikeyDeleted',
  'org.created': 'orgCreated',
  'org.updated': 'orgUpdated',
  'org.member-invited': 'orgMemberInvited',
  'org.invitation-resent': 'orgInvitationResent',
  'org.invitation-cancelled': 'orgInvitationCancelled',
  'org.invitation-role-changed': 'orgInvitationRoleChanged',
  'user.signed-up': 'userSignedUp',
  'account.setup-completed': 'accountSetupCompleted',
  'account.recovery-completed': 'accountRecoveryCompleted',
}
