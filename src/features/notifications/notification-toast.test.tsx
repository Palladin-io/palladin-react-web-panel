import { beforeEach, describe, expect, it, vi } from 'vitest'
import { showNotificationToast } from './notification-toast'
import type { NotificationPayload } from './notification-types'

const success = vi.hoisted(() => vi.fn())
const error = vi.hoisted(() => vi.fn())
const info = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { success, error, info } }))

// i18n returns the key — lets us assert that titles come from i18n, not server.
vi.mock('../../shared/lib/i18n', () => ({ default: { t: (k: string) => k } }))
// Trans renders nothing meaningful in this unit test; stub it to its key.
vi.mock('react-i18next', () => ({
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}))

function payload(
  type: string,
  data: Record<string, string> = {},
): NotificationPayload {
  return { type, title: 'ServerTitle', body: 'ServerBody', data }
}

const FULL_DATA = { agentName: 'Bot', entryLabel: 'Gmail', vaultName: 'Prod' }

describe('showNotificationToast', () => {
  beforeEach(() => {
    success.mockReset()
    error.mockReset()
    info.mockReset()
  })

  it('uses a success toast with the i18n title for approved grants', () => {
    showNotificationToast(payload('grant_approved', FULL_DATA))
    expect(success).toHaveBeenCalledTimes(1)
    expect(success.mock.calls[0][0]).toBe('notifications.grantApproved.title')
  })

  it('uses an error toast for denied and revoked grants (i18n titles)', () => {
    showNotificationToast(payload('grant_denied', FULL_DATA))
    showNotificationToast(payload('grant_revoked', FULL_DATA))
    expect(error).toHaveBeenCalledTimes(2)
    expect(error.mock.calls[0][0]).toBe('notifications.grantDenied.title')
    expect(error.mock.calls[1][0]).toBe('notifications.grantRevoked.title')
  })

  it('uses an info toast for pending / agent_pending / credential_accessed', () => {
    showNotificationToast(payload('grant_pending', FULL_DATA))
    showNotificationToast(payload('agent_pending', { agentName: 'Bot' }))
    showNotificationToast(payload('credential_accessed', FULL_DATA))
    expect(info).toHaveBeenCalledTimes(3)
    expect(info.mock.calls[0][0]).toBe('notifications.grantPending.title')
    expect(info.mock.calls[1][0]).toBe('notifications.agentPending.title')
    expect(info.mock.calls[2][0]).toBe('notifications.credentialAccessed.title')
  })

  it('falls back to the server title/body for an unknown type', () => {
    showNotificationToast(payload('future_type'))
    expect(info.mock.calls[0][0]).toBe('ServerTitle')
    // description is wrapped in the divider span — its child is the server body.
    expect(info.mock.calls[0][1].description.props.children[1].props.children).toBe('ServerBody')
  })

  it('falls back to the server body when required names are missing', () => {
    // grant_pending with no data → description child is the plain server body.
    showNotificationToast(payload('grant_pending'))
    expect(info.mock.calls[0][1].description.props.children[1].props.children).toBe('ServerBody')
  })

  it('picks the FULL body variant when grantType is full (no entry)', () => {
    showNotificationToast(
      payload('grant_approved', { agentName: 'Bot', vaultName: 'Prod', grantType: 'full' }),
    )
    // description = divider span wrapping a <Trans> — assert the Trans i18nKey.
    expect(success.mock.calls[0][1].description.props.children[1].props.children.props.i18nKey).toBe(
      'notifications.grantApproved.bodyFull',
    )
  })

  it('picks the GRANULAR body variant when an entry is present', () => {
    showNotificationToast(payload('grant_approved', FULL_DATA))
    expect(success.mock.calls[0][1].description.props.children[1].props.children.props.i18nKey).toBe(
      'notifications.grantApproved.body',
    )
  })
})
