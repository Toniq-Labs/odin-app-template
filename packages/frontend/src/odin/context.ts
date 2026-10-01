import { createContext } from 'react';
import type { OdinConnectedUser, OdinToken, OdinUser } from 'odin-connect';

import type { ResumeState } from './resume';

/**
 * Auth lifecycle:
 *   restoring     — checking localStorage for a prior session on mount
 *   disconnected  — no session; awaiting a connect()
 *   connecting    — Odin approval popup is open
 *   redirecting   — redirect mode: this tab is navigating to Odin and will
 *                   come back on a fresh page load
 *   connected     — authenticated; `principal` (and usually `profile`) set
 *   error         — last connect attempt failed; see `error`
 */
export type OdinAuthStatus =
    | 'restoring'
    | 'disconnected'
    | 'connecting'
    | 'redirecting'
    | 'connected'
    | 'error';

/**
 * A deposit/withdraw continuation that came back from a redirect-mode
 * approval. `status` is the approval outcome: `success` means Odin reported
 * the ICRC-2 approve went through, `failed` that it was rejected.
 */
export interface PendingResume {
    state: ResumeState;
    status: 'success' | 'failed';
}

export interface OdinConnectContextValue {
    status: OdinAuthStatus;
    /** The connected user's principal (text), or null when not connected. */
    principal: string | null;
    /** The Odin profile (username, image, …), or null until loaded. */
    profile: OdinUser | null;
    /**
     * The live SDK session. Downstream flows (deposit/withdraw) use this to
     * authorize on-chain actions. Null unless `status === 'connected'`.
     */
    user: OdinConnectedUser | null;
    /** Human-readable error from the last failed connect, if any. */
    error: string | null;
    /** Open the Odin approval popup (or redirect this tab) and establish a session. */
    connect: () => Promise<void>;
    /** Clear the session (in this tab and all tabs on the same origin). */
    disconnect: () => void;
    /**
     * Fetch a token's metadata (ticker, divisibility, decimals, …) by Odin
     * token id. Unlike `user.getBalances()` (which lists current wallet holdings),
     * this resolves any token — needed to convert amounts for tokens held only
     * as internal balances after a deposit.
     */
    getToken: (id: string) => Promise<OdinToken>;
    /**
     * True when this SDK instance reaches Odin by navigating this tab instead
     * of a popup (wallet in-app browsers, or `VITE_ODIN_CONNECT_MODE=redirect`).
     * Awaited SDK actions never resolve in that case; see `useResumeFlow`.
     */
    redirectMode: boolean;
    /**
     * The continuation of a redirect-mode approval this page load returned
     * from, until a flow claims it with `clearResume()`.
     */
    pendingResume: PendingResume | null;
    clearResume: () => void;
}

export const OdinConnectContext = createContext<OdinConnectContextValue | null>(
    null,
);
