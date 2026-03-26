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

const BASE          = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY           = import.meta.env.VITE_SUPABASE_ANON_KEY;
const FUNCTIONS_URL = `${BASE}/functions/v1`;

export { browserSupportsWebAuthn };

// ── localStorage helpers for biometric-first login ────────────────
const PASSKEY_STORAGE_KEY = "ip_passkey_info";

export function getStoredPasskeyInfo() {
  try {
    const raw = localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.email ? parsed : null;
  } catch { return null; }
}

export function storePasskeyInfo(email, credentialId) {
  try { localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify({ email, credentialId })); } catch {}
}

export function clearStoredPasskeyInfo() {
  try { localStorage.removeItem(PASSKEY_STORAGE_KEY); } catch {}
}

// ── Friendly platform name (avoids deprecated navigator.platform) ──
export function getDeviceName() {
  try {
    // Modern browsers support userAgentData
    const platform = navigator.userAgentData?.platform;
    if (platform) return platform;
  } catch {}
  // Fallback: derive from userAgent string
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad/.test(ua))          return "iPhone / iPad";
  if (/Android/.test(ua))              return "Android";
  if (/Mac/.test(ua))                  return "Mac";
  if (/Windows/.test(ua))              return "Windows";
  if (/Linux/.test(ua))                return "Linux";
  return "My Device";
}

// ── Edge function bridge ──────────────────────────────────────────
async function callEdgeFunction(name, body, accessToken = null) {
  const headers = { "Content-Type": "application/json", "apikey": KEY };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    throw new Error("Network error — check your connection and try again.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${name} failed (${res.status})`);
  return data;
}

/**
 * Register a new passkey for the currently logged-in user.
 * @param {string} accessToken  - Current session access_token
 * @param {string} [nickname]   - Human-readable device name
 * @returns {{ verified: true, credentialId: string }}
 */
export async function registerPasskey(accessToken, nickname = "My Device") {
  // 1. Get registration options (challenge) from server
  const options = await callEdgeFunction("webauthn-register-options", {}, accessToken);

  // 2. Trigger browser biometric prompt
  let registrationResponse;
  try {
    registrationResponse = await startRegistration({ optionsJSON: options });
  } catch (err) {
    const msg = err.name || err.message || "";
    if (msg === "NotAllowedError" || msg.includes("cancel") || msg.includes("abort") || msg.includes("not allowed")) {
      throw new Error("cancelled");
    }
    if (msg === "InvalidStateError" || msg.includes("already registered")) {
      throw new Error("This device is already registered as a passkey.");
    }
    throw new Error(err.message || "Biometric setup was cancelled or failed.");
  }

  // 3. Verify and store on server
  const result = await callEdgeFunction(
    "webauthn-register-verify",
    { registrationResponse, nickname },
    accessToken
  );

  return { ...result, credentialId: registrationResponse.id };
}

/**
 * Authenticate using a previously registered passkey.
 * @param {string} [email] - User's email. If omitted, uses stored passkey info (discoverable flow).
 * @returns {{ access_token, refresh_token, expires_in, token_type, user }}
 */
export async function loginWithPasskey(email) {
  const resolvedEmail = email || getStoredPasskeyInfo()?.email;
  if (!resolvedEmail) {
    throw new Error("No passkeys found for this device. Please sign in with email & password.");
  }

  // 1. Get authentication options (challenge) from server
  const options = await callEdgeFunction("webauthn-auth-options", { email: resolvedEmail });

  // 2. Trigger browser biometric prompt
  let authenticationResponse;
  try {
    authenticationResponse = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    const msg = err.name || err.message || "";
    if (msg === "NotAllowedError" || msg.includes("cancel") || msg.includes("abort") || msg.includes("not allowed")) {
      throw new Error("cancelled");
    }
    if (msg.includes("no credentials") || msg.includes("not found") || msg.includes("No available")) {
      throw new Error("no passkeys found");
    }
    throw new Error(err.message || "Biometric sign-in was cancelled.");
  }

  // 3. Verify server-side → returns Supabase session
  return await callEdgeFunction("webauthn-auth-verify", { authenticationResponse, email: resolvedEmail });
}

/**
 * Returns true if this browser supports WebAuthn / passkeys.
 */
export function isWebAuthnSupported() {
  return browserSupportsWebAuthn();
}
