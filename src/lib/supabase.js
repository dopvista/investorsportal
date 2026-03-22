// ── src/lib/supabase.js ────────────────────────────────────────────

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!BASE || !KEY) {
  console.error("❌ Missing Supabase env vars. BASE:", BASE, "KEY:", KEY ? "set" : "missing");
} else {
  console.log("✅ Supabase connected to:", BASE);
}

// ══════════════════════════════════════════════════════════════════
// ── SECURITY UTILITIES
// ══════════════════════════════════════════════════════════════════

// ── Request timeout — prevents hanging requests ────────────────────
const DEFAULT_TIMEOUT_MS = 15_000;

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

// ── Safe JWT sub extraction — never throws ─────────────────────────
// Handles URL-safe base64, padding issues, and malformed tokens.
function safeDecodeJwtSub(tok) {
  try {
    const payload = tok.split(".")[1];
    if (!payload) return null;
    // URL-safe base64 → standard base64 + re-pad
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(
      Math.ceil(payload.length / 4) * 4, "="
    );
    return JSON.parse(atob(b64))?.sub ?? null;
  } catch {
    return null;
  }
}

// ── Client-side auth rate limiting ────────────────────────────────
// Prevents rapid-fire sign-in / password-reset hammering from the UI.
// Server-side rate limits are the real guard; this just adds a UX layer.
const _authAttempts = new Map();
function enforceAuthRateLimit(key, windowMs = 800) {
  const now  = Date.now();
  const last = _authAttempts.get(key) ?? 0;
  if (now - last < windowMs) {
    throw new Error("Too many attempts. Please wait a moment and try again.");
  }
  _authAttempts.set(key, now);
}

// ── Sanitise error messages ────────────────────────────────────────
// Strips raw DB internals (hints, details, column names) before
// any message reaches the UI. Falls back to a safe generic string.
const _SAFE_CODES = {
  "42501": "Permission denied by the database security policy.",
  "23505": "A record with that value already exists (duplicate).",
  "23503": "This record is referenced by other data and cannot be deleted.",
  "22P02": "Invalid input format.",
};

function sanitiseError(j, fallback) {
  if (!j || typeof j !== "object") return fallback;
  if (j.code && _SAFE_CODES[j.code]) return _SAFE_CODES[j.code];
  // Only expose the top-level message — never hint/details which leak schema
  if (j.message) return j.message;
  return fallback;
}

// ══════════════════════════════════════════════════════════════════
// ── RESPONSE / ERROR HELPERS
// ══════════════════════════════════════════════════════════════════

async function parseResponse(res, fallbackMsg) {
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); }
  catch {
    if (!res.ok) throw new Error(fallbackMsg);
    throw new Error(fallbackMsg);
  }
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

async function extractError(res, rlsMessage) {
  const errText = await res.text();
  let msg = rlsMessage || "An error occurred.";
  try {
    const j = JSON.parse(errText);
    if (j.code === "42501") {
      msg = rlsMessage || "Permission denied: your role is not allowed to perform this action.";
    } else if (j.code === "23505") {
      msg = "A record with that value already exists (duplicate).";
    } else if (j.code === "23503") {
      msg = "This record is linked to other data and cannot be deleted.";
    } else {
      // Only expose message — never hint/details
      msg = j.message || rlsMessage || "An error occurred.";
    }
  } catch { /* keep safe fallback */ }
  return msg;
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
// ── SESSION HELPERS
// ══════════════════════════════════════════════════════════════════

export function getSession() {
  try { return JSON.parse(localStorage.getItem("sb_session") || "null"); }
  catch { return null; }
}
function saveSession(s) { localStorage.setItem("sb_session", JSON.stringify(s)); }
function clearSession() { localStorage.removeItem("sb_session"); }
function token()        { return getSession()?.access_token || KEY; }

// ── Auto-refresh expired token — with singleton lock ──────────────
// FIX: Without this lock, multiple simultaneous 401 responses each
// fired their own refresh, invalidating each other's new tokens.
let _refreshPromise = null;

async function refreshSession() {
  // If a refresh is already in flight, wait for that one instead of
  // sending a second request that would invalidate the first token.
  if (_refreshPromise) return _refreshPromise;
  _refreshPromise = _doRefreshSession().finally(() => { _refreshPromise = null; });
  return _refreshPromise;
}

async function _doRefreshSession() {
  const session      = getSession();
  const refreshToken = session?.refresh_token;
  if (!refreshToken) { clearSession(); return null; }

  try {
    const res = await fetchWithTimeout(
      `${BASE}/auth/v1/token?grant_type=refresh_token`,
      {
        method:  "POST",
        headers: { "Content-Type": "application/json", "apikey": KEY },
        body:    JSON.stringify({ refresh_token: refreshToken }),
      },
      10_000 // shorter timeout for auth ops
    );
    if (!res.ok) { clearSession(); return null; }
    const data = await res.json();
    saveSession(data);
    return data.access_token;
  } catch {
    clearSession();
    return null;
  }
}

// ── Shared fetch with one auth retry + timeout ─────────────────────
async function fetchWithAuthRetry(url, options = {}, fallbackMsg = "Request failed") {
  let res = await fetchWithTimeout(url, options);

  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) throw new Error("Session expired. Please log in again.");
    res = await fetchWithTimeout(url, {
      ...options,
      headers: { ...(options.headers || {}), apikey: KEY, Authorization: `Bearer ${newToken}` },
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = fallbackMsg;
    try {
      const j = JSON.parse(text);
      msg = sanitiseError(j, fallbackMsg);
    } catch { /* use fallback — never expose raw server text */ }
    throw new Error(msg);
  }

  return res;
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
  clearSession();
}

export async function sbResetPassword(email) {
  enforceAuthRateLimit("reset", 5_000); // 5-second cooldown between reset attempts
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
  const q   = new URLSearchParams(params).toString();
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}${q ? "?" + q : ""}`,
    { headers: headers(token()) },
    `Failed to fetch ${table}`
  );
  return res.json();
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
  // FIX: use safe decode — never throws on malformed tokens
  const uid = sessionToken
    ? safeDecodeJwtSub(sessionToken)
    : session?.user?.id;
  if (!uid) return null;

  const tok = sessionToken || token();
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
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_my_role`,
    { method: "POST", headers: headers(tok), body: JSON.stringify({}) },
    "Failed to fetch role"
  );
  const data = await res.json();
  return data || null;
}

export async function sbGetRoles() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/roles?order=id.asc`,
    { headers: headers(token()) },
    "Failed to fetch roles"
  );
  return res.json();
}

// FIX: was using raw fetch — now uses fetchWithAuthRetry for 401 retry + timeout
export async function sbGetAllUsers() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_all_users`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({}) },
    "Failed to fetch users"
  );
  return res.json();
}

// FIX: was using raw fetch — now uses fetchWithAuthRetry for 401 retry + timeout
export async function sbAssignRole(userId, roleId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/assign_user_role`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ target_user_id: userId, target_role_id: roleId }) },
    "Failed to assign role"
  );
  return true;
}

// FIX: was using raw fetch — now uses fetchWithAuthRetry for 401 retry + timeout
export async function sbDeactivateRole(userId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/deactivate_user_role`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ target_user_id: userId }) },
    "Failed to deactivate user"
  );
  return true;
}

// FIX: was using raw fetch — now uses fetchWithAuthRetry for 401 retry + timeout
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
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts?cds_number=eq.${encodeURIComponent(cdsNumber)}&select=id,cds_number,cds_name,phone,email&limit=1`,
    { headers: headers(token()) },
    "Failed to fetch CDS account"
  );
  const rows = await res.json();
  return rows[0] || null;
}

export async function sbInsertCdsAccount({ cds_number, cds_name, phone, email }) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({
        cds_number: cds_number.trim(),
        cds_name:   cds_name.trim(),
        phone:      phone?.trim()  || null,
        email:      email?.trim()  || null,
        created_by: uid            || null,
      }),
    },
    "Failed to create CDS account. CDS number may already exist."
  );
  return res.json();
}

export async function sbUpdateCdsAccount(id, { cds_name, phone, email }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts?id=eq.${id}`,
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify({
        cds_name: cds_name.trim(),
        phone:    phone?.trim()  || null,
        email:    email?.trim()  || null,
      }),
    },
    "Failed to update CDS account."
  );
  return res.json();
}

export async function sbSearchCdsAccounts(query = "") {
  const q = query.trim();
  const filter = q
    ? `or=(cds_number.ilike.*${encodeURIComponent(q)}*,cds_name.ilike.*${encodeURIComponent(q)}*)&`
    : "";
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_accounts?${filter}order=cds_name.asc&select=id,cds_number,cds_name,phone,email,created_at`,
    { headers: headers(token()) },
    "Failed to search CDS accounts"
  );
  return res.json();
}

// ══════════════════════════════════════════════════════════════════
// ── TRANSACTIONS
// ══════════════════════════════════════════════════════════════════

export async function sbGetTransactions() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?order=date.desc,created_at.desc`,
    { headers: headers(token()) },
    "Failed to fetch transactions"
  );
  const rows = await res.json();
  if (!rows.length) return rows;

  const uids = [...new Set([
    ...rows.map(t => t.created_by),
    ...rows.map(t => t.confirmed_by),
    ...rows.map(t => t.verified_by),
    ...rows.map(t => t.rejected_by),
  ].filter(Boolean))];

  if (!uids.length) return rows;

  const idList = `(${uids.map(id => `"${id}"`).join(",")})`;
  let nameMap = {};
  try {
    const profileRes = await fetchWithAuthRetry(
      `${BASE}/rest/v1/profiles?id=in.${idList}&select=id,full_name`,
      { headers: headers(token()) },
      "Failed to fetch profile names"
    );
    const profiles = await profileRes.json();
    nameMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name || null]));
  } catch {
    // Names are non-critical — transactions still load without them
  }

  return rows.map(t => ({
    ...t,
    created_by_name:   nameMap[t.created_by]   || null,
    confirmed_by_name: nameMap[t.confirmed_by] || null,
    verified_by_name:  nameMap[t.verified_by]  || null,
    rejected_by_name:  nameMap[t.rejected_by]  || null,
  }));
}

export async function sbGetTransactionsByIds(ids) {
  if (!ids?.length) return [];
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    { headers: headers(token()) },
    "Failed to re-fetch transactions"
  );
  const rows = await res.json();
  if (!rows.length) return rows;

  const uids = [...new Set([
    ...rows.map(t => t.created_by),
    ...rows.map(t => t.confirmed_by),
    ...rows.map(t => t.verified_by),
    ...rows.map(t => t.rejected_by),
  ].filter(Boolean))];

  let nameMap = {};
  if (uids.length) {
    try {
      const uidList = `(${uids.map(id => `"${id}"`).join(",")})`;
      const profileRes = await fetchWithAuthRetry(
        `${BASE}/rest/v1/profiles?id=in.${uidList}&select=id,full_name`,
        { headers: headers(token()) },
        ""
      );
      const profiles = await profileRes.json();
      nameMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name || null]));
    } catch { /* names non-critical */ }
  }

  return rows.map(t => ({
    ...t,
    created_by_name:   nameMap[t.created_by]   || null,
    confirmed_by_name: nameMap[t.confirmed_by] || null,
    verified_by_name:  nameMap[t.verified_by]  || null,
    rejected_by_name:  nameMap[t.rejected_by]  || null,
  }));
}

export async function sbGetFifoGainLoss(cdsNumber, companyId = null) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_fifo_gain_loss`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({
        p_cds_number: cdsNumber,
        ...(companyId ? { p_company_id: companyId } : {}),
      }),
    },
    "Failed to fetch gain/loss data"
  );
  return res.json();
}

export async function sbInsertTransaction(data) {
  const uid = getSession()?.user?.id;
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ ...data, status: "pending", created_by: uid }),
    },
    "Failed to create transaction"
  );
  return res.json();
}

export async function sbUpdateTransaction(id, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(data) },
    "Permission denied: your role is not allowed to update this transaction."
  );
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
  return res.json();
}

export async function sbVerifyTransactions(ids) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const body   = { status: "verified" };
  if (uid) { body.verified_by = uid; body.verified_at = new Date().toISOString(); }

  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Permission denied: only a Verifier, SA, or AD can verify transactions."
  );
  return res.json();
}

export async function sbRejectTransactions(ids, comment) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const body   = { status: "rejected", rejection_comment: comment };
  if (uid) { body.rejected_by = uid; body.rejected_at = new Date().toISOString(); }

  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?id=in.${idList}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify(body) },
    "Permission denied: only a Verifier, SA, or AD can reject transactions."
  );
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
  return true;
}

export async function sbUnverifyTransaction(id) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/unverify_transaction`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_id: id }) },
    "Failed to unverify transaction"
  );
  return res.json();
}

export async function sbUnverifyTransactions(ids) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/unverify_transactions`,
    { method: "POST", headers: headers(token()), body: JSON.stringify({ p_ids: ids }) },
    "Failed to unverify transactions"
  );
  return res.json();
}

// ══════════════════════════════════════════════════════════════════
// ── BROKERS
// ══════════════════════════════════════════════════════════════════

export async function sbGetAllBrokers() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?order=broker_name.asc`,
    { headers: headers(token()) },
    "Failed to fetch brokers"
  );
  return res.json();
}

export async function sbGetActiveBrokers() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?status=eq.Active&order=broker_name.asc&select=id,broker_name,broker_code,contact_phone,contact_email`,
    { headers: headers(token()) },
    "Failed to fetch active brokers"
  );
  return res.json();
}

export async function sbInsertBroker({ broker_name, broker_code, contact_phone, contact_email, status = "Active", remarks, created_by }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({
        broker_name:   broker_name.trim(),
        broker_code:   broker_code.trim().toUpperCase(),
        contact_phone: contact_phone?.trim() || null,
        contact_email: contact_email?.trim() || null,
        status,
        remarks:       remarks?.trim()       || null,
        created_by:    created_by            || null,
      }),
    },
    "Failed to create broker. Name or code may already exist."
  );
  return res.json();
}

export async function sbUpdateBroker(id, { broker_name, broker_code, contact_phone, contact_email, status, remarks }) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify({
        broker_name:   broker_name.trim(),
        broker_code:   broker_code.trim().toUpperCase(),
        contact_phone: contact_phone?.trim() || null,
        contact_email: contact_email?.trim() || null,
        status,
        remarks:       remarks?.trim()       || null,
      }),
    },
    "Failed to update broker. Name or code may already exist."
  );
  return res.json();
}

export async function sbToggleBrokerStatus(id, newStatus) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    { method: "PATCH", headers: headers(token()), body: JSON.stringify({ status: newStatus }) },
    "Failed to update broker status."
  );
  return res.json();
}

export async function sbDeleteBroker(id) {
  const checkRes = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?broker_id=eq.${id}&select=id&limit=1`,
    { headers: headers(token()) },
    "Failed to check broker usage"
  );
  const rows = await checkRes.json();
  if (rows.length > 0) {
    throw new Error("Cannot delete: this broker is linked to existing transactions. Deactivate it instead.");
  }

  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/brokers?id=eq.${id}`,
    { method: "DELETE", headers: { ...headers(token()), "Prefer": "count=exact" } },
    "Failed to delete broker."
  );
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
      return rows.map(r => ({
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

  // Fallback
  const txRes = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?cds_number=eq.${encodeURIComponent(cdsNumber)}&select=company_id`,
    { headers: headers(token()) },
    "Failed to fetch portfolio transactions"
  );
  const txRows = await txRes.json();
  const ids    = [...new Set(txRows.map(t => t.company_id).filter(Boolean))];
  if (!ids.length) return [];

  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const [coRes, prRes] = await Promise.all([
    fetchWithAuthRetry(`${BASE}/rest/v1/companies?id=in.${idList}&order=name.asc`, { headers: headers(token()) }, "Failed to fetch companies"),
    fetchWithAuthRetry(`${BASE}/rest/v1/cds_prices?cds_number=eq.${encodeURIComponent(cdsNumber)}`, { headers: headers(token()) }, "Failed to fetch CDS prices"),
  ]);
  const [companies, prices] = await Promise.all([coRes.json(), prRes.json()]);
  const priceMap = Object.fromEntries(prices.map(p => [p.company_id, p]));

  return companies.map(c => ({
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

  const upsertRes = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_prices?on_conflict=company_id,cds_number`,
    {
      method:  "POST",
      headers: { ...headers(token()), "Prefer": "return=representation,resolution=merge-duplicates" },
      body:    JSON.stringify({
        company_id: companyId, cds_number: cdsNumber, price: newPrice,
        previous_price: oldPrice ?? null, updated_by: updatedBy, notes: reason || null,
        updated_at: ts, created_by_id: currentUserId,
      }),
    },
    "Failed to update CDS price"
  );
  const upserted = await upsertRes.json();

  const histRes = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_price_history`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({
        company_id: companyId, company_name: companyName, cds_number: cdsNumber,
        old_price: oldPrice ?? null, new_price: newPrice,
        change_amount: changeAmount, change_percent: changePct,
        notes: reason || null, updated_by: updatedBy, created_at: ts,
      }),
    },
    "Failed to save price history"
  );
  await histRes.json();

  return upserted[0] || upserted;
}

export async function sbGetCdsPriceHistory(companyId, cdsNumber) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/cds_price_history?company_id=eq.${companyId}&cds_number=eq.${encodeURIComponent(cdsNumber)}&order=created_at.desc`,
    { headers: headers(token()) },
    "Failed to fetch CDS price history"
  );
  return res.json();
}

export async function sbGetAllCompanies() {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/companies?order=name.asc`,
    { headers: headers(token()) },
    "Failed to fetch companies"
  );
  return res.json();
}

// ══════════════════════════════════════════════════════════════════
// ── SITE SETTINGS
// ══════════════════════════════════════════════════════════════════

export async function sbGetSiteSettings(key = "login_page") {
  const res = await fetchWithTimeout(
    `${BASE}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: headers(KEY) },
    10_000
  );
  if (!res.ok) throw new Error("Failed to load site settings.");
  const rows = await res.json();
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
    try { const j = await patchRes.json(); msg = sanitiseError(j, msg); } catch {}
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
      try { const j = await insertRes.json(); msg = sanitiseError(j, msg); } catch {}
      throw new Error(msg);
    }
    return insertRes.json();
  }
  return patched;
}

export async function sbUploadSlideImage(blob, slideIndex, session) {
  const tok      = session?.access_token || KEY;
  const filename = `slide-${slideIndex}.jpg`;

  const uploadRes = await fetchWithTimeout(
    `${BASE}/storage/v1/object/login-slides/${filename}`,
    {
      method:  "POST",
      headers: { "Authorization": `Bearer ${tok}`, "Content-Type": "image/jpeg", "x-upsert": "true" },
      body:    blob,
    },
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
    {
      method: "POST", headers: headers(token()),
      body: JSON.stringify({ p_cds_number: cdsNumber, p_cds_name: cdsName, p_phone: phone || null, p_email: email || null }),
    },
    "Failed to create CDS record"
  );
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
    {
      method: "POST", headers: headers(token()),
      body: JSON.stringify({ p_admin_id: adminId, p_cds_id: cdsId, p_cascade: cascade }),
    },
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
