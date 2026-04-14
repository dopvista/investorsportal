// ── src/pages/CompaniesPage.jsx ──────────────────────────────────────
import { useState, useMemo, useEffect, useCallback, useRef, memo } from "react";
import {
  sbInsert, sbUpdate, sbDelete,
  sbGetPortfolio, sbUpsertCdsPrice, sbGetCdsPriceHistory, sbGetAllCompanies,
  sbCopyMarketPricesToCds, sbGetCompanyPriceHistory,
  sbGetDividendEvents, sbInsertDividendEvent, sbUpdateDividendEvent,
  sbDeleteDividendEvent, sbGenerateDividendEvent, sbRefreshDividendEvent,
} from "../lib/supabase";
import { supabase } from "../lib/supabase";
import {
  useTheme, fmt, fmtSmart, commaVal, stripCommas, Btn, StatCard, SectionCard, ModalShell,
  Modal, UpdatePriceModal, CompanyFormModal, ActionMenu
} from "../components/ui";
import { Icon } from "../lib/icons";
import { useDSEPriceFetch } from "../hooks/useDSEPriceFetch";
import { useDSEAutoSync } from "../hooks/useDSEAutoSync";

// ── Mobile breakpoint hook ────────────────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    let t;
    const handler = () => {
      clearTimeout(t);
      t = setTimeout(() => setIsMobile(window.innerWidth < 768), 80);
    };
    window.addEventListener("resize", handler, { passive: true });
    return () => { window.removeEventListener("resize", handler); clearTimeout(t); };
  }, []);
  return isMobile;
};

// Explicit font — portals render into document.body which has no font set
// ── DSE Price Popup (purely presentational) ──────────────────────────
const DSEPricePopup = memo(function DSEPricePopup({
  onClose, isMobile,
  enabled, serverEnabled, active, loading, toggling, fetching, error, fetchMsg,
  lastFetchAt, lastFetchStatus, lastFetchCount,
  toggleAutoFetch, onFetchNow,
  syncing, lastSynced, lastSyncCount, syncError,
}) {
  const { C, isDark } = useTheme();

  const fmtDate = (iso) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <ModalShell title="DSE Price Updates" subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="barChart" size={15} /> Manage price syncing</span>} onClose={onClose} maxWidth={440} footer={<Btn variant="secondary" onClick={onClose}>Cancel</Btn>}>
        <div style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Loading...</div>
      </ModalShell>
    );
  }

  return (
    <ModalShell
      title="DSE Price Updates"
      subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="barChart" size={15} /> Manage price syncing</span>}
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={onFetchNow} loading={fetching} icon={<Icon name="refresh" size={14} stroke="#ffffff" />}>
            {fetching ? "Updating..." : "Update Prices from DSE"}
          </Btn>
        </>
      }
    >
      <style>{`@keyframes dsePulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Server-disabled banner */}
      {serverEnabled === false && (
        <div style={{ padding: "10px 14px", background: isDark ? "rgba(239,68,68,0.08)" : "#fef2f2", borderRadius: 10, border: `1px solid ${isDark ? "rgba(239,68,68,0.2)" : "#fecaca"}`, display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="ban" size={16} stroke={C.red} sw={2} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>Auto-Sync Disabled by Admin</div>
            <div style={{ fontSize: 11, color: C.gray500, marginTop: 1 }}>The administrator has turned off DSE price syncing system-wide. Contact your admin to re-enable.</div>
          </div>
        </div>
      )}

      {/* Auto-Sync Toggle */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", borderRadius: 10, border: `1px solid ${C.gray200}`, opacity: serverEnabled === false ? 0.5 : 1 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Auto-Sync Prices</div>
          <div style={{ fontSize: 11, color: C.gray500, marginTop: 2 }}>Fetches DSE prices and syncs to your portfolio</div>
        </div>
        <button onClick={toggleAutoFetch} disabled={toggling || serverEnabled === false}
          style={{ position: "relative", width: 48, height: 26, borderRadius: 13, border: "none", cursor: (toggling || serverEnabled === false) ? "not-allowed" : "pointer", background: (enabled && serverEnabled !== false) ? C.green : (isDark ? "rgba(255,255,255,0.15)" : "#cbd5e1"), transition: "background 0.2s", flexShrink: 0, outline: "none" }}>
          <div style={{ position: "absolute", top: 3, left: (enabled && serverEnabled !== false) ? 25 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
        </button>
      </div>

      {/* Auto-sync live indicator */}
      {active && (
        <div style={{ padding: "8px 14px", background: syncing ? (isDark ? "rgba(59,130,246,0.08)" : "#eff6ff") : (isDark ? "rgba(34,197,94,0.08)" : "#f0fdf4"), borderRadius: 10, border: `1px solid ${syncing ? (isDark ? "rgba(59,130,246,0.2)" : "#bfdbfe") : (isDark ? "rgba(34,197,94,0.2)" : "#bbf7d0")}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: syncing ? "#3b82f6" : "#22c55e", animation: syncing ? "dsePulse 1s ease-in-out infinite" : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: syncing ? "#3b82f6" : C.green }}>
              {syncing ? "Syncing..." : "Auto-sync ON"}
            </span>
          </div>
          <span style={{ fontSize: 11, color: C.gray500 }}>
            {lastSynced ? `Last: ${new Date(lastSynced).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Waiting..."}
            {lastSyncCount > 0 && !syncing ? ` · ${lastSyncCount} updated` : ""}
          </span>
        </div>
      )}
      {syncError && (
        <div style={{ padding: "6px 14px", fontSize: 11, color: C.red, background: isDark ? "rgba(239,68,68,0.1)" : "#fef2f2", borderRadius: 8 }}>
          Sync error: {syncError}
        </div>
      )}

      {/* Last fetch info */}
      <div style={{ padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", borderRadius: 10, border: `1px solid ${C.gray200}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Last DSE Price Fetch</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtDate(lastFetchAt)}</div>
          {(() => {
            const isResultMsg = fetchMsg && !fetchMsg.isError;
            const isErrMsg    = error || (fetchMsg?.isError);
            const badgeText   = isResultMsg ? fetchMsg.text
              : isErrMsg ? (fetchMsg?.text || error)
              : lastFetchStatus === "success"
                ? (lastFetchCount > 0 ? `${lastFetchCount} updated` : "All current")
                : lastFetchStatus === "error" ? "error" : null;
            if (!badgeText) return null;
            return (
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: isErrMsg ? C.red : C.green,
                background: isErrMsg ? (isDark ? "rgba(239,68,68,0.15)" : "#fef2f2") : (isDark ? "rgba(34,197,94,0.15)" : "#f0fdf4"),
                border: `1px solid ${isErrMsg ? (isDark ? "rgba(239,68,68,0.3)" : "#fecaca") : (isDark ? "rgba(34,197,94,0.3)" : "#bbf7d0")}`,
                padding: "2px 8px", borderRadius: 20,
              }}>
                {badgeText}
              </span>
            );
          })()}
        </div>
      </div>
    </ModalShell>
  );
});

// ── DSE Price Card — reflects auto-sync state ──────────────────────
function DSEPriceCard({ unpriced, lastFetchAt, onClick, autoSyncEnabled, syncing, lastSynced, isMobile, serverEnabled }) {
  const { C } = useTheme();
  const fmtShort = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };
  const fmtTime = (iso) => {
    if (!iso) return null;
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };
  const serverOff = serverEnabled === false;
  const accent = serverOff ? "#94a3b8" : autoSyncEnabled ? "#22c55e" : "#D97706";
  const accentBg = serverOff ? "#f1f5f9" : autoSyncEnabled ? "#f0fdf4" : "#FEF3C7";
  const accentBorder = serverOff ? "#cbd5e1" : autoSyncEnabled ? "#bbf7d0" : "#FDE68A";
  return (
    <div onClick={onClick} style={{
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 12, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 0,
      cursor: "pointer", transition: "border-color 0.15s, box-shadow 0.15s",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 2px 12px ${accent}22`; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.boxShadow = "0 1px 4px rgba(0,0,0,0.05)"; }}
    >
      <style>{`@keyframes cardPulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
      <div style={{ width: 36, height: 36, background: accentBg, border: `1.5px solid ${accentBorder}`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
        <Icon name={serverOff ? "ban" : autoSyncEnabled ? "refresh" : "dollarSign"} size={17} stroke={serverOff ? "#94a3b8" : autoSyncEnabled ? "#16a34a" : "#374151"} sw={2.2} />
        {autoSyncEnabled && !serverOff && (
          <div style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: "50%", background: syncing ? "#3b82f6" : "#22c55e", border: `1.5px solid ${C.white}`, animation: syncing ? "cardPulse 1s ease-in-out infinite" : "none" }} />
        )}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>
          {serverOff ? "DSE Prices" : autoSyncEnabled ? "Live Prices" : "DSE Prices"}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: accent, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {serverOff
            ? (isMobile ? "Disabled by Admin" : "Auto-Sync Disabled by Admin")
            : autoSyncEnabled
              ? (syncing ? "Syncing..." : isMobile ? "Sync ON" : "Auto-Sync Prices ON")
              : (isMobile ? "Sync OFF" : "Auto-Sync Prices OFF")}
        </div>
        <div style={{ fontSize: 10, color: C.gray600, marginTop: 2 }}>
          {serverOff
            ? "Contact admin to re-enable"
            : autoSyncEnabled
              ? (lastSynced ? `Synced ${fmtTime(lastSynced)}` : "Syncing...")
              : (lastSynced ? `Last synced ${fmtTime(lastSynced)}` : "Tap to enable live prices")}
        </div>
      </div>
    </div>
  );
}

// ── Amber "no price" badge helper ────────────────────────────────────
const amberBadgeStyle = (isDark) => ({
  background: isDark ? "#D9770622" : "#FEF3C7",
  color:      "#D97706",
  border:     `1px solid ${isDark ? "#D9770655" : "#FDE68A"}`,
  padding:    "4px 10px",
  borderRadius: 20,
  fontSize:   11,
  fontWeight: 700,
});

// ── Interactive SVG Price Chart ────────────────────────────────────────
// Nice-number Y-axis ticks: round intervals like 500, 1K, 2K, 5K
function niceYTicks(dataMin, dataMax, targetCount = 5) {
  const rawRange = dataMax - dataMin || 1;
  const rawStep = rawRange / (targetCount - 1);
  // Round step to nearest "nice" number: 1, 2, 5, 10, 20, 50, 100, 200, 500...
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / mag;
  const niceStep = residual <= 1.5 ? mag : residual <= 3 ? 2 * mag : residual <= 7 ? 5 * mag : 10 * mag;
  const lo = Math.floor(dataMin / niceStep) * niceStep;
  const hi = Math.ceil(dataMax / niceStep) * niceStep;
  const ticks = [];
  for (let v = lo; v <= hi + niceStep * 0.01; v += niceStep) ticks.push(Math.round(v));
  return { ticks, lo, hi };
}

// Chart layout constants — hoisted to avoid recreation
const CHART_W = 420, CHART_H = 180, CHART_PL = 36, CHART_PR = 10, CHART_PT = 30, CHART_PB = 20;
const CHART_CW = CHART_W - CHART_PL - CHART_PR;
const CHART_CH = CHART_H - CHART_PT - CHART_PB;
const DAY_MS = 86400000;
const RANGE_DAYS = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };

const PriceChart = memo(function PriceChart({ data, color, isDark, C, onHover }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);

  // Memoize all heavy chart computations
  const chartCalc = useMemo(() => {
    if (!data || data.length < 2) return null;

    const prices = data.map(d => d.price);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < prices.length; i++) {
      if (prices[i] < min) min = prices[i];
      if (prices[i] > max) max = prices[i];
    }

    const { ticks: yTicks, lo: yLo, hi: yHi } = niceYTicks(min, max, 5);
    const yRange = yHi - yLo || 1;
    const timestamps = data.map(d => new Date(d.date).getTime());
    const tMin = timestamps[0], tMax = timestamps[timestamps.length - 1];
    const tRange = tMax - tMin || 1;

    const xFromTime = (t) => CHART_PL + ((t - tMin) / tRange) * CHART_CW;
    const xPos = (i) => xFromTime(timestamps[i]);
    const yPos = (v) => CHART_PT + (1 - (v - yLo) / yRange) * CHART_CH;

    const linePts = data.map((d, i) => `${xPos(i).toFixed(1)},${yPos(d.price).toFixed(1)}`).join(" ");
    const areaPts = `${xPos(0).toFixed(1)},${yPos(yLo).toFixed(1)} ${linePts} ${xPos(data.length - 1).toFixed(1)},${yPos(yLo).toFixed(1)}`;

    const needsDec = yTicks.some(v => v >= 1000 && v % 1000 !== 0);
    const fmtK = (v) => {
      if (v >= 10000) return `${Math.round(v / 1000)}K`;
      if (v >= 1000) return `${(v / 1000).toFixed(needsDec ? 1 : 0)}K`;
      return v.toLocaleString();
    };

    const totalDays = (tMax - tMin) / DAY_MS;
    const xLabelTimes = [tMin];
    let dateFmt;
    if (totalDays > 180) {
      dateFmt = { month: "short" };
      const start = new Date(tMin);
      let m = new Date(start.getFullYear(), start.getMonth() + 2, 1);
      while (m.getTime() <= tMax) { xLabelTimes.push(m.getTime()); m = new Date(m.getFullYear(), m.getMonth() + 2, 1); }
    } else if (totalDays > 60) {
      dateFmt = { day: "2-digit", month: "short" };
      let d = tMin + 15 * DAY_MS;
      while (d <= tMax) { xLabelTimes.push(d); d += 15 * DAY_MS; }
    } else if (totalDays > 14) {
      dateFmt = { day: "2-digit", month: "short" };
      let d = tMin + 5 * DAY_MS;
      while (d <= tMax) { xLabelTimes.push(d); d += 5 * DAY_MS; }
    } else {
      dateFmt = { day: "2-digit", month: "short" };
      let d = tMin + DAY_MS;
      while (d <= tMax) { xLabelTimes.push(d); d += DAY_MS; }
    }

    return { prices, yTicks, yLo, xFromTime, xPos, yPos, linePts, areaPts, fmtK, xLabelTimes, dateFmt, timestamps, tMin, tRange };
  }, [data]);

  if (!chartCalc) return null;
  const { prices, yTicks, yLo, xFromTime, xPos, yPos, linePts, areaPts, fmtK, xLabelTimes, dateFmt, timestamps, tMin, tRange } = chartCalc;

  const gridColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const labelColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)";
  const hintColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.4)";

  const handleMove = useCallback((e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const scaleX = CHART_W / rect.width;
    const svgX = (clientX - rect.left) * scaleX;
    if (svgX < CHART_PL || svgX > CHART_PL + CHART_CW) { setHoverIdx(null); onHover?.(null); return; }
    const pct = (svgX - CHART_PL) / CHART_CW;
    const hoverT = tMin + pct * tRange;
    let best = 0, bestDist = Math.abs(timestamps[0] - hoverT);
    for (let i = 1; i < timestamps.length; i++) {
      const dist = Math.abs(timestamps[i] - hoverT);
      if (dist < bestDist) { best = i; bestDist = dist; }
      if (timestamps[i] > hoverT) break;
    }
    setHoverIdx(best);
    onHover?.(data[best]);
  }, [data, onHover, timestamps, tMin, tRange]);
  const handleLeave = useCallback(() => { setHoverIdx(null); onHover?.(null); }, [onHover]);

  const hi = hoverIdx;
  const hx = hi !== null ? xPos(hi) : 0;
  const hy = hi !== null ? yPos(prices[hi]) : 0;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      style={{ width: "100%", height: "auto", display: "block", cursor: "default", touchAction: "none" }}
      onMouseMove={handleMove} onMouseLeave={handleLeave}
      onTouchMove={handleMove} onTouchEnd={handleLeave}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {/* Y-axis grid lines + labels on the LEFT */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={CHART_PL} y1={yPos(v)} x2={CHART_W - CHART_PR} y2={yPos(v)} stroke={gridColor} strokeDasharray="4,3" />
          <text x={CHART_PL - 6} y={yPos(v) + 3.5} textAnchor="end" fill={labelColor} fontSize="9" fontWeight="600">{fmtK(v)}</text>
        </g>
      ))}
      {/* X-axis vertical grid lines at each label */}
      {xLabelTimes.map((t, i) => i > 0 && i < xLabelTimes.length - 1 && (
        <line key={i} x1={xFromTime(t)} y1={CHART_PT} x2={xFromTime(t)} y2={yPos(yLo)} stroke={gridColor} strokeDasharray="4,3" />
      ))}
      {/* Area fill + line */}
      <polygon points={areaPts} fill="url(#areaGrad)" />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Default end dot */}
      {hi === null && (
        <circle cx={xPos(data.length - 1)} cy={yPos(prices[prices.length - 1])} r="3" fill={color} stroke={isDark ? "#1a1a2e" : "#fff"} strokeWidth="1.5" />
      )}
      {/* Hover: dot + vertical line + fixed top-center text */}
      {hi !== null && (
        <g>
          <line x1={hx} y1={CHART_PT} x2={hx} y2={yPos(yLo)} stroke={color} strokeWidth="0.8" strokeDasharray="3,3" opacity="0.3" />
          <circle cx={hx} cy={hy} r="3.5" fill={color} opacity="0.9" />
          <text x={CHART_PL} y={CHART_PT - 5} textAnchor="start" fill={hintColor} fontSize="11" fontWeight="600">
            TZS {prices[hi].toLocaleString()} — {new Date(data[hi].date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          </text>
        </g>
      )}
      {/* X-axis date labels at equal time intervals — skip if too close */}
      {xLabelTimes.map((t, li) => {
        const cx = xFromTime(t);
        // Skip label if it would overlap with the previous one (min 28px gap)
        if (li > 0) {
          const prevX = xFromTime(xLabelTimes[li - 1]);
          if (cx - prevX < 28) return null;
        }
        return (
          <text key={li} x={li === 0 ? CHART_PL - 2 : cx} y={CHART_H - 3}
            textAnchor={li === 0 ? "start" : li === xLabelTimes.length - 1 ? "end" : "middle"}
            fill={labelColor} fontSize="9" fontWeight="500">
            {new Date(t).toLocaleDateString("en-GB", dateFmt)}
          </text>
        );
      })}
    </svg>
  );
});

// ── Company Detail Popup ───────────────────────────────────────────────
function CompanyDetailPopup({ company, cdsNumber, onClose, onConfirmPrice, initialTab = "chart", role }) {
  const { C, isDark } = useTheme();
  const isSA = role === "SA";
  const isMobile = useIsMobile();
  const c = company;
  const hasCdsPrice = c.cds_price != null;
  const cdsPrice    = Number(c.cds_price) || 0;
  const marketPrice   = Number(c.market_price) || 0;
  const prevPrice     = Number(c.previous_price) || 0;
  const dseChange     = Number(c.dse_change) || 0;
  const changePct     = prevPrice > 0 ? ((dseChange) / prevPrice) * 100 : 0;
  const isUp          = dseChange >= 0;

  const [tab, setTab] = useState(initialTab); // "chart" | "history" | "update"
  const [prevTab, setPrevTab] = useState(initialTab); // to go back from update

  // ── Chart state ──────────────────────────────────────────
  const [chartRange, setChartRange] = useState("90D");
  const [allData, setAllData]       = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [hoverPoint, setHoverPoint] = useState(null);

  const dseTicker = c.name === "VERTEX ETF" ? "VERTEX-ETF" : c.name;
  const chartColor = "#f59e0b";

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    sbGetCompanyPriceHistory(dseTicker, 365).then(data => {
      if (!cancelled) { setAllData(data); setChartLoading(false); }
    }).catch(() => { if (!cancelled) { setAllData([]); setChartLoading(false); } });
    return () => { cancelled = true; };
  }, [dseTicker]);

  const chartData = useMemo(() => {
    if (!allData || !allData.length) return allData;
    const days = RANGE_DAYS[chartRange];
    if (days >= 365) return allData;
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return allData.filter(d => d.date >= cutoff);
  }, [allData, chartRange]);

  const openingPrice = chartData?.length ? chartData[0].price : 0;
  const closingPrice = chartData?.length ? chartData[chartData.length - 1].price : 0;
  const periodChange = closingPrice - openingPrice;
  const displayPrice = hoverPoint ? hoverPoint.price : closingPrice;
  const displayChange = hoverPoint ? (hoverPoint.price - openingPrice) : periodChange;
  const displayChangePct = openingPrice > 0 ? (displayChange / openingPrice) * 100 : 0;
  const displayPositive = displayChange >= 0;

  // ── History state ────────────────────────────────────────
  const [history, setHistory]         = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [histPage, setHistPage]       = useState(1);
  const PAGE_SIZE = 10;

  // Fetch history on first switch to history tab
  useEffect(() => {
    if (tab !== "history" || history !== null || !cdsNumber) return;
    let cancelled = false;
    setHistoryLoading(true);
    sbGetCdsPriceHistory(c.id, cdsNumber).then(data => {
      if (!cancelled) { setHistory(data || []); setHistoryLoading(false); }
    }).catch(() => { if (!cancelled) { setHistory([]); setHistoryLoading(false); } });
    return () => { cancelled = true; };
  }, [tab, history, c.id, cdsNumber]);

  const meaningful = useMemo(() => {
    if (!history) return [];
    return history.filter(h => {
      const isInitial = !h.old_price || Number(h.old_price) === 0;
      if (isInitial) return true;
      return Number(h.change_amount) !== 0;
    });
  }, [history]);

  const nowStable = useMemo(() => new Date(), []);
  const thisMonth = useMemo(() => meaningful.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === nowStable.getFullYear() && d.getMonth() === nowStable.getMonth();
  }), [meaningful, nowStable]);
  const monthLabel = nowStable.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalPages = Math.ceil(thisMonth.length / PAGE_SIZE);
  const pagedHistory = thisMonth.slice((histPage - 1) * PAGE_SIZE, histPage * PAGE_SIZE);

  // ── Update price state ────────────────────────────────────
  const localDatetime = useMemo(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }, []);
  const [newPrice, setNewPrice] = useState("");
  const [upDatetime, setUpDatetime] = useState(localDatetime);
  const [upReason, setUpReason]     = useState("What If Analysis");
  const [upError, setUpError]       = useState("");

  const handleUpdateConfirm = () => {
    if (!newPrice || isNaN(Number(newPrice)) || Number(newPrice) <= 0) { setUpError("Please enter a valid price greater than 0."); return; }
    if (cdsPrice !== 0 && Number(newPrice) === cdsPrice) { setUpError("No change — same as current price."); return; }
    setUpError("");
    onConfirmPrice?.({ newPrice: Number(newPrice), datetime: upDatetime, reason: upReason });
  };

  const upChangeAmt = newPrice ? Number(newPrice) - cdsPrice : null;
  const upChangePct = upChangeAmt !== null && cdsPrice !== 0 ? (upChangeAmt / cdsPrice) * 100 : null;
  const upUp = upChangeAmt !== null ? upChangeAmt >= 0 : null;
  const upFieldStyle = { border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box", background: C.white };

  // ── Dividend Events state (SA only) ──────────────────────────────
  const [events, setEvents]             = useState(null);   // null = not loaded
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError]   = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);   // null = new event
  const [eventBusy, setEventBusy]       = useState(null);   // eventId or "new"
  const [eventFormErr, setEventFormErr] = useState("");

  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);
  const currentYear = new Date().getFullYear();

  const blankEventForm = () => ({
    dividendYear: String(currentYear),
    dps: "",
    taxRate: "5",
    declarationDate: "",
    exDate: "",
    closureDate: "",
    paymentDate: "",
    notes: "",
  });

  const [eventForm, setEventForm] = useState(blankEventForm);

  // Load events when dividends tab is opened
  useEffect(() => {
    if (tab !== "dividends" || !isSA) return;
    if (events !== null) return;
    let cancelled = false;
    setEventsLoading(true);
    setEventsError(null);
    sbGetDividendEvents(company.id).then(data => {
      if (!cancelled) { setEvents(data || []); setEventsLoading(false); }
    }).catch(e => {
      if (!cancelled) { setEventsError(e.message); setEventsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [tab, isSA, company.id, events]);

  const openNewEventForm = () => {
    setEditingEvent(null);
    setEventForm(blankEventForm());
    setEventFormErr("");
    setShowEventForm(true);
  };

  const openEditEventForm = (ev) => {
    setEditingEvent(ev);
    setEventForm({
      dividendYear: String(ev.dividend_year),
      dps: String(ev.dps),
      taxRate: String(ev.tax_rate),
      declarationDate: ev.declaration_date || "",
      exDate: ev.ex_date || "",
      closureDate: ev.closure_date || "",
      paymentDate: ev.payment_date || "",
      notes: ev.notes || "",
    });
    setEventFormErr("");
    setShowEventForm(true);
  };

  const cancelEventForm = () => { setShowEventForm(false); setEditingEvent(null); setEventFormErr(""); };

  const saveEvent = async () => {
    if (!eventForm.dps || isNaN(Number(eventForm.dps)) || Number(eventForm.dps) <= 0) {
      setEventFormErr("Dividend Per Share must be greater than 0."); return;
    }
    if (!eventForm.closureDate) { setEventFormErr("Closure Date is required."); return; }
    if (!eventForm.dividendYear || isNaN(Number(eventForm.dividendYear))) {
      setEventFormErr("Dividend Year is required."); return;
    }
    setEventBusy("form");
    setEventFormErr("");
    const payload = {
      company_id: company.id,
      company_name: company.name,
      dividend_year: Number(eventForm.dividendYear),
      dps: Number(eventForm.dps),
      tax_rate: Number(eventForm.taxRate) || 5,
      declaration_date: eventForm.declarationDate || null,
      ex_date: eventForm.exDate || null,
      closure_date: eventForm.closureDate,
      payment_date: eventForm.paymentDate || null,
      notes: eventForm.notes || null,
    };
    try {
      if (editingEvent) {
        await sbUpdateDividendEvent(editingEvent.id, payload);
        setEvents(prev => prev.map(e => e.id === editingEvent.id ? { ...e, ...payload } : e));
      } else {
        const [created] = await sbInsertDividendEvent(payload);
        setEvents(prev => [created, ...(prev || [])]);
      }
      setShowEventForm(false);
      setEditingEvent(null);
    } catch (e) {
      setEventFormErr(e.message);
    } finally {
      setEventBusy(null);
    }
  };

  const deleteEvent = async (ev) => {
    if (!window.confirm(`Delete this ${ev.dividend_year} dividend event for ${company.name}?\nThis will NOT delete already-generated dividend records.`)) return;
    setEventBusy(ev.id + "_del");
    try {
      await sbDeleteDividendEvent(ev.id);
      setEvents(prev => prev.filter(e => e.id !== ev.id));
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setEventBusy(null);
    }
  };

  const generateEvent = async (ev) => {
    if (ev.closure_date > todayIso) {
      alert(`Closure date (${ev.closure_date}) has not passed yet. Cannot generate until then.`);
      return;
    }
    if (!window.confirm(`Generate dividend records for all eligible investors?\nCompany: ${company.name} · Year: ${ev.dividend_year} · DPS: TZS ${ev.dps}`)) return;
    setEventBusy(ev.id + "_gen");
    try {
      const result = await sbGenerateDividendEvent(ev.id);
      setEvents(prev => prev.map(e => e.id === ev.id ? { ...e, status: "generated" } : e));
      alert(`Done! ${result.inserted || 0} records created, ${result.skipped || 0} already existed.`);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setEventBusy(null);
    }
  };

  const refreshEvent = async (ev) => {
    if (!window.confirm(`Refresh pending records for ${company.name} · ${ev.dividend_year}?\nOnly pending (unconfirmed) records will be recalculated.`)) return;
    setEventBusy(ev.id + "_ref");
    try {
      const result = await sbRefreshDividendEvent(ev.id);
      alert(`Done! ${result.updated || 0} records updated, ${result.inserted || 0} new records added.`);
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setEventBusy(null);
    }
  };

  const evFieldStyle = { border: `1.5px solid ${C.gray200}`, borderRadius: 8, height: 36, padding: "0 10px", fontSize: 13, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box", background: C.white };

  const switchTab = (t) => { if (t === "update") setPrevTab(tab); setTab(t); };

  // ── Shared helpers ───────────────────────────────────────
  const statBox = (label, value, color) => (
    <div style={{ position: "relative", textAlign: "center", padding: "12px 4px 8px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", border: `1px solid ${C.gray200}`, flex: 1, minWidth: 0 }}>
      <div style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", padding: "0 6px", background: isDark ? C.white : "#fff", fontSize: 8, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap", lineHeight: "14px", borderRadius: 20, border: `1px solid rgba(0,0,0,0.08)` }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color: color || C.text, lineHeight: 1 }}>{value}</div>
    </div>
  );

  return (
    <ModalShell
      title={c.name}
      subtitle={c.remarks ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="building" size={13} /> {c.remarks}</span> : <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="barChart" size={13} /> Company Details</span>}
      headerRight={
        marketPrice > 0 ? (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#ffffff", lineHeight: 1 }}>TZS {fmt(marketPrice)}</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3, padding: "2px 8px", borderRadius: 12, background: isUp ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)", fontSize: 11, fontWeight: 700, color: isUp ? "#4ade80" : "#f87171" }}>
              {isUp ? "▲" : "▼"} {Math.abs(dseChange).toLocaleString()} ({Math.abs(changePct).toFixed(2)}%)
            </div>
          </div>
        ) : null
      }
      onClose={onClose}
      maxWidth={tab === "dividends" ? 520 : 440}
      footer={
        tab === "update" ? (
          <>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={() => setTab(prevTab)} icon={<Icon name={prevTab === "history" ? "clock" : "barChart"} size={14} stroke="#ffffff" />}>
              {prevTab === "history" ? "History" : "Chart"}
            </Btn>
            <Btn variant="navy" onClick={handleUpdateConfirm} icon={<Icon name="save" size={14} stroke="#ffffff" />}>Update Price</Btn>
          </>
        ) : tab === "dividends" ? (
          <>
            {!showEventForm ? (
              <>
                <Btn variant="secondary" onClick={() => { setTab("chart"); }}>Back</Btn>
                <Btn variant="navy" onClick={openNewEventForm} icon={<Icon name="plus" size={14} stroke="#ffffff" />}>Add Event</Btn>
              </>
            ) : (
              <>
                <Btn variant="secondary" onClick={cancelEventForm}>Cancel</Btn>
                <Btn variant="primary" onClick={saveEvent} disabled={eventBusy === "form"}>
                  {eventBusy === "form" ? "Saving…" : editingEvent ? "Save Changes" : "Add Event"}
                </Btn>
              </>
            )}
          </>
        ) : (
          <>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" onClick={() => switchTab(tab === "chart" ? "history" : "chart")} icon={<Icon name={tab === "chart" ? "clock" : "barChart"} size={14} stroke="#ffffff" />}>
              {tab === "chart" ? "History" : "Chart"}
            </Btn>
            {isMobile && (
              <Btn variant="navy" onClick={() => switchTab("update")} icon={<Icon name="dollarSign" size={14} stroke="#ffffff" />}>
                {hasCdsPrice ? "Update" : "Set Price"}
              </Btn>
            )}
          </>
        )
      }
    >

      {/* ── CHART TAB ──────────────────────────────────────── */}
      {tab === "chart" && (
        <>
          <div style={{ position: "relative", borderRadius: 10, background: isDark ? "rgba(255,255,255,0.03)" : "#f8fafc", border: `1px solid ${C.gray200}`, marginBottom: 14, overflow: "hidden" }}>
            {/* Range buttons inside chart, top-right */}
            <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 3, zIndex: 2 }}>
              {Object.keys(RANGE_DAYS).map(r => (
                <button key={r} onClick={() => setChartRange(r)}
                  style={{ padding: "2px 7px", borderRadius: 10, border: `1px solid ${r === chartRange ? "#f59e0b" : (isDark ? "rgba(255,255,255,0.12)" : C.gray200)}`, background: r === chartRange ? (isDark ? "rgba(245,158,11,0.2)" : "#fffbeb") : (isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.85)"), color: r === chartRange ? "#f59e0b" : C.gray500, fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", outline: "none", lineHeight: "14px" }}>
                  {r}
                </button>
              ))}
            </div>
            {chartLoading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 140, color: C.gray400, fontSize: 12 }}>
                <style>{`@keyframes _cpSpin{to{transform:rotate(360deg)}}`}</style>
                <div style={{ width: 16, height: 16, border: `2px solid ${C.gray200}`, borderTop: `2px solid #f59e0b`, borderRadius: "50%", animation: "_cpSpin 0.7s linear infinite", marginRight: 8 }} />
                Loading chart...
              </div>
            ) : chartData && chartData.length >= 2 ? (
              <PriceChart data={chartData} color={chartColor} isDark={isDark} C={C} onHover={setHoverPoint} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 140, color: C.gray400 }}>
                <Icon name="barChart" size={22} stroke={C.gray300} />
                <div style={{ fontSize: 12, marginTop: 6, fontWeight: 600 }}>Not enough data yet</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>Chart builds as DSE prices are synced daily</div>
              </div>
            )}
          </div>

          {chartData && chartData.length >= 2 && (
            <div style={{ display: "flex", gap: 8 }}>
              {statBox("Opening", fmt(openingPrice), isDark ? "#60a5fa" : "#2563eb")}
              {statBox(
                hoverPoint ? "Change" : "Changes",
                <span>{`${displayPositive ? "+" : "−"}${fmt(Math.abs(displayChange))}`} <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.7 }}>{`${displayPositive ? "+" : "−"}${Math.abs(displayChangePct).toFixed(1)}%`}</span></span>,
                displayPositive ? C.green : C.red
              )}
              {statBox(
                "Closing",
                fmt(displayPrice),
                displayPositive ? C.green : C.red
              )}
            </div>
          )}
        </>
      )}

      {/* ── HISTORY TAB ────────────────────────────────────── */}
      {tab === "history" && (
        <>
          {historyLoading || history === null ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 140, color: C.gray400, fontSize: 12 }}>
              <style>{`@keyframes _cpSpin{to{transform:rotate(360deg)}}`}</style>
              <div style={{ width: 16, height: 16, border: `2px solid ${C.gray200}`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "_cpSpin 0.7s linear infinite", marginRight: 8 }} />
              Loading history...
            </div>
          ) : thisMonth.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 16px", color: C.gray400 }}>
              <div style={{ fontWeight: 600 }}>No price changes in {monthLabel}</div>
              <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                {meaningful.length > 0 ? `${meaningful.length} update${meaningful.length !== 1 ? "s" : ""} exist in previous months` : "No price history recorded yet"}
              </div>
            </div>
          ) : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                <colgroup>
                  {["7%", "33%", "20%", "20%", "20%"].map((w, i) => <col key={i} style={{ width: w }} />)}
                </colgroup>
                <thead>
                  <tr style={{ background: C.gray50 }}>
                    {["#", "Date & Time", "Old Price", "New Price", "Change"].map(h => (
                      <th key={h} style={{ padding: "8px", textAlign: ["Old Price", "New Price", "Change"].includes(h) ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.gray200}`, borderTop: `1px solid ${C.gray200}`, whiteSpace: "nowrap", background: C.gray50 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHistory.map((h, i) => {
                    const globalIdx = (histPage - 1) * PAGE_SIZE + i;
                    const isFirstEntry = !h.old_price || Number(h.old_price) === 0;
                    const up = !isFirstEntry && h.change_amount >= 0;
                    const dateText = new Date(h.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                    const timeText = new Date(h.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    return (
                      <tr key={h.id} style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "8px", color: C.gray400, fontWeight: 600 }}>{globalIdx + 1}</td>
                        <td style={{ padding: "8px" }}>
                          <div style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap", lineHeight: 1.2 }}>{dateText} <span style={{ color: C.gray400 }}>|</span> {timeText}</div>
                        </td>
                        <td style={{ padding: "8px", textAlign: "right", color: C.gray600 }}>{isFirstEntry ? <span style={{ color: C.gray400 }}>—</span> : fmt(h.old_price)}</td>
                        <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: C.text }}>{fmt(h.new_price)}</td>
                        <td style={{ padding: "8px", textAlign: "right" }}>
                          {isFirstEntry ? <span style={{ fontSize: 11, color: C.gray400 }}>Initial</span> : (
                            <span style={{ background: up ? C.greenBg : C.redBg, color: up ? C.green : C.red, padding: "2px 7px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                              {up ? "▲" : "▼"} {Math.abs(Number(h.change_amount)).toLocaleString()}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0 0" }}>
                  <button onClick={() => setHistPage(p => Math.max(1, p - 1))} disabled={histPage === 1}
                    style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${C.gray200}`, background: C.white, color: histPage === 1 ? C.gray400 : C.text, cursor: histPage === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>‹ Prev</button>
                  <span style={{ fontSize: 12, color: C.gray500 }}>{histPage} / {totalPages}</span>
                  <button onClick={() => setHistPage(p => Math.min(totalPages, p + 1))} disabled={histPage === totalPages}
                    style={{ padding: "4px 10px", borderRadius: 7, border: `1px solid ${C.gray200}`, background: C.white, color: histPage === totalPages ? C.gray400 : C.text, cursor: histPage === totalPages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>Next ›</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── DIVIDEND EVENTS TAB (SA only) ──────────────────── */}
      {tab === "dividends" && isSA && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* ── Event form (add / edit) ────────── */}
          {showEventForm && (
            <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc", border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text, marginBottom: 2 }}>
                {editingEvent ? "Edit Dividend Event" : "New Dividend Event"}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Div. Year <span style={{ color: C.red }}>*</span></div>
                  <input type="number" min="2000" max="2099" value={eventForm.dividendYear}
                    onChange={e => setEventForm(f => ({ ...f, dividendYear: e.target.value }))}
                    style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>DPS (TZS/Share) <span style={{ color: C.red }}>*</span></div>
                  <input type="number" min="0" step="0.01" value={eventForm.dps}
                    onChange={e => setEventForm(f => ({ ...f, dps: e.target.value }))}
                    placeholder="e.g. 65" style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Tax Rate (%)</div>
                  <input type="number" min="0" max="100" step="0.1" value={eventForm.taxRate}
                    onChange={e => setEventForm(f => ({ ...f, taxRate: e.target.value }))}
                    style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Closure Date <span style={{ color: C.red }}>*</span></div>
                  <input type="date" value={eventForm.closureDate}
                    onChange={e => setEventForm(f => ({ ...f, closureDate: e.target.value }))}
                    style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Declaration Date</div>
                  <input type="date" value={eventForm.declarationDate}
                    onChange={e => setEventForm(f => ({ ...f, declarationDate: e.target.value }))}
                    style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Ex-Dividend Date</div>
                  <input type="date" value={eventForm.exDate}
                    onChange={e => setEventForm(f => ({ ...f, exDate: e.target.value }))}
                    style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Payment Date</div>
                <input type="date" value={eventForm.paymentDate}
                  onChange={e => setEventForm(f => ({ ...f, paymentDate: e.target.value }))}
                  style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.gray500, marginBottom: 3 }}>Notes</div>
                <input type="text" value={eventForm.notes}
                  onChange={e => setEventForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional notes..." style={evFieldStyle} onFocus={e => e.target.style.borderColor = C.green} onBlur={e => e.target.style.borderColor = C.gray200} />
              </div>
              {eventFormErr && <div style={{ fontSize: 12, color: C.red, fontWeight: 600 }}>{eventFormErr}</div>}
            </div>
          )}

          {/* ── Events list ───────────────────────── */}
          {!showEventForm && (
            <>
              {eventsLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 100, color: C.gray400, fontSize: 12, gap: 8 }}>
                  <div style={{ width: 16, height: 16, border: `2px solid ${C.gray200}`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "_cpSpin 0.7s linear infinite" }} />
                  Loading events...
                </div>
              ) : eventsError ? (
                <div style={{ textAlign: "center", padding: 16, color: C.red, fontSize: 13 }}>{eventsError}</div>
              ) : !events || events.length === 0 ? (
                <div style={{ textAlign: "center", padding: "28px 16px", color: C.gray400 }}>
                  <Icon name="dollarSign" size={28} stroke={C.gray300} />
                  <div style={{ fontWeight: 600, marginTop: 8, fontSize: 13 }}>No dividend events yet</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Click "Add Event" to announce a dividend</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {events.map(ev => {
                    const closurePassed = ev.closure_date <= todayIso;
                    const isBusy = eventBusy && eventBusy.startsWith(ev.id);
                    const statusColors = {
                      upcoming:  { color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
                      generated: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
                      completed: { color: C.green,   bg: C.greenBg,  border: "#BBF7D0" },
                    };
                    const sc = statusColors[ev.status] || statusColors.upcoming;
                    return (
                      <div key={ev.id} style={{ background: isDark ? "rgba(255,255,255,0.04)" : "#f9fafb", border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontWeight: 800, fontSize: 14, color: C.text }}>{ev.dividend_year}</span>
                            <span style={{ fontWeight: 700, fontSize: 12, color: "#1D4ED8" }}>TZS {Number(ev.dps).toLocaleString()}/Share</span>
                            <span style={{ padding: "1px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700, color: sc.color, background: sc.bg, border: `1px solid ${sc.border}` }}>
                              {ev.status.charAt(0).toUpperCase() + ev.status.slice(1)}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => openEditEventForm(ev)} disabled={isBusy}
                              style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid ${C.gray200}`, background: C.white, color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              Edit
                            </button>
                            <button onClick={() => deleteEvent(ev)} disabled={isBusy}
                              style={{ padding: "3px 9px", borderRadius: 6, border: `1px solid #FECACA`, background: "#FFF5F5", color: C.red, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              {eventBusy === ev.id + "_del" ? "…" : "Delete"}
                            </button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "3px 8px", fontSize: 11, color: C.gray500, marginBottom: 6 }}>
                          {ev.declaration_date && <span>Declared: {ev.declaration_date}</span>}
                          {ev.ex_date && <span>Ex-Date: {ev.ex_date}</span>}
                          <span style={{ fontWeight: 600, color: closurePassed ? C.green : "#D97706" }}>Closure: {ev.closure_date}</span>
                          {ev.payment_date && <span>Payment: {ev.payment_date}</span>}
                          <span>Tax: {ev.tax_rate}%</span>
                        </div>
                        {ev.notes && <div style={{ fontSize: 11, color: C.gray400, fontStyle: "italic", marginBottom: 6 }}>{ev.notes}</div>}
                        <div style={{ display: "flex", gap: 6 }}>
                          {ev.status === "upcoming" && (
                            <button onClick={() => generateEvent(ev)} disabled={isBusy || !closurePassed}
                              title={!closurePassed ? `Closure date (${ev.closure_date}) not yet passed` : "Generate dividend records for all eligible investors"}
                              style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "none", background: closurePassed ? C.navy : C.gray200, color: closurePassed ? "#ffffff" : C.gray400, fontSize: 11, fontWeight: 700, cursor: closurePassed ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                              {eventBusy === ev.id + "_gen" ? "Generating…" : closurePassed ? "Generate Records" : `Generate (after ${ev.closure_date})`}
                            </button>
                          )}
                          {(ev.status === "generated" || ev.status === "completed") && (
                            <button onClick={() => refreshEvent(ev)} disabled={isBusy}
                              title="Recalculate pending records only (confirmed/paid/rejected are unchanged)"
                              style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: `1px solid ${C.gray200}`, background: C.white, color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              {eventBusy === ev.id + "_ref" ? "Refreshing…" : "Refresh Pending"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── UPDATE PRICE TAB (mobile) ──────────────────────── */}
      {tab === "update" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              New Price (TZS) <span style={{ color: C.red }}>*</span>
            </label>
            <input type="text" inputMode="decimal" autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              data-form-type="other" data-lpignore="true"
              value={commaVal(newPrice)} onChange={e => { setNewPrice(stripCommas(e.target.value)); setUpError(""); }}
              placeholder="Enter new price..." autoFocus
              style={{ ...upFieldStyle, fontSize: 15, fontWeight: 700, border: `1.5px solid ${upError ? C.red : C.gray200}` }}
              onFocus={e => !upError && (e.target.style.borderColor = C.green)}
              onBlur={e => !upError && (e.target.style.borderColor = C.gray200)} />
            {upError && <div style={{ fontSize: 12, color: C.red }}>{upError}</div>}
          </div>

          {upChangeAmt !== null && newPrice && (
            <div style={{ background: upUp ? C.greenBg : C.redBg, border: `1px solid ${upUp ? C.green : C.red}44`, borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: C.gray600, fontWeight: 600 }}>Price Movement</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: upUp ? C.green : C.red }}>{upUp ? "▲" : "▼"} {fmt(Math.abs(upChangeAmt))}</span>
                {upChangePct !== null && <span style={{ background: upUp ? C.green : C.red, color: "#ffffff", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{upUp ? "+" : ""}{upChangePct.toFixed(2)}%</span>}
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date & Time</label>
            <input type="datetime-local" value={upDatetime} onChange={e => setUpDatetime(e.target.value)} style={upFieldStyle}
              onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Reason</label>
            <input type="text" value={upReason} onChange={e => setUpReason(e.target.value)} placeholder="Reason for price change..." style={upFieldStyle}
              onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}

// ── Mobile Portfolio Card ──────────────────────────────────────────────
// FIX 3: receives isBusy prop — suppresses tap while a price update or
// history fetch is in progress for this specific company.
function PortfolioMobileCard({ company: c, onTap, isBusy }) {
  const { C, isDark } = useTheme();
  const hasCdsPrice = c.cds_price != null;
  const priceUp     = hasCdsPrice && c.cds_previous_price != null
    ? Number(c.cds_price) >= Number(c.cds_previous_price) : null;
  const changePct   = hasCdsPrice && c.cds_previous_price != null && Number(c.cds_previous_price) !== 0
    ? ((Number(c.cds_price) - Number(c.cds_previous_price)) / Number(c.cds_previous_price)) * 100 : null;
  const accentColor = !hasCdsPrice ? "#D97706" : priceUp === false ? C.red : C.green;
  const changeBdr   = priceUp ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");

  return (
    <div
      onClick={() => !isBusy && onTap(c)}
      style={{
        background: C.white, border: `1px solid ${C.gray200}`, borderLeft: `4px solid ${accentColor}`,
        borderRadius: 12, padding: "13px 14px", marginBottom: 9,
        cursor: isBusy ? "not-allowed" : "pointer",
        opacity: isBusy ? 0.6 : 1,
        boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 12,
        transition: "opacity 0.15s",
      }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
        <div style={{ fontSize: 11, color: C.gray400 }}>
          {c.cds_updated_at
            ? `Updated ${new Date(c.cds_updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
            : "No price recorded"}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        {hasCdsPrice ? (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>{fmt(c.cds_price)}</div>
            {changePct !== null
              ? <span style={{ background: priceUp ? C.greenBg : C.redBg, color: priceUp ? C.green : C.red, border: `1px solid ${changeBdr}`, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {priceUp ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                </span>
              : <span style={{ fontSize: 10, color: C.gray400 }}>No prev.</span>}
          </>
        ) : (
          <span style={{ ...amberBadgeStyle(isDark), display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={11} stroke="#D97706" /> Set price</span>
        )}
      </div>
      <div style={{ color: C.gray400, fontSize: 16, flexShrink: 0 }}>›</div>
    </div>
  );
}

// ── Mobile Manage Card (SA only) ───────────────────────────────────────
function ManageMobileCard({ company: c, deleting, onEdit, onDelete, onDividends }) {
  const { C } = useTheme();
  const actions = [
    { icon: <Icon name="edit" size={14} stroke={C.text} />, label: "Edit Company", onClick: () => onEdit(c) },
    { icon: <Icon name="dollarSign" size={14} stroke="#1D4ED8" />, label: "Dividend Events", onClick: () => onDividends(c) },
    { icon: <Icon name="trash" size={14} stroke={C.red} />, label: deleting === c.id ? "Deleting..." : "Delete", danger: true, onClick: () => onDelete(c) },
  ];
  const hasPrice = c.price != null;
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: "#DBEAFE", border: "1.5px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}><Icon name="building" size={17} stroke="#374151" sw={2.4} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
        <div style={{ fontSize: 11, color: C.gray400, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
          {hasPrice
            ? <span style={{ background: C.greenBg, color: C.green, border: `1px solid #BBF7D044`, borderRadius: 6, padding: "1px 7px", fontWeight: 700, fontSize: 11 }}>TZS {fmt(c.price)}</span>
            : <span style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", borderRadius: 6, padding: "1px 7px", fontWeight: 700, fontSize: 11 }}>No market price</span>}
          {c.remarks && <span style={{ color: C.gray400 }}>· {c.remarks}</span>}
        </div>
      </div>
      <ActionMenu actions={actions} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function CompaniesPage({ companies: globalCompanies, setCompanies, transactions, showToast, role, profile, manageOnly = false }) {
  const { C, isDark } = useTheme();
  const isSA      = role === "SA";
  const cdsNumber = profile?.cds_number || null;
  const isMobile  = useIsMobile();

  const [activeTab, setActiveTab] = useState(manageOnly ? "manage" : "portfolio");

  const [portfolio, setPortfolio]               = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError]     = useState(null);
  const [showDSEPopup, setShowDSEPopup]         = useState(false);

  const [masterList, setMasterList]       = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);

  const [search, setSearch]                 = useState("");
  const [deleting, setDeleting]             = useState(null);
  const [updating, setUpdating]             = useState(null);
  const [actionSheetCompany, setActionSheetCompany] = useState(null);
  const [actionSheetTab, setActionSheetTab]         = useState("chart");
  const [deleteModal, setDeleteModal]   = useState(null);
  const [updateModal, setUpdateModal]   = useState({ open: false, company: null });
  const [formModal, setFormModal]       = useState({ open: false, company: null });

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);

  const isMountedRef       = useRef(true);
  const portfolioReqRef    = useRef(0);
  const masterReqRef       = useRef(0);
  const rootRef            = useRef(null);
  const touchStartYRef     = useRef(null);
  const pullingRef         = useRef(false);
  const scrollHostRef      = useRef(null);
  const dseMsgTimerRef     = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearTimeout(dseMsgTimerRef.current);
    };
  }, []);

  useEffect(() => { setActiveTab(manageOnly ? "manage" : "portfolio"); }, [manageOnly]);

  // ── DSE auto-fetch state from site_settings (for last-fetch info display) ──
  const {
    loading: dseLoading,
    lastFetchAt: dseLastFetchAt, lastFetchStatus: dseLastFetchStatus, lastFetchCount: dseLastFetchCount,
  } = useDSEPriceFetch(supabase);

  // Separate local state for the portfolio copy-from-market operation
  const [dseFetching, setDseFetching] = useState(false);
  const [dseError,    setDseError]    = useState(null);
  const [dseFetchMsg, setDseFetchMsg] = useState(null);

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const todayIso         = useMemo(() => new Date().toISOString().split("T")[0], []);

  const closeDeleteModal  = useCallback(() => setDeleteModal(null), []);
  const closeUpdateModal  = useCallback(() => setUpdateModal({ open: false, company: null }), []);
  const closeFormModal    = useCallback(() => setFormModal({ open: false, company: null }), []);
  const closeActionSheet  = useCallback(() => { setActionSheetCompany(null); setActionSheetTab("chart"); }, []);
  const openNewCompanyModal = useCallback(() => setFormModal({ open: true, company: null }), []);

  const getScrollParent = useCallback((el) => {
    let node = el?.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const canScroll = (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }, []);

  // ── Data loaders ────────────────────────────────────────────────────
  const loadPortfolio = useCallback(async ({ fromPull = false } = {}) => {
    const reqId = ++portfolioReqRef.current;
    if (!cdsNumber) {
      if (isMountedRef.current && reqId === portfolioReqRef.current) {
        setPortfolio([]); setPortfolioError(null); setPortfolioLoading(false);
        if (fromPull) { setRefreshing(false); setPullDistance(0); }
      }
      return;
    }
    if (!fromPull && isMountedRef.current) { setPortfolioLoading(true); setPortfolioError(null); }
    try {
      const data = await sbGetPortfolio(cdsNumber);
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolio(data); setPortfolioError(null);
    } catch (e) {
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolioError(e.message || "Failed to load portfolio.");
      showToast?.(fromPull ? "Refresh failed" : "Failed to load portfolio.", "error");
    } finally {
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolioLoading(false);
      if (fromPull) { setRefreshing(false); setPullDistance(0); }
    }
  }, [cdsNumber, showToast]);

  // ── Client-side 1-minute auto-sync (calls edge function → syncs CDS prices) ──
  const {
    enabled: dseEnabled, serverEnabled: dseServerEnabled, active: dseActive,
    syncing: dseSyncing, lastSynced: dseLastSynced,
    lastCount: dseLastSyncCount, error: dseSyncError, toggle: dseToggleAutoFetch,
  } = useDSEAutoSync(cdsNumber, loadPortfolio);

  const handleDSEFetch = useCallback(async () => {
    setDseFetchMsg(null);
    setDseError(null);
    setDseFetching(true);
    try {
      const result = await sbCopyMarketPricesToCds(cdsNumber, "Market Price Sync");
      if (!isMountedRef.current) return;
      const { updatedCount: n, alreadyCurrent = 0, noMarketPrice = 0 } = result;
      const text = n > 0
        ? `${n} price${n !== 1 ? "s" : ""} updated`
        : alreadyCurrent > 0
          ? `All ${alreadyCurrent} price${alreadyCurrent !== 1 ? "s" : ""} already up to date`
          : noMarketPrice > 0
            ? "No market prices available yet"
            : "Nothing to update";
      setDseFetchMsg({ text, isError: false });
      loadPortfolio();
      clearTimeout(dseMsgTimerRef.current);
      dseMsgTimerRef.current = setTimeout(() => { if (isMountedRef.current) setDseFetchMsg(null); }, 6000);
    } catch (e) {
      if (!isMountedRef.current) return;
      setDseError(e.message);
    } finally {
      if (isMountedRef.current) setDseFetching(false);
    }
  }, [cdsNumber, loadPortfolio]);

  const loadMasterList = useCallback(async ({ fromPull = false } = {}) => {
    const reqId = ++masterReqRef.current;
    if (!fromPull && isMountedRef.current) setMasterLoading(true);
    try {
      const data = await sbGetAllCompanies();
      if (!isMountedRef.current || reqId !== masterReqRef.current) return;
      setMasterList(data);
    } catch (e) {
      if (!isMountedRef.current || reqId !== masterReqRef.current) return;
      showToast("Error loading companies: " + e.message, "error");
    } finally {
      if (!isMountedRef.current || reqId !== masterReqRef.current) return;
      setMasterLoading(false);
      if (fromPull) { setRefreshing(false); setPullDistance(0); }
    }
  }, [showToast]);

  const refreshCurrentView = useCallback(async ({ fromPull = false } = {}) => {
    if (activeTab === "manage" && isSA) await loadMasterList({ fromPull });
    else await loadPortfolio({ fromPull });
  }, [activeTab, isSA, loadMasterList, loadPortfolio]);

  // FIX 4: Single boot effect fires both loads in parallel for SA users.
  // Previously two separate useEffects triggered sequential render cycles.
  // Portfolio always loads (needed for the default tab).
  // Master list loads in parallel only when the user is SA — they will
  // land on portfolio tab but having the master list pre-fetched means
  // switching to the manage tab is instant.
  useEffect(() => {
    const loads = [loadPortfolio()];
    if (isSA) loads.push(loadMasterList());
    Promise.all(loads);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount

  // Keep manage tab fresh on subsequent tab switches (not on first mount —
  // the boot effect above already handles the initial SA load).
  const prevTabRef = useRef(null);
  useEffect(() => {
    if (prevTabRef.current === null) { prevTabRef.current = activeTab; return; }
    if (activeTab === "manage" && isSA) loadMasterList();
    prevTabRef.current = activeTab;
  }, [activeTab, isSA, loadMasterList]);

  // ── Pull to refresh ──────────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    if (!isMobile || refreshing) return;
    if ((activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) return;
    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; return; }
    touchStartYRef.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [activeTab, getScrollParent, isMobile, masterLoading, portfolioLoading, refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing) return;
    if ((activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) return;
    if (touchStartYRef.current == null) return;
    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) { pullingRef.current = false; setPullDistance(0); return; }
    pullingRef.current = true;
    setPullDistance(Math.min(92, Math.round(Math.pow(deltaY, 0.85))));
  }, [activeTab, getScrollParent, isMobile, masterLoading, portfolioLoading, refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || (activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) {
      touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return;
    }
    const shouldRefresh = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null; pullingRef.current = false;
    if (shouldRefresh) { setPullDistance(56); setRefreshing(true); refreshCurrentView({ fromPull: true }); }
    else setPullDistance(0);
  }, [activeTab, isMobile, masterLoading, portfolioLoading, pullDistance, refreshing, refreshCurrentView]);

  // ── Stats ────────────────────────────────────────────────────────────
  const portfolioStats = useMemo(() => {
    const priced   = portfolio.filter(c => c.cds_price != null);
    const avgPrice = priced.length ? priced.reduce((s, c) => s + Number(c.cds_price), 0) / priced.length : 0;
    const highest  = priced.length ? Math.max(...priced.map(c => Number(c.cds_price))) : 0;
    return { total: portfolio.length, avgPrice, highest, unpriced: portfolio.length - priced.length };
  }, [portfolio]);

  const filteredPortfolio = useMemo(() => {
    if (!normalizedSearch) return portfolio;
    return portfolio.filter(c => c.name.toLowerCase().includes(normalizedSearch));
  }, [portfolio, normalizedSearch]);

  const manageStats = useMemo(() => ({
    total: masterList.length,
    registeredToday: masterList.filter(c => c.created_at?.startsWith(todayIso)).length,
  }), [masterList, todayIso]);

  // ── Handlers ─────────────────────────────────────────────────────────

  // FIX 2: confirmUpdatePrice — use the return value from sbUpsertCdsPrice
  // to update cds_price_id and cds_price_created_by_id in state.
  // Previously the optimistic update set cds_price/cds_previous_price/
  // cds_updated_by/cds_updated_at correctly but left cds_price_id and
  // cds_price_created_by_id pointing at the old values. These IDs are used
  // by the detail/history modals and by the next upsert conflict resolution.
  const confirmUpdatePrice = useCallback(async ({ newPrice, datetime, reason }) => {
    const company = updateModal.company;
    if (!company) return;
    const oldPrice = company.cds_price != null ? Number(company.cds_price) : null;
    setUpdateModal({ open: false, company: null });
    setUpdating(company.id);
    try {
      const resolvedUpdatedAt = datetime ? new Date(datetime).toISOString() : new Date().toISOString();
      // sbUpsertCdsPrice returns the upserted cds_prices row:
      // { id, company_id, cds_number, price, previous_price, updated_by, updated_at, created_by_id }
      const upsertedRow = await sbUpsertCdsPrice({
        companyId: company.id, companyName: company.name, cdsNumber,
        newPrice, oldPrice, reason,
        updatedBy: profile?.full_name || "Unknown", datetime,
      });
      if (!isMountedRef.current) return;

      // Update state with all fields — including cds_price_id and
      // cds_price_created_by_id from the actual DB response.
      setPortfolio(prev => prev.map(c => {
        if (c.id !== company.id) return c;
        return {
          ...c,
          cds_price:               newPrice,
          cds_previous_price:      oldPrice,
          cds_updated_by:          profile?.full_name || "Unknown",
          cds_updated_at:          upsertedRow?.updated_at || resolvedUpdatedAt,
          // FIX: these two were previously left stale after every price update
          cds_price_id:            upsertedRow?.id            ?? c.cds_price_id,
          cds_price_created_by_id: upsertedRow?.created_by_id ?? c.cds_price_created_by_id,
        };
      }));
      showToast("Price updated for your portfolio!", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUpdating(null);
    }
  }, [updateModal.company, cdsNumber, profile?.full_name, showToast]);

  const openCompanyPopup = useCallback((company, tab = "chart") => {
    setActionSheetCompany(company);
    setActionSheetTab(tab);
  }, []);

  const handleFormConfirm = useCallback(async ({ name, price, remarks }) => {
    const editingCompany = formModal.company;
    const isEdit = !!editingCompany;
    try {
      if (isEdit) {
        const rows = await sbUpdate("companies", editingCompany.id, { name, remarks });
        if (!isMountedRef.current) return;
        setMasterList(prev => prev.map(c => (c.id === editingCompany.id ? rows[0] : c)));
        showToast("Company updated!", "success");
      } else {
        const rows = await sbInsert("companies", { name, price, remarks });
        if (!isMountedRef.current) return;
        setMasterList(prev => [rows[0], ...prev]);
        showToast("Company registered!", "success");
      }
      setFormModal({ open: false, company: null });
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    }
  }, [formModal.company, showToast]);

  const confirmDelete = useCallback(async () => {
    const id = deleteModal?.id;
    if (!id) return;
    setDeleteModal(null);
    setDeleting(id);
    try {
      await sbDelete("companies", id);
      if (!isMountedRef.current) return;
      setMasterList(prev => prev.filter(c => c.id !== id));
      showToast("Company deleted.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setDeleting(null);
    }
  }, [deleteModal, showToast]);

  const spinnerEl = (color = C.green) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <div style={{ width: 40, height: 40, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${color}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  const pullReady  = pullDistance >= 64;
  const theadBg    = isDark ? C.gray50 : "#F0F4F8";

  const mobileInputAttrs = isMobile ? {
    autoComplete: "off", autoCorrect: "off", autoCapitalize: "off",
    spellCheck: false, "data-form-type": "other", "data-lpignore": "true",
  } : {};

  return (
    <div
      ref={rootRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onTouchCancel={isMobile ? handleTouchEnd : undefined}
      style={{ position: "relative", height: isMobile ? "auto" : "calc(100vh - 118px)", display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden", paddingBottom: isMobile ? 96 : 0 }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .cp-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .cp-scroll::-webkit-scrollbar-track { background: transparent; }
        .cp-scroll::-webkit-scrollbar-thumb { background: ${isDark ? C.gray200 : "#cbd5e1"}; border-radius: 10px; }
        .cp-scroll { scrollbar-width: thin; scrollbar-color: ${isDark ? C.gray200 : "#cbd5e1"} transparent; }
      `}</style>

      {/* Pull to refresh indicator */}
      {isMobile && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
          <div style={{
            position: "absolute", left: "50%", top: 0,
            transform: `translate(-50%, ${Math.max(8, pullDistance - 34)}px)`,
            opacity: refreshing || pullDistance > 6 ? 1 : 0,
            transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease",
            background: C.white, border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`,
            borderRadius: 999, padding: "7px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${refreshing ? `${C.green}33` : C.gray200}`,
              borderTop: `2px solid ${pullReady || refreshing ? C.green : C.gray400}`,
              animation: refreshing ? "spin 0.8s linear infinite" : "none",
              transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`,
              transition: "transform 0.12s ease, border-color 0.12s ease", flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: refreshing ? C.green : (pullReady ? C.text : C.gray500), whiteSpace: "nowrap" }}>
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      {/* Modals */}
      {deleteModal && (
        <Modal type="confirm" title="Delete Company"
          message={`Are you sure you want to delete "${deleteModal.name}"? This cannot be undone.`}
          onConfirm={confirmDelete} onClose={closeDeleteModal} />
      )}
      {showDSEPopup && (
        <DSEPricePopup
          onClose={() => { setShowDSEPopup(false); setDseFetchMsg(null); }}
          isMobile={isMobile}
          enabled={dseEnabled} serverEnabled={dseServerEnabled} active={dseActive}
          loading={dseLoading} toggling={false}
          fetching={dseFetching} error={dseError} fetchMsg={dseFetchMsg}
          lastFetchAt={dseLastFetchAt} lastFetchStatus={dseLastFetchStatus} lastFetchCount={dseLastFetchCount}
          toggleAutoFetch={dseToggleAutoFetch}
          syncing={dseSyncing} lastSynced={dseLastSynced} lastSyncCount={dseLastSyncCount} syncError={dseSyncError}
          onFetchNow={handleDSEFetch}
        />
      )}
      {updateModal.open && (
        <UpdatePriceModal key={updateModal.company?.id}
          company={updateModal.company ? { ...updateModal.company, price: updateModal.company.cds_price ?? 0 } : null}
          onConfirm={confirmUpdatePrice} onClose={closeUpdateModal} />
      )}
      {formModal.open && (
        <CompanyFormModal key={formModal.company?.id || "new"}
          company={formModal.company} onConfirm={handleFormConfirm} onClose={closeFormModal} />
      )}
      {actionSheetCompany && (
        <CompanyDetailPopup
          company={actionSheetCompany}
          cdsNumber={cdsNumber}
          initialTab={actionSheetTab}
          role={role}
          onConfirmPrice={({ newPrice, datetime, reason }) => {
            // Set updateModal so confirmUpdatePrice can read the company
            setUpdateModal({ open: false, company: actionSheetCompany });
            // Then call the handler directly
            const company = actionSheetCompany;
            const oldPrice = company.cds_price != null ? Number(company.cds_price) : null;
            setUpdating(company.id);
            (async () => {
              try {
                const resolvedUpdatedAt = datetime ? new Date(datetime).toISOString() : new Date().toISOString();
                const upsertedRow = await sbUpsertCdsPrice({
                  companyId: company.id, companyName: company.name, cdsNumber,
                  newPrice, oldPrice, reason,
                  updatedBy: profile?.full_name || "Unknown", datetime,
                });
                if (!isMountedRef.current) return;
                setPortfolio(prev => prev.map(c => {
                  if (c.id !== company.id) return c;
                  return { ...c, cds_price: newPrice, cds_previous_price: oldPrice, cds_updated_by: profile?.full_name || "Unknown", cds_updated_at: upsertedRow?.updated_at || resolvedUpdatedAt, cds_price_id: upsertedRow?.id ?? c.cds_price_id, cds_price_created_by_id: upsertedRow?.created_by_id ?? c.cds_price_created_by_id };
                }));
                showToast(`${company.name} price updated to TZS ${newPrice.toLocaleString()}`, "success");
              } catch (e) {
                if (!isMountedRef.current) return;
                showToast("Error: " + e.message, "error");
              } finally {
                if (isMountedRef.current) setUpdating(null);
              }
            })();
            closeActionSheet();
          }}
          onClose={closeActionSheet} />
      )}
      {/* Transform wrapper */}
      <div style={{
        transform: isMobile ? `translateY(${pullDistance}px)` : "none",
        transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"),
        willChange: isMobile ? "transform" : "auto",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden",
      }}>

        {/* ═══════════════════ PORTFOLIO TAB ══════════════════════ */}
        {activeTab === "portfolio" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
            {isMobile ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14, flexShrink: 0 }}>
                <StatCard label="Holdings" value={portfolioStats.total} sub="In your portfolio" icon={<Icon name="building" size={17} />} color={C.navy} />
                <DSEPriceCard unpriced={portfolioStats.unpriced} lastFetchAt={dseLastFetchAt} onClick={() => setShowDSEPopup(true)} autoSyncEnabled={dseActive} syncing={dseSyncing} lastSynced={dseLastSynced} isMobile={isMobile} serverEnabled={dseServerEnabled} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24, flexShrink: 0 }}>
                <StatCard label="Holdings"      value={portfolioStats.total}                                                  sub="Companies with transactions"  icon={<Icon name="building" size={17} />} color={C.navy}  />
                <StatCard label="Avg. Price"    value={portfolioStats.avgPrice  ? `TZS ${fmtSmart(portfolioStats.avgPrice)}`  : "—"} sub="Across priced holdings" icon={<Icon name="barChart" size={17} />} color={C.green} />
                <StatCard label="Highest Price" value={portfolioStats.highest   ? `TZS ${fmtSmart(portfolioStats.highest)}`   : "—"} sub="Top priced holding"      icon={<Icon name="trophy" size={17} />} color={C.gold}  />
                <DSEPriceCard unpriced={portfolioStats.unpriced} lastFetchAt={dseLastFetchAt} onClick={() => setShowDSEPopup(true)} autoSyncEnabled={dseActive} syncing={dseSyncing} lastSynced={dseLastSynced} isMobile={isMobile} serverEnabled={dseServerEnabled} />
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 12 : 16, flexShrink: 0 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray500, display: "flex", alignItems: "center" }}><Icon name="search" size={14} stroke={C.gray500} /></span>
                <input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search your holdings..."
                  {...mobileInputAttrs}
                  style={{ width: "100%", border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "9px 12px 9px 36px", fontSize: isMobile ? 13 : 14, outline: "none", fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.green; }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; }}
                />
              </div>
              {search && <Btn variant="secondary" onClick={() => setSearch("")}>Clear</Btn>}
              {!isMobile && <Btn variant="secondary" icon={<Icon name="refresh" size={14} stroke={C.gray800} />} onClick={() => loadPortfolio()}>Refresh</Btn>}
              {isMobile && (
                <button onClick={() => loadPortfolio()} style={{ width: 40, height: 40, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="refresh" size={16} stroke={C.gray800} sw={2.2} /></button>
              )}
            </div>

            <SectionCard
              title={`Portfolio Holdings (${filteredPortfolio.length}${search ? ` of ${portfolio.length}` : ""})`}
              subtitle="CDS price analysis — private to you"
            >
              {portfolioLoading ? (
                <div style={{ textAlign: "center", padding: "50px 20px", color: C.gray400 }}>{spinnerEl(C.green)}<div style={{ fontSize: 13 }}>Loading your portfolio...</div></div>
              ) : portfolioError ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: C.red }}>
                  <div style={{ fontSize: 32, marginBottom: 8, display: "flex", justifyContent: "center" }}><Icon name="alertTriangle" size={32} stroke={C.red} /></div>
                  <div style={{ fontWeight: 600 }}>Failed to load portfolio</div>
                  <div style={{ fontSize: 13, marginTop: 4, color: C.gray400 }}>{portfolioError}</div>
                </div>
              ) : portfolio.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                  <div style={{ fontSize: 40, marginBottom: 12, display: "flex", justifyContent: "center" }}><Icon name="clipboard" size={40} stroke={C.gray500} /></div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No holdings yet</div>
                  <div style={{ fontSize: 13 }}>Record transactions to see companies appear here automatically</div>
                </div>
              ) : filteredPortfolio.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                  <div style={{ fontSize: 32, marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="search" size={32} stroke={C.gray500} /></div>
                  <div style={{ fontWeight: 600 }}>No results for "{search}"</div>
                </div>
              ) : isMobile ? (
                <div style={{ padding: "8px 12px" }}>
                  {filteredPortfolio.map(c => (
                    <PortfolioMobileCard
                      key={c.id}
                      company={c}
                      onTap={setActionSheetCompany}
                      // FIX 3: pass busy state so the card suppresses tap while
                      // a price update or history fetch is in progress.
                      isBusy={updating === c.id}
                    />
                  ))}
                </div>
              ) : (
                <>
                <div className="cp-scroll" style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {["#", "Company", "New Price", "Change", "Prev. Price", "Last Updated", "Updated By", "Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: h === "Actions" || h === "New Price" || h === "Change" || h === "Prev. Price" ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: isDark ? C.gray50 : "#F0F4F8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPortfolio.map((c, i) => {
                        const hasCdsPrice = c.cds_price != null;
                        const priceUp     = hasCdsPrice && c.cds_previous_price != null ? Number(c.cds_price) >= Number(c.cds_previous_price) : null;
                        const changePct   = hasCdsPrice && c.cds_previous_price != null && Number(c.cds_previous_price) !== 0
                          ? ((Number(c.cds_price) - Number(c.cds_previous_price)) / Number(c.cds_previous_price)) * 100 : null;
                        const rowBg      = !hasCdsPrice ? (isDark ? "#D9770610" : "#FFFBEB") : "transparent";
                        const rowBgHover = !hasCdsPrice ? (isDark ? "#D9770620" : "#FFF8DC") : C.gray50;
                        const changeBdr  = priceUp ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");

                        // FIX 1: add disabled to both actions when this row is busy.
                        // Previously neither action had disabled: true, so a double-tap
                        // on "Price History" would fire two concurrent requests and open
                        // two sequential modals. Same issue for "Update Price".
                        const isRowBusy = updating === c.id;
                        const portfolioActions = [
                          {
                            icon: <Icon name="dollarSign" size={14} stroke={C.green} />,
                            label: updating === c.id ? "Updating..." : hasCdsPrice ? "Update Price" : "Set Price",
                            disabled: isRowBusy,
                            onClick: () => setUpdateModal({ open: true, company: c }),
                          },
                          {
                            icon: <Icon name="barChart" size={14} stroke={C.text} />,
                            label: "Chart",
                            onClick: () => openCompanyPopup(c, "chart"),
                          },
                          {
                            icon: <Icon name="clock" size={14} stroke={C.text} />,
                            label: "History",
                            onClick: () => openCompanyPopup(c, "history"),
                          },
                          ...(isSA ? [{
                            icon: <Icon name="dollarSign" size={14} stroke="#1D4ED8" />,
                            label: "Dividend Events",
                            onClick: () => openCompanyPopup(c, "dividends"),
                          }] : []),
                        ];

                        return (
                          <tr key={c.id}
                            style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, transition: "background 0.15s", background: rowBg }}
                            onMouseEnter={e => { e.currentTarget.style.background = rowBgHover; }}
                            onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
                            <td style={{ padding: "10px 16px", color: C.gray400, fontWeight: 600, width: 36 }}>{i + 1}</td>
                            <td style={{ padding: "10px 16px", minWidth: 140, cursor: "pointer" }} onClick={() => setActionSheetCompany(c)}>
                              <div style={{ fontWeight: 700, color: C.text }}>{c.name}</div>
                              {c.remarks && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{c.remarks}</div>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {hasCdsPrice
                                ? <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{fmt(c.cds_price)}</span>
                                : <span style={{ ...amberBadgeStyle(isDark), display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={11} stroke="#D97706" /> Set price</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {priceUp !== null && changePct !== null
                                ? <span style={{ background: priceUp ? C.greenBg : C.redBg, color: priceUp ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${changeBdr}` }}>{priceUp ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%</span>
                                : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {c.cds_previous_price != null ? <span style={{ color: C.gray500, fontSize: 13 }}>{fmt(c.cds_previous_price)}</span> : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                              {c.cds_updated_at
                                ? <span style={{ fontSize: 12, color: C.gray600 }}>
                                    {new Date(c.cds_updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                    <span style={{ color: C.gray400, margin: "0 5px" }}>|</span>
                                    {new Date(c.cds_updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              {c.cds_updated_by
                                ? <span style={{ fontSize: 11, fontWeight: 600, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 8px" }}>{c.cds_updated_by}</span>
                                : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}><ActionMenu actions={portfolioActions} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: C.gray50 }}>
                  <span style={{ fontSize: 12, color: C.gray400 }}>
                    Showing <strong style={{ color: C.text }}>{filteredPortfolio.length === 1 ? "1" : `1–${filteredPortfolio.length}`}</strong> of <strong style={{ color: C.text }}>{portfolio.length}</strong>
                  </span>
                </div>
                </>
              )}
            </SectionCard>
          </div>
        )}

        {/* ═══════════════════ MANAGE TAB (SA only) ═══════════════ */}
        {activeTab === "manage" && isSA && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
            {isMobile ? (
              <div style={{ marginBottom: 14, flexShrink: 0 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <StatCard label="Total Companies"  value={manageStats.total}           sub="In master registry" icon={<Icon name="building" size={17} stroke={C.navy} />} color={C.navy}  />
                  <StatCard label="Registered Today" value={manageStats.registeredToday} sub="Added today"        icon={<Icon name="checkCircle" size={17} stroke={C.green} />} color={C.green} />
                </div>
                <button onClick={openNewCompanyModal} style={{ width: "100%", height: 42, borderRadius: 9, border: "none", background: C.navy, color: "#ffffff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  + Register New Company
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24, flexShrink: 0 }}>
                <StatCard label="Total Companies"   value={manageStats.total}           sub="In master registry" icon={<Icon name="building" size={17} stroke={C.navy} />} color={C.navy}  />
                <StatCard label="Registered Today"  value={manageStats.registeredToday} sub="Added today"        icon={<Icon name="checkCircle" size={17} stroke={C.green} />} color={C.green} />
                <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 90 }}>
                  <Btn variant="navy" icon="+" onClick={openNewCompanyModal}>Register New Company</Btn>
                </div>
              </div>
            )}

            <SectionCard title={`Master Company Registry (${masterList.length})`} subtitle="All listed companies available in the system">
              {masterLoading ? (
                <div style={{ textAlign: "center", padding: "50px 20px", color: C.gray400 }}>{spinnerEl(C.navy)}<div style={{ fontSize: 13 }}>Loading master registry...</div></div>
              ) : masterList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                  <div style={{ fontSize: 40, marginBottom: 12, display: "flex", justifyContent: "center" }}><Icon name="building" size={40} stroke={C.gray500} /></div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No companies registered yet</div>
                  <div style={{ fontSize: 13 }}>Click "Register Company" to add the first one</div>
                </div>
              ) : isMobile ? (
                <div style={{ padding: "8px 12px" }}>
                  {masterList.map(c => (
                    <ManageMobileCard key={c.id} company={c} deleting={deleting}
                      onEdit={(company) => setFormModal({ open: true, company })}
                      onDelete={(company) => setDeleteModal({ id: company.id, name: company.name })}
                      onDividends={(company) => openCompanyPopup(company, "dividends")} />
                  ))}
                </div>
              ) : (
                <>
                <div className="cp-scroll" style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {["#", "Company Name", "Sector", "Market Price", "Registered", "Actions"].map(h => (
                          <th key={h} style={{ padding: "8px 14px", textAlign: h === "Actions" || h === "Market Price" ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: isDark ? C.gray50 : "#F0F4F8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {masterList.map((c, i) => {
                        const manageActions = [
                          { icon: <Icon name="edit" size={14} stroke={C.text} />, label: "Edit Company", onClick: () => setFormModal({ open: true, company: c }) },
                          { icon: <Icon name="dollarSign" size={14} stroke="#1D4ED8" />, label: "Dividend Events", onClick: () => openCompanyPopup(c, "dividends") },
                          { icon: <Icon name="trash" size={14} stroke={C.red} />, label: deleting === c.id ? "Deleting..." : "Delete", danger: true, disabled: deleting === c.id, onClick: () => setDeleteModal({ id: c.id, name: c.name }) },
                        ];
                        return (
                          <tr key={c.id}
                            style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, transition: "background 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <td style={{ padding: "8px 14px", color: C.gray400, fontWeight: 600, width: 36, fontSize: 12 }}>{i + 1}</td>
                            <td style={{ padding: "8px 14px", minWidth: 140 }}><div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{c.name}</div></td>
                            <td style={{ padding: "8px 14px", color: C.gray500, fontSize: 12 }}>{c.remarks || <span style={{ color: C.gray400 }}>—</span>}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {c.price != null
                                ? <span style={{ background: C.greenBg, color: C.green, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{fmt(c.price)}</span>
                                : <span style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>No price</span>}
                            </td>
                            <td style={{ padding: "8px 14px", color: C.gray500, fontSize: 12, whiteSpace: "nowrap" }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right" }}><ActionMenu actions={manageActions} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: C.gray50 }}>
                  <span style={{ fontSize: 12, color: C.gray400 }}>
                    Showing <strong style={{ color: C.text }}>{masterList.length === 1 ? "1" : `1–${masterList.length}`}</strong> of <strong style={{ color: C.text }}>{masterList.length}</strong>
                  </span>
                </div>
                </>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}
