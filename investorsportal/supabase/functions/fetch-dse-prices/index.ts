import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Only currently listed DSE companies (21). Keys = symbol as returned by
// `company` field on dse.co.tz range-duration API. Values = companies.name in DB.
const DSE_TO_DB_MAP: Record<string, string> = {
  "AFRIPRISE": "AFRIPRISE",
  "CRDB": "CRDB",
  "DCB": "DCB",
  "DSE": "DSE",
  "MBP": "MBP",
  "MCB": "MCB",
  "MKCB": "MKCB",
  "MUCOBA": "MUCOBA",
  "NICO": "NICO",
  "NMB": "NMB",
  "PAL": "PAL",
  "SWIS": "SWIS",
  "TBL": "TBL",
  "TCC": "TCC",
  "TCCL": "TCCL",
  "TOL": "TOL",
  "TPCC": "TPCC",
  "TTP": "TTP",
  "VODA": "VODA",
  "IEACLC-ETF": "IEACLC-ETF",
  "VERTEX-ETF": "VERTEX ETF",
};

interface DseRow {
  company: string;
  fullName?: string;
  trade_date: string;
  turnover: number;
  volume: number;
  high: number;
  low: number;
  opening_price: number;
  closing_price: number;
}

interface PriceData {
  symbol: string;
  marketPrice: number;   // latest closing_price
  previousClose: number; // 2nd-latest closing_price (0 if unknown)
  openingPrice: number;  // latest opening_price
  change: number;        // marketPrice - previousClose
  high: number;
  low: number;
  volume: number;
  tradeDate: string;     // YYYY-MM-DD from the latest row
  history: { date: string; price: number; high: number; low: number; volume: number; change: number }[];
}

// 10s timeout on DSE API fetch
async function fetchDseClass(cls: "EQUITY" | "BOND" | "ETF", days: number): Promise<DseRow[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  const url = `https://dse.co.tz/api/get/market/prices/for/range/duration?days=${days}&class=${cls}`;
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "InvestorsPortal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`DSE API ${cls} failed: ${res.status}`);
    const json = await res.json();
    if (json?.success !== true || !Array.isArray(json.data)) {
      throw new Error(`DSE API ${cls} returned unexpected envelope`);
    }
    return json.data as DseRow[];
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error(`DSE API ${cls} timeout (10s)`);
    throw e;
  }
}

/**
 * Fetch EQUITY + ETF in parallel, group rows by symbol, and derive a single
 * PriceData per known company. Change is computed as latest_close − prev_close.
 */
async function fetchAllPrices(): Promise<PriceData[]> {
  const [equityRows, etfRows] = await Promise.all([
    fetchDseClass("EQUITY", 5),
    fetchDseClass("ETF", 5).catch(() => [] as DseRow[]), // ETF is nice-to-have
  ]);

  const bySymbol = new Map<string, DseRow[]>();
  for (const r of [...equityRows, ...etfRows]) {
    const sym = (r.company || "").trim();
    if (!sym || DSE_TO_DB_MAP[sym] === undefined) continue;
    if (!bySymbol.has(sym)) bySymbol.set(sym, []);
    bySymbol.get(sym)!.push(r);
  }

  const out: PriceData[] = [];
  for (const [symbol, rows] of bySymbol) {
    // sort desc by trade_date
    rows.sort((a, b) => (b.trade_date || "").localeCompare(a.trade_date || ""));
    const latest = rows[0];
    const prev = rows[1];
    if (!latest || !(latest.closing_price > 0)) continue;

    out.push({
      symbol,
      marketPrice: latest.closing_price,
      previousClose: prev?.closing_price || 0,
      openingPrice: latest.opening_price || 0,
      change: prev?.closing_price ? latest.closing_price - prev.closing_price : 0,
      high: latest.high || 0,
      low: latest.low || 0,
      volume: latest.volume || 0,
      tradeDate: (latest.trade_date || "").slice(0, 10),
      history: rows
        .filter(r => r.closing_price > 0 && r.trade_date)
        .map(r => ({
          date: r.trade_date.slice(0, 10),
          price: r.closing_price,
          high: r.high || 0,
          low: r.low || 0,
          volume: r.volume || 0,
          change: 0, // filled below
        })),
    });
  }

  // Fill per-row change in history (chronological)
  for (const p of out) {
    const chrono = [...p.history].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < chrono.length; i++) {
      chrono[i].change = chrono[i].price - chrono[i - 1].price;
    }
    p.history = chrono;
  }

  return out;
}

/**
 * Cron gate: check site_settings for enabled/fetch_days, then market window.
 * DSE public feed is EOD-snapshot — data lands after 15:00 EAT close, so
 * the window is 09:00–18:00 EAT to catch the post-close settlement.
 */
async function shouldProceed(supabase: any): Promise<{ proceed: boolean; reason?: string }> {
  let fetchDays = "weekdays";
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "auto_fetch_dse_prices")
      .single();
    if (data?.value) {
      if (data.value.enabled === false) {
        return { proceed: false, reason: "auto-fetch disabled in site_settings" };
      }
      fetchDays = data.value.fetch_days || "weekdays";
    }
  } catch (_) {}

  const nowUtc = new Date();
  const eatMs = nowUtc.getTime() + 3 * 60 * 60 * 1000;
  const eat = new Date(eatMs);
  const eatDay = eat.getUTCDay();
  const eatHour = eat.getUTCHours();

  if (fetchDays === "weekdays" && (eatDay === 0 || eatDay === 6)) {
    return { proceed: false, reason: "weekend" };
  }
  if (eatHour < 9 || eatHour >= 18) {
    return { proceed: false, reason: `outside fetch window (EAT ${eatHour}:xx, window 09:00-18:00)` };
  }
  return { proceed: true };
}

async function updateFetchStatus(supabase: any, status: string, count: number) {
  try {
    const { data } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "auto_fetch_dse_prices")
      .single();
    if (data) {
      await supabase
        .from("site_settings")
        .update({
          value: { ...data.value, last_fetch_at: new Date().toISOString(), last_fetch_status: status, last_fetch_count: count },
          updated_at: new Date().toISOString(),
        })
        .eq("key", "auto_fetch_dse_prices");
    }
  } catch (e) {
    console.error("Failed to update fetch status:", e);
  }
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let isCronTrigger = false;
    try {
      const body = await req.json();
      if (body.source === "cron") isCronTrigger = true;
    } catch (_) {}

    if (isCronTrigger) {
      const { proceed, reason } = await shouldProceed(supabase);
      if (!proceed) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 1: Fetch latest DSE snapshot (equities + ETFs)
    const dsePrices = await fetchAllPrices();
    if (dsePrices.length === 0) {
      await updateFetchStatus(supabase, "error: no prices from DSE API", 0);
      return new Response(
        JSON.stringify({ success: false, error: "Could not fetch any prices from DSE API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Load current companies row for each known symbol
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name, price, closing_price");
    if (compErr) throw compErr;

    const companyMap = new Map((companies ?? []).map((c: any) => [c.name, c]));
    const now = new Date().toISOString();

    // Step 3: Build parallel update ops
    const updateOps: { dbName: string; promise: Promise<any>; dsePrice: PriceData; oldPrice: number; changed: boolean }[] = [];

    for (const dsePrice of dsePrices) {
      const dbName = DSE_TO_DB_MAP[dsePrice.symbol];
      if (!dbName) continue;

      const company = companyMap.get(dbName);
      if (!company) continue;

      const oldPrice   = parseFloat(company.price) || 0;
      const oldClosing = parseFloat(company.closing_price) || 0;
      const newPrice   = dsePrice.marketPrice;
      // `closing_price` DB column = actual previous-day close from API (was
      // approximated by `opening_price` on the old endpoint).
      const newClosing = dsePrice.previousClose > 0 ? dsePrice.previousClose : oldClosing;

      const dseFields = {
        dse_change: dsePrice.change,
        dse_high:   dsePrice.high,
        dse_low:    dsePrice.low,
        dse_volume: dsePrice.volume,
      };

      const priceChanged = oldPrice !== newPrice;
      const closingChanged = newClosing > 0 && oldClosing !== newClosing;

      const update: Record<string, any> = { ...dseFields, updated_at: now };
      if (priceChanged) {
        update.previous_price = oldPrice;
        update.price = newPrice;
      }
      if (closingChanged) {
        update.closing_price = newClosing;
      }

      updateOps.push({
        dbName,
        oldPrice,
        dsePrice,
        changed: priceChanged,
        promise: supabase.from("companies").update(update).eq("id", company.id),
      });
    }

    const settled = await Promise.allSettled(updateOps.map(op => op.promise));

    let updatedCount = 0;
    let errorCount = 0;
    const updates: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < settled.length; i++) {
      const op = updateOps[i];
      const outcome = settled[i];
      if (outcome.status === "rejected" || outcome.value?.error) {
        errorCount++;
        const errMsg = outcome.status === "rejected"
          ? outcome.reason?.message
          : outcome.value.error.message;
        errors.push({ company: op.dbName, status: "error", error: errMsg });
      } else if (op.changed) {
        updatedCount++;
        updates.push({
          company: op.dbName,
          old_price: op.oldPrice,
          market_price: op.dsePrice.marketPrice,
          closing_price: op.dsePrice.previousClose,
          change: op.dsePrice.change,
          volume: op.dsePrice.volume,
          status: "updated",
        });
      }
    }
    const unchangedCount = updateOps.length - updatedCount - errorCount;

    // Step 4: Upsert daily price history — one row per (company, trade_date)
    // across ALL dates returned by the API (backfills any missed days).
    const historyRows: any[] = [];
    for (const dp of dsePrices) {
      const dbName = DSE_TO_DB_MAP[dp.symbol];
      const company = dbName ? companyMap.get(dbName) : null;
      if (!company) continue;
      for (const h of dp.history) {
        historyRows.push({
          company_id: company.id,
          date: h.date,
          price: h.price,
          high: h.high,
          low: h.low,
          volume: h.volume,
          change: h.change,
        });
      }
    }

    if (historyRows.length > 0) {
      try {
        await supabase
          .from("company_price_history")
          .upsert(historyRows, { onConflict: "company_id,date" });
      } catch (e) {
        console.error("Failed to upsert price history:", e);
      }
    }

    await updateFetchStatus(supabase, "success", updatedCount);

    return new Response(
      JSON.stringify({
        success: true,
        source: "dse.co.tz/api/get/market/prices/for/range/duration",
        fetched_at: now,
        latest_trade_date: dsePrices[0]?.tradeDate ?? null,
        total_dse_prices: dsePrices.length,
        updated_count: updatedCount,
        skipped_unchanged: unchangedCount,
        updates,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    try {
      await updateFetchStatus(supabase, "error: " + err.message, 0);
    } catch (_) {}
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
