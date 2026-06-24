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

import {
    ODIN_BTC_FEE,
    ODIN_BTC_TOKEN_ID,
    odinPullToken,
    odinSendToken,
} from './odin';
import { credit, debit, makeKey, parseKey, validateAmount } from './ledger';

/**
 * odin-app-template reference canister — multi-token internal ledger.
 *
 * Tracks an internal balance per (principal, token) pair, backed by stable
 * memory so balances survive upgrades. Tokens are identified by their Odin
 * token id (text) — every Odin token shares one ledger, addressed by subaccount.
 *
 * Flows:
 *   deposit  — the caller pre-approves this canister on the Odin ledger, then
 *              this canister pulls the funds (icrc2_transfer_from) and credits
 *              the caller's internal balance.
 *   withdraw — the caller debits their internal balance and the canister sends
 *              the tokens back out on the Odin ledger (icrc1_transfer).
 *
 * ⚠️ AI-GUARD: The balance-mutating paths below are hardened ledger core.
 * Preserve the checks-effects-interactions ordering. See ledger.ts and the AI
 * guardrails task (86aj3b6xr).
 */
export default class {
    /** (owner|token) → balance. Memory id 0. */
    ledger = new StableBTreeMap<string, bigint>(0);

    /** Canister config (e.g. the deploying admin principal). Memory id 1. */
    config = new StableBTreeMap<string, string>(1);

    /**
     * Record the deploying principal as the owner — a generic admin handle
     * (e.g. for future admin-gated endpoints). Deposits are NOT owner-gated:
     * `deposit` is permissionless and self-verifying (it pulls the caller's own
     * pre-approved funds before crediting), so no trusted minter is needed.
     */
    @init([])
    initialize(): void {
        this.config.insert('owner', msgCaller().toText());
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
     * FEES (withdrawer pays): the Odin ledger charges a flat BTC fee to the
     * SENDER on every transfer. The outbound token transfer below is sent by
     * this canister, so the canister pays that fee in BTC. Instead of holding a
     * maintainer-seeded BTC float (subsidizing — griefable, drains under spam),
     * this canister pulls the fee from the withdrawer first: the caller
     * pre-approves BTC (>= 2x `ODIN_BTC_FEE`) via the Odin `icrcApprove` flow,
     * and `withdraw` pulls `ODIN_BTC_FEE` BTC into this canister to fund the
     * outbound fee. The pulled BTC cancels the outbound fee, so on success the
     * canister nets zero BTC and needs no float. A failed token send after the
     * fee pull leaves the pulled fee as canister surplus (forfeited below, not
     * refunded). See odin.ts and README.
     *
     * ⚠️ AI-GUARD: Checks-effects-interactions. The balance is debited and
     * persisted BEFORE any cross-canister transfer await. If a transfer fails
     * the balance is refunded. Do not reorder: moving a transfer before the
     * debit opens a reentrancy window for double-withdrawal. The fee pull must
     * stay BEFORE the token send so no tokens leave for an uncollected fee.
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

        // INTERACTION: collect the BTC fee from the withdrawer, then send the
        // tokens out. Refund the internal debit on any failure.
        try {
            // Fee first: pull the flat BTC fee from the caller's pre-approved
            // allowance. If this throws (no/low approval, insufficient BTC) no
            // tokens have left, and the debit is refunded below.
            await odinPullToken(
                ODIN_BTC_TOKEN_ID,
                caller,
                canisterSelf(),
                ODIN_BTC_FEE,
            );
            // Then the token send. The canister pays the outbound BTC fee out of
            // the BTC just pulled, so it nets zero.
            await odinSendToken(tokenId, caller, amount);
        } catch (error) {
            // Refund the token debit. A fee already pulled before a later
            // failure is NOT refunded — returning it would cost another BTC
            // transfer fee; the withdrawer forfeits the fee on a failed send.
            const afterAwait = this.ledger.get(key) ?? 0n;
            this.ledger.insert(key, credit(afterAwait, amount));
            throw error;
        }

        // Return the caller's new internal balance, matching `deposit`.
        return next;
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
}
