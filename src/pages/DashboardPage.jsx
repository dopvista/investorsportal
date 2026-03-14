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

// ── Days between two dates ─────────────────────────────────────────
const daysBetween = (dateStr) => {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
};

// ── Company accent colors ──────────────────────────────────────────
const CHART_COLORS = [
  "#3b82f6", C.green, "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16",
];

// ── Shared table header / cell ─────────────────────────────────────
function Th({ children }) {
  return (
    <th style={{
      padding: "8px 12px", textAlign: "left",
      fontWeight: 700, fontSize: 10, color: C.gray400,
      textTransform: "uppercase", letterSpacing: "0.05em",
      borderBottom: `1px solid ${C.gray200}`,
      background: C.gray50, whiteSpace: "nowrap",
    }}>{children}</th>
  );
}
function Td({ children, bold, color, small }) {
  return (
    <td style={{
      padding: "9px 12px",
      fontWeight: bold ? 700 : 400,
      color: color || C.text,
      fontSize: small ? 11 : 13,
    }}>{children}</td>
  );
}

// ── Colored badge ──────────────────────────────────────────────────
function Badge({ value, positive }) {
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
}

// ── Snapshot card (top strip) ──────────────────────────────────────
function SnapCard({ label, value, sub, dark, accent, expandable, expanded, onToggle, loading, children }) {
  return (
    <div style={{
      background: dark ? "linear-gradient(135deg, #0B1F3A 0%, #1e3a5f 100%)" : C.white,
      border: `1.5px solid ${expanded ? (accent || C.green) : (dark ? "#1e3a5f" : C.gray200)}`,
      borderRadius: 14,
      overflow: "hidden",
      boxShadow: expanded ? `0 4px 20px ${accent || C.green}22` : "0 1px 4px rgba(0,0,0,0.04)",
      transition: "border-color 0.18s, box-shadow 0.18s",
    }}>
      <div
        onClick={expandable ? onToggle : undefined}
        style={{
          padding: "16px 18px",
          cursor: expandable ? "pointer" : "default",
          userSelect: "none",
        }}
        onMouseEnter={e => { if (expandable) e.currentTarget.style.background = dark ? "rgba(255,255,255,0.04)" : C.gray50 + "80"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: dark ? "rgba(255,255,255,0.4)" : C.gray400, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            {label}
          </div>
          {expandable && (
            <span style={{
              fontSize: 12, color: dark ? "rgba(255,255,255,0.35)" : C.gray400,
              display: "inline-block",
              transform: expanded ? "rotate(180deg)" : "none",
              transition: "transform 0.2s",
            }}>▾</span>
          )}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: dark ? C.white : C.text, lineHeight: 1, marginBottom: 5 }}>
          {loading ? <span style={{ fontSize: 14, color: dark ? "rgba(255,255,255,0.2)" : C.gray300 }}>—</span> : value}
        </div>
        <div style={{ fontSize: 11, color: dark ? "rgba(255,255,255,0.3)" : C.gray400 }}>{sub}</div>
      </div>

      {/* Expand panel */}
      {expandable && (
        <div style={{ maxHeight: expanded ? "800px" : 0, overflow: "hidden", transition: "max-height 0.3s ease" }}>
          <div style={{ borderTop: `1px solid ${dark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operational stat card ──────────────────────────────────────────
function StatCard({ icon, label, value, subLabel, accent, onClick, active, navigates, loading }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: C.white,
        border: `1.5px solid ${active ? accent : C.gray200}`,
        borderRadius: 14, padding: "16px 18px",
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.18s ease",
        position: "relative", overflow: "hidden",
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
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: active ? accent : "transparent", borderRadius: "14px 14px 0 0", transition: "background 0.18s" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 11, background: accent + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19 }}>
          {icon}
        </div>
        {navigates && <span style={{ fontSize: 13, color: C.gray400, marginTop: 2 }}>→</span>}
        {!navigates && onClick && (
          <span style={{ fontSize: 12, color: active ? accent : C.gray400, marginTop: 2, display: "inline-block", transform: active ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1 }}>
        {loading ? <span style={{ fontSize: 14, color: C.gray300 }}>—</span> : value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.gray500, marginTop: 5 }}>{label}</div>
      {subLabel && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{subLabel}</div>}
    </div>
  );
}

// ── Expand panel wrapper (for stat cards) ─────────────────────────
function ExpandPanel({ title, onClose, children }) {
  return (
    <div style={{ background: C.white, border: `1.5px solid ${C.gray200}`, borderRadius: 14, padding: "20px 24px", marginBottom: 20, animation: "dashFadeDown 0.2s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{title}</div>
        <button onClick={onClose} style={{ background: C.gray100, border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 13, color: C.gray500, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>
      {children}
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "28px 0" }}>
      <div style={{ width: 22, height: 22, border: `3px solid ${C.gray100}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────
function Empty({ msg }) {
  return <div style={{ textAlign: "center", color: C.gray400, fontSize: 13, padding: "24px 0" }}>{msg}</div>;
}

// ── Main DashboardPage ─────────────────────────────────────────────
export default function DashboardPage({ profile, role, session, showToast, onNavigate }) {
  const [portfolio,    setPortfolio]    = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [userCount,    setUserCount]    = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [expanded,     setExpanded]     = useState(null); // "companies" | "realized" | null

  const isSAAD = ["SA", "AD"].includes(role);

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
        const [port, txns, users] = await Promise.all([
          sbGetPortfolio(profile?.cds_number).catch(() => []),
          sbGetTransactions().catch(() => []),
          isSAAD ? sbGetAllUsers().catch(() => []) : Promise.resolve(null),
        ]);
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

  // ── Core metrics ─────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const pending   = myTxns.filter(t => t.status === "pending").length;
    const total     = myTxns.length;

    let totalValue = 0, totalInvested = 0;

    // ── Per-company computation ──────────────────────────────────
    const companyMetrics = portfolio.map((company, idx) => {
      const verifiedTxns = myTxns.filter(
        t => t.company_id === company.id && t.status === "verified"
      );

      // Separate buys and sells
      const buyTxns  = verifiedTxns.filter(t => (t.transaction_type || t.type || "buy").toLowerCase() !== "sell");
      const sellTxns = verifiedTxns.filter(t => (t.transaction_type || t.type || "buy").toLowerCase() === "sell");

      // Net open position (buy - sell)
      let netShares = 0, buyShares = 0, buyInvested = 0;
      buyTxns.forEach(t => {
        const shares = Number(t.shares || t.quantity || 0);
        const price  = Number(t.price  || t.unit_price || 0);
        netShares   += shares;
        buyShares   += shares;
        buyInvested += shares * price;
      });
      sellTxns.forEach(t => {
        netShares -= Number(t.shares || t.quantity || 0);
      });

      const avgCost      = buyShares > 0 ? buyInvested / buyShares : 0;
      const currentPrice = Number(company.cds_price || 0);
      const marketValue  = netShares > 0 ? netShares * currentPrice : 0;
      const totalCost    = netShares > 0 ? netShares * avgCost      : 0; // cost of open position
      const unrealizedGL = marketValue - totalCost;
      const returnPct    = totalCost > 0 ? (unrealizedGL / totalCost) * 100 : 0;
      const color        = CHART_COLORS[idx % CHART_COLORS.length];

      // Earliest buy date → days held
      const dates     = buyTxns.map(t => t.date || t.created_at).filter(Boolean).sort();
      const daysHeld  = dates.length > 0 ? daysBetween(dates[0]) : null;

      // Realized trades for this company
      const realizedTrades = sellTxns.map(t => {
        const soldShares   = Number(t.shares || t.quantity || 0);
        const salePrice    = Number(t.price  || t.unit_price || 0);
        const costBasis    = soldShares * avgCost;
        const saleProceeds = soldShares * salePrice;
        const realizedGL   = saleProceeds - costBasis;
        const realRetPct   = costBasis > 0 ? (realizedGL / costBasis) * 100 : 0;
        return { soldShares, costBasis, saleProceeds, realizedGL, realRetPct, date: t.date || t.created_at };
      });

      const totalRealizedGL    = realizedTrades.reduce((s, r) => s + r.realizedGL, 0);
      const totalSaleProceeds  = realizedTrades.reduce((s, r) => s + r.saleProceeds, 0);
      const totalCostBasis     = realizedTrades.reduce((s, r) => s + r.costBasis, 0);
      const totalSharesSold    = realizedTrades.reduce((s, r) => s + r.soldShares, 0);

      totalValue    += marketValue;
      totalInvested += totalCost;

      return {
        id: company.id, name: company.name, color,
        netShares, avgCost, currentPrice,
        marketValue, totalCost,
        unrealizedGL, returnPct, daysHeld,
        positionCount: buyTxns.length,       // number of individual buy transactions
        realizedTrades,
        totalRealizedGL, totalSaleProceeds,
        totalCostBasis, totalSharesSold,
        prevPrice: Number(company.cds_previous_price || 0),
      };
    });

    const withWeights = companyMetrics.map(c => ({
      ...c,
      // Market-value weight (for holdings table)
      weight: totalValue > 0 ? (c.marketValue / totalValue) * 100 : 0,
      // Cost-based weight (for active positions expand)
      costWeight: totalInvested > 0 ? (c.totalCost / totalInvested) * 100 : 0,
    }));

    const totalGainLoss  = totalValue - totalInvested;
    const totalReturnPct = totalInvested > 0 ? (totalGainLoss / totalInvested) * 100 : 0;
    const hasFinancials  = withWeights.some(c => c.currentPrice > 0 && c.netShares > 0);
    const activeCompanies = withWeights.filter(c => c.netShares > 0 || c.marketValue > 0);

    // Realized summary across all companies
    const totalRealizedGL   = withWeights.reduce((s, c) => s + c.totalRealizedGL, 0);
    const totalSaleProceeds = withWeights.reduce((s, c) => s + c.totalSaleProceeds, 0);
    const totalCostBasis    = withWeights.reduce((s, c) => s + c.totalCostBasis, 0);
    const totalSharesSold   = withWeights.reduce((s, c) => s + c.totalSharesSold, 0);
    const hasRealized       = withWeights.some(c => c.realizedTrades.length > 0);

    // Total active positions (sum of buy transaction counts)
    const totalActivePositions = activeCompanies.reduce((s, c) => s + c.positionCount, 0);

    // Average days held (weighted by shares)
    const totalSharesHeld  = activeCompanies.reduce((s, c) => s + c.netShares, 0);
    const avgDaysHeld      = totalSharesHeld > 0
      ? Math.round(activeCompanies.reduce((s, c) => s + (c.daysHeld ?? 0) * c.netShares, 0) / totalSharesHeld)
      : null;

    return {
      pending, total,
      totalCompanies: portfolio.length,
      totalValue, totalInvested, totalGainLoss, totalReturnPct,
      companyMetrics: activeCompanies,
      allPortfolio:   withWeights,
      hasFinancials,
      totalRealizedGL, totalSaleProceeds, totalCostBasis, totalSharesSold,
      hasRealized,
      totalActivePositions,
      avgDaysHeld,
    };
  }, [portfolio, myTxns]);

  const toggleExpand = useCallback((key) => {
    setExpanded(prev => prev === key ? null : key);
  }, []);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <style>{`
        @keyframes spin         { to { transform: rotate(360deg); } }
        @keyframes dashFadeDown { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      {/* ════════════════════════════════════════════════════════════
          1. SNAPSHOT STRIP — 5 cards
          Portfolio Value · Invested · Gain/Loss · Return · Realized
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr 1fr", gap: 14, marginBottom: 20 }}>

        {/* 1a — Portfolio Value (dark) */}
        <SnapCard
          label="Portfolio Value" dark loading={loading}
          value={metrics.hasFinancials ? fmtShort(metrics.totalValue) : `${metrics.total} txns`}
          sub={metrics.hasFinancials ? "Current market value (TZS)" : "Set prices to compute value"}
        />

        {/* 1b — Total Invested */}
        <SnapCard
          label="Total Invested" loading={loading}
          value={metrics.totalInvested > 0 ? fmtShort(metrics.totalInvested) : "—"}
          sub="Capital deployed"
        />

        {/* 1c — Total Gain / Loss */}
        <SnapCard
          label="Total Gain / Loss" loading={loading}
          value={metrics.hasFinancials
            ? (metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)
            : "—"}
          sub={metrics.hasFinancials
            ? `${metrics.avgDaysHeld ? `avg ${metrics.avgDaysHeld} days held` : "unrealized"}`
            : "Set prices in Portfolio"}
          accent={metrics.totalGainLoss >= 0 ? C.green : C.red}
        />

        {/* 1d — Total Return */}
        <SnapCard
          label="Total Return" loading={loading}
          value={metrics.hasFinancials
            ? (metrics.totalReturnPct >= 0 ? "+" : "") + metrics.totalReturnPct.toFixed(2) + "%"
            : "—"}
          sub="Overall performance"
          accent={metrics.totalReturnPct >= 0 ? C.green : C.red}
        />

        {/* 1e — Realized Gains (expandable) */}
        <SnapCard
          label="Realized Gains" loading={loading}
          value={metrics.hasRealized
            ? (metrics.totalRealizedGL >= 0 ? "+" : "") + fmtShort(metrics.totalRealizedGL)
            : "—"}
          sub={metrics.hasRealized ? "From closed positions" : "No closed positions yet"}
          accent={C.green}
          expandable={metrics.hasRealized}
          expanded={expanded === "realized"}
          onToggle={() => toggleExpand("realized")}
        >
          {/* Realized trades expand — per company */}
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Company","Shares Sold","Cost of Shares","Sale Proceeds","Realized Gain / Loss","Return %"].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {metrics.allPortfolio
                  .filter(c => c.realizedTrades.length > 0)
                  .map((c, i, arr) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                      <Td bold>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                          {c.name}
                        </div>
                      </Td>
                      <Td>{fmt(c.totalSharesSold)}</Td>
                      <Td>{fmtShort(c.totalCostBasis)}</Td>
                      <Td>{fmtShort(c.totalSaleProceeds)}</Td>
                      <Td bold color={c.totalRealizedGL >= 0 ? C.green : C.red}>
                        {(c.totalRealizedGL >= 0 ? "+" : "") + fmtShort(c.totalRealizedGL)}
                      </Td>
                      <Td>
                        <Badge
                          value={(c.totalCostBasis > 0 ? ((c.totalRealizedGL / c.totalCostBasis) * 100) : 0).toFixed(2) + "%"}
                          positive={c.totalRealizedGL >= 0}
                        />
                      </Td>
                    </tr>
                  ))}
              </tbody>
              {/* Totals row */}
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                  <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text }}>{fmt(metrics.totalSharesSold)}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text }}>{fmtShort(metrics.totalCostBasis)}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text }}>{fmtShort(metrics.totalSaleProceeds)}</td>
                  <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalRealizedGL >= 0 ? C.green : C.red }}>
                    {(metrics.totalRealizedGL >= 0 ? "+" : "") + fmtShort(metrics.totalRealizedGL)}
                  </td>
                  <td style={{ padding: "9px 12px" }}>
                    <Badge
                      value={(metrics.totalCostBasis > 0 ? ((metrics.totalRealizedGL / metrics.totalCostBasis) * 100) : 0).toFixed(2) + "%"}
                      positive={metrics.totalRealizedGL >= 0}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </SnapCard>
      </div>

      {/* ════════════════════════════════════════════════════════════
          2. OPERATIONAL CARDS — Companies (expand) · Pending · Users
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isSAAD ? "1fr 1fr 1fr" : "1fr 1fr",
        gap: 14,
        marginBottom: expanded === "companies" ? 14 : 22,
      }}>
        <StatCard
          icon="🏢" label="Companies"
          value={loading ? "—" : metrics.totalCompanies}
          subLabel={`${metrics.totalActivePositions} active positions`}
          accent={C.navy}
          onClick={() => toggleExpand("companies")}
          active={expanded === "companies"}
          loading={loading}
        />
        <StatCard
          icon="⏳" label="Pending Transactions"
          value={loading ? "—" : metrics.pending}
          subLabel={metrics.pending > 0 ? "awaiting action" : "all clear"}
          accent="#f59e0b"
          onClick={() => onNavigate("transactions")}
          navigates loading={loading}
        />
        {isSAAD && (
          <StatCard
            icon="👥" label="Total Users"
            value={loading ? "—" : (userCount ?? "—")}
            subLabel="system users"
            accent={C.navy}
            onClick={() => onNavigate("user-management")}
            navigates loading={loading}
          />
        )}
      </div>

      {/* ── Companies expand — Active positions per company ─────── */}
      {expanded === "companies" && (
        <ExpandPanel title="🏢 Active Positions" onClose={() => setExpanded(null)}>
          {loading ? <Spinner /> : metrics.companyMetrics.length === 0 ? (
            <Empty msg="No active positions found." />
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Company","Total Shares","Positions","Total Cost","% Weight","Unrealized Gain / Loss","Status"].map(h => <Th key={h}>{h}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {metrics.companyMetrics.map((c, i) => (
                    <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                      <Td bold>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                          {c.name}
                        </div>
                      </Td>
                      <Td>{fmt(c.netShares)}</Td>
                      <Td>
                        <span style={{ background: C.navy + "12", color: C.navy, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                          {c.positionCount}
                        </span>
                      </Td>
                      <Td>{c.totalCost > 0 ? fmtShort(c.totalCost) : "—"}</Td>
                      <Td>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 44, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{ width: `${Math.min(c.costWeight, 100)}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                          </div>
                          <span style={{ fontSize: 11, color: C.gray500 }}>{c.costWeight.toFixed(1)}%</span>
                        </div>
                      </Td>
                      <Td bold color={c.unrealizedGL >= 0 ? C.green : C.red}>
                        {c.unrealizedGL !== 0
                          ? (c.unrealizedGL >= 0 ? "+" : "") + fmtShort(c.unrealizedGL)
                          : "—"}
                      </Td>
                      <Td>
                        <span style={{ background: "#f0fdf4", color: C.green, border: `1px solid ${C.green}25`, borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>
                          Active
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${C.gray200}`, background: C.gray50 }}>
                    <td colSpan={2} style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: C.text }}>TOTAL</td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text }}>{metrics.totalActivePositions}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.text }}>{fmtShort(metrics.totalInvested)}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, fontSize: 13, color: C.gray400 }}>100%</td>
                    <td style={{ padding: "9px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalGainLoss >= 0 ? C.green : C.red }}>
                      {(metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </ExpandPanel>
      )}

      {/* ════════════════════════════════════════════════════════════
          3. FULL-WIDTH HOLDINGS TABLE
          Company · Net Shares · Avg Cost · Current Price ·
          Market Value · Gain/Loss · Return % · Days Held · Weight
      ═══════════════════════════════════════════════════════════════ */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.gray100}`, background: C.gray50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: C.text }}>📋 Top Holdings by Market Value</div>
          <div style={{ fontSize: 11, color: C.gray400 }}>
            {metrics.hasFinancials ? `${metrics.companyMetrics.length} companies · total ${fmtShort(metrics.totalValue)}` : "Set prices in Portfolio to compute values"}
          </div>
        </div>

        {loading ? <Spinner /> : metrics.companyMetrics.length === 0 ? (
          <Empty msg="No holdings found. Add transactions in the Portfolio page." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Company","Net Shares","Avg Cost","Current Price","Market Value","Gain / Loss","Return %","Days Held","Weight"].map(h => <Th key={h}>{h}</Th>)}
                </tr>
              </thead>
              <tbody>
                {metrics.companyMetrics.map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 ? C.gray50 + "60" : "transparent" }}>
                    <Td bold>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                        {c.name}
                      </div>
                    </Td>
                    <Td>{fmt(c.netShares)}</Td>
                    <Td>{c.avgCost > 0 ? fmt(c.avgCost) : "—"}</Td>
                    <Td bold color={c.currentPrice > 0 ? C.green : C.gray400}>{c.currentPrice > 0 ? fmt(c.currentPrice) : "—"}</Td>
                    <Td bold>{c.marketValue > 0 ? fmtShort(c.marketValue) : "—"}</Td>
                    <Td bold color={c.unrealizedGL >= 0 ? C.green : C.red}>
                      {c.unrealizedGL !== 0 ? (c.unrealizedGL >= 0 ? "+" : "") + fmtShort(c.unrealizedGL) : "—"}
                    </Td>
                    <Td>
                      {c.returnPct !== 0
                        ? <Badge value={(c.returnPct >= 0 ? "+" : "") + c.returnPct.toFixed(2) + "%"} positive={c.returnPct >= 0} />
                        : "—"}
                    </Td>
                    <Td color={C.gray500} small>{c.daysHeld !== null ? `${c.daysHeld}d` : "—"}</Td>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 50, height: 5, background: C.gray100, borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
                          <div style={{ width: `${Math.min(c.weight, 100)}%`, height: "100%", background: c.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                        </div>
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
                  <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: metrics.totalGainLoss >= 0 ? C.green : C.red }}>
                    {(metrics.totalGainLoss >= 0 ? "+" : "") + fmtShort(metrics.totalGainLoss)}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <Badge
                      value={(metrics.totalReturnPct >= 0 ? "+" : "") + metrics.totalReturnPct.toFixed(2) + "%"}
                      positive={metrics.totalReturnPct >= 0}
                    />
                  </td>
                  <td style={{ padding: "10px 12px", fontSize: 11, color: C.gray400 }}>
                    {metrics.avgDaysHeld !== null ? `avg ${metrics.avgDaysHeld}d` : "—"}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 800, fontSize: 13, color: C.gray400 }}>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
