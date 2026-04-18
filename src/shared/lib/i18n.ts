import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../locales/en.json'
import pl from '../../locales/pl.json'

const supportedLngs = ['en', 'pl']
const detectedLng =
  typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en'
const lng = supportedLngs.includes(detectedLng) ? detectedLng : 'en'

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
