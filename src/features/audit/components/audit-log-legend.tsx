import { useTranslation } from 'react-i18next'
import { Icon } from '../../../shared/components/icon'
import type { AuditEventType } from '../api/audit-api'
import { auditEventConfig, ENTRY_RELEVANT_EVENT_TYPES } from './audit-event-config'

export interface AuditLogLegendProps {
  /** Event types to document — defaults to the entry-relevant set. */
  eventTypes?: AuditEventType[]
}

/**
 * Colour/icon guide for the audit log — one row per event type with its tile,
 * label and a short description. Shown inline beside the log on wide containers
 * and inside a modal on narrow ones (the parent picks the placement).
 */
export function AuditLogLegend({
  eventTypes = ENTRY_RELEVANT_EVENT_TYPES,
}: AuditLogLegendProps) {
  const { t } = useTranslation()
  return (
    <div>
      <div className="mb-1 text-[14px] font-semibold text-[var(--cv-t1)]">
        {t('audit.legend.title')}
      </div>
      <p className="mb-4 text-[11px] text-[var(--cv-t3)]">
        {t('audit.legend.subtitle')}
      </p>
      <div className="flex flex-col gap-1.5">
        {eventTypes.map((type) => {
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
                <div
                  className="mb-0.5 text-[12px] font-bold"
                  style={{ color: cfg.color }}
                >
                  {t(cfg.labelKey)}
                </div>
                <p className="text-[11px] leading-snug text-[var(--cv-t3)]">
                  {t(`audit.legend.desc.${SENTENCE_DESC[type]}`)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** event type → camelCase suffix of its description i18n key. */
const SENTENCE_DESC: Record<AuditEventType, string> = {
  'credential.accessed': 'credentialAccessed',
  'credential.access-denied': 'credentialAccessDenied',
  'grant.requested': 'grantRequested',
  'grant.created': 'grantCreated',
  'grant.approved': 'grantApproved',
  'grant.denied': 'grantDenied',
  'grant.revoked': 'grantRevoked',
  'grant.consumed': 'grantConsumed',
  'grant.expired': 'grantExpired',
  'agent.enrolled': 'agentEnrolled',
  'agent.blocked': 'agentBlocked',
  'agent.reactivated': 'agentReactivated',
  'agent.deleted': 'agentDeleted',
  'vault.created': 'vaultCreated',
  'vault.updated': 'vaultUpdated',
  'vault.deleted': 'vaultDeleted',
  'entry.created': 'entryCreated',
  'entry.updated': 'entryUpdated',
  'entry.deleted': 'entryDeleted',
}
