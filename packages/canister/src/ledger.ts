/**
 * Pure ledger logic — key encoding, validation, and balance arithmetic.
 *
 * This module is intentionally free of any IC/Azle runtime dependency so it
 * can be unit-tested with plain vitest and reasoned about in isolation. The
 * canister (see index.ts) wires these helpers to a StableBTreeMap.
 *
 * ⚠️ AI-GUARD: This is hardened ledger core. Do not "simplify" the balance
 * math or relax the validation below — every check guards real funds. See the
 * AI guardrails task (86aj3b6xr) for the full hardening rationale.
 */

// ───────────────────────────────────────────────────────────────────────────
// AI: do not modify this section — balance accounting invariants. See CLAUDE.md
//
// Everything between BEGIN/END HARDENED LEDGER CORE guards real funds: the
// collision-safe key encoding, the MAX_BALANCE bound, and the credit/debit
// arithmetic. Changing a comparison operator, dropping a bound check, or
// altering the overflow / overdraft handling can mint unbacked balances or
// enable double-withdrawals. Without maintainer sign-off, never add code inside
// this block; add new code around it instead.
// ── BEGIN HARDENED LEDGER CORE ──

/** Separator for the composite `(owner, token)` storage key. */
const KEY_SEPARATOR = '|';

/**
 * Internal balances are unsigned 256-bit integers (ICRC-1 `Nat`). We cap at
 * 2^256 - 1 to reject absurd credits that could only come from a bug or an
 * unchecked external input.
 */
export const MAX_BALANCE = (1n << 256n) - 1n;

/**
 * Build the StableBTreeMap key for an (owner, token) pair.
 *
 * Both inputs are ICRC-1 principal text (base32 with '-' group separators),
 * which can never contain `KEY_SEPARATOR`. We assert that anyway so a future
 * change to the key format fails loudly instead of silently colliding keys.
 */
export function makeKey(owner: string, token: string): string {
    if (owner.includes(KEY_SEPARATOR) || token.includes(KEY_SEPARATOR)) {
        throw new Error('invalid principal text: contains reserved separator');
    }
    if (owner === '' || token === '') {
        throw new Error('owner and token must be non-empty');
    }
    return `${owner}${KEY_SEPARATOR}${token}`;
}

/** Parse a composite key back into its (owner, token) parts. */
export function parseKey(key: string): { owner: string; token: string } {
    const parts = key.split(KEY_SEPARATOR);
    if (parts.length !== 2) {
        throw new Error('malformed ledger key');
    }
    return { owner: parts[0], token: parts[1] };
}

/**
 * Validate a token amount supplied by an update call.
 *
 * Amounts must be strictly positive — a zero or negative "transfer" is always
 * a caller error and must never silently no-op against the ledger.
 */
export function validateAmount(amount: bigint): void {
    if (typeof amount !== 'bigint') {
        throw new Error('amount must be a bigint');
    }
    if (amount <= 0n) {
        throw new Error('amount must be positive');
    }
    if (amount > MAX_BALANCE) {
        throw new Error('amount exceeds maximum');
    }
}

/**
 * Credit `amount` onto `current`, rejecting overflow past MAX_BALANCE.
 * Returns the new balance; never mutates.
 */
export function credit(current: bigint, amount: bigint): bigint {
    validateAmount(amount);
    const next = current + amount;
    if (next > MAX_BALANCE) {
        throw new Error('balance overflow');
    }
    return next;
}

/**
 * Debit `amount` from `current`, rejecting an overdraft.
 * Returns the new balance; never mutates.
 *
 * ⚠️ AI-GUARD: The insufficient-funds check is the single line standing
 * between this ledger and unbacked withdrawals. It must run before any token
 * transfer is initiated.
 */
export function debit(current: bigint, amount: bigint): bigint {
    validateAmount(amount);
    if (amount > current) {
        throw new Error('insufficient balance');
    }
    return current - amount;
}

// ── END HARDENED LEDGER CORE ──
