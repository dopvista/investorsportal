// api/cron/fetch-dse-prices.js
// Vercel cron handler — fires at 06:00, 09:00, 12:00, 14:00 UTC
// (= 09:00, 12:00, 15:00, 17:00 EAT).
// The Supabase edge function checks site_settings to decide whether the
// current time is in the SA-configured schedule before doing any work.

export const config = { runtime: "edge" };

export default async function handler(req) {
  // Vercel automatically sets CRON_SECRET and sends it as Authorization header
  // for cron-triggered requests. Reject anything else.
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET ?? "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl  = process.env.VITE_SUPABASE_URL  ?? process.env.SUPABASE_URL  ?? "";
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !supabaseAnon) {
    return new Response(JSON.stringify({ error: "Missing Supabase env vars" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const edgeFnUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/fetch-dse-prices`;

  const response = await fetch(edgeFnUrl, {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseAnon,
    },
    body: JSON.stringify({
      source:     "cron",
      updated_by: "Scheduled Auto-Fetch",
    }),
  });

  const data = await response.json().catch(() => ({ raw: await response.text() }));

  return new Response(JSON.stringify(data), {
    status: response.ok ? 200 : response.status,
    headers: { "Content-Type": "application/json" },
  });
}
