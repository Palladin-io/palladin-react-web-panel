import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../locales/en.json'
import pl from '../../locales/pl.json'

export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export const LANGUAGE_STORAGE_KEY = 'palladin-lang'

const savedLng =
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(LANGUAGE_STORAGE_KEY)
    : null
const detectedLng =
  typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
const lng =
  savedLng && SUPPORTED_LANGUAGES.includes(savedLng as Language)
    ? savedLng
    : SUPPORTED_LANGUAGES.includes(detectedLng as Language)
      ? detectedLng
      : 'en'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    pl: { translation: pl },
  },
  lng,
  fallbackLng: 'en',
  defaultNS: 'translation',
  interpolation: {
    escapeValue: false, // React already escapes by default
  },
})

export default i18n
