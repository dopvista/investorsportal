// ── src/pages/DashboardPage.jsx ────────────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { C } from "../components/ui";
import { sbGetPortfolio, sbGetTransactions, sbGetAllUsers, sbGetCDSAssignedUsers } from "../lib/supabase";

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
  "#3b82f6", C.green, "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];
const AVATAR_COLORS = [
  "#0B1F3A","#2563eb","#065F46","#7C3AED",
  "#B45309","#0369A1","#1D4ED8","#9D174D",
];
const ROLE_NAMES = {
  SA: "Super Admin", AD: "Admin", DE: "Data Entrant",
  VR: "Verifier",   RO: "Read Only",
};

// ── Status helpers ─────────────────────────────────────────────────
const statusOf         = (t) => String(t?.status || "").toLowerCase().trim();
const isVerified       = (t) => statusOf(t) === "verified";
// pending = only truly pending status (not confirmed/rejected/verified)
const isPendingStatus  = (t) => statusOf(t) === "pending";
const txTime           = (t) => new Date(t?.date || t?.created_at || 0).getTime() || 0;

// ── Shared table primitives — memoized so tables don't re-render ───
const Th = memo(function Th({ children, right }) {
  return (
    <th style={{
      padding: "8px 12px", textAlign: right ? "right" : "left",
      fontWeight: 700, fontSize: 10, color: C.gray400,
      textTransform: "uppercase", letterSpacing: "0.05em",
      borderBottom: `1px solid ${C.gray200}`, background: C.gray50,
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
});

const Td = memo(function Td({ children, bold, color, small, right }) {
  return (
    <td style={{
      padding: "9px 12px", fontWeight: bold ? 700 : 400,
      color: color || C.text, fontSize: small ? 11 : 13,
      textAlign: right ? "right" : "left",
      whiteSpace: right ? "nowrap" : undefined,
    }}>
      {children}
    </td>
  );
});

const Badge = memo(function Badge({ value, positive }) {
  const isPos = positive ?? Number(value) >= 0;
  return (
    <span style={{
      background: isPos ? "#f0fdf4" : "#fef2f2",
      color: isPos ? C.green : C.red,
      border: `1px solid ${isPos ? C.green : C.red}20`,
      borderRadius: 8, padding: "2px 8px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {value}
    </span>
  );
});

// ── SnapCard ───────────────────────────────────────────────────────
const SnapCard = memo(function SnapCard({
  label, value, sub, dark, accent, accentBg,
  expandable, expanded, onToggle, loading, children, hoverable,
}) {
  const isColored  = expanded && accentBg && !dark;
  const labelClr   = dark ? "rgba(255,255,255,0.4)"  : isColored ? "rgba(255,255,255,0.6)"  : C.gray400;
  const valueClr   = dark ? C.white                   : isColored ? C.white                  : C.text;
  const subClr     = dark ? "rgba(255,255,255,0.3)"   : isColored ? "rgba(255,255,255,0.55)" : C.gray400;
  const chevClr    = isColored ? "rgba(255,255,255,0.9)"
                   : expanded  ? (accent || C.green)
                   : dark      ? "rgba(255,255,255,0.55)" : C.gray500;
  const eff = accent || C.green;

  return (
    <div
      style={{
        background: dark ? "linear-gradient(135deg, #0B1F3A 0%, #1e3a5f 100%)" : C.white,
        border: `1.5px solid ${expanded ? eff : (dark ? "#1e3a5f" : C.gray200)}`,
        borderRadius: 14, overflow: "hidden",
        boxShadow: expanded ? `0 4px 20px ${eff}33` : "0 1px 4px rgba(0,0,0,0.04)",
        transition: "all 0.18s ease",
        cursor: expandable ? "pointer" : "default",
      }}
      onMouseEnter={e => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor  = eff;
        e.currentTarget.style.boxShadow    = `0 4px 20px ${eff}33`;
        e.currentTarget.style.transform    = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        if (!hoverable) return;
        e.currentTarget.style.borderColor  = expanded ? eff : (dark ? "#1e3a5f" : C.gray200);
        e.currentTarget.style.boxShadow    = expanded ? `0 4px 20px ${eff}33` : "0 1px 4px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform    = "none";
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
        onMouseEnter={e => { if (!expandable || isColored) return; e.currentTarget.style.background = dark ? "rgba(255,255,255,0.04)" : C.gray50 + "80"; }}
        onMouseLeave={e => { if (isColored) return; e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: labelClr, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {label}
          </div>
          {expandable && (
            <span style={{ fontSize: 12, color: chevClr, display: "inline-block", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontWeight: expanded ? 700 : 400 }}>▾</span>
          )}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: valueClr, lineHeight: 1, marginBottom: 5, transition: "color 0.2s" }}>
          {loading ? <span style={{ fontSize: 14, color: dark ? "rgba(255,255,255,0.2)" : isColored ? "rgba(255,255,255,0.3)" : C.gray300 }}>—</span> : value}
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
  const isColored = active && accentBg;
  const hdrText   = isColored ? C.white                  : C.text;
  const hdrSub    = isColored ? "rgba(255,255,255,0.65)" : C.gray500;
  const hdrHint   = isColored ? "rgba(255,255,255,0.45)" : C.gray400;

  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1.5px solid ${active ? accent : C.gray200}`,
        borderRadius: 14, overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.18s ease",
        boxShadow: active ? `0 4px 20px ${accent}33` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => { if (!onClick) return; e.currentTarget.style.borderColor = accent; e.currentTarget.style.boxShadow = `0 4px 20px ${accent}33`; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { if (!onClick) return; e.currentTarget.style.borderColor = active ? accent : C.gray200; e.currentTarget.style.boxShadow = active ? `0 4px 20px ${accent}33` : "0 1px 4px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none"; }}
    >
      <div style={{
        padding: "16px 18px 14px",
        background: isColored ? `linear-gradient(135deg, ${accentBg}ee, ${accentBg}bb)` : "transparent",
        transition: "background 0.2s",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: isColored ? "rgba(255,255,255,0.18)" : accent + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, transition: "background 0.2s" }}>
            {icon}
          </div>
          {navigates  && <span style={{ fontSize: 13, color: isColored ? "rgba(255,255,255,0.6)" : C.gray400, marginTop: 2 }}>→</span>}
          {!navigates && onClick && <span style={{ fontSize: 12, color: isColored ? "rgba(255,255,255,0.9)" : (active ? accent : C.gray500), marginTop: 2, display: "inline-block", transform: active ? "rotate(180deg)" : "none", transition: "transform 0.2s", fontWeight: active ? 700 : 400 }}>▾</span>}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: hdrText, lineHeight: 1, transition: "color 0.2s" }}>
          {loading ? <span style={{ fontSize: 14, color: isColored ? "rgba(255,255,255,0.3)" : C.gray300 }}>—</span> : value}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: hdrSub, marginTop: 5, transition: "color 0.2s" }}>{label}</div>
        {subLabel && <div style={{ fontSize: 11, color: hdrHint, marginTop: 2, transition: "color 0.2s" }}>{subLabel}</div>}
      </div>
    </div>
  );
});

// ── ExpandPanel ────────────────────────────────────────────────────
const ExpandPanel = memo(function ExpandPanel({ title, onClose, accentColor, children }) {
  return (
    <div style={{
      background: C.white,
      border: `1.5px solid ${accentColor || C.gray200}`,
      borderRadius: 14, padding: "20px 24px", marginBottom: 20,
      animation: "dashFadeDown 0.2s ease",
      boxShadow: accentColor ? `0 4px 20px ${accentColor}18` : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
        <button onClick={onClose} style={{ background: accentColor ? accentColor + "18" : C.gray100, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 13, color: accentColor || C.gray500, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      {children}
    </div>
  );
});

// ── Spinner / Empty ────────────────────────────────────────────────
const Spinner = memo(function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 0" }}>
      <div style={{ width: 22, height: 22, border: `3px solid ${C.gray100}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
});

const Empty = memo(function Empty({ msg }) {
  return <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "24px 0" }}>{msg}</div>;
});

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function DashboardPage({ profile, role, showToast, onNavigate, activeCds }) {
  const [portfolio,     setPortfolio]     = useState([]);
  const [transactions,  setTransactions]  = useState([]);
  const [userCount,     setUserCount]     = useState(null);
  const [allUsers,      setAllUsers]      = useState([]);
  const [cdsMembers,    setCdsMembers]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState(null); // "companies" | "realized" | "users" | null

  const isSAAD   = ["SA", "AD"].includes(role);
  const snapRef  = useRef(null);
  const hasExpandedRef = useRef(false);

  const cds     = profile?.cds_number || null;
  const myTxns  = useMemo(
    () => (cds ? transactions.filter(t => t.cds_number === cds) : transactions),
    [transactions, cds]
  );

  // ── Data load ────────────────────────────────────────────────────
  // showToast is intentionally omitted from deps — it is stable (wrapped in
  // useCallback in App.jsx) and including it would cause spurious re-fetches.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const activeCdsId = activeCds?.cds_id;
        const [port, txns, users, members] = await Promise.all([
          sbGetPortfolio(profile?.cds_number).catch(() => []),
          sbGetTransactions().catch(() => []),
          activeCdsId ? Promise.resolve([]) : sbGetAllUsers().catch(() => []),
          activeCdsId ? sbGetCDSAssignedUsers(activeCdsId).catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setPortfolio(port   || []);
        setTransactions(txns || []);
        if (users?.length) { setUserCount(users.length); setAllUsers(users); }
        setCdsMembers(
          members?.length
            ? members.map(m => ({
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
        if (!cancelled) showToast?.("Dashboard load error", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [profile?.cds_number, activeCds?.cds_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pre-group verified transactions by company (single pass) ────
  // Also counts truly-pending (status === "pending") transactions.
  const groupedVerifiedByCompany = useMemo(() => {
    const map = new Map();
    let grossBuyCapital = 0;
    let pending = 0;

    for (const t of myTxns) {
      // Count only status==="pending" as pending (not confirmed/rejected/verified)
      if (isPendingStatus(t)) pending++;

      if (!isVerified(t)) continue;

      const { company_id } = t;
      if (company_id) {
        if (!map.has(company_id)) map.set(company_id, []);
        map.get(company_id).push(t);
      }
      if (t.type === "Buy") grossBuyCapital += Number(t.total || 0) + Number(t.fees || 0);
    }

    // Sort each company's transactions chronologically once
    for (const arr of map.values()) arr.sort((a, b) => txTime(a) - txTime(b));

    return { map, grossBuyCapital, pending };
  }, [myTxns]);

  // ── Core metrics — single heavy useMemo ─────────────────────────
  const metrics = useMemo(() => {
    const total              = myTxns.length;
    const pending            = groupedVerifiedByCompany.pending;
    const grossBuyCapital    = groupedVerifiedByCompany.grossBuyCapital;
    const hasCostData        = grossBuyCapital > 0;
    const txnCompanyCount    = new Set(myTxns.map(t => t.company_id).filter(Boolean)).size;

    let totalMarketValue  = 0;
    let totalCurrentCost  = 0;
    let totalRealizedGLAll = 0;
    // PERF: accumulate these in the main loop — no second reduce pass needed
    let totalSaleProceedsAcc = 0;
    let totalCostBasisAcc    = 0;
    let totalSharesSoldAcc   = 0;
    let totalBuyTxnCount     = 0;
    // For weighted-average firstBuyDays: accumulate numerator & denominator
    let firstBuyDaysNumerator   = 0;
    let firstBuySharesDenominator = 0;

    const companyMetricsRaw = portfolio.map((company, idx) => {
      const color        = CHART_COLORS[idx % CHART_COLORS.length];
      const verifiedTxns = groupedVerifiedByCompany.map.get(company.id) || [];

      let sharesHeld    = 0;
      let costHeld      = 0;
      let runningAvg    = 0;
      let realizedGL    = 0;
      let totalSaleProceeds = 0;
      let totalCostBasis    = 0;
      let totalSharesSold   = 0;
      let buyTxnCount   = 0;
      let firstBuyDate  = null;
      const realizedTrades = [];

      for (const t of verifiedTxns) {
        const qty  = Number(t.qty   || 0);
        const fees = Number(t.fees  || 0);

        if (t.type === "Buy") {
          // Buy cost = gross trade value + fees (all-in cost)
          const cost = Number(t.total || 0) + fees;
          costHeld   += cost;
          sharesHeld += qty;
          runningAvg  = sharesHeld > 0 ? costHeld / sharesHeld : 0;
          buyTxnCount++;
          if (t.date && (!firstBuyDate || t.date < firstBuyDate)) firstBuyDate = t.date;

        } else if (t.type === "Sell") {
          if (sharesHeld <= 0) continue;

          const actualSold = Math.min(qty, sharesHeld);
          const costBasis  = actualSold * runningAvg;

          // ── FIX: Sell proceeds = gross trade value MINUS sell-side fees ──
          // Previously was just t.total (gross), which overstated realized gain
          // by the full sell commission on every sell transaction.
          const netProceeds = Number(t.total || 0) - fees;
          const gain        = netProceeds - costBasis;
          const retPct      = costBasis > 0 ? (gain / costBasis) * 100 : 0;
          const daysHeld    = firstBuyDate && t.date
            ? Math.max(0, Math.floor((new Date(t.date) - new Date(firstBuyDate)) / 86_400_000))
            : null;

          realizedGL        += gain;
          totalSaleProceeds += netProceeds;
          totalCostBasis    += costBasis;
          totalSharesSold   += actualSold;

          costHeld   -= costBasis;
          sharesHeld -= actualSold;
          if (sharesHeld <= 0) { sharesHeld = 0; costHeld = 0; runningAvg = 0; }

          realizedTrades.push({ soldShares: actualSold, costBasis, saleProceeds: netProceeds, realizedGL: gain, realRetPct: retPct, date: t.date, daysHeld });
        }
      }

      const currentPrice      = Number(company.cds_price || 0);
      const marketValue       = sharesHeld > 0 && currentPrice > 0 ? sharesHeld * currentPrice : 0;
      const openPositionCost  = costHeld;
      const unrealizedGL      = currentPrice > 0 ? marketValue - openPositionCost : 0;
      const unrealizedRetPct  = openPositionCost > 0 ? (unrealizedGL / openPositionCost) * 100 : 0;
      const firstBuyDays      = firstBuyDate ? daysBetween(firstBuyDate) : null;

      // Accumulate portfolio-level totals here — avoids .reduce() passes later
      totalMarketValue      += marketValue;
      totalCurrentCost      += openPositionCost;
      totalRealizedGLAll    += realizedGL;
      totalSaleProceedsAcc  += totalSaleProceeds;
      totalCostBasisAcc     += totalCostBasis;
      totalSharesSoldAcc    += totalSharesSold;
      totalBuyTxnCount      += buyTxnCount;
      if (sharesHeld > 0 && firstBuyDays !== null) {
        firstBuyDaysNumerator     += firstBuyDays * sharesHeld;
        firstBuySharesDenominator += sharesHeld;
      }

      return {
        id: company.id, name: company.name, color,
        netShares: sharesHeld, avgCost: runningAvg,
        currentPrice, marketValue, openPositionCost,
        unrealizedGL, unrealizedRetPct, firstBuyDays,
        buyTransactionCount: buyTxnCount,
        hasAnomaly: sharesHeld < 0,
        realizedTrades, realizedGL,
        totalSaleProceeds, totalCostBasis, totalSharesSold,
        prevPrice: Number(company.cds_previous_price || 0),
      };
    });

    // ── Single pass: add weights + filter active companies ───────
    // Avoids a second .map() pass over all companies
    const activeCompanies = [];
    for (const c of companyMetricsRaw) {
      if (c.netShares <= 0 && c.marketValue <= 0) continue;
      activeCompanies.push({
        ...c,
        weight:     totalMarketValue > 0 ? (c.marketValue       / totalMarketValue) * 100 : 0,
        costWeight: totalCurrentCost > 0 ? (c.openPositionCost  / totalCurrentCost) * 100 : 0,
      });
    }
    activeCompanies.sort((a, b) => b.marketValue - a.marketValue);

    const unrealizedGL      = totalMarketValue - totalCurrentCost;
    const unrealizedRetPct  = totalCurrentCost > 0 ? (unrealizedGL / totalCurrentCost) * 100 : 0;
    const hasFinancials     = activeCompanies.some(c => c.currentPrice > 0 && c.netShares > 0);
    const hasRealized       = totalRealizedGLAll !== 0;
    const investedCapital   = totalCurrentCost > 0 ? totalCurrentCost : grossBuyCapital;
    const totalNetShares    = activeCompanies.reduce((s, c) => s + c.netShares, 0);
    const avgFirstBuyDays   = firstBuySharesDenominator > 0
      ? Math.round(firstBuyDaysNumerator / firstBuySharesDenominator)
      : null;
    // realizedCompanies must come from ALL companies (companyMetricsRaw), not just
    // activeCompanies — a fully-sold company has netShares=0 so it gets excluded from
    // activeCompanies, but it still has realized trades that must appear in the panel.
    const realizedCompanies = companyMetricsRaw.filter(c => c.realizedTrades.length > 0);
    const totalCompanies    = activeCompanies.length > 0
      ? activeCompanies.length
      : portfolio.length > 0
        ? portfolio.length
        : txnCompanyCount;

    return {
      pending, total, totalCompanies,
      totalMarketValue, investedCapital, grossBuyCapital,
      unrealizedGL, unrealizedRetPct,
      totalRealizedGL:      totalRealizedGLAll,
      totalSaleProceeds:    totalSaleProceedsAcc,
      totalCostBasis:       totalCostBasisAcc,
      totalSharesSold:      totalSharesSoldAcc,
      hasRealized, hasFinancials, hasCostData,
      companyMetrics:       activeCompanies,
      realizedCompanies,
      totalNetShares,
      totalBuyTransactionCount: totalBuyTxnCount,
      avgFirstBuyDays,
    };
  }, [portfolio, myTxns, groupedVerifiedByCompany]);

  // ── cdsUsers: precomputed display fields — no per-row work ──────
  const cdsUsers = useMemo(() => cdsMembers.map(u => {
    const name = u.full_name || u.email || "?";
    const code = u.role_code || "";
    return {
      ...u,
      _roleName:    ROLE_NAMES[code] || code || "—",
      _initials:    name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2),
      _avatarColor: AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length],
      _isActive:    u.is_active !== false && u.status !== "inactive",
    };
  }), [cdsMembers]);

  // ── Stable callbacks — no re-renders on parent state change ─────
  const toggleExpand       = useCallback((key) => setExpanded(prev => prev === key ? null : key), []);
  const onToggleRealized   = useCallback(() => toggleExpand("realized"),      [toggleExpand]);
  const onToggleCompanies  = useCallback(() => toggleExpand("companies"),     [toggleExpand]);
  const onToggleUsers      = useCallback(() => toggleExpand("users"),         [toggleExpand]);
  const onNavTransactions  = useCallback(() => onNavigate("transactions"),    [onNavigate]);
  const onNavUserMgmt      = useCallback(() => onNavigate("user-management"), [onNavigate]);
  const onCloseExpand      = useCallback(() => setExpanded(null),             []);

  // ── Scroll to top on panel close ────────────────────────────────
  useEffect(() => {
    if (expanded !== null) { hasExpandedRef.current = true; return; }
    if (!hasExpandedRef.current || !snapRef.current) return;
    let el = snapRef.current.parentElement;
    while (el) {
      const { overflowY } = window.getComputedStyle(el);
      if ((overflowY === "auto" || overflowY === "scroll") && el.scrollTop > 0) {
        el.scrollTo({ top: 0, behavior: "smooth" }); break;
      }
      el = el.parentElement;
    }
  }, [expanded]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes dashFadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* ── Snapshot strip ── */}
      <div
        ref={snapRef}
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr",
          gap: 14,
          marginBottom: (expanded === "realized" || expanded === "companies" || expanded === "users") ? 14 : 20,
        }}
      >
        <SnapCard
          label="Market Value" loading={loading}
          value={
            metrics.hasFinancials   ? fmtShort(metrics.totalMarketValue)
            : metrics.hasCostData   ? fmtShort(metrics.investedCapital)
            : metrics.total > 0     ? `${metrics.total} txns`
            : "—"
          }
          sub={
            metrics.hasFinancials   ? "Current market value (TZS)"
            : metrics.hasCostData   ? "Cost basis — set prices for market value"
            : "No verified transactions yet"
          }
        />

        <SnapCard
          label="Invested Capital" loading={loading}
          value={metrics.hasCostData ? fmtShort(metrics.investedCapital) : "—"}
          sub={metrics.hasCostData ? `${fmt(metrics.totalNetShares)} shares held` : "No verified buy transactions"}
        />

        <SnapCard
          label="Unrealized Gain / Loss" loading={loading}
          value={metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? "+" : "") + fmtShort(metrics.unrealizedGL) : "—"}
          sub={metrics.hasFinancials ? (metrics.avgFirstBuyDays ? `avg ${metrics.avgFirstBuyDays}d` : "open positions") : "Set prices in Portfolio to compute"}
          accent={metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? C.green : C.red) : C.gray200}
          accentBg={metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? C.green : C.red) : undefined}
        />

        <SnapCard
          label="Unrealized Return %" loading={loading}
          value={metrics.hasFinancials ? (metrics.unrealizedRetPct >= 0 ? "+" : "") + metrics.unrealizedRetPct.toFixed(2) + "%" : "—"}
          sub={metrics.hasFinancials ? "Return on open positions" : "Set prices in Portfolio"}
          accent={metrics.hasFinancials ? (metrics.unrealizedRetPct >= 0 ? C.green : C.red) : C.gray200}
          accentBg={metrics.hasFinancials ? (metrics.unrealizedRetPct >= 0 ? C.green : C.red) : undefined}
        />

        <SnapCard
          label="Realized Gain / Loss" loading={loading}
          value={metrics.hasRealized ? (metrics.totalRealizedGL >= 0 ? "+" : "") + fmtShort(metrics.totalRealizedGL) : "—"}
          sub={metrics.hasRealized ? `${fmt(metrics.totalSharesSold)} shares sold` : "No closed positions yet"}
          accent={metrics.hasRealized ? (metrics.totalRealizedGL >= 0 ? C.green : C.red) : C.gray200}
          accentBg={metrics.hasRealized ? (metrics.totalRealizedGL >= 0 ? C.green : C.red) : undefined}
          expandable={metrics.hasRealized}
          expanded={expanded === "realized"}
          onToggle={onToggleRealized}
          hoverable
        />
      </div>

      {/* ── Realized GL expand panel ── */}
      {expanded === "realized" && (
        <ExpandPanel
          title="📤 Realized Gain / Loss — Closed Positions"
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
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
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
                          value={(c.totalCostBasis > 0 ? (c.realizedGL / c.totalCostBasis) * 100 : 0).toFixed(2) + "%"}
                          positive={c.realizedGL >= 0}
                        />
                      </Td>
                      <Td right color={C.gray500} small>
                        {c.realizedTrades.every(r => r.daysHeld !== null)
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
                          value={(metrics.totalCostBasis > 0 ? (metrics.totalRealizedGL / metrics.totalCostBasis) * 100 : 0).toFixed(2) + "%"}
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

      {/* ── Stat cards row ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14,
        marginBottom: (expanded === "companies" || expanded === "users") ? 14 : 22,
      }}>
        <StatCard icon="🏢" label="Companies"
          value={loading ? "—" : metrics.totalCompanies}
          subLabel={`${metrics.totalBuyTransactionCount} buy transactions`}
          accent={C.navy} accentBg="#0B1F3A"
          onClick={onToggleCompanies} active={expanded === "companies"} loading={loading}
        />
        <StatCard icon="👥" label="Total Users"
          value={loading ? "—" : (cds ? cdsUsers.length : (userCount ?? "—"))}
          subLabel={cds ? `active on ${cds}` : `${allUsers.length} total`}
          accent="#2563eb" accentBg="#2563eb"
          onClick={onToggleUsers} active={expanded === "users"} loading={loading}
        />
        <StatCard icon="⏳" label="Unverified Transactions"
          value={loading ? "—" : metrics.pending}
          subLabel={metrics.pending > 0 ? "awaiting action" : "all verified"}
          accent="#f59e0b" accentBg="#f59e0b"
          onClick={onNavTransactions} navigates loading={loading}
        />
      </div>

      {/* ── Companies expand panel ── */}
      {expanded === "companies" && (
        <ExpandPanel title="🏢 Companies" accentColor={C.navy} onClose={onCloseExpand}>
          {loading ? <Spinner /> : metrics.companyMetrics.length === 0 ? <Empty msg="No active positions found." /> : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
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
                        {c.currentPrice > 0 ? (c.unrealizedGL >= 0 ? "+" : "") + fmt(c.unrealizedGL) : "—"}
                      </Td>
                      <Td right>
                        <span style={{ background: "#f0fdf4", color: C.green, border: `1px solid ${C.green}25`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Active</span>
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
                      <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{metrics.hasFinancials ? fmt(metrics.totalMarketValue) : "—"}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.unrealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                        {metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? "+" : "") + fmt(metrics.unrealizedGL) : "—"}
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

      {/* ── Users expand panel ── */}
      {expanded === "users" && (
        <ExpandPanel title={`👥 ${cds ? `CDS ${cds}` : "All"} — Members (${cdsUsers.length})`} accentColor="#2563eb" onClose={onCloseExpand}>
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
                      <tr key={u.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                        <Td bold>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, whiteSpace: "nowrap" }}>
                            <div style={{ position: "relative", flexShrink: 0, width: 30, height: 30 }}>
                              {u.avatar_url && (
                                <img src={u.avatar_url} alt={u.full_name || "User"}
                                  style={{ width: 30, height: 30, borderRadius: 8, objectFit: "cover", display: "block", border: `1.5px solid ${C.gray200}` }}
                                  onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }}
                                />
                              )}
                              <div style={{ width: 30, height: 30, borderRadius: 8, background: `linear-gradient(135deg, ${u._avatarColor}, ${u._avatarColor}99)`, display: u.avatar_url ? "none" : "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.white }}>
                                {u._initials}
                              </div>
                              <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: "50%", border: `2px solid ${C.white}`, background: u._isActive ? "#16a34a" : "#d1d5db" }} />
                            </div>
                            {u.full_name || "—"}
                          </div>
                        </Td>
                        <Td>
                          <span style={{ background: C.navy + "12", color: C.navy, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {u._roleName}
                          </span>
                        </Td>
                        <Td color={C.gray500}>{u.phone || "—"}</Td>
                        <Td color={C.gray500}>{u.email || "—"}</Td>
                        <Td>
                          <span style={{ background: u._isActive ? "#f0fdf4" : "#fef2f2", color: u._isActive ? C.green : C.red, border: `1px solid ${u._isActive ? C.green : C.red}25`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                            {u._isActive ? "Active" : "Inactive"}
                          </span>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {isSAAD && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.gray100}`, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={onNavUserMgmt}
                    style={{ background: "none", border: `1.5px solid ${C.navy}`, color: C.navy, borderRadius: 9, padding: "7px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = C.white; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.navy; }}
                  >
                    Go to User Management →
                  </button>
                </div>
              )}
            </>
          )}
        </ExpandPanel>
      )}

      {/* ── Top 5 Holdings table ── */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.gray100}`, background: C.gray50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>📋 Top 5 Holdings by Market Value</div>
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
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                    <Td bold>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        {c.name}
                        {c.hasAnomaly && (
                          <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, background: "#fef2f2", color: C.red, border: `1px solid ${C.red}25`, borderRadius: 6, padding: "1px 5px", whiteSpace: "nowrap" }}>⚠ oversold</span>
                        )}
                      </div>
                    </Td>
                    <Td right>{fmt(c.netShares)}</Td>
                    <Td right>{c.openPositionCost > 0 ? fmt(c.openPositionCost) : "—"}</Td>
                    <Td right bold color={c.currentPrice > 0 ? C.green : C.gray400}>
                      {c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}
                    </Td>
                    <Td right bold>{c.marketValue > 0 ? fmt(c.marketValue) : "—"}</Td>
                    <Td right bold color={c.unrealizedGL >= 0 ? C.green : C.red}>
                      {c.currentPrice > 0 && c.unrealizedGL !== 0 ? (c.unrealizedGL >= 0 ? "+" : "") + fmt(c.unrealizedGL) : "—"}
                    </Td>
                    <Td right>
                      {c.currentPrice > 0 && c.unrealizedRetPct !== 0 ? (
                        <Badge value={(c.unrealizedRetPct >= 0 ? "+" : "") + c.unrealizedRetPct.toFixed(2) + "%"} positive={c.unrealizedRetPct >= 0} />
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
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>
                      TOTAL
                      {metrics.companyMetrics.length > 5 && (
                        <div style={{ fontSize: 10, fontWeight: 400, color: C.gray400, marginTop: 2 }}>all {metrics.companyMetrics.length} companies</div>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalNetShares)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.investedCapital)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, fontSize: 13, color: C.gray400, textAlign: "right" }}>—</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.text, textAlign: "right" }}>{fmt(metrics.totalMarketValue)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: metrics.unrealizedGL >= 0 ? C.green : C.red, textAlign: "right" }}>
                      {metrics.hasFinancials ? (metrics.unrealizedGL >= 0 ? "+" : "") + fmt(metrics.unrealizedGL) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <Badge value={(metrics.unrealizedRetPct >= 0 ? "+" : "") + metrics.unrealizedRetPct.toFixed(2) + "%"} positive={metrics.unrealizedRetPct >= 0} />
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: C.gray400, textAlign: "right" }}>
                      {metrics.avgFirstBuyDays !== null ? `avg ${metrics.avgFirstBuyDays}d` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.gray400, textAlign: "right" }}>100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
