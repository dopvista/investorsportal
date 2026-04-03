// src/components/DSEPriceSettings.jsx
// Settings panel for DSE Auto-Fetch — used inside SystemSettingsPage

import { useState, memo } from "react";
import { useDSEPriceFetch } from "../hooks/useDSEPriceFetch";

const DSEPriceSettings = memo(function DSEPriceSettings({ supabase }) {
  const {
    enabled, loading, toggling, fetching,
    lastFetchAt, lastFetchStatus, lastFetchCount, schedule,
    toggleAutoFetch, fetchNow, fetchResult, error,
  } = useDSEPriceFetch(supabase);

  const [showResult, setShowResult] = useState(false);

  const handleFetchNow = async () => {
    setShowResult(false);
    const result = await fetchNow("Manual Fetch (Settings)");
    if (result) setShowResult(true);
  };

  const formatDate = (iso) => {
    if (!iso) return "Never";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const formatSchedule = (cron) => {
    if (cron === "0 12 * * 1-5") return "Mon\u2013Fri at 3:00 PM (EAT)";
    return cron;
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "#94a3b8" }}>
        Loading price update settings...
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{
          fontSize: 20, fontWeight: 700, margin: 0,
          display: "flex", alignItems: "center", gap: 8,
          color: "#f1f5f9",
        }}>
          DSE Price Updates
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#94a3b8" }}>
          Automatically fetch and update share prices from the Dar es Salaam Stock Exchange
        </p>
      </div>

      {/* Toggle Card */}
      <div style={{
        background: "rgba(30, 41, 59, 0.7)",
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.1)",
        padding: 20,
        marginBottom: 16,
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
              Auto-Fetch Prices
            </div>
            <div style={{ fontSize: 13, color: "#94a3b8" }}>
              When enabled, prices are automatically fetched from DSE website on schedule
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            onClick={toggleAutoFetch}
            disabled={toggling}
            style={{
              position: "relative",
              width: 52, height: 28, borderRadius: 14,
              border: "none",
              cursor: toggling ? "wait" : "pointer",
              background: enabled ? "#22c55e" : "rgba(100, 116, 139, 0.4)",
              transition: "background 0.2s ease",
              flexShrink: 0, outline: "none",
            }}
            title={enabled ? "Click to disable auto-fetch" : "Click to enable auto-fetch"}
          >
            <div style={{
              position: "absolute", top: 3,
              left: enabled ? 27 : 3,
              width: 22, height: 22, borderRadius: "50%",
              background: "#fff",
              transition: "left 0.2s ease",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </button>
        </div>

        {/* Status indicator */}
        <div style={{
          marginTop: 12, padding: "8px 12px", borderRadius: 8,
          background: enabled ? "rgba(34, 197, 94, 0.1)" : "rgba(100, 116, 139, 0.1)",
          border: `1px solid ${enabled ? "rgba(34, 197, 94, 0.2)" : "rgba(100, 116, 139, 0.15)"}`,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%",
            background: enabled ? "#22c55e" : "#64748b",
            display: "inline-block",
          }} />
          <span style={{ fontSize: 13, color: enabled ? "#86efac" : "#94a3b8" }}>
            {enabled ? "Active" : "Disabled"} \u2014 Schedule: {formatSchedule(schedule)}
          </span>
        </div>
      </div>

      {/* Last Fetch Info Card */}
      <div style={{
        background: "rgba(30, 41, 59, 0.7)",
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.1)",
        padding: 20, marginBottom: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 12 }}>
          Last Fetch
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>TIME</div>
            <div style={{ fontSize: 14, color: "#cbd5e1" }}>{formatDate(lastFetchAt)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>STATUS</div>
            <div style={{
              fontSize: 14,
              color: lastFetchStatus === "success" ? "#86efac"
                : lastFetchStatus?.startsWith("error") ? "#fca5a5" : "#94a3b8",
            }}>
              {lastFetchStatus || "\u2014"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>PRICES UPDATED</div>
            <div style={{ fontSize: 14, color: "#cbd5e1" }}>{lastFetchCount || "\u2014"}</div>
          </div>
        </div>
      </div>

      {/* Manual Fetch Card */}
      <div style={{
        background: "rgba(30, 41, 59, 0.7)",
        borderRadius: 12,
        border: "1px solid rgba(148, 163, 184, 0.1)",
        padding: 20, marginBottom: 16,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", marginBottom: 4 }}>
          Manual Fetch
        </div>
        <p style={{ fontSize: 13, color: "#94a3b8", margin: "0 0 12px" }}>
          Fetch prices from DSE right now, regardless of the auto-fetch toggle
        </p>
        <button
          onClick={handleFetchNow}
          disabled={fetching}
          style={{
            padding: "10px 20px", borderRadius: 8,
            border: "none",
            background: fetching ? "rgba(59, 130, 246, 0.3)" : "#3b82f6",
            color: "#fff", fontWeight: 600, fontSize: 14,
            cursor: fetching ? "wait" : "pointer",
            display: "flex", alignItems: "center", gap: 8,
            transition: "background 0.2s",
          }}
        >
          {fetching ? (
            <>
              <span style={{
                width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "#fff", borderRadius: "50%",
                display: "inline-block",
                animation: "spin 0.8s linear infinite",
              }} />
              Fetching from DSE...
            </>
          ) : (
            <>Fetch Prices Now</>
          )}
        </button>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Error display */}
        {error && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 8,
            background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)",
            color: "#fca5a5", fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Success result */}
        {showResult && fetchResult && (
          <div style={{
            marginTop: 12, padding: "12px 14px", borderRadius: 8,
            background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)",
          }}>
            <div style={{ color: "#86efac", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
              Prices fetched successfully
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 13 }}>
              <div>
                <span style={{ color: "#64748b" }}>DSE Prices: </span>
                <span style={{ color: "#cbd5e1" }}>{fetchResult.total_dse_prices}</span>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Updated: </span>
                <span style={{ color: "#86efac" }}>{fetchResult.updated_count}</span>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Unchanged: </span>
                <span style={{ color: "#cbd5e1" }}>{fetchResult.skipped_unchanged}</span>
              </div>
            </div>

            {fetchResult.updates?.length > 0 && (
              <div style={{ marginTop: 10, borderTop: "1px solid rgba(148,163,184,0.1)", paddingTop: 10 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>UPDATED COMPANIES</div>
                {fetchResult.updates.map((u, i) => (
                  <div key={i} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "4px 0", fontSize: 13,
                  }}>
                    <span style={{ color: "#cbd5e1" }}>{u.company}</span>
                    <span style={{ color: u.change > 0 ? "#86efac" : u.change < 0 ? "#fca5a5" : "#94a3b8" }}>
                      {u.old_price?.toLocaleString()} \u2192 {u.new_price?.toLocaleString()}
                      {" "}({u.change > 0 ? "+" : ""}{u.change?.toLocaleString()})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info box */}
      <div style={{
        padding: "12px 16px", borderRadius: 8,
        background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.15)",
        fontSize: 13, color: "#93c5fd", lineHeight: 1.5,
      }}>
        <strong>How it works:</strong> When auto-fetch is enabled, the system automatically
        fetches the latest prices from the DSE website every weekday at 3:00 PM (EAT) and updates
        both the global company prices and your CDS portfolio prices. You can also manually trigger
        a fetch at any time using the button above.
      </div>
    </div>
  );
});

export default DSEPriceSettings;
