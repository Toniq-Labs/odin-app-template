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
    ledger[("Internal ledger<br/>StableBTreeMap<br/>(owner|tokenId) → balance")]
    odin["Odin ledger<br/>(one multiplexed ICRC ledger)"]

    user --> fe
    fe --> oc
    oc --> popup
    popup -->|icrc2_approve| odin
    fe -->|"deposit / withdraw / getBalances"| can
    can --> ledger
    can -->|"icrc2_transfer_from (deposit)<br/>icrc1_transfer (withdraw)"| odin
```

**Deposit**: the user approves the app canister as an ICRC-2 spender through the
Odin Fun popup; the canister then pulls the approved funds itself
(`icrc2_transfer_from` on the Odin ledger) and credits the user's internal
balance. It is permissionless and self-verifying — a credit is only recorded for
funds that actually settled into the canister.

**Withdraw**: the user calls `withdraw`; the canister debits the internal
balance (persisted *before* the transfer await) and sends the tokens back out on
the Odin ledger (`icrc1_transfer`), refunding on failure.

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
transfer. On withdraw the sender is the app canister, so the canister pays that
fee in BTC.

This template makes the **withdrawer pay** the fee — no maintainer-funded float,
not griefable. The flow:

1. On withdraw the frontend requests an ICRC-2 BTC approval (`icrcApprove`,
   token `"btc"`) for **2× the fee**.
2. `withdraw` pulls the fee from the caller's BTC (`icrc2_transfer_from`), then
   sends the tokens. The pulled BTC funds the outbound transfer's own fee, so
   the canister **nets zero BTC and needs no float**.

Why 2×: pulling BTC is itself a transfer, and the ledger charges the caller a
fee on that pull too (debited from `from`, per ICRC-2). So the withdrawer pays
the fee twice — once for the pull, once funding the send — and the approval must
cover both. See `ODIN_BTC_FEE` in
[`packages/canister/src/odin.ts`](packages/canister/src/odin.ts) and
[`packages/frontend/src/lib/fees.ts`](packages/frontend/src/lib/fees.ts).

> **Verify before mainnet:** `ODIN_BTC_FEE` is set to the documented 100 sats.
> Confirm it matches the live ledger fee — too low traps the first withdraw with
> `error 910`; too high leaves the canister a small BTC surplus.

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
   [`packages/canister/src/index.ts`](packages/canister/src/index.ts)) — a
   generic admin handle for any admin-gated endpoints you add later. Deposits are
   **not** owner-gated: `deposit` is permissionless and self-verifying (it pulls
   the caller's own pre-approved funds before crediting), so no trusted minter is
   needed.

4. Note the canister IDs printed on deploy; the frontend reads them from the
   generated `.env` (`output_env_file` in `dfx.json`).

5. **No canister BTC float needed** for withdrawals — the withdrawer pays the
   Odin ledger fee at withdraw time (see [Withdrawal fees](#withdrawal-fees)).
   Just confirm `ODIN_BTC_FEE` matches the live ledger fee before going live.

## How to extend

**Add support for a new token** — no code change needed. Tokens are identified
by their Odin token id (text); pass the id to `deposit` / `withdraw` /
`getBalance`. The ledger keys every balance by `(owner, tokenId)`, so new tokens
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
