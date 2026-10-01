import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isInAppBrowser, OdinConnect, OdinUtils } from 'odin-connect';
import type {
    OdinConnectedUser,
    OdinConnectMode,
    OdinRedirectResult,
    OdinUser,
} from 'odin-connect';

import { OdinConnectContext } from './context';
import type { OdinAuthStatus, PendingResume } from './context';
import { isResumeState } from './resume';
import { APP_CANISTER_ID } from '../canister/config';

type OdinEnv = 'prod' | 'dev' | 'local';

/**
 * App name + environment shown in the Odin approval popup. Configurable via
 * Vite env vars so a fork can point at dev/local without code changes.
 */
const APP_NAME = import.meta.env.VITE_ODIN_APP_NAME ?? 'Odin App Template';
const APP_ENV = (import.meta.env.VITE_ODIN_ENV ?? 'prod') as OdinEnv;

/**
 * How the SDK reaches Odin: `popup` (window.open + postMessage), `redirect`
 * (navigate this tab and come back), or `auto` (redirect inside wallet in-app
 * browsers such as OKX, where popups cannot report back; popup elsewhere).
 */
function readConnectMode(raw: string | undefined): OdinConnectMode {
    return raw === 'popup' || raw === 'redirect' || raw === 'auto' ? raw : 'auto';
}
const APP_CONNECT_MODE = readConnectMode(import.meta.env.VITE_ODIN_CONNECT_MODE);

function toMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.message;
    }
    return typeof error === 'string' ? error : fallback;
}

/** What `handleRedirectResult()` found on this page load, read exactly once. */
interface RedirectOutcome {
    result: OdinRedirectResult<unknown> | null;
    /** The URL carried a result that did not match this tab's pending request. */
    invalid: boolean;
}

/**
 * Wraps the app and exposes the Odin Connect session via context. All auth is
 * delegated to the `odin-connect` SDK — the SDK owns popup/redirect handling
 * and localStorage persistence (principal + delegation); we only mirror its
 * state into React.
 */
export function OdinConnectProvider({ children }: { children: ReactNode }) {
    const { t, i18n } = useTranslation();
    // Latest translator for the one-shot mount effect below, which must not
    // re-run (and re-restore the session) on a language switch.
    const tRef = useRef(t);
    tRef.current = t;
    // One SDK instance for the app's lifetime. `lang` sets the language of the
    // Odin Connect popups (sign-in + canister actions); the effect below keeps
    // it in step with the app locale after init.
    const odin = useMemo(
        () =>
            new OdinConnect({
                name: APP_NAME,
                env: APP_ENV,
                lang: OdinUtils.normalizeOdinLang(i18n.resolvedLanguage),
                mode: APP_CONNECT_MODE,
            }),
        // The instance must not be recreated on language change — the live
        // `lang` setter handles that — so the locale is deliberately not a dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
    // Whether this instance will navigate the tab instead of opening a popup.
    // Mirrors the SDK's own decision for `auto`.
    const redirectMode = useMemo(
        () =>
            odin.mode === 'redirect' ||
            (odin.mode === 'auto' && isInAppBrowser()),
        [odin],
    );
    const userRef = useRef<OdinConnectedUser | null>(null);
    // The redirect result lives in the URL fragment and is consumed on the
    // first read, so keep it in a ref: StrictMode runs the mount effect twice.
    const redirectRef = useRef<RedirectOutcome | null>(null);

    // Follow the app locale: the SDK reads `lang` when a popup opens, so a
    // language switch applies to the next popup without any reload.
    useEffect(() => {
        odin.lang = OdinUtils.normalizeOdinLang(i18n.resolvedLanguage);
    }, [odin, i18n.resolvedLanguage]);

    const [status, setStatus] = useState<OdinAuthStatus>('restoring');
    const [principal, setPrincipal] = useState<string | null>(null);
    const [profile, setProfile] = useState<OdinUser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingResume, setPendingResume] = useState<PendingResume | null>(null);

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

    // On mount: finish a redirect-mode round trip if this load is one, then
    // restore a prior session without opening a popup.
    useEffect(() => {
        let cancelled = false;

        if (redirectRef.current === null) {
            try {
                redirectRef.current = {
                    result: odin.handleRedirectResult(),
                    invalid: false,
                };
            } catch {
                // Stale, foreign or replayed result: ignore it, but say so.
                redirectRef.current = { result: null, invalid: true };
            }
        }
        const { result, invalid } = redirectRef.current;

        if (result?.action === 'connect') {
            // The redirect-mode connect() that left this tab is now complete.
            // handleRedirectResult() already persisted a successful session.
            if (result.status === 'connected') {
                void adopt(result.user);
            } else {
                setStatus('error');
                setError(tRef.current('errors.connectRejected'));
            }
            return () => {
                cancelled = true;
            };
        }

        if (
            result !== null &&
            result.action === 'icrc_approve' &&
            isResumeState(result.returnState)
        ) {
            // A deposit/withdraw approval came back; the flow that started it
            // claims this through useResumeFlow once the canister actor is up.
            setPendingResume({ state: result.returnState, status: result.status });
        }

        const restored = odin.restoreSession();
        if (restored && !cancelled) {
            void adopt(restored);
        } else if (!cancelled) {
            setStatus(invalid ? 'error' : 'disconnected');
            setError(invalid ? tRef.current('errors.redirectInvalid') : null);
        }
        return () => {
            cancelled = true;
        };
    }, [odin, adopt]);

    const clearResume = useCallback(() => {
        setPendingResume(null);
    }, []);

    const connect = useCallback(async () => {
        setError(null);
        // Request a delegation scoped to the app canister so the session can
        // make authenticated update calls (deposit/withdraw). Falls back to a
        // plain connect when no canister id is configured.
        const delegation =
            APP_CANISTER_ID === ''
                ? {}
                : { requires_delegation: true as const, targets: [APP_CANISTER_ID] };

        if (redirectMode) {
            // This tab navigates to Odin and the promise never settles; the
            // mount effect above picks the result up on the next load. The
            // SDK rejects `requires_api` in redirect mode (the JWT would land
            // in a URL) and nothing here needs the API key: profile, balances
            // and token lookups are public reads.
            setStatus('redirecting');
            try {
                await odin.connect(delegation);
            } catch (err) {
                setError(toMessage(err, t('errors.connectFailed')));
                setStatus('error');
            }
            return;
        }

        setStatus('connecting');
        try {
            const user = await odin.connect({ requires_api: true, ...delegation });
            await adopt(user);
        } catch (err) {
            userRef.current = null;
            setPrincipal(null);
            setProfile(null);
            setError(toMessage(err, t('errors.connectFailed')));
            setStatus('error');
        }
    }, [odin, adopt, redirectMode, t]);

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
            redirectMode,
            pendingResume,
            clearResume,
        }),
        [
            status,
            principal,
            profile,
            error,
            connect,
            disconnect,
            getToken,
            redirectMode,
            pendingResume,
            clearResume,
        ],
    );

    return (
        <OdinConnectContext.Provider value={value}>
            {children}
        </OdinConnectContext.Provider>
    );
}
