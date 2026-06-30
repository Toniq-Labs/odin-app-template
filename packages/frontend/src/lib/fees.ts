/**
 * BTC withdrawal-fee constants. Mirror of the canister's `ODIN_BTC_FEE`
 * (see packages/canister/src/odin.ts) — keep the two in sync.
 *
 * The Odin ledger charges a flat BTC fee to the sender on every transfer.
 * `withdraw` makes the withdrawer pay it: the canister pulls the fee from the
 * caller's BTC, then sends the tokens (the pulled BTC funds the outbound fee).
 * Pulling BTC is itself a transfer, so the caller pays the fee twice — once for
 * the pull, once funding the send — and must approve at least 2x the fee.
 */

/** The Odin BTC token id. */
export const BTC_TOKEN_ID = 'btc';

/** Flat per-transfer BTC fee, in millisatoshis (1 sat = 1000 millisat). */
export const ODIN_BTC_FEE = 100_000n;

/**
 * BTC allowance the withdrawer must approve: covers the pulled fee amount plus
 * the ledger fee charged on that pull (ICRC-2 debits amount + fee from `from`).
 */
export const WITHDRAW_FEE_APPROVAL = ODIN_BTC_FEE * 2n;

/** The total BTC the withdrawer spends, in sats, for display. */
export const WITHDRAW_FEE_SATS = Number(WITHDRAW_FEE_APPROVAL / 1000n);
