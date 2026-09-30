import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import i18n from '../../../shared/lib/i18n'
import { AUDIT_ACTOR_TYPES, AUDIT_EVENT_TYPES, type AuditLogItem } from '../api/audit-api'
import { auditEventConfig, AUDIT_EVENT_CATEGORIES, ENTRY_RELEVANT_EVENT_TYPES } from './audit-event-config'
import { AuditLogEntry } from './audit-log-entry'
import { AuditLogLegend } from './audit-log-legend'

const events = [
  ['created', 'info'], ['delivered', 'success'], ['confirmed', 'success'],
  ['protection-changed', 'info'], ['expired', 'neutral'], ['revoked', 'primary'],
  ['ended', 'neutral'], ['source-access-removed', 'primary'],
] as const
beforeEach(async () => { await i18n.changeLanguage('en') })
afterEach(cleanup)

it.each(['en', 'pl'])('renders every sharing legend description in %s', async (language) => {
  await i18n.changeLanguage(language)
  const categories = AUDIT_EVENT_CATEGORIES.filter((category) => category.labelKey === 'audit.legend.category.entrySharing')
  const { container } = render(<AuditLogLegend categories={categories} />)
  expect(categories[0].types).toHaveLength(8)
  for (const type of categories[0].types) {
    const key = auditEventConfig(type).labelKey
    expect(screen.getByText(i18n.t(key))).toBeInTheDocument()
    const descriptionKey = key.replace('audit.event.', 'audit.legend.desc.')
    expect(i18n.exists(descriptionKey)).toBe(true)
    expect(screen.getByText(i18n.t(descriptionKey))).toBeInTheDocument()
  }
  expect(container.textContent).not.toContain('audit.')
  if (language === 'en') {
    expect(container.textContent).toContain('entire supported Entry')
    expect(container.textContent).not.toContain('selected Entry fields')
    expect(container.textContent).not.toContain('recipient ended')
  } else {
    expect(container.textContent).toContain('całego obsługiwanego wpisu')
    expect(container.textContent).not.toContain('wybranych pól wpisu')
    expect(container.textContent).not.toContain('Odbiorca zakończył')
  }
})

it.each(events)('presents entry-share.%s in the common taxonomy, legend and Entry filters', (kind, tone) => {
  const type = `entry-share.${kind}`
  expect(AUDIT_EVENT_TYPES).toContain(type)
  expect(ENTRY_RELEVANT_EVENT_TYPES).toContain(type)
  expect(AUDIT_EVENT_CATEGORIES.flatMap((category) => category.types).filter((event) => event === type)).toHaveLength(1)
  expect(auditEventConfig(type).color).toBe(`var(--cv-${tone})`)
  for (const lng of ['en', 'pl']) expect(i18n.exists(auditEventConfig(type).labelKey, { lng })).toBe(true)
})

it.each(['delivered', 'confirmed', 'ended'])('labels the external recipient of %s without impersonating the sender', (kind) => {
  const item: AuditLogItem = { id: 'log', eventType: `entry-share.${kind}`, actorType: 'externalRecipient',
    userId: 'sender-should-not-resolve', entryId: 'entry', metadata: {}, createdAt: '2026-09-20T12:00:00Z' }
  render(<AuditLogEntry item={item} actorName="Sender name" agentName="Agent name" entryName="Shared credential" />)
  expect(AUDIT_ACTOR_TYPES).toContain('externalRecipient')
  expect(screen.getByText('External recipient')).toBeInTheDocument()
  expect(screen.queryByText('Sender name')).not.toBeInTheDocument()
  expect(screen.queryByText('Agent name')).not.toBeInTheDocument()
  expect(screen.queryByText('sender-should-not-resolve')).not.toBeInTheDocument()
  expect(screen.getAllByText('Shared credential').length).toBeGreaterThan(0)
})
