import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { connectionOrigins } from '../../../build/csp-origins'
import { firefoxSharedUnlockCsp } from '../../../build/firefox-csp'

const headers = await readFile(resolve('public/_headers'), 'utf8')

describe('production CSP', () => {
  it('enables Firefox resource fetch and frames only for an explicit valid Gecko ID', () => {
    expect(firefoxSharedUnlockCsp(undefined)).toBe('')
    expect(firefoxSharedUnlockCsp('')).toBe('')
    expect(firefoxSharedUnlockCsp('browser-extension@example.test')).toBe('moz-extension:')
    expect(() => firefoxSharedUnlockCsp('*')).toThrow()
    expect(() => firefoxSharedUnlockCsp('a'.repeat(32))).toThrow()
    const policy = headers.split('\n').find(line => line.trim().startsWith('Content-Security-Policy:'))!
    expect(policy.match(/__PALLADIN_FIREFOX_EXTENSION_SCHEME__/g)).toHaveLength(2)
    expect(policy.split(';').find(directive => directive.includes('script-src'))).not.toContain('__PALLADIN_FIREFOX_EXTENSION_SCHEME__')
  })
  it('binds API and SignalR to configured origins, including exact loopback ports', () => {
    expect(connectionOrigins('http://localhost:55083/api', 'http://localhost:55083/hubs/notifications'))
      .toBe('http://localhost:55083 ws://localhost:55083')
    expect(connectionOrigins('https://api.example.test', 'https://realtime.example.test/hub'))
      .toBe('https://api.example.test https://realtime.example.test wss://realtime.example.test')
    expect(headers).toContain('__PALLADIN_CONNECTION_ORIGINS__')
    expect(headers).not.toContain('https://api.palladin.io')
    expect(headers).not.toContain('https://api.stage.palladin.io')
  })
  it('admits only the configured remote HTTP origins after explicit build approval', () => {
    expect(() => connectionOrigins('http://api.example.test:8080/api', 'http://realtime.example.test:8081/hub')).toThrow()
    expect(connectionOrigins('http://api.example.test:8080/api', 'http://realtime.example.test:8081/hub', true))
      .toBe('http://api.example.test:8080 http://realtime.example.test:8081 ws://realtime.example.test:8081')
    for (const value of ['http://user:password@example.test', 'http://*.example.test', 'http://example.test?token=x',
      'http://example.test#fragment', 'http://example.test\n', 'file:///api']) {
      expect(() => connectionOrigins(value, value, true)).toThrow()
    }
  })
  it('does not grant any API origin when deployment configuration is absent', () => {
    expect(connectionOrigins()).toBe('')
  })
  it.each(['http://remote.example.test', 'https://user:password@example.test', 'https://*.example.test',
    'https://api.example.test?token=synthetic', 'https://api.example.test#fragment', 'https://api.example.test\n', 'data:text/plain,hello'])(
    'rejects unsafe connection configuration %s', value => {
    expect(() => connectionOrigins(value, value)).toThrow()
  })
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
