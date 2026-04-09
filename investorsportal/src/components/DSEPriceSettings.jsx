// src/components/DSEPriceSettings.jsx
// System-level DSE price settings — SuperAdmin only, global companies table.

import { useState, memo } from "react";
import { useTheme } from "./ui";
import { Icon } from "../lib/icons";
import { useDSEPriceFetch } from "../hooks/useDSEPriceFetch";

function fmtDate(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ════════════════════════════════════════════════════════════════════
const DSEPriceSettings = memo(function DSEPriceSettings({ supabase }) {
  const { C, isDark } = useTheme();

  const {
    enabled, loading, toggling, fetching, savingSchedule,
    fetchDays,
    lastFetchAt, lastFetchStatus, lastFetchCount,
    toggleAutoFetch, updateFetchDays,
    fetchNow, error,
  } = useDSEPriceFetch(supabase);

  const [fetchMsg, setFetchMsg] = useState(null);

  const handleFetchNow = async () => {
    setFetchMsg(null);
    const result = await fetchNow("SA Manual Fetch");
    if (result) setFetchMsg({ result });
  };

  const handleDaysChange = async (days) => {
    if (savingSchedule || days === fetchDays) return;
    await updateFetchDays(days);
  };

  const statusOk  = lastFetchStatus === "success";
  const statusErr = lastFetchStatus?.startsWith("error");

  // ── Shared helpers ────────────────────────────────────────────────
  const card = (children, extra = {}) => (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "18px 20px", flexShrink: 0, ...extra }}>
      {children}
    </div>
  );

  const sectionLabel = (text) => (
    <div style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray300 : C.navy, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
      {text}
    </div>
  );

  if (loading) return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: 40, textAlign: "center", color: C.gray400 }}>
      <style>{`@keyframes _dseSpin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 20, height: 20, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "_dseSpin 0.8s linear infinite", margin: "0 auto 10px" }} />
      <div style={{ fontSize: 12 }}>Loading price settings...</div>
    </div>
  );

  return (
    <>
      <style>{`@keyframes _dseSpin{to{transform:rotate(360deg)}}`}</style>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
          <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="barChart" size={15} stroke="#ffffff" sw={2.5} />
            DSE Price Updates
          </div>
          <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 3, fontWeight: 500 }}>
            Server-side price fetch — updates global <em>companies</em> table for all users
          </div>
        </div>
      </div>

      {/* ── Server Cron Toggle ─────────────────────────────────────── */}
      {card(
        <>
          {sectionLabel("Server Auto-Fetch (Cron)")}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Enable Server Cron</div>
              <div style={{ fontSize: 12, color: C.gray500 }}>Fetches DSE prices every 5 minutes during market hours (09:00–16:00 EAT)</div>
            </div>
            <button onClick={toggleAutoFetch} disabled={toggling}
              style={{ position: "relative", width: 52, height: 28, borderRadius: 14, border: "none", cursor: toggling ? "wait" : "pointer", background: enabled ? C.green : (isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"), transition: "background 0.2s", flexShrink: 0, outline: "none" }}>
              <div style={{ position: "absolute", top: 3, left: enabled ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
            </button>
          </div>

          {/* Status pill */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 20, background: enabled ? (isDark ? "rgba(34,197,94,0.12)" : "#f0fdf4") : (isDark ? "rgba(255,255,255,0.05)" : C.gray50), border: `1px solid ${enabled ? (isDark ? "rgba(34,197,94,0.3)" : "#bbf7d0") : C.gray200}`, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: enabled ? C.green : C.gray400, display: "inline-block" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? C.green : C.gray500 }}>
              {enabled ? "Active" : "Disabled"}
            </span>
            {enabled && (
              <span style={{ fontSize: 11, color: C.gray500 }}>
                — Every 5 min · {fetchDays === "weekdays" ? "Weekdays" : "Every day"} · 09:00–16:00 EAT
              </span>
            )}
          </div>

          {/* Day selector */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>Fetch Days</div>
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { value: "weekdays", label: "Mon – Fri" },
              { value: "everyday", label: "Every Day" },
            ].map(({ value, label }) => {
              const active = fetchDays === value;
              return (
                <button key={value} onClick={() => handleDaysChange(value)} disabled={savingSchedule}
                  style={{ flex: 1, padding: "9px 12px", borderRadius: 10, cursor: savingSchedule ? "wait" : "pointer", border: `1.5px solid ${active ? (isDark ? C.green : C.navy) : C.gray200}`, background: active ? (isDark ? `${C.green}12` : `${C.navy}08`) : C.white, fontSize: 13, fontWeight: active ? 700 : 500, color: active ? (isDark ? C.green : C.navy) : C.gray500, fontFamily: "inherit", transition: "all 0.15s" }}>
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Last Fetch Status ────────────────────────────────────── */}
      {card(
        <>
          {sectionLabel("Last Fetch")}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
            {[
              { label: statusOk && lastFetchCount === 0 ? "Already Current" : "Prices Updated", value: statusOk && lastFetchCount === 0 ? "✓" : (lastFetchCount ?? 0), color: statusOk ? C.green : C.text },
              { label: "Status", value: statusOk ? "Success" : statusErr ? "Error" : "—", color: statusOk ? C.green : statusErr ? C.red : C.gray400 },
              { label: "Time", value: lastFetchAt ? new Date(lastFetchAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—", color: C.text },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center", padding: "10px 14px", borderRadius: 10, background: isDark ? "rgba(255,255,255,0.04)" : C.gray50, border: `1px solid ${C.gray200}` }}>
                <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: 10, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "8px 12px", borderRadius: 9, background: isDark ? "rgba(255,255,255,0.03)" : C.gray50, border: `1px solid ${C.gray200}`, fontSize: 12, color: C.gray500 }}>
            <strong style={{ color: C.text }}>Last run:</strong>&nbsp;{fmtDate(lastFetchAt)}
            {lastFetchStatus && (
              <span style={{ marginLeft: 12, fontWeight: 700, color: statusOk ? C.green : statusErr ? C.red : C.gray400 }}>
                {statusOk ? "✓ Success" : lastFetchStatus}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Manual Fetch ──────────────────────────────────────────── */}
      {card(
        <>
          {sectionLabel("Manual Fetch")}
          <div style={{ fontSize: 12, color: C.gray500, marginBottom: 14, lineHeight: 1.5 }}>
            Fetch all DSE prices immediately — updates the global companies table regardless of schedule or market hours.
          </div>

          {error && !fetchMsg && (
            <div style={{ marginBottom: 12, padding: "10px 14px", borderRadius: 9, background: isDark ? "rgba(239,68,68,0.12)" : "#fef2f2", border: `1px solid ${isDark ? "rgba(239,68,68,0.25)" : "#fecaca"}`, color: C.red, fontSize: 12 }}>
              {error}
            </div>
          )}

          <button onClick={handleFetchNow} disabled={fetching}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 22px", borderRadius: 9, border: "none", background: fetching ? (isDark ? "rgba(59,130,246,0.3)" : "#93c5fd") : "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 13, cursor: fetching ? "wait" : "pointer", fontFamily: "inherit", transition: "background 0.15s" }}>
            {fetching
              ? <><span style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block", animation: "_dseSpin 0.8s linear infinite" }} />Fetching from DSE...</>
              : <><Icon name="download" size={14} stroke="#fff" sw={2} />Fetch Prices Now</>}
          </button>

          {fetchMsg?.result && (
            <div style={{ marginTop: 16, borderRadius: 10, overflow: "hidden", border: `1px solid ${isDark ? "rgba(34,197,94,0.3)" : "#bbf7d0"}` }}>
              <div style={{ background: isDark ? "rgba(34,197,94,0.1)" : "#f0fdf4", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Fetch Successful</span>
                <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
                  <span style={{ color: C.gray500 }}>DSE prices: <strong style={{ color: C.text }}>{fetchMsg.result.total_dse_prices}</strong></span>
                  <span style={{ color: C.gray500 }}>Updated: <strong style={{ color: fetchMsg.result.updated_count > 0 ? C.green : C.gray400 }}>{fetchMsg.result.updated_count}</strong></span>
                  <span style={{ color: C.gray500 }}>Unchanged: <strong style={{ color: C.text }}>{fetchMsg.result.skipped_unchanged}</strong></span>
                </div>
              </div>
              {fetchMsg.result.updates?.length > 0 ? (
                <div style={{ maxHeight: 280, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: isDark ? "rgba(255,255,255,0.04)" : C.gray50 }}>
                        {["Company", "Previous", "New Price", "Change"].map(h => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: h === "Company" ? "left" : "right", color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${C.gray200}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fetchMsg.result.updates.map((u, i) => {
                        const up = u.change > 0, dn = u.change < 0;
                        return (
                          <tr key={i} style={{ borderBottom: `1px solid ${C.gray100}` }}
                            onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : C.gray50; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <td style={{ padding: "8px 16px", fontWeight: 600, fontSize: 13, color: C.text }}>{u.company}</td>
                            <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, color: C.gray500 }}>{u.old_price?.toLocaleString()}</td>
                            <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text }}>{u.market_price?.toLocaleString()}</td>
                            <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 12, fontWeight: 700, color: up ? C.green : dn ? C.red : C.gray400 }}>
                              {up ? "+" : ""}{u.change?.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "12px 16px", fontSize: 12, color: C.gray500 }}>All prices are already up to date — no changes needed.</div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Info footer ───────────────────────────────────────────── */}
      <div style={{ padding: "12px 16px", borderRadius: 10, background: isDark ? "rgba(59,130,246,0.07)" : "#eff6ff", border: `1px solid ${isDark ? "rgba(59,130,246,0.2)" : "#bfdbfe"}`, fontSize: 12, color: isDark ? "#93c5fd" : "#1d4ed8", lineHeight: 1.6, flexShrink: 0 }}>
        <strong>How it works:</strong> The server cron fetches prices from DSE every 5 minutes during market hours and updates the global <em>companies</em> table.
        Users with Auto-Sync ON in their Portfolio get prices copied to their CDS automatically every 60 seconds.
        <strong>This is the master switch</strong> — when disabled, all user auto-sync is paused system-wide. When re-enabled, each user's previous toggle state is restored.
      </div>
    </>
  );
});

export default DSEPriceSettings;
