// ── src/pages/CompaniesPage.jsx ───────────────────────────────────
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  sbInsert, sbUpdate, sbDelete,
  sbGetPortfolio, sbUpsertCdsPrice, sbGetCdsPriceHistory, sbGetAllCompanies
} from "../lib/supabase";
import {
  C, fmt, fmtSmart, Btn, StatCard, SectionCard,
  Modal, PriceHistoryModal, UpdatePriceModal, CompanyFormModal, ActionMenu
} from "../components/ui";

// ── Mobile breakpoint hook ────────────────────────────────────────
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

// ── Mobile Action Sheet ───────────────────────────────────────────
function ActionSheet({ company, onUpdatePrice, onViewHistory, onClose }) {
  const hasCdsPrice = company.cds_price != null;
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.42)", backdropFilter: "blur(2px)" }} />
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 401, background: C.white, borderRadius: "18px 18px 0 0", boxShadow: "0 -8px 32px rgba(0,0,0,0.18)", paddingBottom: "env(safe-area-inset-bottom, 12px)", animation: "sheetIn 0.22s cubic-bezier(0.4,0,0.2,1)", willChange: "transform" }}>
        <style>{`@keyframes sheetIn{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{ padding: "12px 20px 0", textAlign: "center" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: C.gray200, margin: "0 auto 14px" }} />
          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 3 }}>{company.name}</div>
          {hasCdsPrice
            ? <div style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>TZS {fmt(company.cds_price)}</div>
            : <div style={{ fontSize: 12, color: "#D97706", fontWeight: 600 }}>No price set yet</div>}
        </div>
        <div style={{ padding: "14px 16px 8px", display: "flex", flexDirection: "column", gap: 9 }}>
          <button onClick={() => { onClose(); onUpdatePrice(company); }}
            style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: `1.5px solid ${C.green}33`, background: C.greenBg, color: C.green, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <span style={{ fontSize: 22 }}>💰</span>
            <div>
              <div style={{ fontWeight: 700 }}>{hasCdsPrice ? "Update Price" : "Set Price"}</div>
              <div style={{ fontSize: 11, color: C.green + "99", fontWeight: 500 }}>{hasCdsPrice ? "Change your current analysis price" : "Add a price to track performance"}</div>
            </div>
          </button>
          <button onClick={() => { onClose(); onViewHistory(company); }}
            style={{ width: "100%", padding: "14px 18px", borderRadius: 12, border: `1.5px solid ${C.navy}22`, background: C.navy + "08", color: C.navy, fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, textAlign: "left" }}>
            <span style={{ fontSize: 22 }}>📈</span>
            <div>
              <div style={{ fontWeight: 700 }}>Price History</div>
              <div style={{ fontSize: 11, color: C.navy + "88", fontWeight: 500 }}>View price changes over time</div>
            </div>
          </button>
        </div>
        <div style={{ padding: "0 16px 12px" }}>
          <button onClick={onClose} style={{ width: "100%", padding: "13px", borderRadius: 12, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      </div>
    </>
  );
}

// ── Mobile Portfolio Card ─────────────────────────────────────────
function PortfolioMobileCard({ company: c, onTap }) {
  const hasCdsPrice = c.cds_price != null;
  const priceUp     = hasCdsPrice && c.cds_previous_price != null
    ? Number(c.cds_price) >= Number(c.cds_previous_price) : null;
  const changePct   = hasCdsPrice && c.cds_previous_price != null && Number(c.cds_previous_price) !== 0
    ? ((Number(c.cds_price) - Number(c.cds_previous_price)) / Number(c.cds_previous_price)) * 100 : null;
  const accentColor = !hasCdsPrice ? "#D97706" : priceUp === false ? C.red : C.green;

  return (
    <div onClick={() => onTap(c)} style={{
      background: C.white, border: `1px solid ${C.gray200}`, borderLeft: `4px solid ${accentColor}`,
      borderRadius: 12, padding: "13px 14px", marginBottom: 9, cursor: "pointer",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: 12,
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
              ? <span style={{ background: priceUp ? C.greenBg : C.redBg, color: priceUp ? C.green : C.red, border: `1px solid ${priceUp ? "#BBF7D0" : "#FECACA"}`, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                  {priceUp ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                </span>
              : <span style={{ fontSize: 10, color: C.gray400 }}>No prev.</span>}
          </>
        ) : (
          <span style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💰 Set price</span>
        )}
      </div>
      <div style={{ color: C.gray400, fontSize: 16, flexShrink: 0 }}>›</div>
    </div>
  );
}

// ── Mobile Manage Card (SA only) ──────────────────────────────────
function ManageMobileCard({ company: c, deleting, onEdit, onDelete }) {
  const actions = [
    { icon: "✏️", label: "Edit Company", onClick: () => onEdit(c) },
    { icon: "🗑️", label: deleting === c.id ? "Deleting..." : "Delete", danger: true, onClick: () => onDelete(c) },
  ];
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: C.navy + "0f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>🏢</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
        <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>
          {c.remarks ? <span style={{ color: C.gray500 }}>{c.remarks}</span> : c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
        </div>
      </div>
      <ActionMenu actions={actions} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function CompaniesPage({ companies: globalCompanies, setCompanies, transactions, showToast, role, profile, manageOnly = false }) {
  const isSA      = role === "SA";
  const cdsNumber = profile?.cds_number || null;
  const isMobile  = useIsMobile();

  const [activeTab, setActiveTab] = useState(manageOnly ? "manage" : "portfolio");

  const [portfolio, setPortfolio]               = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError]     = useState(null);

  const [masterList, setMasterList]       = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);

  const [search, setSearch]                 = useState("");
  const [deleting, setDeleting]             = useState(null);
  const [updating, setUpdating]             = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(null);

  const [actionSheetCompany, setActionSheetCompany] = useState(null);
  const [deleteModal, setDeleteModal]   = useState(null);
  const [historyModal, setHistoryModal] = useState({ open: false, company: null, history: [] });
  const [updateModal, setUpdateModal]   = useState({ open: false, company: null });
  const [formModal, setFormModal]       = useState({ open: false, company: null });

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const isMountedRef    = useRef(true);
  const portfolioReqRef = useRef(0);
  const masterReqRef    = useRef(0);

  const rootRef = useRef(null);
  const touchStartYRef = useRef(null);
  const pullingRef = useRef(false);
  const scrollHostRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => { setActiveTab(manageOnly ? "manage" : "portfolio"); }, [manageOnly]);

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const todayIso         = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Modal close handlers
  const closeDeleteModal    = useCallback(() => setDeleteModal(null), []);
  const closeHistoryModal   = useCallback(() => setHistoryModal({ open: false, company: null, history: [] }), []);
  const closeUpdateModal    = useCallback(() => setUpdateModal({ open: false, company: null }), []);
  const closeFormModal      = useCallback(() => setFormModal({ open: false, company: null }), []);
  const closeActionSheet    = useCallback(() => setActionSheetCompany(null), []);

  const openNewCompanyModal = useCallback(() => setFormModal({ open: true, company: null }), []);

  const getScrollParent = useCallback((el) => {
    let node = el?.parentElement;
    while (node) {
      const style = window.getComputedStyle(node);
      const canScroll =
        (style.overflowY === "auto" || style.overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight;
      if (canScroll) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || document.documentElement;
  }, []);

  // ── Data loaders ──────────────────────────────────────────────
  const loadPortfolio = useCallback(async ({ fromPull = false } = {}) => {
    const reqId = ++portfolioReqRef.current;

    if (!cdsNumber) {
      if (isMountedRef.current && reqId === portfolioReqRef.current) {
        setPortfolio([]);
        setPortfolioError(null);
        setPortfolioLoading(false);
        if (fromPull) {
          setRefreshing(false);
          setPullDistance(0);
        }
      }
      return;
    }

    if (!fromPull && isMountedRef.current) {
      setPortfolioLoading(true);
      setPortfolioError(null);
    }

    try {
      const data = await sbGetPortfolio(cdsNumber);
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolio(data);
      setPortfolioError(null);
    } catch (e) {
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolioError(e.message || "Failed to load portfolio.");
      showToast?.(fromPull ? "Refresh failed" : "Failed to load portfolio.", "error");
    } finally {
      if (!isMountedRef.current || reqId !== portfolioReqRef.current) return;
      setPortfolioLoading(false);
      if (fromPull) {
        setRefreshing(false);
        setPullDistance(0);
      }
    }
  }, [cdsNumber, showToast]);

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
      if (fromPull) {
        setRefreshing(false);
        setPullDistance(0);
      }
    }
  }, [showToast]);

  const refreshCurrentView = useCallback(async ({ fromPull = false } = {}) => {
    if (activeTab === "manage" && isSA) {
      await loadMasterList({ fromPull });
    } else {
      await loadPortfolio({ fromPull });
    }
  }, [activeTab, isSA, loadMasterList, loadPortfolio]);

  useEffect(() => { loadPortfolio(); }, [loadPortfolio]);
  useEffect(() => { if (!isSA || activeTab !== "manage") return; loadMasterList(); }, [isSA, activeTab, loadMasterList]);

  // ── Pull to refresh ────────────────────────────────────────────
  const handleTouchStart = useCallback((e) => {
    if (!isMobile || refreshing) return;
    if ((activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) return;

    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;

    if ((host?.scrollTop || 0) > 0) {
      touchStartYRef.current = null;
      pullingRef.current = false;
      return;
    }

    touchStartYRef.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [activeTab, getScrollParent, isMobile, masterLoading, portfolioLoading, refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing) return;
    if ((activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) return;
    if (touchStartYRef.current == null) return;

    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) {
      touchStartYRef.current = null;
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) {
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }

    pullingRef.current = true;
    const resisted = Math.min(92, Math.round(Math.pow(deltaY, 0.85)));
    setPullDistance(resisted);
  }, [activeTab, getScrollParent, isMobile, masterLoading, portfolioLoading, refreshing]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || (activeTab === "portfolio" && portfolioLoading) || (activeTab === "manage" && masterLoading)) {
      touchStartYRef.current = null;
      pullingRef.current = false;
      setPullDistance(0);
      return;
    }

    const shouldRefresh = pullingRef.current && pullDistance >= 64;

    touchStartYRef.current = null;
    pullingRef.current = false;

    if (shouldRefresh) {
      setPullDistance(56);
      setRefreshing(true);
      refreshCurrentView({ fromPull: true });
    } else {
      setPullDistance(0);
    }
  }, [activeTab, isMobile, masterLoading, portfolioLoading, pullDistance, refreshing, refreshCurrentView]);

  // ── Stats ─────────────────────────────────────────────────────
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

  // ── Handlers ──────────────────────────────────────────────────
  const confirmUpdatePrice = useCallback(async ({ newPrice, datetime, reason }) => {
    const company = updateModal.company;
    if (!company) return;
    const oldPrice = company.cds_price != null ? Number(company.cds_price) : null;
    setUpdateModal({ open: false, company: null });
    setUpdating(company.id);
    try {
      const resolvedUpdatedAt = datetime ? new Date(datetime).toISOString() : new Date().toISOString();
      await sbUpsertCdsPrice({
        companyId: company.id,
        companyName: company.name,
        cdsNumber,
        newPrice,
        oldPrice,
        reason,
        updatedBy: profile?.full_name || "Unknown",
        datetime,
      });
      if (!isMountedRef.current) return;
      setPortfolio(prev => prev.map(c =>
        c.id === company.id ? {
          ...c,
          cds_price: newPrice,
          cds_previous_price: oldPrice,
          cds_updated_by: profile?.full_name,
          cds_updated_at: resolvedUpdatedAt,
        } : c
      ));
      showToast("Price updated for your portfolio!", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUpdating(null);
    }
  }, [updateModal.company, cdsNumber, profile?.full_name, showToast]);

  const viewHistory = useCallback(async (company) => {
    setLoadingHistory(company.id);
    try {
      const history = await sbGetCdsPriceHistory(company.id, cdsNumber);
      if (!isMountedRef.current) return;
      setHistoryModal({ open: true, company, history });
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error loading history: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setLoadingHistory(null);
    }
  }, [cdsNumber, showToast]);

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

  const pullReady = pullDistance >= 64;

  return (
    <div
      ref={rootRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onTouchCancel={isMobile ? handleTouchEnd : undefined}
      style={{
        position: "relative",
        overflow: "visible",
        paddingBottom: isMobile ? 96 : 0,
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {isMobile && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 0,
            pointerEvents: "none",
            zIndex: 3,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: `translate(-50%, ${Math.max(8, pullDistance - 34)}px)`,
              opacity: refreshing || pullDistance > 6 ? 1 : 0,
              transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease",
              background: C.white,
              border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`,
              borderRadius: 999,
              padding: "7px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: `2px solid ${refreshing ? `${C.green}33` : C.gray200}`,
                borderTop: `2px solid ${pullReady || refreshing ? C.green : C.gray400}`,
                animation: refreshing ? "spin 0.8s linear infinite" : "none",
                transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`,
                transition: "transform 0.12s ease, border-color 0.12s ease",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: refreshing ? C.green : (pullReady ? C.text : C.gray500),
                whiteSpace: "nowrap",
              }}
            >
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          transform: isMobile ? `translateY(${pullDistance}px)` : "none",
          transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"),
          willChange: isMobile ? "transform" : "auto",
        }}
      >
        {/* ── Modals ── */}
        {deleteModal  && <Modal type="confirm" title="Delete Company" message={`Are you sure you want to delete "${deleteModal.name}"? This cannot be undone.`} onConfirm={confirmDelete} onClose={closeDeleteModal} />}
        {historyModal.open && <PriceHistoryModal company={historyModal.company ? { ...historyModal.company, price: historyModal.company.cds_price } : null} history={historyModal.history} onClose={closeHistoryModal} />}
        {updateModal.open  && <UpdatePriceModal key={updateModal.company?.id} company={updateModal.company ? { ...updateModal.company, price: updateModal.company.cds_price ?? 0 } : null} onConfirm={confirmUpdatePrice} onClose={closeUpdateModal} />}
        {formModal.open    && <CompanyFormModal key={formModal.company?.id || "new"} company={formModal.company} onConfirm={handleFormConfirm} onClose={closeFormModal} />}

        {/* Mobile action sheet */}
        {actionSheetCompany && (
          <ActionSheet
            company={actionSheetCompany}
            onUpdatePrice={(c) => setUpdateModal({ open: true, company: c })}
            onViewHistory={viewHistory}
            onClose={closeActionSheet}
          />
        )}

        {/* ══════════════════════════════════════════════════════════
            PORTFOLIO TAB
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "portfolio" && (
          <>
            {isMobile ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <StatCard label="Holdings"   value={portfolioStats.total}    sub="In your portfolio"    icon="🏢" color={C.navy} />
                <StatCard label="Not Priced" value={portfolioStats.unpriced} sub="Tap card → Set Price" icon="💰" color={portfolioStats.unpriced > 0 ? C.red : C.gray400} />
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
                <StatCard label="Holdings"      value={portfolioStats.total}                                                  sub="Companies with transactions"   icon="🏢" color={C.navy}  />
                <StatCard label="Avg. Price"    value={portfolioStats.avgPrice  ? `TZS ${fmtSmart(portfolioStats.avgPrice)}`  : "—"} sub="Across priced holdings"  icon="📊" color={C.green} />
                <StatCard label="Highest Price" value={portfolioStats.highest   ? `TZS ${fmtSmart(portfolioStats.highest)}`   : "—"} sub="Top priced holding"       icon="🏆" color={C.gold}  />
                <StatCard label="Not Priced"    value={portfolioStats.unpriced}                                               sub="Tap ⋯ → Set Price to track"    icon="💰" color={portfolioStats.unpriced > 0 ? C.red : C.gray400} />
              </div>
            )}

            {/* Search + refresh */}
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 12 : 16 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}>🔍</span>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your holdings..."
                  style={{ width: "100%", border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "9px 12px 9px 36px", fontSize: isMobile ? 13 : 14, outline: "none", fontFamily: "inherit", color: C.text, boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.green; }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; }} />
              </div>
              {search && <Btn variant="secondary" onClick={() => setSearch("")}>Clear</Btn>}
              {!isMobile && <Btn variant="secondary" icon="🔄" onClick={() => loadPortfolio()}>Refresh</Btn>}
              {isMobile && (
                <button onClick={() => loadPortfolio()} style={{ width: 40, height: 40, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: C.white, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>🔄</button>
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
                  <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                  <div style={{ fontWeight: 600 }}>Failed to load portfolio</div>
                  <div style={{ fontSize: 13, marginTop: 4, color: C.gray400 }}>{portfolioError}</div>
                </div>
              ) : portfolio.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No holdings yet</div>
                  <div style={{ fontSize: 13 }}>Record transactions to see companies appear here automatically</div>
                </div>
              ) : filteredPortfolio.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                  <div style={{ fontWeight: 600 }}>No results for "{search}"</div>
                </div>
              ) : isMobile ? (
                <div style={{ padding: "8px 12px" }}>
                  {filteredPortfolio.map(c => (
                    <PortfolioMobileCard key={c.id} company={c} onTap={setActionSheetCompany} />
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: `linear-gradient(135deg, ${C.navy}08, ${C.navy}04)` }}>
                        {["#", "Company", "New Price (TZS)", "Change", "Previous Price (TZS)", "Last Updated", "Updated By", "Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: h === "Actions" || h === "New Price (TZS)" || h === "Change" || h === "Previous Price (TZS)" ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPortfolio.map((c, i) => {
                        const hasCdsPrice = c.cds_price != null;
                        const priceUp     = hasCdsPrice && c.cds_previous_price != null ? Number(c.cds_price) >= Number(c.cds_previous_price) : null;
                        const changePct   = hasCdsPrice && c.cds_previous_price != null && Number(c.cds_previous_price) !== 0
                          ? ((Number(c.cds_price) - Number(c.cds_previous_price)) / Number(c.cds_previous_price)) * 100 : null;
                        const portfolioActions = [
                          { icon: "💰", label: updating === c.id ? "Updating..." : hasCdsPrice ? "Update Price" : "Set Price", onClick: () => setUpdateModal({ open: true, company: c }) },
                          { icon: "📈", label: loadingHistory === c.id ? "Loading..." : "Price History", onClick: () => viewHistory(c) },
                        ];
                        return (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s", background: !hasCdsPrice ? "#FFFBEB" : "transparent" }}
                            onMouseEnter={e => { e.currentTarget.style.background = !hasCdsPrice ? "#FFF8DC" : C.gray50; }}
                            onMouseLeave={e => { e.currentTarget.style.background = !hasCdsPrice ? "#FFFBEB" : "transparent"; }}>
                            <td style={{ padding: "10px 16px", color: C.gray400, fontWeight: 600, width: 36 }}>{i + 1}</td>
                            <td style={{ padding: "10px 16px", minWidth: 140 }}>
                              <div style={{ fontWeight: 700, color: C.text }}>{c.name}</div>
                              {c.remarks && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{c.remarks}</div>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {hasCdsPrice ? <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{fmt(c.cds_price)}</span>
                                : <span style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💰 Set price</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {priceUp !== null && changePct !== null
                                ? <span style={{ background: priceUp ? C.greenBg : C.redBg, color: priceUp ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${priceUp ? "#BBF7D0" : "#FECACA"}` }}>{priceUp ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%</span>
                                : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                              {c.cds_previous_price != null ? <span style={{ color: C.gray500, fontSize: 13 }}>{fmt(c.cds_previous_price)}</span> : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                              {c.cds_updated_at ? <span style={{ fontSize: 12, color: C.gray600 }}>{new Date(c.cds_updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}<span style={{ color: C.gray400, margin: "0 5px" }}>|</span>{new Date(c.cds_updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                                : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px" }}>
                              {c.cds_updated_by ? <span style={{ fontSize: 11, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 8px" }}>{c.cds_updated_by}</span> : <span style={{ color: C.gray400 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}><ActionMenu actions={portfolioActions} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════
            MANAGE TAB (SA only)
            ══════════════════════════════════════════════════════════ */}
        {activeTab === "manage" && isSA && (
          <>
            {isMobile ? (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <StatCard label="Total Companies"  value={manageStats.total}           sub="In master registry" icon="🏢" color={C.navy}  />
                  <StatCard label="Registered Today" value={manageStats.registeredToday} sub="Added today"        icon="✅" color={C.green} />
                </div>
                <button onClick={openNewCompanyModal} style={{ width: "100%", height: 42, borderRadius: 9, border: "none", background: C.navy, color: C.white, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                  + Register New Company
                </button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
                <StatCard label="Total Companies"   value={manageStats.total}             sub="In master registry" icon="🏢" color={C.navy}  />
                <StatCard label="Registered Today"  value={manageStats.registeredToday}   sub="Added today"        icon="✅" color={C.green} />
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
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>No companies registered yet</div>
                  <div style={{ fontSize: 13 }}>Click "Register Company" to add the first one</div>
                </div>
              ) : isMobile ? (
                <div style={{ padding: "8px 12px" }}>
                  {masterList.map(c => (
                    <ManageMobileCard key={c.id} company={c} deleting={deleting}
                      onEdit={(company) => setFormModal({ open: true, company })}
                      onDelete={(company) => setDeleteModal({ id: company.id, name: company.name })} />
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr style={{ background: `linear-gradient(135deg, ${C.navy}08, ${C.navy}04)` }}>
                        {["#", "Company Name", "Remarks", "Registered", "Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 18px", textAlign: h === "Actions" ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {masterList.map((c, i) => {
                        const manageActions = [
                          { icon: "✏️", label: "Edit Company", onClick: () => setFormModal({ open: true, company: c }) },
                          { icon: "🗑️", label: deleting === c.id ? "Deleting..." : "Delete", danger: true, onClick: () => setDeleteModal({ id: c.id, name: c.name }) },
                        ];
                        return (
                          <tr key={c.id} style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.gray50; }}
                            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                            <td style={{ padding: "10px 18px", color: C.gray400, fontWeight: 600, width: 36 }}>{i + 1}</td>
                            <td style={{ padding: "10px 18px", minWidth: 160 }}><div style={{ fontWeight: 700, color: C.text }}>{c.name}</div></td>
                            <td style={{ padding: "10px 18px", color: C.gray500, fontSize: 13 }}>{c.remarks || <span style={{ color: C.gray400 }}>—</span>}</td>
                            <td style={{ padding: "10px 18px", color: C.gray500, fontSize: 13, whiteSpace: "nowrap" }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td>
                            <td style={{ padding: "10px 18px", textAlign: "right" }}><ActionMenu actions={manageActions} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </div>
  );
}
