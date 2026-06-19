import { IDL, query } from 'azle';

/**
 * odin-app-template reference canister.
 *
 * Bootstrap skeleton: a single hello-world query proves the canister
 * compiles and deploys. The multi-token internal ledger lands in a later
 * subtask.
 */
export default class {
    @query([], IDL.Text)
    hello(): string {
        return 'Hello from odin-app-template canister!';
    }
}
