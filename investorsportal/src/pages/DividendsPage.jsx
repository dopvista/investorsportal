// ── src/pages/DividendsPage.jsx ─────────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  useTheme,
  fmt, fmtSmart,
  Btn, StatCard, SectionCard, Modal, ActionMenu,
  DividendFormModal,
} from "../components/ui";
import { Icon } from "../lib/icons";
import {
  sbGetDividends,
  sbGetAllCompanies,
  sbInsertDividend,
  sbUpdateDividend,
  sbDeleteDividend,
  sbUpdateDividendStatus,
  sbBulkUpdateDividendStatus,
  sbBulkDeleteDividends,
} from "../lib/supabase";

// ── Module-level CSS injection (once, not per-render) ─────────────
if (typeof document !== "undefined" && !document.getElementById("_div_keyframes")) {
  const s = document.createElement("style");
  s.id = "_div_keyframes";
  s.textContent = "@keyframes _divSpin{to{transform:rotate(360deg)}} @keyframes _divPageSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}

const TOOLBAR_BASE   = { height: 36, borderRadius: 8, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" };
const TOOLBAR_BUTTON = { ...TOOLBAR_BASE, padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 };

// ── useIsMobile with debounce ─────────────────────────────────────
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

// ── Formatters ────────────────────────────────────────────────────
const fmtDate = (d) => {
  if (!d) return "\u2014";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

// ── Status config for dividends ───────────────────────────────────
const getStatusConfig = (C, isDark) => ({
  declared:       { label: "Declared",  color: "#C2410C", bg: isDark ? "#C2410C22" : "#FFF7ED", border: isDark ? "#C2410C55" : "#FED7AA", icon: <Icon name="clock" size={14} /> },
  ex_date_passed: { label: "Ex-Date",   color: "#1D4ED8", bg: isDark ? "#1D4ED828" : "#EFF6FF", border: isDark ? "#1D4ED855" : "#BFDBFE", icon: <Icon name="calendar" size={14} /> },
  paid:           { label: "Paid",      color: C.green,   bg: C.greenBg,                        border: isDark ? `${C.green}55` : "#BBF7D0", icon: <Icon name="checkCircle" size={14} /> },
});

const defaultStatus = "All";
const statusOptions = [
  ["All", "All Statuses"],
  ["declared", "Declared"],
  ["ex_date_passed", "Ex-Date Passed"],
  ["paid", "Paid"],
];

const TABLE_HEADERS_WITH_ACTIONS = [
  { label: "#",           align: "right"  },
  { label: "Payment Date",align: "left"   },
  { label: "Company",     align: "left"   },
  { label: "Per Share",   align: "right"  },
  { label: "Shares",      align: "right"  },
  { label: "Gross Amt",   align: "right"  },
  { label: "Tax",         align: "right"  },
  { label: "Net Amt",     align: "right"  },
  { label: "Status",      align: "left"   },
  { label: "Actions",     align: "center" },
];
const TABLE_HEADERS_WITHOUT_ACTIONS = TABLE_HEADERS_WITH_ACTIONS.slice(0, -1);

// ── Spinner ───────────────────────────────────────────────────────
const Spinner = memo(function Spinner({ size = 13, color = "#fff", style = {} }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "_divSpin 0.65s linear infinite", flexShrink: 0, ...style }} />
  );
});

// ── Dividend Status Badge ─────────────────────────────────────────
const DivStatusBadge = memo(function DivStatusBadge({ status }) {
  const { C, isDark } = useTheme();
  const STATUS = getStatusConfig(C, isDark);
  const s = STATUS[status] || STATUS.declared;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {s.icon} {s.label}
    </span>
  );
});

// ── Simple Confirm Modal ──────────────────────────────────────────
const SimpleConfirmModal = memo(function SimpleConfirmModal({ title, message, count, onConfirm, onClose, loading }) {
  const { C } = useTheme();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16 }}>{title}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count} dividend{count > 1 ? "s" : ""} selected</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 16 }}>{message}</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: loading ? C.gray200 : C.red, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading ? <><Spinner size={13} color="#fff" /> Processing...</> : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Desktop Pagination ────────────────────────────────────────────
const PgBtn = memo(function PgBtn({ onClick, disabled, label, active }) {
  const { C } = useTheme();
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${active ? "#0B1F3A" : C.gray200}`, background: active ? "#0B1F3A" : disabled ? C.gray50 : C.white, color: active ? "#ffffff" : disabled ? C.gray400 : C.gray600, fontWeight: active ? 700 : 500, fontSize: 12, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {label}
    </button>
  );
});

const Pagination = memo(function Pagination({ page, totalPages, pageSize, setPage, setPageSize, total, filtered }) {
  const { C } = useTheme();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, filtered);

  const pages = useMemo(() => {
    const arr = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) arr.push(i);
      else if (arr[arr.length - 1] !== "...") arr.push("...");
    }
    return arr;
  }, [page, totalPages]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: C.gray50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: C.gray400 }}>
          Showing <strong style={{ color: C.text }}>{from}\u2013{to}</strong> of <strong style={{ color: C.text }}>{filtered}</strong>
          {filtered !== total ? ` (${total} total)` : ""}
        </span>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${C.gray200}`, fontSize: 11, fontFamily: "inherit", color: C.gray600, outline: "none", background: C.white, cursor: "pointer" }}>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
        </select>
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <PgBtn onClick={() => setPage(1)} disabled={page === 1} label="\u00AB" />
          <PgBtn onClick={() => setPage(p => p - 1)} disabled={page === 1} label="\u2039" />
          {pages.map((p, i) => p === "..." ? (
            <span key={`e${i}`} style={{ padding: "0 4px", color: C.gray400, fontSize: 12 }}>\u2026</span>
          ) : (
            <PgBtn key={p} onClick={() => setPage(p)} active={p === page} label={p} />
          ))}
          <PgBtn onClick={() => setPage(p => p + 1)} disabled={page === totalPages} label="\u203A" />
          <PgBtn onClick={() => setPage(totalPages)} disabled={page === totalPages} label="\u00BB" />
        </div>
      )}
    </div>
  );
});

// ── Mobile Pagination ─────────────────────────────────────────────
const MobilePagination = memo(function MobilePagination({ page, totalPages, setPage, filtered, pageSize }) {
  const { C } = useTheme();
  const from = filtered === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, filtered);
  if (totalPages <= 1 && filtered === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: C.gray50 }}>
      <span style={{ fontSize: 12, color: C.gray500 }}>
        <strong style={{ color: C.text }}>{from}\u2013{to}</strong> of <strong style={{ color: C.text }}>{filtered}</strong>
      </span>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === 1 ? C.gray50 : C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>\u2039</button>
          <span style={{ fontSize: 12, color: C.gray500, fontWeight: 600, whiteSpace: "nowrap" }}>{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === totalPages ? C.gray50 : C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>\u203A</button>
        </div>
      )}
    </div>
  );
});

// ── Row permissions ───────────────────────────────────────────────
function getDivPermissions({ dividend, isDE, isSAAD }) {
  const isDeclared = dividend.status === "declared";
  const isExDate = dividend.status === "ex_date_passed";
  const isPaid = dividend.status === "paid";
  return {
    canEdit: (isSAAD || isDE) && !isPaid,
    canDelete: isSAAD || (isDE && isDeclared),
    canMarkPaid: (isSAAD || isDE) && !isPaid,
    isDeclared, isExDate, isPaid,
  };
}

// ── Dividend Detail Modal ─────────────────────────────────────────
const DividendDetailModal = memo(function DividendDetailModal({ dividend, companies = [], onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();

  if (!dividend) return null;

  const STATUS = getStatusConfig(C, isDark);
  const st = STATUS[dividend.status] || STATUS.declared;
  const gross = Number(dividend.total_amount || 0);
  const tax = Number(dividend.withholding_tax || 0);
  const net = Number(dividend.net_amount || 0) || (gross - tax);
  const dps = Number(dividend.dividend_per_share || 0);
  const shares = Number(dividend.shares_held || 0);

  const companiesMap = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const company = companiesMap.get(dividend.company_id);
  const companyName = dividend.company_name || company?.name || "Unknown Company";

  const renderSectionTitle = (title) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
  );

  const detailRows = [
    ["Declaration Date", fmtDate(dividend.declaration_date)],
    ["Ex-Dividend Date", fmtDate(dividend.ex_dividend_date)],
    ["Payment Date",     fmtDate(dividend.payment_date)],
    ["Dividend/Share",   `TZS ${fmt(dps)}`],
    ["Shares Held",      shares > 0 ? fmt(shares) : "\u2014"],
    ["Gross Amount",     `TZS ${fmt(gross)}`],
    ["Withholding Tax",  `TZS ${fmt(tax)}`],
    ["Net Amount",       `TZS ${fmt(net)}`],
    ["Remarks",          dividend.remarks || "\u2014"],
  ];

  const summaryItems = [
    { label: "Gross Amount",     value: `TZS ${fmt(gross)}`, valueColor: C.text },
    { label: "Withholding Tax",  value: `TZS ${fmt(tax)}`,   valueColor: C.red },
    { label: "Net Amount",       value: `TZS ${fmt(net)}`,   valueColor: C.green },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.56)", backdropFilter: "blur(3px)", zIndex: 9999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1.5px solid ${C.gray200}`, borderBottom: isMobile ? "none" : undefined, width: "100%", maxWidth: isMobile ? "100%" : 520, maxHeight: isMobile ? "92vh" : "95vh", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: isMobile ? "16px 18px 14px" : "18px 24px 16px", borderRadius: isMobile ? "16px 16px 0 0" : "16px 16px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#ffffff" }}>{companyName}</span>
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", gap: 8, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
              <span style={{ whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={12} stroke="rgba(255,255,255,0.6)" /> {fmt(dps)} per share</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>

        {/* Summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", borderBottom: `1px solid ${C.gray200}`, background: C.gray50, flexShrink: 0 }}>
          {summaryItems.map((item, i) => (
            <div key={i} style={{ padding: isMobile ? "10px 18px" : "12px 20px", borderLeft: (!isMobile && i > 0) ? `1px solid ${C.gray200}` : "none", borderBottom: isMobile && i < 2 ? `1px solid ${C.gray200}` : "none", background: i === 2 ? C.greenBg : "transparent", display: "flex", alignItems: isMobile ? "center" : "block", justifyContent: isMobile ? "space-between" : "initial" }}>
              <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isMobile ? 0 : 4 }}>{item.label}</div>
              <div>
                <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: item.valueColor, lineHeight: 1 }}>{item.value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Detail rows */}
        <div className="div-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          <div style={{ padding: "14px 20px" }}>
            {renderSectionTitle("Dividend Details")}
            {detailRows.map(([label, value], i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
                <span style={{ fontSize: 12, color: C.gray500 }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.text, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
              </div>
            ))}
          </div>
          {dividend.created_at && (
            <div style={{ padding: "0 20px 14px" }}>
              <div style={{ fontSize: 11, color: C.gray400 }}>Recorded: {fmtDateTime(dividend.created_at)}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "8px 18px" : "8px 24px", borderTop: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 8 : 11, color: C.gray400, fontFamily: "monospace", letterSpacing: isMobile ? 0 : "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "65%" : "none" }}>ID: {dividend.id}</span>
          <button onClick={onClose} style={{ padding: "5px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.navy} onMouseLeave={e=>e.currentTarget.style.borderColor=C.gray200}>Close</button>
        </div>
      </div>
    </div>
  );
});

// ── Dividend Mobile Card ──────────────────────────────────────────
const DividendMobileCard = memo(function DividendMobileCard({
  dividend, onEdit, onOpenDeleteModal, onMarkPaid,
  deletingId, bulkDeletingIds, markingPaidIds,
  isDE, isSAAD, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const net = Number(dividend.net_amount || 0) || (Number(dividend.total_amount || 0) - Number(dividend.withholding_tax || 0));
  const dps = Number(dividend.dividend_per_share || 0);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isSAAD }), [dividend, isDE, isSAAD]);

  const isRowDeleting    = deletingId === dividend.id || bulkDeletingIds.has(dividend.id);
  const isRowMarkingPaid = markingPaidIds.has(dividend.id);
  const isRowBusy        = isRowDeleting || isRowMarkingPaid;

  const rowActions = useMemo(() => [
    ...(perms.canMarkPaid ? [{ icon: <Icon name="checkCircle" size={14} />, label: isRowMarkingPaid ? "Marking Paid..." : "Mark as Paid", disabled: isRowBusy, onClick: () => onMarkPaid(dividend.id) }] : []),
    ...(perms.canEdit     ? [{ icon: <Icon name="edit" size={14} />,        label: "Edit",           disabled: isRowBusy, onClick: () => onEdit(dividend) }] : []),
    ...(perms.canDelete   ? [{ icon: <Icon name="trash" size={14} />,       label: isRowDeleting ? "Deleting..." : "Delete", danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(dividend) }] : []),
  ], [perms, isRowBusy, isRowMarkingPaid, isRowDeleting, dividend, onMarkPaid, onEdit, onOpenDeleteModal]);

  const cardBg  = perms.isPaid ? (isDark ? `${C.green}10` : "#F9FFFB") : C.white;
  const cardBdr = perms.isPaid ? (isDark ? `${C.green}55` : "#BBF7D0") : C.gray200;

  return (
    <div onClick={() => !isRowBusy && onOpenDetail(dividend.id)}
      style={{ background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: isRowBusy ? "not-allowed" : "pointer", opacity: isRowBusy ? 0.6 : 1, transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 5 }}>{dividend.company_name || "Unknown"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: C.greenBg, color: C.green, border: `1px solid ${isDark ? `${C.green}55` : "#BBF7D0"}`, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>TZS {fmt(dps)}/sh</span>
            <DivStatusBadge status={dividend.status} />
          </div>
        </div>
        {showActions && rowActions.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}><ActionMenu actions={rowActions} /></div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.gray500, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="calendar" size={12} stroke={C.gray400} /> {fmtDate(dividend.payment_date)}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, borderRadius: 9, padding: "8px 12px" }}>
        <div>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Net Amount</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>TZS {fmtSmart(net)}</div>
        </div>
      </div>
      {isRowBusy && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.gray400 }}>
          <Spinner size={11} color={C.gray400} /> Processing...
        </div>
      )}
    </div>
  );
});

// ── Dividend Row ──────────────────────────────────────────────────
const DividendRow = memo(function DividendRow({
  dividend, globalIdx, selected, onToggleOne,
  onEdit, onOpenDeleteModal, onMarkPaid,
  deletingId, bulkDeletingIds, markingPaidIds,
  isDE, isSAAD, showCheckbox, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const gross = Number(dividend.total_amount || 0);
  const tax = Number(dividend.withholding_tax || 0);
  const net = Number(dividend.net_amount || 0) || (gross - tax);
  const dps = Number(dividend.dividend_per_share || 0);
  const shares = Number(dividend.shares_held || 0);
  const isChecked = selected.has(dividend.id);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isSAAD }), [dividend, isDE, isSAAD]);

  const isRowDeleting    = deletingId === dividend.id || bulkDeletingIds.has(dividend.id);
  const isRowMarkingPaid = markingPaidIds.has(dividend.id);
  const isRowBusy        = isRowDeleting || isRowMarkingPaid;

  const rowActions = useMemo(() => [
    ...(perms.canMarkPaid ? [{ icon: isRowMarkingPaid ? null : <Icon name="checkCircle" size={14} />, label: isRowMarkingPaid ? "Marking Paid..." : "Mark as Paid", disabled: isRowBusy, onClick: () => onMarkPaid(dividend.id) }] : []),
    ...(perms.canEdit     ? [{ icon: <Icon name="edit" size={14} />,  label: "Edit",   disabled: isRowBusy, onClick: () => onEdit(dividend) }] : []),
    ...(perms.canDelete   ? [{ icon: isRowDeleting ? null : <Icon name="trash" size={14} />, label: isRowDeleting ? "Deleting..." : "Delete", danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(dividend) }] : []),
  ], [perms, isRowBusy, isRowMarkingPaid, isRowDeleting, dividend, onMarkPaid, onEdit, onOpenDeleteModal]);

  const rowBg      = perms.isPaid ? (isDark ? `${C.green}10` : "#F9FFFB") : "transparent";
  const rowBgHover = perms.isPaid ? (isDark ? `${C.green}1c` : "#F0FDF4") : C.gray50;

  return (
    <tr style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: rowBg, opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
      onClick={() => onOpenDetail(dividend.id)}
      onMouseEnter={e => { if (!isRowBusy) e.currentTarget.style.background = rowBgHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
      {showCheckbox && (
        <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => onToggleOne(dividend.id)} disabled={isRowBusy}
            style={{ cursor: isRowBusy ? "not-allowed" : "pointer", width: 15, height: 15, accentColor: isDark ? C.green : C.green }} />
        </td>
      )}
      <td style={{ padding: "7px 10px", color: C.gray400, fontWeight: 600, textAlign: "right" }}>{globalIdx}</td>
      <td style={{ padding: "7px 10px", color: C.gray600, whiteSpace: "nowrap" }}>{fmtDate(dividend.payment_date)}</td>
      <td style={{ padding: "7px 10px" }}>
        <div style={{ fontWeight: 700, color: C.text, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35 }}>{dividend.company_name || "Unknown"}</div>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{fmt(dps)}</span>
      </td>
      <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: C.text }}>{shares > 0 ? fmt(shares) : "\u2014"}</td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: C.text }}>{fmt(gross)}</td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ color: tax > 0 ? C.red : C.gray400, fontWeight: 700 }}>{tax > 0 ? fmt(tax) : "\u2014"}</span>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 800, border: `1px solid ${isDark ? `${C.green}55` : "#BBF7D0"}` }}>
          {fmt(net)}
        </span>
      </td>
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        <DivStatusBadge status={dividend.status} />
      </td>
      {showActions && (
        <td style={{ padding: "7px 12px", textAlign: "center", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
          {rowActions.length > 0 && <ActionMenu actions={rowActions} />}
        </td>
      )}
    </tr>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ══════════════════════════════════════════════════════════════════
export default function DividendsPage({ companies, showToast, role, cdsNumber }) {
  const { C, isDark } = useTheme();

  const TOOLBAR_INPUT  = { ...TOOLBAR_BASE, width: "100%", border: `1.5px solid ${C.gray200}`, padding: "0 10px 0 32px", outline: "none", color: C.text, background: C.white };
  const TOOLBAR_SELECT = { ...TOOLBAR_BASE, padding: "0 10px", background: C.white, color: C.text, cursor: "pointer", outline: "none", flexShrink: 0 };

  const isDE   = role === "DE";
  const isVR   = role === "VR";
  const isRO   = role === "RO";
  const isSAAD = role === "SA" || role === "AD";

  const isMobile = useIsMobile();

  const isMountedRef    = useRef(true);
  const divLoadRef      = useRef(0);
  const companyLoadRef  = useRef(0);

  const rootRef        = useRef(null);
  const touchStartYRef = useRef(null);
  const pullingRef     = useRef(false);
  const scrollHostRef  = useRef(null);

  const [dividends, setDividends]               = useState([]);
  const [localCompanies, setLocalCompanies]      = useState([]);
  const [loadingDividends, setLoadingDividends]  = useState(true);
  const [loadingCompanies, setLoadingCompanies]  = useState(true);
  const [pageError, setPageError]                = useState(null);

  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(50);
  const [selected, setSelected]         = useState(new Set());

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);

  const [deletingId, setDeletingId]           = useState(null);
  const [bulkDeletingIds, setBulkDeletingIds] = useState(new Set());
  const [markingPaidIds, setMarkingPaidIds]   = useState(new Set());

  const [deleteModal, setDeleteModal]           = useState(null);
  const [bulkDeleteModal, setBulkDeleteModal]   = useState(null);
  const [bulkMarkPaidModal, setBulkMarkPaidModal] = useState(null);
  const [formModal, setFormModal]               = useState({ open: false, dividend: null });
  const [detailModal, setDetailModal]           = useState(null);

  const effectiveCompanies = useMemo(
    () => (companies?.length ? companies : localCompanies),
    [companies, localCompanies]
  );

  // ── Individual loaders ──────────────────────────────────────────
  const loadDividends = useCallback(async ({ fromPull = false } = {}) => {
    const requestId = ++divLoadRef.current;
    if (!fromPull && isMountedRef.current) { setLoadingDividends(true); setPageError(null); }
    try {
      const data = await sbGetDividends(cdsNumber);
      if (!isMountedRef.current || requestId !== divLoadRef.current) return;
      setDividends(data);
      setPageError(null);
    } catch (e) {
      if (!isMountedRef.current || requestId !== divLoadRef.current) return;
      setPageError(e.message || "Failed to load dividends.");
      if (fromPull) showToast?.("Refresh failed", "error");
    } finally {
      if (isMountedRef.current && requestId === divLoadRef.current) {
        setLoadingDividends(false);
        if (fromPull) { setRefreshing(false); setPullDistance(0); }
      }
    }
  }, [cdsNumber, showToast]);

  const loadCompanies = useCallback(async () => {
    const requestId = ++companyLoadRef.current;
    if (isMountedRef.current) setLoadingCompanies(true);
    try {
      const data = await sbGetAllCompanies();
      if (!isMountedRef.current || requestId !== companyLoadRef.current) return;
      setLocalCompanies(data);
    } catch (e) {
      if (!isMountedRef.current || requestId !== companyLoadRef.current) return;
      showToast("Error loading companies: " + e.message, "error");
    } finally {
      if (isMountedRef.current && requestId === companyLoadRef.current) setLoadingCompanies(false);
    }
  }, [showToast]);

  // ── Boot effect ─────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    const companiesNeeded = !companies?.length;
    Promise.all([
      loadDividends(),
      companiesNeeded ? loadCompanies() : Promise.resolve().then(() => {
        if (isMountedRef.current) setLoadingCompanies(false);
      }),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { isMountedRef.current = false; };
  }, []); // intentionally run once on mount

  useEffect(() => {
    if (companies?.length) setLoadingCompanies(false);
  }, [companies]);

  // ── Pull-to-refresh ─────────────────────────────────────────────
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

  const handleTouchStart = useCallback((e) => {
    if (!isMobile || refreshing || loadingDividends) return;
    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; return; }
    touchStartYRef.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [isMobile, refreshing, loadingDividends, getScrollParent]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing || loadingDividends) return;
    if (touchStartYRef.current == null) return;
    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) { pullingRef.current = false; setPullDistance(0); return; }
    pullingRef.current = true;
    setPullDistance(Math.min(92, Math.round(Math.pow(deltaY, 0.85))));
  }, [isMobile, refreshing, loadingDividends, getScrollParent]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || loadingDividends) {
      touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return;
    }
    const shouldRefresh = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null; pullingRef.current = false;
    if (shouldRefresh) { setPullDistance(56); setRefreshing(true); loadDividends({ fromPull: true }); }
    else setPullDistance(0);
  }, [isMobile, refreshing, loadingDividends, pullDistance, loadDividends]);

  // ── Computed values ─────────────────────────────────────────────
  const isAnyDeleting    = !!deletingId || bulkDeletingIds.size > 0;
  const isAnyMarkingPaid = markingPaidIds.size > 0;
  const hasSelection     = selected.size > 0;

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const myDividends = useMemo(
    () => (cdsNumber ? dividends.filter(d => d.cds_number === cdsNumber) : dividends),
    [dividends, cdsNumber]
  );

  const divById     = useMemo(() => new Map(myDividends.map(d => [d.id, d])), [myDividends]);
  const companyById = useMemo(() => new Map(effectiveCompanies.map(c => [c.id, c])), [effectiveCompanies]);

  const stats = useMemo(() => {
    let total = 0, declared = 0, exDatePassed = 0, paid = 0;
    let totalGross = 0, totalTax = 0, totalNet = 0;
    for (const d of myDividends) {
      total++;
      totalGross += Number(d.total_amount || 0);
      totalTax   += Number(d.withholding_tax || 0);
      totalNet   += Number(d.net_amount || 0) || (Number(d.total_amount || 0) - Number(d.withholding_tax || 0));
      if      (d.status === "declared")       declared++;
      else if (d.status === "ex_date_passed") exDatePassed++;
      else if (d.status === "paid")           paid++;
    }
    return { total, declared, exDatePassed, paid, totalGross, totalTax, totalNet };
  }, [myDividends]);

  const filtered = useMemo(() => {
    let list = myDividends;
    if (statusFilter !== "All") list = list.filter(d => d.status === statusFilter);
    if (normalizedSearch) {
      list = list.filter(d => {
        const dateObj    = d.payment_date ? new Date(d.payment_date + "T00:00:00") : null;
        const monthName  = dateObj ? dateObj.toLocaleDateString("en-GB", { month: "long" }).toLowerCase()  : "";
        const monthShort = dateObj ? dateObj.toLocaleDateString("en-GB", { month: "short" }).toLowerCase() : "";
        const yearStr    = dateObj ? String(dateObj.getFullYear()) : "";
        const matchDate  = monthName.includes(normalizedSearch) || monthShort.includes(normalizedSearch)
          || (yearStr && normalizedSearch.length >= 4 && yearStr.includes(normalizedSearch));
        return matchDate
          || d.payment_date?.includes(normalizedSearch)
          || d.company_name?.toLowerCase().includes(normalizedSearch)
          || d.status?.toLowerCase().includes(normalizedSearch)
          || d.remarks?.toLowerCase().includes(normalizedSearch);
      });
    }
    return list.slice().sort((a, b) => {
      const aActive = a.status === "declared" || a.status === "ex_date_passed";
      const bActive = b.status === "declared" || b.status === "ex_date_passed";
      if (aActive !== bActive) return aActive ? -1 : 1;
      const da = a.payment_date || "", db = b.payment_date || "";
      return db > da ? 1 : db < da ? -1 : 0;
    });
  }, [myDividends, statusFilter, normalizedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = useMemo(() => Math.min(page, totalPages), [page, totalPages]);
  const paginated  = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  const resetPage    = useCallback(() => setPage(1), []);
  const resetFilters = useCallback(() => { setSearch(""); setStatusFilter(defaultStatus); setPage(1); }, []);

  const totals = useMemo(() => {
    let gross = 0, tax = 0, net = 0;
    for (const d of filtered) {
      gross += Number(d.total_amount || 0);
      tax   += Number(d.withholding_tax || 0);
      net   += Number(d.net_amount || 0) || (Number(d.total_amount || 0) - Number(d.withholding_tax || 0));
    }
    return { gross, tax, net };
  }, [filtered]);

  const paginatedIds = useMemo(() => paginated.map(d => d.id), [paginated]);

  const { allSelected, someSelected } = useMemo(() => ({
    allSelected:  paginatedIds.length > 0 && paginatedIds.every(id => selected.has(id)),
    someSelected: paginatedIds.some(id => selected.has(id)),
  }), [paginatedIds, selected]);

  const toggleAll = useCallback(() => {
    setSelected(prev => {
      const s = new Set(prev);
      if (paginatedIds.length > 0 && paginatedIds.every(id => s.has(id))) paginatedIds.forEach(id => s.delete(id));
      else paginatedIds.forEach(id => s.add(id));
      return s;
    });
  }, [paginatedIds]);

  const toggleOne = useCallback((id) => {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const selectedBuckets = useMemo(() => {
    const deletable = [], markablePaid = [];
    for (const id of selected) {
      const d = divById.get(id);
      if (!d) continue;
      if (isSAAD || (isDE && d.status === "declared")) deletable.push(id);
      else if (isSAAD && d.status !== "paid") deletable.push(id);
      if (d.status === "declared" || d.status === "ex_date_passed") markablePaid.push(id);
    }
    // Recalculate deletable properly
    const deletableCorrect = [];
    for (const id of selected) {
      const d = divById.get(id);
      if (!d) continue;
      if (isSAAD || (isDE && d.status === "declared")) deletableCorrect.push(id);
    }
    return { deletable: deletableCorrect, markablePaid };
  }, [selected, divById, isSAAD, isDE]);

  const canBulkDelete   = (isDE || isSAAD) && selectedBuckets.deletable.length > 0;
  const canBulkMarkPaid = (isDE || isSAAD) && selectedBuckets.markablePaid.length > 0;

  const openFormModal   = useCallback((dividend = null) => { if (loadingCompanies) return; setFormModal({ open: true, dividend }); }, [loadingCompanies]);
  const openDeleteModal = useCallback((dividend) => setDeleteModal({ id: dividend.id, company_name: dividend.company_name }), []);

  // ── Handlers ────────────────────────────────────────────────────
  const handleFormConfirm = useCallback(async (data) => {
    const isEdit = !!formModal.dividend;
    const payload = { ...data, cds_number: cdsNumber || null };
    try {
      if (isEdit) {
        await sbUpdateDividend(formModal.dividend.id, payload);
        if (!isMountedRef.current) return;
        setDividends(p => p.map(d => d.id === formModal.dividend.id ? { ...d, ...payload } : d));
        showToast("Dividend updated!", "success");
      } else {
        const rows = await sbInsertDividend(payload);
        if (!isMountedRef.current) return;
        const newRow = rows?.[0];
        if (!newRow) throw new Error("Insert succeeded but returned no data.");
        setDividends(p => [newRow, ...p]);
        showToast("Dividend recorded!", "success");
      }
      if (isMountedRef.current) setFormModal({ open: false, dividend: null });
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    }
  }, [formModal.dividend, cdsNumber, showToast]);

  const handleDelete = useCallback(async () => {
    const id = deleteModal?.id;
    if (!id) return;
    setDeleteModal(null);
    setDeletingId(id);
    try {
      await sbDeleteDividend(id);
      if (!isMountedRef.current) return;
      setDividends(p => p.filter(d => d.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      showToast("Dividend deleted.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setDeletingId(null);
    }
  }, [deleteModal, showToast]);

  const doBulkDelete = useCallback(async () => {
    const ids = bulkDeleteModal?.ids;
    if (!ids?.length) return;
    setBulkDeleteModal(null);
    setBulkDeletingIds(new Set(ids));
    try {
      await sbBulkDeleteDividends(ids);
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      setDividends(p => p.filter(d => !idSet.has(d.id)));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} deleted.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setBulkDeletingIds(new Set());
    }
  }, [bulkDeleteModal, showToast]);

  const handleMarkPaid = useCallback(async (id) => {
    setMarkingPaidIds(prev => { const s = new Set(prev); s.add(id); return s; });
    try {
      await sbUpdateDividendStatus(id, "paid");
      if (!isMountedRef.current) return;
      setDividends(p => p.map(d => d.id === id ? { ...d, status: "paid" } : d));
      showToast("Dividend marked as paid.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [showToast]);

  const doBulkMarkPaid = useCallback(async () => {
    const ids = bulkMarkPaidModal?.ids;
    if (!ids?.length) return;
    setBulkMarkPaidModal(null);
    setMarkingPaidIds(new Set(ids));
    try {
      await sbBulkUpdateDividendStatus(ids, "paid");
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      setDividends(p => p.map(d => idSet.has(d.id) ? { ...d, status: "paid" } : d));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} marked as paid.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(new Set());
    }
  }, [bulkMarkPaidModal, showToast]);

  const handleEdit = useCallback((dividend) => {
    openFormModal(dividend);
  }, [openFormModal]);

  // ── Stat cards ──────────────────────────────────────────────────
  const statCards = useMemo(() => {
    if (isSAAD) return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "Total Gross",     value: `TZS ${fmtSmart(stats.totalGross)}`,    sub: `${stats.total} records`,                                    icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Total Net",       value: `TZS ${fmtSmart(stats.totalNet)}`,      sub: "After tax",                                                 icon: <Icon name="barChart" size={17} />,   color: C.gold  },
    ];
    if (isDE) return [
      { label: "My Dividends",    value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.exDatePassed} ex-date`, icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Income",      value: `TZS ${fmtSmart(stats.totalNet)}`,      sub: "Net after tax",                                             icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Declared",        value: stats.declared,                          sub: "Awaiting payment",                                          icon: <Icon name="clock" size={17} />,      color: C.gold  },
    ];
    if (isVR || isRO) return [
      { label: "Total Records",   value: stats.total,                            sub: `${stats.paid} paid`,                                        icon: <Icon name="clipboard" size={17} />,  color: C.navy  },
      { label: "Total Net",       value: `TZS ${fmtSmart(stats.totalNet)}`,      sub: "After tax",                                                 icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Paid",            value: stats.paid,                              sub: "Completed dividends",                                       icon: <Icon name="checkCircle" size={17} />,color: C.gold  },
    ];
    // fallback (same as SA/AD)
    return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "Total Gross",     value: `TZS ${fmtSmart(stats.totalGross)}`,    sub: `${stats.total} records`,                                    icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Total Net",       value: `TZS ${fmtSmart(stats.totalNet)}`,      sub: "After tax",                                                 icon: <Icon name="barChart" size={17} />,   color: C.gold  },
    ];
  }, [C, stats, isSAAD, isDE, isVR, isRO]);

  const mobileStatCards = useMemo(() => {
    if (!isMobile) return statCards;
    const preferred = statCards.filter(s => s.label === "Total Net" || s.label === "YTD Income" || s.label === "Total Tax");
    return preferred.length >= 2 ? preferred.slice(0, 2) : statCards.slice(0, 2);
  }, [isMobile, statCards]);

  const showCheckbox = !isMobile;
  const showActions  = !isRO;

  const tableHeaders = showActions ? TABLE_HEADERS_WITH_ACTIONS : TABLE_HEADERS_WITHOUT_ACTIONS;

  const tfootLeftCols  = showCheckbox ? 7 : 6;
  const tfootRightCols = 1 + (showActions ? 1 : 0);

  const detailDividend = useMemo(
    () => detailModal ? (divById.get(detailModal) || null) : null,
    [detailModal, divById]
  );

  const closeDelete       = useCallback(() => setDeleteModal(null),                          []);
  const closeBulkDelete   = useCallback(() => setBulkDeleteModal(null),                      []);
  const closeBulkMarkPaid = useCallback(() => setBulkMarkPaidModal(null),                    []);
  const closeForm         = useCallback(() => setFormModal({ open: false, dividend: null }),  []);
  const closeDetail       = useCallback(() => setDetailModal(null),                          []);

  const hasActiveFilters = search || statusFilter !== "All";

  const pageHeight = "calc(100vh - 118px)";
  const pullReady  = pullDistance >= 64;

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
      style={{ height: isMobile ? "auto" : pageHeight, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden", position: "relative", paddingBottom: isMobile ? 96 : 0 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .div-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .div-scroll::-webkit-scrollbar-track { background: transparent; }
        .div-scroll::-webkit-scrollbar-thumb { background: ${isDark ? C.gray200 : "#cbd5e1"}; border-radius: 10px; }
        .div-scroll { scrollbar-width: thin; scrollbar-color: ${isDark ? C.gray200 : "#cbd5e1"} transparent; }
      `}</style>

      {/* ── Pull-to-refresh indicator ── */}
      {isMobile && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
          <div style={{ position: "absolute", left: "50%", top: 0, transform: `translate(-50%, ${Math.max(8, pullDistance - 34)}px)`, opacity: refreshing || pullDistance > 6 ? 1 : 0, transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease", background: C.white, border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`, borderRadius: 999, padding: "7px 12px", boxShadow: "0 8px 24px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${refreshing ? `${C.green}33` : C.gray200}`, borderTop: `2px solid ${pullReady || refreshing ? C.green : C.gray400}`, animation: refreshing ? "spin 0.8s linear infinite" : "none", transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`, transition: "transform 0.12s ease, border-color 0.12s ease", flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: refreshing ? C.green : (pullReady ? C.text : C.gray500), whiteSpace: "nowrap" }}>
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {deleteModal && <Modal type="confirm" title="Delete Dividend" message={`Delete this dividend for "${deleteModal.company_name}"? This cannot be undone.`} onConfirm={handleDelete} onClose={closeDelete} />}
      {bulkDeleteModal && <SimpleConfirmModal title="Delete Dividends" message={`Are you sure you want to delete ${bulkDeleteModal.ids.length} dividend(s)? This cannot be undone.`} count={bulkDeleteModal.ids.length} loading={bulkDeletingIds.size > 0} onConfirm={doBulkDelete} onClose={closeBulkDelete} />}
      {bulkMarkPaidModal && <SimpleConfirmModal title="Mark as Paid" message={`Are you sure you want to mark ${bulkMarkPaidModal.ids.length} dividend(s) as paid?`} count={bulkMarkPaidModal.ids.length} loading={isAnyMarkingPaid} onConfirm={doBulkMarkPaid} onClose={closeBulkMarkPaid} />}
      {formModal.open && <DividendFormModal key={formModal.dividend?.id || "new"} dividend={formModal.dividend} companies={effectiveCompanies} onConfirm={handleFormConfirm} onClose={closeForm} />}
      {detailDividend && <DividendDetailModal dividend={detailDividend} companies={effectiveCompanies} onClose={closeDetail} />}

      {/* ── Transform wrapper ── */}
      <div style={{ transform: isMobile ? `translateY(${pullDistance}px)` : "none", transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"), willChange: isMobile ? "transform" : "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>

        {/* ── Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 6 : 8, marginBottom: isMobile ? 10 : 8, flexShrink: 0 }}>
          {mobileStatCards.map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* ── Mobile toolbar ── */}
        {isMobile && (
          <div style={{ marginBottom: 10, flexShrink: 0 }}>
            {(isDE || isSAAD) ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400, pointerEvents: "none" }}><Icon name="search" size={14} /></span>
                  <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search company, date, status..." {...mobileInputAttrs}
                    style={{ width: "100%", height: 40, borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, paddingLeft: 34, fontSize: 13, outline: "none", color: C.text, boxSizing: "border-box" }}
                    onFocus={e => { e.target.style.borderColor = C.green; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
                </div>
                <button onClick={() => openFormModal(null)} disabled={loadingCompanies}
                  style={{ height: 40, padding: "0 16px", borderRadius: 9, border: "none", background: loadingCompanies ? C.gray200 : C.navy, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: loadingCompanies ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                  + Record
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400, pointerEvents: "none" }}><Icon name="search" size={14} /></span>
                <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} placeholder="Search company, date, status..." {...mobileInputAttrs}
                  style={{ width: "100%", height: 40, borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, paddingLeft: 34, fontSize: 13, outline: "none", color: C.text, boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.green; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
              </div>
            )}
          </div>
        )}

        {/* ── Desktop toolbar ── */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexShrink: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
              <div style={{ flex: 1, minWidth: 220, maxWidth: 360, position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}><Icon name="search" size={14} stroke={C.gray500} /></span>
                <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
                  placeholder="Search company, date, status, remarks..."
                  style={TOOLBAR_INPUT}
                  onFocus={e => { e.target.style.borderColor = C.green; e.target.style.background = C.white; }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; }} />
              </div>
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); resetPage(); }}
                style={{ ...TOOLBAR_SELECT, border: `1.5px solid ${statusFilter !== "All" ? "#0B1F3A" : C.gray200}`, color: statusFilter !== "All" ? (isDark ? C.gray800 : "#0B1F3A") : C.gray600, fontWeight: statusFilter !== "All" ? 700 : 400 }}
                onFocus={e => { e.target.style.borderColor = C.green; }}
                onBlur={e => { e.target.style.borderColor = statusFilter !== "All" ? "#0B1F3A" : C.gray200; }}>
                {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
              {hasSelection ? (
                <>
                  {canBulkMarkPaid && <button onClick={() => setBulkMarkPaidModal({ ids: selectedBuckets.markablePaid })} disabled={isAnyMarkingPaid} style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyMarkingPaid ? C.gray200 : C.green, color: "#ffffff", fontWeight: 700, cursor: isAnyMarkingPaid ? "not-allowed" : "pointer" }}>{isAnyMarkingPaid ? <><Spinner size={12} color="#888" /> Marking Paid...</> : <><Icon name="checkCircle" size={12} /> Mark Paid {selectedBuckets.markablePaid.length}</>}</button>}
                  {canBulkDelete && <button onClick={() => setBulkDeleteModal({ ids: selectedBuckets.deletable })} disabled={isAnyDeleting} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyDeleting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyDeleting ? "not-allowed" : "pointer" }}>{isAnyDeleting ? <><Spinner size={12} color={C.red} /> Deleting...</> : <><Icon name="trash" size={12} /> Delete {selectedBuckets.deletable.length}</>}</button>}
                  <Btn variant="secondary" onClick={() => setSelected(new Set())}>Clear Selection</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={loadDividends}>Refresh</Btn>
                  {(search || statusFilter !== defaultStatus) && <Btn variant="secondary" onClick={resetFilters}>Reset</Btn>}
                  {(isDE || isSAAD) && <Btn variant="navy" icon={<Icon name="plus" size={14} stroke="#ffffff" />} onClick={() => openFormModal(null)} disabled={loadingCompanies} style={{ boxShadow: "0 4px 16px rgba(11,31,58,0.45)" }}>Record Dividend</Btn>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: isMobile ? "unset" : 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
          <SectionCard title={`Dividend History (${filtered.length}${filtered.length !== stats.total ? ` of ${stats.total}` : ""})`}>
            {loadingDividends ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 13 }}>Loading dividends...</div>
              </div>
            ) : pageError ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.red }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}><Icon name="xCircle" size={32} /></div>
                <div style={{ fontWeight: 600 }}>Failed to load dividends</div>
                <div style={{ fontSize: 13, marginTop: 4, color: C.gray400 }}>{pageError}</div>
                <button onClick={loadDividends} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
              </div>
            ) : stats.total === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}><Icon name="dollarSign" size={40} /></div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>No dividends yet</div>
                <div style={{ fontSize: 13 }}>{isDE ? 'Tap "Record" to add your first dividend' : "Dividends will appear here once recorded"}</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}><Icon name="search" size={32} /></div>
                <div style={{ fontWeight: 600, color: C.text }}>No results found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</div>
                <button onClick={resetFilters} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reset Filters</button>
              </div>
            ) : isMobile ? (
              <>
                <div style={{ padding: "8px 12px" }}>
                  {paginated.map(dividend => (
                    <DividendMobileCard key={dividend.id} dividend={dividend}
                      onEdit={handleEdit} onOpenDeleteModal={openDeleteModal} onMarkPaid={handleMarkPaid}
                      deletingId={deletingId} bulkDeletingIds={bulkDeletingIds} markingPaidIds={markingPaidIds}
                      isDE={isDE} isSAAD={isSAAD} showActions={showActions} onOpenDetail={setDetailModal}
                    />
                  ))}
                </div>
                <MobilePagination page={safePage} totalPages={totalPages} setPage={setPage} filtered={filtered.length} pageSize={pageSize} />
              </>
            ) : (
              <>
                <div className="div-scroll" style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                    {showActions ? (
                      <colgroup>
                        <col style={{ width: 30 }} /><col style={{ width: 32 }} /><col style={{ width: 96 }} />
                        <col style={{ width: 140 }} /><col style={{ width: 88 }} /><col style={{ width: 72 }} />
                        <col style={{ width: 100 }} /><col style={{ width: 80 }} /><col style={{ width: 110 }} />
                        <col style={{ width: 96 }} /><col style={{ width: 80 }} />
                      </colgroup>
                    ) : (
                      <colgroup>
                        <col style={{ width: 30 }} /><col style={{ width: 32 }} /><col style={{ width: 96 }} />
                        <col style={{ width: 140 }} /><col style={{ width: 88 }} /><col style={{ width: 72 }} />
                        <col style={{ width: 100 }} /><col style={{ width: 80 }} /><col style={{ width: 110 }} />
                        <col style={{ width: 96 }} />
                      </colgroup>
                    )}
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {showCheckbox && (
                          <th style={{ padding: "7px 10px", borderBottom: `2px solid ${C.gray200}`, width: 36, background: isDark ? C.gray50 : "#F0F4F8" }}>
                            <input type="checkbox" checked={allSelected}
                              ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                              onChange={toggleAll}
                              style={{ cursor: "pointer", width: 15, height: 15, accentColor: isDark ? C.green : C.green }} />
                          </th>
                        )}
                        {tableHeaders.map(h => (
                          <th key={h.label} style={{ padding: "7px 10px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: isDark ? C.gray50 : "#F0F4F8" }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((dividend, i) => (
                        <DividendRow key={dividend.id} dividend={dividend}
                          globalIdx={(safePage - 1) * pageSize + i + 1}
                          selected={selected} onToggleOne={toggleOne}
                          onEdit={handleEdit} onOpenDeleteModal={openDeleteModal} onMarkPaid={handleMarkPaid}
                          deletingId={deletingId} bulkDeletingIds={bulkDeletingIds} markingPaidIds={markingPaidIds}
                          isDE={isDE} isSAAD={isSAAD}
                          showCheckbox={showCheckbox} showActions={showActions} onOpenDetail={setDetailModal}
                        />
                      ))}
                    </tbody>
                    {filtered.length > 1 && (
                      <tfoot>
                        <tr style={{ background: C.gray50, borderTop: `2px solid ${C.gray200}`, verticalAlign: "top" }}>
                          <td colSpan={tfootLeftCols} style={{ padding: "8px 10px", fontWeight: 700, color: C.gray600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            TOTALS ({filtered.length} rows{filtered.length > pageSize ? `, page shows ${paginated.length}` : ""})
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>{fmt(totals.tax)}</div>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{fmt(totals.net)}</div>
                          </td>
                          <td colSpan={tfootRightCols} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <Pagination page={safePage} totalPages={totalPages} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} total={stats.total} filtered={filtered.length} />
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
