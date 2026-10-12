import { HTTPError } from 'ky'
import { useAuthStore } from '../../auth/stores/auth-store'
import { clearClientSession } from '../../auth/session/client-session'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const browserPost = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/browser-session-transport', () => ({ browserSessionPost: browserPost }))
const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ json: postJson })))

vi.mock('../../../shared/api/client', () => ({
  api: {
    post: postFn,
    get: vi.fn(() => ({ json: postJson })),
  },
}))

import {
  acceptOrganizationInvitation,
  getOrganizationInvitations,
  resendOrganizationInvitation,
} from './organization-invitations-api'

beforeEach(() => {
  browserPost.mockReset()
  useAuthStore.setState({ accessToken: 'expired-access', sessionId: 'own-session' })
  postFn.mockClear()
  postJson.mockReset()
})

describe('organization invitation contract', () => {
  it('parses pending invitation metadata without exposing its token', async () => {
    postJson.mockResolvedValue({ items: [{
      id: 'invitation-1',
      email: 'person@example.com',
      roleId: 'role-1',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    }] })
    const [invitation] = await getOrganizationInvitations()

    expect(invitation).toEqual({
      id: 'invitation-1',
      email: 'person@example.com',
      roleId: 'role-1',
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })
    expect(invitation).not.toHaveProperty('token')
  })

  it('keeps historical invitation metadata without revalidating it', async () => {
    const invitation = { id: 'legacy', email: 'legacy-email', roleId: null, roleName: null, invitedByName: null }
    postJson.mockResolvedValue({ items: [invitation] })
    expect(await getOrganizationInvitations()).toEqual([invitation])
  })

  it('parses resend timing without exposing the replacement token', async () => {
    postJson.mockResolvedValue({
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T11:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })
    const result = await resendOrganizationInvitation('invitation-1')

    expect(result.resendAvailableAt).toBe('2026-08-20T11:01:00Z')
    expect(result).not.toHaveProperty('token')
  })

  it('sends an empty JSON body when resending so ky sets the JSON content type', async () => {
    postJson.mockResolvedValue({
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T11:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })

    await resendOrganizationInvitation('invitation-1')

    expect(postFn).toHaveBeenCalledWith(
      'api/organization/invitations/invitation-1/resend',
      { json: {} },
    )
  })

  it('accepts an invitation with the opaque token and returns the joined session', async () => {
    const session = {
      accessToken: 'access-token',
      sessionId: 'refresh-token',
      userId: 'user-1',
      isOnboarded: true,
      emailVerified: true,
    }
    browserPost.mockResolvedValue(session)

    await expect(acceptOrganizationInvitation('opaque-invitation-token')).resolves.toEqual(session)
    expect(browserPost).toHaveBeenCalledWith(
      'organization/invitations/accept',
      expect.objectContaining({ json: { token: 'opaque-invitation-token' } }),
    )
  })
})

function rejected(status: number) {
  return new HTTPError(new Response('{}', { status }), new Request('https://api.example.test'), {} as never)
}

it('refreshes an expired bearer once before retrying invitation acceptance', async () => {
  const renewed = { accessToken: 'renewed-access', sessionId: 'own-session' }
  const joined = { accessToken: 'joined-access', sessionId: 'joined-session' }
  browserPost.mockRejectedValueOnce(rejected(401)).mockResolvedValueOnce(renewed).mockResolvedValueOnce(joined)
  await expect(acceptOrganizationInvitation('invitation')).resolves.toEqual(joined)
  expect(browserPost.mock.calls.map(call => call[0])).toEqual([
    'organization/invitations/accept', 'auth/refresh', 'organization/invitations/accept',
  ])
  expect(browserPost.mock.calls[1]![1]).toEqual({ json: { expectedSessionId: 'own-session' } })
  expect(browserPost.mock.calls[2]![1].headers.Authorization).toBe('Bearer renewed-access')
})

it.each([403, 409, 503])('does not retry invitation failure %s', async status => {
  browserPost.mockRejectedValueOnce(rejected(status))
  await expect(acceptOrganizationInvitation('invitation')).rejects.toThrow()
  expect(browserPost).toHaveBeenCalledOnce()
})

it('does not repeat an invitation after logout while refreshing its bearer', async () => {
  browserPost.mockRejectedValueOnce(rejected(401)).mockImplementationOnce(async () => {
    await clearClientSession()
    return { accessToken: 'late-access', sessionId: 'own-session' }
  })
  await expect(acceptOrganizationInvitation('invitation')).rejects.toThrow()
  expect(browserPost).toHaveBeenCalledTimes(2)
  expect(useAuthStore.getState().accessToken).toBeNull()
})

it('stops after one unauthorized invitation retry', async () => {
  browserPost.mockRejectedValueOnce(rejected(401))
    .mockResolvedValueOnce({ accessToken: 'renewed-access', sessionId: 'own-session' })
    .mockRejectedValueOnce(rejected(401))
  await expect(acceptOrganizationInvitation('invitation')).rejects.toThrow()
  expect(browserPost).toHaveBeenCalledTimes(3)
})
