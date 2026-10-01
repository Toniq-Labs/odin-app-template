# AI_INSTRUCTIONS — `@odin-app/frontend`

Rules for working inside the frontend package. Read alongside the root
[`CLAUDE.md`](../../CLAUDE.md).

## What this package is

A Vite + React + TypeScript app — the reference UI for an Odin Fun app: log in
with Odin Connect, show the user's principal and internal balances, and drive
the deposit/withdraw flows against the canister.

```
src/
  main.tsx      # React entry
  App.tsx       # root component
index.html      # Vite html entry
vite.config.ts  # build config (outDir: dist → served by the asset canister)
```

Stack: React 19, Vite 8, TypeScript strict. Built output (`dist/`) is what the
dfx `frontend` asset canister serves.

## What you MAY change freely

- Components, hooks, layout, styling, copy, routing
- Adding UI state, forms, validation, loading/error handling
- Frontend dependencies (keep the bundle reasonable)

## Hard rules

1. **Never trust the client for accounting.** The canister is the source of
   truth for balances. The UI displays and requests; it must not assume a
   transfer succeeded until the canister confirms. Show pending/failed states.
2. **Amounts are `bigint`.** Token amounts use ICRC-1 `Nat`; keep them `bigint`
   end-to-end and only format to a display string at the render edge. Do not do
   balance math in `number` (precision loss).
3. **Do not hardcode secrets or canister IDs.** Read canister IDs from the
   generated env (dfx writes `.env`) / declarations, not string literals.
4. **Keep types honest.** Strict mode is on; do not add `any` or `// @ts-ignore`
   to silence real type errors from canister bindings.
5. **Every awaited SDK action must be resumable.** In redirect mode (wallet
   in-app browsers, `VITE_ODIN_CONNECT_MODE`) `connect()` and every
   `user.*` action navigate this tab to Odin and the awaited promise never
   returns. Describe the step that follows an approval as a `ResumeState`
   (`src/odin/resume.ts`), pass it as `returnState`, and run it from
   `useResumeFlow` on the next page load. Never put the continuation only in
   code after the `await`.

## Conventions

- Function components + hooks. No class components.
- 2-space indentation, single quotes, semicolons — match existing files.
- Keep `App.tsx` thin; extract flows (auth, deposit, withdraw) into their own
  components/hooks as they grow.
- Prefer the `odin-connect` SDK for auth and canister actor wiring over rolling
  your own agent setup.

## Build & test

```sh
pnpm --filter @odin-app/frontend dev      # local dev server
pnpm --filter @odin-app/frontend build    # tsc -b && vite build → dist/
pnpm --filter @odin-app/frontend typecheck
```

Keep `pnpm build:frontend` and `pnpm typecheck` green — CI runs both.
