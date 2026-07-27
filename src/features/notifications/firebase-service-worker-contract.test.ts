import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Firebase service-worker visible notification contract', () => {
  it('renders only generic local copy and a fixed Inbox route', () => {
    const source = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8')
    expect(source).toContain("showNotification('Palladin'")
    expect(source).toContain("body: 'Open Palladin to view this notification.'")
    expect(source).toContain("data: { link: '/inbox' }")
    expect(source).not.toMatch(/payload\.data\.(title|body|link)/)
    expect(source).not.toMatch(/payload\.notification\.(title|body)/)
  })
})
