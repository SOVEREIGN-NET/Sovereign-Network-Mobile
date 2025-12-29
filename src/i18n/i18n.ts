/**
 * i18n Configuration
 * Manages language selection and translation lookup
 */

import { en, type Translation } from './translations/en';

export type LanguageCode = 'en'; // 'es' | 'fr' | 'de' etc. can be added

type LanguageChangeListener = (language: LanguageCode) => void;

interface I18nConfig {
  currentLanguage: LanguageCode;
  translations: Record<LanguageCode, Translation>;
  listeners: Set<LanguageChangeListener>;
}

const i18nConfig: I18nConfig = {
  currentLanguage: 'en',
  translations: {
    en,
  },
  listeners: new Set(),
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
    const previousLanguage = i18nConfig.currentLanguage;
    i18nConfig.currentLanguage = language;

    // Notify listeners only if language actually changed
    if (previousLanguage !== language) {
      notifyListeners(language);
    }
  }
}

/**
 * Subscribe to language changes
 * @param listener - Callback function invoked when language changes
 * @returns Unsubscribe function
 */
export function onLanguageChange(listener: LanguageChangeListener): () => void {
  i18nConfig.listeners.add(listener);
  return () => {
    i18nConfig.listeners.delete(listener);
  };
}

/**
 * Notify all listeners of language change
 */
function notifyListeners(language: LanguageCode): void {
  i18nConfig.listeners.forEach(listener => {
    listener(language);
  });
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
