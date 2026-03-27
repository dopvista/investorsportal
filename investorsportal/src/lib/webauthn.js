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
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_URL = `${BASE}/functions/v1`;

// localStorage key where we remember the last-used credential ID.
// This lets us skip the "Use saved passkey?" selector and go directly
// to the device's biometric/screen-lock prompt — just like banking apps.
const STORED_CRED_KEY = "ip_passkey_cred_id";

export { browserSupportsWebAuthn };

async function callEdgeFunction(name, body, accessToken = null) {
  const headers = { "Content-Type": "application/json", "apikey": KEY };
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

/** Read the credential ID remembered from the last login/registration. */
export function getStoredPasskeyCredentialId() {
  try { return localStorage.getItem(STORED_CRED_KEY) || null; } catch { return null; }
}

/** Forget the stored credential (e.g. after the passkey is deleted). */
export function clearStoredPasskeyCredentialId() {
  try { localStorage.removeItem(STORED_CRED_KEY); } catch { /* ignore */ }
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
  const result = await callEdgeFunction(
    "webauthn-register-verify",
    { registrationResponse, nickname },
    accessToken
  );

  // Remember credential ID so next login goes straight to biometric (no selector)
  try { localStorage.setItem(STORED_CRED_KEY, registrationResponse.id); } catch { /* ignore */ }

  return result;
}

/**
 * Authenticate using a previously registered passkey.
 * No email required — goes directly to the device's biometric/screen-lock prompt.
 *
 * @param {string} [email] - Optional. Only needed if no credential is stored locally.
 * @returns {{ access_token, refresh_token, user }} - Ready-to-use session
 */
export async function loginWithPasskey(email) {
  // If we remember a credential ID from a previous session, pass it so the
  // server includes it in allowCredentials. The browser then skips the
  // "Use saved passkey?" selector and goes straight to fingerprint/face.
  const storedCredId = getStoredPasskeyCredentialId();

  const optionsResponse = await callEdgeFunction("webauthn-auth-options", {
    email: email || undefined,
    credentialId: storedCredId || undefined,
  });

  // Extract challengeId before passing the rest as WebAuthn options
  const { challengeId, ...optionsJSON } = optionsResponse;

  // Trigger the biometric prompt
  const authenticationResponse = await startAuthentication({ optionsJSON });

  // Remember this credential for next time
  try { localStorage.setItem(STORED_CRED_KEY, authenticationResponse.id); } catch { /* ignore */ }

  // Verify server-side and get a Supabase session
  return await callEdgeFunction("webauthn-auth-verify", {
    authenticationResponse,
    email: email || undefined,
    challengeId,
  });
}

/**
 * Delete a passkey by ID.
 * Calls the delete-passkey edge function with the caller's access token.
 *
 * @param {string} id          - Passkey row ID
 * @param {string} accessToken - Current session access_token
 */
export async function deletePasskey(id, accessToken) {
  return callEdgeFunction("delete-passkey", { id }, accessToken);
}

/**
 * Returns true if this browser supports WebAuthn / passkeys.
 */
export function isWebAuthnSupported() {
  return browserSupportsWebAuthn();
}
