/**
 * BTC fee constants. Mirror of the canister's `ODIN_BTC_FEE`
 * (see packages/canister/src/odin.ts) — keep the two in sync.
 *
 * The Odin ledger charges a flat BTC fee to the sender on every transfer AND
 * on every approve. `withdraw` makes the withdrawer pay the outbound one: the
 * canister pulls the fee from the caller's BTC, then sends the tokens (the
 * pulled BTC funds the outbound fee).
 *
 * Allowance semantics (measured live on the Odin DEV ledger w5cxm, blocks
 * 61_665 / 61_669): icrc2_transfer_from debits the allowance by `amount`
 * only and takes the fee from the `from` BALANCE — unlike standard ICRC-2,
 * which spends amount + fee from the allowance. So a deposit approving
 * exactly the amount it pulls works there. The PROD ledger (yspgd) runs
 * different wasm and is unverified; the withdraw approval keeps one fee of
 * headroom, which works under both models.
 */

/** The Odin BTC token id. */
export const BTC_TOKEN_ID = 'btc';

/** Flat per-transfer BTC fee, in millisatoshis (1 sat = 1000 millisat). */
export const ODIN_BTC_FEE = 100_000n;

/**
 * BTC allowance the withdrawer approves: the pulled fee amount plus one fee of
 * headroom (needed only if the ledger spends amount + fee from the allowance —
 * see the header).
 */
export const WITHDRAW_FEE_APPROVAL = ODIN_BTC_FEE * 2n;

/**
 * The total BTC a withdrawal costs the withdrawer, in sats, for display: the
 * approve fee, the pulled fee amount, and the ledger fee on that pull.
 */
export const WITHDRAW_FEE_SATS = Number((ODIN_BTC_FEE * 3n) / 1000n);
