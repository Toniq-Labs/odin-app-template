import { Actor, HttpAgent } from '@dfinity/agent';
import type { Identity } from '@dfinity/agent';

import { APP_CANISTER_ID, IC_HOST, IS_LOCAL } from './config';
import { idlFactory } from './idl';
import type { CanisterActor } from './idl';

/**
 * Build a typed actor for the app canister using the caller's delegation
 * identity (from Odin Connect). Update calls like `deposit` / `withdraw` are
 * caller-scoped (they act on `msgCaller()`'s own balance), so they require an
 * authenticated identity — an anonymous agent would act as the wrong principal.
 *
 * On a local replica the agent must fetch the (insecure) root key — never do
 * this against mainnet, where it would let a MITM forge responses.
 */
export async function createCanisterActor(
    identity: Identity,
): Promise<CanisterActor> {
    if (APP_CANISTER_ID === '') {
        throw new Error(
            'VITE_APP_CANISTER_ID is not set — cannot reach the app canister',
        );
    }

    const agent = await HttpAgent.create({ identity, host: IC_HOST });
    if (IS_LOCAL) {
        await agent.fetchRootKey();
    }

    return Actor.createActor<CanisterActor>(idlFactory, {
        agent,
        canisterId: APP_CANISTER_ID,
    });
}
