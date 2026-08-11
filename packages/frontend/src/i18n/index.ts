import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';
import { consumeLangQueryParam, LOCALE_STORAGE_KEY, SUPPORTED_LOCALES } from './locale';

export { SUPPORTED_LOCALES } from './locale';
export type { Locale } from './locale';

/**
 * Compile-time key-parity guard: `LocaleCatalog` is `en`'s exact key shape with
 * every leaf widened to `string`, so per-language copy differs freely but a
 * catalog missing (or misspelling) any key at any depth fails `pnpm typecheck`.
 */
type DeepStringify<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringify<T[K]> };
type LocaleCatalog = DeepStringify<typeof en>;

const enCatalog: LocaleCatalog = en;
const zhCatalog: LocaleCatalog = zh;

// The guards above enforce `each catalog ⊇ en`, catching *missing* keys. This
// reverse check enforces `en ⊇ each catalog`: assigning `en` to a catalog's own
// key shape fails typecheck if that catalog carries an *extra* key `en` lacks.
// Together the two directions guarantee identical key sets — no orphan keys.
const _zhParity: DeepStringify<typeof zh> = en;
void _zhParity;

// Honor `?lang=` before init so the detector's localStorage lookup below
// already sees the choice (see `consumeLangQueryParam` for the semantics).
consumeLangQueryParam();

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: enCatalog },
            zh: { translation: zhCatalog },
        },
        fallbackLng: 'en',
        supportedLngs: SUPPORTED_LOCALES,
        // Treat regional variants (e.g. `zh-CN`) as their base locale (`zh`).
        nonExplicitSupportedLngs: true,
        // React already escapes rendered output — double-escaping would corrupt
        // interpolated values.
        interpolation: { escapeValue: false },
        detection: {
            // localStorage first, then the browser language, then `fallbackLng`.
            // (`?lang=` is consumed into localStorage above, so it wins here.)
            order: ['localStorage', 'navigator'],
            lookupLocalStorage: LOCALE_STORAGE_KEY,
            caches: ['localStorage'],
        },
    });

export default i18n;
