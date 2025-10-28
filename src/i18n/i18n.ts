/**
 * i18n Configuration
 * Manages language selection and translation lookup
 */

import { en, type Translation } from './translations/en';

export type LanguageCode = 'en'; // 'es' | 'fr' | 'de' etc. can be added

interface I18nConfig {
  currentLanguage: LanguageCode;
  translations: Record<LanguageCode, Translation>;
}

const i18nConfig: I18nConfig = {
  currentLanguage: 'en',
  translations: {
    en,
  },
};

/**
 * Get the current translation object
 */
export function getTranslations(): Translation {
  return i18nConfig.translations[i18nConfig.currentLanguage];
}

/**
 * Set the current language
 * @param language - Language code to switch to
 */
export function setLanguage(language: LanguageCode): void {
  if (i18nConfig.translations[language]) {
    i18nConfig.currentLanguage = language;
  }
}

/**
 * Get the current language code
 */
export function getCurrentLanguage(): LanguageCode {
  return i18nConfig.currentLanguage;
}

/**
 * Get available languages
 */
export function getAvailableLanguages(): LanguageCode[] {
  return Object.keys(i18nConfig.translations) as LanguageCode[];
}

/**
 * Register a new language translation
 * @param language - Language code
 * @param translation - Translation object
 */
export function registerLanguage(language: LanguageCode, translation: Translation): void {
  i18nConfig.translations[language as never] = translation;
}

export default i18nConfig;
