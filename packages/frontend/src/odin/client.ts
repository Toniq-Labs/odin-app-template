import { OdinConnect } from 'odin-connect';

/**
 * Odin environments this template supports. Kept as a runtime array so the
 * value from `.env` can be validated; the `satisfies` clause makes the build
 * fail if the SDK's environment union ever changes.
 */
const ODIN_ENVS = [
    'prod',
    'staging',
    'dev',
    'local',
    'legacy',
] as const satisfies readonly OdinConnect['currentEnv'][];
export type OdinEnv = (typeof ODIN_ENVS)[number];

/**
 * Validate `VITE_ODIN_ENV`. A typo here would otherwise reach the SDK
 * unchecked and surface later as `new URL('undefined/...')` inside
 * `connect()`, so fail loudly at module load instead.
 */
export function parseOdinEnv(raw: string | undefined): OdinEnv {
    if (raw === undefined || raw === '') return 'prod';
    if ((ODIN_ENVS as readonly string[]).includes(raw)) return raw as OdinEnv;
    throw new Error(
        `VITE_ODIN_ENV="${raw}" is not a valid Odin environment. ` +
            `Expected one of: ${ODIN_ENVS.join(', ')}`,
    );
}

/**
 * App name + environment shown on the Odin approval page. Configurable via
 * Vite env vars so a fork can point at dev/local without code changes.
 */
const APP_NAME = import.meta.env.VITE_ODIN_APP_NAME ?? 'Odin App Template';
const APP_ENV = parseOdinEnv(import.meta.env.VITE_ODIN_ENV);

/**
 * The one `OdinConnect` instance for this page load (odin-connect 2.0).
 *
 * Created at module level, not per render or per route: the constructor
 * immediately restores the stored session and, when the page is coming back
 * from an Odin redirect (wallet in-app browsers), reads and verifies that
 * result. Every part of the app reads the outcome from this instance's state
 * store (`odin.state` / `odin.subscribe`) — see `useOdinState`.
 *
 * `mode` is left at the default `"auto"`: popups in normal browsers, a
 * full-page redirect inside wallet in-app browsers (OKX, Xverse, …), where a
 * popup could never send its result back.
 *
 * `lang` is not set here: the i18n locale is not reliably resolved at module
 * evaluation time. `OdinConnectProvider` keeps `odin.lang` in step with the
 * app locale before any popup or redirect can start.
 */
export const odin = new OdinConnect({ name: APP_NAME, env: APP_ENV });
