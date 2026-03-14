// ── src/pages/DashboardPage.jsx ────────────────────────────────────
import { useState, useEffect, useMemo, useCallback } from "react";
import { C } from "../components/ui";
import { ROLE_META } from "../lib/constants";
import { sbGetPortfolio, sbGetTransactions, sbGetAllUsers } from "../lib/supabase";

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

// ── Company accent colors ──────────────────────────────────────────
const CHART_COLORS = [
  "#3b82f6", C.green, "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

// ── Status meta ────────────────────────────────────────────────────
const STATUS_META = {
  pending:   { color: "#f59e0b", bg: "#fffbeb", label: "Pending"   },
  confirmed: { color: "#3b82f6", bg: "#eff6ff", label: "Confirmed" },
  verified:  { color: C.green,   bg: "#f0fdf4", label: "Verified"  },
  rejected:  { color: C.red,     bg: "#fef2f2", label: "Rejected"  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: C.gray400, bg: C.gray50, label: status };
  return (
    <span style={{
      background: m.bg, color: m.color,
      border: `1px solid ${m.color}30`,
      borderRadius: 20, padding: "2px 8px",
      fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {m.label}
    </span>
  );
}

// ── Donut chart (pure SVG) ─────────────────────────────────────────
function DonutChart({ segments, size = 120, thickness = 22 }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  const r     = (size - thickness) / 2;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.gray100} strokeWidth={thickness} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="9" fill={C.gray400} fontFamily="inherit">No data</text>
      </svg>
    );
  }

  let cumulativeDash = 0;
  const paths = segments.map((seg, i) => {
    const pct    = seg.value / total;
    const dash   = pct * circ;
    const gap    = circ - dash;
    const offset = circ * 0.25 - cumulativeDash;
    cumulativeDash += dash;
    return (
      <circle key={i} cx={cx} cy={cy} r={r} fill="none"
        stroke={seg.color} strokeWidth={thickness}
        strokeDasharray={`${dash} ${gap}`}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dasharray 0.5s ease" }}
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.gray100} strokeWidth={thickness} />
      {paths}
    </svg>
  );
}

// ── Table helpers ──────────────────────────────────────────────────
function Th({ children, right }) {
  return (
    <th style={{
      padding: "8px 12px", textAlign: right ? "right" : "left",
      fontWeight: 700, fontSize: 10, color: C.gray400,
      textTransform: "uppercase", letterSpacing: "0.05em",
      borderBottom: `1px solid ${C.gray200}`,
      background: C.gray50, whiteSpace: "nowrap",
    }}>{children}</th>
  );
}
function Td({ children, bold, color, right, small }) {
  return (
    <td style={{
      padding: "9px 12px",
      fontWeight: bold ? 700 : 400,
      color: color || C.text,
      textAlign: right ? "right" : "left",
      fontSize: small ? 11 : 13,
    }}>{children}</td>
  );
}

// ── Expand card (left column) ──────────────────────────────────────
function ExpandCard({ icon, label, value, subLabel, accent, expanded, onToggle, children, loading }) {
  return (
    <div style={{
      background: C.white,
      border: `1.5px solid ${expanded ? accent : C.gray200}`,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: expanded ? `0 4px 20px ${accent}18` : "0 1px 4px rgba(0,0,0,0.04)",
      transition: "border-color 0.18s, box-shadow 0.18s",
    }}>
      {/* Card header */}
      <div
        onClick={onToggle}
        style={{
          padding: "18px 20px",
          cursor: onToggle ? "pointer" : "default",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
          userSelect: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { if (onToggle) e.currentTarget.style.background = C.gray50 + "90"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: accent + "18",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 21, flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{ fontSize: 12, color: C.gray400, fontWeight: 600, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.text, lineHeight: 1 }}>
              {loading ? <span style={{ fontSize: 16, color: C.gray300 }}>—</span> : value}
            </div>
            {subLabel && <div style={{ fontSize: 11, color: C.gray400, marginTop: 5 }}>{subLabel}</div>}
          </div>
        </div>

        {onToggle && (
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: expanded ? accent + "18" : C.gray100,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, transition: "all 0.2s",
          }}>
            <span style={{
              fontSize: 13, color: expanded ? accent : C.gray400,
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}>▾</span>
          </div>
        )}
      </div>

      {/* Expand panel */}
      <div style={{
        maxHeight: expanded ? "1400px" : 0,
        overflow: "hidden",
        transition: "max-height 0.32s ease",
      }}>
        <div style={{ borderTop: `1px solid ${C.gray100}`, padding: "18px 20px 20px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Navigate card (right sidebar) ─────────────────────────────────
function NavCard({ icon, label, value, subLabel, accent, onClick, loading }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.navy : C.white,
        border: `1.5px solid ${hov ? C.navy : C.gray200}`,
        borderRadius: 14, padding: "16px 18px",
        cursor: "pointer",
        transition: "all 0.18s ease",
        display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 12,
        boxShadow: hov ? `0 4px 20px ${C.navy}22` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11,
          background: hov ? "rgba(255,255,255,0.12)" : accent + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, flexShrink: 0, transition: "background 0.18s",
        }}>
          {icon}
        </div>
        <div>
          <div style={{ fontSize: 11, color: hov ? "rgba(255,255,255,0.5)" : C.gray400, fontWeight: 600, marginBottom: 3 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: hov ? C.white : C.text, lineHeight: 1 }}>
            {loading ? "—" : value}
          </div>
          {subLabel && <div style={{ fontSize: 11, color: hov ? "rgba(255,255,255,0.4)" : C.gray400, marginTop: 4 }}>{subLabel}</div>}
        </div>
      </div>
      <span style={{ fontSize: 18, color: hov ? "rgba(255,255,255,0.5)" : C.gray300, transition: "color 0.18s" }}>→</span>
    </div>
  );
}

// ── Side section card ──────────────────────────────────────────────
function SideCard({ title, icon, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", gap: 8, background: C.gray50 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{title}</span>
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </div>
  );
}

// ── Main DashboardPage ─────────────────────────────────────────────
export default function DashboardPage({ profile, role, session, showToast, onNavigate }) {
  const [portfolio,    setPortfolio]    = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [users,        setUsers]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  // Accordion: only one card open at a time
  const [expanded, setExpanded] = useState(null);

  const isSAAD   = ["SA", "AD"].includes(role);
  const roleMeta = ROLE_META[role] || { label: role || "User", color: C.gray400 };

  const myTxns = useMemo(
    () => transactions.filter(t => t.cds_number === profile?.cds_number),
    [transactions, profile?.cds_number]
  );

  // ── Fetch all data ────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [port, txns, usrs] = await Promise.all([
          sbGetPortfolio(profile?.cds_number).catch(() => []),
          sbGetTransactions().catch(() => []),
          isSAAD ? sbGetAllUsers().catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setPortfolio(port  || []);
        setTransactions(txns || []);
        setUsers(usrs || []);
      } catch {
        if (!cancelled) showToast?.("Dashboard load error", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [profile?.cds_number, isSAAD]); // eslint-disable-line

  // ── Metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const byStatus = (s) => myTxns.filter(t => t.status === s).length;
    const pending   = byStatus("pending");
    const confirmed = byStatus("confirmed");
    const verified  = byStatus("verified");
    const rejected  = byStatus("rejected");
    const total     = myTxns.length;

    let totalValue = 0, totalInvested = 0;

    const companyMetrics = portfolio.map((company, idx) => {
      const vTxns = myTxns.filter(t => t.company_id === company.id && t.status === "verified");
      let netShares = 0, buyShares = 0, buyInvested = 0;
      vTxns.forEach(t => {
        const shares = Number(t.shares || t.quantity || 0);
        const price  = Number(t.price  || t.unit_price || 0);
        const isSell = (t.transaction_type || t.type || "buy").toLowerCase() === "sell";
        if (isSell) { netShares -= shares; }
        else        { netShares += shares; buyShares += shares; buyInvested += shares * price; }
      });
      const avgCost      = buyShares > 0 ? buyInvested / buyShares : 0;
      const currentPrice = Number(company.cds_price || 0);
      const marketValue  = netShares > 0 ? netShares * currentPrice : 0;
      const invested     = netShares > 0 ? netShares * avgCost      : 0;
      const gainLoss     = marketValue - invested;
      const returnPct    = invested > 0 ? (gainLoss / invested) * 100 : 0;
      const color        = CHART_COLORS[idx % CHART_COLORS.length];
      totalValue    += marketValue;
      totalInvested += invested;
      return {
        id: company.id, name: company.name, color,
        netShares, avgCost, currentPrice,
        marketValue, invested, gainLoss, returnPct,
        prevPrice: Number(company.cds_previous_price || 0),
        updatedAt: company.cds_updated_at,
      };
    });

    const withWeights    = companyMetrics.map(c => ({ ...c, weight: totalValue > 0 ? (c.marketValue / totalValue) * 100 : 0 }));
    const totalGainLoss  = totalValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
    const hasFinancials  = withWeights.some(c => c.currentPrice > 0 && c.netShares > 0);
    const activeCompanies = withWeights.filter(c => c.netShares > 0 || c.marketValue > 0);

    return {
      pending, confirmed, verified, rejected, total,
      totalCompanies: portfolio.length,
      totalValue, totalInvested, totalGainLoss, totalReturnPct,
      companyMetrics: activeCompanies,
      allPortfolio:   withWeights,
      hasFinancials,
    };
  }, [portfolio, myTxns]);

  const statusSegments = useMemo(() => [
    { label: "Verified",  value: metrics.verified,  color: C.green   },
    { label: "Confirmed", value: metrics.confirmed, color: "#3b82f6" },
    { label: "Pending",   value: metrics.pending,   color: "#f59e0b" },
    { label: "Rejected",  value: metrics.rejected,  color: C.red     },
  ], [metrics]);

  const portfolioSegments = useMemo(
    () => metrics.companyMetrics.filter(c => c.marketValue > 0).map(c => ({ label: c.name, value: c.marketValue, color: c.color })),
    [metrics.companyMetrics]
  );

  // Sidebar previews
  const pendingTxns  = useMemo(() => myTxns.filter(t => t.status === "pending").slice(0, 3), [myTxns]);
  const recentUsers  = useMemo(() => users.slice(0, 4), [users]);

  // Accordion toggle
  const toggleExpand = useCallback((key) => {
    setExpanded(prev => prev === key ? null : key);
  }, []);

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* ── Welcome strip ─────────────────────────────────────────── */}
      <div style={{
        background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        borderRadius: 16, padding: "20px 28px", marginBottom: 22,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "22px 22px", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", background: `radial-gradient(circle, ${C.green}22 0%, transparent 70%)`, pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.white, marginBottom: 6 }}>
            Welcome back, {profile?.full_name?.split(" ")[0] || "Investor"} 👋
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ background: roleMeta.color + "28", color: roleMeta.color, padding: "2px 10px", borderRadius: 20, fontWeight: 700, fontSize: 11, border: `1px solid ${roleMeta.color}30` }}>
              {roleMeta.label}
            </span>
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>·</span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 12 }}>{today}</span>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>CDS Account</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.gold, letterSpacing: "0.05em" }}>{profile?.cds_number || "—"}</div>
        </div>
      </div>

      {/* ── 3-card summary strip ──────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr", gap: 14, marginBottom: 22 }}>

        {/* Dark — Portfolio Value */}
        <div style={{
          background: "linear-gradient(135deg, #0B1F3A 0%, #1e3a5f 100%)",
          borderRadius: 14, padding: "20px 22px",
          position: "relative", overflow: "hidden",
          boxShadow: "0 4px 20px rgba(11,31,58,0.3)",
        }}>
          <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: "50%", background: `radial-gradient(circle, ${C.green}22 0%, transparent 70%)` }} />
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Portfolio Value</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.white, lineHeight: 1, marginBottom: 6 }}>
            {loading ? "—" : (metrics.hasFinancials ? fmtShort(metrics.totalValue) : `${metrics.total} txns`)}
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
            {metrics.hasFinancials ? "Market value (TZS)" : "Set prices to compute value"}
          </div>
        </div>

        {/* Net Gain / Loss */}
        <div style={{
          background: C.white,
          border: `1.5px solid ${!loading && metrics.hasFinancials ? (metrics.totalGainLoss >= 0 ? C.green + "40" : C.red + "40") : C.gray200}`,
          borderRadius: 14, padding: "20px 22px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 11, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Net Gain / Loss</div>
          <div style={{
            fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6,
            color: loading || !metrics.hasFinancials ? C.gray300 : metrics.totalGainLoss >= 0 ? C.green : C.red,
          }}>
            {loading ? "—" : (metrics.hasFinancials
              ? (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)
              : "—")}
          </div>
          <div style={{ fontSize: 11, color: C.gray400 }}>
            {metrics.hasFinancials
              ? `${metrics.totalReturnPct >= 0 ? "+" : ""}${metrics.totalReturnPct.toFixed(2)}% overall return`
              : "Set prices in Portfolio"}
          </div>
        </div>

        {/* Pending */}
        <div style={{
          background: C.white,
          border: `1.5px solid ${metrics.pending > 0 ? "#f59e0b40" : C.gray200}`,
          borderRadius: 14, padding: "20px 22px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: 11, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Pending Queue</div>
          <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, marginBottom: 6, color: loading ? C.gray300 : metrics.pending > 0 ? "#f59e0b" : C.text }}>
            {loading ? "—" : metrics.pending}
          </div>
          <div style={{ fontSize: 11, color: C.gray400 }}>
            {metrics.pending > 0 ? "transactions awaiting action" : "all transactions processed"}
          </div>
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, alignItems: "start" }}>

        {/* ── LEFT: Accordion expand cards ──────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Companies */}
          <ExpandCard
            icon="🏢" label="Total Companies"
            value={loading ? "—" : metrics.totalCompanies}
            subLabel={expanded === "companies" ? "showing price snapshot" : "click to expand holdings"}
            accent={C.navy}
            expanded={expanded === "companies"}
            onToggle={() => toggleExpand("companies")}
            loading={loading}
          >
            {portfolio.length === 0 ? (
              <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "16px 0" }}>No companies in your portfolio yet.</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Company","Current Price","Prev. Price","Change","Last Updated"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {metrics.allPortfolio.map((c, i) => {
                      const change = c.prevPrice > 0 ? ((c.currentPrice - c.prevPrice) / c.prevPrice) * 100 : null;
                      return (
                        <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                          <Td bold><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</div></Td>
                          <Td bold color={c.currentPrice > 0 ? C.green : C.gray400}>{c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}</Td>
                          <Td color={C.gray500}>{c.prevPrice > 0 ? fmt(c.prevPrice) : "—"}</Td>
                          <Td>{change !== null ? <span style={{ color: change >= 0 ? C.green : C.red, fontWeight: 700 }}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%</span> : "—"}</Td>
                          <Td color={C.gray400} small>{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-GB") : "—"}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </ExpandCard>

          {/* Portfolio Breakdown */}
          <ExpandCard
            icon="💰" label="Portfolio Breakdown"
            value={loading ? "—" : (metrics.hasFinancials ? fmtShort(metrics.totalValue) : `${metrics.totalCompanies} holdings`)}
            subLabel={expanded === "portfolio" ? "showing full breakdown" : "click to expand by company"}
            accent={C.green}
            expanded={expanded === "portfolio"}
            onToggle={() => toggleExpand("portfolio")}
            loading={loading}
          >
            {metrics.companyMetrics.length === 0 ? (
              <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "16px 0" }}>
                {portfolio.length === 0 ? "No companies yet." : "Set prices in Portfolio page to see breakdown."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Company","Net Shares","Avg Cost","Current Price","Market Value","Gain/Loss","Return %","Weight"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {metrics.companyMetrics.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                        <Td bold><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</div></Td>
                        <Td>{fmt(c.netShares)}</Td>
                        <Td>{c.avgCost > 0 ? fmt(c.avgCost) : "—"}</Td>
                        <Td>{c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}</Td>
                        <Td bold>{c.marketValue > 0 ? fmtShort(c.marketValue) : "—"}</Td>
                        <Td bold color={c.gainLoss >= 0 ? C.green : C.red}>{c.gainLoss !== 0 ? (c.gainLoss >= 0 ? "+" : "") + fmtShort(c.gainLoss) : "—"}</Td>
                        <Td>{c.returnPct !== 0 ? <span style={{ background: c.returnPct >= 0 ? "#f0fdf4" : "#fef2f2", color: c.returnPct >= 0 ? C.green : C.red, padding: "2px 8px", borderRadius: 8, fontWeight: 700, fontSize: 11 }}>{(c.returnPct >= 0 ? "+" : "") + c.returnPct.toFixed(2)}%</span> : "—"}</Td>
                        <Td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ width: 44, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}><div style={{ width: `${c.weight}%`, height: "100%", background: c.color, borderRadius: 4 }} /></div>
                            <span style={{ fontSize: 11, color: C.gray500 }}>{c.weight.toFixed(1)}%</span>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                      <td colSpan={4} style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>{fmtShort(metrics.totalValue)}</td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalGainLoss >= 0 ? C.green : C.red }}>{(metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)}</td>
                      <td style={{ padding: "9px 12px" }}><span style={{ background: metrics.totalReturnPct >= 0 ? "#f0fdf4" : "#fef2f2", color: metrics.totalReturnPct >= 0 ? C.green : C.red, padding: "2px 8px", borderRadius: 8, fontWeight: 800, fontSize: 11 }}>{(metrics.totalReturnPct >= 0 ? "+" : "") + metrics.totalReturnPct.toFixed(2)}%</span></td>
                      <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.gray400 }}>100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </ExpandCard>

          {/* Gain / Loss */}
          <ExpandCard
            icon={metrics.totalGainLoss >= 0 ? "📈" : "📉"}
            label="Gain / Loss Analysis"
            value={loading ? "—" : (metrics.hasFinancials ? (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss) : "—")}
            subLabel={expanded === "gain" ? "showing per-company analysis" : "click to expand breakdown"}
            accent={metrics.totalGainLoss >= 0 ? C.green : C.red}
            expanded={expanded === "gain"}
            onToggle={metrics.hasFinancials ? () => toggleExpand("gain") : undefined}
            loading={loading}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 }}>
              {[
                { label: "Total Invested", value: fmtShort(metrics.totalInvested), icon: "💵", color: C.navy },
                { label: "Current Value",  value: fmtShort(metrics.totalValue),    icon: "📊", color: "#3b82f6" },
                { label: "Gain / Loss",
                  value: (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss),
                  icon: metrics.totalGainLoss >= 0 ? "📈" : "📉",
                  color: metrics.totalGainLoss >= 0 ? C.green : C.red },
              ].map(item => (
                <div key={item.label} style={{ background: item.color + "0d", border: `1px solid ${item.color}22`, borderRadius: 10, padding: "14px", textAlign: "center" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: item.color }}>{item.value}</div>
                  <div style={{ fontSize: 10, color: C.gray400, marginTop: 4, fontWeight: 600 }}>{item.label}</div>
                </div>
              ))}
            </div>
            {metrics.companyMetrics.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr>{["Company","Invested (TZS)","Market Value","Gain / Loss","Return %"].map(h => <Th key={h}>{h}</Th>)}</tr></thead>
                  <tbody>
                    {metrics.companyMetrics.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                        <Td bold><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</div></Td>
                        <Td>{fmtShort(c.invested)}</Td>
                        <Td>{fmtShort(c.marketValue)}</Td>
                        <Td bold color={c.gainLoss >= 0 ? C.green : C.red}>{(c.gainLoss >= 0 ? "+" : "") + fmtShort(c.gainLoss)}</Td>
                        <Td><span style={{ background: c.returnPct >= 0 ? "#f0fdf4" : "#fef2f2", color: c.returnPct >= 0 ? C.green : C.red, padding: "2px 10px", borderRadius: 8, fontWeight: 700, fontSize: 11 }}>{(c.returnPct >= 0 ? "+" : "") + c.returnPct.toFixed(2)}%</span></Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "12px 0" }}>Set prices in Portfolio page to see breakdown.</div>
            )}
          </ExpandCard>

          {/* Transaction status + donut */}
          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "20px" }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.text, marginBottom: 18 }}>📊 Transaction Status</div>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 110 }}>
                <div style={{ width: 24, height: 24, border: `3px solid ${C.gray100}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                <DonutChart segments={metrics.total > 0 ? statusSegments : [{ value: 1, color: C.gray100 }]} size={110} thickness={20} />
                <div style={{ flex: 1 }}>
                  {statusSegments.map(seg => (
                    <div key={seg.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: C.gray500 }}>{seg.label}</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: seg.value > 0 ? C.text : C.gray300 }}>{seg.value}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: `1px solid ${C.gray100}`, paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: C.gray400, fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{metrics.total}</span>
                  </div>
                </div>
                {portfolioSegments.length > 0 && (
                  <>
                    <div style={{ width: 1, height: 90, background: C.gray100, flexShrink: 0 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <DonutChart segments={portfolioSegments} size={90} thickness={16} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 10, color: C.gray400, marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.05em" }}>Weight</div>
                        {portfolioSegments.map(seg => (
                          <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                            <div style={{ width: 6, height: 6, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, color: C.gray500, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.label}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.gray500 }}>{metrics.totalValue > 0 ? ((seg.value / metrics.totalValue) * 100).toFixed(1) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar ─────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Navigate: Pending */}
          <NavCard
            icon="⏳" label="Pending Transactions"
            value={loading ? "—" : metrics.pending}
            subLabel={metrics.pending > 0 ? "awaiting action" : "all clear"}
            accent="#f59e0b"
            onClick={() => onNavigate("transactions")}
            loading={loading}
          />

          {/* Pending mini-preview */}
          <SideCard title="Pending Preview" icon="🕐">
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 72 }}>
                <div style={{ width: 18, height: 18, border: `2px solid ${C.gray100}`, borderTop: `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : pendingTxns.length === 0 ? (
              <div style={{ textAlign: "center", color: C.gray400, fontSize: 12, padding: "16px 0" }}>No pending transactions 🎉</div>
            ) : (
              <>
                {pendingTxns.map((txn, i) => {
                  const company = portfolio.find(c => c.id === txn.company_id);
                  const isLast  = i === pendingTxns.length - 1;
                  return (
                    <div key={txn.id} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: isLast ? 0 : 10, marginBottom: isLast ? 0 : 10, borderBottom: isLast ? "none" : `1px solid ${C.gray100}` }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: "#fffbeb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>📋</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{company?.name || "Unknown Company"}</div>
                        <div style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>{txn.date ? new Date(txn.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "—"}</div>
                      </div>
                      <StatusBadge status="pending" />
                    </div>
                  );
                })}
                {metrics.pending > 3 && (
                  <button
                    onClick={() => onNavigate("transactions")}
                    style={{ width: "100%", marginTop: 10, padding: "7px", borderRadius: 8, border: `1px solid ${C.gray200}`, background: "none", color: C.gray500, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.green; e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = C.green; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.gray500; e.currentTarget.style.borderColor = C.gray200; }}
                  >
                    +{metrics.pending - 3} more · View All →
                  </button>
                )}
              </>
            )}
          </SideCard>

          {/* Navigate: Users (SA/AD only) */}
          {isSAAD && (
            <NavCard
              icon="👥" label="Total Users"
              value={loading ? "—" : users.length}
              subLabel="system users"
              accent={C.navy}
              onClick={() => onNavigate("user-management")}
              loading={loading}
            />
          )}

          {/* Users snapshot (SA/AD only) */}
          {isSAAD && (
            <SideCard title="User Snapshot" icon="👤">
              {loading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 72 }}>
                  <div style={{ width: 18, height: 18, border: `2px solid ${C.gray100}`, borderTop: `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                </div>
              ) : recentUsers.length === 0 ? (
                <div style={{ textAlign: "center", color: C.gray400, fontSize: 12, padding: "16px 0" }}>No users found</div>
              ) : (
                <>
                  {recentUsers.map((user, i) => {
                    const isLast   = i === recentUsers.length - 1;
                    const rm       = ROLE_META[user.role_id] || ROLE_META[user.role] || { label: user.role || "User", color: C.gray400 };
                    const initials = (user.full_name || user.email || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                    return (
                      <div key={user.id} style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: isLast ? 0 : 10, marginBottom: isLast ? 0 : 10, borderBottom: isLast ? "none" : `1px solid ${C.gray100}` }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: C.navy + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.navy, flexShrink: 0 }}>
                          {initials}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.full_name || user.email || "—"}</div>
                          <div style={{ fontSize: 10, color: C.gray400, marginTop: 1 }}>{user.cds_number || "—"}</div>
                        </div>
                        <span style={{ background: rm.color + "18", color: rm.color, border: `1px solid ${rm.color}25`, borderRadius: 20, padding: "2px 7px", fontSize: 9, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {rm.label}
                        </span>
                      </div>
                    );
                  })}
                  {users.length > 4 && (
                    <button
                      onClick={() => onNavigate("user-management")}
                      style={{ width: "100%", marginTop: 10, padding: "7px", borderRadius: 8, border: `1px solid ${C.gray200}`, background: "none", color: C.gray500, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = C.navy; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.gray500; e.currentTarget.style.borderColor = C.gray200; }}
                    >
                      +{users.length - 4} more · View All →
                    </button>
                  )}
                </>
              )}
            </SideCard>
          )}
        </div>
      </div>
    </div>
  );
}
