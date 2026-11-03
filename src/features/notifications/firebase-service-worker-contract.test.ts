import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8')

function localNotificationLink(): (data: unknown) => string {
  const start = source.indexOf('const OPAQUE_ID')
  const end = source.indexOf('const params')
  return new Function(`${source.slice(start, end)}; return localNotificationLink`)() as (data: unknown) => string
}

describe('Firebase service-worker visible notification contract', () => {
  it('renders only generic local copy and never a server-provided route', () => {
    expect(source).toContain("showNotification('Palladin'")
    expect(source).toContain("body: 'Open Palladin to view this notification.'")
    expect(source).toContain('data: { link: localNotificationLink(payload && payload.data) }')
    expect(source).not.toMatch(/payload\.data\.(title|body|link)/)
    expect(source).not.toMatch(/payload\.notification\.(title|body)/)
  })

  it('opens a pending submission decision view built locally from its opaque id', () => {
    const link = localNotificationLink()
    const id = '0d0d0d0d-0d0d-4d0d-8d0d-0d0d0d0d0d0d'
    expect(link({ type: 'submission_pending', subjectId: id })).toBe(`/submissions/${id}`)
    expect(link({ type: 'submission_pending', subjectId: '../../evil' })).toBe('/inbox')
    expect(link({ type: 'submission_pending', subjectId: 'https://evil.example' })).toBe('/inbox')
    expect(link({ type: 'grant_pending', subjectId: id, link: '/vaults' })).toBe('/inbox')
    expect(link(undefined)).toBe('/inbox')
  })
})
