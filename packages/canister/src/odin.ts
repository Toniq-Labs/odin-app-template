import { call, IDL } from 'azle';
import { Principal } from '@dfinity/principal';

/**
 * Client for the Odin multiplexed ICRC ledger. Odin holds every token balance
 * in ONE ledger canister, addressed by (owner, subaccount) where the subaccount
 * is `odin_token_pointer(tokenId)` — i.e. the token identity is encoded in the
 * subaccount, not in a separate per-token ledger principal.
 *
 * Deposit/withdraw therefore both talk to this single canister:
 *   - deposit  pulls pre-approved funds via `icrc2_transfer_from`
 *   - withdraw sends funds back via `icrc1_transfer`
 * both from/to the caller's and this canister's per-token subaccount.
 *
 * The id is the prod Odin ledger (`yspgd`). Dev is `w5cxm`; staging/prod share
 * `yspgd`. A fork targeting dev should change this constant.
 */
export const ODIN_LEDGER_CANISTER_ID = Principal.fromText(
    'yspgd-ciaaa-aaaaj-a6rrq-cai',
);

/** Odin's BTC token id — the asset the flat ledger fee is denominated in. */
export const ODIN_BTC_TOKEN_ID = 'btc';

/**
 * Flat BTC fee the Odin ledger charges the SENDER on every transfer, in
 * millisatoshis (1 sat = 1000 millisat → 100 sats). `withdraw` pulls this much
 * BTC from the withdrawer (icrc2_transfer_from) to fund the outbound transfer's
 * own fee, so withdrawals need no maintainer-seeded BTC float.
 *
 * NOTE: pulling BTC is itself a transfer, so the ledger charges the withdrawer a
 * second fee on the pull (debited from the caller's BTC, per ICRC-2). The caller
 * therefore approves >= 2x this value and pays 2x total; the canister nets zero.
 *
 * ⚠️ Verify this constant against the live Odin ledger before mainnet. If it is
 * lower than the real fee, the first withdraw on an empty-float canister traps
 * with error 910; if higher, the canister slowly accumulates a BTC surplus.
 */
export const ODIN_BTC_FEE = 100_000n;

const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
});

const TransferFromArgs = IDL.Record({
    spender_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    from: Account,
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
});

const TransferArgs = IDL.Record({
    from_subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
    to: Account,
    amount: IDL.Nat,
    fee: IDL.Opt(IDL.Nat),
    memo: IDL.Opt(IDL.Vec(IDL.Nat8)),
    created_at_time: IDL.Opt(IDL.Nat64),
});

const TransferError = IDL.Variant({
    BadFee: IDL.Record({ expected_fee: IDL.Nat }),
    BadBurn: IDL.Record({ min_burn_amount: IDL.Nat }),
    InsufficientFunds: IDL.Record({ balance: IDL.Nat }),
    InsufficientAllowance: IDL.Record({ allowance: IDL.Nat }),
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
});

const TransferResult = IDL.Variant({ Ok: IDL.Nat, Err: TransferError });

type TransferResultValue =
    | { Ok: bigint }
    | { Err: Record<string, unknown> };

/** JSON.stringify replacer — ICRC error records carry Nat (bigint) fields. */
function stringifyError(err: Record<string, unknown>): string {
    return JSON.stringify(err, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
    );
}

/**
 * The subaccount under which `tokenId`'s balance is stored on the Odin ledger.
 * Both the depositor's approval and this canister's holdings live here.
 */
async function tokenPointer(tokenId: string): Promise<Uint8Array> {
    return await call<[string], Uint8Array>(
        ODIN_LEDGER_CANISTER_ID,
        'odin_token_pointer',
        {
            args: [tokenId],
            paramIdlTypes: [IDL.Text],
            returnIdlType: IDL.Vec(IDL.Nat8),
        },
    );
}

/**
 * Pull `amount` of `tokenId` from `from` into `to` using the ICRC-2 allowance
 * the depositor granted (spender = `to`). Returns the block index; throws with
 * the decoded error on failure.
 *
 * The deposit flow awaits this BEFORE crediting the internal ledger, so a
 * credit is only recorded for funds that actually settled into this canister.
 */
export async function odinPullToken(
    tokenId: string,
    from: Principal,
    to: Principal,
    amount: bigint,
): Promise<bigint> {
    const subaccount = await tokenPointer(tokenId);
    const result = await call<[unknown], TransferResultValue>(
        ODIN_LEDGER_CANISTER_ID,
        'icrc2_transfer_from',
        {
            args: [
                {
                    // Odin ledger requires spender_subaccount == from.subaccount
                    // (the per-token pointer); a mismatch traps with error 914.
                    spender_subaccount: [subaccount],
                    from: { owner: from, subaccount: [subaccount] },
                    to: { owner: to, subaccount: [subaccount] },
                    amount,
                    fee: [],
                    memo: [],
                    created_at_time: [],
                },
            ],
            paramIdlTypes: [TransferFromArgs],
            returnIdlType: TransferResult,
        },
    );

    if ('Err' in result) {
        throw new Error(
            `Odin transfer_from failed: ${stringifyError(result.Err)}`,
        );
    }

    return result.Ok;
}

/**
 * Send `amount` of `tokenId` from this canister's per-token subaccount back to
 * `to`'s per-token subaccount on the Odin ledger. Returns the block index;
 * throws with the decoded error on failure so withdraw can refund.
 */
export async function odinSendToken(
    tokenId: string,
    to: Principal,
    amount: bigint,
): Promise<bigint> {
    const subaccount = await tokenPointer(tokenId);
    const result = await call<[unknown], TransferResultValue>(
        ODIN_LEDGER_CANISTER_ID,
        'icrc1_transfer',
        {
            args: [
                {
                    from_subaccount: [subaccount],
                    to: { owner: to, subaccount: [subaccount] },
                    amount,
                    fee: [],
                    memo: [],
                    created_at_time: [],
                },
            ],
            paramIdlTypes: [TransferArgs],
            returnIdlType: TransferResult,
        },
    );

    if ('Err' in result) {
        throw new Error(`Odin transfer failed: ${stringifyError(result.Err)}`);
    }

    return result.Ok;
}
