// ── src/lib/supabase.js ────────────────────────────────────────────

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!BASE || !KEY) {
  console.error("❌ Missing Supabase env vars. BASE:", BASE, "KEY:", KEY ? "set" : "missing");
} else {
  console.log("✅ Supabase connected to:", BASE);
}

// ── Safe response parser ───────────────────────────────────────────
async function parseResponse(res, fallbackMsg) {
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    if (!res.ok) throw new Error(fallbackMsg + (text.length < 200 ? ": " + text : ""));
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

// Convert Supabase error codes to readable messages
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
  };
  return map[code] || null;
}

// ── Shared error extractor ─────────────────────────────────────────
async function extractError(res, rlsMessage) {
  const errText = await res.text();
  let msg = errText;
  try {
    const j = JSON.parse(errText);
    if (j.code === "42501") {
      msg = rlsMessage || "Permission denied: your role is not allowed to perform this action. Ensure the correct RLS UPDATE policy exists in Supabase.";
    } else {
      msg = j.message || j.hint || j.details || errText;
    }
  } catch {
    // keep raw text
  }
  return msg;
}

// ── Headers ────────────────────────────────────────────────────────
const headers = (token) => ({
  "Content-Type":  "application/json",
  "apikey":        KEY,
  "Authorization": `Bearer ${token || KEY}`,
  "Prefer":        "return=representation",
});

// ── Session helpers ────────────────────────────────────────────────
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem("sb_session") || "null");
  } catch {
    return null;
  }
}
function saveSession(s) { localStorage.setItem("sb_session", JSON.stringify(s)); }
function clearSession() { localStorage.removeItem("sb_session"); }
function token()        { return getSession()?.access_token || KEY; }

// ── Auto-refresh expired token ─────────────────────────────────────
async function refreshSession() {
  const session      = getSession();
  const refreshToken = session?.refresh_token;

  if (!refreshToken) {
    clearSession();
    return null;
  }

  const res = await fetch(`${BASE}/auth/v1/token?grant_type=refresh_token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY },
    body:    JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) {
    clearSession();
    return null;
  }

  const data = await res.json();
  saveSession(data);
  return data.access_token;
}

// ── Shared fetch with one auth retry ───────────────────────────────
async function fetchWithAuthRetry(url, options = {}, fallbackMsg = "Request failed") {
  let res = await fetch(url, options);

  if (res.status === 401) {
    const newToken = await refreshSession();
    if (!newToken) {
      throw new Error("Session expired. Please log in again.");
    }

    const nextHeaders = {
      ...(options.headers || {}),
      apikey: KEY,
      Authorization: `Bearer ${newToken}`,
    };

    res = await fetch(url, {
      ...options,
      headers: nextHeaders,
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || fallbackMsg);
  }

  return res;
}

// ── AUTH ───────────────────────────────────────────────────────────

export async function sbSignUp(email, password) {
  const res = await fetch(`${BASE}/auth/v1/signup`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY },
    body:    JSON.stringify({ email, password }),
  });
  const data = await parseResponse(res, "Sign up failed");
  if (data.access_token) saveSession(data);
  return data;
}

export async function sbSignIn(email, password) {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY },
    body:    JSON.stringify({ email, password }),
  });
  const data = await parseResponse(res, "Invalid email or password");
  saveSession(data);
  return data;
}

export async function sbSignOut() {
  const t = getSession()?.access_token;
  if (t) {
    await fetch(`${BASE}/auth/v1/logout`, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${t}` },
    }).catch(() => {});
  }
  clearSession();
}

export async function sbResetPassword(email) {
  const res = await fetch(`${BASE}/auth/v1/recover`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "apikey": KEY },
    body:    JSON.stringify({ email }),
  });
  await parseResponse(res, "Password reset failed");
  return true;
}

// ── DATA ───────────────────────────────────────────────────────────

export async function sbGet(table, params = {}) {
  const q = new URLSearchParams(params).toString();
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
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify(data),
    },
    `Failed to insert into ${table}`
  );
  return res.json();
}

export async function sbUpdate(table, id, data) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}?id=eq.${id}`,
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify(data),
    },
    `Failed to update ${table}`
  );
  return res.json();
}

export async function sbDelete(table, id) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/${table}?id=eq.${id}`,
    {
      method:  "DELETE",
      headers: { ...headers(token()), "Prefer": "return=minimal" },
    },
    `Failed to delete from ${table}`
  );
  return res.ok;
}

// ── PROFILE ────────────────────────────────────────────────────────

export async function sbGetProfile(sessionToken) {
  const session = sessionToken ? null : getSession();
  const uid     = sessionToken
    ? JSON.parse(atob(sessionToken.split(".")[1])).sub
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
    {
      method:  "PATCH",
      headers: headers(token()),
      body:    JSON.stringify(data),
    },
    "Failed to update profile"
  );

  const rows = await res.json();

  if (rows?.[0]) return rows[0];

  const res2 = await fetchWithAuthRetry(
    `${BASE}/rest/v1/profiles`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ ...data, id: uid }),
    },
    "Failed to create profile"
  );

  const rows2 = await res2.json();
  return rows2[0];
}

// ── ROLES ──────────────────────────────────────────────────────────

export async function sbGetMyRole(sessionToken) {
  const tok = sessionToken || token();

  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_my_role`,
    {
      method:  "POST",
      headers: headers(tok),
      body:    JSON.stringify({}),
    },
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

export async function sbGetAllUsers() {
  const res = await fetch(`${BASE}/rest/v1/rpc/get_all_users`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({}),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch users");
  }

  return res.json();
}

export async function sbAssignRole(userId, roleId) {
  const res = await fetch(`${BASE}/rest/v1/rpc/assign_user_role`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({
      target_user_id: userId,
      target_role_id: roleId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to assign role");
  }

  return true;
}

export async function sbDeactivateRole(userId) {
  const res = await fetch(`${BASE}/rest/v1/rpc/deactivate_user_role`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({ target_user_id: userId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to deactivate user");
  }

  return true;
}

export async function sbAdminCreateUser(email, password, cdsNumber) {
  const res = await fetch(`${BASE}/functions/v1/create-user`, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token()}`,
      "apikey":        KEY,
    },
    body: JSON.stringify({
      email,
      password,
      cds_number: cdsNumber || null,
    }),
  });

  const data = await parseResponse(res, "Failed to create user");
  return data;
}

// ── TRANSACTIONS (workflow) ────────────────────────────────────────

export async function sbGetTransactions() {
  const url = `${BASE}/rest/v1/transactions?order=date.desc,created_at.desc`;
  const res = await fetchWithAuthRetry(url, { headers: headers(token()) }, "Failed to fetch transactions");
  return res.json();
}

export async function sbInsertTransaction(data) {
  const uid = getSession()?.user?.id;

  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({
        ...data,
        status:     "pending",
        created_by: uid,
      }),
    },
    "Failed to create transaction"
  );

  return res.json();
}

export async function sbConfirmTransaction(id) {
  const uid  = getSession()?.user?.id;
  const body = { status: "confirmed" };

  if (uid) {
    body.confirmed_by = uid;
    body.confirmed_at = new Date().toISOString();
  }

  const res = await fetch(`${BASE}/rest/v1/transactions?id=eq.${id}`, {
    method:  "PATCH",
    headers: headers(token()),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await extractError(
      res,
      "Permission denied: only the Data Entrant who created this transaction can confirm it. Ensure the RLS UPDATE policy for 'DE can confirm own transactions' exists in Supabase."
    );
    throw new Error(msg);
  }

  return res.json();
}

export async function sbVerifyTransactions(ids) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const body   = { status: "verified" };

  if (uid) {
    body.verified_by = uid;
    body.verified_at = new Date().toISOString();
  }

  const res = await fetch(`${BASE}/rest/v1/transactions?id=in.${idList}`, {
    method:  "PATCH",
    headers: headers(token()),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await extractError(
      res,
      "Permission denied: only a Verifier, SA, or AD can verify transactions. Ensure the RLS UPDATE policy for 'VR can verify confirmed transactions' exists in Supabase."
    );
    throw new Error(msg);
  }

  return res.json();
}

export async function sbRejectTransactions(ids, comment) {
  const uid    = getSession()?.user?.id;
  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;
  const body   = {
    status:            "rejected",
    rejection_comment: comment,
  };

  if (uid) {
    body.rejected_by = uid;
    body.rejected_at = new Date().toISOString();
  }

  const res = await fetch(`${BASE}/rest/v1/transactions?id=in.${idList}`, {
    method:  "PATCH",
    headers: headers(token()),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await extractError(
      res,
      "Permission denied: only a Verifier, SA, or AD can reject transactions. Ensure the RLS UPDATE policy for 'VR can reject confirmed transactions' exists in Supabase."
    );
    throw new Error(msg);
  }

  return res.json();
}

export async function sbUpdateTransaction(id, data) {
  const res = await fetch(`${BASE}/rest/v1/transactions?id=eq.${id}`, {
    method:  "PATCH",
    headers: headers(token()),
    body:    JSON.stringify(data),
  });

  if (!res.ok) {
    const msg = await extractError(
      res,
      "Permission denied: your role is not allowed to update this transaction. Check that the correct RLS UPDATE policy exists in Supabase for your role."
    );
    throw new Error(msg);
  }

  return res.json();
}

export async function sbDeleteTransaction(id) {
  const res = await fetch(`${BASE}/rest/v1/transactions?id=eq.${id}`, {
    method:  "DELETE",
    headers: { ...headers(token()), "Prefer": "count=exact" },
  });

  if (!res.ok) throw new Error(await res.text());

  const range    = res.headers.get("Content-Range") || "";
  const affected = parseInt(range.split("/")[1] ?? "0", 10);

  if (affected === 0) {
    throw new Error("Delete was not permitted. You may not have permission to delete this transaction.");
  }

  return true;
}

export async function sbUnverifyTransaction(id) {
  const res = await fetch(`${BASE}/rest/v1/rpc/unverify_transaction`, {
    method: "POST",
    headers: headers(token()),
    body: JSON.stringify({ p_id: id }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Failed to unverify transaction");
  }

  return res.json();
}

export async function sbUnverifyTransactions(ids) {
  const res = await fetch(`${BASE}/rest/v1/rpc/unverify_transactions`, {
    method: "POST",
    headers: headers(token()),
    body: JSON.stringify({ p_ids: ids }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || err.error || "Failed to unverify transactions");
  }

  return res.json();
}

// ── PORTFOLIO & CDS PRICES ─────────────────────────────────────────

export async function sbGetPortfolio(cdsNumber) {
  if (!cdsNumber) return [];

  try {
    const rpcRes = await fetch(`${BASE}/rest/v1/rpc/get_cds_portfolio`, {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ p_cds_number: cdsNumber }),
    });

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

  const txRes = await fetchWithAuthRetry(
    `${BASE}/rest/v1/transactions?cds_number=eq.${encodeURIComponent(cdsNumber)}&select=company_id`,
    { headers: headers(token()) },
    "Failed to fetch portfolio transactions"
  );
  const txRows = await txRes.json();

  const ids = [...new Set(txRows.map(t => t.company_id).filter(Boolean))];
  if (!ids.length) return [];

  const idList = `(${ids.map(id => `"${id}"`).join(",")})`;

  const [coRes, prRes] = await Promise.all([
    fetchWithAuthRetry(
      `${BASE}/rest/v1/companies?id=in.${idList}&order=name.asc`,
      { headers: headers(token()) },
      "Failed to fetch companies"
    ),
    fetchWithAuthRetry(
      `${BASE}/rest/v1/cds_prices?cds_number=eq.${encodeURIComponent(cdsNumber)}`,
      { headers: headers(token()) },
      "Failed to fetch CDS prices"
    ),
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

  const upsertRes = await fetch(`${BASE}/rest/v1/cds_prices?on_conflict=company_id,cds_number`, {
    method:  "POST",
    headers: { ...headers(token()), "Prefer": "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id:     companyId,
      cds_number:     cdsNumber,
      price:          newPrice,
      previous_price: oldPrice ?? null,
      updated_by:     updatedBy,
      notes:          reason || null,
      updated_at:     ts,
      created_by_id:  currentUserId,
    }),
  });
  if (!upsertRes.ok) throw new Error(await upsertRes.text());
  const upserted = await upsertRes.json();

  const histRes = await fetch(`${BASE}/rest/v1/cds_price_history`, {
    method:  "POST",
    headers: headers(token()),
    body: JSON.stringify({
      company_id:     companyId,
      company_name:   companyName,
      cds_number:     cdsNumber,
      old_price:      oldPrice ?? null,
      new_price:      newPrice,
      change_amount:  changeAmount,
      change_percent: changePct,
      notes:          reason || null,
      updated_by:     updatedBy,
      created_at:     ts,
    }),
  });
  if (!histRes.ok) throw new Error(await histRes.text());

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

// ═══════════════════════════════════════════════════════
// SITE SETTINGS
// ═══════════════════════════════════════════════════════

export async function sbGetSiteSettings(key = "login_page") {
  const res = await fetch(
    `${BASE}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`,
    { headers: headers(KEY) }
  );

  if (!res.ok) throw new Error(await res.text());

  const rows = await res.json();
  return rows[0]?.value ?? null;
}

export async function sbSaveSiteSettings(key = "login_page", value, accessToken) {
  const tok = accessToken || token();

  const patchRes = await fetch(
    `${BASE}/rest/v1/site_settings?key=eq.${encodeURIComponent(key)}`,
    {
      method:  "PATCH",
      headers: {
        "apikey":        KEY,
        "Authorization": `Bearer ${tok}`,
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
      },
      body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
    }
  );

  if (!patchRes.ok) {
    let msg = `PATCH failed HTTP ${patchRes.status}`;
    try {
      const j = await patchRes.json();
      msg = j.message || j.hint || JSON.stringify(j);
    } catch {
      msg = await patchRes.text().catch(() => msg);
    }
    throw new Error(msg);
  }

  const patched = await patchRes.json();

  if (!patched || patched.length === 0) {
    const insertRes = await fetch(
      `${BASE}/rest/v1/site_settings`,
      {
        method:  "POST",
        headers: {
          "apikey":        KEY,
          "Authorization": `Bearer ${tok}`,
          "Content-Type":  "application/json",
          "Prefer":        "return=representation",
        },
        body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
      }
    );

    if (!insertRes.ok) {
      let msg = `INSERT failed HTTP ${insertRes.status}`;
      try {
        const j = await insertRes.json();
        msg = j.message || j.hint || JSON.stringify(j);
      } catch {
        msg = await insertRes.text().catch(() => msg);
      }
      throw new Error(msg);
    }

    return insertRes.json();
  }

  return patched;
}

export async function sbUploadSlideImage(blob, slideIndex, session) {
  const tok      = session?.access_token || KEY;
  const filename = `slide-${slideIndex}.jpg`;

  const uploadRes = await fetch(
    `${BASE}/storage/v1/object/login-slides/${filename}`,
    {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${tok}`,
        "Content-Type":  "image/jpeg",
        "x-upsert":      "true",
      },
      body: blob,
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(err.message || "Image upload failed");
  }

  return `${BASE}/storage/v1/object/public/login-slides/${filename}?t=${Date.now()}`;
}

// ═══════════════════════════════════════════════════════
// CDS MULTI-ACCOUNT MANAGEMENT
// All functions call the RPCs created in Step 1 SQL.
// ═══════════════════════════════════════════════════════

// ── Get all CDS assigned to a user (active CDS first) ─────────────
// Returns: [{ user_cds_id, cds_id, cds_number, cds_name, phone,
//             email, is_active, assigned_at, assigned_by }]
export async function sbGetUserCDS(userId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_user_cds`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ p_user_id: userId }),
    },
    "Failed to fetch user CDS accounts"
  );
  return res.json();
}

// ── Get the single active CDS for a user ──────────────────────────
// Returns: { user_cds_id, cds_id, cds_number, cds_name, phone, email }
// Returns null if user has no active CDS.
export async function sbGetActiveCDS(userId) {
  const res = await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/get_active_cds`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ p_user_id: userId }),
    },
    "Failed to fetch active CDS"
  );
  const rows = await res.json();
  // RPC returns a table — take first row or null
  return Array.isArray(rows) ? (rows[0] || null) : (rows || null);
}

// ── Search CDS master registry by number or owner name ────────────
// Used for real-time search in assign CDS dialog.
// Returns: [{ id, cds_number, cds_name, phone, email, created_at }]
export async function sbSearchCDS(query) {
  if (!query || query.trim().length < 1) return [];

  const res = await fetch(`${BASE}/rest/v1/rpc/search_cds`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({ p_query: query.trim() }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to search CDS");
  }

  return res.json();
}

// ── Create a new CDS master record (SA only) ──────────────────────
// Returns the created cds_accounts row.
// Throws if: not SA, bad format, or duplicate number.
export async function sbCreateCDS({ cdsNumber, cdsName, phone, email }) {
  const res = await fetch(`${BASE}/rest/v1/rpc/create_cds`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({
      p_cds_number: cdsNumber,
      p_cds_name:   cdsName,
      p_phone:      phone || null,
      p_email:      email || null,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to create CDS record");
  }

  return res.json();
}

// ── Assign an existing CDS to a user ──────────────────────────────
// SA: can assign any CDS to any user.
// AD: can only assign CDS from their own pool.
// First CDS assigned to a user is auto-activated.
// Returns the created user_cds row.
export async function sbAssignCDS(userId, cdsId) {
  const res = await fetch(`${BASE}/rest/v1/rpc/assign_cds_to_user`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({
      p_user_id: userId,
      p_cds_id:  cdsId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to assign CDS");
  }

  return res.json();
}

// ── Switch the active CDS for a user ──────────────────────────────
// Atomically deactivates all then activates the target.
// Re-reads active CDS from backend after switch — never trusts the
// clicked target blindly.
export async function sbSwitchActiveCDS(userId, cdsId) {
  await fetchWithAuthRetry(
    `${BASE}/rest/v1/rpc/switch_active_cds`,
    {
      method:  "POST",
      headers: headers(token()),
      body:    JSON.stringify({ p_user_id: userId, p_cds_id: cdsId }),
    },
    "Failed to switch active CDS"
  );
  // Always return the confirmed active CDS from the backend
  return sbGetActiveCDS(userId);
}

// ── Remove a CDS assignment from a user ───────────────────────────
// SA: remove any CDS from any user.
// AD: remove only CDS from their own pool.
// If removed CDS was active, next most recent CDS auto-activates.
// Returns true on success — throws on error.
export async function sbRemoveCDS(userId, cdsId) {
  const res = await fetch(`${BASE}/rest/v1/rpc/remove_cds_from_user`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({
      p_user_id: userId,
      p_cds_id:  cdsId,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to remove CDS");
  }

  return true;
}

// ── Remove CDS from an admin with optional cascade ─────────────────
// SA only. Removes CDS from an AD.
// cascade = true  → also removes from all users assigned by this AD
// cascade = false → keeps CDS on those users, only removes from AD
// Returns: number of sub-users affected (shown in confirmation dialog)
export async function sbRemoveCDSFromAdminCascade(adminId, cdsId, cascade = false) {
  const res = await fetch(`${BASE}/rest/v1/rpc/remove_cds_from_admin_cascade`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({
      p_admin_id: adminId,
      p_cds_id:   cdsId,
      p_cascade:  cascade,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to remove CDS from admin");
  }

  // RPC returns an integer — number of affected sub-users
  const result = await res.json();
  return typeof result === "number" ? result : 0;
}

// ── Get all users assigned to a CDS ───────────────────────────────
// Used for cascade removal confirmation dialog.
// Returns: [{ user_id, full_name, role_code, is_active, assigned_at }]
export async function sbGetCDSAssignedUsers(cdsId) {
  const res = await fetch(`${BASE}/rest/v1/rpc/get_cds_assigned_users`, {
    method:  "POST",
    headers: headers(token()),
    body:    JSON.stringify({ p_cds_id: cdsId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to fetch CDS users");
  }

  return res.json();
}
