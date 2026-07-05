import { describe, expect, it } from 'vitest'
import {
  blankField,
  foldCustomFields,
  foldScriptRefs,
  plaintextsEqual,
  readCustomFields,
  withCustomFields,
} from './entry-blob'
import {
  BLOB_VERSION_V2,
  ENTRY_TYPE_CREDENTIAL,
  ENTRY_TYPE_KEY,
  ENTRY_TYPE_SCRIPT,
  type CustomField,
  type EntryPlaintext,
} from './types'

const textField = (id: string, label: string, value: string): CustomField => ({
  id,
  label,
  type: 'text',
  value,
})

describe('foldCustomFields', () => {
  it('trims labels/values and drops empty rows', () => {
    const folded = foldCustomFields([
      textField('1', '  PIN  ', '  1234  '),
      textField('2', '', 'no label'),
      textField('3', 'no value', '   '),
    ])
    expect(folded).toEqual([{ id: '1', label: 'PIN', type: 'text', value: '1234' }])
  })

  it('returns undefined when nothing remains', () => {
    expect(foldCustomFields([])).toBeUndefined()
    expect(foldCustomFields([textField('1', '', '')])).toBeUndefined()
  })

  it('keeps a totp field only when it has a secret', () => {
    const withSecret: CustomField = {
      id: 't1',
      label: '2FA',
      type: 'totp',
      value: { secret: 'JBSWY3DPEHPK3PXP', algorithm: 'SHA1', digits: 6, period: 30 },
    }
    const empty: CustomField = {
      id: 't2',
      label: 'Empty',
      type: 'totp',
      value: { secret: '', algorithm: 'SHA1', digits: 6, period: 30 },
    }
    expect(foldCustomFields([withSecret, empty])).toEqual([withSecret])
  })
})

describe('withCustomFields', () => {
  it('stamps v:2 when fields are present', () => {
    const result = withCustomFields(
      { type: ENTRY_TYPE_KEY, value: 'secret' },
      [textField('1', 'PIN', '1234')],
    )
    expect(result).toMatchObject({ v: BLOB_VERSION_V2, type: ENTRY_TYPE_KEY, value: 'secret' })
    expect(result.fields).toHaveLength(1)
  })

  it('leaves a plain blob at v1 when there are no fields', () => {
    const result = withCustomFields({ type: ENTRY_TYPE_KEY, value: 'secret' }, [])
    expect(result).toEqual({ type: ENTRY_TYPE_KEY, value: 'secret' })
    expect('v' in result).toBe(false)
  })
})

describe('readCustomFields', () => {
  it('returns [] for a v1 blob with no fields', () => {
    expect(readCustomFields({ type: ENTRY_TYPE_KEY, value: 'x' })).toEqual([])
  })

  it('backfills missing ids so keys stay stable', () => {
    const plaintext = {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_KEY,
      value: 'x',
      fields: [{ label: 'PIN', type: 'text', value: '1' }],
    } as unknown as EntryPlaintext
    const fields = readCustomFields(plaintext)
    expect(fields[0].id).toBeTruthy()
  })
})

describe('foldScriptRefs', () => {
  it('keeps only fully-specified rows and trims env names', () => {
    expect(
      foldScriptRefs([
        { env: '  TOKEN ', entryId: 'e1', field: 'value' },
        { env: 'MISSING', entryId: '', field: 'value' },
        { env: '', entryId: 'e2', field: 'value' },
      ]),
    ).toEqual([{ env: 'TOKEN', entryId: 'e1', field: 'value' }])
  })
})

describe('plaintextsEqual', () => {
  it('ignores key order and undefined values', () => {
    const a: EntryPlaintext = { type: ENTRY_TYPE_KEY, value: 'x', notes: undefined }
    const b: EntryPlaintext = { value: 'x', type: ENTRY_TYPE_KEY } as EntryPlaintext
    expect(plaintextsEqual(a, b)).toBe(true)
  })

  it('detects a changed custom field', () => {
    const base = withCustomFields({ type: ENTRY_TYPE_KEY, value: 'x' }, [textField('1', 'PIN', '1')])
    const changed = withCustomFields({ type: ENTRY_TYPE_KEY, value: 'x' }, [textField('1', 'PIN', '2')])
    expect(plaintextsEqual(base, changed)).toBe(false)
  })

  it('treats a credential with a preserved totp as unchanged', () => {
    const a: EntryPlaintext = {
      type: ENTRY_TYPE_CREDENTIAL,
      username: 'u',
      password: 'p',
      totp: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
    }
    const b: EntryPlaintext = {
      totp: 'otpauth://totp/x?secret=JBSWY3DPEHPK3PXP',
      password: 'p',
      username: 'u',
      type: ENTRY_TYPE_CREDENTIAL,
    } as EntryPlaintext
    expect(plaintextsEqual(a, b)).toBe(true)
  })
})

describe('blankField', () => {
  it('creates an empty totp params object for a totp field', () => {
    const field = blankField('totp')
    expect(field.type).toBe('totp')
    expect(field.value).toMatchObject({ secret: '', algorithm: 'SHA1', digits: 6, period: 30 })
  })
})

// Sanity: SCRIPT plaintext with refs survives an equality round-trip.
describe('script plaintext equality', () => {
  it('matches identical script blobs regardless of key order', () => {
    const a: EntryPlaintext = {
      v: BLOB_VERSION_V2,
      type: ENTRY_TYPE_SCRIPT,
      script: 'echo hi',
      interpreter: 'bash',
      refs: [{ env: 'TOKEN', entryId: 'e1', field: 'value' }],
    }
    const b: EntryPlaintext = {
      interpreter: 'bash',
      refs: [{ field: 'value', entryId: 'e1', env: 'TOKEN' }],
      script: 'echo hi',
      type: ENTRY_TYPE_SCRIPT,
      v: BLOB_VERSION_V2,
    } as EntryPlaintext
    expect(plaintextsEqual(a, b)).toBe(true)
  })
})
