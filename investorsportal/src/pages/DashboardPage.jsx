// ── src/pages/DashboardPage.jsx ────────────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef, memo, cloneElement } from "react";
import { useTheme, ReportsModal } from "../components/ui";
import { Icon, IconBadge } from "../lib/icons";
import { sbGetPortfolio, sbGetTransactions, sbGetAllUsers, sbGetCDSAssignedUsers, sbGetDividendSummary, sbGetDividendByCompany, sbHasTodaySnapshot, sbCaptureSnapshot, sbGetSnapshots } from "../lib/supabase";
import { generatePortfolioStatementPDF, generateTransactionHistoryPDF, generateGainLossReportPDF, generatePortfolioExcel, generateTransactionExcel } from "../lib/reports";
import logo from "../assets/logo.jpg";

// ── Mobile breakpoint hook ─────────────────────────────────────────
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
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(t);
    };
  }, []);
  return isMobile;
};

// ── Formatters ─────────────────────────────────────────────────────
const fmt = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0
    ? v.toLocaleString("en-US")
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtShort = (n) => {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(v) >= 1_000_000)     return `${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)         return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};

// ── Days between two dates ─────────────────────────────────────────
const daysBetween = (dateStr) => {
  if (!dateStr) return null;
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
};

// ── Module-level constants (never recreated) ───────────────────────
const CHART_COLORS = [
  "#3b82f6", "#00843D", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];
const AVATAR_COLORS = [
  "#0B1F3A", "#2563eb", "#065F46", "#7C3AED",
  "#B45309", "#0369A1", "#1D4ED8", "#9D174D",
];
const ROLE_NAMES = {
  SA: "Super Admin",
  AD: "Admin",
  DE: "Data Entrant",
  VR: "Verifier",
  RO: "Read Only",
};

// ── Status helpers ─────────────────────────────────────────────────
const statusOf   = (t) => String(t?.status || "").toLowerCase().trim();
const isVerified = (t) => statusOf(t) === "verified";
const txTime     = (t) => new Date(t?.date || t?.created_at || 0).getTime() || 0;

// ── Shared table primitives ────────────────────────────────────────
const Th = memo(function Th({ children, right }) {
  const { C } = useTheme();
  return (
    <th style={{
      padding: "8px 12px",
      textAlign: right ? "right" : "left",
      fontWeight: 700,
      fontSize: 10,
      color: C.gray400,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      borderBottom: `1px solid ${C.gray200}`,
      background: C.gray50,
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
});

const Td = memo(function Td({ children, bold, color, small, right }) {
  const { C } = useTheme();
  return (
    <td style={{
      padding: "9px 12px",
      fontWeight: bold ? 700 : 400,
      color: color || C.text,
      fontSize: small ? 11 : 13,
      textAlign: right ? "right" : "left",
      whiteSpace: right ? "nowrap" : undefined,
    }}>
      {children}
    </td>
  );
});

const Badge = memo(function Badge({ value, positive }) {
  const { C } = useTheme();
  const isPos = positive ?? Number(value) >= 0;
  return (
    <span style={{
      background: isPos ? C.greenBg : C.redBg,
      color: isPos ? C.green : C.red,
      border: `1px solid ${isPos ? C.green : C.red}20`,
      borderRadius: 8,
      padding: "2px 8px",
      fontSize: 11,
      fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {value}
    </span>
  );
});

// ── PerformanceChart — inline SVG polyline chart ──────────────────
const RANGE_DAYS = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365, ALL: 9999 };

const PerformanceChart = memo(function PerformanceChart({ snapshots, range, onRangeChange, C, isDark }) {
  if (!snapshots || snapshots.length < 2) return null;

  const days = RANGE_DAYS[range] || 90;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const filtered = days >= 9999 ? snapshots : snapshots.filter(s => new Date(s.snapshot_date) >= cutoff);
  if (filtered.length < 2) return null;

  const values = filtered.map(s => Number(s.total_market_value));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const valRange = maxVal - minVal || 1;

  const W = 500, H = 120, PAD = 2;
  const points = filtered.map((s, i) => {
    const x = PAD + (i / (filtered.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((Number(s.total_market_value) - minVal) / valRange) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePct = first > 0 ? (change / first) * 100 : 0;
  const isPositive = change >= 0;
  const lineColor = isPositive ? (isDark ? "#34d399" : C.green) : (isDark ? "#f87171" : C.red);
  const fillColor = isPositive ? (isDark ? "rgba(52,211,153,0.08)" : "rgba(0,132,61,0.06)") : (isDark ? "rgba(248,113,113,0.08)" : "rgba(220,38,38,0.06)");

  // Fill polygon: line + bottom edges
  const fillPoints = `${PAD},${H} ${points} ${W - PAD},${H}`;

  const ranges = ["1W", "1M", "3M", "6M", "1Y", "ALL"];

  return (
    <div style={{ padding: "16px 18px", borderRadius: 14, border: `1px solid ${C.gray200}`, background: isDark ? "rgba(255,255,255,0.02)" : "#fafbfc", marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Portfolio Performance</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: isPositive ? C.green : C.red }}>
              {isPositive ? "+" : ""}{changePct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 12, color: C.gray400 }}>
              {isPositive ? "+" : ""}TZS {Number(change.toFixed(0)).toLocaleString()}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {ranges.map(r => (
            <button key={r} onClick={() => onRangeChange(r)}
              style={{
                padding: "4px 8px", borderRadius: 6, border: "none", fontSize: 10, fontWeight: 700,
                background: r === range ? (isDark ? "rgba(255,255,255,0.12)" : C.navy) : "transparent",
                color: r === range ? (isDark ? "#fff" : "#fff") : C.gray400,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
              }}
            >{r}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} preserveAspectRatio="none">
        <polygon points={fillPoints} fill={fillColor} />
        <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: C.gray400 }}>{filtered[0]?.snapshot_date}</span>
        <span style={{ fontSize: 10, color: C.gray400 }}>{filtered[filtered.length - 1]?.snapshot_date}</span>
      </div>
    </div>
  );
});

// ── SnapCard ───────────────────────────────────────────────────────
const SnapCard = memo(function SnapCard({
  label, value, sub, dark, accent, accentBg,
  expandable, expanded, onToggle, loading, children, hoverable,
}) {
  const { C } = useTheme();
  const isColored = expanded && accentBg && !dark;
  const labelClr = dark ? "rgba(255,255,255,0.4)"   : isColored ? "rgba(255,255,255,0.6)"  : C.gray400;
  const valueClr = dark ? "#ffffff" : isColored ? "#ffffff" : C.text;
  const subClr   = dark ? "rgba(255,255,255,0.3)"   : isColored ? "rgba(255,255,255,0.55)" : C.gray400;
  const chevClr  = isColored
    ? "rgba(255,255,255,0.9)"
    : expanded
      ? (accent || C.green)
      : dark ? "rgba(255,255,255,0.55)" : C.gray500;
  const eff = accent || C.green;

  return (
    <div
      style={{
        background: dark ? "linear-gradient(135deg, #0B1F3A 0%, #1e3a5f 100%)" : C.white,
        border: `1.5px solid ${expanded ? eff : (dark ? "#1e3a5f" : C.gray200)}`,
        borderRadius: 14,
        overflow: "hidden", minWidth: 0,
        boxShadow: expanded ? `0 4px 20px ${eff}33` : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "all 0.18s ease",
        cursor: expandable ? "pointer" : "default",
      }}
      onMouseEnter={(e) => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor = eff;
        e.currentTarget.style.boxShadow   = `0 4px 20px ${eff}33`;
        e.currentTarget.style.transform   = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor = expanded ? eff : (dark ? "#1e3a5f" : C.gray200);
        e.currentTarget.style.boxShadow   = expanded ? `0 4px 20px ${eff}33` : "0 1px 4px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform   = "none";
      }}
    >
      <div
        onClick={expandable ? onToggle : undefined}
        style={{
          padding: "16px 18px",
          cursor: expandable ? "pointer" : "default",
          userSelect: "none",
          background: isColored ? `linear-gradient(135deg, ${accentBg}ee, ${accentBg}bb)` : "transparent",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => {
          if (!expandable || isColored) return;
          e.currentTarget.style.background = dark ? "rgba(255,255,255,0.04)" : `${C.gray50}80`;
        }}
        onMouseLeave={(e) => {
          if (isColored) return;
          e.currentTarget.style.background = "transparent";
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: labelClr, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {label}
          </div>
          {expandable && (
            <span style={{
              fontSize: 12,
              color: chevClr,
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
              fontWeight: expanded ? 700 : 400,
            }}>
              ▾
            </span>
          )}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: valueClr, lineHeight: 1, marginBottom: 5, transition: "color 0.2s", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {loading
            ? <span style={{ fontSize: 14, color: dark ? "rgba(255,255,255,0.2)" : isColored ? "rgba(255,255,255,0.3)" : C.gray400 }}>—</span>
            : value}
        </div>
        <div style={{ fontSize: 11, color: subClr, transition: "color 0.2s" }}>{sub}</div>
      </div>
      {expandable && (
        <div style={{ maxHeight: expanded ? "800px" : 0, overflow: "hidden", transition: "max-height 0.3s ease" }}>
          <div style={{ borderTop: `1px solid ${isColored ? "rgba(255,255,255,0.15)" : dark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
});

// ── StatCard ───────────────────────────────────────────────────────
const StatCard = memo(function StatCard({
  icon, label, value, subLabel, accent, accentBg,
  onClick, active, navigates, loading,
}) {
  const { C, isDark } = useTheme();
  const isColored = active && accentBg;
  const hdrText = isColored ? "#ffffff" : C.text;
  const hdrSub  = isColored ? "rgba(255,255,255,0.65)" : C.gray500;
  const hdrHint = isColored ? "rgba(255,255,255,0.45)" : C.gray400;
  // Pale pastel bg per accent color
  const h = (accent || "").toLowerCase();
  const pale = h.includes("f59e") || h.includes("f0b4") ? { bg: "#FEF3C7", bdr: "#FDE68A" }  // amber
    : h.includes("ef44") || h.includes("ef6e") ? { bg: "#FEE2E2", bdr: "#FECACA" }            // red
    : h.includes("2563") || h.includes("3b6f") ? { bg: "#DBEAFE", bdr: "#BFDBFE" }            // blue
    : { bg: "#D1FAE5", bdr: "#A7F3D0" };                                                       // green
  const paleBg = pale.bg;
  const paleBdr = pale.bdr;

  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1.5px solid ${active ? accent : C.gray200}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.18s ease",
        boxShadow: active ? `0 4px 20px ${accent}33` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={(e) => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow   = `0 4px 20px ${accent}33`;
        e.currentTarget.style.transform   = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = active ? accent : C.gray200;
        e.currentTarget.style.boxShadow   = active ? `0 4px 20px ${accent}33` : "0 1px 4px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform   = "none";
      }}
    >
      <div style={{
        padding: "16px 18px 14px",
        background: isColored ? `linear-gradient(135deg, ${accentBg}ee, ${accentBg}bb)` : "transparent",
        transition: "background 0.2s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11,
            background: isColored ? "rgba(255,255,255,0.22)" : paleBg,
            border: isColored ? "1.5px solid rgba(255,255,255,0.15)" : `1.5px solid ${paleBdr}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, transition: "background 0.2s",
            color: isColored ? "#ffffff" : "#374151",
          }}>
            {isColored ? cloneElement(icon, { stroke: "#ffffff" }) : icon}
          </div>
          {navigates && <span style={{ fontSize: 13, color: isColored ? "rgba(255,255,255,0.6)" : C.gray400, marginTop: 2 }}>→</span>}
          {!navigates && onClick && (
            <span style={{
              fontSize: 12,
              color: isColored ? "rgba(255,255,255,0.9)" : (active ? accent : C.gray500),
              marginTop: 2,
              display: "inline-block",
              transform: active ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
              fontWeight: active ? 700 : 400,
            }}>
              ▾
            </span>
          )}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: hdrText, lineHeight: 1, transition: "color 0.2s" }}>
          {loading ? <span style={{ fontSize: 14, color: isColored ? "rgba(255,255,255,0.3)" : C.gray400 }}>—</span> : value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: hdrSub, marginTop: 5, transition: "color 0.2s" }}>{label}</div>
        {subLabel && <div style={{ fontSize: 11, color: hdrHint, marginTop: 2, transition: "color 0.2s" }}>{subLabel}</div>}
      </div>
    </div>
  );
});

// ── ExpandPanel ────────────────────────────────────────────────────
const ExpandPanel = memo(function ExpandPanel({ title, onClose, accentColor, children }) {
  const { C } = useTheme();
  return (
    <div style={{
      background: C.white,
      border: `1.5px solid ${accentColor || C.gray200}`,
      borderRadius: 14,
      padding: "20px 24px",
      marginTop: 14,
      marginBottom: 14,
      animation: "dashFadeDown 0.2s ease",
      boxShadow: accentColor ? `0 4px 20px ${accentColor}18` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
        <button
          onClick={onClose}
          style={{
            background: accentColor ? `${accentColor}18` : C.gray100,
            border: "none", borderRadius: "50%",
            width: 36, height: 36,
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >
          <Icon name="x" size={15} stroke={C.gray500} sw={2.2} />
        </button>
      </div>
      {children}
    </div>
  );
});

// ── Spinner / Empty ────────────────────────────────────────────────
const Spinner = memo(function Spinner() {
  const { C } = useTheme();
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 0" }}>
      <div style={{
        width: 22, height: 22,
        border: `3px solid ${C.gray100}`,
        borderTop: `3px solid ${C.green}`,
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );
});

const Empty = memo(function Empty({ msg }) {
  const { C } = useTheme();
  return <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "24px 0" }}>{msg}</div>;
});

// ── Mobile metric card ─────────────────────────────────────────────
const MobileMetricCard = memo(function MobileMetricCard({ label, value, sub, accent, onClick, chevron }) {
  const { C } = useTheme();
  const hasAccent = !!accent;
  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1.5px solid ${hasAccent ? `${accent}40` : C.gray200}`,
        borderRadius: 12,
        padding: "13px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{
        fontSize: 9, color: C.gray400, fontWeight: 700,
        textTransform: "uppercase", letterSpacing: "0.05em",
        marginBottom: 6, display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {label}
        {chevron && onClick && (
          <span style={{
            fontSize: 10, color: C.gray400,
            transform: chevron === "open" ? "rotate(180deg)" : "none",
            display: "inline-block", transition: "transform 0.2s",
          }}>
            ▾
          </span>
        )}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: hasAccent ? accent : C.text, lineHeight: 1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.gray400, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
});

// ── Mobile stat pill ───────────────────────────────────────────────
const MobileStatPill = memo(function MobileStatPill({ icon, label, value, onClick, active, accent, navigates }) {
  const { C } = useTheme();
  const h = (accent || "").toLowerCase();
  const pale = h.includes("f59e") || h.includes("f0b4") ? { bg: "#FEF3C7", bdr: "#FDE68A" }
    : h.includes("ef44") || h.includes("ef6e") ? { bg: "#FEE2E2", bdr: "#FECACA" }
    : h.includes("2563") || h.includes("3b6f") ? { bg: "#DBEAFE", bdr: "#BFDBFE" }
    : { bg: "#D1FAE5", bdr: "#A7F3D0" };
  return (
    <div
      onClick={onClick}
      style={{
        background: active ? `${accent}12` : C.white,
        border: `1.5px solid ${active ? accent : C.gray200}`,
        borderRadius: 12,
        padding: "11px 12px",
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
      }}
    >
      <div style={{ width: 36, height: 36, borderRadius: 10, background: pale.bg, border: `1.5px solid ${pale.bdr}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#374151" }}>{icon}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: active ? accent : C.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: active ? accent : C.gray400, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{label}</div>
      {navigates && <span style={{ fontSize: 10, color: C.gray400 }}>→</span>}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function DashboardPage({ profile, role, showToast, onNavigate, activeCds }) {
  const { C, isDark } = useTheme();
  const [portfolio,     setPortfolio]     = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [userCount,     setUserCount]     = useState(null);
  const [allUsers,      setAllUsers]      = useState([]);
  const [cdsMembers,    setCdsMembers]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [dividendSummary, setDividendSummary] = useState(null);
  const [dividendByCompany, setDividendByCompany] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [chartRange, setChartRange] = useState("3M");
  const [showReportsModal, setShowReportsModal] = useState(false);
  const [expanded,      setExpanded]      = useState(null);
  const [pullDistance,  setPullDistance]  = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);

  const isMobile = useIsMobile();
  const isSAAD   = ["SA", "AD"].includes(role);

  const snapRef          = useRef(null);
  const hasExpandedRef   = useRef(false);
  const mountedRef       = useRef(true);
  // FIX 1: request ID counter — prevents a superseded loadDashboard call
  // (triggered by a fast CDS switch) from overwriting fresh data once the
  // slower stale call eventually resolves.
  const dashReqRef       = useRef(0);
  const rootRef          = useRef(null);
  const touchStartYRef   = useRef(null);
  const pullingRef       = useRef(false);
  const scrollHostRef    = useRef(null);

  const cds   = profile?.cds_number || null;
  const myTxns = useMemo(
    () => (cds ? transactions.filter((t) => t.cds_number === cds) : transactions),
    [transactions, cds]
  );

  const getScrollParent = useCallback((el) => {
    let node = el?.parentElement;
    while (node) {
      const style     = window.getComputedStyle(node);
      const canScroll = (style.overflowY === "auto" || style.overflowY === "scroll") && node.scrollHeight > node.clientHeight;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }, []);

  const loadDashboard = useCallback(async ({ fromPull = false } = {}) => {
    if (!mountedRef.current) return;

    // FIX 1: stamp this call with a request ID. If a newer call starts
    // before this one resolves, all setState calls below are skipped.
    const reqId = ++dashReqRef.current;

    if (fromPull) setRefreshing(true);
    else          setLoading(true);

    try {
      const activeCdsId = activeCds?.cds_id;

      const [port, txns, users, members, divSummary, divByCompany] = await Promise.all([
        sbGetPortfolio(profile?.cds_number).catch(() => []),
        sbGetTransactions().catch(() => []),
        // FIX 2: only call sbGetAllUsers for SA/AD roles.
        // DE/VR/RO users hit a permission-denied error on this RPC
        // on every single dashboard open. The .catch masked the error
        // but still fired a wasted network round-trip. For non-admins
        // and when a specific CDS is active, skip entirely.
        (isSAAD && !activeCdsId)
          ? sbGetAllUsers().catch(() => [])
          : Promise.resolve([]),
        activeCdsId
          ? sbGetCDSAssignedUsers(activeCdsId).catch(() => [])
          : Promise.resolve([]),
        profile?.cds_number
          ? sbGetDividendSummary(profile.cds_number).catch(() => null)
          : Promise.resolve(null),
        profile?.cds_number
          ? sbGetDividendByCompany(profile.cds_number).catch(() => [])
          : Promise.resolve([]),
      ]);

      // FIX 1: discard results if a newer request has already started
      if (!mountedRef.current || reqId !== dashReqRef.current) return;

      setPortfolio(port || []);
      setTransactions(txns || []);
      if (divSummary) setDividendSummary(divSummary);
      if (divByCompany?.length) setDividendByCompany(divByCompany);

      if (users?.length) {
        setUserCount(users.length);
        setAllUsers(users);
      } else if (isSAAD && !activeCdsId) {
        // SA/AD with no specific CDS — genuinely zero users, not skipped
        setUserCount(0);
        setAllUsers([]);
      }

      setCdsMembers(
        members?.length
          ? members.map((m) => ({
              id:         m.user_id,
              full_name:  m.full_name,
              role_code:  m.role_code,
              is_active:  m.is_active,
              phone:      m.phone      || null,
              email:      m.email      || null,
              avatar_url: m.avatar_url || null,
            }))
          : []
      );
    } catch {
      if (mountedRef.current && reqId === dashReqRef.current)
        showToast?.(fromPull ? "Refresh failed" : "Dashboard load error", "error");
    } finally {
      if (!mountedRef.current || reqId !== dashReqRef.current) return;
      setLoading(false);
      setRefreshing(false);
      setPullDistance(0);
    }
  }, [activeCds?.cds_id, profile?.cds_number, isSAAD, showToast]);

  useEffect(() => {
    mountedRef.current = true;
    loadDashboard();
    return () => { mountedRef.current = false; };
  }, [loadDashboard]);

  // ── Snapshot capture + chart data loading ────────────────────────
  // Lazy: capture today's snapshot if it doesn't exist, then load chart data
  const snapshotCaptured = useRef(false);
  useEffect(() => {
    if (!profile?.cds_number || loading || snapshotCaptured.current) return;
    const cds = profile.cds_number;

    (async () => {
      try {
        // Check if we already have today's snapshot
        const hasToday = await sbHasTodaySnapshot(cds);
        if (!hasToday && portfolio.length > 0) {
          // Build snapshot data from current metrics
          // We compute inline to avoid circular dependency with the metrics useMemo
          let totalMV = 0, totalCB = 0;
          const details = [];
          for (const co of portfolio) {
            const price = Number(co.cds_price || 0);
            // Get net shares for this company from transactions
            let netShares = 0;
            let costBasis = 0;
            for (const t of transactions) {
              if (t.company_id === co.id && t.cds_number === cds && (t.status === "verified")) {
                if (t.type === "Buy") {
                  netShares += Number(t.qty || 0);
                  costBasis += Number(t.total || 0) + Number(t.fees || 0);
                } else {
                  netShares -= Number(t.qty || 0);
                }
              }
            }
            if (netShares <= 0) continue;
            const mv = netShares * price;
            totalMV += mv;
            totalCB += costBasis;
            details.push({
              company_id: co.id,
              company_name: co.name,
              shares_held: netShares,
              price: price,
              market_value: mv,
              cost_basis: costBasis,
            });
          }
          await sbCaptureSnapshot(cds, {
            totalMarketValue: totalMV,
            totalCostBasis: totalCB,
            unrealizedGL: totalMV - totalCB,
            dividendYTD: dividendSummary?.ytd_net || 0,
            companyCount: details.length,
            details,
          });
          snapshotCaptured.current = true;
        }

        // Load chart data (always, regardless of capture)
        const fromDate = new Date();
        fromDate.setFullYear(fromDate.getFullYear() - 1);
        const snaps = await sbGetSnapshots(cds, fromDate.toISOString().split("T")[0], new Date().toISOString().split("T")[0]);
        if (mountedRef.current) setSnapshots(snaps || []);
      } catch { /* silent — snapshots are non-critical */ }
    })();
  }, [profile?.cds_number, loading, portfolio, transactions, dividendSummary]);

  const groupedVerifiedByCompany = useMemo(() => {
    const map = new Map();
    let grossBuyCapital = 0;
    let pending         = 0;

    for (const t of myTxns) {
      const s = statusOf(t);
      if (s === "pending" || s === "confirmed") pending++;
      if (!isVerified(t)) continue;

      const { company_id } = t;
      if (company_id) {
        if (!map.has(company_id)) map.set(company_id, []);
        map.get(company_id).push(t);
      }
      if (t.type === "Buy") grossBuyCapital += Number(t.total || 0) + Number(t.fees || 0);
    }

    for (const arr of map.values()) arr.sort((a, b) => txTime(a) - txTime(b));
    return { map, grossBuyCapital, pending };
  }, [myTxns]);

  const metrics = useMemo(() => {
    const total          = myTxns.length;
    const pending        = groupedVerifiedByCompany.pending;
    const grossBuyCapital = groupedVerifiedByCompany.grossBuyCapital;
    const hasCostData    = grossBuyCapital > 0;
    const txnCompanyCount = new Set(myTxns.map((t) => t.company_id).filter(Boolean)).size;

    let totalMarketValue        = 0;
    let totalCurrentCost        = 0;
    let totalRealizedGLAll      = 0;
    let totalSaleProceedsAcc    = 0;
    let totalCostBasisAcc       = 0;
    let totalSharesSoldAcc      = 0;
    let totalBuyTxnCount        = 0;
    let firstBuyDaysNumerator   = 0;
    let firstBuySharesDenominator = 0;

    const companyMetricsRaw = portfolio.map((company, idx) => {
      const color        = CHART_COLORS[idx % CHART_COLORS.length];
      const verifiedTxns = groupedVerifiedByCompany.map.get(company.id) || [];

      let sharesHeld = 0, costHeld = 0, runningAvg = 0;
      let realizedGL = 0, totalSaleProceeds = 0, totalCostBasis = 0, totalSharesSold = 0;
      let buyTxnCount = 0, firstBuyDate = null;
      const realizedTrades = [];

      for (const t of verifiedTxns) {
        const qty  = Number(t.qty  || 0);
        const fees = Number(t.fees || 0);

        if (t.type === "Buy") {
          const cost = Number(t.total || 0) + fees;
          costHeld   += cost;
          sharesHeld += qty;
          runningAvg  = sharesHeld > 0 ? costHeld / sharesHeld : 0;
          buyTxnCount++;
          if (t.date && (!firstBuyDate || t.date < firstBuyDate)) firstBuyDate = t.date;

        } else if (t.type === "Sell") {
          if (sharesHeld <= 0) continue;
          const actualSold   = Math.min(qty, sharesHeld);
          const costBasis    = actualSold * runningAvg;
          const netProceeds  = Number(t.total || 0) - fees;
          const gain         = netProceeds - costBasis;
          const retPct       = costBasis > 0 ? (gain / costBasis) * 100 : 0;
          const daysHeld     = firstBuyDate && t.date
            ? Math.max(0, Math.floor((new Date(t.date) - new Date(firstBuyDate)) / 86_400_000))
            : null;

          realizedGL         += gain;
          totalSaleProceeds  += netProceeds;
          totalCostBasis     += costBasis;
          totalSharesSold    += actualSold;

          costHeld   -= costBasis;
          sharesHeld -= actualSold;
          if (sharesHeld <= 0) { sharesHeld = 0; costHeld = 0; runningAvg = 0; }

          realizedTrades.push({ soldShares: actualSold, costBasis, saleProceeds: netProceeds, realizedGL: gain, realRetPct: retPct, date: t.date, daysHeld });
        }
      }

      const currentPrice     = Number(company.cds_price || 0);
      const marketValue      = sharesHeld > 0 && currentPrice > 0 ? sharesHeld * currentPrice : 0;
      const openPositionCost = costHeld;
      const unrealizedGL     = currentPrice > 0 ? marketValue - openPositionCost : 0;
      const unrealizedRetPct = openPositionCost > 0 ? (unrealizedGL / openPositionCost) * 100 : 0;
      const firstBuyDays     = firstBuyDate ? daysBetween(firstBuyDate) : null;

      totalMarketValue     += marketValue;
      totalCurrentCost     += openPositionCost;
      totalRealizedGLAll   += realizedGL;
      totalSaleProceedsAcc += totalSaleProceeds;
      totalCostBasisAcc    += totalCostBasis;
      totalSharesSoldAcc   += totalSharesSold;
      totalBuyTxnCount     += buyTxnCount;
      if (sharesHeld > 0 && firstBuyDays !== null) {
        firstBuyDaysNumerator     += firstBuyDays * sharesHeld;
        firstBuySharesDenominator += sharesHeld;
      }

      return {
        id: company.id, name: company.name, color,
        netShares: sharesHeld, avgCost: runningAvg, currentPrice,
        marketValue, openPositionCost, unrealizedGL, unrealizedRetPct,
        firstBuyDays, buyTransactionCount: buyTxnCount,
        hasAnomaly: sharesHeld < 0,
        realizedTrades, realizedGL, totalSaleProceeds, totalCostBasis, totalSharesSold,
        prevPrice: Number(company.cds_previous_price || 0),
      };
    });

    const activeCompanies = [];
    for (const c of companyMetricsRaw) {
      if (c.netShares <= 0 && c.marketValue <= 0) continue;
      activeCompanies.push({
        ...c,
        weight:     totalMarketValue  > 0 ? (c.marketValue      / totalMarketValue)  * 100 : 0,
        costWeight: totalCurrentCost  > 0 ? (c.openPositionCost / totalCurrentCost)  * 100 : 0,
      });
    }
    activeCompanies.sort((a, b) => b.marketValue - a.marketValue);

    const unrealizedGL     = totalMarketValue - totalCurrentCost;
    const unrealizedRetPct = totalCurrentCost > 0 ? (unrealizedGL / totalCurrentCost) * 100 : 0;
    const hasFinancials    = activeCompanies.some((c) => c.currentPrice > 0 && c.netShares > 0);
    const hasRealized      = totalRealizedGLAll !== 0;
    const investedCapital  = totalCurrentCost > 0 ? totalCurrentCost : grossBuyCapital;
    const totalNetShares   = activeCompanies.reduce((s, c) => s + c.netShares, 0);
    const avgFirstBuyDays  = firstBuySharesDenominator > 0
      ? Math.round(firstBuyDaysNumerator / firstBuySharesDenominator) : null;
    const realizedCompanies = companyMetricsRaw.filter((c) => c.realizedTrades.length > 0);
    const totalCompanies    = activeCompanies.length > 0
      ? activeCompanies.length
      : portfolio.length > 0 ? portfolio.length : txnCompanyCount;

    return {
      pending, total, totalCompanies, totalMarketValue, investedCapital, grossBuyCapital,
      unrealizedGL, unrealizedRetPct, totalRealizedGL: totalRealizedGLAll,
      totalSaleProceeds: totalSaleProceedsAcc, totalCostBasis: totalCostBasisAcc,
      totalSharesSold: totalSharesSoldAcc, hasRealized, hasFinancials, hasCostData,
      companyMetrics: activeCompanies, realizedCompanies,
      totalNetShares, totalBuyTransactionCount: totalBuyTxnCount, avgFirstBuyDays,
    };
  }, [portfolio, myTxns, groupedVerifiedByCompany]);

  const cdsUsers = useMemo(() => cdsMembers.map((u) => {
    const name = u.full_name || u.email || "?";
    const code = u.role_code || "";
    return {
      ...u,
      _roleName:    ROLE_NAMES[code] || code || "—",
      _initials:    name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2),
      _avatarColor: AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length],
      _isActive:    u.is_active !== false && u.status !== "inactive",
    };
  }), [cdsMembers]);

  const toggleExpand       = useCallback((key) => setExpanded((prev) => (prev === key ? null : key)), []);
  const onToggleRealized   = useCallback(() => toggleExpand("realized"),  [toggleExpand]);
  const onToggleCompanies  = useCallback(() => toggleExpand("companies"), [toggleExpand]);
  const onToggleUsers      = useCallback(() => toggleExpand("users"),     [toggleExpand]);
  const onNavTransactions  = useCallback(() => onNavigate("transactions"),    [onNavigate]);
  const onToggleDividends  = useCallback(() => toggleExpand("dividends"),      [toggleExpand]);
  const onNavDividends     = useCallback(() => onNavigate("dividends"),       [onNavigate]);
  const onNavUserMgmt      = useCallback(() => onNavigate("user-management"), [onNavigate]);
  const onCloseExpand      = useCallback(() => setExpanded(null), []);

  // ── Report generation handler ─────────────────────────────────
  const handleGenerateReport = useCallback(({ reportType, format, dateFrom, dateTo }) => {
    const cdsNumber = profile?.cds_number || "N/A";
    try {
      if (reportType === "portfolio") {
        if (format === "pdf") {
          generatePortfolioStatementPDF({ cdsNumber, portfolio, metrics, dividendSummary });
        } else {
          generatePortfolioExcel({ cdsNumber, portfolio, metrics, dividendSummary });
        }
      } else if (reportType === "transactions") {
        if (format === "pdf") {
          generateTransactionHistoryPDF({ cdsNumber, transactions, dateFrom, dateTo });
        } else {
          generateTransactionExcel({ cdsNumber, transactions, dateFrom, dateTo });
        }
      } else if (reportType === "gainloss") {
        // Build company breakdown from metrics data
        const companyBreakdown = [];
        if (metrics?.companyData) {
          for (const [, cd] of Object.entries(metrics.companyData)) {
            companyBreakdown.push(cd);
          }
        }
        generateGainLossReportPDF({ cdsNumber, metrics, companyBreakdown });
      }
      setShowReportsModal(false);
      showToast?.("Report downloaded!", "success");
    } catch (e) {
      showToast?.("Report generation failed: " + e.message, "error");
    }
  }, [profile?.cds_number, portfolio, metrics, transactions, dividendSummary, showToast]);

  const handleTouchStart = useCallback((e) => {
    if (!isMobile || refreshing || loading) return;
    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; return; }
    touchStartYRef.current = e.touches[0].clientY;
    pullingRef.current     = false;
  }, [getScrollParent, isMobile, loading, refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing || loading) return;
    if (touchStartYRef.current == null) return;
    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) { pullingRef.current = false; setPullDistance(0); return; }
    pullingRef.current = true;
    setPullDistance(Math.min(92, Math.round(Math.pow(deltaY, 0.85))));
  }, [getScrollParent, isMobile, loading, refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || loading) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const shouldRefresh    = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null;
    pullingRef.current     = false;
    if (shouldRefresh) { setPullDistance(56); loadDashboard({ fromPull: true }); }
    else setPullDistance(0);
  }, [isMobile, loading, pullDistance, refreshing, loadDashboard]);

  useEffect(() => {
    if (expanded !== null) { hasExpandedRef.current = true; return; }
    if (!hasExpandedRef.current || !snapRef.current) return;
    let el = snapRef.current.parentElement;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: "smooth" });
        break;
      }
      el = el.parentElement;
    }
  }, [expanded]);

  const todayStr = useMemo(
    () => new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    []
  );

  const renderMobileRealizedPanel = useCallback(() => (
    <div style={{
      background: C.white,
      border: `1.5px solid ${metrics.totalRealizedGL >= 0 ? C.green : C.red}40`,
      borderRadius: 14, marginBottom: 12, overflow: "hidden", animation: "dashFadeDown 0.2s ease",
    }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.gray100}` }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}><Icon name="upload" size={14} /> Realized Gain / Loss</div>
        <button onClick={onCloseExpand} style={{ background: C.gray100, border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><Icon name="x" size={15} stroke={C.gray500} sw={2.2} /></button>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {metrics.realizedCompanies.length === 0 ? <Empty msg="No realized trades." /> : (
            <div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <Th>Company</Th>
                    <Th right>Net Proceeds</Th>
                    <Th right>Gain / Loss</Th>
                    <Th right>Return %</Th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.realizedCompanies.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                      <Td bold>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                          {c.name}
                        </div>
                      </Td>
                      <Td right>{fmt(c.totalSaleProceeds)}</Td>
                      <Td right bold color={c.realizedGL >= 0 ? C.green : C.red}>
                        {(c.realizedGL >= 0 ? "+" : "") + fmtShort(c.realizedGL)}
                      </Td>
                      <Td right>
                        <Badge
                          value={`${(c.totalCostBasis > 0 ? (c.realizedGL / c.totalCostBasis) * 100 : 0).toFixed(2)}%`}
                          positive={c.realizedGL >= 0}
                        />
                      </Td>
                    </tr>
                  ))}
                </tbody>
                {metrics.realizedCompanies.length > 1 && (
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                      <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 12, color: C.text }}>TOTAL</td>
                      <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: 12, color: C.text, textAlign: "right" }}>{fmtShort(metrics.totalSaleProceeds)}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 12, color: metrics.totalRealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                        {(metrics.totalRealizedGL >= 0 ? "+" : "") + fmtShort(metrics.totalRealizedGL)}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>
                        <Badge
                          value={`${(metrics.totalCostBasis > 0 ? (metrics.totalRealizedGL / metrics.totalCostBasis) * 100 : 0).toFixed(2)}%`}
                          positive={metrics.totalRealizedGL >= 0}
                        />
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  ), [metrics, loading, onCloseExpand, C]);

  const renderMobileCompaniesPanel = useCallback(() => (
    <div style={{
      background: C.white, border: "1.5px solid rgba(59,111,196,0.4)",
      borderRadius: 14, marginBottom: 12, overflow: "hidden", animation: "dashFadeDown 0.2s ease",
    }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.gray100}` }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}><Icon name="building" size={14} /> Top 5 Holdings</div>
        <button onClick={onCloseExpand} style={{ background: C.gray100, border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><Icon name="x" size={15} stroke={C.gray500} sw={2.2} /></button>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {metrics.companyMetrics.length === 0 ? <Empty msg="No active positions." /> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Company</Th>
                  <Th right>Shares</Th>
                  <Th right>Market Val.</Th>
                  <Th right>Return %</Th>
                </tr>
              </thead>
              <tbody>
                {metrics.companyMetrics.slice(0, 5).map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                    <Td bold>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        {c.name}
                      </div>
                    </Td>
                    <Td right small>{fmt(c.netShares)}</Td>
                    <Td right bold>{c.marketValue > 0 ? fmtShort(c.marketValue) : "—"}</Td>
                    <Td right>
                      {c.currentPrice > 0 && c.unrealizedRetPct !== 0 ? (
                        <Badge
                          value={`${c.unrealizedRetPct >= 0 ? "+" : ""}${c.unrealizedRetPct.toFixed(2)}%`}
                          positive={c.unrealizedRetPct >= 0}
                        />
                      ) : <span style={{ color: C.gray400, fontSize: 11 }}>—</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
              {metrics.companyMetrics.length > 1 && (
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                    <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 12, color: C.text }}>TOTAL</td>
                    <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: 12, color: C.text, textAlign: "right" }}>{fmt(metrics.totalNetShares)}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 800, fontSize: 12, color: C.text, textAlign: "right" }}>
                      {metrics.hasFinancials ? fmtShort(metrics.totalMarketValue) : "—"}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      {metrics.hasFinancials ? (
                        <Badge
                          value={`${metrics.unrealizedRetPct >= 0 ? "+" : ""}${metrics.unrealizedRetPct.toFixed(2)}%`}
                          positive={metrics.unrealizedRetPct >= 0}
                        />
                      ) : "—"}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      )}
    </div>
  ), [metrics, loading, onCloseExpand, C]);

  const renderMobileUsersPanel = useCallback(() => (
    <div style={{
      background: C.white, border: "1.5px solid #2563eb40",
      borderRadius: 14, marginBottom: 12, overflow: "hidden", animation: "dashFadeDown 0.2s ease",
    }}>
      <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${C.gray100}` }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}><Icon name="users" size={14} /> Members ({cdsUsers.length})</div>
        <button onClick={onCloseExpand} style={{ background: C.gray100, border: "none", borderRadius: "50%", width: 36, height: 36, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}><Icon name="x" size={15} stroke={C.gray500} sw={2.2} /></button>
      </div>
      {loading ? <Spinner /> : (
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {cdsUsers.length === 0 ? <Empty msg="No users found." /> : (
            <div>
              {cdsUsers.map((u, i) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: i < cdsUsers.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", border: `1.5px solid ${C.gray200}` }}>
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.full_name || "User"} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "block"; }} />
                      ) : null}
                      <img src={logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover", display: u.avatar_url ? "none" : "block" }} />
                    </div>
                    <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", border: `2px solid ${C.white}`, background: u._isActive ? C.green : C.gray400 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.full_name || "—"}</div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>{u._roleName}</div>
                  </div>
                  <span style={{ background: u._isActive ? C.greenBg : C.redBg, color: u._isActive ? C.green : C.red, border: `1px solid ${u._isActive ? C.green : C.red}25`, borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                    {u._isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              ))}
              {isSAAD && (
                <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.gray100}` }}>
                  <button onClick={onNavUserMgmt} style={{ width: "100%", padding: "10px", borderRadius: 9, border: "none", background: C.green, color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                    Go to User Management →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  ), [cdsUsers, loading, isSAAD, onCloseExpand, onNavUserMgmt, C]);

  const pullReady = pullDistance >= 64;

  return (
    <div
      ref={rootRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile  ? handleTouchMove  : undefined}
      onTouchEnd={isMobile   ? handleTouchEnd   : undefined}
      onTouchCancel={isMobile ? handleTouchEnd  : undefined}
      style={{
        maxWidth: isMobile ? "none" : 1200,
        margin: isMobile ? 0 : "0 auto",
        position: "relative",
        height: isMobile ? "auto" : "calc(100vh - 118px)",
        display: "flex", flexDirection: "column",
        overflow: isMobile ? "visible" : "hidden",
        paddingBottom: isMobile ? 96 : 0,
      }}
    >
      <style>{`
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes dashFadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .dash-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .dash-scroll::-webkit-scrollbar-track { background: transparent; }
        .dash-scroll::-webkit-scrollbar-thumb { background: ${isDark ? C.gray200 : "#cbd5e1"}; border-radius: 10px; }
        .dash-scroll { scrollbar-width: thin; scrollbar-color: ${isDark ? C.gray200 : "#cbd5e1"} transparent; }
      `}</style>

      {/* Pull to refresh indicator */}
      {isMobile && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
          <div style={{
            position: "absolute", left: "50%", top: 0,
            transform: `translate(-50%, ${Math.max(8, pullDistance - 34)}px)`,
            opacity: refreshing || pullDistance > 6 ? 1 : 0,
            transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease",
            background: C.white,
            border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`,
            borderRadius: 999, padding: "7px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
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

      {/* Transform wrapper (pull-to-refresh) */}
      <div className={isMobile ? undefined : "dash-scroll"} style={{
        transform: isMobile ? `translateY(${pullDistance}px)` : "none",
        transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"),
        willChange: isMobile ? "transform" : "auto",
        flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
        overflow: isMobile ? "visible" : "auto",
      }}>

        {/* ═══════════════════ MOBILE VIEW ════════════════════════ */}
        {isMobile && (
          <div>
            {/* Hero card */}
            <div style={{
              background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`,
              borderRadius: 16, padding: "18px 18px 20px", marginBottom: 10,
              position: "relative", overflow: "hidden",
            }}>
              <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "20px 20px", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18, position: "relative", zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Shares Held</div>
                  <div style={{ fontSize: 16, color: "rgba(255,255,255,0.8)", fontWeight: 800 }}>{loading ? "—" : fmt(metrics.totalNetShares)}</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.22)", borderRadius: 9, padding: "6px 12px", border: "1px solid rgba(255,255,255,0.45)", textAlign: "right" }}>
                  <div style={{ fontSize: 10, color: "#ffffff", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Today</div>
                  <div style={{ fontSize: 13, color: "#ffffff", fontWeight: 750, whiteSpace: "nowrap" }}>{todayStr}</div>
                </div>
              </div>

              <div style={{ position: "relative", zIndex: 1, marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>Portfolio Value</div>
                {(() => {
                  let displayValue = "—";
                  if (!loading) {
                    if (metrics.hasFinancials)    displayValue = `TZS ${fmt(metrics.totalMarketValue)}`;
                    else if (metrics.hasCostData) displayValue = `TZS ${fmt(metrics.investedCapital)}`;
                  }
                  const charCount = displayValue.length;
                  let fontSize = "44px";
                  if (charCount > 20)      fontSize = "26px";
                  else if (charCount > 16) fontSize = "30px";
                  else if (charCount > 12) fontSize = "36px";
                  return (
                    <div style={{ fontSize, fontWeight: 800, color: C.gold, lineHeight: 1.2, letterSpacing: "-0.01em", textAlign: "center", width: "100%", whiteSpace: "nowrap", overflow: "visible" }}>
                      {loading ? <span style={{ fontSize: 18, color: "rgba(255,255,255,0.2)" }}>—</span> : displayValue}
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 0, position: "relative", zIndex: 1 }}>
                {[
                  { label: "Invested", value: metrics.hasCostData ? `TZS ${fmtShort(metrics.investedCapital)}` : "—", color: "rgba(255,255,255,0.85)" },
                  {
                    label: "Return",
                    value: metrics.hasFinancials ? `${metrics.unrealizedRetPct >= 0 ? "+" : ""}${metrics.unrealizedRetPct.toFixed(2)}%` : "—",
                    color: metrics.hasFinancials ? (metrics.unrealizedRetPct >= 0 ? C.greenLight : C.red) : "rgba(255,255,255,0.85)",
                  },
                  { label: "Holdings", value: loading ? "—" : String(metrics.totalCompanies), color: "rgba(255,255,255,0.85)" },
                ].map((item, i) => (
                  <div key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Unrealized / Realized GL row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <MobileMetricCard
                label="Unrealized GL"
                value={loading ? "—" : metrics.hasFinancials ? `${metrics.unrealizedGL >= 0 ? "+" : ""}${fmtShort(metrics.unrealizedGL)}` : "—"}
                sub={metrics.hasFinancials ? `${metrics.unrealizedRetPct >= 0 ? "+" : ""}${metrics.unrealizedRetPct.toFixed(2)}% return` : "Set portfolio prices"}
                accent={metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? C.green : C.red) : undefined}
              />
              <MobileMetricCard
                label="Realized GL"
                value={loading ? "—" : metrics.hasRealized ? `${metrics.totalRealizedGL >= 0 ? "+" : ""}${fmtShort(metrics.totalRealizedGL)}` : "—"}
                sub={metrics.hasRealized ? `${fmt(metrics.totalSharesSold)} shares sold` : "No closed positions"}
                accent={metrics.hasRealized ? (metrics.totalRealizedGL >= 0 ? C.green : C.red) : undefined}
                onClick={metrics.hasRealized ? onToggleRealized : undefined}
                chevron={metrics.hasRealized ? (expanded === "realized" ? "open" : "closed") : undefined}
              />
            </div>

            {expanded === "realized" && renderMobileRealizedPanel()}

            {/* Holdings / Users / Pending pills */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              <MobileStatPill icon={<Icon name="building" size={20} stroke="#3b6fc4" sw={2.2} />} label="Holdings" value={loading ? "—" : metrics.totalCompanies}
                onClick={onToggleCompanies} active={expanded === "companies"} accent="#3b6fc4" />
              <MobileStatPill icon={<Icon name="users" size={20} stroke="#2563eb" sw={2.2} />} label="Users" value={loading ? "—" : (cds ? cdsUsers.length : (userCount ?? "—"))}
                onClick={onToggleUsers} active={expanded === "users"} accent="#2563eb" />
              <MobileStatPill icon={<Icon name="alertTriangle" size={20} stroke="#f59e0b" sw={2.2} />} label="Pending" value={loading ? "—" : metrics.pending}
                onClick={onNavTransactions} accent="#f59e0b" navigates />
            </div>

            {expanded === "companies" && renderMobileCompaniesPanel()}
            {expanded === "users"     && renderMobileUsersPanel()}
          </div>
        )}

        {/* ═══════════════════ DESKTOP VIEW ═══════════════════════ */}
        {!isMobile && (
          <>
            {/* Top snap cards */}
            <div
              ref={snapRef}
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr",
                gap: 14,
                marginBottom: (expanded === "realized" || expanded === "companies" || expanded === "users" || expanded === "dividends") ? 14 : 20,
              }}
            >
              <SnapCard
                label="Market Value" loading={loading}
                value={
                  metrics.hasFinancials  ? fmtShort(metrics.totalMarketValue)
                  : metrics.hasCostData  ? fmtShort(metrics.investedCapital)
                  : metrics.total > 0    ? `${metrics.total} txns` : "—"
                }
                sub={
                  metrics.hasFinancials  ? "Current market value (TZS)"
                  : metrics.hasCostData  ? "Cost basis — set prices for market value"
                  : "No verified transactions yet"
                }
              />
              <SnapCard
                label="Invested Capital" loading={loading}
                value={metrics.hasCostData ? fmtShort(metrics.investedCapital) : "—"}
                sub={metrics.hasCostData   ? `${fmt(metrics.totalNetShares)} shares held` : "No verified buy transactions"}
              />
              <SnapCard
                label="Unrealized Gain / Loss" loading={loading}
                value={metrics.hasFinancials ? `${metrics.unrealizedGL >= 0 ? "+" : ""}${fmtShort(metrics.unrealizedGL)}` : "—"}
                sub={metrics.hasFinancials   ? (metrics.avgFirstBuyDays ? `avg ${metrics.avgFirstBuyDays}d` : "open positions") : "Set prices in Portfolio to compute"}
                accent={metrics.hasFinancials   ? (metrics.unrealizedGL >= 0    ? C.green : C.red) : C.gray200}
                accentBg={metrics.hasFinancials ? (metrics.unrealizedGL >= 0    ? C.green : C.red) : undefined}
              />
              <SnapCard
                label="Unrealized Return %" loading={loading}
                value={metrics.hasFinancials ? `${metrics.unrealizedRetPct >= 0 ? "+" : ""}${metrics.unrealizedRetPct.toFixed(2)}%` : "—"}
                sub={metrics.hasFinancials   ? "Return on open positions" : "Set prices in Portfolio"}
                accent={metrics.hasFinancials   ? (metrics.unrealizedRetPct >= 0 ? C.green : C.red) : C.gray200}
                accentBg={metrics.hasFinancials ? (metrics.unrealizedRetPct >= 0 ? C.green : C.red) : undefined}
              />
              <SnapCard
                label="Realized Gain / Loss" loading={loading}
                value={metrics.hasRealized ? `${metrics.totalRealizedGL >= 0 ? "+" : ""}${fmtShort(metrics.totalRealizedGL)}` : "—"}
                sub={metrics.hasRealized   ? `${fmt(metrics.totalSharesSold)} shares sold` : "No closed positions yet"}
                accent={metrics.hasRealized   ? (metrics.totalRealizedGL >= 0 ? C.green : C.red) : C.gray200}
                accentBg={metrics.hasRealized ? (metrics.totalRealizedGL >= 0 ? C.green : C.red) : undefined}
                expandable={metrics.hasRealized} expanded={expanded === "realized"}
                onToggle={onToggleRealized} hoverable
              />
            </div>

            {/* Performance Chart */}
            {snapshots.length >= 2 && (
              <PerformanceChart snapshots={snapshots} range={chartRange} onRangeChange={setChartRange} C={C} isDark={isDark} />
            )}

            {/* Realized GL expand panel */}
            {expanded === "realized" && (
              <ExpandPanel
                title={<><Icon name="upload" size={14} /> Realized Gain / Loss — Closed Positions</>}
                accentColor={metrics.totalRealizedGL >= 0 ? C.green : C.red}
                onClose={onCloseExpand}
              >
                {loading ? <Spinner /> : metrics.realizedCompanies.length === 0 ? <Empty msg="No realized trades found." /> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr>
                          <Th>Company</Th>
                          <Th right>Shares Sold</Th>
                          <Th right>Cost of Shares Sold</Th>
                          <Th right>Net Proceeds</Th>
                          <Th right>Realized Gain / Loss</Th>
                          <Th right>Realized Return %</Th>
                          <Th right>Days Held</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.realizedCompanies.map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                            <Td bold>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                                {c.name}
                              </div>
                            </Td>
                            <Td right>{fmt(c.totalSharesSold)}</Td>
                            <Td right>{fmt(c.totalCostBasis)}</Td>
                            <Td right>{fmt(c.totalSaleProceeds)}</Td>
                            <Td right bold color={c.realizedGL >= 0 ? C.green : C.red}>
                              {(c.realizedGL >= 0 ? "+" : "") + fmt(c.realizedGL)}
                            </Td>
                            <Td right>
                              <Badge
                                value={`${(c.totalCostBasis > 0 ? (c.realizedGL / c.totalCostBasis) * 100 : 0).toFixed(2)}%`}
                                positive={c.realizedGL >= 0}
                              />
                            </Td>
                            <Td right color={C.gray500} small>
                              {c.realizedTrades.every((r) => r.daysHeld !== null)
                                ? `${Math.round(c.realizedTrades.reduce((s, r) => s + (r.daysHeld || 0), 0) / c.realizedTrades.length)}d avg`
                                : "—"}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      {metrics.realizedCompanies.length > 1 && (
                        <tfoot>
                          <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                            <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalSharesSold)}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalCostBasis)}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalSaleProceeds)}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalRealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                              {(metrics.totalRealizedGL >= 0 ? "+" : "") + fmt(metrics.totalRealizedGL)}
                            </td>
                            <td style={{ padding: "9px 12px", textAlign: "right" }}>
                              <Badge
                                value={`${(metrics.totalCostBasis > 0 ? (metrics.totalRealizedGL / metrics.totalCostBasis) * 100 : 0).toFixed(2)}%`}
                                positive={metrics.totalRealizedGL >= 0}
                              />
                            </td>
                            <td style={{ padding: "9px 12px", fontSize: 11, color: C.gray400, textAlign: "right" }}>—</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </ExpandPanel>
            )}

            {/* Lower stat cards */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14,
              marginBottom: (expanded === "companies" || expanded === "users" || expanded === "dividends") ? 0 : 22,
            }}>
              <StatCard icon={<Icon name="building" size={19} stroke="#3b6fc4" sw={2.2} />} label="Companies"
                value={loading ? "—" : metrics.totalCompanies}
                subLabel={`${metrics.totalBuyTransactionCount} buy transactions`}
                accent="#3b6fc4" accentBg="#3b6fc4"
                onClick={onToggleCompanies} active={expanded === "companies"} loading={loading}
              />
              <StatCard icon={<Icon name="dollarSign" size={19} stroke="#7c3aed" sw={2.2} />} label="Dividend Income"
                value={loading ? "—" : `TZS ${Number(dividendSummary?.ytd_net || 0).toLocaleString()}`}
                subLabel={dividendSummary ? `${dividendSummary.dividend_count || 0} from ${dividendSummary.company_count || 0} co.` : "YTD net"}
                accent="#7c3aed" accentBg="#7c3aed"
                onClick={onToggleDividends} active={expanded === "dividends"} loading={loading}
              />
              <StatCard icon={<Icon name="users" size={19} stroke="#2563eb" sw={2.2} />} label="Total Users"
                value={loading ? "—" : (cds ? cdsUsers.length : (userCount ?? "—"))}
                subLabel={cds ? `active on ${cds}` : `${allUsers.length} total`}
                accent="#2563eb" accentBg="#2563eb"
                onClick={onToggleUsers} active={expanded === "users"} loading={loading}
              />
              <StatCard icon={<Icon name="alertTriangle" size={19} stroke="#f59e0b" sw={2.2} />} label="Awaiting Action"
                value={loading ? "—" : metrics.pending}
                subLabel={metrics.pending > 0 ? "pending or confirmed" : "all verified"}
                accent="#f59e0b" accentBg="#f59e0b"
                onClick={onNavTransactions} navigates loading={loading}
              />
            </div>

            {/* Companies expand panel */}
            {expanded === "companies" && (
              <ExpandPanel title={<><Icon name="building" size={14} /> Companies</>} accentColor="#3b6fc4" onClose={onCloseExpand}>
                {loading ? <Spinner /> : metrics.companyMetrics.length === 0 ? <Empty msg="No active positions found." /> : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <colgroup>
                        <col style={{ width: "20%" }} /><col style={{ width: "10%" }} />
                        <col style={{ width: "13%" }} /><col style={{ width: "12%" }} />
                        <col style={{ width: "13%" }} /><col style={{ width: "14%" }} />
                        <col style={{ width: "8%"  }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <Th>Company</Th>
                          <Th right>Shares Held</Th>
                          <Th right>Current Invested Capital</Th>
                          <Th right>Cost Allocation %</Th>
                          <Th right>Market Value</Th>
                          <Th right>Unrealized Gain / Loss</Th>
                          <Th right>Status</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {metrics.companyMetrics.slice(0, 5).map((c, i) => (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                            <Td bold>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                                {c.name}
                              </div>
                            </Td>
                            <Td right>{fmt(c.netShares)}</Td>
                            <Td right>{c.openPositionCost > 0 ? fmt(c.openPositionCost) : "—"}</Td>
                            <Td right>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                <div style={{ width: 44, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                                  <div style={{ width: `${Math.min(c.costWeight || 0, 100)}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                                </div>
                                <span style={{ fontSize: 11, color: C.gray500 }}>{(c.costWeight || 0).toFixed(1)}%</span>
                              </div>
                            </Td>
                            <Td right bold>{c.marketValue > 0 ? fmt(c.marketValue) : "—"}</Td>
                            <Td right bold color={c.unrealizedGL >= 0 ? C.green : C.red}>
                              {c.currentPrice > 0 ? `${c.unrealizedGL >= 0 ? "+" : ""}${fmt(c.unrealizedGL)}` : "—"}
                            </Td>
                            <Td right>
                              <span style={{ background: C.greenBg, color: C.green, border: `1px solid ${C.green}25`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                                Active
                              </span>
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                      {metrics.companyMetrics.length > 1 && (
                        <tfoot>
                          <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                            <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalNetShares)}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.investedCapital)}</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.gray400, textAlign: "right" }}>100%</td>
                            <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>
                              {metrics.hasFinancials ? fmt(metrics.totalMarketValue) : "—"}
                            </td>
                            <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.unrealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                              {metrics.hasFinancials ? `${metrics.unrealizedGL >= 0 ? "+" : ""}${fmt(metrics.unrealizedGL)}` : "—"}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </ExpandPanel>
            )}

            {/* Users expand panel */}
            {expanded === "users" && (
              <ExpandPanel title={<><Icon name="users" size={14} /> {cds ? `CDS ${cds}` : "All"} — Members ({cdsUsers.length})</>} accentColor="#2563eb" onClose={onCloseExpand}>
                {loading ? <Spinner /> : cdsUsers.length === 0 ? <Empty msg="No users found for this CDS account." /> : (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <Th>User Name</Th>
                            <Th>Role</Th>
                            <Th>Phone Number</Th>
                            <Th>Email</Th>
                            <Th>Status</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {cdsUsers.map((u, i) => (
                            <tr key={u.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                              <Td bold>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                                  <div style={{ position: "relative", flexShrink: 0, width: 30, height: 30 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", border: `1.5px solid ${C.gray200}` }}>
                                      {u.avatar_url ? (
                                        <img
                                          src={u.avatar_url} alt={u.full_name || "User"}
                                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                          onError={(e) => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "block"; }}
                                        />
                                      ) : null}
                                      <img src={logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover", display: u.avatar_url ? "none" : "block" }} />
                                    </div>
                                    <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", border: `2px solid ${C.white}`, background: u._isActive ? C.green : C.gray400 }} />
                                  </div>
                                  {u.full_name || "—"}
                                </div>
                              </Td>
                              <Td>
                                <span style={{ background: "#2563eb18", color: "#2563eb", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                                  {u._roleName}
                                </span>
                              </Td>
                              <Td color={C.gray500}>{u.phone || "—"}</Td>
                              <Td color={C.gray500}>{u.email || "—"}</Td>
                              <Td>
                                <span style={{ background: u._isActive ? C.greenBg : C.redBg, color: u._isActive ? C.green : C.red, border: `1px solid ${u._isActive ? C.green : C.red}25`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                                  {u._isActive ? "Active" : "Inactive"}
                                </span>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {isSAAD && (
                      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                        <button
                          onClick={onNavUserMgmt}
                          style={{ background: "none", border: `1.5px solid #2563eb`, color: "#2563eb", borderRadius: 9, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.color = "#ffffff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#2563eb"; }}
                        >
                          Go to User Management →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </ExpandPanel>
            )}

            {/* Dividends expand panel */}
            {expanded === "dividends" && (
              <ExpandPanel title={<><Icon name="dollarSign" size={14} /> Top 5 Dividends by Company</>} accentColor="#7c3aed" onClose={onCloseExpand}>
                {loading ? <Spinner /> : dividendByCompany.length === 0 ? <Empty msg="No dividends recorded yet." /> : (
                  <>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <colgroup>
                          <col style={{ width: "22%" }} /><col style={{ width: "10%" }} />
                          <col style={{ width: "15%" }} /><col style={{ width: "15%" }} />
                          <col style={{ width: "15%" }} /><col style={{ width: "10%" }} />
                          <col style={{ width: "13%" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <Th>Company</Th>
                            <Th right>Dividends</Th>
                            <Th right>Gross Amount</Th>
                            <Th right>Tax Withheld</Th>
                            <Th right>Net Income</Th>
                            <Th right>Avg DPS</Th>
                            <Th right>Last Payment</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {dividendByCompany.map((d, i) => (
                            <tr key={d.company_id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                              <Td bold>{d.company_name}</Td>
                              <Td right>{d.dividend_count}</Td>
                              <Td right>{fmt(d.total_gross)}</Td>
                              <Td right color={Number(d.total_tax) > 0 ? C.red : C.gray400}>{Number(d.total_tax) > 0 ? fmt(d.total_tax) : "—"}</Td>
                              <Td right bold color={C.green}>{fmt(d.total_net)}</Td>
                              <Td right>{fmt(d.avg_dps)}</Td>
                              <Td right color={C.gray500} small>{d.last_payment_date ? new Date(d.last_payment_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</Td>
                            </tr>
                          ))}
                        </tbody>
                        {dividendByCompany.length > 1 && (
                          <tfoot>
                            <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                              <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                              <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{dividendByCompany.reduce((s, d) => s + Number(d.dividend_count), 0)}</td>
                              <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(dividendByCompany.reduce((s, d) => s + Number(d.total_gross), 0))}</td>
                              <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.red, textAlign: "right" }}>{fmt(dividendByCompany.reduce((s, d) => s + Number(d.total_tax), 0))}</td>
                              <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.green, textAlign: "right" }}>{fmt(dividendByCompany.reduce((s, d) => s + Number(d.total_net), 0))}</td>
                              <td style={{ padding: "9px 12px", color: C.gray400, textAlign: "right" }}>—</td>
                              <td style={{ padding: "9px 12px", color: C.gray400, textAlign: "right" }}>—</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                    <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                      <button
                        onClick={onNavDividends}
                        style={{ background: "none", border: "1.5px solid #7c3aed", color: "#7c3aed", borderRadius: 9, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#7c3aed"; e.currentTarget.style.color = "#ffffff"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "#7c3aed"; }}
                      >
                        Go to Dividends →
                      </button>
                    </div>
                  </>
                )}
              </ExpandPanel>
            )}

            {/* Top 5 Holdings table */}
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.gray100}`, background: C.gray50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: C.text, display: "flex", alignItems: "center", gap: 8 }}><IconBadge name="clipboard" color={C.green} size={28} radius={7} isDark={isDark} /> Top 5 Holdings by Market Value</div>
                <div style={{ fontSize: 11, color: C.gray400 }}>
                  {metrics.hasFinancials
                    ? `top ${Math.min(metrics.companyMetrics.length, 5)} of ${metrics.companyMetrics.length} · market value ${fmtShort(metrics.totalMarketValue)}`
                    : "Set prices in Portfolio to compute market values"}
                </div>
              </div>
              {loading ? <Spinner /> : metrics.companyMetrics.length === 0 ? (
                <Empty msg="No holdings found. Add transactions in the Portfolio page." />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <colgroup>
                      <col style={{ width: "16%" }} /><col style={{ width: "8%"  }} />
                      <col style={{ width: "10%" }} /><col style={{ width: "9%"  }} />
                      <col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
                      <col style={{ width: "10%" }} /><col style={{ width: "7%"  }} />
                      <col style={{ width: "10%" }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <Th>Company</Th>
                        <Th right>Shares Held</Th>
                        <Th right>Invested Capital</Th>
                        <Th right>Current Price</Th>
                        <Th right>Market Value</Th>
                        <Th right>Unrealized Gain / Loss</Th>
                        <Th right>Unrealized Return %</Th>
                        <Th right>Days Held</Th>
                        <Th right>Portfolio Weight %</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.companyMetrics.slice(0, 5).map((c, i) => (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? `${C.gray50}60` : "transparent" }}>
                          <Td bold>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                              {c.name}
                              {c.hasAnomaly && (
                                <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: C.redBg, color: C.red, border: `1px solid ${C.red}25`, borderRadius: 6, padding: "1px 5px", whiteSpace: "nowrap" }}>
                                  ⚠ oversold
                                </span>
                              )}
                            </div>
                          </Td>
                          <Td right>{fmt(c.netShares)}</Td>
                          <Td right>{c.openPositionCost > 0 ? fmt(c.openPositionCost) : "—"}</Td>
                          <Td right bold color={c.currentPrice > 0 ? C.green : C.gray400}>{c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}</Td>
                          <Td right bold>{c.marketValue > 0 ? fmt(c.marketValue) : "—"}</Td>
                          <Td right bold color={c.unrealizedGL >= 0 ? C.green : C.red}>
                            {c.currentPrice > 0 && c.unrealizedGL !== 0 ? `${c.unrealizedGL >= 0 ? "+" : ""}${fmt(c.unrealizedGL)}` : "—"}
                          </Td>
                          <Td right>
                            {c.currentPrice > 0 && c.unrealizedRetPct !== 0 ? (
                              <Badge value={`${c.unrealizedRetPct >= 0 ? "+" : ""}${c.unrealizedRetPct.toFixed(2)}%`} positive={c.unrealizedRetPct >= 0} />
                            ) : "—"}
                          </Td>
                          <Td right color={C.gray500} small>{c.firstBuyDays !== null ? `${c.firstBuyDays}d` : "—"}</Td>
                          <Td right>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                              <div style={{ width: 50, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                                <div style={{ width: `${Math.min(c.weight, 100)}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                              </div>
                              <span style={{ fontSize: 11, color: C.gray500 }}>{c.weight.toFixed(1)}%</span>
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                    {metrics.companyMetrics.length > 1 && (
                      <tfoot>
                        <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                          <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>
                            TOTAL
                            {metrics.companyMetrics.length > 5 && (
                              <div style={{ fontSize: 10, fontWeight: 400, color: C.gray400, marginTop: 2 }}>all {metrics.companyMetrics.length} companies</div>
                            )}
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalNetShares)}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.investedCapital)}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.gray400, textAlign: "right" }}>—</td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalMarketValue)}</td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.unrealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                            {metrics.hasFinancials ? `${metrics.unrealizedGL >= 0 ? "+" : ""}${fmt(metrics.unrealizedGL)}` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", textAlign: "right" }}>
                            <Badge
                              value={`${metrics.unrealizedRetPct >= 0 ? "+" : ""}${metrics.unrealizedRetPct.toFixed(2)}%`}
                              positive={metrics.unrealizedRetPct >= 0}
                            />
                          </td>
                          <td style={{ padding: "9px 12px", fontSize: 11, color: C.gray400, textAlign: "right" }}>
                            {metrics.avgFirstBuyDays !== null ? `avg ${metrics.avgFirstBuyDays}d` : "—"}
                          </td>
                          <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.gray400, textAlign: "right" }}>100%</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>

          </>
        )}
      </div>

      {/* Reports Modal */}
      {showReportsModal && (
        <ReportsModal onGenerate={handleGenerateReport} onClose={() => setShowReportsModal(false)} />
      )}
    </div>
  );
}
