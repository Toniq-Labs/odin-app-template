/**
 * Locale primitives shared by the i18next setup (`index.ts`), the language
 * switcher, and the Odin Connect provider. Kept free of i18next imports so the
 * `?lang=` handling stays unit-testable.
 */

/**
 * Supported locales. `en` is the default and the source of truth for keys.
 * Adding a locale: drop in `locales/xx.json` (same keys as `en.json`),
 * import it, add it to `resources` + `SUPPORTED_LOCALES`, and add an
 * `<option>` in `LanguageSwitcher`.
 */
export const SUPPORTED_LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** localStorage key the i18next language detector reads and writes. */
export const LOCALE_STORAGE_KEY = 'odin-app-locale';

/**
 * Parse a raw `?lang=` value into a supported locale, or `null` when it isn't
 * one. Case-insensitive; regional variants map to their base language
 * (`zh-CN`, `ZH-tw` → `zh`), mirroring i18next's `nonExplicitSupportedLngs`.
 */
export function parseLocale(raw: string | null): Locale | null {
    if (raw === null) {
        return null;
    }
    const base = raw.toLowerCase().split('-')[0];
    return (SUPPORTED_LOCALES as readonly string[]).includes(base)
        ? (base as Locale)
        : null;
}

/**
 * `?lang=` support: a valid value is treated as an explicit language choice —
 * it is persisted to localStorage *before* i18next initializes, so the
 * language detector picks it up exactly as if the user had chosen it in the
 * switcher. Invalid values are ignored and the stored preference stays in
 * effect. Either way the param is stripped from the URL (other params and the
 * hash survive), so a stale shared link can't override a later in-app choice
 * on reload.
 */
export function consumeLangQueryParam(): void {
    const url = new URL(window.location.href);
    const raw = url.searchParams.get('lang');
    if (raw === null) {
        return;
    }
    const locale = parseLocale(raw);
    if (locale !== null) {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    }
    url.searchParams.delete('lang');
    window.history.replaceState(window.history.state, '', url);
}
