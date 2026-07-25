// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { consumeLangQueryParam, LOCALE_STORAGE_KEY, parseLocale } from './locale';

describe('parseLocale', () => {
    it('accepts supported locales', () => {
        expect(parseLocale('en')).toBe('en');
        expect(parseLocale('zh')).toBe('zh');
    });

    it('maps regional variants to their base language, case-insensitively', () => {
        expect(parseLocale('zh-CN')).toBe('zh');
        expect(parseLocale('zh-TW')).toBe('zh');
        expect(parseLocale('ZH-hk')).toBe('zh');
        expect(parseLocale('EN-us')).toBe('en');
    });

    it('rejects unsupported and garbage values', () => {
        expect(parseLocale('fr')).toBeNull();
        expect(parseLocale('de-DE')).toBeNull();
        expect(parseLocale('')).toBeNull();
        expect(parseLocale('zh_CN')).toBeNull();
        expect(parseLocale(null)).toBeNull();
    });
});

describe('consumeLangQueryParam', () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.history.replaceState(null, '', '/');
    });

    it('persists a valid ?lang= to localStorage and strips it from the URL', () => {
        window.history.replaceState(null, '', '/?lang=zh');
        consumeLangQueryParam();
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh');
        expect(window.location.search).toBe('');
    });

    it('maps regional variants before persisting', () => {
        window.history.replaceState(null, '', '/?lang=zh-CN');
        consumeLangQueryParam();
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh');
    });

    it('ignores invalid values but still strips the param', () => {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, 'zh');
        window.history.replaceState(null, '', '/?lang=klingon');
        consumeLangQueryParam();
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh');
        expect(window.location.search).toBe('');
    });

    it('does nothing when the param is absent', () => {
        window.history.replaceState(null, '', '/?foo=bar');
        consumeLangQueryParam();
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
        expect(window.location.search).toBe('?foo=bar');
    });

    it('preserves other query params and the hash', () => {
        window.history.replaceState(null, '', '/page?foo=bar&lang=en&baz=1#section');
        consumeLangQueryParam();
        expect(window.location.pathname).toBe('/page');
        expect(window.location.search).toBe('?foo=bar&baz=1');
        expect(window.location.hash).toBe('#section');
        expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    });
});
