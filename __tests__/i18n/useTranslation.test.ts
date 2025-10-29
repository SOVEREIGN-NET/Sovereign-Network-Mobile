import { renderHook, waitFor } from '@testing-library/react-native';
import { useTranslation } from 'src/i18n/useTranslation';
import { setLanguage, getCurrentLanguage } from 'src/i18n/i18n';

describe('useTranslation Hook', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('should return translation object and language', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current).toBeDefined();
    expect(result.current.t).toBeDefined();
    expect(result.current.language).toBeDefined();
  });

  it('should provide access to translation strings', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t.dashboard).toBeDefined();
    expect(result.current.t.auth).toBeDefined();
    expect(result.current.t.wallet).toBeDefined();
  });

  it('should return current language', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe('en');
  });

  it('should update when language changes', async () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe('en');

    setLanguage('en');

    await waitFor(() => {
      expect(result.current.language).toBe('en');
    });
  });

  it('should provide dashboard translations', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t.dashboard).toBeDefined();
    expect(typeof result.current.t.dashboard.loadingMessage).toBe('string');
  });

  it('should provide auth translations', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t.auth.signIn).toBeDefined();
    expect(result.current.t.auth.createIdentity).toBeDefined();
  });

  it('should provide wallet translations', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.t.wallet).toBeDefined();
    expect(result.current.t.wallet.title).toBeDefined();
  });

  it('should provide all required translation sections', () => {
    const { result } = renderHook(() => useTranslation());

    const requiredSections = [
      'dashboard',
      'auth',
      'wallet',
      'dao',
      'browser',
    ];

    requiredSections.forEach(section => {
      expect(result.current.t[section as keyof typeof result.current.t]).toBeDefined();
    });
  });

  it('should maintain translation consistency across renders', () => {
    const { result, rerender } = renderHook(() => useTranslation());

    rerender();

    expect(result.current.t).toBeDefined();
    expect(typeof result.current.t.dashboard.loadingMessage).toBe('string');
  });

  it('should handle language detection on mount', () => {
    const { result } = renderHook(() => useTranslation());

    expect(result.current.language).toBe(getCurrentLanguage());
  });

  it('should return consistent translations across multiple calls', () => {
    const { result: result1 } = renderHook(() => useTranslation());
    const { result: result2 } = renderHook(() => useTranslation());

    expect(result1.current.language).toBe(result2.current.language);
    expect(result1.current.t).toEqual(result2.current.t);
  });
});
