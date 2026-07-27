import { describe, expect, it } from 'vitest'
import { parseText } from '../import'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_KEY } from '../types'
import { toPalladinCsv, toPalladinJson, type ExportVault } from './serializers'

describe('toPalladinCsv', () => {
  it('emits the header and escapes commas, quotes, and newlines (RFC 4180)', () => {
    const csv = toPalladinCsv([
      {
        name: 'AWS "root"',
        type: ENTRY_TYPE_CREDENTIAL,
        username: 'admin',
        password: 'p,w',
        url: 'https://aws.amazon.com',
        notes: 'line one\nline two',
        folder: 'Prod',
      },
    ])
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('name,url,username,password,note,totp,folder,state,revision,historical')
    expect(row).toContain('"AWS ""root"""')
    expect(row).toContain('"p,w"')
    expect(row).toContain('"line one\nline two"')
  })

  it('writes a KEY entry secret into the password column', () => {
    const csv = toPalladinCsv([
      { name: 'Token', type: ENTRY_TYPE_KEY, value: 'sk_live_1', folder: 'Prod' },
    ])
    const row = csv.split('\r\n')[1]
    // name,url,username,password,... → password (4th field) holds the value.
    expect(row.split(',')[3]).toBe('sk_live_1')
  })
})

describe('toPalladinJson round-trip', () => {
  it('re-imports losslessly through the palladin-json profile', () => {
    const vaults: ExportVault[] = [
      {
        id: 'v1',
        name: 'Prod',
        entries: [
          {
            name: 'GitHub',
            type: ENTRY_TYPE_CREDENTIAL,
            username: 'octocat',
            password: 'pw',
            url: 'github.com',
            notes: 'multi\nline',
            totp: 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
          },
          { name: 'API token', type: ENTRY_TYPE_KEY, value: 'sk_live_1' },
        ],
      },
    ]

    const json = toPalladinJson(vaults)
    const parsed = parseText(json)

    expect(parsed.format).toBe('palladin-json')
    expect(parsed.entries[0]).toMatchObject({
      label: 'GitHub',
      username: 'octocat',
      password: 'pw',
      notes: 'multi\nline',
      totp: 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
    })
    expect(parsed.entries[1]).toMatchObject({
      label: 'API token',
      type: ENTRY_TYPE_KEY,
      value: 'sk_live_1',
    })
  })
})
