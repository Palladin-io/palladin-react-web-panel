import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import { HTTPError } from 'ky'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deriveIdentityV1, IDENTITY_KDF_PROFILE_ID } from '../../../shared/crypto/identity-kdf'
import { decodeBase64Url, encodeBase64Url } from '../../../shared/crypto/vault-v2-bytes'
import { IncorrectCurrentPasswordError } from './use-change-master-password'
import { useTotpEnrollment } from './use-totp'

const mocks = vi.hoisted(() => ({
  getAccount: vi.fn(),
  enrollTotp: vi.fn(),
  confirmTotp: vi.fn(),
  disableTotp: vi.fn(),
}))

vi.mock('../../../shared/api/account-api', async (importActual) => ({
  ...(await importActual<typeof import('../../../shared/api/account-api')>()),
  getAccount: mocks.getAccount,
}))
vi.mock('../api/auth-api', () => ({
  enrollTotp: mocks.enrollTotp,
  confirmTotp: mocks.confirmTotp,
  disableTotp: mocks.disableTotp,
}))

const USER_ID = '00112233-4455-4677-8899-aabbccddeeff'
const KDF_SALT = encodeBase64Url(new Uint8Array(16).fill(7))
const PASSWORD = 'correct-horse-battery-staple'

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return createElement(QueryClientProvider, { client }, children)
}

async function expectedCredential() {
  const identity = await deriveIdentityV1(PASSWORD, USER_ID, decodeBase64Url(KDF_SALT, 16))
  return encodeBase64Url(identity.authCredential)
}

describe('useTotpEnrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAccount.mockResolvedValue({
      userId: USER_ID,
      kdf: {
        securityVersion: 1,
        minimumSecurityVersion: 1,
        profileId: IDENTITY_KDF_PROFILE_ID,
        kdfSalt: KDF_SALT,
        credentialRevision: 1,
        privateKeyWrapRevision: 1,
        deviceWrapperMetadata: null,
      },
    })
  })

  it('proves the current password on enroll, confirm and disable', async () => {
    mocks.enrollTotp.mockResolvedValue({ secret: 'S', otpauthUri: 'otpauth://totp/x' })
    mocks.confirmTotp.mockResolvedValue({ recoveryCodes: [] })
    mocks.disableTotp.mockResolvedValue(undefined)
    const { result } = renderHook(() => useTotpEnrollment(), { wrapper })

    await act(async () => {
      await result.current.enroll.mutateAsync(PASSWORD)
      await result.current.confirm.mutateAsync({ code: ' 123456 ', currentPassword: PASSWORD })
      await result.current.disable.mutateAsync({ code: '654321', currentPassword: PASSWORD })
    })

    const credential = await expectedCredential()
    expect(mocks.enrollTotp).toHaveBeenCalledWith(credential)
    expect(mocks.confirmTotp).toHaveBeenCalledWith('123456', credential)
    expect(mocks.disableTotp).toHaveBeenCalledWith('654321', credential)
  })

  it('maps a rejected credential to IncorrectCurrentPasswordError', async () => {
    mocks.enrollTotp.mockRejectedValue(new HTTPError(
      new Response(null, { status: 403 }),
      new Request('https://api.example.test/api/auth/totp/enroll'),
      {} as never,
    ))
    const { result } = renderHook(() => useTotpEnrollment(), { wrapper })

    let captured: unknown
    await act(async () => {
      try {
        await result.current.enroll.mutateAsync('wrong-password')
      } catch (error) {
        captured = error
      }
    })

    expect(captured).toBeInstanceOf(IncorrectCurrentPasswordError)
  })
})
