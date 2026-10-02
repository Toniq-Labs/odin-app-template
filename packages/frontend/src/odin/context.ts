import { createContext } from 'react';
import type {
    OdinConnectedUser,
    OdinRequestState,
    OdinToken,
    OdinUser,
} from 'odin-connect';

/**
 * Auth lifecycle, derived from the odin-connect state store (see
 * `deriveAuthStatus`):
 *   restoring     — the SDK is restoring the stored session / reading a
 *                   returning redirect result (`state.status: "initializing"`)
 *   disconnected  — no session; awaiting a connect()
 *   connecting    — a connect is pending: the Odin popup is open, or the tab
 *                   is on its way to Odin (redirect mode)
 *   connected     — authenticated; `principal` (and usually `profile`) set
 *   error         — the last connect was rejected, failed or could not be
 *                   verified; see `error`. Never retried automatically.
 */
export type OdinAuthStatus =
    | 'restoring'
    | 'disconnected'
    | 'connecting'
    | 'connected'
    | 'error';

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
    /**
     * The latest `connect()` or action (`user.icrcApprove()`, …) and its
     * outcome, straight from the SDK state. Flows react to it instead of
     * awaiting the call: in redirect mode the page reloads before an awaited
     * promise could return.
     */
    request: OdinRequestState | null;
    /**
     * Start a connect (popup, or a redirect in wallet in-app browsers). The
     * outcome arrives through `status` / `request`, not a return value.
     */
    connect: () => void;
    /** Clear the session (in this tab and all tabs on the same origin). */
    disconnect: () => void;
    /**
     * Fetch a token's metadata (ticker, divisibility, decimals, …) by Odin
     * token id. Unlike `user.getBalances()` (which lists current wallet holdings),
     * this resolves any token — needed to convert amounts for tokens held only
     * as internal balances after a deposit.
     */
    getToken: (id: string) => Promise<OdinToken>;
}

export const OdinConnectContext = createContext<OdinConnectContextValue | null>(
    null,
);
