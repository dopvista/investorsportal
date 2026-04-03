// src/components/DSEPriceSettings.jsx
// System-level DSE price settings — SuperAdmin only, global companies table.
// Multi-time schedule: SA picks which daily time slots are active.

import { useState, memo } from "react";
import { useTheme } from "./ui";
import { Icon } from "../lib/icons";
import { useDSEPriceFetch } from "../hooks/useDSEPriceFetch";

// ── Available time slots (EAT = UTC+3) ───────────────────────────────
const TIME_SLOTS = [
  { time: "09:00", label: "09:00 AM" },
  { time: "12:00", label: "12:00 PM" },
  { time: "15:00", label: "03:00 PM" },
  { time: "17:00", label: "05:00 PM" },
];

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
    fetchTimes, fetchDays,
    lastFetchAt, lastFetchStatus, lastFetchCount,
    toggleAutoFetch, updateFetchTimes, updateFetchDays,
    fetchNow, fetchResult, error,
  } = useDSEPriceFetch(supabase);

  const [fetchMsg, setFetchMsg] = useState(null);

  const handleFetchNow = async () => {
    setFetchMsg(null);
    const result = await fetchNow("SA Manual Fetch");
    if (result) setFetchMsg({ result });
  };

  const handleTimeToggle = async (time) => {
    if (savingSchedule) return;
    const next = fetchTimes.includes(time)
      ? fetchTimes.filter(t => t !== time)
      : [...fetchTimes, time].sort();
    // At least one time must remain selected
    if (next.length === 0) return;
    await updateFetchTimes(next);
  };

  const handleDaysChange = async (days) => {
    if (savingSchedule || days === fetchDays) return;
    await updateFetchDays(days);
  };

  const statusOk  = lastFetchStatus === "success";
  const statusErr = lastFetchStatus?.startsWith("error");

  // ── Shared card wrapper ───────────────────────────────────────────
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
            Manage global share price auto-fetch — updates <em>companies</em> table system-wide
          </div>
        </div>
      </div>

      {/* ── Auto-Fetch Toggle ──────────────────────────────────────── */}
      {card(
        <>
          {sectionLabel("Auto-Fetch")}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>Enable Auto-Fetch</div>
              <div style={{ fontSize: 12, color: C.gray500 }}>Automatically pull latest prices from DSE on the configured schedule</div>
            </div>
            <button onClick={toggleAutoFetch} disabled={toggling}
              style={{ position: "relative", width: 52, height: 28, borderRadius: 14, border: "none", cursor: toggling ? "wait" : "pointer", background: enabled ? C.green : (isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"), transition: "background 0.2s", flexShrink: 0, outline: "none" }}>
              <div style={{ position: "absolute", top: 3, left: enabled ? 27 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }} />
            </button>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 12px", borderRadius: 20, background: enabled ? (isDark ? "rgba(34,197,94,0.12)" : "#f0fdf4") : (isDark ? "rgba(255,255,255,0.05)" : C.gray50), border: `1px solid ${enabled ? (isDark ? "rgba(34,197,94,0.3)" : "#bbf7d0") : C.gray200}` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: enabled ? C.green : C.gray400, display: "inline-block" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: enabled ? C.green : C.gray500 }}>
              {enabled ? "Active" : "Disabled"}
            </span>
            {enabled && fetchTimes.length > 0 && (
              <span style={{ fontSize: 11, color: C.gray500 }}>
                — {fetchTimes.join(", ")} EAT · {fetchDays === "weekdays" ? "Weekdays" : "Every day"}
              </span>
            )}
          </div>
        </>
      )}

      {/* ── Schedule: Days + Times ─────────────────────────────────── */}
      {card(
        <>
          {sectionLabel("Fetch Schedule")}
          <div style={{ fontSize: 12, color: C.gray500, marginBottom: 14, lineHeight: 1.5 }}>
            Select which days and times prices should auto-fetch. All times are EAT (UTC+3). At least one time must be selected.
          </div>

          {/* Day selector */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>Days</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
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

          {/* Time checkboxes */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>Times</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {TIME_SLOTS.map(({ time, label }) => {
              const checked = fetchTimes.includes(time);
              const isOnly  = checked && fetchTimes.length === 1; // can't uncheck the last one
              return (
                <button key={time} onClick={() => handleTimeToggle(time)} disabled={savingSchedule || isOnly}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: (savingSchedule || isOnly) ? (isOnly ? "not-allowed" : "wait") : "pointer", border: `1.5px solid ${checked ? (isDark ? C.green : C.navy) : C.gray200}`, background: checked ? (isDark ? `${C.green}12` : `${C.navy}08`) : C.white, fontFamily: "inherit", transition: "all 0.15s", opacity: isOnly ? 0.6 : 1 }}>
                  {/* Checkbox visual */}
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${checked ? (isDark ? C.green : C.navy) : C.gray300}`, background: checked ? (isDark ? C.green : C.navy) : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checked && <Icon name="check" size={10} stroke="#fff" sw={3} />}
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <div style={{ fontSize: 13, fontWeight: checked ? 700 : 500, color: checked ? (isDark ? C.green : C.navy) : C.gray600 }}>{label}</div>
                    <div style={{ fontSize: 10, color: C.gray400 }}>EAT (UTC+3)</div>
                  </div>
                  {savingSchedule && checked && (
                    <div style={{ marginLeft: "auto", width: 12, height: 12, border: `1.5px solid ${C.gray300}`, borderTopColor: C.green, borderRadius: "50%", animation: "_dseSpin 0.7s linear infinite" }} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Last Fetch ────────────────────────────────────────────── */}
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
            Fetch all DSE prices immediately — updates the global companies table system-wide, regardless of the auto-fetch schedule. Individual CDS portfolio prices are managed separately.
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
                            <td style={{ padding: "8px 16px", textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text }}>{u.new_price?.toLocaleString()}</td>
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
        <strong>System-wide scope:</strong> Fetches update only the global <em>companies.price</em> field.
        Individual CDS portfolio prices (set per user in the Portfolio view) are completely separate and unaffected.
        All schedule times are EAT (UTC+3).
      </div>
    </>
  );
});

export default DSEPriceSettings;
