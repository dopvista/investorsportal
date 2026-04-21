// ── src/pages/ReportsPage.jsx ─────────────────────────────────────
// Reports module — Capital Markets section with report cards.
import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useTheme, useIsMobile, ModalShell, Btn } from "../components/ui";
import { Icon } from "../lib/icons";
import { sbGetPortfolioAsAt, sbGetTransactions, sbGetFifoSellDetails, sbGetDividends, sbGetDividendByCompany, sbGetAllCompanies } from "../lib/supabase";
import { generatePortfolioStatementPDFv2, generatePortfolioStatementExcelv2, generateTransactionHistoryPDF, generateTransactionHistoryExcel, generateGainLossPDF, generateGainLossExcel, generateDividendIncomePDF, generateDividendIncomeExcel } from "../lib/reports";
import logo from "../assets/logo.jpg";

// ── Report card definitions ──────────────────────────────────────
const CAPITAL_MARKET_REPORTS = [
  { id: "portfolio_statement", title: "Portfolio Statement", desc: "Current holdings, cost basis, market value and unrealized gain/loss", icon: "briefcase", ready: true },
  { id: "transaction_history", title: "Transaction History", desc: "Buy/sell records filtered by type, company, broker and status", icon: "fileText", ready: true },
  { id: "gain_loss",           title: "Gain/Loss Report",    desc: "Realized gains and losses by company (FIFO)", icon: "trendingUp", ready: true },
  { id: "dividend_income",     title: "Dividend Income",     desc: "Dividends received, withholding tax and net income", icon: "dollarSign", ready: true },
  { id: "fee_summary",         title: "Fee Summary",         desc: "Broker and regulatory fees breakdown", icon: "creditCard", ready: false },
  { id: "tax_report",          title: "Tax Report",          desc: "Capital gains tax and WHT summary for filing", icon: "clipboard", ready: false },
];

// ── Portfolio Statement filter config ────────────────────────────
const POSITION_OPTIONS = [
  { value: "held",    label: "Current Holdings" },
  { value: "sold",    label: "Sold" },
  { value: "all",     label: "All Positions" },
];

// ── Report Card ──────────────────────────────────────────────────
function ReportCard({ report, onClick, C, isDark }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={report.ready ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: "100%", textAlign: "left", cursor: report.ready ? "pointer" : "default",
        padding: "18px 20px", borderRadius: 14,
        border: `1.5px solid ${hover && report.ready ? C.green + "60" : C.gray200}`,
        background: hover && report.ready ? (isDark ? "rgba(0,132,61,0.06)" : "#f0fdf4") : C.white,
        transition: "all 0.15s", fontFamily: "inherit",
        opacity: report.ready ? 1 : 0.5,
        display: "flex", alignItems: "flex-start", gap: 14,
      }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 11,
        background: isDark ? "rgba(0,132,61,0.12)" : "#D1FAE5",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <Icon name={report.icon} size={20} stroke={C.green} sw={1.8} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, marginBottom: 3 }}>
          {report.title}
          {!report.ready && <span style={{ fontSize: 10, fontWeight: 600, color: C.gray400, marginLeft: 8 }}>Coming Soon</span>}
        </div>
        <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.5 }}>{report.desc}</div>
      </div>
      {report.ready && <Icon name="chevronRight" size={16} stroke={C.gray400} />}
    </button>
  );
}

// ── Portfolio Statement Filter Modal ─────────────────────────────
function PortfolioFilterModal({ cdsNumber, cdsName, cdsList, onGenerate, onClose, C, isDark, isMobile }) {
  const today = new Date().toISOString().split("T")[0];
  const [asAtDate, setAsAtDate]       = useState(today);
  const [positionType, setPositionType] = useState("held");
  const [selectedCds, setSelectedCds] = useState(cdsNumber || "");
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState("");
  const [cdsSearch, setCdsSearch]     = useState("");
  const [cdsOpen, setCdsOpen]         = useState(false);
  const cdsRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (cdsRef.current && !cdsRef.current.contains(e.target)) setCdsOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const filteredCds = useMemo(() => {
    if (!cdsList?.length) return [];
    if (!cdsSearch) return cdsList;
    const q = cdsSearch.toLowerCase();
    return cdsList.filter(c => `${c.cds_number} ${c.cds_name || ""}`.toLowerCase().includes(q));
  }, [cdsList, cdsSearch]);

  const handleGenerate = async (format = "pdf") => {
    if (!selectedCds) { setError("Please select a CDS account."); return; }
    if (!asAtDate)    { setError("Please select a date."); return; }
    setError("");
    setGenerating(true);
    try {
      await onGenerate({ cdsNumber: selectedCds, asAtDate, positionType, format });
    } catch (e) {
      setError(e.message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const selectedCdsName = useMemo(() => {
    const c = cdsList?.find(c => c.cds_number === selectedCds);
    return c?.cds_name || "";
  }, [cdsList, selectedCds]);

  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box", outline: "none" };

  return (
    <ModalShell title="Portfolio Statement" subtitle="Set parameters and generate report" onClose={onClose} maxWidth={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} style={{ minWidth: 100, justifyContent: "center" }}>Cancel</Btn>
          {!isMobile && <Btn variant="primary" onClick={() => handleGenerate("excel")} disabled={generating} icon={<Icon name="fileText" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "Excel"}
          </Btn>}
          <Btn variant="primary" onClick={() => handleGenerate("pdf")} disabled={generating} icon={<Icon name="download" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "PDF"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}

        {/* CDS Account — searchable dropdown (same pattern as TransactionFormModal) */}
        <div>
          <div style={labelStyle}>CDS Account</div>
          {cdsList?.length > 1 ? (
            <div ref={cdsRef} style={{ position: "relative" }}>
              <button type="button" onClick={() => { setCdsOpen(o => !o); setCdsSearch(""); }}
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${cdsOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
              >
                <span>{selectedCds} — {selectedCdsName || "Unnamed"}</span>
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{cdsOpen ? "▲" : "▼"}</span>
              </button>
              {cdsOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                      <input autoFocus type="text" value={cdsSearch} onChange={e => setCdsSearch(e.target.value)} placeholder="Search CDS..."
                        style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                        onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                      />
                    </div>
                  </div>
                  <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                    {filteredCds.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No CDS accounts found</div>
                      : filteredCds.map(c => {
                        const isSelected = c.cds_number === selectedCds;
                        return (
                          <button key={c.cds_number} type="button"
                            onClick={() => { setSelectedCds(c.cds_number); setCdsOpen(false); setCdsSearch(""); }}
                            style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                          >
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.cds_number} — {c.cds_name || "Unnamed"}</span>
                            {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...inputStyle, background: isDark ? C.gray100 : "#f8f9fa", color: C.gray600 }}>
              {selectedCds} {selectedCdsName ? `— ${selectedCdsName}` : ""}
            </div>
          )}
        </div>

        {/* As At Date + Position Type (one line) */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>As At Date</div>
            <input type="date" value={asAtDate} onChange={e => setAsAtDate(e.target.value)}
              max={today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Position Type</div>
            <select value={positionType} onChange={e => setPositionType(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {POSITION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Transaction History Filter Modal ─────────────────────────────
const TXN_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "Buy", label: "Purchases" },
  { value: "Sell", label: "Sales" },
];
const TXN_STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "confirmed", label: "Confirmed" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
];

function TransactionHistoryFilterModal({ cdsNumber, cdsName, cdsList, onGenerate, onClose, C, isDark, isMobile }) {
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState(today);
  const [txnType, setTxnType]   = useState("");
  const [status, setStatus]     = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [selectedCds, setSelectedCds] = useState(cdsNumber || "");
  const [allRows, setAllRows]   = useState([]);   // raw transactions for CDS+period
  const [rowsLoading, setRowsLoading] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);

  // Fetch transactions when CDS or period changes — derive filters from this
  useEffect(() => {
    if (!selectedCds) { setAllRows([]); return; }
    let cancelled = false;
    setRowsLoading(true);
    sbGetTransactions(selectedCds, {
      pageSize: 10000, page: 1, sortCol: "date", sortDir: "asc",
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    }).then(data => {
      if (cancelled) return;
      const rows = data?.rows || [];
      setAllRows(rows);
      // Set dateFrom to first transaction date on initial load
      if (!defaultsLoaded && rows.length > 0) {
        const firstDate = rows.reduce((min, t) => (t.date && t.date < min ? t.date : min), rows[0].date || "");
        if (firstDate) setDateFrom(firstDate);
        setDefaultsLoaded(true);
      }
      // Reset selections that are no longer valid
      setBrokerId(prev => {
        if (!prev) return prev;
        return rows.some(t => t.broker_id === prev) ? prev : "";
      });
      setTxnType(prev => {
        if (!prev) return prev;
        return rows.some(t => t.type === prev) ? prev : "";
      });
      setStatus(prev => {
        if (!prev) return prev;
        return rows.some(t => t.status === prev) ? prev : "";
      });
    }).catch(() => { if (!cancelled) setAllRows([]); })
      .finally(() => { if (!cancelled) setRowsLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCds, dateFrom, dateTo]);

  // Derive available brokers, types, statuses with cascading filters
  const availableBrokers = useMemo(() => {
    let rows = allRows;
    if (txnType) rows = rows.filter(t => t.type === txnType);
    if (status)  rows = rows.filter(t => t.status === status);
    const map = new Map();
    rows.forEach(t => {
      if (t.broker_id && t.broker_name && !map.has(t.broker_id))
        map.set(t.broker_id, { id: t.broker_id, broker_name: t.broker_name });
    });
    return [...map.values()].sort((a, b) => a.broker_name.localeCompare(b.broker_name));
  }, [allRows, txnType, status]);

  const availableTypes = useMemo(() => {
    let rows = allRows;
    if (brokerId) rows = rows.filter(t => t.broker_id === brokerId);
    if (status)   rows = rows.filter(t => t.status === status);
    const set = new Set(rows.map(t => t.type).filter(Boolean));
    return TXN_TYPE_OPTIONS.filter(o => !o.value || set.has(o.value));
  }, [allRows, brokerId, status]);

  const availableStatuses = useMemo(() => {
    let rows = allRows;
    if (brokerId) rows = rows.filter(t => t.broker_id === brokerId);
    if (txnType)  rows = rows.filter(t => t.type === txnType);
    const set = new Set(rows.map(t => t.status).filter(Boolean));
    return TXN_STATUS_OPTIONS.filter(o => !o.value || set.has(o.value));
  }, [allRows, brokerId, txnType]);

  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState("");
  const [cdsSearch, setCdsSearch]     = useState("");
  const [cdsOpen, setCdsOpen]         = useState(false);
  const [brokerSearch, setBrokerSearch] = useState("");
  const [brokerOpen, setBrokerOpen]     = useState(false);
  const cdsRef = useRef(null);
  const brokerRef = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (cdsRef.current && !cdsRef.current.contains(e.target)) setCdsOpen(false);
      if (brokerRef.current && !brokerRef.current.contains(e.target)) setBrokerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  const filteredCds = useMemo(() => {
    if (!cdsList?.length) return [];
    if (!cdsSearch) return cdsList;
    const q = cdsSearch.toLowerCase();
    return cdsList.filter(c => `${c.cds_number} ${c.cds_name || ""}`.toLowerCase().includes(q));
  }, [cdsList, cdsSearch]);

  const filteredBrokers = useMemo(() => {
    if (!brokerSearch) return availableBrokers;
    const q = brokerSearch.toLowerCase();
    return availableBrokers.filter(b => b.broker_name.toLowerCase().includes(q));
  }, [availableBrokers, brokerSearch]);

  const selectedCdsName = useMemo(() => {
    const c = cdsList?.find(c => c.cds_number === selectedCds);
    return c?.cds_name || "";
  }, [cdsList, selectedCds]);

  const selectedBrokerName = useMemo(() => {
    const b = availableBrokers.find(b => b.id === brokerId);
    return b?.broker_name || "";
  }, [availableBrokers, brokerId]);

  const handleGenerate = async (format = "pdf") => {
    if (!selectedCds) { setError("Please select a CDS account."); return; }
    setError("");
    setGenerating(true);
    try {
      await onGenerate({ cdsNumber: selectedCds, dateFrom, dateTo, txnType, status, brokerId, brokerName: selectedBrokerName, format });
    } catch (e) {
      setError(e.message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box", outline: "none" };

  return (
    <ModalShell title="Transaction History" subtitle="Set parameters and generate report" onClose={onClose} maxWidth={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} style={{ minWidth: 100, justifyContent: "center" }}>Cancel</Btn>
          {!isMobile && <Btn variant="primary" onClick={() => handleGenerate("excel")} disabled={generating} icon={<Icon name="fileText" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "Excel"}
          </Btn>}
          <Btn variant="primary" onClick={() => handleGenerate("pdf")} disabled={generating} icon={<Icon name="download" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "PDF"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}

        {/* CDS Account — searchable dropdown */}
        <div>
          <div style={labelStyle}>CDS Account</div>
          {cdsList?.length > 1 ? (
            <div ref={cdsRef} style={{ position: "relative" }}>
              <button type="button" onClick={() => { setCdsOpen(o => !o); setCdsSearch(""); }}
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${cdsOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
              >
                <span>{selectedCds} — {selectedCdsName || "Unnamed"}</span>
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{cdsOpen ? "▲" : "▼"}</span>
              </button>
              {cdsOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                      <input autoFocus type="text" value={cdsSearch} onChange={e => setCdsSearch(e.target.value)} placeholder="Search CDS..."
                        style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                        onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                      />
                    </div>
                  </div>
                  <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                    {filteredCds.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No CDS accounts found</div>
                      : filteredCds.map(c => {
                        const isSelected = c.cds_number === selectedCds;
                        return (
                          <button key={c.cds_number} type="button"
                            onClick={() => { setSelectedCds(c.cds_number); setCdsOpen(false); setCdsSearch(""); }}
                            style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                          >
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.cds_number} — {c.cds_name || "Unnamed"}</span>
                            {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...inputStyle, background: isDark ? C.gray100 : "#f8f9fa", color: C.gray600 }}>
              {selectedCds} {selectedCdsName ? `— ${selectedCdsName}` : ""}
            </div>
          )}
        </div>

        {/* Period: Date From + Date To (one line) */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              max={dateTo || today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              max={today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
        </div>

        {/* Broker (full width, searchable) */}
        <div>
          <div style={labelStyle}>Broker</div>
          <div ref={brokerRef} style={{ position: "relative" }}>
            <button type="button" onClick={() => { setBrokerOpen(o => !o); setBrokerSearch(""); }}
              style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${brokerOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
            >
              <span>{brokerId ? selectedBrokerName : "All Brokers"}</span>
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{brokerOpen ? "▲" : "▼"}</span>
            </button>
            {brokerOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                    <input autoFocus type="text" value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)} placeholder="Search broker..."
                      style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                      onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                    />
                  </div>
                </div>
                <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                  {/* All Brokers option */}
                  <button type="button"
                    onClick={() => { setBrokerId(""); setBrokerOpen(false); setBrokerSearch(""); }}
                    style={{ width: "100%", padding: "9px 14px", border: "none", background: !brokerId ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                    onMouseEnter={e => { if (brokerId) e.currentTarget.style.background = C.gray50; }}
                    onMouseLeave={e => { e.currentTarget.style.background = !brokerId ? C.green + "15" : "transparent"; }}
                  >
                    <span style={{ fontSize: 13, fontWeight: !brokerId ? 700 : 500, color: !brokerId ? C.green : C.text }}>All Brokers</span>
                    {!brokerId && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                  </button>
                  {rowsLoading ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>Loading...</div>
                    : filteredBrokers.length === 0 && brokerSearch ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No brokers found</div>
                    : filteredBrokers.map(b => {
                      const isSelected = b.id === brokerId;
                      return (
                        <button key={b.id} type="button"
                          onClick={() => { setBrokerId(b.id); setBrokerOpen(false); setBrokerSearch(""); }}
                          style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                        >
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{b.broker_name}</span>
                          {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Type + Status (one line) */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Type</div>
            <select value={txnType} onChange={e => setTxnType(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {availableTypes.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Status</div>
            <select value={status} onChange={e => setStatus(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {availableStatuses.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

// ── Gain/Loss Filter Modal ───────────────────────────────────────
const GL_VIEW_OPTIONS = [
  { value: "company", label: "By Company" },
  { value: "transaction", label: "By Transaction" },
];

function GainLossFilterModal({ cdsNumber, cdsName, cdsList, onGenerate, onClose, C, isDark, isMobile }) {
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState(today);
  const [glView, setGlView]           = useState("company");
  const [brokerId, setBrokerId]       = useState("");
  const [selectedCds, setSelectedCds] = useState(cdsNumber || "");
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState("");
  const [cdsSearch, setCdsSearch]     = useState("");
  const [cdsOpen, setCdsOpen]         = useState(false);
  const [brokerSearch, setBrokerSearch] = useState("");
  const [brokerOpen, setBrokerOpen]     = useState(false);
  const [sellData, setSellData]       = useState(null); // { sells, brokers } from sbGetFifoSellDetails
  const [sellsLoading, setSellsLoading] = useState(false);
  const cdsRef = useRef(null);
  const brokerRef = useRef(null);

  const isByTxn = glView === "transaction";

  // Fetch earliest sell date when CDS changes (sets default dateFrom)
  useEffect(() => {
    if (!selectedCds) return;
    let cancelled = false;
    sbGetFifoSellDetails(selectedCds, {}).then(data => {
      if (cancelled || !data?.sells?.length) return;
      const earliest = data.sells.reduce((min, s) => (s.date < min ? s.date : min), data.sells[0].date);
      if (earliest) setDateFrom(prev => prev || earliest);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedCds]);

  // Fetch sell data for broker list when By Transaction + CDS/dates change
  useEffect(() => {
    if (!isByTxn || !selectedCds) { setSellData(null); return; }
    let cancelled = false;
    setSellsLoading(true);
    sbGetFifoSellDetails(selectedCds, { dateFrom, dateTo }).then(data => {
      if (cancelled) return;
      setSellData(data);
      setBrokerId(prev => {
        if (!prev) return prev;
        return (data?.brokers || []).some(b => b.id === prev) ? prev : "";
      });
    }).catch(() => { if (!cancelled) setSellData(null); })
      .finally(() => { if (!cancelled) setSellsLoading(false); });
    return () => { cancelled = true; };
  }, [isByTxn, selectedCds, dateFrom, dateTo]);

  useEffect(() => {
    const handler = (e) => {
      if (cdsRef.current && !cdsRef.current.contains(e.target)) setCdsOpen(false);
      if (brokerRef.current && !brokerRef.current.contains(e.target)) setBrokerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCds = useMemo(() => {
    if (!cdsList?.length) return [];
    if (!cdsSearch) return cdsList;
    const q = cdsSearch.toLowerCase();
    return cdsList.filter(c => `${c.cds_number} ${c.cds_name || ""}`.toLowerCase().includes(q));
  }, [cdsList, cdsSearch]);

  const availableBrokers = useMemo(() => sellData?.brokers || [], [sellData]);
  const filteredBrokers = useMemo(() => {
    if (!brokerSearch) return availableBrokers;
    const q = brokerSearch.toLowerCase();
    return availableBrokers.filter(b => b.broker_name.toLowerCase().includes(q));
  }, [availableBrokers, brokerSearch]);

  const selectedCdsName = useMemo(() => {
    const c = cdsList?.find(c => c.cds_number === selectedCds);
    return c?.cds_name || "";
  }, [cdsList, selectedCds]);

  const selectedBrokerName = useMemo(() => {
    const b = availableBrokers.find(b => b.id === brokerId);
    return b?.broker_name || "";
  }, [availableBrokers, brokerId]);

  const handleGenerate = async (format = "pdf") => {
    if (!selectedCds) { setError("Please select a CDS account."); return; }
    setError("");
    setGenerating(true);
    try {
      const params = { cdsNumber: selectedCds, dateFrom, dateTo, glView, format };
      if (isByTxn) {
        params.brokerId = brokerId;
        params.brokerName = selectedBrokerName;
      }
      await onGenerate(params);
    } catch (e) {
      setError(e.message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box", outline: "none" };

  return (
    <ModalShell title="Gain/Loss Report" subtitle="Set parameters and generate report" onClose={onClose} maxWidth={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} style={{ minWidth: 100, justifyContent: "center" }}>Cancel</Btn>
          {!isMobile && <Btn variant="primary" onClick={() => handleGenerate("excel")} disabled={generating} icon={<Icon name="fileText" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "Excel"}
          </Btn>}
          <Btn variant="primary" onClick={() => handleGenerate("pdf")} disabled={generating} icon={<Icon name="download" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "PDF"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}

        {/* CDS Account — searchable dropdown */}
        <div>
          <div style={labelStyle}>CDS Account</div>
          {cdsList?.length > 1 ? (
            <div ref={cdsRef} style={{ position: "relative" }}>
              <button type="button" onClick={() => { setCdsOpen(o => !o); setCdsSearch(""); }}
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${cdsOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
              >
                <span>{selectedCds} — {selectedCdsName || "Unnamed"}</span>
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{cdsOpen ? "▲" : "▼"}</span>
              </button>
              {cdsOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                      <input autoFocus type="text" value={cdsSearch} onChange={e => setCdsSearch(e.target.value)} placeholder="Search CDS..."
                        style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                        onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                      />
                    </div>
                  </div>
                  <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                    {filteredCds.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No CDS accounts found</div>
                      : filteredCds.map(c => {
                        const isSelected = c.cds_number === selectedCds;
                        return (
                          <button key={c.cds_number} type="button"
                            onClick={() => { setSelectedCds(c.cds_number); setCdsOpen(false); setCdsSearch(""); }}
                            style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                          >
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.cds_number} — {c.cds_name || "Unnamed"}</span>
                            {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...inputStyle, background: isDark ? C.gray100 : "#f8f9fa", color: C.gray600 }}>
              {selectedCds} {selectedCdsName ? `— ${selectedCdsName}` : ""}
            </div>
          )}
        </div>

        {/* View selector */}
        <div>
          <div style={labelStyle}>View</div>
          <select value={glView} onChange={e => { setGlView(e.target.value); setBrokerId(""); }}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {GL_VIEW_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Period: Date From + Date To (both views) */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              max={dateTo || today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              max={today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
        </div>

        {/* Broker (searchable, By Transaction only) */}
        {isByTxn && (
          <>

            {/* Broker (searchable, full width) */}
            <div>
              <div style={labelStyle}>Broker</div>
              <div ref={brokerRef} style={{ position: "relative" }}>
                <button type="button" onClick={() => { setBrokerOpen(o => !o); setBrokerSearch(""); }}
                  style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${brokerOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
                >
                  <span>{brokerId ? selectedBrokerName : "All Brokers"}</span>
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{brokerOpen ? "▲" : "▼"}</span>
                </button>
                {brokerOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                    <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                        <input autoFocus type="text" value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)} placeholder="Search broker..."
                          style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                          onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                        />
                      </div>
                    </div>
                    <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                      <button type="button"
                        onClick={() => { setBrokerId(""); setBrokerOpen(false); setBrokerSearch(""); }}
                        style={{ width: "100%", padding: "9px 14px", border: "none", background: !brokerId ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                        onMouseEnter={e => { if (brokerId) e.currentTarget.style.background = C.gray50; }}
                        onMouseLeave={e => { e.currentTarget.style.background = !brokerId ? C.green + "15" : "transparent"; }}
                      >
                        <span style={{ fontSize: 13, fontWeight: !brokerId ? 700 : 500, color: !brokerId ? C.green : C.text }}>All Brokers</span>
                        {!brokerId && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                      </button>
                      {sellsLoading ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>Loading...</div>
                        : filteredBrokers.length === 0 && brokerSearch ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No brokers found</div>
                        : filteredBrokers.map(b => {
                          const isSelected = b.id === brokerId;
                          return (
                            <button key={b.id} type="button"
                              onClick={() => { setBrokerId(b.id); setBrokerOpen(false); setBrokerSearch(""); }}
                              style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                            >
                              <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{b.broker_name}</span>
                              {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

// ── Dividend Income Filter Modal ─────────────────────────────────
const DIV_VIEW_OPTIONS = [
  { value: "company", label: "By Company" },
  { value: "transaction", label: "By Transaction" },
];
const DIV_STATUS_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "declared", label: "Declared" },
  { value: "ex_date_passed", label: "Ex-Date Passed" },
  { value: "paid", label: "Paid" },
];

function DividendFilterModal({ cdsNumber, cdsName, cdsList, onGenerate, onClose, C, isDark, isMobile }) {
  const today = new Date().toISOString().split("T")[0];
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [divView, setDivView]         = useState("company");
  const [divStatus, setDivStatus]     = useState("All");
  const [divCompany, setDivCompany]   = useState("All");
  const [divCompanies, setDivCompanies] = useState([]);
  const [selectedCds, setSelectedCds] = useState(cdsNumber || "");
  const [generating, setGenerating]   = useState(false);
  const [error, setError]             = useState("");
  const [cdsSearch, setCdsSearch]     = useState("");
  const [cdsOpen, setCdsOpen]         = useState(false);
  const cdsRef = useRef(null);

  const isByTxn = divView === "transaction";

  // Load distinct companies with dividends for the selected CDS
  useEffect(() => {
    if (!selectedCds) { setDivCompanies([]); setDivCompany("All"); return; }
    sbGetDividends(selectedCds).then(rows => {
      if (!Array.isArray(rows)) return;
      const seen = new Map();
      rows.forEach(r => { if (r.company_id && r.company_name && !seen.has(r.company_id)) seen.set(r.company_id, r.company_name); });
      setDivCompanies([...seen.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      setDivCompany("All");
    }).catch(() => {});
  }, [selectedCds]);

  // No default dateFrom — shows all dividends from the beginning
  // dateTo defaults to today (set in useState above)

  useEffect(() => {
    const handler = (e) => {
      if (cdsRef.current && !cdsRef.current.contains(e.target)) setCdsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCds = useMemo(() => {
    if (!cdsList?.length) return [];
    if (!cdsSearch) return cdsList;
    const q = cdsSearch.toLowerCase();
    return cdsList.filter(c => `${c.cds_number} ${c.cds_name || ""}`.toLowerCase().includes(q));
  }, [cdsList, cdsSearch]);

  const selectedCdsName = useMemo(() => {
    const c = cdsList?.find(c => c.cds_number === selectedCds);
    return c?.cds_name || "";
  }, [cdsList, selectedCds]);

  const handleGenerate = async (format = "pdf") => {
    if (!selectedCds) { setError("Please select a CDS account."); return; }
    setError("");
    setGenerating(true);
    try {
      await onGenerate({ cdsNumber: selectedCds, divView, dateFrom, dateTo, status: isByTxn ? divStatus : "All", company: divCompany, format });
    } catch (e) {
      setError(e.message || "Failed to generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const labelStyle = { fontSize: 11, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 };
  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, fontSize: 13, fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box", outline: "none" };

  return (
    <ModalShell title="Dividend Income" subtitle="Set parameters and generate report" onClose={onClose} maxWidth={460}
      footer={
        <>
          <Btn variant="secondary" onClick={onClose} style={{ minWidth: 100, justifyContent: "center" }}>Cancel</Btn>
          {!isMobile && <Btn variant="primary" onClick={() => handleGenerate("excel")} disabled={generating} icon={<Icon name="fileText" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "Excel"}
          </Btn>}
          <Btn variant="primary" onClick={() => handleGenerate("pdf")} disabled={generating} icon={<Icon name="download" size={15} />} style={{ minWidth: 100, justifyContent: "center" }}>
            {generating ? "Generating..." : "PDF"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {error && <div style={{ padding: "10px 14px", borderRadius: 8, background: C.redBg, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}

        {/* CDS Account — searchable dropdown */}
        <div>
          <div style={labelStyle}>CDS Account</div>
          {cdsList?.length > 1 ? (
            <div ref={cdsRef} style={{ position: "relative" }}>
              <button type="button" onClick={() => { setCdsOpen(o => !o); setCdsSearch(""); }}
                style={{ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${cdsOpen ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 13, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", boxSizing: "border-box" }}
              >
                <span>{selectedCds} — {selectedCdsName || "Unnamed"}</span>
                <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{cdsOpen ? "▲" : "▼"}</span>
              </button>
              {cdsOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                      <input autoFocus type="text" value={cdsSearch} onChange={e => setCdsSearch(e.target.value)} placeholder="Search CDS..."
                        style={{ width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white }}
                        onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}
                      />
                    </div>
                  </div>
                  <div className="ui-dd-scroll" style={{ maxHeight: 200, overflowY: "auto", scrollbarColor: `${isDark ? C.gray200 : "#cbd5e1"} transparent` }}>
                    {filteredCds.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No CDS accounts found</div>
                      : filteredCds.map(c => {
                        const isSelected = c.cds_number === selectedCds;
                        return (
                          <button key={c.cds_number} type="button"
                            onClick={() => { setSelectedCds(c.cds_number); setCdsOpen(false); setCdsSearch(""); }}
                            style={{ width: "100%", padding: "9px 14px", border: "none", background: isSelected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? C.green + "15" : "transparent"; }}
                          >
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.cds_number} — {c.cds_name || "Unnamed"}</span>
                            {isSelected && <span style={{ color: C.green, fontSize: 13, flexShrink: 0, marginLeft: 8 }}>✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...inputStyle, background: isDark ? C.gray100 : "#f8f9fa", color: C.gray600 }}>
              {selectedCds} {selectedCdsName ? `— ${selectedCdsName}` : ""}
            </div>
          )}
        </div>

        {/* View + Company on same row */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>View</div>
            <select value={divView} onChange={e => setDivView(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {DIV_VIEW_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Company</div>
            <select value={divCompany} onChange={e => setDivCompany(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              <option value="All">All Companies</option>
              {divCompanies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Period: Date From + Date To */}
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date From</div>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              max={dateTo || today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={labelStyle}>Date To</div>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              max={today}
              style={{ ...inputStyle, height: 40 }}
            />
          </div>
        </div>

        {/* Status filter (By Transaction only) */}
        {isByTxn && (
          <div>
            <div style={labelStyle}>Status</div>
            <select value={divStatus} onChange={e => setDivStatus(e.target.value)}
              style={{ ...inputStyle, cursor: "pointer" }}
            >
              {DIV_STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ── Main Reports Page ────────────────────────────────────────────
export default function ReportsPage({ cdsNumber, cdsName, cdsList, showToast, role }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const [activeReport, setActiveReport] = useState(null);

  const handleGeneratePortfolio = useCallback(async ({ cdsNumber: cds, asAtDate, positionType, format = "pdf" }) => {
    // Fetch data
    const data = await sbGetPortfolioAsAt(cds, asAtDate);
    if (!data?.holdings?.length) {
      throw new Error("No holdings found for the selected parameters.");
    }

    // Filter by position type
    let filtered = data.holdings;
    if (positionType === "held") filtered = filtered.filter(h => h.shares_held > 0);
    else if (positionType === "sold") filtered = filtered.filter(h => h.total_sold > 0);

    if (!filtered.length) {
      throw new Error(`No ${positionType === "held" ? "current holdings" : positionType === "sold" ? "sold positions" : "positions"} found.`);
    }

    const params = { cdsNumber: cds, cdsName: data.cdsName, asAtDate, positionType, holdings: filtered };

    if (format === "excel") {
      await generatePortfolioStatementExcelv2({ ...params, logoUrl: logo });
    } else {
      await generatePortfolioStatementPDFv2({ ...params, logoUrl: logo });
    }

    setActiveReport(null);
    showToast(`Portfolio Statement ${format === "excel" ? "downloaded" : "generated"}`, "success");
  }, [showToast]);

  const handleGenerateTransactionHistory = useCallback(async ({ cdsNumber: cds, dateFrom, dateTo, txnType, status, brokerId, brokerName, format = "pdf" }) => {
    // Fetch all transactions (large page size to get everything for report)
    const data = await sbGetTransactions(cds, {
      pageSize: 10000, page: 1, sortCol: "date", sortDir: "asc",
      ...(txnType ? { type: txnType } : {}),
      ...(status ? { status } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });
    if (!data?.rows?.length) {
      throw new Error("No transactions found for the selected parameters.");
    }

    // Filter by broker client-side (API doesn't support broker filter)
    let rows = data.rows;
    if (brokerId) {
      rows = rows.filter(t => t.broker_id === brokerId);
      if (!rows.length) throw new Error("No transactions found for the selected broker.");
    }

    const cdsNameResolved = cdsList?.find(c => c.cds_number === cds)?.cds_name || "";
    const params = {
      cdsNumber: cds, cdsName: cdsNameResolved,
      dateFrom, dateTo, txnType, status, brokerName,
      transactions: rows, logoUrl: logo,
    };

    if (format === "excel") {
      await generateTransactionHistoryExcel(params);
    } else {
      await generateTransactionHistoryPDF(params);
    }

    setActiveReport(null);
    showToast(`Transaction History ${format === "excel" ? "downloaded" : "generated"}`, "success");
  }, [showToast, cdsList]);

  const handleGenerateGainLoss = useCallback(async ({ cdsNumber: cds, glView = "company", dateFrom, dateTo, brokerId: bId, brokerName: bName, format = "pdf" }) => {
    if (glView === "transaction") {
      const data = await sbGetFifoSellDetails(cds, { dateFrom, dateTo });
      if (!data?.sells?.length) {
        throw new Error("No sell transactions found — no realized gains/losses to report.");
      }
      let sells = data.sells;
      if (bId) {
        sells = sells.filter(s => s.brokerId === bId);
        if (!sells.length) throw new Error("No sell transactions found for the selected broker.");
      }
      const params = { cdsNumber: cds, cdsName: data.cdsName, glView, sells, dateFrom, dateTo, brokerName: bName, logoUrl: logo };
      if (format === "excel") {
        await generateGainLossExcel(params);
      } else {
        await generateGainLossPDF(params);
      }
    } else {
      const asAt = dateTo || new Date().toISOString().split("T")[0];
      const data = await sbGetPortfolioAsAt(cds, asAt);
      if (!data?.holdings?.length) {
        throw new Error("No holdings found for the selected parameters.");
      }
      const sold = data.holdings.filter(h => h.total_sold > 0);
      if (!sold.length) {
        throw new Error("No sold positions found — no realized gains/losses to report.");
      }
      const params = { cdsNumber: cds, cdsName: data.cdsName, glView, holdings: sold, dateFrom, dateTo, logoUrl: logo };
      if (format === "excel") {
        await generateGainLossExcel(params);
      } else {
        await generateGainLossPDF(params);
      }
    }

    setActiveReport(null);
    showToast(`Gain/Loss Report ${format === "excel" ? "downloaded" : "generated"}`, "success");
  }, [showToast]);

  const handleGenerateDividend = useCallback(async ({ cdsNumber: cds, divView = "company", dateFrom, dateTo, status, company = "All", format = "pdf" }) => {
    const cdsNameResolved = cdsList?.find(c => c.cds_number === cds)?.cds_name || "";

    if (divView === "transaction") {
      // By Transaction — individual dividend records
      let rows = await sbGetDividends(cds);
      if (!Array.isArray(rows) || !rows.length) throw new Error("No dividends found for the selected CDS account.");
      // Normalize: extract YYYY-MM-DD from dates that may include timestamps
      const dateOf = (d) => {
        const raw = d.payment_date || d.declaration_date || "";
        return raw ? raw.substring(0, 10) : "";
      };
      // Filter by date range
      if (dateFrom) rows = rows.filter(d => dateOf(d) >= dateFrom);
      if (dateTo) rows = rows.filter(d => { const dt = dateOf(d); return !dt || dt <= dateTo; });
      // Filter by company
      if (company && company !== "All") rows = rows.filter(d => d.company_id === company);
      // Filter by status
      if (status && status !== "All") rows = rows.filter(d => d.status === status);
      if (!rows.length) throw new Error("No dividends found for the selected filters.");
      // Sort by payment date ascending
      rows.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));

      // Build company price map for yield fallback (paid dividends missing market_price_at_payment)
      const companyList = await sbGetAllCompanies().catch(() => []);
      const companyPriceMap = {};
      if (Array.isArray(companyList)) companyList.forEach(c => { if (c.id && Number(c.price) > 0) companyPriceMap[c.id] = Number(c.price); });

      const params = { cdsNumber: cds, cdsName: cdsNameResolved, divView, dividends: rows, dateFrom, dateTo, status, companyPriceMap, logoUrl: logo };
      if (format === "excel") {
        await generateDividendIncomeExcel(params);
      } else {
        await generateDividendIncomePDF(params);
      }
    } else {
      // By Company — aggregated
      const rows = await sbGetDividendByCompany(cds);
      if (!rows?.length) throw new Error("No dividends found for the selected CDS account.");

      const params = { cdsNumber: cds, cdsName: cdsNameResolved, divView, byCompany: rows, dateFrom, dateTo, logoUrl: logo };
      if (format === "excel") {
        await generateDividendIncomeExcel(params);
      } else {
        await generateDividendIncomePDF(params);
      }
    }

    setActiveReport(null);
    showToast(`Dividend Income report ${format === "excel" ? "downloaded" : "generated"}`, "success");
  }, [showToast, cdsList]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Section Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9,
            background: isDark ? "rgba(0,132,61,0.12)" : "#D1FAE5",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="trendingUp" size={16} stroke={C.green} sw={2} />
          </div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Capital Markets</div>
        </div>
        <div style={{ fontSize: 12, color: C.gray500, marginLeft: 42 }}>Portfolio, transaction and dividend reports</div>
      </div>

      {/* Report Cards Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
        gap: 12,
      }}>
        {CAPITAL_MARKET_REPORTS.map(r => (
          <ReportCard key={r.id} report={r} C={C} isDark={isDark}
            onClick={() => setActiveReport(r.id)}
          />
        ))}
      </div>

      {/* Filter Modals */}
      {activeReport === "portfolio_statement" && (
        <PortfolioFilterModal
          cdsNumber={cdsNumber}
          cdsName={cdsName}
          cdsList={cdsList}
          onGenerate={handleGeneratePortfolio}
          onClose={() => setActiveReport(null)}
          C={C} isDark={isDark} isMobile={isMobile}
        />
      )}
      {activeReport === "transaction_history" && (
        <TransactionHistoryFilterModal
          cdsNumber={cdsNumber}
          cdsName={cdsName}
          cdsList={cdsList}
          onGenerate={handleGenerateTransactionHistory}
          onClose={() => setActiveReport(null)}
          C={C} isDark={isDark} isMobile={isMobile}
        />
      )}
      {activeReport === "gain_loss" && (
        <GainLossFilterModal
          cdsNumber={cdsNumber}
          cdsName={cdsName}
          cdsList={cdsList}
          onGenerate={handleGenerateGainLoss}
          onClose={() => setActiveReport(null)}
          C={C} isDark={isDark} isMobile={isMobile}
        />
      )}
      {activeReport === "dividend_income" && (
        <DividendFilterModal
          cdsNumber={cdsNumber}
          cdsName={cdsName}
          cdsList={cdsList}
          onGenerate={handleGenerateDividend}
          onClose={() => setActiveReport(null)}
          C={C} isDark={isDark} isMobile={isMobile}
        />
      )}
    </div>
  );
}
