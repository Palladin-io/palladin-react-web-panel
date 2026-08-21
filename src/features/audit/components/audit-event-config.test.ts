import { describe, expect, it } from 'vitest'
import { AUDIT_EVENT_TYPES } from '../api/audit-api'
import {
  AUDIT_EVENT_CATEGORIES,
  auditEventConfig,
} from './audit-event-config'

describe('audit-event-config', () => {
  it('maps every known event type to a non-fallback config', () => {
    for (const type of AUDIT_EVENT_TYPES) {
      const cfg = auditEventConfig(type)
      expect(cfg.icon, type).not.toBe('help')
      expect(cfg.labelKey, type).toMatch(/^audit\.event\./)
    }
  })

  it('drives every colour from a CSS token (no hardcoded hex)', () => {
    for (const type of AUDIT_EVENT_TYPES) {
      const cfg = auditEventConfig(type)
      expect(cfg.color, type).toMatch(/^var\(--cv-/)
      expect(cfg.bg, type).toMatch(/^rgb\(var\(--cv-/)
      expect(cfg.border, type).toMatch(/^rgb\(var\(--cv-/)
    }
  })

  it('uses the systemic semantic tones (success, danger, info, neutral, pending)', () => {
    // Success — access granted / positive completion (incl. reactivation).
    expect(auditEventConfig('credential.accessed').color).toBe('var(--cv-success)')
    expect(auditEventConfig('grant.approved').color).toBe('var(--cv-success)')
    expect(auditEventConfig('account.setup-completed').color).toBe('var(--cv-success)')
    expect(auditEventConfig('agent.reactivated').color).toBe('var(--cv-success)')
    // Danger — denial / destruction.
    expect(auditEventConfig('credential.access-denied').color).toBe('var(--cv-primary)')
    expect(auditEventConfig('grant.revoked').color).toBe('var(--cv-primary)')
    expect(auditEventConfig('agent.deleted').color).toBe('var(--cv-primary)')
    expect(auditEventConfig('org.invitation-cancelled').color).toBe('var(--cv-primary)')
    // Info — neutral lifecycle (incl. agent enrolment, now blue not peach).
    expect(auditEventConfig('vault.created').color).toBe('var(--cv-info)')
    expect(auditEventConfig('apikey.created').color).toBe('var(--cv-info)')
    expect(auditEventConfig('agent.enrolled').color).toBe('var(--cv-info)')
    expect(auditEventConfig('org.member-invited').color).toBe('var(--cv-info)')
    expect(auditEventConfig('org.invitation-resent').color).toBe('var(--cv-info)')
    expect(auditEventConfig('org.invitation-role-changed').color).toBe('var(--cv-info)')
    // Neutral — passive / terminal.
    expect(auditEventConfig('grant.expired').color).toBe('var(--cv-neutral)')
    // Pending — awaiting human action; the only pending event (peach).
    expect(auditEventConfig('grant.requested').color).toBe('var(--cv-pending)')
  })

  it('falls back to a neutral config for an unknown event type', () => {
    const cfg = auditEventConfig('something.new')
    expect(cfg.icon).toBe('help')
    expect(cfg.labelKey).toBe('audit.event.unknown')
    expect(cfg.color).toBe('var(--cv-neutral)')
  })

  it('covers every event type in exactly one legend category', () => {
    const categorised = AUDIT_EVENT_CATEGORIES.flatMap((c) => c.types)
    // No duplicates across categories.
    expect(new Set(categorised).size).toBe(categorised.length)
    // Exact 1:1 coverage of the taxonomy.
    expect([...categorised].sort()).toEqual([...AUDIT_EVENT_TYPES].sort())
  })
})
