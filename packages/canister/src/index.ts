import { IDL, init, msgCaller, query, StableBTreeMap, update } from 'azle';
import { Principal } from '@dfinity/principal';

import { icrc1Transfer } from './icrc1';
import { credit, debit, makeKey, parseKey, validateAmount } from './ledger';

/**
 * odin-app-template reference canister — multi-token internal ledger.
 *
 * Tracks an internal balance per (principal, token) pair, backed by stable
 * memory so balances survive upgrades. Tokens are identified by their ICRC-1
 * canister principal.
 *
 * Flows:
 *   deposit  — an Odin transfer lands in this canister, then a trusted caller
 *              invokes notifyDeposit to credit the user's internal balance.
 *   withdraw — the user debits their internal balance and the canister sends
 *              the tokens back out via ICRC-1.
 *
 * ⚠️ AI-GUARD: The balance-mutating paths below are hardened ledger core.
 * Preserve the checks-effects-interactions ordering and the authorization
 * gate. See ledger.ts and the AI guardrails task (86aj3b6xr).
 */
export default class {
    /** (owner|token) → balance. Memory id 0. */
    ledger = new StableBTreeMap<string, bigint>(0);

    /** Canister config (e.g. the deposit minter/owner). Memory id 1. */
    config = new StableBTreeMap<string, string>(1);

    /**
     * Record the deploying principal as the owner. Only the owner may credit
     * deposits via notifyDeposit.
     */
    @init([])
    initialize(): void {
        this.config.insert('owner', msgCaller().toText());
    }

    /**
     * Credit a user's internal balance after an Odin/ICRC-1 deposit has been
     * confirmed off-chain.
     *
     * ⚠️ AI-GUARD: Gated to the owner. In production the owner should be a
     * minter that independently verifies the deposit actually settled before
     * calling this — never expose this endpoint to arbitrary callers, or
     * anyone could mint unbacked balances.
     */
    @update([IDL.Principal, IDL.Principal, IDL.Nat], IDL.Nat)
    notifyDeposit(owner: Principal, token: Principal, amount: bigint): bigint {
        this.assertOwner();
        validateAmount(amount);

        const key = makeKey(owner.toText(), token.toText());
        const current = this.ledger.get(key) ?? 0n;
        const next = credit(current, amount);
        this.ledger.insert(key, next);
        return next;
    }

    /**
     * Debit the caller's internal balance and send `amount` of `token` back to
     * them via ICRC-1.
     *
     * ⚠️ AI-GUARD: Checks-effects-interactions. The balance is debited and
     * persisted BEFORE the cross-canister transfer await. If the transfer
     * fails the balance is refunded. Do not reorder: moving the transfer
     * before the debit opens a reentrancy window for double-withdrawal.
     */
    @update([IDL.Principal, IDL.Nat], IDL.Nat)
    async withdraw(token: Principal, amount: bigint): Promise<bigint> {
        validateAmount(amount);

        const caller = msgCaller();
        const key = makeKey(caller.toText(), token.toText());

        // CHECK + EFFECT: debit first, persist, then interact.
        const current = this.ledger.get(key) ?? 0n;
        const next = debit(current, amount); // throws on insufficient funds
        this.ledger.insert(key, next);

        // INTERACTION: send tokens out. Refund on any failure.
        try {
            return await icrc1Transfer(token, caller, amount);
        } catch (error) {
            const afterAwait = this.ledger.get(key) ?? 0n;
            this.ledger.insert(key, credit(afterAwait, amount));
            throw error;
        }
    }

    /** The caller's internal balance for a single token. */
    @query([IDL.Principal], IDL.Nat)
    getBalance(token: Principal): bigint {
        const key = makeKey(msgCaller().toText(), token.toText());
        return this.ledger.get(key) ?? 0n;
    }

    /** All of the caller's internal balances, as (token, balance) pairs. */
    @query([], IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat)))
    getBalances(): [Principal, bigint][] {
        const caller = msgCaller().toText();
        const balances: [Principal, bigint][] = [];
        for (const [key, balance] of this.ledger.items()) {
            const { owner, token } = parseKey(key);
            if (owner === caller) {
                balances.push([Principal.fromText(token), balance]);
            }
        }
        return balances;
    }

    /** Read the configured owner principal. */
    @query([], IDL.Opt(IDL.Principal))
    getOwner(): [Principal] | [] {
        const owner = this.config.get('owner');
        return owner === undefined ? [] : [Principal.fromText(owner)];
    }

    private assertOwner(): void {
        const owner = this.config.get('owner');
        if (owner === undefined) {
            throw new Error('canister not initialized');
        }
        if (msgCaller().toText() !== owner) {
            throw new Error('unauthorized: only the owner may credit deposits');
        }
    }
}
