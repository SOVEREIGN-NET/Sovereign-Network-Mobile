/**
 * i18n Module
 * Localization and internationalization system
 */

export { useTranslation } from './useTranslation';
export {
  getTranslations,
  setLanguage,
  getCurrentLanguage,
  getAvailableLanguages,
  registerLanguage,
  hydrateLanguageFromStorage,
  type LanguageCode,
} from './i18n';
export { en, type Translation } from './translations/en';
export { es } from './translations/es';
