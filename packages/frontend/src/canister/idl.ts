import { IDL } from '@dfinity/candid';
import type { Principal } from '@dfinity/principal';
import type { ActorMethod } from '@dfinity/agent';

/**
 * Candid interface for the app canister. Kept in sync by hand with the
 * generated `.did` (see `dfx build canister --check` output):
 *
 *   getBalance:    (principal) -> (nat) query
 *   getBalances:   () -> (vec record { principal; nat }) query
 *   getOwner:      () -> (opt principal) query
 *   notifyDeposit: (principal, principal, nat) -> (nat)
 *   withdraw:      (principal, nat) -> (nat)
 */
export const idlFactory: IDL.InterfaceFactory = ({ IDL }) =>
    IDL.Service({
        getBalance: IDL.Func([IDL.Principal], [IDL.Nat], ['query']),
        getBalances: IDL.Func(
            [],
            [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Nat))],
            ['query'],
        ),
        getOwner: IDL.Func([], [IDL.Opt(IDL.Principal)], ['query']),
        notifyDeposit: IDL.Func(
            [IDL.Principal, IDL.Principal, IDL.Nat],
            [IDL.Nat],
            [],
        ),
        withdraw: IDL.Func([IDL.Principal, IDL.Nat], [IDL.Nat], []),
    });

export interface CanisterActor {
    getBalance: ActorMethod<[Principal], bigint>;
    getBalances: ActorMethod<[], Array<[Principal, bigint]>>;
    getOwner: ActorMethod<[], [] | [Principal]>;
    notifyDeposit: ActorMethod<[Principal, Principal, bigint], bigint>;
    withdraw: ActorMethod<[Principal, bigint], bigint>;
}
