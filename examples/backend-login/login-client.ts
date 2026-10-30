/**
 * Browser side of the backend login. Copy this into the frontend (for example
 * `packages/frontend/src/odin/backendLogin.ts`) and call it with
 * `user.getIdentity()` once the user is connected.
 *
 * It has no imports so it can be copied as is: `DelegationIdentityLike`
 * matches the `DelegationIdentity` that odin-connect returns.
 */

/**
 * Signed before the timestamp so a login made for this app cannot be replayed
 * against another app, or against Odin's own login. Change it for your fork,
 * and keep the browser and server values identical. It must not end with a
 * digit.
 */
export const LOGIN_MESSAGE_PREFIX = 'odin-app-template-login:v1\n';

export interface DelegationIdentityLike {
    sign(blob: Uint8Array): Promise<Uint8Array>;
    getDelegation(): { toJSON(): unknown };
}

export interface OdinLoginRequest {
    delegation: string;
    timestamp: string;
    signature: string;
}

function toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * Sign a fresh login with the session key. Build a new one for every login:
 * the server rejects a timestamp it has already accepted.
 */
export async function buildLoginRequest(
    identity: DelegationIdentityLike,
): Promise<OdinLoginRequest> {
    const timestamp = Date.now().toString();
    const signature = await identity.sign(
        new TextEncoder().encode(`${LOGIN_MESSAGE_PREFIX}${timestamp}`),
    );
    return {
        delegation: JSON.stringify(identity.getDelegation().toJSON()),
        timestamp,
        signature: toBase64(new Uint8Array(signature)),
    };
}
