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
 * The ledger every canister installed before the ledger became an init
 * argument was hardcoded to. Used only to migrate those canisters on upgrade.
 */
export const LEGACY_ODIN_LEDGER_ID = ODIN_LEDGER_IDS.prod;

/**
 * Reject principals that can never be an Odin ledger canister. Returns the
 * principal's text form for storage.
 */
export function validateLedgerId(ledgerId: Principal): string {
    if (ledgerId.isAnonymous()) {
        throw new Error('ledger_id must not be the anonymous principal');
    }
    if (ledgerId.toText() === Principal.managementCanister().toText()) {
        throw new Error('ledger_id must not be the management canister');
    }
    return ledgerId.toText();
}

/**
 * Decide the ledger id to keep across an upgrade. `stored` is what `config`
 * holds (undefined for a canister installed before the ledger was an init
 * argument); `requested` is the upgrade argument.
 *
 * The ledger is immutable: the upgrade argument must name the ledger already
 * in use, or the upgrade is rejected. Switching environments means a reinstall
 * or a new canister.
 */
export function resolveUpgradeLedgerId(
    stored: string | undefined,
    requested: Principal,
): string {
    const current = stored ?? LEGACY_ODIN_LEDGER_ID;
    const next = validateLedgerId(requested);
    if (next !== current) {
        throw new Error(
            `ledger_id is immutable: canister uses ${current}, upgrade ` +
                `requested ${next}. Reinstall or deploy a new canister to ` +
                'switch Odin environments.',
        );
    }
    return current;
}
