import { describe, expect, it } from 'vitest'
import {
  assertRequiredClientEnv,
  findMissingRequiredClientEnv,
} from './required-client-env'

const completeEnvironment = {
  VITE_API_URL: 'http://localhost:5000',
  VITE_GOOGLE_CLIENT_ID: 'local-google-client-id',
  VITE_SIGNALR_HUB_URL: 'http://localhost:5000/hubs/notifications',
}

describe('required client environment', () => {
  it('accepts a complete environment', () => {
    expect(findMissingRequiredClientEnv(completeEnvironment)).toEqual([])
    expect(() => assertRequiredClientEnv(completeEnvironment)).not.toThrow()
  })

  it('treats absent and blank values as missing', () => {
    expect(
      findMissingRequiredClientEnv({
        ...completeEnvironment,
        VITE_GOOGLE_CLIENT_ID: '   ',
        VITE_SIGNALR_HUB_URL: undefined,
      }),
    ).toEqual(['VITE_GOOGLE_CLIENT_ID', 'VITE_SIGNALR_HUB_URL'])
  })

  it('provides an actionable local setup error', () => {
    expect(() =>
      assertRequiredClientEnv({
        ...completeEnvironment,
        VITE_GOOGLE_CLIENT_ID: '',
      }),
    ).toThrowError(/VITE_GOOGLE_CLIENT_ID[\s\S]*\.env\.local[\s\S]*npm run dev/)
  })
})
