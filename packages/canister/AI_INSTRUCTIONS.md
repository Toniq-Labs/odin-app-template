# AI_INSTRUCTIONS — `@odin-app/canister`

Rules for working inside the Azle canister package. Read alongside the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this package is

An Azle (TypeScript → wasm) canister implementing a **multi-token internal
ledger**: it tracks an internal balance per `(principal, token)` pair and
exposes deposit/withdraw/balance endpoints. Tokens are identified by their
ICRC-1 canister principal.

```
src/
  index.ts      # canister class — endpoints + StableBTreeMap wiring
  ledger.ts     # pure ledger logic (key encoding, validation, balance math)
  icrc1.ts      # minimal ICRC-1 icrc1_transfer client
  ledger.test.ts# vitest unit tests for the pure logic
```

## Hard rules

1. **Do not edit the hardened ledger core** in `ledger.ts` between the
   `BEGIN/END HARDENED LEDGER CORE` markers, nor the `⚠️ AI-GUARD` sections in
   `index.ts`, without explicit maintainer sign-off. These guard real funds.
2. **Preserve checks-effects-interactions in `withdraw`.** Debit and persist the
   balance *before* `await icrc1Transfer(...)`. Refund on failure. Never move the
   transfer before the debit — Azle processes other messages at await points, so
   that ordering enables a reentrancy double-withdraw.
3. **Preserve interaction-before-effect in `deposit`.** Pull the funds via
   `icrc2_transfer_from` *before* crediting the internal balance. It is the only
   balance-mint path; crediting before the pull settles = unbacked balances.
4. **Amounts are `bigint`** (Candid `Nat`). Never represent balances as `number`
   — precision loss is a fund-loss bug.
5. **Validate every update-call input.** Reuse `validateAmount`; reject zero,
   negative, and over-max values.

## Patterns to follow

- Put new pure logic in `ledger.ts` (or a new runtime-free module) and unit-test
  it. Anything importing from `azle` cannot run under plain vitest.
- New endpoints: stable-mode decorators (`@query` / `@update`) with explicit
  `IDL` param and return types. Use `msgCaller()` for the caller principal.
- Cross-canister calls: stable `call(canisterId, method, { args, paramIdlTypes,
  returnIdlType })`. Decode variant results and handle the `Err` branch.
- StableBTreeMap: each map needs a **unique, stable memory id**. Current ids:
  `0` = ledger, `1` = config. Never reuse or renumber an existing id — it
  corrupts persisted state across upgrades.

## Build & test

```sh
pnpm --filter @odin-app/canister test          # vitest
dfx build canister --check                      # compile to wasm (run from repo root)
```

Type-checking the canister with plain `tsc` fails because Azle ships raw `.ts`
that doesn't satisfy a consumer's strict config — that's expected. The Azle
compiler (`dfx build`) is the real type gate; don't "fix" it by loosening
`tsconfig.json`.

## Gotchas

- The canister builds via dfx, which invokes Azle's `npm exec`. The repo's
  `.npmrc` sets `node-linker=hoisted` so those binaries resolve under pnpm — do
  not remove it.
- Stable mode only. Do not switch the canister to `custom.experimental` unless a
  feature genuinely requires it (it pulls extra GitHub-hosted deps).
