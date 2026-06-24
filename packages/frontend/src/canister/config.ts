/**
 * Canister/network config, read from Vite env. A fork sets these in `.env`
 * (see `.env.example`); dfx writes canister ids to the root `.env` on deploy.
 */

/** The app canister's principal (transfer destination + actor target). */
export const APP_CANISTER_ID = import.meta.env.VITE_APP_CANISTER_ID ?? '';

/** dfx network: `local` (default) uses a local replica; `ic` is mainnet. */
export const DFX_NETWORK = import.meta.env.VITE_DFX_NETWORK ?? 'local';

export const IS_LOCAL = DFX_NETWORK !== 'ic';

/** Replica/boundary host. Local replica by default, mainnet boundary on `ic`. */
export const IC_HOST =
    import.meta.env.VITE_IC_HOST ??
    (IS_LOCAL ? 'http://127.0.0.1:4943' : 'https://icp-api.io');
