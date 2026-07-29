import { describe, expect, it } from 'vitest'
import { redactSignalRDiagnostic } from './signalr-log'

describe('redactSignalRDiagnostic', () => {
  it('redacts query tokens and JWT-shaped values', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature_123'

    expect(redactSignalRDiagnostic(
      `WebSocket connected?id=connection&access_token=${jwt}&transport=webSockets`,
    )).toBe(
      'WebSocket connected?id=connection&access_token=[REDACTED]&transport=webSockets',
    )
    expect(redactSignalRDiagnostic(`start failed for ${jwt}`))
      .toBe('start failed for [REDACTED_JWT]')
  })
})
