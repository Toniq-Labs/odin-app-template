import { useContext } from 'react';

import { OdinConnectContext } from './context';
import type { OdinConnectContextValue } from './context';

/** Access the Odin Connect session. Must be used within OdinConnectProvider. */
export function useOdinConnect(): OdinConnectContextValue {
    const ctx = useContext(OdinConnectContext);
    if (ctx === null) {
        throw new Error('useOdinConnect must be used within an OdinConnectProvider');
    }
    return ctx;
}
