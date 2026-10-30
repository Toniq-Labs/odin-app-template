# backend-login example

A minimal Node backend that verifies Odin Connect logins with
[odin-auth-verify](https://www.npmjs.com/package/odin-auth-verify). It is
optional: the template itself has no backend, and the app canister does not
need this (the IC already authenticates every canister call). Use it when an
off-chain service, such as an API, bot or admin tool, has to know which Odin
user is calling it.

It is not part of the pnpm workspace, so it does not affect `pnpm build` or CI.
It has its own `package.json` and is installed with npm.

## Files

- [`server.ts`](server.ts): `POST /login` verifies `{ delegation, timestamp,
  signature }` and returns `{ principal }`, or `401 { error: <code> }`.
  Plain `node:http`, no framework.
- [`login-client.ts`](login-client.ts): the browser side. It signs a fresh
  login with the Odin Connect session key and builds the request body. It has
  no imports, so you can copy it into `packages/frontend/src/odin/`.

## Run it

Requires Node.js 22.6 or later (the server runs as TypeScript through
`--experimental-strip-types`).

```sh
cd examples/backend-login
npm install
APP_CANISTER_ID=<your canister id> ALLOWED_ORIGIN=http://localhost:5173 npm start
```

| Variable | Required | Meaning |
|---|---|---|
| `APP_CANISTER_ID` | yes | The app canister id, the same value as the frontend's `VITE_APP_CANISTER_ID`. Logins whose delegation is not scoped to it are rejected. |
| `PORT` | no | Listen port. Default `8787`. |
| `ALLOWED_ORIGIN` | no | Frontend origin allowed by CORS. Unset means no CORS headers are sent. |

Then, in the frontend, once the user is connected:

```ts
import { buildLoginRequest } from './backendLogin';

const identity = user.getIdentity(); // null without requires_delegation
if (identity !== null) {
    const response = await fetch('http://localhost:8787/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(await buildLoginRequest(identity)),
    });
    const { principal } = await response.json();
}
```

## Before production

- **Issue a session.** The example only returns the principal. Your backend
  should set its own session (an HTTP-only cookie or a JWT) at that point, so
  the user does not sign a login for every request.
- **Share the replay guard.** `createMemoryReplayGuard()` only works for one
  process. With several instances, implement `ReplayGuard` on a shared store.
  See the [package README](https://github.com/Toniq-Labs/odin-auth-verify#verifying-a-login).
- **Change `LOGIN_MESSAGE_PREFIX`** in `login-client.ts` to a value unique to
  your app. The browser and the server must use the same value.
- **Set `ALLOWED_ORIGIN`** to your deployed frontend origin, never `*`.
