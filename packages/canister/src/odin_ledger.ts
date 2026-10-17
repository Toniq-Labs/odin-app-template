import { Principal } from '@dfinity/principal';

/**
 * Pure helpers for choosing which Odin ledger canister this canister talks to.
 * No IC runtime imports, so it stays unit-testable (see odin_ledger.test.ts).
 *
 * Odin runs one multiplexed ledger per environment:
 *   - prod / staging share `yspgd` (staging only differs in the frontend URL)
 *   - dev is `w5cxm`
 * The ledger is passed as an init argument and is immutable afterwards: every
 * internal balance is backed by tokens held on that one ledger, so pointing the
 * canister at a different ledger would make withdrawals pay out from funds that
 * were never deposited there.
 */
export const ODIN_LEDGER_IDS = {
    prod: 'yspgd-ciaaa-aaaaj-a6rrq-cai',
    dev: 'w5cxm-6iaaa-aaaaj-az4jq-cai',
} as const;

/**
 * Accept only a known Odin ledger (`ODIN_LEDGER_IDS`). The ledger is
 * immutable, so a typo'd or wrong principal would brick deposits and
 * withdrawals until a reinstall wipes balances; rejecting it at install time
 * is the only safe point. Returns the principal's text form for storage.
 *
 * If Odin adds or rotates a ledger, add it to `ODIN_LEDGER_IDS`.
 */
export function validateLedgerId(ledgerId: Principal): string {
    const text = ledgerId.toText();
    const known: readonly string[] = Object.values(ODIN_LEDGER_IDS);
    if (!known.includes(text)) {
        throw new Error(
            `ledger_id ${text} is not a known Odin ledger. Expected one of: ` +
                known.join(', '),
        );
    }
    return text;
}

/**
 * Decide the ledger id to keep across an upgrade. `stored` is what `config`
 * holds (undefined for a canister installed before the ledger was an init
 * argument); `requested` is the upgrade argument.
 *
 * The ledger is immutable: the upgrade argument must name the ledger already
 * in use, or the upgrade is rejected. Switching environments means a reinstall
 * or a new canister.
 *
 * Legacy canisters (no stored id) had the ledger hardcoded in their old wasm,
 * which the upgrade replaces, so the canister cannot know which one it used:
 * forks could point at either environment. The operator's argument is taken
 * as that ledger, once, and is immutable from then on. Passing the wrong one
 * here is the one unrecoverable mistake — see the README migration note.
 */
export function resolveUpgradeLedgerId(
    stored: string | undefined,
    requested: Principal,
): string {
    const next = validateLedgerId(requested);
    if (stored === undefined) {
        return next;
    }
    if (next !== stored) {
        throw new Error(
            `ledger_id is immutable: canister uses ${stored}, upgrade ` +
                `requested ${next}. Reinstall or deploy a new canister to ` +
                'switch Odin environments.',
        );
    }
    return stored;
}
