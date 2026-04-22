/**
 * i18n Configuration
 * Manages language selection and translation lookup.
 *
 * Persistence: the last-selected language is written to AsyncStorage
 * so it survives app restarts. We don't block startup on the async
 * read — the default ('en') renders immediately and gets replaced
 * once the stored value loads. This avoids a blank/locked screen on
 * cold start if AsyncStorage is slow.
 *
 * Listeners are notified on every change; `useTranslation` uses them
 * to trigger re-renders in subscribed components.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { en, type Translation } from './translations/en';
import { es } from './translations/es';

export type LanguageCode = 'en' | 'es'; // 'fr' | 'de' etc. can be added

type LanguageChangeListener = (language: LanguageCode) => void;

interface I18nConfig {
  currentLanguage: LanguageCode;
  translations: Record<LanguageCode, Translation>;
  listeners: Set<LanguageChangeListener>;
}

const STORAGE_KEY = 'i18n:language:v1';

const i18nConfig: I18nConfig = {
  currentLanguage: 'en',
  translations: {
    en,
    es,
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
 * Set the current language and persist the choice.
 *
 * The listener notification only fires when the language actually
 * changes — calling `setLanguage('en')` while already on English is
 * a no-op and will not trigger a re-render cascade.
 */
export function setLanguage(language: LanguageCode): void {
  if (!i18nConfig.translations[language]) return;

  const previousLanguage = i18nConfig.currentLanguage;
  if (previousLanguage === language) return;

  i18nConfig.currentLanguage = language;
  notifyListeners(language);

  // Best-effort persistence — a storage failure should never block
  // the UI transition the user just initiated.
  AsyncStorage.setItem(STORAGE_KEY, language).catch(() => {});
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
export function registerLanguage(
  language: LanguageCode,
  translation: Translation,
): void {
  i18nConfig.translations[language] = translation;
}

/**
 * Hydrate the stored language preference from AsyncStorage.
 *
 * Called once at app startup (see App.tsx). Safe to call multiple
 * times — it's idempotent and only applies the persisted value when
 * it's a known/registered language code.
 */
export async function hydrateLanguageFromStorage(): Promise<LanguageCode> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && (stored === 'en' || stored === 'es')) {
      setLanguage(stored);
      return stored;
    }
  } catch {
    /* best-effort hydration — fall through to the default */
  }
  return i18nConfig.currentLanguage;
}

export default i18nConfig;
