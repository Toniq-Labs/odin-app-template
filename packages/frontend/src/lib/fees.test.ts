import { describe, expect, it } from 'vitest';

import {
    BTC_TOKEN_ID,
    ODIN_BTC_FEE,
    WITHDRAW_FEE_APPROVAL,
    WITHDRAW_FEE_SATS,
} from './fees';

describe('withdraw fee constants', () => {
    it('mirrors the canister ODIN_BTC_FEE (100 sats in msats)', () => {
        // Keep in sync with packages/canister/src/odin.ts — the canister pulls
        // exactly this much BTC from the withdrawer per withdrawal.
        expect(BTC_TOKEN_ID).toBe('btc');
        expect(ODIN_BTC_FEE).toBe(100_000n);
    });

    it('approves the pulled fee plus one fee of headroom', () => {
        expect(WITHDRAW_FEE_APPROVAL).toBe(2n * ODIN_BTC_FEE);
    });

    it('shows the full cost: approve fee + pulled fee + ledger fee on the pull', () => {
        expect(WITHDRAW_FEE_SATS).toBe(300);
    });
});
