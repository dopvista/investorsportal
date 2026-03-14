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

// ── Donut chart (pure SVG, no dependencies) ────────────────────────
function DonutChart({ segments, size = 130, thickness = 24 }) {
  const total = segments.reduce((s, seg) => s + (seg.value || 0), 0);
  const r     = (size - thickness) / 2;
  const cx    = size / 2;
  const cy    = size / 2;
  const circ  = 2 * Math.PI * r;

  if (total === 0) {
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.gray100} strokeWidth={thickness} />
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize="10" fill={C.gray400} fontFamily="inherit">
          No data
        </text>
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
      <circle
        key={i} cx={cx} cy={cy} r={r}
        fill="none" stroke={seg.color} strokeWidth={thickness}
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

// ── Stat card ──────────────────────────────────────────────────────
function StatCard({ icon, label, value, subLabel, accent, onClick, active, navigates, loading }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1.5px solid ${active ? accent : C.gray200}`,
        borderRadius: 14,
        padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.18s ease",
        position: "relative",
        overflow: "hidden",
        boxShadow: active ? `0 4px 20px ${accent}22` : "0 1px 4px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow   = `0 4px 20px ${accent}22`;
        e.currentTarget.style.transform   = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        if (!onClick) return;
        e.currentTarget.style.borderColor = active ? accent : C.gray200;
        e.currentTarget.style.boxShadow   = active ? `0 4px 20px ${accent}22` : "0 1px 4px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform   = "none";
      }}
    >
      {/* Top accent bar */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: active ? accent : "transparent",
        borderRadius: "14px 14px 0 0",
        transition: "background 0.18s",
      }} />

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: accent + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 19,
        }}>
          {icon}
        </div>
        {navigates && <span style={{ fontSize: 13, color: C.gray400, marginTop: 2 }}>→</span>}
        {!navigates && onClick && (
          <span style={{
            fontSize: 12, color: active ? accent : C.gray400,
            marginTop: 2,
            display: "inline-block",
            transform: active ? "rotate(180deg)" : "none",
            transition: "transform 0.2s",
          }}>▾</span>
        )}
      </div>

      <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1 }}>
        {loading ? <span style={{ fontSize: 14, color: C.gray300 }}>—</span> : value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginTop: 5 }}>{label}</div>
      {subLabel && (
        <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{subLabel}</div>
      )}
    </div>
  );
}

// ── Expand panel wrapper ───────────────────────────────────────────
function ExpandPanel({ title, onClose, children }) {
  return (
    <div style={{
      background: C.white,
      border: `1.5px solid ${C.gray200}`,
      borderRadius: 14,
      padding: "20px 24px",
      marginBottom: 20,
      animation: "dashFadeDown 0.2s ease",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
        <button
          onClick={onClose}
          style={{
            background: C.gray100, border: "none", borderRadius: "50%",
            width: 28, height: 28, cursor: "pointer", fontSize: 13,
            color: C.gray500, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >✕</button>
      </div>
      {children}
    </div>
  );
}

// ── Table helpers ──────────────────────────────────────────────────
function Th({ children }) {
  return (
    <th style={{
      padding: "8px 12px", textAlign: "left",
      fontWeight: 700, fontSize: 10, color: C.gray400,
      textTransform: "uppercase", letterSpacing: "0.05em",
      borderBottom: `1px solid ${C.gray200}`,
      background: C.gray50, whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, bold, color, right }) {
  return (
    <td style={{
      padding: "10px 12px",
      fontWeight: bold ? 700 : 400,
      color: color || C.text,
      textAlign: right ? "right" : "left",
      fontSize: 13,
    }}>
      {children}
    </td>
  );
}

// ── Main DashboardPage ─────────────────────────────────────────────
export default function DashboardPage({ profile, role, session, showToast, onNavigate }) {
  const [portfolio,    setPortfolio]    = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [userCount,    setUserCount]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null); // "companies" | "portfolio" | "gain" | null

  const isSAAD   = ["SA", "AD"].includes(role);


  const myTxns = useMemo(
    () => transactions.filter(t => t.cds_number === profile?.cds_number),
    [transactions, profile?.cds_number]
  );

  // ── Fetch all data concurrently ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const jobs = [
          sbGetPortfolio(profile?.cds_number).catch(() => []),
          sbGetTransactions().catch(() => []),
          isSAAD ? sbGetAllUsers().catch(() => []) : Promise.resolve(null),
        ];
        const [port, txns, users] = await Promise.all(jobs);
        if (cancelled) return;
        setPortfolio(port  || []);
        setTransactions(txns || []);
        if (isSAAD && users) setUserCount(users.length);
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
      const verifiedTxns = myTxns.filter(
        t => t.company_id === company.id && t.status === "verified"
      );
      let netShares = 0, buyShares = 0, buyInvested = 0;
      verifiedTxns.forEach(t => {
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

  const recentTxns = useMemo(() => myTxns.slice(0, 5), [myTxns]);

  const statusSegments = useMemo(() => [
    { label: "Verified",  value: metrics.verified,  color: C.green   },
    { label: "Confirmed", value: metrics.confirmed, color: "#3b82f6" },
    { label: "Pending",   value: metrics.pending,   color: "#f59e0b" },
    { label: "Rejected",  value: metrics.rejected,  color: C.red     },
  ], [metrics]);

  const portfolioSegments = useMemo(
    () => metrics.companyMetrics
      .filter(c => c.marketValue > 0)
      .map(c => ({ label: c.name, value: c.marketValue, color: c.color })),
    [metrics.companyMetrics]
  );

  const toggleExpand = useCallback((key) => {
    setExpanded(prev => prev === key ? null : key);
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes dashFadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes dashFadeIn   { from { opacity:0; } to { opacity:1; } }
      `}</style>

      {/* ── Stat Cards ────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${isSAAD ? 5 : 4}, 1fr)`,
        gap: 14,
        marginBottom: expanded ? 14 : 22,
      }}>
        <StatCard
          icon="🏢" label="Companies" value={loading ? "—" : metrics.totalCompanies}
          subLabel="in your portfolio" accent={C.navy}
          onClick={() => toggleExpand("companies")}
          active={expanded === "companies"} loading={loading}
        />
        <StatCard
          icon="💰" label="Portfolio Value"
          value={loading ? "—" : (metrics.hasFinancials ? fmtShort(metrics.totalValue) : `${metrics.total}`)}
          subLabel={metrics.hasFinancials ? "Market value (TZS)" : "Total transactions"}
          accent={C.green}
          onClick={() => toggleExpand("portfolio")}
          active={expanded === "portfolio"} loading={loading}
        />
        <StatCard
          icon={metrics.totalGainLoss >= 0 ? "📈" : "📉"} label="Gain / Loss"
          value={loading ? "—" : (metrics.hasFinancials ? (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss) : "—")}
          subLabel={metrics.hasFinancials ? `${metrics.totalReturnPct >= 0 ? "+" : ""}${metrics.totalReturnPct.toFixed(2)}% return` : "Set prices to compute"}
          accent={metrics.totalGainLoss >= 0 ? C.green : C.red}
          onClick={metrics.hasFinancials ? () => toggleExpand("gain") : undefined}
          active={expanded === "gain"} loading={loading}
        />
        <StatCard
          icon="⏳" label="Pending"
          value={loading ? "—" : metrics.pending}
          subLabel={metrics.pending > 0 ? "awaiting action" : "all clear"}
          accent="#f59e0b"
          onClick={() => onNavigate("transactions")}
          navigates loading={loading}
        />
        {isSAAD && (
          <StatCard
            icon="👥" label="Users"
            value={loading ? "—" : (userCount ?? "—")}
            subLabel="system users" accent={C.navy}
            onClick={() => onNavigate("user-management")}
            navigates loading={loading}
          />
        )}
      </div>

      {/* ── Expand Panels ─────────────────────────────────────────── */}
      {expanded === "companies" && (
        <ExpandPanel title="🏢 Portfolio Holdings" onClose={() => setExpanded(null)}>
          {portfolio.length === 0 ? (
            <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "24px 0" }}>No companies in your portfolio yet.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Company","Current Price","Prev. Price","Change","Last Updated"].map(h => <Th key={h}>{h}</Th>)}</tr>
                </thead>
                <tbody>
                  {metrics.allPortfolio.map((c, i) => {
                    const change = c.prevPrice > 0 ? ((c.currentPrice - c.prevPrice) / c.prevPrice) * 100 : null;
                    return (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                        <Td bold><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />{c.name}</div></Td>
                        <Td bold color={c.currentPrice > 0 ? C.green : C.gray400}>{c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}</Td>
                        <Td color={C.gray500}>{c.prevPrice > 0 ? fmt(c.prevPrice) : "—"}</Td>
                        <Td>{change !== null ? <span style={{ color: change >= 0 ? C.green : C.red, fontWeight: 700, fontSize: 13 }}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(2)}%</span> : "—"}</Td>
                        <Td><span style={{ fontSize: 11, color: C.gray400 }}>{c.updatedAt ? new Date(c.updatedAt).toLocaleDateString("en-GB") : "—"}</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ExpandPanel>
      )}

      {expanded === "portfolio" && (
        <ExpandPanel title="💰 Portfolio Breakdown" onClose={() => setExpanded(null)}>
          {metrics.companyMetrics.length === 0 ? (
            <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "24px 0" }}>
              {portfolio.length === 0 ? "No companies in your portfolio yet." : "Set current prices in Portfolio page to see value breakdown."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Company","Net Shares","Avg Cost","Current Price","Market Value","Gain/Loss","Return %","Weight"].map(h => <Th key={h}>{h}</Th>)}</tr>
                </thead>
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
                          <div style={{ width: 50, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}><div style={{ width: `${c.weight}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 0.5s ease" }} /></div>
                          <span style={{ fontSize: 11, color: C.gray500 }}>{c.weight.toFixed(1)}%</span>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                    <td colSpan={4} style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>{fmtShort(metrics.totalValue)}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalGainLoss >= 0 ? C.green : C.red }}>{(metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)}</td>
                    <td style={{ padding: "10px 12px" }}><span style={{ background: metrics.totalReturnPct >= 0 ? "#f0fdf4" : "#fef2f2", color: metrics.totalReturnPct >= 0 ? C.green : C.red, padding: "2px 8px", borderRadius: 8, fontWeight: 800, fontSize: 11 }}>{(metrics.totalReturnPct >= 0 ? "+" : "") + metrics.totalReturnPct.toFixed(2)}%</span></td>
                    <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.gray400 }}>100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </ExpandPanel>
      )}

      {expanded === "gain" && (
        <ExpandPanel title="📈 Gain / Loss Analysis" onClose={() => setExpanded(null)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Total Invested", value: fmtShort(metrics.totalInvested), icon: "💵", color: C.navy },
              { label: "Current Value",  value: fmtShort(metrics.totalValue),    icon: "📊", color: "#3b82f6" },
              { label: "Gain / Loss",
                value: (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss),
                icon: metrics.totalGainLoss >= 0 ? "📈" : "📉",
                color: metrics.totalGainLoss >= 0 ? C.green : C.red },
            ].map(item => (
              <div key={item.label} style={{ background: item.color + "0d", border: `1px solid ${item.color}22`, borderRadius: 12, padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 11, color: C.gray400, marginTop: 5 }}>{item.label}</div>
              </div>
            ))}
          </div>
          {metrics.companyMetrics.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>{["Company","Invested (TZS)","Market Value","Gain / Loss","Return %"].map(h => <Th key={h}>{h}</Th>)}</tr>
                </thead>
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
            <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "16px 0" }}>Set prices in Portfolio page to see per-company breakdown.</div>
          )}
        </ExpandPanel>
      )}

      {/* ── Bottom row ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 16 }}>

        {/* Transaction status chart */}
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "20px" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.text, marginBottom: 18 }}>📊 Transaction Status</div>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 130 }}>
              <div style={{ width: 24, height: 24, border: `3px solid ${C.gray100}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ flexShrink: 0 }}>
                <DonutChart segments={metrics.total > 0 ? statusSegments : [{ value: 1, color: C.gray100 }]} size={130} thickness={24} />
              </div>
              <div style={{ flex: 1 }}>
                {statusSegments.map(seg => (
                  <div key={seg.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
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
            </div>
          )}

          {!loading && portfolioSegments.length > 0 && (
            <>
              <div style={{ height: 1, background: C.gray100, margin: "18px 0" }} />
              <div style={{ fontWeight: 700, fontSize: 12, color: C.gray500, marginBottom: 12 }}>Portfolio Weight</div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <DonutChart segments={portfolioSegments} size={100} thickness={20} />
                <div style={{ flex: 1 }}>
                  {portfolioSegments.map(seg => (
                    <div key={seg.label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: seg.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: C.gray500, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{seg.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.gray500 }}>{metrics.totalValue > 0 ? ((seg.value / metrics.totalValue) * 100).toFixed(1) : 0}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Recent transactions */}
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>🕐 Recent Transactions</div>
            <button
              onClick={() => onNavigate("transactions")}
              style={{ background: "none", border: `1px solid ${C.gray200}`, borderRadius: 8, padding: "4px 12px", fontSize: 11, color: C.gray500, cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.green; e.currentTarget.style.color = C.white; e.currentTarget.style.borderColor = C.green; }}
              onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = C.gray500; e.currentTarget.style.borderColor = C.gray200; }}
            >
              View All →
            </button>
          </div>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160 }}>
              <div style={{ width: 24, height: 24, border: `3px solid ${C.gray100}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            </div>
          ) : recentTxns.length === 0 ? (
            <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "40px 0" }}>No transactions recorded yet.</div>
          ) : (
            recentTxns.map((txn, i) => {
              const company = portfolio.find(c => c.id === txn.company_id);
              const isLast  = i === recentTxns.length - 1;
              return (
                <div key={txn.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 0", borderBottom: isLast ? "none" : `1px solid ${C.gray100}` }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: C.navy + "10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>📋</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {company?.name || "Unknown Company"}
                    </div>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
                      {txn.date ? new Date(txn.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </div>
                  </div>
                  <StatusBadge status={txn.status} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
