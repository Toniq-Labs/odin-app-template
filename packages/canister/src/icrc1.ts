import { call, IDL } from 'azle';
import { Principal } from '@dfinity/principal';

/**
 * Minimal ICRC-1 client — just the `icrc1_transfer` call the withdraw flow
 * needs. The token canister is identified by its principal (ICRC-1 standard),
 * which is exactly the "token identifier" the ledger keys on.
 *
 * Candid reference: https://github.com/dfinity/ICRC-1
 */

const Account = IDL.Record({
    owner: IDL.Principal,
    subaccount: IDL.Opt(IDL.Vec(IDL.Nat8)),
});

const TransferArg = IDL.Record({
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
    TooOld: IDL.Null,
    CreatedInFuture: IDL.Record({ ledger_time: IDL.Nat64 }),
    Duplicate: IDL.Record({ duplicate_of: IDL.Nat }),
    TemporarilyUnavailable: IDL.Null,
    GenericError: IDL.Record({ error_code: IDL.Nat, message: IDL.Text }),
});

const TransferResult = IDL.Variant({
    Ok: IDL.Nat,
    Err: TransferError,
});

type TransferResultValue =
    | { Ok: bigint }
    | { Err: Record<string, unknown> };

/**
 * Transfer `amount` of `token` from this canister's default account to `to`.
 *
 * Returns the block index on success. Throws with the decoded ICRC-1 error on
 * failure so the caller (withdraw) can refund the debited balance.
 *
 * ⚠️ AI-GUARD: The withdraw flow debits the internal ledger BEFORE calling
 * this, then refunds if this throws. Do not move the debit after the transfer
 * — that opens a reentrancy window where a second withdraw can run during the
 * await and double-spend the same balance.
 */
export async function icrc1Transfer(
    token: Principal,
    to: Principal,
    amount: bigint,
): Promise<bigint> {
    const result = await call<[unknown], TransferResultValue>(
        token,
        'icrc1_transfer',
        {
            args: [
                {
                    from_subaccount: [],
                    to: { owner: to, subaccount: [] },
                    amount,
                    fee: [],
                    memo: [],
                    created_at_time: [],
                },
            ],
            paramIdlTypes: [TransferArg],
            returnIdlType: TransferResult,
        },
    );

    if ('Err' in result) {
        throw new Error(`ICRC-1 transfer failed: ${JSON.stringify(result.Err)}`);
    }

    return result.Ok;
}
