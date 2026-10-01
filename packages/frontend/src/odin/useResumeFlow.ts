import { useEffect, useRef } from 'react';

import type { CanisterActor } from '../canister/idl';
import type { ResumeFlow, ResumeState } from './resume';
import { useOdinConnect } from './useOdinConnect';

/**
 * Run the step that follows a redirect-mode approval.
 *
 * On the page load after Odin sends the user back, the provider exposes the
 * approval outcome and the `ResumeState` the flow passed as `returnState`.
 * This hook claims it for `flow` and calls `onResume` exactly once:
 *
 * - `status === 'success'`: waits until the canister actor exists (it is
 *   rebuilt asynchronously from the restored delegation), then fires so the
 *   flow can make its canister call.
 * - `status === 'failed'`: fires immediately so the flow can show the
 *   rejection.
 *
 * Nothing happens in popup mode, where the awaited SDK call resolves and the
 * flow continues inline.
 */
export function useResumeFlow(
    flow: ResumeFlow,
    actor: CanisterActor | null,
    onResume: (state: ResumeState, status: 'success' | 'failed') => void,
): void {
    const { pendingResume, clearResume } = useOdinConnect();
    const onResumeRef = useRef(onResume);
    onResumeRef.current = onResume;
    // Single-shot guard. StrictMode runs effects twice before the cleared
    // context value lands, so the ref, not the context, decides.
    const firedRef = useRef(false);

    useEffect(() => {
        if (firedRef.current || pendingResume === null) {
            return;
        }
        if (pendingResume.state.flow !== flow) {
            return;
        }
        if (pendingResume.status === 'success' && actor === null) {
            return;
        }
        firedRef.current = true;
        clearResume();
        onResumeRef.current(pendingResume.state, pendingResume.status);
    }, [pendingResume, actor, flow, clearResume]);
}
