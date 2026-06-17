import { useCallback, useEffect, useState } from 'react';
import type { Principal } from '@dfinity/principal';

import type { CanisterActor } from './idl';

export interface InternalBalance {
    token: string; // ICRC-1 ledger principal (text)
    amount: bigint;
}

/**
 * The caller's internal ledger balances, read from the app canister. Exposes
 * `refresh()` so the deposit flow can pull the updated balance after crediting.
 */
export function useInternalBalances(actor: CanisterActor | null) {
    const [balances, setBalances] = useState<InternalBalance[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (actor === null) {
            setBalances([]);
            return;
        }
        setLoading(true);
        try {
            const entries = await actor.getBalances();
            setBalances(
                entries.map(([token, amount]: [Principal, bigint]) => ({
                    token: token.toText(),
                    amount,
                })),
            );
        } finally {
            setLoading(false);
        }
    }, [actor]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return { balances, loading, refresh };
}
