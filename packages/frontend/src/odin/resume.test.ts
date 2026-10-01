import { describe, expect, it } from 'vitest';

import { isResumeState } from './resume';

describe('isResumeState', () => {
    it('accepts a deposit continuation with a bigint amount', () => {
        expect(
            isResumeState({ flow: 'deposit', tokenId: '2jjj', amount: 1_000n }),
        ).toBe(true);
    });

    it('accepts a withdraw continuation with a bigint amount', () => {
        expect(
            isResumeState({ flow: 'withdraw', tokenId: 'btc', amount: 200_000n }),
        ).toBe(true);
    });

    it('rejects a non-bigint amount (wrong scale after serialization)', () => {
        expect(
            isResumeState({ flow: 'deposit', tokenId: '2jjj', amount: 1000 }),
        ).toBe(false);
        expect(
            isResumeState({ flow: 'deposit', tokenId: '2jjj', amount: '1000' }),
        ).toBe(false);
    });

    it('rejects unknown flows and missing fields', () => {
        expect(isResumeState({ flow: 'swap', tokenId: '2jjj', amount: 1n })).toBe(
            false,
        );
        expect(isResumeState({ flow: 'deposit', amount: 1n })).toBe(false);
        expect(isResumeState({ flow: 'deposit', tokenId: '', amount: 1n })).toBe(
            false,
        );
    });

    it('rejects non-objects', () => {
        expect(isResumeState(undefined)).toBe(false);
        expect(isResumeState(null)).toBe(false);
        expect(isResumeState('deposit')).toBe(false);
    });
});
