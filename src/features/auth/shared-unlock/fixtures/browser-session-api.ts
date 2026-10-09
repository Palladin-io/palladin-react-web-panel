import native from './session-api-v1.json'

// Native provider fixtures remain byte-for-byte unchanged. The browser adapter
// replaces only the session transport; the signed operation context is shared.
export default {
  ...native,
  responses: native.responses.map(fixture => {
    if (fixture.type !== 'commit') return fixture
    const body = fixture.body as typeof fixture.body & { session: { refreshToken: string } }
    const session = Object.fromEntries(Object.entries(body.session).filter(([name]) => name !== 'refreshToken'))
    return { ...fixture, body: { ...body, session: { ...session, sessionId: '11111111-1111-4111-8111-111111111111' } } }
  }),
}
