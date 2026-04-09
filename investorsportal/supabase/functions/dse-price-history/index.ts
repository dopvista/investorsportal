import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") || "";
    const days = parseInt(url.searchParams.get("days") || "30", 10);

    if (!symbol || days < 1 || days > 365) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid symbol or days (1-365)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dseUrl = `https://dse.co.tz/api/get/market/prices/for/range/duration?security_code=${encodeURIComponent(symbol)}&days=${days}&class=EQUITY`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(dseUrl, {
      headers: { "Accept": "application/json", "User-Agent": "InvestorsPortal/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `DSE API returned ${res.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const json = await res.json();

    return new Response(JSON.stringify(json), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
