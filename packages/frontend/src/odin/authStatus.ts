import type { OdinRequestState } from 'odin-connect';

import type { OdinAuthStatus } from './context';

/** The parts of the SDK state the auth status is derived from. */
interface AuthStateInput {
    status: 'initializing' | 'ready';
    /** Only whether a user is connected matters here. */
    user: unknown;
    request: Pick<OdinRequestState, 'action' | 'status'> | null;
}

/**
 * Map the SDK's `{ status, user, request }` onto the template's auth states.
 * Pure, so it is unit-tested without the SDK or a browser.
 *
 * A connected user wins over the latest connect's outcome: a rejected or
 * unverified *re*-connect keeps the previously stored session.
 */
export function deriveAuthStatus(state: AuthStateInput): OdinAuthStatus {
    if (state.status === 'initializing') {
        return 'restoring';
    }
    if (state.user !== null) {
        return 'connected';
    }
    const { request } = state;
    if (request?.action === 'connect') {
        if (request.status === 'pending') {
            return 'connecting';
        }
        if (
            request.status === 'rejected' ||
            request.status === 'failed' ||
            request.status === 'unverified'
        ) {
            return 'error';
        }
    }
    return 'disconnected';
}
