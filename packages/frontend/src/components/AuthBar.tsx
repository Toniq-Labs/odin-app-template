import { useTranslation } from 'react-i18next';

import { useOdinConnect } from '../odin/useOdinConnect';

/** Shorten a principal for display: `abcde-…-xyz12`. */
function shortPrincipal(principal: string): string {
    if (principal.length <= 16) {
        return principal;
    }
    return `${principal.slice(0, 6)}…${principal.slice(-5)}`;
}

/** Odin CDN avatar for a user, keyed by principal. */
function avatarUrl(principal: string): string {
    return `https://images.odin.fun/v2/user/${principal}`;
}

const styles: Record<string, React.CSSProperties> = {
    bar: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        minHeight: '40px',
    },
    button: {
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        border: 'none',
        background: '#f7931a',
        color: '#fff',
        fontWeight: 600,
        cursor: 'pointer',
    },
    secondary: {
        padding: '0.4rem 0.8rem',
        borderRadius: '8px',
        border: '1px solid #ccc',
        background: 'transparent',
        color: 'inherit',
        cursor: 'pointer',
    },
    avatar: {
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        objectFit: 'cover',
        background: '#eee',
    },
    name: { fontWeight: 600 },
    principal: {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '0.85rem',
        opacity: 0.7,
    },
    error: { color: '#c0392b', fontSize: '0.9rem' },
};

/**
 * Connect/account control. Renders the right affordance for each auth state:
 * a loading hint while restoring, a Connect button when disconnected (or after
 * an error, with the error shown), and the connected identity + Disconnect once
 * authenticated.
 */
export function AuthBar() {
    const { t } = useTranslation();
    const { status, principal, profile, error, connect, disconnect } =
        useOdinConnect();

    if (status === 'restoring') {
        return <div style={styles.bar}>{t('auth.restoring')}</div>;
    }

    if (status === 'connected' && principal !== null) {
        return (
            <div style={styles.bar}>
                {profile?.image ? (
                    <img
                        src={avatarUrl(principal)}
                        alt={profile.username}
                        style={styles.avatar}
                    />
                ) : (
                    <div style={styles.avatar} aria-hidden="true" />
                )}
                <span style={styles.name}>{profile?.username ?? t('auth.connected')}</span>
                <span style={styles.principal} title={principal}>
                    {shortPrincipal(principal)}
                </span>
                <button
                    type="button"
                    style={styles.secondary}
                    onClick={disconnect}
                >
                    {t('auth.disconnect')}
                </button>
            </div>
        );
    }

    const connecting = status === 'connecting';
    return (
        <div style={styles.bar}>
            <button
                type="button"
                style={styles.button}
                onClick={() => void connect()}
                disabled={connecting}
            >
                {connecting ? t('auth.connecting') : t('auth.connect')}
            </button>
            {status === 'error' && error !== null ? (
                <span style={styles.error} role="alert">
                    {error}
                </span>
            ) : null}
        </div>
    );
}
