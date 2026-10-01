/**
 * What a deposit/withdraw flow needs to finish after an Odin Connect
 * redirect-mode round trip.
 *
 * In redirect mode the SDK navigates this tab to Odin for the ICRC-2 approval
 * and Odin navigates back, so the page reloads and the awaited `icrcApprove()`
 * never returns. The step that follows the approval (`deposit` / `withdraw` on
 * the app canister) therefore has to be described up front and passed to the
 * SDK as `returnState`; it comes back from `handleRedirectResult()` on the
 * next load and `useResumeFlow` runs it.
 *
 * Kept free of React/SDK imports so the guard stays unit-testable.
 */
export type ResumeState =
    | { flow: 'deposit'; tokenId: string; amount: bigint }
    | { flow: 'withdraw'; tokenId: string; amount: bigint };

export type ResumeFlow = ResumeState['flow'];

/**
 * Narrow an unknown `returnState` to a `ResumeState`. The SDK preserves
 * bigints across the round trip, so `amount` must come back as one — a
 * `number` or string would be the wrong scale and is rejected.
 */
export function isResumeState(value: unknown): value is ResumeState {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        (record.flow === 'deposit' || record.flow === 'withdraw') &&
        typeof record.tokenId === 'string' &&
        record.tokenId !== '' &&
        typeof record.amount === 'bigint'
    );
}
