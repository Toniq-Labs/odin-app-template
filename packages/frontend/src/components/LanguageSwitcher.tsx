import { useTranslation } from 'react-i18next';

import { SUPPORTED_LOCALES } from '../i18n';

const style: React.CSSProperties = {
    padding: '0.4rem 0.6rem',
    borderRadius: '8px',
    border: '1px solid #ccc',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
};

/**
 * Locale picker. Changing the selection calls `i18next.changeLanguage`, which
 * re-renders every translated string and (via the language detector's
 * localStorage cache) persists the choice across reloads.
 */
export function LanguageSwitcher() {
    const { t, i18n } = useTranslation();

    return (
        <select
            style={style}
            aria-label={t('language.label')}
            value={i18n.resolvedLanguage}
            onChange={(e) => void i18n.changeLanguage(e.target.value)}
        >
            {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                    {t(`language.${locale}`)}
                </option>
            ))}
        </select>
    );
}
