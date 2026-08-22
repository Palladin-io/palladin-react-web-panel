import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthResponse } from '../../shared/api/types'
import {
  authenticatedSessionMatches,
  captureAuthenticatedSession,
  StaleAuthenticatedSessionError,
} from '../auth/session/session-boundary'
import { useAuthStore } from '../auth/stores/auth-store'
import { uploadAgentIcon } from './upload-agent-icon'

const mocks = vi.hoisted(() => ({
  presign: vi.fn(),
  complete: vi.fn(),
  fetch: vi.fn(),
}))

vi.mock('./api/agents-api', () => ({
  presignAgentIcon: mocks.presign,
  completeAgentIconUpload: mocks.complete,
}))

function jwt(userId: string, organizationId: string): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('=', '')
  return `${encode({ alg: 'none' })}.${encode({ sub: userId, org_id: organizationId })}.signature`
}

function session(userId: string, organizationId: string): AuthResponse {
  return {
    accessToken: jwt(userId, organizationId),
    refreshToken: `refresh-${userId}-${organizationId}`,
    userId,
    isOnboarded: true,
    emailVerified: true,
  }
}

describe('uploadAgentIcon session ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-a', 'org-a'))
    mocks.presign.mockResolvedValue({
      uploadUrl: 'https://uploads.example/icon',
      uploadSessionId: 'upload-session-a',
      maximumBytes: 1024 * 1024,
    })
    mocks.complete.mockResolvedValue({
      assetId: 'asset-a',
      publicUrl: 'https://assets.example/icon',
      revision: 1,
    })
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', mocks.fetch)
  })

  it('binds both authenticated requests to the initiating session', async () => {
    const sessionA = captureAuthenticatedSession()
    const assertCurrent = () => {
      if (!authenticatedSessionMatches(sessionA)) throw new StaleAuthenticatedSessionError()
    }

    await expect(uploadAgentIcon(
      'agent-a',
      new File(['png'], 'icon.png', { type: 'image/png' }),
      sessionA,
      assertCurrent,
    )).resolves.toMatchObject({ ok: true, iconReference: 'public-asset:asset-a' })

    expect(mocks.presign).toHaveBeenCalledWith(
      'agent-a',
      expect.objectContaining({ mediaType: 'image/png' }),
      sessionA,
    )
    expect(mocks.complete).toHaveBeenCalledWith(
      'agent-a',
      'upload-session-a',
      sessionA,
    )
  })

  it('sends no authenticated request after a digest paused under A resumes in B', async () => {
    let completeDigest!: (value: ArrayBuffer) => void
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(
      () => new Promise<ArrayBuffer>((resolve) => {
        completeDigest = resolve
      }),
    )
    const sessionA = captureAuthenticatedSession()
    const assertCurrent = () => {
      if (!authenticatedSessionMatches(sessionA)) throw new StaleAuthenticatedSessionError()
    }
    const upload = uploadAgentIcon(
      'agent-a',
      new File(['png'], 'icon.png', { type: 'image/png' }),
      sessionA,
      assertCurrent,
    )
    await vi.waitFor(() => expect(digest).toHaveBeenCalledOnce())

    useAuthStore.getState().logout()
    useAuthStore.getState().setTokens(session('user-b', 'org-b'))
    completeDigest(new ArrayBuffer(32))

    await expect(upload).resolves.toEqual({ ok: false, reason: 'failed' })
    expect(mocks.presign).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
    expect(useAuthStore.getState().userId).toBe('user-b')
  })
})
