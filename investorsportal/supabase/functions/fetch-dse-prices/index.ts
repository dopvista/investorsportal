import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Sources
 * -------
 * PRIMARY   snapshot  investor.dse.co.tz/core/api/v1/market-watch/snapshot
 *                     (last-trade prices + priceChange + high/low/volume + bid/offer;
 *                     undocumented internal API of the DSE investor web app)
 * SECONDARY history   dse.co.tz/api/get/market/prices/for/range/duration
 *                     (official EOD closes for `closing_price` and daily history;
 *                     also serves as full fallback if snapshot fails)
 */

// Only currently listed DSE companies (21). Keys = symbol as returned by both
// sources (snapshot `symbol` + range/duration `company`). Values = companies.name in DB.
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

interface SnapshotRow {
  symbol: string;
  lastPrice: number;
  priceChange: number;
  priceChangePct: number;
  high: number;
  low: number;
  volume: number;
  updatedAt: string;
  bestBidPrice?: number;
  bestOfferPrice?: number;
}

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
  marketPrice: number;      // last trade if snapshot, else latest close
  previousClose: number;    // yesterday's official close (from range/duration)
  change: number;           // priceChange from snapshot, else close-vs-prev-close
  high: number;
  low: number;
  volume: number;
  quoteUpdatedAt: string | null;   // per-symbol snapshot updatedAt
  latestTradeDate: string | null;  // YYYY-MM-DD (from range/duration)
  source: "snapshot" | "closing-feed";
  history: { date: string; price: number; high: number; low: number; volume: number; change: number }[];
}

// 10s timeout on any DSE fetch
async function timedFetch(url: string, label: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": "InvestorsPortal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error(`${label} timeout (10s)`);
    throw e;
  }
}

async function fetchSnapshot(): Promise<{ rows: SnapshotRow[]; refreshedAt: string | null }> {
  const url = "https://investor.dse.co.tz/core/api/v1/market-watch/snapshot?page=0&size=100&sort=volume,desc";
  const json = await timedFetch(url, "snapshot");
  if (String(json?.code) !== "2000" || !Array.isArray(json?.data?.page?.content)) {
    throw new Error("snapshot returned unexpected envelope");
  }
  return { rows: json.data.page.content as SnapshotRow[], refreshedAt: json?.data?.lastRefreshedAt ?? null };
}

async function fetchClosingFeed(cls: "EQUITY" | "BOND" | "ETF", days: number): Promise<DseRow[]> {
  const url = `https://dse.co.tz/api/get/market/prices/for/range/duration?days=${days}&class=${cls}`;
  const json = await timedFetch(url, `closing-feed:${cls}`);
  if (json?.success !== true || !Array.isArray(json.data)) {
    throw new Error(`closing-feed ${cls} returned unexpected envelope`);
  }
  return json.data as DseRow[];
}

/**
 * Merge snapshot (last-trade) + closing feed (EOD + history) into one PriceData
 * per known symbol. Snapshot takes precedence for live values; closing feed is
 * authoritative for previous-close and daily history. Falls back cleanly when
 * snapshot is unavailable.
 */
async function fetchAllPrices(): Promise<{ prices: PriceData[]; snapshotStatus: string; snapshotRefreshedAt: string | null; latestTradeDate: string | null }> {
  const [snapshotSettled, equitySettled, etfSettled] = await Promise.allSettled([
    fetchSnapshot(),
    fetchClosingFeed("EQUITY", 5),
    fetchClosingFeed("ETF", 5),
  ]);

  const snapshotOk = snapshotSettled.status === "fulfilled";
  const snapshotStatus = snapshotOk
    ? "ok"
    : `failed: ${(snapshotSettled as PromiseRejectedResult).reason?.message ?? "unknown"}`;
  const snapshotRefreshedAt = snapshotOk ? snapshotSettled.value.refreshedAt : null;

  const snapshotBySymbol = new Map<string, SnapshotRow>();
  if (snapshotOk) {
    for (const r of snapshotSettled.value.rows) {
      const sym = (r.symbol || "").trim();
      if (sym && DSE_TO_DB_MAP[sym] !== undefined) snapshotBySymbol.set(sym, r);
    }
  }

  const closingRows: DseRow[] = [];
  if (equitySettled.status === "fulfilled") closingRows.push(...equitySettled.value);
  if (etfSettled.status === "fulfilled") closingRows.push(...etfSettled.value);

  if (!snapshotOk && closingRows.length === 0) {
    throw new Error(`both sources failed: snapshot=${snapshotStatus}; closing-feed unavailable`);
  }

  const closingBySymbol = new Map<string, DseRow[]>();
  for (const r of closingRows) {
    const sym = (r.company || "").trim();
    if (!sym || DSE_TO_DB_MAP[sym] === undefined) continue;
    if (!closingBySymbol.has(sym)) closingBySymbol.set(sym, []);
    closingBySymbol.get(sym)!.push(r);
  }
  for (const [_, rows] of closingBySymbol) {
    rows.sort((a, b) => (b.trade_date || "").localeCompare(a.trade_date || ""));
  }

  let latestTradeDate: string | null = null;
  for (const [_, rows] of closingBySymbol) {
    const d = rows[0]?.trade_date?.slice(0, 10);
    if (d && (!latestTradeDate || d > latestTradeDate)) latestTradeDate = d;
  }

  const knownSymbols = new Set<string>([...snapshotBySymbol.keys(), ...closingBySymbol.keys()]);
  const prices: PriceData[] = [];

  for (const symbol of knownSymbols) {
    if (DSE_TO_DB_MAP[symbol] === undefined) continue;
    const snap = snapshotBySymbol.get(symbol);
    const closes = closingBySymbol.get(symbol) ?? [];
    const latestClose = closes[0];
    const prevClose = closes[1];

    const snapUsable = !!snap && Number.isFinite(snap.lastPrice) && snap.lastPrice > 0;
    if (!snapUsable && !(latestClose && latestClose.closing_price > 0)) continue;

    const marketPrice = snapUsable
      ? snap!.lastPrice
      : latestClose.closing_price;

    const previousClose = prevClose?.closing_price
      ?? (snapUsable && Number.isFinite(snap!.priceChange) ? snap!.lastPrice - snap!.priceChange : 0);

    const change = snapUsable
      ? snap!.priceChange
      : (prevClose?.closing_price ? latestClose.closing_price - prevClose.closing_price : 0);

    prices.push({
      symbol,
      marketPrice,
      previousClose: previousClose > 0 ? previousClose : 0,
      change: Number.isFinite(change) ? change : 0,
      high:   snapUsable ? (snap!.high   || 0) : (latestClose?.high   || 0),
      low:    snapUsable ? (snap!.low    || 0) : (latestClose?.low    || 0),
      volume: snapUsable ? (snap!.volume || 0) : (latestClose?.volume || 0),
      quoteUpdatedAt: snapUsable ? (snap!.updatedAt ?? null) : null,
      latestTradeDate: latestClose?.trade_date?.slice(0, 10) ?? null,
      source: snapUsable ? "snapshot" : "closing-feed",
      history: closes
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

  // Fill per-row change in history (chronological, official close-to-close)
  for (const p of prices) {
    const chrono = [...p.history].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < chrono.length; i++) {
      chrono[i].change = chrono[i].price - chrono[i - 1].price;
    }
    p.history = chrono;
  }

  return { prices, snapshotStatus, snapshotRefreshedAt, latestTradeDate };
}

/**
 * Cron gate: check site_settings for enabled/fetch_days, then market window.
 * DSE publishes intraday-ish last-trade prices via the snapshot endpoint during
 * session, and the EOD close lands after 15:00 EAT. The 09:00–18:00 EAT window
 * catches both.
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

    // Step 1: Fetch snapshot + closing feed and merge
    const { prices: dsePrices, snapshotStatus, snapshotRefreshedAt, latestTradeDate } = await fetchAllPrices();
    if (dsePrices.length === 0) {
      await updateFetchStatus(supabase, "error: no prices from DSE", 0);
      return new Response(
        JSON.stringify({ success: false, error: "Could not fetch any prices from DSE" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Load current companies rows
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
      const newClosing = dsePrice.previousClose > 0 ? dsePrice.previousClose : oldClosing;

      const dseFields = {
        dse_change: dsePrice.change,
        dse_high:   dsePrice.high,
        dse_low:    dsePrice.low,
        dse_volume: dsePrice.volume,
      };

      const priceChanged   = oldPrice !== newPrice;
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
          quote_updated_at: op.dsePrice.quoteUpdatedAt,
          source: op.dsePrice.source,
          status: "updated",
        });
      }
    }
    const unchangedCount = updateOps.length - updatedCount - errorCount;

    // Step 4: Upsert daily price history — ONLY from official EOD closes, never
    // from intraday last-trades. Covers all dates returned so gaps get backfilled.
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

    const primarySnapshotCount = dsePrices.filter(p => p.source === "snapshot").length;
    const statusLabel = primarySnapshotCount > 0
      ? `success (${primarySnapshotCount}/${dsePrices.length} via snapshot)`
      : "success (closing-feed fallback)";
    await updateFetchStatus(supabase, statusLabel, updatedCount);

    return new Response(
      JSON.stringify({
        success: true,
        source: "investor.dse.co.tz snapshot (primary) + dse.co.tz range/duration (secondary)",
        snapshot_status: snapshotStatus,
        snapshot_refreshed_at: snapshotRefreshedAt,
        latest_trade_date: latestTradeDate,
        fetched_at: now,
        total_dse_prices: dsePrices.length,
        snapshot_used_count: primarySnapshotCount,
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
