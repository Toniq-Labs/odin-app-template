import { useCallback, useEffect, useState } from 'react';

import type { CanisterActor } from './idl';

export interface InternalBalance {
    token: string; // Odin token id
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
                entries.map(([token, amount]: [string, bigint]) => ({
                    token,
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
