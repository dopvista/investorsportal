// ── src/lib/supabase.js ────────────────────────────────────────────

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!BASE || !KEY) {
  console.error("❌ Missing Supabase env vars. BASE:", BASE, "KEY:", KEY ? "set" : "missing");
} else {
  console.log("✅ Supabase connected to:", BASE);
}

// ══════════════════════════════════════════════════════════════════
// ── PERFORMANCE: IN-MEMORY SESSION CACHE
// ══════════════════════════════════════════════════════════════════
// getSession() previously parsed JSON from localStorage on every call.
// This in-memory mirror is kept in sync by saveSession / clearSession
// so localStorage is only touched when the value actually changes.

let _sessionCache = undefined; // undefined = not yet loaded; null = no session

export function getSession() {
  if (_sessionCache !== undefined) return _sessionCache;
  try {
    _sessionCache = JSON.parse(localStorage.getItem("sb_session") || "null");
    return _sessionCache;
  } catch {
    _sessionCache = null;
    return null;
  }
}

function saveSession(s) {
  _sessionCache = s;
  try { localStorage.setItem("sb_session", JSON.stringify(s)); } catch {}
}

/** Persist a session returned from a custom auth flow (e.g. biometric login). */
export function sbSaveSession(s) { saveSession(s); }

function clearSession() {
  _sessionCache = null;
  // Clear response cache AND in-flight requests on logout — prevents
  // stale data from a previous user's session leaking to a new one.
  _responseCache.clear();
  _inFlight.clear();
  try { localStorage.removeItem("sb_session"); } catch {}
}

function token() { return getSession()?.access_token || KEY; }

// ══════════════════════════════════════════════════════════════════
// ── PERFORMANCE: GET RESPONSE CACHE + IN-FLIGHT DEDUPLICATION
// ══════════════════════════════════════════════════════════════════
// _responseCache: short-lived TTL store for stable endpoints (roles,
//   brokers, companies). Keyed by full URL.
// _inFlight: if an identical GET URL is already in-flight, callers
//   share that one promise instead of firing a duplicate request.
//   Critical during app boot when multiple components mount at once.

const _responseCache = new Map(); // url → { data, expires }
const _inFlight      = new Map(); // url → Promise<data>

// Periodic sweep — removes expired cache entries to prevent accumulation
// over long-running sessions. Runs every 60 seconds.
const _cacheCleanTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _responseCache) {
    if (now > v.expires) _responseCache.delete(k);
  }
}, 60_000);

// Allow the timer to be GC'd if the module is ever torn down (e.g. tests)
if (typeof _cacheCleanTimer?.unref === "function") _cacheCleanTimer.unref();

// Invalidate all cache entries whose URL starts with a given prefix.
// Called automatically by mutation functions (insert/update/delete).
function _invalidateCache(urlPrefix) {
  for (const k of _responseCache.keys()) {
    if (k.startsWith(urlPrefix)) _responseCache.delete(k);
  }
}

// ══════════════════════════════════════════════════════════════════
// ── SECURITY UTILITIES
// ══════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT_MS = 15_000;
const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Request timeout wrapper ────────────────────────────────────────
async function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("Request timed out. Check your connection and try again.");
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

// ── Transient error retry — 429 / 503 / 502 / network blips ────────
// Retries up to maxRetries times with linear backoff (300 ms, 600 ms).
// Timeouts and permanent errors are NOT retried.
async function _fetchWithTransientRetry(url, opts, timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = 2) {
  let lastRes;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await _sleep(300 * attempt);
    try {
      const res = await fetchWithTimeout(url, opts, timeoutMs);
      // Retry only on truly transient status codes
      if (res.status === 429 || res.status === 502 || res.status === 503) {
        lastRes = res;
        continue;
      }
      return res; // success or a permanent error — let the caller handle it
    } catch (e) {
      // Timeout: do not retry (user is already waiting)
      if (e.message?.includes("timed out")) throw e;
      lastRes = null;
      if (attempt === maxRetries) throw e;
    }
  }
  // All retries exhausted — return last transient response so caller can
  // read the status/body and throw a useful error message.
  if (lastRes) return lastRes;
  throw new Error("Request failed after retries. Please check your connection.");
}

// ── Safe JWT sub extraction ────────────────────────────────────────
// Handles URL-safe base64, padding, and malformed tokens without throwing.
function safeDecodeJwtSub(tok) {
  try {
    const payload = tok?.split(".")[1];
    if (!payload) return null;
    const b64 = payload
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(payload.length / 4) * 4, "=");
    return JSON.parse(atob(b64))?.sub ?? null;
  } catch {
    return null;
  }
}

// ── Client-side auth rate limiting ────────────────────────────────
// This is a UI-layer guard only — the real rate limit is server-side.
// The Map has at most 3 keys (signup/signin/reset) — no memory leak.
const _authAttempts = new Map();
function enforceAuthRateLimit(key, windowMs = 800) {
  const now  = Date.now();
  const last = _authAttempts.get(key) ?? 0;
  if (now - last < windowMs) throw new Error("Too many attempts. Please wait a moment and try again.");
  _authAttempts.set(key, now);
}

// ── Sanitise error messages ────────────────────────────────────────
// Strips raw DB internals before any message reaches the UI.
const _SAFE_CODES = {
  "42501": "Permission denied by the database security policy.",
  "23505": "A record with that value already exists (duplicate).",
  "23503": "This record is linked to other data and cannot be deleted.",
  "22P02": "Invalid input format.",
};

function sanitiseError(j, fallback) {
  if (!j || typeof j !== "object") return fallback;
  if (j.code && _SAFE_CODES[j.code]) return _SAFE_CODES[j.code];
  return j.message || j.error || fallback; // never expose hint/details/column names
}

// ══════════════════════════════════════════════════════════════════
// ── RESPONSE / ERROR HELPERS
// ══════════════════════════════════════════════════════════════════

async function parseResponse(res, fallbackMsg) {
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error(fallbackMsg); }
  if (!res.ok) {
    const msg = (data.code ? humanizeCode(data.code) : null)
      || data.msg
      || data.error_description
      || data.message
      || data.error
      || fallbackMsg;
    throw new Error(msg);
  }
  return data;
}

function humanizeCode(code) {
  const map = {
    email_exists:               "Email already registered.",
    phone_exists:               "Phone number already registered.",
    bad_jwt:                    "Session expired. Please log in again.",
    not_admin:                  "Admin access required.",
    user_not_found:             "User not found.",
    email_not_confirmed:        "Email not confirmed.",
    invalid_credentials:        "Wrong email or password.",
    email_address_invalid:      "Invalid email address.",
    weak_password:              "Password too weak. Use at least 8 characters.",
    over_request_rate_limit:    "Too many requests. Try again shortly.",
    over_email_send_rate_limit: "Email limit reached. Try again later.",
    "42501":                    "Permission denied by database security policy.",
    "23505":                    "A record with that value already exists.",
  };
  return map[code] || null;
}

// ══════════════════════════════════════════════════════════════════
// ── HEADERS
// ══════════════════════════════════════════════════════════════════

const headers = (tok) => ({
  "Content-Type":  "application/json",
  "apikey":        KEY,
  "Authorization": `Bearer ${tok || KEY}`,
  "Prefer":        "return=representation",
});

// ══════════════════════════════════════════════════════════════════
// ── TOKEN REFRESH — SINGLETON LOCK
// ══════════════════════════════════════════════════════════════════
// Multiple simultaneous 401 responses used to each fire their own
// refresh, invalidating each other's new tokens. The singleton lock
// ensures only one refresh runs at a time; all others wait on it.

let _refreshPromise = null;

export async function refreshSession() {
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefreshSession().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function _doRefreshSession() {
  const refreshToken = getSession()?.refresh_token;
  if (!refreshToken) { clearSession(); return null; }
  try {
    const res = await fetchWithTimeout(
      `${BASE}/auth/v1/token?grant_type=refresh_token`,
      { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY }, body: JSON.stringify({ refresh_token: refreshToken }) },
      10_000
    );
    if (!res.ok) {
      // 4xx = auth error (token revoked/expired) → session is dead
      // 5xx = server error → preserve session for retry later
      if (res.status >= 400 && res.status < 500) clearSession();
      return null;
    }
    const data = await res.json();
    saveSession(data);
    return data.access_token;
  } catch {
    // Network error or timeout — preserve session so the user isn't
    // logged out just because of a transient connectivity blip.
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════
// ── CORE FETCH WRAPPERS
// ══════════════════════════════════════════════════════════════════

// ── fetchWithAuthRetry — for all mutating requests (POST/PATCH/DELETE)
// Includes: transient retry, one auth retry on 401, error sanitisation.
async function fetchWithAuthRetry(url, options = {}, fallbackMsg = "Request failed") {
  let res = await _fetchWithTransientRetry(url, options);

  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) throw new Error("Session expired. Please log in again.");
    res = await _fetchWithTransientRetry(url, {
      ...options,
      headers: { ...(options.headers || {}), apikey: KEY, Authorization: `Bearer ${newToken}` },
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = fallbackMsg;
    try { msg = sanitiseError(JSON.parse(text), fallbackMsg); } catch {}
    throw new Error(msg);
  }

  return res;
}

// ── _fetchGET — for all read (GET) requests
// Adds: TTL response cache + in-flight deduplication on top of
// fetchWithAuthRetry. Returns parsed JSON directly.
//
// ttlMs = 0  → no cache (default — live data)
// ttlMs > 0  → cache response for ttlMs milliseconds
async function _fetchGET(url, fallbackMsg, ttlMs = 0) {
  // 1. TTL cache hit
  if (ttlMs > 0) {
    const cached = _responseCache.get(url);
    if (cached && Date.now() < cached.expires) return cached.data;
  }

  // 2. In-flight deduplication — join existing request if one is running
  const existing = _inFlight.get(url);
  if (existing) return existing;

  // 3. Fire new request
  const promise = (async () => {
    const res  = await fetchWithAuthRetry(url, { headers: headers(token()) }, fallbackMsg);
    const data = await res.json();
    if (ttlMs > 0) _responseCache.set(url, { data, expires: Date.now() + ttlMs });
    return data;
  })().finally(() => _inFlight.delete(url));

  _inFlight.set(url, promise);
  return promise;
}

// ══════════════════════════════════════════════════════════════════
// ── PERFORMANCE: SHARED USER-NAME RESOLVER
// ══════════════════════════════════════════════════════════════════
// Previously copy-pasted verbatim inside sbGetTransactions AND
// sbGetTransactionsByIds. Now a single function used by both.
// Resolves an array of user UUIDs → { uuid: full_name } map.
// Name lookups are themselves deduplicated via _fetchGET.

async function resolveUserNames(uids) {
  const unique = [...new Set(uids.filter(Boolean))];
  if (!unique.length) return {};
  const idList = `(${unique.map((id) => `"${id}"`).join(",")})`;
  try {
    const profiles = await _fetchGET(
      `${BASE}/rest/v1/profiles?id=in.${idList}&select=id,full_name`,
      "Failed to fetch profile names"
      // No TTL — profiles can change, but failures are non-critical
    );
    return Object.fromEntries(profiles.map((p) => [p.id, p.full_name || null]));
  } catch {
    return {}; // names are non-critical — transactions still load without them
  }
}

// Attach resolved names to a transaction row
function _attachNames(row, nameMap) {
  return {
    ...row,
    created_by_name:   nameMap[row.created_by]   || null,
    confirmed_by_name: nameMap[row.confirmed_by] || null,
    verified_by_name:  nameMap[row.verified_by]  || null,
    rejected_by_name:  nameMap[row.rejected_by]  || null,
  };
}

// ══════════════════════════════════════════════════════════════════
// ── AUTH
// ══════════════════════════════════════════════════════════════════

export async function sbSignUp(email, password) {
  enforceAuthRateLimit("signup");
  const res  = await fetchWithTimeout(
    `${BASE}/auth/v1/signup`,
    { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY }, body: JSON.stringify({ email, password }) },
    10_000
  );
  const data = await parseResponse(res, "Sign up failed");
  if (data.access_token) saveSession(data);
  return data;
}

export async function sbSignIn(email, password) {
  enforceAuthRateLimit("signin");
  const res  = await fetchWithTimeout(
    `${BASE}/auth/v1/token?grant_type=password`,
    { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY }, body: JSON.stringify({ email, password }) },
    10_000
  );
  const data = await parseResponse(res, "Invalid email or password");
  saveSession(data);
  return data;
}

export async function sbSignOut() {
  const t = getSession()?.access_token;
  if (t) {
    await fetchWithTimeout(
      `${BASE}/auth/v1/logout`,
      { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${t}` } },
      8_000
    ).catch(() => {});
  }
  clearSession(); // also clears _responseCache
}

export async function sbResetPassword(email) {
  enforceAuthRateLimit("reset", 5_000);
  const res = await fetchWithTimeout(
    `${BASE}/auth/v1/recover`,
    { method: "POST", headers: { "Content-Type": "application/json", "apikey": KEY }, body: JSON.stringify({ email }) },
    10_000
  );
  await parseResponse(res, "Password reset failed");
  return true;
}

// ══════════════════════════════════════════════════════════════════
// ── GENERIC DATA HELPERS
// ══════════════════════════════════════════════════════════════════

export async function sbGet(table, params = {}) {
  const q = new URLSearchParams(params).toString();
  return _fetchGET(
    `${BASE}/rest/v1/${table}${q ? "?" + q : ""}`,
    `Failed to fetch ${table}`
  );
}

export async function sbInsert(table, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}`,
    { method: "POST", headers: headers(token()), body: JSON.stringify(data) },
    `Failed to insert into ${table}`
  );
  return res.json();
}

export async function sbUpdate(table, id, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(data) },
    `Failed to update ${table}`
  );
  return res.json();
}

export async function sbDelete(table, id) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}?id=eq.${id}`,
    { method: "DELETE", headers: { ...headers(token()), "Prefer": "return=minimal" } },
    `Failed to delete from ${table}`
  );
  return res.ok;
}

// ══════════════════════════════════════════════════════════════════
// ── PROFILE
// ══════════════════════════════════════════════════════════════════

export async function sbGetProfile(sessionToken) {
  const session = sessionToken ? null : getSession();
  const uid     = sessionToken ? safeDecodeJwtSub(sessionToken) : session?.user?.id;
  if (!uid) return null;
  const tok = sessionToken || token();
  // No TTL — profile data is user-visible and should always be fresh
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/profiles?id=eq.${uid}`,
    { headers: headers(tok) },
    "Failed to fetch profile"
  );
  const rows = await res.json();
  return rows[0] || null;
}

export async function sbUpsertProfile(data) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/profiles?id=eq.${uid}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(data) },
    "Failed to update profile"
  );
  const rows = await res.json();
  if (rows?.[0]) return rows[0];

  const res2 = await fetchWithAuthRetry(
    `${BASE}/rest/v1/profiles`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ ...data, id: uid }) },
    "Failed to create profile"
  );
  const rows2 = await res2.json();
  return rows2[0];
}

// ══════════════════════════════════════════════════════════════════
// ── ROLES & USERS
// ══════════════════════════════════════════════════════════════════

export async function sbGetMyRole(sessionToken) {
  const tok = sessionToken || token();
  // No TTL — role is security-sensitive; always verify from server
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_my_role`,
    { method: "POST", headers: headers(tok), body: JSON.stringify({}) },
    "Failed to fetch role"
  );
  return (await res.json()) || null;
}

export async function sbGetRoles() {
  // Roles change very rarely — cache for 5 minutes
  return _fetchGET(
    `${BASE}/rest/v1/roles?order=id.asc`,
    "Failed to fetch roles",
    5 * 60_000
  );
}

export async function sbGetAllUsers() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_all_users`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({}) },
    "Failed to fetch users"
  );
  return res.json();
}

export async function sbAssignRole(userId, roleId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/assign_user_role`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ target_user_id: userId, target_role_id: roleId }) },
    "Failed to assign role"
  );
  return true;
}

export async function sbDeactivateRole(userId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/deactivate_user_role`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ target_user_id: userId }) },
    "Failed to deactivate user"
  );
  return true;
}

export async function sbAdminCreateUser(email, password, cdsNumber) {
  const res = await fetchWithAuthRetry(
    `${BASE}/functions/v1/create-user`,
    {
      method:  "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token()}`, "apikey": KEY },
      body:    JSON.stringify({ email, password, cds_number: cdsNumber || null }),
    },
    "Failed to create user"
  );
  return res.json();
}

// ══════════════════════════════════════════════════════════════════
// ── CDS ACCOUNTS
// ══════════════════════════════════════════════════════════════════

export async function sbGetCdsAccount(cdsNumber) {
  if (!cdsNumber) return null;
  const rows = await _fetchGET(
    `${BASE}/rest/v1/cds_accounts?cds_number=eq.${encodeURIComponent(cdsNumber)}&select=id,cds_number,cds_name,phone,email&limit=1`,
    "Failed to fetch CDS account"
  );
  return rows[0] || null;
}

export async function sbInsertCdsAccount({ cds_number, cds_name, phone, email }) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ cds_number: cds_number.trim(), cds_name: cds_name.trim(), phone: phone?.trim() || null, email: email?.trim() || null, created_by: uid || null }),
    },
    "Failed to create CDS account. CDS number may already exist."
  );
  _invalidateCache(`${BASE}/rest/v1/cds_accounts`);
  return res.json();
}

export async function sbUpdateCdsAccount(id, { cds_name, phone, email }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts?id=eq.${id}`,
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify({ cds_name: cds_name.trim(), phone: phone?.trim() || null, email: email?.trim() || null }),
    },
    "Failed to update CDS account."
  );
  _invalidateCache(`${BASE}/rest/v1/cds_accounts`);
  return res.json();
}

export async function sbSearchCdsAccounts(query = "") {
  const q      = query.trim();
  const filter = q ? `or=(cds_number.ilike.*${encodeURIComponent(q)}*,cds_name.ilike.*${encodeURIComponent(q)}*)&` : "";
  // Short TTL — search results are shown in an admin table, should be nearly live
  return _fetchGET(
    `${BASE}/rest/v1/cds_accounts?${filter}order=cds_name.asc&select=id,cds_number,cds_name,phone,email,created_at`,
    "Failed to search CDS accounts",
    15_000
  );
}

// ══════════════════════════════════════════════════════════════════
// ── TRANSACTIONS
// ══════════════════════════════════════════════════════════════════

export async function sbGetTransactions() {
  const rows = await _fetchGET(
    `${BASE}/rest/v1/transactions?order=date.desc,created_at.desc`,
    "Failed to fetch transactions"
  );
  if (!rows.length) return rows;
  const nameMap = await resolveUserNames([
    ...rows.map((t) => t.created_by),
    ...rows.map((t) => t.confirmed_by),
    ...rows.map((t) => t.verified_by),
    ...rows.map((t) => t.rejected_by),
  ]);
  return rows.map((t) => _attachNames(t, nameMap));
}

export async function sbGetTransactionsByIds(ids) {
  if (!ids?.length) return [];
  const idList = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const rows   = await _fetchGET(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    "Failed to re-fetch transactions"
  );
  if (!rows.length) return rows;
  const nameMap = await resolveUserNames([
    ...rows.map((t) => t.created_by),
    ...rows.map((t) => t.confirmed_by),
    ...rows.map((t) => t.verified_by),
    ...rows.map((t) => t.rejected_by),
  ]);
  return rows.map((t) => _attachNames(t, nameMap));
}

export async function sbGetFifoGainLoss(cdsNumber, companyId = null) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_fifo_gain_loss`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ p_cds_number: cdsNumber, ...(companyId ? { p_company_id: companyId } : {}) }),
    },
    "Failed to fetch gain/loss data"
  );
  return res.json();
}

export async function sbInsertTransaction(data) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ ...data, status: "pending", created_by: uid }) },
    "Failed to create transaction"
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbUpdateTransaction(id, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(data) },
    "Permission denied: your role is not allowed to update this transaction."
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbConfirmTransaction(id) {
  const uid  = getSession()?.user?.id;
  const body = { status: "confirmed" };
  if (uid) { body.confirmed_by = uid; body.confirmed_at = new Date().toISOString(); }
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Permission denied: only the Data Entrant who created this transaction can confirm it."
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbVerifyTransactions(ids) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const body   = { status: "verified" };
  if (uid) { body.verified_by = uid; body.verified_at = new Date().toISOString(); }
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Permission denied: only a Verifier, SA, or AD can verify transactions."
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbRejectTransactions(ids, comment) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const body   = { status: "rejected", rejection_comment: comment };
  if (uid) { body.rejected_by = uid; body.rejected_at = new Date().toISOString(); }
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Permission denied: only a Verifier, SA, or AD can reject transactions."
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbDeleteTransaction(id) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=eq.${id}`,
    { method: "DELETE", headers: { ...headers(token()), "Prefer": "count=exact" } },
    "Failed to delete transaction."
  );
  const range    = res.headers.get("Content-Range") || "";
  const affected = parseInt(range.split("/")[1] ?? "0", 10);
  if (affected === 0) throw new Error("Delete was not permitted. You may not have permission to delete this transaction.");
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return true;
}

export async function sbUnverifyTransaction(id) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/unverify_transaction`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_id: id }) },
    "Failed to unverify transaction"
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

export async function sbUnverifyTransactions(ids) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/unverify_transactions`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_ids: ids }) },
    "Failed to unverify transactions"
  );
  _invalidateCache(`${BASE}/rest/v1/transactions`);
  return res.json();
}

// ══════════════════════════════════════════════════════════════════
// ── BROKERS
// ══════════════════════════════════════════════════════════════════

export async function sbGetAllBrokers() {
  // Broker list is stable — cache for 2 minutes
  return _fetchGET(
    `${BASE}/rest/v1/brokers?order=broker_name.asc`,
    "Failed to fetch brokers",
    2 * 60_000
  );
}

export async function sbGetActiveBrokers() {
  // Active brokers used in transaction form dropdowns — cache for 2 minutes
  return _fetchGET(
    `${BASE}/rest/v1/brokers?status=eq.Active&order=broker_name.asc&select=id,broker_name,broker_code,contact_phone,contact_email`,
    "Failed to fetch active brokers",
    2 * 60_000
  );
}

export async function sbInsertBroker({ broker_name, broker_code, contact_phone, contact_email, status = "Active", remarks, created_by }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ broker_name: broker_name.trim(), broker_code: broker_code.trim().toUpperCase(), contact_phone: contact_phone?.trim() || null, contact_email: contact_email?.trim() || null, status, remarks: remarks?.trim() || null, created_by: created_by || null }),
    },
    "Failed to create broker. Name or code may already exist."
  );
  _invalidateCache(`${BASE}/rest/v1/brokers`);
  return res.json();
}

export async function sbUpdateBroker(id, { broker_name, broker_code, contact_phone, contact_email, status, remarks }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify({ broker_name: broker_name.trim(), broker_code: broker_code.trim().toUpperCase(), contact_phone: contact_phone?.trim() || null, contact_email: contact_email?.trim() || null, status, remarks: remarks?.trim() || null }),
    },
    "Failed to update broker. Name or code may already exist."
  );
  _invalidateCache(`${BASE}/rest/v1/brokers`);
  return res.json();
}

export async function sbToggleBrokerStatus(id, newStatus) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify({ status: newStatus }) },
    "Failed to update broker status."
  );
  _invalidateCache(`${BASE}/rest/v1/brokers`);
  return res.json();
}

export async function sbDeleteBroker(id) {
  // Preflight: friendly message before FK error fires
  const rows = await _fetchGET(
    `${BASE}/rest/v1/transactions?broker_id=eq.${id}&select=id&limit=1`,
    "Failed to check broker usage"
  );
  if (rows.length > 0) throw new Error("Cannot delete: this broker is linked to existing transactions. Deactivate it instead.");

  await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    { method: "DELETE", headers: { ...headers(token()), "Prefer": "count=exact" } },
    "Failed to delete broker."
  );
  _invalidateCache(`${BASE}/rest/v1/brokers`);
  return true;
}

// ══════════════════════════════════════════════════════════════════
// ── PORTFOLIO & CDS PRICES
// ══════════════════════════════════════════════════════════════════

export async function sbGetPortfolio(cdsNumber) {
  if (!cdsNumber) return [];

  try {
    const rpcRes = await fetchWithTimeout(
      `${BASE}/rest/v1/rpc/get_cds_portfolio`,
      { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber }) }
    );

    if (rpcRes.ok) {
      const rows = await rpcRes.json();
      return rows.map((r) => ({
        id:                      r.id,
        name:                    r.name,
        remarks:                 r.remarks,
        created_at:              r.created_at,
        cds_price:               r.cds_price               ?? null,
        cds_previous_price:      r.cds_previous_price      ?? null,
        cds_updated_by:          r.cds_updated_by          ?? null,
        cds_updated_at:          r.cds_updated_at          ?? null,
        cds_price_id:            r.cds_price_id            ?? null,
        cds_price_created_by_id: r.cds_price_created_by_id ?? null,
      }));
    }
    if (rpcRes.status !== 404) throw new Error(await rpcRes.text());
  } catch (e) {
    if (!e.message?.includes("404")) {
      console.warn("[sbGetPortfolio] RPC unavailable, using fallback:", e.message);
    }
  }

  // Fallback — parallel fetch of companies + prices
  const txRows  = await _fetchGET(
    `${BASE}/rest/v1/transactions?cds_number=eq.${encodeURIComponent(cdsNumber)}&select=company_id`,
    "Failed to fetch portfolio transactions"
  );
  const ids = [...new Set(txRows.map((t) => t.company_id).filter(Boolean))];
  if (!ids.length) return [];

  const idList = `(${ids.map((id) => `"${id}"`).join(",")})`;
  const [companies, prices] = await Promise.all([
    _fetchGET(`${BASE}/rest/v1/companies?id=in.${idList}&order=name.asc`, "Failed to fetch companies"),
    _fetchGET(`${BASE}/rest/v1/cds_prices?cds_number=eq.${encodeURIComponent(cdsNumber)}`, "Failed to fetch CDS prices"),
  ]);

  const priceMap = Object.fromEntries(prices.map((p) => [p.company_id, p]));
  return companies.map((c) => ({
    ...c,
    cds_price:               priceMap[c.id]?.price          ?? null,
    cds_previous_price:      priceMap[c.id]?.previous_price ?? null,
    cds_updated_by:          priceMap[c.id]?.updated_by     ?? null,
    cds_updated_at:          priceMap[c.id]?.updated_at     ?? null,
    cds_price_id:            priceMap[c.id]?.id             ?? null,
    cds_price_created_by_id: priceMap[c.id]?.created_by_id  ?? null,
  }));
}

export async function sbUpsertCdsPrice({ companyId, companyName, cdsNumber, newPrice, oldPrice, reason, updatedBy, datetime }) {
  const changeAmount  = oldPrice != null ? newPrice - oldPrice : null;
  const changePct     = oldPrice != null && oldPrice !== 0 ? (changeAmount / oldPrice) * 100 : null;
  const ts            = datetime ? new Date(datetime).toISOString() : new Date().toISOString();
  const currentUserId = getSession()?.user?.id;

  const [upsertRes] = await Promise.all([
    fetchWithAuthRetry(
      `${BASE}/rest/v1/cds_prices?on_conflict=company_id,cds_number`,
      {
        method:  "POST",
        headers: { ...headers(token()), "Prefer": "return=representation,resolution=merge-duplicates" },
        body:    JSON.stringify({ company_id: companyId, cds_number: cdsNumber, price: newPrice, previous_price: oldPrice ?? null, updated_by: updatedBy, notes: reason || null, updated_at: ts, created_by_id: currentUserId }),
      },
      "Failed to update CDS price"
    ),
    fetchWithAuthRetry(
      `${BASE}/rest/v1/cds_price_history`,
      {
        method:  "POST",
        headers: headers(token()),
        body:    JSON.stringify({ company_id: companyId, company_name: companyName, cds_number: cdsNumber, old_price: oldPrice ?? null, new_price: newPrice, change_amount: changeAmount, change_percent: changePct, notes: reason || null, updated_by: updatedBy, created_at: ts }),
      },
      "Failed to save price history"
    ),
  ]);

  _invalidateCache(`${BASE}/rest/v1/cds_prices`);
  _invalidateCache(`${BASE}/rest/v1/cds_price_history`);
  const upserted = await upsertRes.json();
  return upserted[0] || upserted;
}

export async function sbGetCdsPriceHistory(companyId, cdsNumber) {
  return _fetchGET(
    `${BASE}/rest/v1/cds_price_history?company_id=eq.${companyId}&cds_number=eq.${encodeURIComponent(cdsNumber)}&order=created_at.desc`,
    "Failed to fetch CDS price history"
  );
}

export async function sbGetAllCompanies() {
  // Companies change rarely — cache for 2 minutes
  return _fetchGET(
    `${BASE}/rest/v1/companies?order=name.asc`,
    "Failed to fetch companies",
    2 * 60_000
  );
}

// ══════════════════════════════════════════════════════════════════
// ── SITE SETTINGS
// ══════════════════════════════════════════════════════════════════

export async function sbGetSiteSettings(key = "login_page") {
  // Use anon key (public settings) — short TTL so admin changes propagate quickly
  const rows = await _fetchGET(
    `${BASE}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    "Failed to load site settings.",
    30_000
  );
  return rows[0]?.value ?? null;
}

export async function sbSaveSiteSettings(key = "login_page", value, accessToken) {
  const tok = accessToken || token();

  const patchRes = await fetchWithTimeout(
    `${BASE}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}`,
    {
      method:  "PATCH",
      headers: { "apikey": KEY, "Authorization": `Bearer ${tok}`, "Content-Type": "application/json", "Prefer": "return=representation" },
      body:    JSON.stringify({ value, updated_at: new Date().toISOString() }),
    }
  );
  if (!patchRes.ok) {
    let msg = "Failed to save settings.";
    try { msg = sanitiseError(await patchRes.json(), msg); } catch {}
    throw new Error(msg);
  }

  const patched = await patchRes.json();
  if (!patched || patched.length === 0) {
    const insertRes = await fetchWithTimeout(
      `${BASE}/rest/v1/site_settings`,
      {
        method:  "POST",
        headers: { "apikey": KEY, "Authorization": `Bearer ${tok}`, "Content-Type": "application/json", "Prefer": "return=representation" },
        body:    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
      }
    );
    if (!insertRes.ok) {
      let msg = "Failed to save settings.";
      try { msg = sanitiseError(await insertRes.json(), msg); } catch {}
      throw new Error(msg);
    }
    _invalidateCache(`${BASE}/rest/v1/site_settings`);
    return insertRes.json();
  }
  _invalidateCache(`${BASE}/rest/v1/site_settings`);
  return patched;
}

export async function sbUploadSlideImage(blob, slideIndex, session) {
  const tok      = session?.access_token || KEY;
  const filename = `slide-${slideIndex}.jpg`;
  const uploadRes = await fetchWithTimeout(
    `${BASE}/storage/v1/object/login-slides/${filename}`,
    { method: "POST", headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "image/jpeg", "x-upsert": "true" }, body: blob },
    30_000 // longer timeout for image uploads
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.message || "Image upload failed");
  }
  return `${BASE}/storage/v1/object/public/login-slides/${filename}?t=${Date.now()}`;
}

// ══════════════════════════════════════════════════════════════════
// ── CDS MULTI-ACCOUNT MANAGEMENT
// ══════════════════════════════════════════════════════════════════

export async function sbGetUserCDS(userId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_user_cds`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_user_id: userId }) },
    "Failed to fetch user CDS accounts"
  );
  return res.json();
}

export async function sbGetActiveCDS(userId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_active_cds`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_user_id: userId }) },
    "Failed to fetch active CDS"
  );
  const rows = await res.json();
  return Array.isArray(rows) ? (rows[0] || null) : (rows || null);
}

export async function sbSearchCDS(query) {
  if (!query || query.trim().length < 1) return [];
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/search_cds`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_query: query.trim() }) },
    "Failed to search CDS"
  );
  return res.json();
}

export async function sbCreateCDS({ cdsNumber, cdsName, phone, email }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/create_cds`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber, p_cds_name: cdsName, p_phone: phone || null, p_email: email || null }) },
    "Failed to create CDS record"
  );
  _invalidateCache(`${BASE}/rest/v1/cds_accounts`);
  return res.json();
}

export async function sbAssignCDS(userId, cdsId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/assign_cds_to_user`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_user_id: userId, p_cds_id: cdsId }) },
    "Failed to assign CDS"
  );
  return res.json();
}

export async function sbSwitchActiveCDS(userId, cdsId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/switch_active_cds`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_user_id: userId, p_cds_id: cdsId }) },
    "Failed to switch active CDS"
  );
  return sbGetActiveCDS(userId);
}

export async function sbRemoveCDS(userId, cdsId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/remove_cds_from_user`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_user_id: userId, p_cds_id: cdsId }) },
    "Failed to remove CDS"
  );
  return true;
}

export async function sbRemoveCDSFromAdminCascade(adminId, cdsId, cascade = false) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/remove_cds_from_admin_cascade`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_admin_id: adminId, p_cds_id: cdsId, p_cascade: cascade }) },
    "Failed to remove CDS from admin"
  );
  const result = await res.json();
  return typeof result === "number" ? result : 0;
}

export async function sbGetCDSAssignedUsers(cdsId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_cds_assigned_users`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_id: cdsId }) },
    "Failed to fetch CDS users"
  );
  return res.json();
}

// ── Passkeys (WebAuthn / Biometric login) ─────────────────────────

export async function sbGetPasskeys() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/passkeys?select=id,credential_id,nickname,device_type,backed_up,created_at,last_used_at&order=created_at.asc`,
    { method: "GET", headers: headers(token()) },
    "Failed to fetch passkeys"
  );
  return res.json();
}

export async function sbDeletePasskey(id) {
  // Route through the delete-passkey edge function (service role) so this
  // works regardless of whether the passkeys RLS DELETE policy is applied.
  // Ownership is enforced server-side via user_id = auth.uid().
  const res = await fetchWithAuthRetry(
    `${BASE}/functions/v1/delete-passkey`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${token()}` },
      body: JSON.stringify({ id }),
    },
    "Failed to delete passkey"
  );
  const data = await res.json().catch(() => ({}));
  if (!data.deleted) throw new Error(data.error || "Failed to delete passkey");
}

// ── Dividends ──────────────────────────────────────────────────────

export async function sbGetDividends(cdsNumber) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_cds_dividends`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber }) },
    "Failed to fetch dividends"
  );
  return res.json();
}

export async function sbGetDividendSummary(cdsNumber) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_dividend_summary`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber }) },
    "Failed to fetch dividend summary"
  );
  const rows = await res.json();
  return rows?.[0] || { ytd_income: 0, ytd_tax: 0, ytd_net: 0, lifetime_income: 0, lifetime_tax: 0, lifetime_net: 0, company_count: 0, dividend_count: 0 };
}

export async function sbGetCompanyDividends(cdsNumber, companyId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_company_dividends`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber, p_company_id: companyId }) },
    "Failed to fetch company dividends"
  );
  return res.json();
}

export async function sbInsertDividend(data) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ ...data, created_by: uid }) },
    "Failed to create dividend"
  );
  return res.json();
}

export async function sbUpdateDividend(id, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(data) },
    "Failed to update dividend"
  );
  return res.json();
}

export async function sbDeleteDividend(id) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends?id=eq.${id}`,
    { method: "DELETE", headers: headers(token()) },
    "Failed to delete dividend"
  );
}

export async function sbUpdateDividendStatus(id, status) {
  const body = { status };
  if (status === "paid") { body.paid_by = getSession()?.user?.id || null; body.paid_at = new Date().toISOString(); }
  else { body.paid_by = null; body.paid_at = null; }
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Failed to update dividend status"
  );
  return res.json();
}

export async function sbBulkUpdateDividendStatus(ids, status) {
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const body = { status };
  if (status === "paid") { body.paid_by = getSession()?.user?.id || null; body.paid_at = new Date().toISOString(); }
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends?id=in.${idList}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Failed to update dividend statuses"
  );
  return res.json();
}

export async function sbBulkDeleteDividends(ids) {
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/dividends?id=in.${idList}`,
    { method: "DELETE", headers: headers(token()) },
    "Failed to delete dividends"
  );
}

// ── Portfolio Snapshots ────────────────────────────────────────────

export async function sbHasTodaySnapshot(cdsNumber) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/has_today_snapshot`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_cds_number: cdsNumber }) },
    "Failed to check snapshot"
  );
  return res.json();
}

export async function sbCaptureSnapshot(cdsNumber, data) {
  const today = new Date().toISOString().split("T")[0];
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/capture_portfolio_snapshot`,
    {
      method: "POST",
      headers: headers(token()),
      body: JSON.stringify({
        p_cds_number: cdsNumber,
        p_date: today,
        p_total_market_value: data.totalMarketValue || 0,
        p_total_cost_basis: data.totalCostBasis || 0,
        p_unrealized_gl: data.unrealizedGL || 0,
        p_dividend_ytd: data.dividendYTD || 0,
        p_company_count: data.companyCount || 0,
        p_details: JSON.stringify(data.details || []),
      }),
    },
    "Failed to capture snapshot"
  );
  return res.json();
}

export async function sbGetSnapshots(cdsNumber, fromDate, toDate) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_portfolio_snapshots`,
    {
      method: "POST",
      headers: headers(token()),
      body: JSON.stringify({
        p_cds_number: cdsNumber,
        p_from: fromDate,
        p_to: toDate,
      }),
    },
    "Failed to fetch snapshots"
  );
  return res.json();
}
