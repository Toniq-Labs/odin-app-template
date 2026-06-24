import { useEffect, useState } from 'react';

import { useOdinConnect } from '../odin/useOdinConnect';
import { createCanisterActor } from './actor';
import { APP_CANISTER_ID } from './config';
import type { CanisterActor } from './idl';

/**
 * Build a typed app-canister actor from the connected session's delegation
 * identity. Returns null until a delegated session exists (or if no canister
 * id is configured) — callers should treat null as "canister calls
 * unavailable".
 */
export function useCanisterActor(): CanisterActor | null {
    const { user, status } = useOdinConnect();
    const [actor, setActor] = useState<CanisterActor | null>(null);

    useEffect(() => {
        let active = true;
        const identity = user?.getIdentity() ?? null;

        if (status === 'connected' && identity !== null && APP_CANISTER_ID !== '') {
            createCanisterActor(identity)
                .then((a) => {
                    if (active) {
                        setActor(a);
                    }
                })
                .catch(() => {
                    if (active) {
                        setActor(null);
                    }
                });
        } else {
            setActor(null);
        }

        return () => {
            active = false;
        };
    }, [user, status]);

    return actor;
}
