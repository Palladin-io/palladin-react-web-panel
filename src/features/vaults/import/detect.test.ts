import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ENTRY_TYPE_CREDIT_CARD, ENTRY_TYPE_KEY } from '../types'
import { applyColumnMapping, CSV_PROFILES, extractCsvProfile } from './csv'
import { parseBytes, parseText } from './detect'
import { ImportParseError } from './types'

describe('parseText — CSV formats', () => {
  it('detects generic / chromium CSV', () => {
    const csv = 'name,url,username,password,note\nGitHub,https://github.com,octocat,pw,mine'
    const result = parseText(csv)
    expect(result.format).toBe('generic-csv')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({
      label: 'GitHub',
      username: 'octocat',
      password: 'pw',
      url: 'https://github.com',
      notes: 'mine',
    })
  })

  it('detects Firefox and derives the label from the host when name is absent', () => {
    const csv =
      '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\n' +
      '"https://news.ycombinator.com","hnuser","pw",,"https://news.ycombinator.com","{abc}","1","",""'
    const result = parseText(csv)
    expect(result.format).toBe('firefox-csv')
    expect(result.entries[0].label).toBe('news.ycombinator.com')
    expect(result.entries[0].username).toBe('hnuser')
  })

  it('detects Safari and keeps the otpauth URI', () => {
    const csv =
      'Title,URL,Username,Password,Notes,OTPAuth\n' +
      'GitHub,https://github.com,octocat,pw,,otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub'
    const result = parseText(csv)
    expect(result.format).toBe('safari-csv')
    expect(result.entries[0].totp).toContain('secret=JBSWY3DPEHPK3PXP')
  })

  it('detects LastPass and skips secure notes (url=http://sn)', () => {
    const csv =
      'url,username,password,totp,extra,name,grouping,fav\n' +
      'https://github.com,octocat,pw,,notes,GitHub,Work,0\n' +
      'http://sn,,,,secret note body,My Note,Notes,0'
    const result = parseText(csv)
    expect(result.format).toBe('lastpass-csv')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0].label).toBe('GitHub')
    expect(result.skipped.count).toBe(1)
  })

  it('detects Bitwarden CSV and wraps a bare login_totp secret', () => {
    const csv =
      'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\n' +
      'Work,0,login,GitHub,,,0,https://github.com,octocat,pw,JBSWY3DPEHPK3PXP'
    const result = parseText(csv)
    expect(result.format).toBe('bitwarden-csv')
    expect(result.entries[0].totp).toMatch(/^otpauth:\/\/totp\//)
  })

  it('detects 1Password 8 CSV (Archived+Tags) over Safari', () => {
    const csv =
      'Title,Url,Username,Password,OTPAuth,Favorite,Archived,Tags,Notes\n' +
      'GitHub,https://github.com,octocat,pw,,false,false,dev,'
    const result = parseText(csv)
    expect(result.format).toBe('1password-csv')
  })

  it('detects NordPass and RoboForm', () => {
    const nordpass =
      'name,url,username,password,note,cardholdername,cardnumber,cvc,expirydate,zipcode,folder\n' +
      'GitHub,https://github.com,octocat,pw,,,,,,,Dev'
    expect(parseText(nordpass).format).toBe('nordpass-csv')

    const roboform = 'Name,Url,Login,Pwd,Note,Folder\nGitHub,https://github.com,octocat,pw,,Dev'
    expect(parseText(roboform).format).toBe('roboform-csv')
  })

  it('handles BOM, quoted commas, and multi-line notes', () => {
    const csv =
      '﻿name,url,username,password,note\n' +
      'AWS,https://aws.amazon.com,admin,pw,"line one\nline two, with comma"'
    const result = parseText(csv)
    expect(result.format).toBe('generic-csv')
    expect(result.entries[0].label).toBe('AWS')
    expect(result.entries[0].notes).toBe('line one\nline two, with comma')
  })

  it('falls through to the manual mapper for an unrecognised CSV', () => {
    const csv = 'account,secret,site\nGitHub,pw,github.com'
    const result = parseText(csv)
    expect(result.format).toBe('manual')
    expect(result.entries).toHaveLength(0)
    expect(result.unmapped?.headers).toEqual(['account', 'secret', 'site'])

    const mapped = applyColumnMapping(result.unmapped!, {
      label: 'account',
      password: 'secret',
      url: 'site',
    })
    expect(mapped.entries[0]).toMatchObject({ label: 'GitHub', password: 'pw' })
  })
})

describe('parseText — JSON formats', () => {
  it('detects Bitwarden JSON and skips non-login items (type != 1)', () => {
    const json = JSON.stringify({
      encrypted: false,
      folders: [{ id: 'f1', name: 'Work' }],
      items: [
        {
          type: 1,
          name: 'GitHub',
          notes: 'multi\nline',
          login: {
            uris: [{ uri: 'https://github.com' }],
            username: 'octocat',
            password: 'pw',
            totp: 'otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP',
          },
        },
        { type: 2, name: 'A secure note', notes: 'body', login: null },
      ],
    })
    const result = parseText(json)
    expect(result.format).toBe('bitwarden-json')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ label: 'GitHub', notes: 'multi\nline' })
    expect(result.skipped.count).toBe(1)
  })

  it('detects Keeper JSON', () => {
    const json = JSON.stringify({
      records: [
        { title: 'GitHub', login: 'octocat', password: 'pw', login_url: 'https://github.com', notes: 'n' },
      ],
      shared_folders: [],
    })
    const result = parseText(json)
    expect(result.format).toBe('keeper-json')
    expect(result.entries[0].url).toBe('https://github.com')
  })

  it('detects Proton Pass JSON (vaults as object, email fallback)', () => {
    const json = JSON.stringify({
      version: '1.0.0',
      vaults: {
        v1: {
          name: 'Personal',
          items: [
            {
              data: {
                metadata: { name: 'GitHub', note: 'n' },
                content: { itemEmail: 'me@example.com', password: 'pw', urls: ['https://github.com'], totpUri: '' },
              },
            },
          ],
        },
      },
    })
    const result = parseText(json)
    expect(result.format).toBe('protonpass-json')
    expect(result.entries[0].username).toBe('me@example.com')
  })

  it('throws for an unrecognised JSON structure', () => {
    expect(() => parseText('{"foo":"bar"}')).toThrow(ImportParseError)
  })
})

describe('parseText — KeePass XML', () => {
  it('extracts entries and skips History revisions', () => {
    const xml = `<?xml version="1.0"?>
      <KeePassFile><Root><Group><Name>Root</Name>
        <Entry>
          <String><Key>Title</Key><Value>GitHub</Value></String>
          <String><Key>UserName</Key><Value>octocat</Value></String>
          <String><Key>Password</Key><Value ProtectInMemory="True">pw</Value></String>
          <String><Key>URL</Key><Value>https://github.com</Value></String>
          <String><Key>otp</Key><Value>otpauth://totp/GitHub?secret=JBSWY3DPEHPK3PXP</Value></String>
          <History>
            <Entry><String><Key>Password</Key><Value>old-pw</Value></String></Entry>
          </History>
        </Entry>
      </Group></Root></KeePassFile>`
    const result = parseText(xml)
    expect(result.format).toBe('keepass-xml')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ label: 'GitHub', username: 'octocat', password: 'pw' })
    expect(result.entries[0].totp).toContain('secret=JBSWY3DPEHPK3PXP')
  })
})

describe('parseBytes — ZIP formats', () => {
  it('detects a 1Password .1pux and ignores the files/ attachments', () => {
    const data = {
      accounts: [
        {
          vaults: [
            {
              items: [
                {
                  state: 'active',
                  overview: { title: 'GitHub', url: 'https://github.com' },
                  details: {
                    loginFields: [
                      { value: 'octocat', designation: 'username' },
                      { value: 'pw', designation: 'password' },
                    ],
                    notesPlain: 'n',
                    sections: [
                      { fields: [{ id: 'TOTP_x', value: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP' }] },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    }
    const zip = zipSync({
      'export.attributes': strToU8(JSON.stringify({ description: '1Password Unencrypted Export' })),
      'export.data': strToU8(JSON.stringify(data)),
      'files/photo.png': new Uint8Array([1, 2, 3, 4]),
    })
    const result = parseBytes(zip)
    expect(result.format).toBe('1password-1pux')
    expect(result.entries[0]).toMatchObject({ label: 'GitHub', username: 'octocat', password: 'pw' })
    expect(result.entries[0].totp).toContain('secret=JBSWY3DPEHPK3PXP')
  })

  it('detects a Dashlane ZIP via credentials.csv and wraps otpSecret', () => {
    const credentials =
      'username,username2,username3,title,password,note,url,category,otpSecret\n' +
      'octocat,,,GitHub,pw,n,https://github.com,Dev,JBSWY3DPEHPK3PXP'
    const zip = zipSync({ 'credentials.csv': strToU8(credentials) })
    const result = parseBytes(zip)
    expect(result.format).toBe('dashlane-zip')
    expect(result.entries[0].totp).toMatch(/^otpauth:\/\/totp\//)
  })

  it('detects a Dashlane single CSV', () => {
    const csv =
      'username,username2,username3,title,password,note,url,category,otpSecret\n' +
      'octocat,,,GitHub,pw,n,https://github.com,Dev,'
    expect(parseText(csv).format).toBe('dashlane-csv')
  })
})

describe('parseText — Palladin round-trip formats', () => {
  it('recognizes textual credit-card types case-insensitively', () => {
    const profile = CSV_PROFILES.find((candidate) => candidate.id === 'palladin-csv')!
    const { entries } = extractCsvProfile([{
      name: 'Travel card', type: 'CreditCard', cardholdername: 'A User',
      cardnumber: '4111111111111111', expirymonth: '12', expiryyear: '2030',
      securitycode: '123', pin: '', billingaddress: '', note: '',
    }], profile)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ type: ENTRY_TYPE_CREDIT_CARD, cardNumber: '4111111111111111' })
  })

  it('detects palladin-json and preserves KEY entries', () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: '2026-07-04T00:00:00Z',
      encrypted: false,
      vaults: [
        {
          id: 'v1',
          name: 'Prod',
          entries: [
            { name: 'API token', type: ENTRY_TYPE_KEY, value: 'sk_live_1' },
            { name: 'GitHub', type: 1, username: 'octocat', password: 'pw', urlDomain: 'github.com' },
          ],
        },
      ],
    })
    const result = parseText(json)
    expect(result.format).toBe('palladin-json')
    expect(result.entries[0]).toMatchObject({ label: 'API token', type: ENTRY_TYPE_KEY, value: 'sk_live_1' })
    expect(result.entries[1]).toMatchObject({ label: 'GitHub', username: 'octocat' })
  })

  it('detects palladin-csv (totp+folder superset) before generic', () => {
    const csv =
      'name,url,username,password,note,totp,folder\n' +
      'GitHub,https://github.com,octocat,pw,,otpauth://totp/x?secret=JBSWY3DPEHPK3PXP,Dev'
    const result = parseText(csv)
    expect(result.format).toBe('palladin-csv')
    expect(result.entries[0].totp).toContain('secret=JBSWY3DPEHPK3PXP')
  })
})
