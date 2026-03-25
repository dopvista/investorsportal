// ── src/lib/webauthn.js ───────────────────────────────────────────
// Client-side WebAuthn / Passkey helpers.
// Uses @simplewebauthn/browser to trigger the browser's native
// biometric prompt, then calls Supabase Edge Functions to verify
// the credential server-side.

import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
} from "@simplewebauthn/browser";

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const FUNCTIONS_URL = `${BASE}/functions/v1`;

export { browserSupportsWebAuthn };

async function callEdgeFunction(name, body, accessToken = null) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `${name} failed`);
  return data;
}

/**
 * Register a new passkey for the currently logged-in user.
 * Call this from the Profile page after the user is authenticated.
 *
 * @param {string} accessToken - Current session access_token
 * @param {string} [nickname]  - Human-readable device name, e.g. "iPhone 15"
 * @returns {{ verified: true }}
 */
export async function registerPasskey(accessToken, nickname = "My Device") {
  // 1. Get registration options (challenge) from server
  const options = await callEdgeFunction(
    "webauthn-register-options",
    {},
    accessToken
  );

  // 2. Ask the browser to create the credential (triggers Face ID / fingerprint)
  const registrationResponse = await startRegistration({ optionsJSON: options });

  // 3. Send the credential to the server for verification + storage
  return await callEdgeFunction(
    "webauthn-register-verify",
    { registrationResponse, nickname },
    accessToken
  );
}

/**
 * Authenticate using a previously registered passkey.
 * Call this from the Login page before the user has a session.
 *
 * @param {string} email - The user's email (used to look up their passkeys)
 * @returns {{ access_token, refresh_token, user }} - Ready-to-use session
 */
export async function loginWithPasskey(email) {
  // 1. Get authentication options (challenge) from server
  const options = await callEdgeFunction("webauthn-auth-options", { email });

  // 2. Ask the browser to use the matching credential (triggers Face ID / fingerprint)
  const authenticationResponse = await startAuthentication({ optionsJSON: options });

  // 3. Verify the credential server-side and get a Supabase session back
  return await callEdgeFunction("webauthn-auth-verify", {
    authenticationResponse,
    email,
  });
}

/**
 * Returns true if this browser supports WebAuthn / passkeys.
 */
export function isWebAuthnSupported() {
  return browserSupportsWebAuthn();
}
