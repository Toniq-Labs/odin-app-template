# odin-app-template

Reference canister app template for building on **Odin Fun**. Fork it, deploy it, and you have a working app with Odin Connect auth, deposit/withdraw flows, and an internal multi-token ledger.

## Stack

- **Canister**: [Azle](https://github.com/demergent-labs/azle) (TypeScript, Internet Computer)
- **Frontend**: React + TypeScript + Vite, [odin-connect](https://www.npmjs.com/package/odin-connect) SDK
- **Tooling**: dfx, pnpm workspace

## Architecture

```mermaid
flowchart LR
    user([User])
    fe["Frontend<br/>(React + Vite)"]
    oc["odin-connect SDK"]
    popup["Odin Fun<br/>approval popup"]
    can["App canister<br/>(Azle)"]
    ledger[("Internal ledger<br/>StableBTreeMap<br/>(owner|token) → balance")]
    icrc["ICRC-1 token<br/>canisters"]

    user --> fe
    fe --> oc
    oc --> popup
    popup -->|approved transfer| icrc
    fe -->|"notifyDeposit / withdraw / getBalances"| can
    can --> ledger
    can -->|"icrc1Transfer (withdraw)"| icrc
```

**Deposit**: the user approves a transfer through the Odin Fun popup; the token
lands in the app canister; a trusted owner then calls `notifyDeposit` to credit
the user's internal balance.

**Withdraw**: the user calls `withdraw`; the canister debits the internal
balance (persisted *before* the transfer await) and sends the tokens back out
via ICRC-1, refunding on failure.

## Layout

```
packages/
  canister/   # Azle canister — internal multi-token ledger
  frontend/   # Vite + React app — Odin Connect auth + deposit/withdraw UI
dfx.json      # canister (azle) + frontend (asset) canister config
```

## Prerequisites

- [Node.js](https://nodejs.org) 22+ (see `.nvmrc`)
- [pnpm](https://pnpm.io) 10+
- [dfx](https://internetcomputer.org/docs/current/developer-docs/getting-started/install) 0.31+
- [Rust](https://www.rust-lang.org/tools/install) + `wasm32-unknown-unknown` target (required by Azle)

```sh
rustup target add wasm32-unknown-unknown
```

## Quick start

```sh
pnpm install          # install workspace deps
dfx start --clean --background
dfx deploy            # build + deploy canister and frontend
```

Frontend dev server:

```sh
pnpm dev:frontend
```

## Scripts

| Command                | Description                          |
| ---------------------- | ------------------------------------ |
| `pnpm build`           | Build all workspace packages         |
| `pnpm build:canister`  | Build the Azle canister              |
| `pnpm build:frontend`  | Build the frontend                   |
| `pnpm dev:frontend`    | Start the Vite dev server            |
| `pnpm typecheck`       | Type-check all packages              |
| `pnpm test`            | Run unit tests (ledger)              |

## Canister API

| Endpoint        | Kind   | Description                                                        |
| --------------- | ------ | ----------------------------------------------------------------- |
| `notifyDeposit` | update | Owner-only. Credit a user's internal balance after a deposit.     |
| `deposit`       | update | Pull pre-approved funds from the Odin ledger and credit the caller. |
| `withdraw`      | update | Debit the caller's balance and send tokens back via the Odin ledger. |
| `getBalance`    | query  | Caller's internal balance for one token.                          |
| `getBalances`   | query  | All of the caller's `(token, balance)` pairs.                     |
| `getOwner`      | query  | The configured owner principal, or empty if not yet initialized.  |

Tokens are identified by their **Odin token id** (text), not an ICRC ledger
principal — every Odin token shares one ledger and is addressed by subaccount
(`odin_token_pointer`). Balances are keyed by `(owner, tokenId)` and stored in
stable memory, so they survive upgrades.

### Withdrawal fees

The Odin ledger charges a flat **BTC fee (100 sats) to the sender** on every
transfer. On withdraw the sender is the app canister, so the canister must hold
a small BTC float on the Odin ledger — otherwise withdrawals trap with
`error 910: Insufficient BTC funds to cover transfer fee`.

This template **subsidizes** the fee from that float for simplicity. Fund the
canister by transferring some sats to its principal from the Odin app, then top
it up as needed.

> **Production note:** subsidizing is griefable (spam withdrawals drain the
> float). A production app should make the **withdrawer pay** — track a per-user
> BTC balance in the internal ledger and debit the 100-sat fee on each withdraw
> (refund on failure, same as the token debit). See the `NOTE (fees)` comment on
> `withdraw` in [`packages/canister/src/index.ts`](packages/canister/src/index.ts).

## Deploy to mainnet

1. Make sure you have a cycles-funded identity (`dfx identity get-principal`,
   then fund it with cycles — see the
   [cycles docs](https://internetcomputer.org/docs/current/developer-docs/getting-started/cycles/cycles-wallet)).

2. Build and deploy to the IC:

   ```sh
   pnpm build                       # frontend dist + canister type check
   dfx deploy --network ic          # deploy canister + frontend asset canister
   ```

3. The deploying principal is recorded as the **owner** (see `@init` in
   [`packages/canister/src/index.ts`](packages/canister/src/index.ts)). Only the
   owner may call `notifyDeposit`, so deposits should be credited by a trusted
   minter that independently verifies the transfer settled. Keep this identity
   secure.

4. Note the canister IDs printed on deploy; the frontend reads them from the
   generated `.env` (`output_env_file` in `dfx.json`).

5. **Fund the canister with BTC** so withdrawals can pay the Odin ledger fee
   (see [Withdrawal fees](#withdrawal-fees)). From the Odin app, transfer some
   sats to the app canister's principal; otherwise `withdraw` traps with
   `error 910`.

## How to extend

**Add support for a new token** — no code change needed. Tokens are any ICRC-1
canister principal; pass the principal to `notifyDeposit` / `withdraw` /
`getBalance`. The ledger keys every balance by `(owner, token)`, so new tokens
work out of the box.

**Add a new canister endpoint** — add a `@query` / `@update` method in
[`packages/canister/src/index.ts`](packages/canister/src/index.ts). ⚠️ Add code
*around* the hardened ledger core, never inside the `BEGIN/END HARDENED LEDGER
CORE` markers in
[`packages/canister/src/ledger.ts`](packages/canister/src/ledger.ts). See
[`CLAUDE.md`](CLAUDE.md) for the full guardrails.

**Frontend changes** — UI, components, and styling under
[`packages/frontend/src`](packages/frontend/src) are free to modify. Auth and
flows are built on the [odin-connect](https://www.npmjs.com/package/odin-connect)
SDK.
