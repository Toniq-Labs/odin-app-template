import { Principal } from '@dfinity/principal';
import { describe, expect, it } from 'vitest';

import {
    LEGACY_ODIN_LEDGER_ID,
    ODIN_LEDGER_IDS,
    resolveUpgradeLedgerId,
    validateLedgerId,
} from './odin_ledger';

const PROD = Principal.fromText(ODIN_LEDGER_IDS.prod);
const DEV = Principal.fromText(ODIN_LEDGER_IDS.dev);

describe('validateLedgerId', () => {
    it('accepts the known Odin ledgers', () => {
        expect(validateLedgerId(PROD)).toBe(ODIN_LEDGER_IDS.prod);
        expect(validateLedgerId(DEV)).toBe(ODIN_LEDGER_IDS.dev);
    });

    it('rejects the anonymous principal', () => {
        expect(() => validateLedgerId(Principal.anonymous())).toThrow(
            /not a known Odin ledger/,
        );
    });

    it('rejects the management canister', () => {
        expect(() =>
            validateLedgerId(Principal.managementCanister()),
        ).toThrow(/not a known Odin ledger/);
    });

    it('rejects any other canister principal', () => {
        // A well-formed canister id that is not an Odin ledger (ICP ledger).
        const other = Principal.fromText('ryjl3-tyaaa-aaaaa-aaaba-cai');
        expect(() => validateLedgerId(other)).toThrow(
            /not a known Odin ledger/,
        );
    });
});

describe('resolveUpgradeLedgerId', () => {
    it('keeps the stored ledger when the upgrade arg matches', () => {
        expect(resolveUpgradeLedgerId(ODIN_LEDGER_IDS.dev, DEV)).toBe(
            ODIN_LEDGER_IDS.dev,
        );
    });

    it('rejects an upgrade that switches ledgers', () => {
        expect(() =>
            resolveUpgradeLedgerId(ODIN_LEDGER_IDS.dev, PROD),
        ).toThrow(/immutable/);
        expect(() =>
            resolveUpgradeLedgerId(ODIN_LEDGER_IDS.prod, DEV),
        ).toThrow(/immutable/);
    });

    it('migrates a legacy canister (no stored id) to the prod ledger', () => {
        expect(LEGACY_ODIN_LEDGER_ID).toBe(ODIN_LEDGER_IDS.prod);
        expect(resolveUpgradeLedgerId(undefined, PROD)).toBe(
            ODIN_LEDGER_IDS.prod,
        );
    });

    it('rejects moving a legacy canister off the prod ledger', () => {
        expect(() => resolveUpgradeLedgerId(undefined, DEV)).toThrow(
            /immutable/,
        );
    });

    it('rejects an invalid upgrade arg', () => {
        expect(() =>
            resolveUpgradeLedgerId(ODIN_LEDGER_IDS.prod, Principal.anonymous()),
        ).toThrow(/not a known Odin ledger/);
    });
});
