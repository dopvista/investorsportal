// ── src/pages/CompaniesPage.jsx ───────────────────────────────────
import { useState, useMemo, useEffect, useCallback } from "react";
import { sbInsert, sbUpdate, sbDelete, sbGetPortfolio, sbUpsertCdsPrice, sbGetCdsPriceHistory, sbGetAllCompanies } from "../lib/supabase";
import { C, fmt, fmtSmart, Btn, StatCard, SectionCard, Modal, PriceHistoryModal, UpdatePriceModal, CompanyFormModal, ActionMenu } from "../components/ui";

export default function CompaniesPage({ companies: globalCompanies, setCompanies, transactions, showToast, role, profile, manageOnly = false }) {
  const isSA = role === "SA";
  const isSAAD = role === "SA" || role === "AD";
  const cdsNumber = profile?.cds_number || null;
  const currentUserId = profile?.id || null;

  const [activeTab, setActiveTab] = useState(manageOnly ? "manage" : "portfolio");

  const [portfolio, setPortfolio] = useState([]);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState(null);

  const [masterList, setMasterList] = useState([]);
  const [masterLoading, setMasterLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [updating, setUpdating] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [historyModal, setHistoryModal] = useState({ open: false, company: null, history: [] });
  const [updateModal, setUpdateModal] = useState({ open: false, company: null });
  const [formModal, setFormModal] = useState({ open: false, company: null });

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const closeDeleteModal = useCallback(() => setDeleteModal(null), []);
  const closeHistoryModal = useCallback(() => setHistoryModal({ open: false, company: null, history: [] }), []);
  const closeUpdateModal = useCallback(() => setUpdateModal({ open: false, company: null }), []);
  const closeFormModal = useCallback(() => setFormModal({ open: false, company: null }), []);
  const openNewCompanyModal = useCallback(() => setFormModal({ open: true, company: null }), []);

  const loadPortfolio = useCallback(async () => {
    if (!cdsNumber) {
      setPortfolioLoading(false);
      return;
    }
    setPortfolioLoading(true);
    setPortfolioError(null);
    try {
      const data = await sbGetPortfolio(cdsNumber);
      setPortfolio(data);
    } catch (e) {
      setPortfolioError(e.message);
    } finally {
      setPortfolioLoading(false);
    }
  }, [cdsNumber]);

  const loadMasterList = useCallback(async () => {
    setMasterLoading(true);
    try {
      const data = await sbGetAllCompanies();
      setMasterList(data);
    } catch (e) {
      showToast("Error loading companies: " + e.message, "error");
    } finally {
      setMasterLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadPortfolio();
  }, [loadPortfolio]);

  useEffect(() => {
    if (!isSA || activeTab !== "manage") return;
    loadMasterList();
  }, [isSA, activeTab, loadMasterList]);

  const portfolioStats = useMemo(() => {
    const priced = portfolio.filter(c => c.cds_price != null);
    const avgPrice = priced.length ? priced.reduce((s, c) => s + Number(c.cds_price), 0) / priced.length : 0;
    const highest = priced.length ? Math.max(...priced.map(c => Number(c.cds_price))) : 0;
    return {
      total: portfolio.length,
      avgPrice,
      highest,
      unpriced: portfolio.length - priced.length,
    };
  }, [portfolio]);

  const filteredPortfolio = useMemo(() => {
    if (!normalizedSearch) return portfolio;
    return portfolio.filter(c => c.name.toLowerCase().includes(normalizedSearch));
  }, [portfolio, normalizedSearch]);

  const manageStats = useMemo(() => {
    return {
      total: masterList.length,
      registeredToday: masterList.filter(c => c.created_at?.startsWith(todayIso)).length,
    };
  }, [masterList, todayIso]);

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

      setPortfolio(prev =>
        prev.map(c =>
          c.id === company.id
            ? {
                ...c,
                cds_price: newPrice,
                cds_previous_price: oldPrice,
                cds_updated_by: profile?.full_name,
                cds_updated_at: resolvedUpdatedAt,
              }
            : c
        )
      );

      showToast("Price updated for your portfolio!", "success");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    } finally {
      setUpdating(null);
    }
  }, [updateModal.company, cdsNumber, profile?.full_name, showToast]);

  const viewHistory = useCallback(async (company) => {
    setLoadingHistory(company.id);
    try {
      const history = await sbGetCdsPriceHistory(company.id, cdsNumber);
      setHistoryModal({ open: true, company, history });
    } catch (e) {
      showToast("Error loading history: " + e.message, "error");
    } finally {
      setLoadingHistory(null);
    }
  }, [cdsNumber, showToast]);

  const handleFormConfirm = useCallback(async ({ name, price, remarks }) => {
    const editingCompany = formModal.company;
    const isEdit = !!editingCompany;

    try {
      if (isEdit) {
        const rows = await sbUpdate("companies", editingCompany.id, { name, remarks });
        setMasterList(prev => prev.map(c => (c.id === editingCompany.id ? rows[0] : c)));
        showToast("Company updated!", "success");
      } else {
        const rows = await sbInsert("companies", { name, price, remarks });
        setMasterList(prev => [rows[0], ...prev]);
        if (setCompanies) setCompanies(prev => [rows[0], ...prev]);
        showToast("Company registered!", "success");
      }
      setFormModal({ open: false, company: null });
    } catch (e) {
      showToast("Error: " + e.message, "error");
    }
  }, [formModal.company, setCompanies, showToast]);

  const confirmDelete = useCallback(async () => {
    const id = deleteModal?.id;
    if (!id) return;

    setDeleteModal(null);
    setDeleting(id);

    try {
      await sbDelete("companies", id);
      setMasterList(prev => prev.filter(c => c.id !== id));
      if (setCompanies) setCompanies(prev => prev.filter(c => c.id !== id));
      showToast("Company deleted.", "success");
    } catch (e) {
      showToast("Error: " + e.message, "error");
    } finally {
      setDeleting(null);
    }
  }, [deleteModal, setCompanies, showToast]);

  return (
    <div>
      {deleteModal && (
        <Modal
          type="confirm"
          title="Delete Company"
          message={`Are you sure you want to delete "${deleteModal.name}"? This cannot be undone.`}
          onConfirm={confirmDelete}
          onClose={closeDeleteModal}
        />
      )}

      {historyModal.open && (
        <PriceHistoryModal
          company={historyModal.company ? { ...historyModal.company, price: historyModal.company.cds_price } : null}
          history={historyModal.history}
          onClose={closeHistoryModal}
        />
      )}

      {updateModal.open && (
        <UpdatePriceModal
          key={updateModal.company?.id}
          company={updateModal.company ? { ...updateModal.company, price: updateModal.company.cds_price ?? 0 } : null}
          onConfirm={confirmUpdatePrice}
          onClose={closeUpdateModal}
        />
      )}

      {formModal.open && (
        <CompanyFormModal
          key={formModal.company?.id || "new"}
          company={formModal.company}
          onConfirm={handleFormConfirm}
          onClose={closeFormModal}
        />
      )}

      {activeTab === "portfolio" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="Holdings" value={portfolioStats.total} sub="Companies with transactions" icon="🏢" color={C.navy} />
            <StatCard label="Avg. Price" value={portfolioStats.avgPrice ? `TZS ${fmtSmart(portfolioStats.avgPrice)}` : "—"} sub="Across priced holdings" icon="📊" color={C.green} />
            <StatCard label="Highest Price" value={portfolioStats.highest ? `TZS ${fmtSmart(portfolioStats.highest)}` : "—"} sub="Top priced holding" icon="🏆" color={C.gold} />
            <StatCard label="Not Priced" value={portfolioStats.unpriced} sub="Tap ⋯ → Set Price to track" icon="💰" color={portfolioStats.unpriced > 0 ? C.red : C.gray400} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}>🔍</span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search your holdings..."
                style={{ width: "100%", border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "9px 12px 9px 36px", fontSize: 14, outline: "none", fontFamily: "inherit", color: C.text, boxSizing: "border-box" }}
                onFocus={e => { e.target.style.borderColor = C.green; }}
                onBlur={e => { e.target.style.borderColor = C.gray200; }}
              />
            </div>
            {search && <Btn variant="secondary" onClick={() => setSearch("")}>Clear</Btn>}
            <Btn variant="secondary" icon="🔄" onClick={loadPortfolio}>Refresh</Btn>
          </div>

          <SectionCard
            title={`Portfolio Holdings (${filteredPortfolio.length}${search ? ` of ${portfolio.length}` : ""})`}
            subtitle="Prices are your own CDS analysis prices — not shared with other users"
          >
            {portfolioLoading ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: C.gray400 }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 13 }}>Loading your portfolio...</div>
              </div>
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
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: `linear-gradient(135deg, ${C.navy}08, ${C.navy}04)` }}>
                      {[
                        { label: "#", align: "left" },
                        { label: "Company", align: "left" },
                        { label: "My Price (TZS)", align: "right" },
                        { label: "Change", align: "right" },
                        { label: "Previous Price (TZS)", align: "right" },
                        { label: "Last Updated", align: "left" },
                        { label: "Updated By", align: "left" },
                        { label: "Actions", align: "right" },
                      ].map(h => (
                        <th key={h.label} style={{ padding: "10px 16px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap" }}>{h.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPortfolio.map((c, i) => {
                      const hasCdsPrice = c.cds_price != null;
                      const priceUp = hasCdsPrice && c.cds_previous_price != null ? Number(c.cds_price) >= Number(c.cds_previous_price) : null;
                      const changePct =
                        hasCdsPrice && c.cds_previous_price != null && Number(c.cds_previous_price) !== 0
                          ? ((Number(c.cds_price) - Number(c.cds_previous_price)) / Number(c.cds_previous_price)) * 100
                          : null;

                      const portfolioActions = [
                        {
                          icon: "💰",
                          label: updating === c.id ? "Updating..." : hasCdsPrice ? "Update Price" : "Set Price",
                          onClick: () => setUpdateModal({ open: true, company: c }),
                        },
                        {
                          icon: "📈",
                          label: loadingHistory === c.id ? "Loading..." : "Price History",
                          onClick: () => viewHistory(c),
                        },
                      ];

                      return (
                        <tr
                          key={c.id}
                          style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s", background: !hasCdsPrice ? "#FFFBEB" : "transparent" }}
                          onMouseEnter={e => { e.currentTarget.style.background = !hasCdsPrice ? "#FFF8DC" : C.gray50; }}
                          onMouseLeave={e => { e.currentTarget.style.background = !hasCdsPrice ? "#FFFBEB" : "transparent"; }}
                        >
                          <td style={{ padding: "10px 16px", color: C.gray400, fontWeight: 600, width: 36 }}>{i + 1}</td>

                          <td style={{ padding: "10px 16px", minWidth: 140 }}>
                            <div style={{ fontWeight: 700, color: C.text }}>{c.name}</div>
                            {c.remarks && <div style={{ fontSize: 11, color: C.gray400, marginTop: 2 }}>{c.remarks}</div>}
                          </td>

                          <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {hasCdsPrice ? (
                              <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{fmt(c.cds_price)}</span>
                            ) : (
                              <span style={{ background: "#FEF3C7", color: "#D97706", border: "1px solid #FDE68A", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>💰 Set price</span>
                            )}
                          </td>

                          <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {priceUp !== null && changePct !== null ? (
                              <span style={{ background: priceUp ? C.greenBg : C.redBg, color: priceUp ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, border: `1px solid ${priceUp ? "#BBF7D0" : "#FECACA"}` }}>
                                {priceUp ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
                              </span>
                            ) : (
                              <span style={{ color: C.gray400 }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: "10px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                            {c.cds_previous_price != null ? (
                              <span style={{ color: C.gray500, fontSize: 13 }}>{fmt(c.cds_previous_price)}</span>
                            ) : (
                              <span style={{ color: C.gray400 }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: "10px 16px", whiteSpace: "nowrap" }}>
                            {c.cds_updated_at ? (
                              <span style={{ fontSize: 12, color: C.gray600 }}>
                                {new Date(c.cds_updated_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                                <span style={{ color: C.gray400, margin: "0 5px" }}>|</span>
                                {new Date(c.cds_updated_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : (
                              <span style={{ color: C.gray400 }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: "10px 16px" }}>
                            {c.cds_updated_by ? (
                              <span style={{ fontSize: 11, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 8px" }}>{c.cds_updated_by}</span>
                            ) : (
                              <span style={{ color: C.gray400 }}>—</span>
                            )}
                          </td>

                          <td style={{ padding: "10px 16px", textAlign: "right" }}>
                            <ActionMenu actions={portfolioActions} />
                          </td>
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

      {activeTab === "manage" && isSA && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="Total Companies" value={manageStats.total} sub="In master registry" icon="🏢" color={C.navy} />
            <StatCard label="Registered Today" value={manageStats.registeredToday} sub="Added today" icon="✅" color={C.green} />
            <StatCard label="Visible To" value="All Users" sub="Based on their transactions" icon="👁️" color={C.gold} />
          </div>

          <div style={{ background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)", border: `1px solid #BFDBFE`, borderRadius: 12, padding: "12px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔒</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: "#1D4ED8" }}>Super Admin — Master Registry</div>
                <div style={{ fontSize: 12, color: "#3B82F6" }}>Only you can register or delete companies. Companies appear in users' Holdings automatically once they have a transaction for them.</div>
              </div>
            </div>
            <Btn variant="navy" icon="+" onClick={openNewCompanyModal}>Register Company</Btn>
          </div>

          <SectionCard title={`Master Company Registry (${masterList.length})`} subtitle="All listed companies available in the system">
            {masterLoading ? (
              <div style={{ textAlign: "center", padding: "50px 20px", color: C.gray400 }}>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 13 }}>Loading master registry...</div>
              </div>
            ) : masterList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No companies registered yet</div>
                <div style={{ fontSize: 13 }}>Click "Register Company" to add the first one</div>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ background: `linear-gradient(135deg, ${C.navy}08, ${C.navy}04)` }}>
                      {[
                        { label: "#", align: "left" },
                        { label: "Company Name", align: "left" },
                        { label: "Remarks", align: "left" },
                        { label: "Registered", align: "left" },
                        { label: "Actions", align: "right" },
                      ].map(h => (
                        <th key={h.label} style={{ padding: "10px 18px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap" }}>{h.label}</th>
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
                        <tr
                          key={c.id}
                          style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = C.gray50; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <td style={{ padding: "10px 18px", color: C.gray400, fontWeight: 600, width: 36 }}>{i + 1}</td>
                          <td style={{ padding: "10px 18px", minWidth: 160 }}>
                            <div style={{ fontWeight: 700, color: C.text }}>{c.name}</div>
                          </td>
                          <td style={{ padding: "10px 18px", color: C.gray500, fontSize: 13 }}>
                            {c.remarks || <span style={{ color: C.gray400 }}>—</span>}
                          </td>
                          <td style={{ padding: "10px 18px", color: C.gray500, fontSize: 13, whiteSpace: "nowrap" }}>
                            {c.created_at
                              ? new Date(c.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                              : "—"}
                          </td>
                          <td style={{ padding: "10px 18px", textAlign: "right" }}>
                            <ActionMenu actions={manageActions} />
                          </td>
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
  );
}
