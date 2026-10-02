import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { OdinUtils } from 'odin-connect';
import type { OdinRequestState, OdinUser } from 'odin-connect';
import type { TFunction } from 'i18next';

import { odin } from './client';
import { OdinConnectContext } from './context';
import { deriveAuthStatus } from './authStatus';
import { useOdinState } from './useOdinState';
import { APP_CANISTER_ID } from '../canister/config';

/** User-facing message for a connect that did not succeed, else null. */
function connectError(
    request: OdinRequestState | null,
    t: TFunction,
): string | null {
    if (request?.action !== 'connect') {
        return null;
    }
    switch (request.status) {
        case 'rejected':
            return t('errors.connectRejected');
        case 'unverified':
            return t('errors.connectUnverified');
        case 'failed':
            return request.error ?? t('errors.connectFailed');
        default:
            return null;
    }
}

/**
 * Wraps the app and exposes the Odin Connect session via context. All auth is
 * delegated to the `odin-connect` SDK: it owns the popup / redirect round trip,
 * verification and localStorage persistence. This provider only renders from
 * the SDK's state store (`useOdinState`) — it never awaits `connect()`, so the
 * same code works when a wallet in-app browser redirects to Odin and reloads.
 */
export function OdinConnectProvider({ children }: { children: ReactNode }) {
    const { t, i18n } = useTranslation();
    const state = useOdinState();
    const { user, request } = state;

    // Follow the app locale: the SDK reads `lang` when a popup opens or a
    // redirect starts, so a language switch applies without any reload.
    useEffect(() => {
        odin.lang = OdinUtils.normalizeOdinLang(i18n.resolvedLanguage);
    }, [i18n.resolvedLanguage]);

    // Load the Odin profile whenever the connected user changes (a fresh
    // connect, a restored session, or a redirect result after reload). A
    // profile fetch failure must not drop the connection.
    const [profile, setProfile] = useState<OdinUser | null>(null);
    useEffect(() => {
        let active = true;
        setProfile(null);
        if (user === null) {
            return;
        }
        user.getUser()
            .then((loaded) => {
                if (active) {
                    setProfile(loaded);
                }
            })
            .catch(() => {
                /* profile is best-effort; the session stays connected */
            });
        return () => {
            active = false;
        };
    }, [user]);

    const connect = useCallback(() => {
        // Request a delegation scoped to the app canister so the session can
        // make authenticated update calls (deposit/withdraw). Falls back to
        // api-only when no canister id is configured. Either way the session
        // is persisted, which redirect mode needs: an action's result arrives
        // on a fresh page load that must restore the user.
        //
        // Fire and forget: the outcome lands in `state` (popup or redirect).
        // The SDK never surfaces an unhandled rejection for an ignored promise.
        void odin.connect(
            APP_CANISTER_ID === ''
                ? { requires_api: true }
                : {
                      requires_api: true,
                      requires_delegation: true,
                      targets: [APP_CANISTER_ID],
                  },
        );
    }, []);

    const disconnect = useCallback(() => {
        // Clears the stored session in every tab; `user` and `request` become
        // null through the state store.
        odin.disconnect();
    }, []);

    // Resolve token metadata by id via the SDK's public token endpoint. Works
    // for any token, including those the user no longer holds in their wallet
    // (e.g. fully deposited into the app canister).
    const getToken = useCallback((id: string) => odin.api.getToken(id), []);

    const status = deriveAuthStatus(state);
    const error = status === 'error' ? connectError(request, t) : null;

    const value = useMemo(
        () => ({
            status,
            principal: user?.principal ?? null,
            profile,
            user,
            error,
            request,
            connect,
            disconnect,
            getToken,
        }),
        [status, user, profile, error, request, connect, disconnect, getToken],
    );

    return (
        <OdinConnectContext.Provider value={value}>
            {children}
        </OdinConnectContext.Provider>
    );
}
