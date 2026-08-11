import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OdinConnect, OdinUtils } from 'odin-connect';
import type { OdinConnectedUser, OdinUser } from 'odin-connect';

import { OdinConnectContext } from './context';
import type { OdinAuthStatus } from './context';
import { APP_CANISTER_ID } from '../canister/config';

type OdinEnv = 'prod' | 'dev' | 'local';

/**
 * App name + environment shown in the Odin approval popup. Configurable via
 * Vite env vars so a fork can point at dev/local without code changes.
 */
const APP_NAME = import.meta.env.VITE_ODIN_APP_NAME ?? 'Odin App Template';
const APP_ENV = (import.meta.env.VITE_ODIN_ENV ?? 'prod') as OdinEnv;

function toMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : fallback;
}

/**
 * Wraps the app and exposes the Odin Connect session via context. All auth is
 * delegated to the `odin-connect` SDK — the SDK owns popup handling and
 * localStorage persistence (principal + JWT); we only mirror its state into
 * React.
 */
export function OdinConnectProvider({ children }: { children: ReactNode }) {
    const { t, i18n } = useTranslation();
    // One SDK instance for the app's lifetime. `lang` sets the language of the
    // Odin Connect popups (sign-in + canister actions); the effect below keeps
    // it in step with the app locale after init.
    const odin = useMemo(
        () =>
            new OdinConnect({
                name: APP_NAME,
                env: APP_ENV,
                lang: OdinUtils.normalizeOdinLang(i18n.resolvedLanguage),
            }),
        // The instance must not be recreated on language change — the live
        // `lang` setter handles that — so the locale is deliberately not a dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
    const userRef = useRef<OdinConnectedUser | null>(null);

    // Follow the app locale: the SDK reads `lang` when a popup opens, so a
    // language switch applies to the next popup without any reload.
    useEffect(() => {
        odin.lang = OdinUtils.normalizeOdinLang(i18n.resolvedLanguage);
    }, [odin, i18n.resolvedLanguage]);

    const [status, setStatus] = useState<OdinAuthStatus>('restoring');
    const [principal, setPrincipal] = useState<string | null>(null);
    const [profile, setProfile] = useState<OdinUser | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Adopt a session: record principal immediately, then load the profile in
    // the background (a profile fetch failure must not drop the connection).
    const adopt = useCallback(async (user: OdinConnectedUser) => {
        userRef.current = user;
        setPrincipal(user.principal);
        setError(null);
        setStatus('connected');
        try {
            setProfile(await user.getUser());
        } catch {
            setProfile(null);
        }
    }, []);

    // Restore a prior session on mount, without opening a popup.
    useEffect(() => {
        let cancelled = false;
        const restored = odin.restoreSession();
        if (restored && !cancelled) {
            void adopt(restored);
        } else if (!cancelled) {
            setStatus('disconnected');
        }
        return () => {
            cancelled = true;
        };
    }, [odin, adopt]);

    const connect = useCallback(async () => {
        setStatus('connecting');
        setError(null);
        try {
            // Request a delegation scoped to the app canister so the session can
            // make authenticated update calls (deposit/withdraw). Falls
            // back to api-only when no canister id is configured.
            const user =
                APP_CANISTER_ID === ''
                    ? await odin.connect({ requires_api: true })
                    : await odin.connect({
                          requires_api: true,
                          requires_delegation: true,
                          targets: [APP_CANISTER_ID],
                      });
            await adopt(user);
        } catch (err) {
            userRef.current = null;
            setPrincipal(null);
            setProfile(null);
            setError(toMessage(err, t('errors.connectFailed')));
            setStatus('error');
        }
    }, [odin, adopt, t]);

    const disconnect = useCallback(() => {
        odin.disconnect();
        userRef.current = null;
        setPrincipal(null);
        setProfile(null);
        setError(null);
        setStatus('disconnected');
    }, [odin]);

    // Resolve token metadata by id via the SDK's public token endpoint. Works
    // for any token, including those the user no longer holds in their wallet
    // (e.g. fully deposited into the app canister).
    const getToken = useCallback((id: string) => odin.api.getToken(id), [odin]);

    const value = useMemo(
        () => ({
            status,
            principal,
            profile,
            user: userRef.current,
            error,
            connect,
            disconnect,
            getToken,
        }),
        [status, principal, profile, error, connect, disconnect, getToken],
    );

    return (
        <OdinConnectContext.Provider value={value}>
            {children}
        </OdinConnectContext.Provider>
    );
}
