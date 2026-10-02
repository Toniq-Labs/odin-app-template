import { describe, expect, it } from 'vitest';
import type { OdinRequestState } from 'odin-connect';

import { approvalFor, claimRequest, parseApprovalReturnState } from './approvalFlow';

function approve(id: string, returnState: unknown): OdinRequestState {
    return {
        id,
        action: 'icrc_approve',
        status: 'success',
        input: { token: 'btc', spender: 'aaaaa-aa', amount: 200_000n },
        returnState,
    };
}

describe('parseApprovalReturnState', () => {
    it('accepts the deposit and withdraw shapes', () => {
        expect(parseApprovalReturnState({ flow: 'deposit' })).toEqual({ flow: 'deposit' });
        expect(parseApprovalReturnState({ flow: 'withdraw', token: '2jjj', amount: 5n })).toEqual({
            flow: 'withdraw',
            token: '2jjj',
            amount: 5n,
        });
    });

    it('rejects anything else', () => {
        expect(parseApprovalReturnState(undefined)).toBeNull();
        expect(parseApprovalReturnState({ flow: 'withdraw', token: '2jjj', amount: 5 })).toBeNull();
        expect(parseApprovalReturnState({ flow: 'other' })).toBeNull();
    });
});

describe('approvalFor', () => {
    it('matches only the flow that started the approval', () => {
        const deposit = approve('r1', { flow: 'deposit' });
        expect(approvalFor(deposit, 'deposit')?.request).toBe(deposit);
        expect(approvalFor(deposit, 'withdraw')).toBeNull();
    });

    it('ignores other actions and untagged approvals', () => {
        const connect: OdinRequestState = {
            id: 'c1',
            action: 'connect',
            status: 'success',
            input: { requires_api: true, requires_delegation: false, targets: [] },
        };
        expect(approvalFor(connect, 'deposit')).toBeNull();
        expect(approvalFor(approve('r2', undefined), 'deposit')).toBeNull();
        expect(approvalFor(null, 'withdraw')).toBeNull();
    });
});

describe('claimRequest', () => {
    it('claims each request id once', () => {
        expect(claimRequest('once')).toBe(true);
        expect(claimRequest('once')).toBe(false);
        expect(claimRequest('other')).toBe(true);
    });
});
