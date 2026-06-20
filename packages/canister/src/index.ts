import {
    canisterSelf,
    IDL,
    init,
    msgCaller,
    query,
    StableBTreeMap,
    update,
} from 'azle';
import { Principal } from '@dfinity/principal';

import { odinPullToken, odinSendToken } from './odin';
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
     * Deposit `amount` of the Odin token `tokenId` for the caller. The caller
     * must have already granted this canister an ICRC-2 allowance via the Odin
     * `icrcApprove` flow (spender = this canister, on the Odin ledger's per-token
     * subaccount); this pulls the approved funds via icrc2_transfer_from on the
     * Odin ledger, then credits the caller's internal balance.
     *
     * `tokenId` is the Odin token id (the same string passed to icrcApprove),
     * NOT an ICRC ledger principal — every Odin token shares one ledger and is
     * addressed by subaccount. See odin.ts.
     *
     * ⚠️ AI-GUARD: Interaction-before-effect (the inverse of withdraw). The
     * funds are pulled in via icrc2_transfer_from BEFORE the internal credit, so
     * a balance is only ever credited for funds that actually settled into this
     * canister. The credit amount equals the just-settled transfer, so a
     * reentrant deposit cannot over-credit — each draws its own allowance. Do
     * not credit before the transfer await resolves.
     */
    @update([IDL.Text, IDL.Nat], IDL.Nat)
    async deposit(tokenId: string, amount: bigint): Promise<bigint> {
        validateAmount(amount);

        const caller = msgCaller();

        // INTERACTION: pull the pre-approved funds into this canister. Throws if
        // the allowance or balance is insufficient — no credit happens then.
        await odinPullToken(tokenId, caller, canisterSelf(), amount);

        // EFFECT: credit only what actually settled.
        const key = makeKey(caller.toText(), tokenId);
        const current = this.ledger.get(key) ?? 0n;
        const next = credit(current, amount);
        this.ledger.insert(key, next);
        return next;
    }

    /**
     * Debit the caller's internal balance and send `amount` of the Odin token
     * `tokenId` back to them via the Odin ledger (icrc1_transfer).
     *
     * ⚠️ AI-GUARD: Checks-effects-interactions. The balance is debited and
     * persisted BEFORE the cross-canister transfer await. If the transfer
     * fails the balance is refunded. Do not reorder: moving the transfer
     * before the debit opens a reentrancy window for double-withdrawal.
     */
    @update([IDL.Text, IDL.Nat], IDL.Nat)
    async withdraw(tokenId: string, amount: bigint): Promise<bigint> {
        validateAmount(amount);

        const caller = msgCaller();
        const key = makeKey(caller.toText(), tokenId);

        // CHECK + EFFECT: debit first, persist, then interact.
        const current = this.ledger.get(key) ?? 0n;
        const next = debit(current, amount); // throws on insufficient funds
        this.ledger.insert(key, next);

        // INTERACTION: send tokens out. Refund on any failure.
        try {
            return await odinSendToken(tokenId, caller, amount);
        } catch (error) {
            const afterAwait = this.ledger.get(key) ?? 0n;
            this.ledger.insert(key, credit(afterAwait, amount));
            throw error;
        }
    }

    /** The caller's internal balance for a single Odin token. */
    @query([IDL.Text], IDL.Nat)
    getBalance(tokenId: string): bigint {
        const key = makeKey(msgCaller().toText(), tokenId);
        return this.ledger.get(key) ?? 0n;
    }

    /** All of the caller's internal balances, as (tokenId, balance) pairs. */
    @query([], IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)))
    getBalances(): [string, bigint][] {
        const caller = msgCaller().toText();
        const balances: [string, bigint][] = [];
        for (const [key, balance] of this.ledger.items()) {
            const { owner, token } = parseKey(key);
            if (owner === caller) {
                balances.push([token, balance]);
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
