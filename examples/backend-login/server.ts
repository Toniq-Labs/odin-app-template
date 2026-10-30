import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

import {
    OdinLoginError,
    createMemoryReplayGuard,
    createOdinLoginVerifier,
} from 'odin-auth-verify';

import { LOGIN_MESSAGE_PREFIX } from './login-client.ts';

/**
 * Minimal backend that verifies Odin Connect logins with `odin-auth-verify`.
 *
 * POST /login with `{ delegation, timestamp, signature }` (see
 * `login-client.ts`) returns `{ principal }` once the login is verified. A
 * real backend would issue its own session (cookie, JWT) for that principal
 * here; this example only proves who the caller is.
 */

const APP_CANISTER_ID = process.env.APP_CANISTER_ID ?? '';
const PORT = Number(process.env.PORT ?? 8787);
// Origin of the frontend, e.g. http://localhost:5173. Unset: no CORS headers.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '';
// Delegation chains with canister-signature roots carry a certificate, so
// allow a few KiB per hop. Anything larger is not a login.
const MAX_BODY_BYTES = 64 * 1024;

if (APP_CANISTER_ID === '') {
    throw new Error('APP_CANISTER_ID is not set — use the canister id from dfx');
}

// Built once at startup so a bad APP_CANISTER_ID fails here, not on the first
// request. The in-memory replay guard is correct for one process only; with
// several instances, implement `ReplayGuard` on a shared store (Redis
// `SET key 1 NX PXAT expiresAtMs`, or a table with a unique key).
const verifyLogin = createOdinLoginVerifier({
    appCanisterId: APP_CANISTER_ID,
    messagePrefix: LOGIN_MESSAGE_PREFIX,
    replayGuard: createMemoryReplayGuard(),
});

class BodyTooLargeError extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = chunk as Buffer;
        size += buffer.length;
        if (size > MAX_BODY_BYTES) throw new BodyTooLargeError();
        chunks.push(buffer);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function send(res: ServerResponse, status: number, body: object): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
}

async function handleLogin(
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> {
    let body: unknown;
    try {
        body = await readJson(req);
    } catch (error) {
        if (error instanceof BodyTooLargeError) {
            send(res, 413, { error: 'BODY_TOO_LARGE' });
        } else {
            send(res, 400, { error: 'INVALID_JSON' });
        }
        return;
    }

    try {
        // `verifyLogin` checks the shape of the untyped body itself and
        // rejects a malformed one as INVALID_INPUT.
        const { principal } = await verifyLogin(
            body as Parameters<typeof verifyLogin>[0],
        );
        send(res, 200, { principal });
    } catch (error) {
        if (error instanceof OdinLoginError) {
            // Expected for bad or replayed logins. `code` is safe to return.
            send(res, 401, { error: error.code });
            return;
        }
        throw error;
    }
}

const server = createServer((req, res) => {
    if (ALLOWED_ORIGIN !== '') {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Vary', 'Origin');
    }

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.method !== 'POST' || req.url !== '/login') {
        send(res, 404, { error: 'NOT_FOUND' });
        return;
    }

    handleLogin(req, res).catch((error: unknown) => {
        console.error(error);
        if (!res.headersSent) send(res, 500, { error: 'INTERNAL' });
    });
});

server.listen(PORT, () => {
    console.log(`backend-login listening on http://localhost:${PORT}`);
});
