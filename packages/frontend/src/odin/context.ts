import { createContext } from 'react';
import type { OdinConnectedUser, OdinUser } from 'odin-connect';

/**
 * Auth lifecycle:
 *   restoring     — checking localStorage for a prior session on mount
 *   disconnected  — no session; awaiting a connect()
 *   connecting    — Odin approval popup is open
 *   connected     — authenticated; `principal` (and usually `profile`) set
 *   error         — last connect attempt failed; see `error`
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
    /** Open the Odin approval popup and establish a session. */
    connect: () => Promise<void>;
    /** Clear the session (in this tab and all tabs on the same origin). */
    disconnect: () => void;
}

export const OdinConnectContext = createContext<OdinConnectContextValue | null>(
    null,
);
