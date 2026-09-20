import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '../../shared/lib/i18n'
import { NotificationCard } from './notification-card'
import { notificationCardPresentation } from './notification-presentation'
import { notificationDeepLink, resolveNotificationItem } from './notification-resolution'
import type { NotificationItem } from './notifications-api'
import { isKnownNotificationType, sanitizeNotificationMetadata } from './notification-types'
import { showNotificationToast } from './notification-toast'

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const vaultId = '11112233-4455-4677-8899-aabbccddeeff'
const entryId = '22222233-4455-4677-8899-aabbccddeeff'
const shareId = '33332233-4455-4677-8899-aabbccddeeff'
const item: NotificationItem = { id: shareId, type: 'entry_share_received', category: 'update',
  titleKey: 'must-not-render', metadata: { vaultId, entryId, shareId }, occurredAt: '2026-09-20T12:00:00Z' }
beforeEach(async () => { vi.clearAllMocks(); await i18n.changeLanguage('en') })
afterEach(cleanup)

it('renders an informational first-display confirmation without Agent identity or read-proof claims', () => {
  const resolved = resolveNotificationItem(item, { vaults: new Map(), agents: new Map() })
  expect(isKnownNotificationType(item.type)).toBe(true)
  expect(notificationCardPresentation(resolved).header.kind).toBe('glyph')
  render(<NotificationCard item={resolved} />)
  expect(screen.getByRole('article', { name: 'Shared copy received' })).toBeInTheDocument()
  expect(screen.getByText('The recipient’s app confirmed the first display.')).toBeInTheDocument()
  expect(screen.getByText('This is not proof that a person read the contents.')).toBeInTheDocument()
  expect(screen.queryByText('must-not-render')).not.toBeInTheDocument()
  expect(screen.queryByText(/Unknown agent|An agent/)).not.toBeInTheDocument()
  expect(screen.getByText('33332233…ddeeff')).toBeInTheDocument()
})

it('opens the source Sharing tab, never a secret-bearing recipient link', () => {
  expect(notificationDeepLink(item)).toEqual({ to: '/vaults/$vaultId/entries/$entryId',
    params: { vaultId, entryId }, search: { tab: 'sharing' } })
})

it('does not accept a URL in the sharing identifier used by presentation', () => {
  expect(sanitizeNotificationMetadata({ shareId: 'https://example.test/#secret', entryId })).toEqual({ entryId })
})

it('does not create a second toast channel for an Inbox-only receipt', () => {
  showNotificationToast({ subjectId: shareId, type: item.type, category: 'update', occurredAt: item.occurredAt, data: {} })
  for (const send of Object.values(toast)) expect(send).not.toHaveBeenCalled()
})

it('localizes the receipt and its limitations in Polish', async () => {
  await i18n.changeLanguage('pl')
  render(<NotificationCard item={item} />)
  expect(screen.getByRole('article', { name: 'Odebrano udostępnioną kopię' })).toBeInTheDocument()
  expect(screen.getByText('Nie jest to dowód przeczytania treści przez człowieka.')).toBeInTheDocument()
})
