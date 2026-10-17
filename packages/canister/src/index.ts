import {
    canisterSelf,
    IDL,
    init,
    msgCaller,
    postUpgrade,
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
import { resolveUpgradeLedgerId, validateLedgerId } from './odin_ledger';

/**
 * Install/upgrade argument. `ledger_id` is the Odin ledger canister this
 * canister holds funds on — dev and prod/staging use different ledgers (see
 * odin_ledger.ts and the `deploy:dev` / `deploy:prod` scripts). It is fixed at
 * install and cannot change on upgrade.
 */
const InitArgsIdl = IDL.Record({ ledger_id: IDL.Principal });

type InitArgs = { ledger_id: Principal };

/**
 * ⚠️ EDIT BEFORE DEPLOY — must list the exact origin(s) your frontend is served
 * from, or Odin Connect login will fail with "origin is not trusted".
 *
 * ICRC-28 trusted origins: the web origins allowed to request signed calls to
 * this canister on a user's behalf. Before issuing a delegation, Odin Connect
 * (the signer) calls `icrc28_trusted_origins` on every target canister and
 * refuses the whole auth if the relying-party origin is absent — or if the
 * endpoint is missing entirely. The origin is the page that opened the signer,
 * NOT this canister's own URL.
 *
 * Each entry MUST be a bare origin: `scheme://host[:port]`, no trailing slash,
 * no path. https only, except `http://localhost`/`127.0.0.1` for local dev.
 * The signer does an exact string match, so e.g. a trailing `/` will not match.
 */
const TRUSTED_ORIGINS: string[] = [
    // Local dev — Vite dev server (default port).
    'http://localhost:5173',
    // Local dev — Vite dev server (fallback port when 5173 is taken).
    'http://localhost:5174',
    // Production — Netlify-hosted frontend.
    'https://odin-app-template.netlify.app',
];

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

    /**
     * Canister config (the deploying admin principal and the Odin ledger id).
     * Memory id 1.
     */
    config = new StableBTreeMap<string, string>(1);

    /**
     * Record the deploying principal as the owner — a generic admin handle
     * (e.g. for future admin-gated endpoints). Deposits are NOT owner-gated:
     * `deposit` is permissionless and self-verifying (it pulls the caller's own
     * pre-approved funds before crediting), so no trusted minter is needed.
     *
     * Also records the Odin ledger this canister holds funds on. It is
     * immutable from here on — see `upgrade`.
     */
    @init([InitArgsIdl])
    initialize(args: InitArgs): void {
        this.config.insert('owner', msgCaller().toText());
        this.config.insert('ledger_id', validateLedgerId(args.ledger_id));
    }

    /**
     * Enforce that the Odin ledger never changes across upgrades: every
     * internal balance is backed by tokens held on the current ledger, so a
     * switch would let withdrawals pay out funds never deposited there. The
     * upgrade argument must repeat the current ledger id, or the upgrade traps
     * and the old wasm keeps running.
     *
     * Canisters installed before `ledger_id` was an init argument have no
     * stored id; they were hardcoded to the prod ledger, so they are migrated
     * to it here (and only to it).
     */
    @postUpgrade([InitArgsIdl])
    upgrade(args: InitArgs): void {
        const ledgerId = resolveUpgradeLedgerId(
            this.config.get('ledger_id'),
            args.ledger_id,
        );
        this.config.insert('ledger_id', ledgerId);
    }

    /** The Odin ledger canister this canister holds funds on. */
    private odinLedger(): Principal {
        const ledgerId = this.config.get('ledger_id');
        if (ledgerId === undefined) {
            throw new Error('ledger_id not configured');
        }
        return Principal.fromText(ledgerId);
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
        await odinPullToken(
            this.odinLedger(),
            tokenId,
            caller,
            canisterSelf(),
            amount,
        );

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
                this.odinLedger(),
                ODIN_BTC_TOKEN_ID,
                caller,
                canisterSelf(),
                ODIN_BTC_FEE,
            );
            // Then the token send. The canister pays the outbound BTC fee out of
            // the BTC just pulled, so it nets zero.
            await odinSendToken(this.odinLedger(), tokenId, caller, amount);
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

    /**
     * The Odin ledger canister this canister holds funds on. Check it matches
     * the frontend's `VITE_ODIN_ENV` (dev → `w5cxm`, prod/staging → `yspgd`).
     *
     * `@update`, not `@query`, so the answer is consensus-certified: since the
     * ledger is an init argument, the wasm hash alone no longer proves which
     * ledger a deployed canister uses, and auditors should verify it here.
     */
    @update([], IDL.Principal)
    getOdinLedger(): Principal {
        return this.odinLedger();
    }

    /**
     * ICRC-28: the web origins this canister trusts to request signed calls on
     * a user's behalf. Odin Connect calls this before issuing a delegation and
     * refuses the auth if the relying-party origin is not listed. Configure the
     * list in `TRUSTED_ORIGINS` above.
     *
     * MUST be `@update`, not `@query`: the signer issues a replicated call so
     * the response is consensus-certified — a query reply comes from a single
     * replica and is spoofable, so signers reject it. Returns the record form
     * `{ trusted_origins }` the ICRC-28 standard (and the signer) expects.
     */
    @update([], IDL.Record({ trusted_origins: IDL.Vec(IDL.Text) }))
    icrc28_trusted_origins(): { trusted_origins: string[] } {
        return { trusted_origins: TRUSTED_ORIGINS };
    }
}
