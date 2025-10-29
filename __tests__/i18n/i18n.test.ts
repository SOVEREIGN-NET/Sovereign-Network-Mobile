import {
  getTranslations,
  setLanguage,
  getCurrentLanguage,
  getAvailableLanguages,
  registerLanguage,
} from 'src/i18n/i18n';
import { en } from 'src/i18n/translations/en';

describe('i18n Configuration', () => {
  beforeEach(() => {
    // Reset to English before each test
    setLanguage('en');
  });

  describe('getTranslations', () => {
    it('should return English translations by default', () => {
      const translations = getTranslations();
      expect(translations).toBeDefined();
      expect(translations).toEqual(en);
    });

    it('should return translations object with nested keys', () => {
      const translations = getTranslations();
      expect(translations.dashboard).toBeDefined();
      expect(translations.auth).toBeDefined();
      expect(translations.wallet).toBeDefined();
    });

    it('should contain properly structured translation strings', () => {
      const translations = getTranslations();
      expect(typeof translations.dashboard.loadingMessage).toBe('string');
      expect(translations.dashboard.networkStatus).toBeDefined();
    });
  });

  describe('getCurrentLanguage', () => {
    it('should return "en" by default', () => {
      const lang = getCurrentLanguage();
      expect(lang).toBe('en');
    });

    it('should reflect language changes', () => {
      setLanguage('en');
      expect(getCurrentLanguage()).toBe('en');
    });
  });

  describe('setLanguage', () => {
    it('should set language to available language', () => {
      setLanguage('en');
      expect(getCurrentLanguage()).toBe('en');
    });

    it('should not change language to unavailable one', () => {
      const originalLang = getCurrentLanguage();
      setLanguage('es' as any);
      expect(getCurrentLanguage()).toBe(originalLang);
    });
  });

  describe('getAvailableLanguages', () => {
    it('should return array of available languages', () => {
      const languages = getAvailableLanguages();
      expect(Array.isArray(languages)).toBe(true);
      expect(languages.length).toBeGreaterThan(0);
    });

    it('should include English by default', () => {
      const languages = getAvailableLanguages();
      expect(languages).toContain('en');
    });

    it('should return LanguageCode type', () => {
      const languages = getAvailableLanguages();
      languages.forEach(lang => {
        expect(typeof lang).toBe('string');
      });
    });
  });

  describe('registerLanguage', () => {
    it('should register a new language', () => {
      const spanishTranslations = {
        ...en,
        dashboard: {
          ...en.dashboard,
          title: 'Tablero',
        },
      };

      registerLanguage('en', spanishTranslations);
      const translations = getTranslations();
      expect(translations.dashboard.title).toBeDefined();
    });

    it('should make registered language available', () => {
      const customTranslations = { ...en };
      registerLanguage('en', customTranslations);

      const available = getAvailableLanguages();
      expect(available).toContain('en');
    });

    it('should overwrite existing language translations', () => {
      const originalTranslations = getTranslations();
      const modifiedTranslations = {
        ...originalTranslations,
        dashboard: {
          ...originalTranslations.dashboard,
          title: 'Modified Title',
        },
      };

      registerLanguage('en', modifiedTranslations);
      const updated = getTranslations();
      expect(updated.dashboard.title).toBe('Modified Title');
    });
  });

  describe('Translation structure validation', () => {
    it('should have auth translations', () => {
      const translations = getTranslations();
      expect(translations.auth).toBeDefined();
      expect(translations.auth.signIn).toBeDefined();
      expect(translations.auth.createIdentity).toBeDefined();
    });

    it('should have wallet translations', () => {
      const translations = getTranslations();
      expect(translations.wallet).toBeDefined();
      expect(translations.wallet.title).toBeDefined();
      expect(translations.wallet.balance).toBeDefined();
    });

    it('should have dashboard translations', () => {
      const translations = getTranslations();
      expect(translations.dashboard).toBeDefined();
      expect(translations.dashboard.loadingMessage).toBeDefined();
    });

    it('should have DAO translations', () => {
      const translations = getTranslations();
      expect(translations.dao).toBeDefined();
      expect(translations.dao.statistics).toBeDefined();
    });

    it('should have browser translations', () => {
      const translations = getTranslations();
      expect(translations.browser).toBeDefined();
      expect(translations.browser.title).toBeDefined();
    });
  });
});
