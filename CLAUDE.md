# CLAUDE.md — AI assistant guide for odin-app-template

This file tells AI coding assistants (Claude Code and others) how to work in
this repository safely. **Read it before editing.** Per-package rules live in
`packages/canister/AI_INSTRUCTIONS.md` and `packages/frontend/AI_INSTRUCTIONS.md`.

This is a **reference template** that third-party developers fork to build apps
on Odin Fun. Clarity and correctness matter more than cleverness — code here is
copied and learned from.

## Project shape

```
packages/
  canister/   # Azle canister — multi-token internal ledger (TypeScript → wasm)
  frontend/   # Vite + React app — Odin Connect auth + deposit/withdraw UI
dfx.json      # canister (azle) + frontend (asset) canister config
```

Stack: Azle 0.33 (stable mode) · React 19 + Vite 8 · pnpm workspace · dfx · Node 22.

## What you MAY modify freely

- Frontend UI, components, styling, copy
- README and docs
- Adding new canister query/update endpoints **that do not touch balance math**
- Tests (adding coverage is always welcome)
- Tooling/config, as long as builds and CI stay green

## What you MAY NOT modify without explicit maintainer sign-off

- **The hardened ledger core** in `packages/canister/src/ledger.ts`, between the
  `// ── BEGIN HARDENED LEDGER CORE ──` / `// ── END HARDENED LEDGER CORE ──`
  markers. These functions (`validateAmount`, `credit`, `debit`) enforce the
  balance-accounting invariants that guard real funds.
- **The checks-effects-interactions ordering** in `withdraw` (`index.ts`): the
  ledger is debited and persisted *before* the ICRC-1 transfer await, and
  refunded on failure. Reordering opens a reentrancy double-withdraw window.
- **The interaction-before-effect ordering** in `deposit` (`index.ts`): the
  funds are pulled in via `icrc2_transfer_from` *before* the internal credit, so
  a balance is only credited for funds that actually settled. Crediting before
  the pull await resolves lets anyone mint unbacked balances.

Sections that must not change are marked inline with `⚠️ AI-GUARD` and the
`AI: do not modify this section` sentinel. If a task seems to require touching
guarded code, STOP and surface it to a human instead of editing.

## Invariants (never violate)

1. Every credited balance is backed by a real deposit. `deposit` is the only
   mint path; it credits only funds it has already pulled into this canister via
   `icrc2_transfer_from` (interaction-before-effect).
2. A withdrawal can never exceed the caller's internal balance (`debit` rejects
   overdrafts).
3. Balances are unsigned and bounded (`0 .. MAX_BALANCE`); no overflow.
4. State mutations happen before cross-canister awaits; failures refund.

## Conventions

- TypeScript, strict mode. No `any`. Prefer explicit return types on exported
  functions.
- Money/amounts are `bigint` (ICRC-1 `Nat`). Never use `number` for balances.
- Keep pure logic (no IC runtime) in separate modules so it stays unit-testable
  (see `ledger.ts`).
- 4-space indentation, single quotes, semicolons — match existing files.
- Conventional Commits for messages.

## Build / test / deploy

```sh
pnpm install                 # hoisted node-linker (.npmrc) — required for Azle
pnpm typecheck               # frontend tsc; canister types gated by Azle compiler
pnpm test                    # vitest (ledger unit tests)
pnpm build                   # frontend dist + dfx build canister --check

# Local replica
dfx start --clean --background
dfx deploy                   # builds + deploys canister and frontend
```

CI (`.github/workflows/ci.yml`) runs typecheck, test, frontend build, and
`dfx build canister --check` on every push/PR. Do not merge red.

## When in doubt

Ask. This template is security-sensitive by design — a plausible-looking
"simplification" of the ledger can lose user funds. Prefer adding code over
changing guarded code, and call out anything that smells like it needs a human.
