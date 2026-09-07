import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const headers = await readFile(resolve('public/_headers'), 'utf8')

describe('production CSP', () => {
  it('allows bundled WebAssembly compilation without general eval', () => {
    expect(headers).toContain(
      "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://*.gstatic.com",
    )
    expect(headers).not.toContain("'unsafe-eval'")
  })

  it('allows the bundled data URI font', () => {
    expect(headers).toContain("font-src 'self' data: https://fonts.gstatic.com")
  })
})
