import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { parseText } from '../import'
import { ENTRY_TYPE_CREDENTIAL, ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY } from '../types'
import { toPalladinCsv, toPalladinJson, type ExportVault } from './serializers'

function parseCsvRows(csv: string): Record<string, string>[] {
  return Papa.parse<Record<string, string>>(csv, { header: true }).data
}

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
    expect(header).toBe('name,url,username,password,note,totp,folder,state,revision,historical,type,cardholderName,cardNumber,cvv,expiryMonth,expiryYear,billingAddress')
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

  it('neutralises formula-leading metadata cells', () => {
    const names = ['=1+1', '+SUM(A1)', '-2', '@cmd', '\tx', '\rx']
    const csv = toPalladinCsv([
      ...names.map((name) => ({ name, type: ENTRY_TYPE_CREDENTIAL })),
      {
        name: '=HYPERLINK("https://evil.test","x")',
        type: ENTRY_TYPE_CREDENTIAL,
        username: '@admin',
        url: '+https://example.test',
        notes: '-note',
        folder: '=Prod',
        cardholderName: '=Ada',
        billingAddress: '@Street',
      },
    ])
    const rows = parseCsvRows(csv)
    expect(rows.slice(0, names.length).map((row) => row.name)).toEqual(names.map((name) => `'${name}`))
    expect(rows[names.length]).toMatchObject({
      name: '\'=HYPERLINK("https://evil.test","x")',
      username: "'@admin",
      url: "'+https://example.test",
      note: "'-note",
      folder: "'=Prod",
      cardholderName: "'=Ada",
      billingAddress: "'@Street",
    })
  })

  it('keeps secret values byte-exact', () => {
    const csv = toPalladinCsv([
      {
        name: 'Plain',
        type: ENTRY_TYPE_CREDENTIAL,
        password: '=abc',
        totp: '+JBSWY3DPEHPK3PXP',
      },
      { name: 'Token', type: ENTRY_TYPE_KEY, value: '-sk_live_1' },
      { name: 'Card', type: ENTRY_TYPE_CREDIT_CARD, cardNumber: '@4242', cvv: '=012' },
    ])
    const rows = parseCsvRows(csv)
    expect(rows[0]).toMatchObject({ password: '=abc', totp: '+JBSWY3DPEHPK3PXP' })
    expect(rows[1].password).toBe('-sk_live_1')
    expect(rows[2]).toMatchObject({ cardNumber: '@4242', cvv: '=012' })
  })
})

describe('toPalladinJson round-trip', () => {
  it('does not neutralise formula-leading values', () => {
    const json = JSON.parse(toPalladinJson([
      { id: 'v1', name: 'Prod', entries: [{ name: '=HYPERLINK("x")', type: ENTRY_TYPE_CREDENTIAL, username: '@admin' }] },
    ]))
    expect(json.vaults[0].entries[0]).toMatchObject({ name: '=HYPERLINK("x")', username: '@admin' })
  })

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
          {
            name: 'Company card',
            type: ENTRY_TYPE_CREDIT_CARD,
            cardholderName: 'Ada Lovelace',
            cardNumber: '4242424242424242',
      cvv: '012',
            expiryMonth: '12',
            expiryYear: '2030',
            billingAddress: '1 Main Street',
          },
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
    expect(parsed.entries[2]).toMatchObject({
      label: 'Company card',
      type: ENTRY_TYPE_CREDIT_CARD,
      cardholderName: 'Ada Lovelace',
      cardNumber: '4242424242424242',
      cvv: '012',
      expiryMonth: '12',
      expiryYear: '2030',
      billingAddress: '1 Main Street',
    })
    expect(parsed.entries[2]).not.toHaveProperty('securityCode')
    expect(parsed.entries[2]).not.toHaveProperty('pin')
  })
})
