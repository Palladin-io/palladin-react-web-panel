import i18n from './i18n'
import type { ConsentNotice, ConsentPurpose } from '../api/consents-api'

export const consentNoticeVersion = '2026-09-18T00:00:00Z'

export function consentNotice(purpose: ConsentPurpose, locale: string): ConsentNotice {
  return {
    version: consentNoticeVersion,
    locale,
    text: i18n.t(`privacy.noticeDetails.${purpose}`, { lng: locale }),
  }
}
