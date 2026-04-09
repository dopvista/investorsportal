import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Only currently listed DSE companies (21)
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

interface PriceData {
  symbol: string;
  marketPrice: number;
  openingPrice: number;
  change: number;
  high: number;
  low: number;
  volume: number;
}

// 10s timeout on DSE API fetch
async function fetchDSEPrices(): Promise<PriceData[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch("https://api.dse.co.tz/api/market-data?isBond=false", {
      headers: { "User-Agent": "InvestorsPortal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`DSE API failed: ${res.status}`);
    const json = await res.json();

    if (!Array.isArray(json)) {
      throw new Error("DSE API returned unexpected format");
    }

    const prices: PriceData[] = [];
    for (const stock of json) {
      const symbol = (stock.company?.symbol || "").trim();
      const marketPrice = stock.marketPrice || 0;
      if (symbol && marketPrice > 0 && DSE_TO_DB_MAP[symbol] !== undefined) {
        prices.push({
          symbol,
          marketPrice,
          openingPrice: stock.openingPrice || 0,
          change: stock.change || 0,
          high: stock.high || 0,
          low: stock.low || 0,
          volume: stock.volume || 0,
        });
      }
    }

    return prices;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === "AbortError") throw new Error("DSE API timeout (10s)");
    throw e;
  }
}

/** Check site_settings for enabled/fetch_days, then fall back to market hours */
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
  if (eatHour < 9 || eatHour >= 17) {
    return { proceed: false, reason: `outside market hours (EAT ${eatHour}:xx, market 09:00-17:00)` };
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

    // Cron: check site_settings + market hours
    if (isCronTrigger) {
      const { proceed, reason } = await shouldProceed(supabase);
      if (!proceed) {
        return new Response(
          JSON.stringify({ success: true, skipped: true, reason }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Step 1: Fetch real-time market prices
    const dsePrices = await fetchDSEPrices();
    if (dsePrices.length === 0) {
      await updateFetchStatus(supabase, "error: no prices from DSE API", 0);
      return new Response(
        JSON.stringify({ success: false, error: "Could not fetch any prices from DSE API" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Get all companies from DB
    const { data: companies, error: compErr } = await supabase
      .from("companies")
      .select("id, name, price, closing_price");
    if (compErr) throw compErr;

    const companyMap = new Map((companies ?? []).map((c: any) => [c.name, c]));
    const now = new Date().toISOString();

    // Step 3: Build update operations — F1 fix: batch with Promise.all
    const updateOps: { dbName: string; promise: Promise<any>; dsePrice: PriceData; oldPrice: number }[] = [];
    const skipped: string[] = [];

    for (const dsePrice of dsePrices) {
      const dbName = DSE_TO_DB_MAP[dsePrice.symbol];
      if (!dbName) continue;

      const company = companyMap.get(dbName);
      if (!company) continue;

      const oldPrice    = parseFloat(company.price) || 0;
      const newPrice    = dsePrice.marketPrice;
      const oldClosing  = parseFloat(company.closing_price) || 0;
      const newClosing  = dsePrice.openingPrice || 0;

      // Skip entirely if both price and closing_price are unchanged
      if (oldPrice === newPrice && (newClosing === 0 || oldClosing === newClosing)) {
        skipped.push(dbName);
        continue;
      }

      // Price unchanged but closing_price needs update
      if (oldPrice === newPrice) {
        updateOps.push({
          dbName,
          oldPrice,
          dsePrice,
          promise: supabase
            .from("companies")
            .update({ closing_price: newClosing, updated_at: now })
            .eq("id", company.id),
        });
        continue;
      }

      // Price changed — full update
      updateOps.push({
        dbName,
        oldPrice,
        dsePrice,
        promise: supabase
          .from("companies")
          .update({
            previous_price: oldPrice,
            price: newPrice,
            closing_price: newClosing > 0 ? newClosing : oldClosing,
            updated_at: now,
          })
          .eq("id", company.id),
      });
    }

    // Execute all updates in parallel
    const settled = await Promise.allSettled(updateOps.map(op => op.promise));

    const results: any[] = [];
    for (let i = 0; i < settled.length; i++) {
      const op = updateOps[i];
      const outcome = settled[i];

      if (outcome.status === "rejected" || outcome.value?.error) {
        const errMsg = outcome.status === "rejected"
          ? outcome.reason?.message
          : outcome.value.error.message;
        results.push({ company: op.dbName, status: "error", error: errMsg });
      } else if (op.dsePrice.marketPrice !== op.oldPrice) {
        results.push({
          company: op.dbName,
          old_price: op.oldPrice,
          market_price: op.dsePrice.marketPrice,
          closing_price: op.dsePrice.openingPrice,
          change: op.dsePrice.change,
          volume: op.dsePrice.volume,
          status: "updated",
        });
      }
    }

    const updatedCount = results.filter(r => r.status === "updated").length;
    await updateFetchStatus(supabase, "success", updatedCount);

    return new Response(
      JSON.stringify({
        success: true,
        source: "api.dse.co.tz/api/market-data",
        fetched_at: now,
        total_dse_prices: dsePrices.length,
        updated_count: updatedCount,
        skipped_unchanged: skipped.length + updateOps.length - results.length + results.filter(r => r.status === "error").length,
        updates: results.filter(r => r.status === "updated"),
        errors: results.filter(r => r.status === "error"),
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
