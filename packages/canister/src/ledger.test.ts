import { describe, expect, it } from 'vitest';

import {
    credit,
    debit,
    makeKey,
    MAX_BALANCE,
    parseKey,
    validateAmount,
} from './ledger';

const PRINCIPAL_A = 'aaaaa-aa';
const TOKEN_X = 'mxzaz-hqaaa-aaaar-qaada-cai';

describe('makeKey / parseKey', () => {
    it('round-trips an (owner, token) pair', () => {
        const key = makeKey(PRINCIPAL_A, TOKEN_X);
        expect(parseKey(key)).toEqual({ owner: PRINCIPAL_A, token: TOKEN_X });
    });

    it('rejects inputs containing the reserved separator', () => {
        expect(() => makeKey('foo|bar', TOKEN_X)).toThrow(/separator/);
        expect(() => makeKey(PRINCIPAL_A, 'a|b')).toThrow(/separator/);
    });

    it('rejects empty inputs', () => {
        expect(() => makeKey('', TOKEN_X)).toThrow();
        expect(() => makeKey(PRINCIPAL_A, '')).toThrow();
    });

    it('rejects malformed keys', () => {
        expect(() => parseKey('no-separator')).toThrow(/malformed/);
        expect(() => parseKey('a|b|c')).toThrow(/malformed/);
    });
});

describe('validateAmount', () => {
    it('accepts positive amounts up to the max', () => {
        expect(() => validateAmount(1n)).not.toThrow();
        expect(() => validateAmount(MAX_BALANCE)).not.toThrow();
    });

    it('rejects zero and negative amounts', () => {
        expect(() => validateAmount(0n)).toThrow(/positive/);
        expect(() => validateAmount(-1n)).toThrow(/positive/);
    });

    it('rejects amounts above the max', () => {
        expect(() => validateAmount(MAX_BALANCE + 1n)).toThrow(/maximum/);
    });
});

describe('credit', () => {
    it('adds to the current balance', () => {
        expect(credit(100n, 50n)).toBe(150n);
        expect(credit(0n, 1n)).toBe(1n);
    });

    it('rejects overflow past the max balance', () => {
        expect(() => credit(MAX_BALANCE, 1n)).toThrow(/overflow/);
    });

    it('rejects non-positive amounts', () => {
        expect(() => credit(100n, 0n)).toThrow(/positive/);
    });
});

describe('debit', () => {
    it('subtracts from the current balance', () => {
        expect(debit(100n, 40n)).toBe(60n);
        expect(debit(100n, 100n)).toBe(0n);
    });

    it('rejects overdrafts', () => {
        expect(() => debit(100n, 101n)).toThrow(/insufficient/);
        expect(() => debit(0n, 1n)).toThrow(/insufficient/);
    });

    it('rejects non-positive amounts', () => {
        expect(() => debit(100n, 0n)).toThrow(/positive/);
    });
});
