import { useSyncExternalStore } from 'react';
import type { OdinState } from 'odin-connect';

import { odin } from './client';

/**
 * Subscribe a component to the SDK's state store: `{ status, user, request }`.
 *
 * This is the whole 2.0 pattern in React. Results of `connect()` and of every
 * action (`user.icrcApprove()`, `user.buy()`, …) land here, whether they came
 * back through a popup or — in wallet in-app browsers — through a full-page
 * redirect and reload, where an awaited promise would never return.
 *
 * The third argument is `getServerState` (not `getState`) so a server-rendered
 * page would hydrate from the same `"initializing"` snapshot the server saw.
 */
export function useOdinState(): OdinState {
    return useSyncExternalStore(
        odin.subscribe,
        odin.getState,
        odin.getServerState,
    );
}
