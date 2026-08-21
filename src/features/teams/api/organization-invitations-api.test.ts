import { beforeEach, describe, expect, it, vi } from 'vitest'

const postJson = vi.hoisted(() => vi.fn())
const postFn = vi.hoisted(() => vi.fn(() => ({ json: postJson })))

vi.mock('../../../shared/api/client', () => ({
  api: {
    post: postFn,
  },
}))

import {
  acceptOrganizationInvitation,
  organizationInvitationSchema,
  resendOrganizationInvitation,
  resendOrganizationInvitationResponseSchema,
} from './organization-invitations-api'

describe('organization invitation contract', () => {
  beforeEach(() => {
    postFn.mockClear()
    postJson.mockReset()
  })

  it('parses pending invitation metadata without exposing its token', () => {
    const invitation = organizationInvitationSchema.parse({
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

  it('rejects an invitation without an initial role', () => {
    expect(() => organizationInvitationSchema.parse({
      id: 'invitation-1',
      email: 'person@example.com',
      roleId: null,
      roleName: 'User',
      invitedByName: 'Alice Morgan',
      createdAt: '2026-08-20T10:00:00Z',
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T10:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })).toThrow()
  })

  it('parses resend timing without exposing the replacement token', () => {
    const result = resendOrganizationInvitationResponseSchema.parse({
      sentAt: '2026-08-20T11:00:00Z',
      expiresAt: '2026-08-23T11:00:00Z',
      resendAvailableAt: '2026-08-20T11:01:00Z',
    })

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
      refreshToken: 'refresh-token',
      userId: 'user-1',
      isOnboarded: true,
      emailVerified: true,
    }
    postJson.mockResolvedValue(session)

    await expect(acceptOrganizationInvitation('opaque-invitation-token')).resolves.toEqual(session)
    expect(postFn).toHaveBeenCalledWith(
      'api/organization/invitations/accept',
      { json: { token: 'opaque-invitation-token' } },
    )
  })
})
