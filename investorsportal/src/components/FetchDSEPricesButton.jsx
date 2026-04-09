// src/components/FetchDSEPricesButton.jsx
// Compact "Fetch DSE Prices" button for the Portfolio page header

import { useState } from "react";
import { sbCopyMarketPricesToCds } from "../lib/supabase";

export default function FetchDSEPricesButton({ supabase, cdsNumber, onComplete }) {
  const [fetching, setFetching] = useState(false);
  const [result, setResult] = useState(null);

  const handleFetch = async () => {
    try {
      setFetching(true);
      setResult(null);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || anonKey;

      const body = { updated_by: "Manual Fetch (Portfolio)" };
      if (cdsNumber) body.cds_number = cdsNumber;

      const res = await fetch(supabaseUrl + "/functions/v1/fetch-dse-prices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
          "apikey": anonKey,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Fetch failed");
      }

      // Copy updated market prices to user's CDS portfolio
      if (cdsNumber) {
        try {
          await sbCopyMarketPricesToCds(cdsNumber, "Manual Fetch");
        } catch (e) {
          console.warn("[FetchDSEPricesButton] CDS copy failed:", e);
        }
      }

      const n = data.updated_count ?? 0;
      const unchanged = data.skipped_unchanged ?? 0;
      const msg = n > 0
        ? `${n} price${n !== 1 ? "s" : ""} updated from DSE`
        : unchanged > 0
          ? `All ${unchanged} prices already up to date`
          : "No new prices found from DSE";
      setResult({ type: "success", msg });

      if (onComplete) onComplete(data);
      setTimeout(() => setResult(null), 5000);
    } catch (e) {
      setResult({ type: "error", msg: e.message });
      setTimeout(() => setResult(null), 8000);
    } finally {
      setFetching(false);
    }
  };

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, position: "relative" }}>
      <button
        onClick={handleFetch}
        disabled={fetching}
        title="Fetch latest prices from DSE website"
        style={{
          padding: "6px 14px",
          borderRadius: 6,
          border: "1px solid rgba(59, 130, 246, 0.3)",
          background: fetching ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.1)",
          color: fetching ? "#93c5fd" : "#60a5fa",
          fontWeight: 500,
          fontSize: 13,
          cursor: fetching ? "wait" : "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          transition: "all 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        {fetching ? (
          <>
            <span style={{
              width: 14, height: 14,
              border: "2px solid rgba(96,165,250,0.3)",
              borderTopColor: "#60a5fa",
              borderRadius: "50%",
              display: "inline-block",
              animation: "dse-spin 0.8s linear infinite",
            }} />
            Fetching...
          </>
        ) : (
          <>DSE Prices</>
        )}
      </button>

      <style>{`@keyframes dse-spin { to { transform: rotate(360deg); } }`}</style>

      {result && (
        <div style={{
          position: "absolute",
          top: "100%",
          left: 0,
          marginTop: 6,
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          whiteSpace: "nowrap",
          zIndex: 50,
          background: result.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          border: "1px solid " + (result.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"),
          color: result.type === "success" ? "#86efac" : "#fca5a5",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {result.msg}
        </div>
      )}
    </div>
  );
          }
