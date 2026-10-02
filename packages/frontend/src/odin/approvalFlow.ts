import type { OdinRequestState } from 'odin-connect';

/**
 * `returnState` the deposit and withdraw flows attach to their ICRC-2
 * approval. Both flows start an `icrc_approve` request, so the approval's
 * `input` alone cannot tell them apart (depositing BTC approves `"btc"` just
 * like the withdraw fee does). `flow` is the discriminator.
 *
 * Withdraw also carries the token + amount to withdraw: its approval is for
 * the BTC fee, so those are not in `request.input`, and in redirect mode the
 * form's in-memory state is gone by the time the result arrives.
 * `returnState` survives the redirect (bigints included).
 */
export type ApprovalReturnState =
    | { flow: 'deposit' }
    | { flow: 'withdraw'; token: string; amount: bigint };

type IcrcApproveRequest = Extract<OdinRequestState, { action: 'icrc_approve' }>;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** Narrow an untyped `request.returnState` to this app's shape. */
export function parseApprovalReturnState(
    value: unknown,
): ApprovalReturnState | null {
    if (!isRecord(value)) {
        return null;
    }
    if (value.flow === 'deposit') {
        return { flow: 'deposit' };
    }
    if (
        value.flow === 'withdraw' &&
        typeof value.token === 'string' &&
        typeof value.amount === 'bigint'
    ) {
        return { flow: 'withdraw', token: value.token, amount: value.amount };
    }
    return null;
}

/**
 * The latest request when it is this flow's ICRC-2 approval, else null.
 * Only the latest request is in state; an older one is never returned.
 */
export function approvalFor<F extends ApprovalReturnState['flow']>(
    request: OdinRequestState | null,
    flow: F,
): { request: IcrcApproveRequest; returnState: Extract<ApprovalReturnState, { flow: F }> } | null {
    if (request?.action !== 'icrc_approve') {
        return null;
    }
    const returnState = parseApprovalReturnState(request.returnState);
    if (returnState?.flow !== flow) {
        return null;
    }
    return {
        request,
        returnState: returnState as Extract<ApprovalReturnState, { flow: F }>,
    };
}

/**
 * Request ids whose success has already been acted on during this page load.
 *
 * The follow-up to an approval is a canister update call that moves funds
 * (`deposit` / `withdraw`), so it must run at most once per approval. A
 * settled request stays in the SDK state after it has been handled, and
 * effects re-run (re-render, StrictMode, a remounted form), so the id is
 * claimed synchronously *before* the call, in module scope so it outlives
 * any one component instance. After a reload the SDK no longer reports the
 * old request (`request` is null), so nothing needs persisting.
 */
const handledRequests = new Set<string>();

/** Claim a request id; false when it was already claimed. */
export function claimRequest(id: string): boolean {
    if (handledRequests.has(id)) {
        return false;
    }
    handledRequests.add(id);
    return true;
}
