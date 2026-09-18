import { describe, expect, it } from 'vitest'
import archive from '../../../docs/consent-notices/2026-09-18.json'
import { consentNotice, consentNoticeVersion } from './consent-notices'
import type { ConsentPurpose } from '../api/consents-api'

describe('immutable client consent notices', () => {
  it.each(archive.notices)('matches the archived $purpose / $locale text and version', notice => {
    expect(consentNoticeVersion).toBe(archive.version)
    expect(consentNotice(notice.purpose as ConsentPurpose, notice.locale)).toEqual({
      version: archive.version, locale: notice.locale, text: notice.text,
    })
  })
})
