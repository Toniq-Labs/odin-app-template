import { IDL } from '@dfinity/candid';
import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

/**
 * Candid interface for the app canister. Kept in sync by hand with the
 * generated `.did` (see `dfx build canister --check` output):
 *
 *   getBalance:  (text) -> (nat) query
 *   getBalances: () -> (vec record { text; nat }) query
 *   getOwner:    () -> (opt principal) query
 *   deposit:     (text, nat) -> (nat)
 *   withdraw:    (text, nat) -> (nat)
 *
 * Tokens are identified by their Odin token id (text), not an ICRC ledger
 * principal — every Odin token shares one ledger, addressed by subaccount.
 */
export const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
        getBalance: IDL.Func([IDL.Text], [IDL.Nat], ['query']),
        getBalances: IDL.Func(
            [],
            [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat))],
            ['query'],
        ),
        getOwner: IDL.Func([], [IDL.Opt(IDL.Principal)], ['query']),
        deposit: IDL.Func([IDL.Text, IDL.Nat], [IDL.Nat], []),
        withdraw: IDL.Func([IDL.Text, IDL.Nat], [IDL.Nat], []),
    });

export interface CanisterActor {
    getBalance: ActorMethod<[string], bigint>;
    getBalances: ActorMethod<[], Array<[string, bigint]>>;
    getOwner: ActorMethod<[], [] | [Principal]>;
    deposit: ActorMethod<[string, bigint], bigint>;
    withdraw: ActorMethod<[string, bigint], bigint>;
}
