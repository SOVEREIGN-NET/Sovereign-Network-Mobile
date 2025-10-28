/**
 * useTranslation Hook
 * Provides translations to React components
 */

import { useState, useEffect } from 'react';
import { getTranslations, getCurrentLanguage, type LanguageCode } from './i18n';
import type { Translation } from './translations/en';

/**
 * Custom hook to access translations in components
 * Automatically updates when language changes
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
    // Update when translations change (simulated by periodic check)
    const checkLanguageChange = setInterval(() => {
      const currentLanguage = getCurrentLanguage();
      if (currentLanguage !== language) {
        setTranslations(getTranslations());
        setLanguageState(currentLanguage);
      }
    }, 100);

    return () => clearInterval(checkLanguageChange);
  }, [language]);

  return {
    t: translations,
    language,
  };
}

export default useTranslation;
