/**
 * useTranslation Hook
 * Provides translations to React components
 */

import { useState, useEffect } from 'react';
import { getTranslations, getCurrentLanguage, onLanguageChange, type LanguageCode } from './i18n';
import type { Translation } from './translations/en';

/**
 * Custom hook to access translations in components
 * Automatically updates when language changes via subscription pattern
 *
 * @returns Translation object and current language
 *
 * @example
 * const { t, language } = useTranslation();
 * return <Text>{t.dashboard.loadingMessage}</Text>
 */
export function useTranslation() {
  const [translations, setTranslations] = useState<Translation>(getTranslations());
  const [language, setLanguageState] = useState<LanguageCode>(getCurrentLanguage());

  useEffect(() => {
    // Subscribe to language changes (no polling)
    const unsubscribe = onLanguageChange((newLanguage: LanguageCode) => {
      setTranslations(getTranslations());
      setLanguageState(newLanguage);
    });

    return unsubscribe;
  }, []);

  return {
    t: translations,
    language,
  };
}

export default useTranslation;
