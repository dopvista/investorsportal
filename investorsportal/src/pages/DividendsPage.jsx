// ── src/pages/DividendsPage.jsx ─────────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  useTheme,
  fmt, fmtSmart, downloadPNGWithWatermark,
  Btn, StatCard, SectionCard, Modal, ActionMenu, ModalShell,
  DividendFormModal,
} from "../components/ui";
import { Icon } from "../lib/icons";
import {
  sbGetDividends,
  sbGetAllCompanies,
  sbGetTransactionCompanies,
  sbInsertDividend,
  sbUpdateDividend,
  sbDeleteDividend,
  sbUpdateDividendStatus,
  sbBulkUpdateDividendStatus,
  sbBulkDeleteDividends,
  sbGetAllDividendEvents,
  sbUpdateDividendEvent,
  sbRefreshDividendEvent,
  sbGetPortfolioAsAt,
  sbGetTransactions,
  sbGetVerifiedTransactions,
  sbGetCdsAccount,
  sbGetPriceAtDate,
  sbGetTransactionPriceNearDate,
  sbGetCompanyPriceHistory,
} from "../lib/supabase";

// Resolves the market price for a given company on a specific historical date.
// Used at pay-time to store an accurate price rather than today's price.
// Does NOT use transaction approximation — we only store reliable prices here;
// approximate display fallback (~) is handled separately in DividendDetailModal.
async function resolveHistoricalPrice(companyId, ticker, dateStr) {
  try {
    const rows = await sbGetPriceAtDate(companyId, dateStr);
    if (rows?.length > 0 && Number(rows[0].price) > 0) return Number(rows[0].price);
  } catch {}
  try {
    if (ticker) {
      const history = await sbGetCompanyPriceHistory(ticker, 365);
      if (Array.isArray(history) && history.length > 0) {
        const match = history.filter(h => h.date && h.date <= dateStr).sort((a, b) => b.date.localeCompare(a.date))[0];
        if (match && Number(match.price) > 0) return Number(match.price);
      }
    }
  } catch {}
  return null;
}

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
  pending:        { label: "Pending",   color: "#6B7280", bg: isDark ? "rgba(107,114,128,0.18)" : "#F3F4F6", border: isDark ? "rgba(107,114,128,0.4)" : "#D1D5DB", icon: <Icon name="clock" size={14} /> },
  declared:       { label: "Declared",  color: "#C2410C", bg: isDark ? "#C2410C22" : "#FFF7ED", border: isDark ? "#C2410C55" : "#FED7AA", icon: <Icon name="checkCircle" size={14} /> },
  ex_date_passed: { label: "Ex-Date",   color: "#1D4ED8", bg: isDark ? "#1D4ED828" : "#EFF6FF", border: isDark ? "#1D4ED855" : "#BFDBFE", icon: "📅" },
  paid:           { label: "Paid",      color: C.green,   bg: C.greenBg,                        border: isDark ? `${C.green}55` : "#BBF7D0", icon: <Icon name="checkCircle" size={14} /> },
  rejected:       { label: "Rejected",  color: C.red,     bg: isDark ? `${C.red}22` : "#FFF5F5", border: isDark ? `${C.red}55` : "#FECACA", icon: <Icon name="xCircle" size={14} /> },
});

const defaultStatus = "All";
const statusOptions = [
  ["All", "All Statuses"],
  ["pending", "Pending"],
  ["declared", "Declared"],
  ["ex_date_passed", "Ex-Date Passed"],
  ["paid", "Paid"],
  ["rejected", "Rejected"],
];

const TABLE_HEADERS_WITH_ACTIONS = [
  { label: "#",        align: "right",  width: "3%"  },
  { label: "Company",  align: "left",   width: "10%" },
  { label: "Year",     align: "center", width: "5%"  },
  { label: "Type",     align: "center", width: "7%"  },
  { label: "Pay Date", align: "left",   width: "9%"  },
  { label: "DPS",      align: "right",  width: "7%"  },
  { label: "Shares",   align: "right",  width: "7%"  },
  { label: "Gross",    align: "right",  width: "9%"  },
  { label: "Tax",      align: "right",  width: "6%"  },
  { label: "Net",      align: "right",  width: "9%"  },
  { label: "Status",   align: "left",   width: "21%" },
  { label: "Actions",  align: "center", width: "7%"  },
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
  const STATUS = useMemo(() => getStatusConfig(C, isDark), [C, isDark]);
  const s = STATUS[status] || STATUS.declared;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "0 10px", height: 24, borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {s.icon} {s.label}
    </span>
  );
});

// ── Simple Confirm Modal ──────────────────────────────────────────
const SimpleConfirmModal = memo(function SimpleConfirmModal({
  title, message, count, onConfirm, onClose, loading,
  accentColor, accentBg, accentBdr, icon, confirmLabel = "Confirm", itemLabel = "dividend",
}) {
  const { C, isDark } = useTheme();
  const color = accentColor || C.red;
  const bg    = accentBg  || (isDark ? `${color}28` : `${color}18`);
  const bdr   = accentBdr || (isDark ? `${color}55` : `${color}44`);
  const ico   = icon || <Icon name="trash" size={18} />;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16 }}>{title}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count} {itemLabel}{count > 1 ? "s" : ""} selected</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ background: bg, border: `1px solid ${bdr}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
            <span style={{ color, marginTop: 1, flexShrink: 0 }}>{ico}</span>
            <div style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.85)" : color, lineHeight: 1.5 }}>{message}</div>
          </div>
          <div style={{ fontSize: 13, color: isDark ? C.gray800 : C.gray600 }}>Are you sure you want to proceed?</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: loading ? C.gray200 : color, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading ? <><Spinner size={13} color="#fff" /> Processing...</> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Reject Modal ─────────────────────────────────────────────────
function RejectModal({ count, onConfirm, onClose }) {
  const { C } = useTheme();
  const [comment, setComment] = useState("");
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState("");

  const handleSubmit = useCallback(async () => {
    if (!comment.trim()) return setErr("Rejection reason is required");
    setSaving(true);
    try { await onConfirm(comment.trim()); }
    catch (e) { setErr(e.message); setSaving(false); }
  }, [comment, onConfirm]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><Icon name="xCircle" size={15} /> Reject Dividend{count > 1 ? "s" : ""}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count > 1 ? `${count} dividends selected` : "1 dividend selected"}</div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          {err && <div style={{ background: C.redBg, border: `1px solid ${C.red}55`, color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Rejection Reason <span style={{ color: C.red }}>*</span></label>
          <textarea value={comment} onChange={e => { setComment(e.target.value); setErr(""); }} placeholder="Explain why this dividend is being rejected..." rows={4}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit", resize: "vertical", color: C.text, background: C.white, boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = C.red; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
          <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>This reason will be visible to the Data Entrant.</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: saving ? C.gray200 : C.red, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {saving ? <><Spinner size={13} color="#fff" /> Rejecting...</> : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Mark as Paid Modal ────────────────────────────────────────────
function MarkAsPaidModal({ ids, defaultPaymentDate, onConfirm, onClose }) {
  const { C, isDark } = useTheme();
  const today = new Date().toISOString().slice(0, 10);
  const [paymentDate, setPaymentDate] = useState(defaultPaymentDate || today);
  const [saving, setSaving] = useState(false);
  const count = ids.length;

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try { await onConfirm(paymentDate || null); }
    catch { setSaving(false); }
  }, [paymentDate, onConfirm]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><Icon name="checkCircle" size={15} /> Mark as Paid</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count > 1 ? `${count} dividends selected` : "1 dividend selected"}</div>
          </div>
          <button onClick={onClose} disabled={saving} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ background: isDark ? `${C.green}18` : "#F0FDF4", border: `1px solid ${isDark ? `${C.green}44` : "#BBF7D0"}`, borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <Icon name="checkCircle" size={16} stroke={C.green} />
            <span style={{ fontSize: 13, color: isDark ? "rgba(255,255,255,0.85)" : C.green, fontWeight: 600 }}>
              {count > 1 ? `These ${count} dividends` : "This dividend"} will be marked as paid.
            </span>
          </div>
          <label style={{ fontSize: 12, fontWeight: 700, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Actual Payment Date</label>
          <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit", color: C.text, background: C.white, boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = C.green; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
          <div style={{ fontSize: 11, color: C.gray400, marginTop: 5 }}>Confirm or adjust if the actual payment date differs from the scheduled date.</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: saving ? C.gray200 : C.green, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {saving ? <><Spinner size={13} color="#fff" /> Processing...</> : <><Icon name="checkCircle" size={14} stroke="#fff" /> Mark as Paid</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Desktop Pagination ────────────────────────────────────────────
const PgBtn = memo(function PgBtn({ onClick, disabled, label, active }) {
  const { C } = useTheme();
  const isNum = typeof label === "number";
  const display = isNum ? label.toLocaleString() : label;
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ minWidth: 28, height: 28, padding: isNum ? "0 6px" : "0 4px", borderRadius: 6, border: `1.5px solid ${active ? "#0B1F3A" : C.gray200}`, background: active ? "#0B1F3A" : disabled ? C.gray50 : C.white, color: active ? "#ffffff" : disabled ? C.gray400 : C.gray600, fontWeight: active ? 700 : 500, fontSize: 12, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}>
      {display}
    </button>
  );
});

const Pagination = memo(function Pagination({ page, totalPages, pageSize, setPage, setPageSize, total, filtered }) {
  const { C } = useTheme();
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, filtered);

  const pages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const set = new Set([1, 2, page - 1, page, page + 1, totalPages - 1, totalPages]);
    const nums = [...set].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
    const arr = [];
    for (let i = 0; i < nums.length; i++) {
      if (i > 0 && nums[i] - nums[i - 1] > 1) arr.push("...");
      arr.push(nums[i]);
    }
    return arr;
  }, [page, totalPages]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: C.gray50 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 12, color: C.gray400 }}>
          Showing <strong style={{ color: C.text }}>{from === to ? from.toLocaleString() : `${from.toLocaleString()}\u2013${to.toLocaleString()}`}</strong> of <strong style={{ color: C.text }}>{filtered.toLocaleString()}</strong>
          {filtered !== total ? ` (${total.toLocaleString()} total)` : ""}
        </span>
        <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
          style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${C.gray200}`, fontSize: 11, fontFamily: "inherit", color: C.gray600, outline: "none", background: C.white, cursor: "pointer" }}>
          <option value={50}>50 / page</option>
          <option value={100}>100 / page</option>
          <option value={200}>200 / page</option>
          {filtered > 1000 && <option value={500}>500 / page</option>}
          {filtered > 5000 && <option value={1000}>1000 / page</option>}
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
        <strong style={{ color: C.text }}>{from === to ? from.toLocaleString() : `${from.toLocaleString()}\u2013${to.toLocaleString()}`}</strong> of <strong style={{ color: C.text }}>{filtered.toLocaleString()}</strong>
      </span>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === 1 ? C.gray50 : C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>\u2039</button>
          <span style={{ fontSize: 11, color: C.gray500, fontWeight: 600, whiteSpace: "nowrap" }}>{page.toLocaleString()} / {totalPages.toLocaleString()}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === totalPages ? C.gray50 : C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>\u203A</button>
        </div>
      )}
    </div>
  );
});

// ── Row permissions ───────────────────────────────────────────────
function getDivPermissions({ dividend, isDE, isVR, isSAAD, isAD, isSA, todayIso }) {
  const isPending    = dividend.status === "pending";
  const isDeclared   = dividend.status === "declared";
  const isExDate     = dividend.status === "ex_date_passed";
  const isPaid       = dividend.status === "paid";
  const isRejected   = dividend.status === "rejected";
  const isReviewable = isDeclared || isExDate;
  // Cannot mark as paid before the scheduled payment date.
  const isPaymentLocked = !!(dividend.payment_date && todayIso && dividend.payment_date > todayIso);
  return {
    canConfirm:  (isSA || isDE || isAD) && (isPending || isRejected),
    canEdit:     (isSAAD && !isPaid) || (isDE && (isPending || isRejected)),
    canDelete:   isDE ? (isPending || isRejected) : (isSAAD && !isPaid),
    canMarkPaid: (isSAAD || isVR) && isReviewable,
    canReject:   (isSAAD || isVR) && isReviewable,
    canUnpay:    isSAAD && isPaid,
    isPending, isDeclared, isExDate, isPaid, isRejected, isPaymentLocked,
  };
}

// ── Dividend Detail Modal ─────────────────────────────────────────
const DividendDetailModal = memo(function DividendDetailModal({ dividend, companies = [], allDividends = [], onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const STATUS = useMemo(() => getStatusConfig(C, isDark), [C, isDark]);
  const captureRef = useRef(null);
  const [downloading, setDownloading] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);
  const [cdsAccountName, setCdsAccountName] = useState(null);
  const [resolvedPrice, setResolvedPrice] = useState(null);
  const [priceIsApprox, setPriceIsApprox] = useState(false);

  useEffect(() => {
    if (!dividend?.cds_number) { setCdsAccountName(""); return; }
    let cancelled = false;
    setCdsAccountName(null);
    sbGetCdsAccount(dividend.cds_number)
      .then(acc => { if (!cancelled) setCdsAccountName(acc?.cds_name || ""); })
      .catch(() => { if (!cancelled) setCdsAccountName(""); });
    return () => { cancelled = true; };
  }, [dividend?.cds_number]);

  // Resolve historical market price for paid dividends without a stored price
  useEffect(() => {
    if (dividend?.status !== "paid" || Number(dividend?.market_price_at_payment) > 0) {
      setResolvedPrice(null);
      setPriceIsApprox(false);
      return;
    }
    // Price date priority: ex-dividend date → year-end of dividend year → paid_at → payment_date
    const priceDate =
      dividend?.ex_dividend_date ||
      (dividend?.dividend_year ? `${dividend.dividend_year}-12-31` : null) ||
      dividend?.paid_at?.split("T")[0] ||
      dividend?.payment_date;
    if (!priceDate || !dividend?.company_id) return;
    let cancelled = false;
    (async () => {
      // 1. Our own daily snapshot table — zero API cost, most reliable
      try {
        const rows = await sbGetPriceAtDate(dividend.company_id, priceDate);
        if (!cancelled && rows?.length > 0 && Number(rows[0].price) > 0) {
          setResolvedPrice(Number(rows[0].price)); setPriceIsApprox(false); return;
        }
      } catch {}
      // 2. DSE price history API — up to 365 days back
      try {
        const ticker = companies.find(c => c.id === dividend.company_id)?.name;
        if (ticker) {
          const history = await sbGetCompanyPriceHistory(ticker, 365);
          if (!cancelled && Array.isArray(history) && history.length > 0) {
            const match = history.filter(h => h.date && h.date <= priceDate).sort((a, b) => b.date.localeCompare(a.date))[0];
            if (match && Number(match.price) > 0) {
              setResolvedPrice(Number(match.price)); setPriceIsApprox(false); return;
            }
          }
        }
      } catch {}
      // 3. Nearest verified transaction price — approximate fallback (~)
      try {
        const txns = await sbGetTransactionPriceNearDate(dividend.company_id, priceDate);
        if (!cancelled && Array.isArray(txns) && txns.length > 0) {
          const refTime = new Date(priceDate).getTime();
          const closest = txns.filter(t => Number(t.price) > 0).sort((a, b) => Math.abs(new Date(a.date) - refTime) - Math.abs(new Date(b.date) - refTime))[0];
          if (closest) { setResolvedPrice(Number(closest.price)); setPriceIsApprox(true); return; }
        }
      } catch {}
      if (!cancelled) setResolvedPrice(0);
    })();
    return () => { cancelled = true; };
  }, [dividend?.id, dividend?.status, dividend?.market_price_at_payment, dividend?.company_id, dividend?.ex_dividend_date, dividend?.dividend_year, dividend?.paid_at, dividend?.payment_date, companies]);

  const handleDownloadPNG = useCallback(async () => {
    if (!captureRef.current || downloading) return;
    setDownloading(true);
    try {
      const name = dividend.company_name || "Dividend";
      await downloadPNGWithWatermark(captureRef.current, `${name}_Dividend_${dividend.payment_date || "detail"}.png`, { isDark, isMobile });
    } catch {}
    setDownloading(false);
  }, [downloading, dividend, isDark, isMobile]);

  if (!dividend) return null;


  const st = STATUS[dividend.status] || STATUS.declared;
  const gross = Number(dividend.total_amount || 0);
  const tax = Number(dividend.withholding_tax || 0);
  const net = Number(dividend.net_amount || 0) || (gross - tax);
  const dps = Number(dividend.dividend_per_share || 0);
  const shares = Number(dividend.shares_held || 0);
  const taxPct = gross > 0 ? ((tax / gross) * 100).toFixed(1) : "0.0";

  const companiesMap = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);
  const company = companiesMap.get(dividend.company_id);
  const companyName = dividend.company_name || company?.name || "Unknown Company";

  // Market price: for paid dividends use stored price → fallback chain; for others use current price
  const marketPrice = dividend.status === "paid"
    ? Number(dividend.market_price_at_payment || resolvedPrice || 0)
    : Number(company?.price || 0);
  const yieldPct = (dps > 0 && marketPrice > 0) ? ((dps / marketPrice) * 100).toFixed(2) : null;
  const marketValue = shares > 0 && marketPrice > 0 ? shares * marketPrice : null;

  // Previous dividend data (for comparison box)
  const prevDividend = useMemo(() => {
    if (!dividend.company_id || dps <= 0) return null;
    const thisDate = dividend.payment_date || dividend.declaration_date || "";
    const prev = allDividends
      .filter(d => d.company_id === dividend.company_id && d.id !== dividend.id)
      .sort((a, b) => {
        const da = a.payment_date || a.declaration_date || "";
        const db = b.payment_date || b.declaration_date || "";
        return db > da ? 1 : db < da ? -1 : 0;
      })
      .find(d => (d.payment_date || d.declaration_date || "") < thisDate);
    if (!prev) return null;
    const prevDps = Number(prev.dividend_per_share || 0);
    if (prevDps <= 0) return null;
    const prevNet = Number(prev.net_amount || 0) || (Number(prev.total_amount || 0) - Number(prev.withholding_tax || 0));
    const prevShares = Number(prev.shares_held || 0);
    const change = ((dps - prevDps) / prevDps) * 100;
    return {
      prevDps, prevNet, prevShares, change,
      year: prev.dividend_year,
      type: (prev.dividend_type || "annual"),
    };
  }, [allDividends, dividend, dps]);

  // Type badge colors (matches table pill colors)
  const typeColors = {
    annual:  { bg: isDark ? "#374151" : "#F3F4F6", color: isDark ? "#D1D5DB" : "#374151", border: isDark ? "#4B5563" : "#D1D5DB" },
    interim: { bg: isDark ? "#451A03" : "#FFFBEB", color: isDark ? "#FCD34D" : "#D97706", border: isDark ? "#92400E" : "#FDE68A" },
    final:   { bg: isDark ? "#1E3A5F" : "#EFF6FF", color: isDark ? "#93C5FD" : "#1D4ED8", border: isDark ? "#1D4ED8" : "#BFDBFE" },
    special: { bg: isDark ? "#3B0764" : "#F5F3FF", color: isDark ? "#C4B5FD" : "#7C3AED", border: isDark ? "#7C3AED" : "#DDD6FE" },
  };
  const divType = (dividend.dividend_type || "annual").toLowerCase();
  const tc = typeColors[divType] || typeColors.annual;

  const renderSectionTitle = (title) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
  );

  const renderKVRows = (rows) => rows.map(([label, value, valueColor, badge], i, arr) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` : "none" }}>
      <span style={{ fontSize: 12, color: C.gray500 }}>{label}</span>
      {badge
        ? <span style={{ fontSize: 11, fontWeight: 700, color: valueColor || C.green, background: isDark ? `${valueColor || C.green}22` : `${valueColor || C.green}18`, border: `1px solid ${isDark ? `${valueColor || C.green}44` : `${valueColor || C.green}33`}`, borderRadius: 10, padding: "1px 8px" }}>{value}</span>
        : <span style={{ fontSize: 12, fontWeight: 600, color: valueColor || C.text, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
      }
    </div>
  ));

  const summaryItems = [
    { label: "Gross Amount",         currency: "TZS", amount: fmt(gross), sub: `${shares > 0 ? fmt(shares) : "—"} shares`, valueColor: C.text },
    { label: "Withholding Tax",      currency: "TZS", amount: fmt(tax),   sub: `${taxPct}% of gross`,                      valueColor: C.red  },
    { label: "Net Amount",           currency: "TZS", amount: fmt(net),   sub: "after tax",                                valueColor: C.green },
  ];

  // Left panel rows — mobile omits fields already shown in stat bar / header / prev-div box
  const leftRows = [
    ...(dividend.declaration_date  ? [["Declaration Date",  fmtDate(dividend.declaration_date)]]  : []),
    ...(dividend.ex_dividend_date  ? [["Ex-Dividend Date",  fmtDate(dividend.ex_dividend_date)]]  : []),
    ...(dividend.closure_date      ? [["Closure Date",      fmtDate(dividend.closure_date)]]      : []),
    // Payment Date / Paid Date
    ...(dividend.status === "paid" && dividend.paid_at
      ? [["Paid Date", fmtDate(dividend.paid_at), C.green]]
      : dividend.payment_date ? [["Payment Date", fmtDate(dividend.payment_date)]] : []),
    ["Remarks", dividend.remarks || "—"],
    ...(dividend.status === "rejected" && dividend.rejection_reason ? [["Rejection Reason", dividend.rejection_reason, C.red]] : []),
  ];

  const taxRows = [
    ["Gross Amount",    `TZS ${fmt(gross)}`],
    ["Tax Rate",        `${taxPct}%`],
    ["Withholding Tax", `TZS ${fmt(tax)}`, C.red],
  ];

  const auditIconColor = isDark ? undefined : "#374151";

  const renderAuditSteps = (compact) => {
    const iconSz = compact ? 24 : 26;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "5px 8px" : "6px 8px", borderRadius: 8, background: isDark ? "rgba(255,255,255,0.06)" : C.gray100, border: `1px solid ${C.gray600}22` }}>
          <div style={{ width: iconSz, height: iconSz, borderRadius: "50%", background: `${C.gray600}20`, border: `1.5px solid ${C.gray600}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="fileText" size={compact ? 10 : 11} stroke={auditIconColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: C.gray600 }}>Recorded</div>
            <div style={{ fontSize: compact ? 9 : 10, color: C.gray400 }}>{fmtDateTime(dividend.created_at) || "—"}</div>
          </div>
          {dividend.created_by_name && <span style={{ fontSize: compact ? 10 : 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.created_by_name}</span>}
        </div>
        {dividend.status === "paid" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "5px 8px" : "6px 8px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.green}22` }}>
            <div style={{ width: iconSz, height: iconSz, borderRadius: "50%", background: `${C.green}20`, border: `1.5px solid ${C.green}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="checkCircle" size={compact ? 10 : 11} stroke={auditIconColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: C.green }}>Paid</div>
              <div style={{ fontSize: compact ? 9 : 10, color: C.gray400 }}>{fmtDateTime(dividend.paid_at) || fmtDateTime(dividend.updated_at) || "—"}</div>
            </div>
            {dividend.paid_by_name && <span style={{ fontSize: compact ? 10 : 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.paid_by_name}</span>}
          </div>
        )}
        {dividend.status === "rejected" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "5px 8px" : "6px 8px", borderRadius: 8, background: isDark ? `${C.red}18` : "#FFF5F5", border: `1px solid ${isDark ? `${C.red}44` : "#FECACA"}` }}>
              <div style={{ width: iconSz, height: iconSz, borderRadius: "50%", background: `${C.red}20`, border: `1.5px solid ${C.red}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="xCircle" size={compact ? 10 : 11} stroke={C.red} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: C.red }}>Rejected</div>
                <div style={{ fontSize: compact ? 9 : 10, color: C.gray400 }}>{fmtDateTime(dividend.rejected_at) || "—"}</div>
              </div>
              {dividend.rejected_by_name && <span style={{ fontSize: compact ? 10 : 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.rejected_by_name}</span>}
            </div>
            {dividend.rejection_reason && (
              <div style={{ padding: "6px 10px", background: isDark ? `${C.red}14` : "#FFF5F5", borderRadius: 8, border: `1px solid ${isDark ? `${C.red}33` : "#FECACA"}`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                💬 {dividend.rejection_reason}
              </div>
            )}
          </div>
        )}
        {dividend.status !== "paid" && dividend.status !== "rejected" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: compact ? "5px 8px" : "6px 8px", borderRadius: 8, background: "transparent", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, opacity: 0.45 }}>
            <div style={{ width: iconSz, height: iconSz, borderRadius: "50%", background: C.gray100, border: `1.5px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="checkCircle" size={compact ? 10 : 11} stroke={C.gray400} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: C.gray400 }}>Paid</div>
              <div style={{ fontSize: compact ? 9 : 10, color: C.gray400 }}>Awaiting</div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderLeftPanel = () => (
    <div style={{ padding: "14px 20px" }}>
      {renderSectionTitle("Dividend Details")}
      {renderKVRows(leftRows)}
      {renderPrevDividendDesktop()}
    </div>
  );

  const renderTaxPanel = () => (
    <div style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
      <div style={{ padding: "14px 20px 10px" }}>
        {renderSectionTitle("Tax & Income")}
        {renderKVRows(taxRows)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", background: isDark ? `${C.green}18` : "#F0FDF4", borderTop: `1px solid ${isDark ? `${C.green}44` : "#BBF7D0"}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.05em" }}>Net Income</span>
        <span style={{ fontSize: 15, fontWeight: 900, color: C.green }}>TZS {fmt(net)}</span>
      </div>
    </div>
  );

  const renderPrevDividendDesktop = () => {
    if (!prevDividend) return null;
    const isUp  = prevDividend.change >= 0;
    const glCol = isUp ? C.green : C.red;
    const glBg  = isUp ? (isDark ? `${C.green}18` : "#F0FDF4") : (isDark ? `${C.red}18` : "#FFF5F5");
    const glBdr = isUp ? (isDark ? `${C.green}44` : "#BBF7D0") : (isDark ? `${C.red}44` : "#FECACA");
    const prevTypeLabel = prevDividend.type.charAt(0).toUpperCase() + prevDividend.type.slice(1);
    return (
      <div style={{ paddingTop: 14 }}>
        {renderSectionTitle(`Previous · ${prevTypeLabel}${prevDividend.year ? ` ${prevDividend.year}` : ""}`)}
        <div style={{ borderRadius: 8, border: `1px solid ${glBdr}`, overflow: "hidden" }}>
          <div style={{ display: "flex" }}>
            <div style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Shares</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{prevDividend.prevShares > 0 ? fmt(prevDividend.prevShares) : "—"}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 0", textAlign: "center", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "#93C5FD" : "#1D4ED8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>DPS</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#93C5FD" : "#1D4ED8" }}>{fmt(prevDividend.prevDps)}</div>
            </div>
            <div style={{ flex: 1, padding: "8px 0", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>Net</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{prevDividend.prevNet > 0 ? fmt(prevDividend.prevNet) : "—"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", padding: "6px 0", background: glBg, borderTop: `1px solid ${glBdr}` }}>
            <div style={{ flex: 2, paddingLeft: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: glCol }}>DPS Growth</span>
            </div>
            <div style={{ flex: 1, textAlign: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: glCol }}>{isUp ? "▲" : "▼"} {isUp ? "+" : ""}{prevDividend.change.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => (
    <>
      {renderTaxPanel()}
      <div style={{ padding: "14px 20px" }}>
        {renderSectionTitle("Audit trail")}
        {renderAuditSteps(false)}
      </div>
    </>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.56)", backdropFilter: "blur(3px)", zIndex: 9999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={captureRef} style={{ background: C.white, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1.5px solid ${C.gray200}`, borderBottom: isMobile ? "none" : undefined, width: "100%", maxWidth: isMobile ? "100%" : 680, maxHeight: isMobile ? "92vh" : "95vh", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* ═══ HEADER ═══ */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: isMobile ? "16px 18px 14px" : "18px 24px 16px", borderRadius: isMobile ? "16px 16px 0 0" : "16px 16px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "nowrap" }}>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{companyName}</span>
              {/* Type + Year badge */}
              <span style={{ background: tc.bg, color: tc.color, border: `1px solid ${tc.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0 }}>
                {divType.charAt(0).toUpperCase() + divType.slice(1)}{dividend.dividend_year ? ` · ${dividend.dividend_year}` : ""}
              </span>
              {/* Status badge */}
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", flexShrink: 0 }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", gap: 8, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
              {dividend.payment_date && <span style={{ whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}>📅 {fmtDate(dividend.payment_date)}</span>}
              {dividend.cds_number && (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  🪪 {dividend.cds_number}
                  {!isMobile && (cdsAccountName === null
                    ? <span style={{ color: "rgba(255,255,255,0.4)" }}> — …</span>
                    : cdsAccountName
                      ? <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 600 }}> — {cdsAccountName}</span>
                      : null)}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>

        {/* ═══ UNIFIED STAT BAR — Shares | DPS | Mkt Value | Div Yld ═══ */}
        {(() => {
          const statCols = [
            { label: "Shares",    value: shares > 0   ? fmt(shares)       : null, color: C.text,                         labelColor: C.gray500 },
            { label: "DPS",       value: dps > 0      ? fmt(dps)          : null, color: isDark ? "#93C5FD" : "#1D4ED8", labelColor: isDark ? "#93C5FD" : "#1D4ED8" },
            { label: "Mkt Price", value: marketPrice > 0 ? fmt(marketPrice) : null, color: C.text,                        labelColor: C.gray500 },
            { label: "Div Yld",   value: yieldPct     ? `${priceIsApprox ? "~" : ""}${yieldPct}%` : null, color: isDark ? "#A3E635" : "#4D7C0F", labelColor: isDark ? "#A3E635" : "#4D7C0F" },
          ].filter(c => c.value);
          return (
            <div style={{ display: "flex", alignItems: "stretch", background: C.gray50, flexShrink: 0, borderBottom: `1px solid ${C.gray200}` }}>
              {statCols.map((col, i) => (
                <div key={col.label} style={{ flex: 1, padding: isMobile ? "9px 4px" : "10px 4px", textAlign: "center", borderRight: i < statCols.length - 1 ? `1px solid ${C.gray200}` : "none" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: col.labelColor, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>{col.label}</div>
                  <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 800, color: col.color, lineHeight: 1.2 }}>{col.value}</div>
                </div>
              ))}
            </div>
          );
        })()}

        {/* ═══ SCROLLABLE BODY ═══ */}
        <div className="div-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {isMobile ? (
            <>
              {/* Income breakdown card (mobile only — desktop has Tax & Income panel) */}
              <div style={{ padding: "10px 18px 0" }}>
                <div style={{ borderRadius: 10, overflow: "hidden", border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : C.gray50, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                    <span style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gross Amount</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>TZS {fmt(gross)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: isDark ? "rgba(255,255,255,0.04)" : C.gray50, borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                    <span style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>WHT ({taxPct}%)</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: C.red }}>TZS {fmt(tax)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: isDark ? `${C.green}18` : "#F0FDF4" }}>
                    <span style={{ fontSize: 11, color: C.green, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Net Income</span>
                    <span style={{ fontSize: 15, fontWeight: 900, color: C.green }}>TZS {fmt(net)}</span>
                  </div>
                </div>
              </div>

              {/* Details card + previous dividend inside same box */}
              <div style={{ padding: "10px 18px 0" }}>
                <div style={{ background: isDark ? "rgba(255,255,255,0.04)" : C.gray50, borderRadius: 10, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Dividend Details</div>
                    {renderKVRows(leftRows)}
                  </div>
                  {prevDividend && (() => {
                    const isUp = prevDividend.change >= 0;
                    const glCol = isUp ? C.green : C.red;
                    const glBg  = isUp ? (isDark ? `${C.green}18` : "#F0FDF4") : (isDark ? `${C.red}18` : "#FFF5F5");
                    const glBdr = isUp ? (isDark ? `${C.green}44` : "#BBF7D0") : (isDark ? `${C.red}44` : "#FECACA");
                    const prevTypeLabel = prevDividend.type.charAt(0).toUpperCase() + prevDividend.type.slice(1);
                    return (
                      <div style={{ padding: "0 10px 10px" }}>
                        <div style={{ border: `1px solid ${glBdr}`, borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ background: glBg, padding: "7px 10px", borderBottom: `1px solid ${glBdr}` }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: glCol, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              Previous Dividend{prevDividend.year ? ` · ${prevTypeLabel} ${prevDividend.year}` : ""}
                            </div>
                          </div>
                          <div style={{ display: "flex", background: isDark ? "rgba(255,255,255,0.03)" : "#fff" }}>
                            <div style={{ flex: 1, padding: "10px 0", textAlign: "center", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Shares</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{prevDividend.prevShares > 0 ? fmt(prevDividend.prevShares) : "—"}</div>
                            </div>
                            <div style={{ flex: 1, padding: "10px 0", textAlign: "center", borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "#93C5FD" : "#1D4ED8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>DPS</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: isDark ? "#93C5FD" : "#1D4ED8" }}>{fmt(prevDividend.prevDps)}</div>
                            </div>
                            <div style={{ flex: 1, padding: "10px 0", textAlign: "center" }}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: C.green, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Net</div>
                              <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{prevDividend.prevNet > 0 ? fmt(prevDividend.prevNet) : "—"}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", padding: "7px 0", background: glBg, borderTop: `1px solid ${glBdr}` }}>
                            <div style={{ flex: 2, paddingLeft: 10 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: glCol }}>DPS Growth</span>
                            </div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: glCol }}>
                                {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{prevDividend.change.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Audit trail card — collapsible */}
              <div style={{ padding: "10px 18px 0" }}>
                <div style={{ padding: "10px 12px", background: isDark ? "rgba(255,255,255,0.04)" : C.gray50, borderRadius: 10, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
                  <div
                    onClick={() => setAuditExpanded(v => !v)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: auditExpanded ? 8 : 0 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Audit Trail</div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.gray400} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: auditExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}><polyline points="6 9 12 15 18 9" /></svg>
                    </div>
                    {!auditExpanded && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: dividend.status === "paid" ? C.green : dividend.status === "rejected" ? C.red : C.gray500 }}>
                        {dividend.status === "paid" ? `Paid · ${fmtDate(dividend.paid_at || dividend.updated_at)}` : dividend.status === "rejected" ? "Rejected" : "Awaiting Payment"}
                      </span>
                    )}
                  </div>
                  {auditExpanded && renderAuditSteps(true)}
                </div>
              </div>

              <div style={{ height: 10 }} />
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ borderRight: `1px solid ${C.gray200}` }}>{renderLeftPanel()}</div>
              <div>{renderRightPanel()}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: isMobile ? "8px 18px" : "8px 24px", borderTop: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 8 : 11, color: C.gray400, fontFamily: "monospace", letterSpacing: isMobile ? 0 : "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "50%" : "none" }}>ID: {dividend.id}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleDownloadPNG} disabled={downloading} style={{ padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 11, cursor: downloading ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "border-color 0.15s", display: "inline-flex", alignItems: "center", gap: 5, opacity: downloading ? 0.6 : 1 }} onMouseEnter={e=>{if(!downloading)e.currentTarget.style.borderColor=C.green}} onMouseLeave={e=>e.currentTarget.style.borderColor=C.gray200}><Icon name="download" size={12} stroke={C.gray500} sw={2} />{downloading ? "Saving..." : "Save"}</button>
            <button onClick={onClose} style={{ padding: "5px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.navy} onMouseLeave={e=>e.currentTarget.style.borderColor=C.gray200}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
});

// ── Dividend Mobile Card ──────────────────────────────────────────
const DividendMobileCard = memo(function DividendMobileCard({
  dividend, onEdit, onOpenDeleteModal, onOpenMarkAsPaidModal, onUnpay, onOpenRejectModal, onConfirm,
  deletingId, bulkDeletingIds, markingPaidIds, rejectingIds, confirmingIds,
  isDE, isVR, isAD, isSA, isSAAD, showActions, onOpenDetail, todayIso,
}) {
  const { C, isDark } = useTheme();
  const net = Number(dividend.net_amount || 0) || (Number(dividend.total_amount || 0) - Number(dividend.withholding_tax || 0));
  const dps = Number(dividend.dividend_per_share || 0);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isVR, isSAAD, isAD, isSA, todayIso }), [dividend, isDE, isVR, isSAAD, isAD, isSA, todayIso]);

  const isRowDeleting    = deletingId === dividend.id || bulkDeletingIds.has(dividend.id);
  const isRowMarkingPaid = markingPaidIds.has(dividend.id);
  const isRowRejecting   = rejectingIds?.has(dividend.id);
  const isRowConfirming  = confirmingIds?.has(dividend.id);
  const isRowBusy        = isRowDeleting || isRowMarkingPaid || isRowRejecting || isRowConfirming;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm  ? [{ icon: <Icon name="checkCircle" size={14} />, label: isRowConfirming ? "Confirming..." : "Confirm",        disabled: isRowBusy, onClick: () => onConfirm(dividend.id) }] : []),
    ...(perms.canUnpay    ? [{ icon: <Icon name="refresh" size={14} />,     label: "Revert to Declared",                                  disabled: isRowBusy, onClick: () => onUnpay(dividend.id) }] : []),
    ...(perms.canMarkPaid ? [{ icon: <Icon name="checkCircle" size={14} />, label: isRowMarkingPaid ? "Marking Paid..." : "Mark as Paid", disabled: isRowBusy, onClick: () => onOpenMarkAsPaidModal([dividend.id], dividend.payment_date) }] : []),
    ...(perms.canReject   ? [{ icon: <Icon name="xCircle" size={14} />,     label: isRowRejecting ? "Rejecting..." : "Reject",            danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([dividend.id]) }] : []),
    ...(perms.canEdit     ? [{ icon: <Icon name="edit" size={14} />,        label: "Edit",                                                disabled: isRowBusy, onClick: () => onEdit(dividend) }] : []),
    ...(perms.canDelete   ? [{ icon: <Icon name="trash" size={14} />,       label: isRowDeleting ? "Deleting..." : "Delete",              danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(dividend) }] : []),
  ], [perms, isRowBusy, isRowMarkingPaid, isRowRejecting, isRowConfirming, isRowDeleting, dividend, onConfirm, onUnpay, onOpenMarkAsPaidModal, onOpenRejectModal, onEdit, onOpenDeleteModal]);

  const shares   = Number(dividend.shares_held || 0);
  const gross    = Number(dividend.total_amount || 0);
  const cardBg   = perms.isPaid ? (isDark ? `${C.green}10` : "#F9FFFB") : perms.isRejected ? (isDark ? `${C.red}18` : "#FFF5F5") : C.white;
  const cardBdr  = perms.isPaid ? (isDark ? `${C.green}55` : "#BBF7D0") : perms.isRejected ? (isDark ? `${C.red}55` : "#FECACA") : C.gray200;

  // Countdown pill — same as before
  const countdownPill = (() => {
    if (perms.isPaid || perms.isRejected || !dividend.payment_date) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const payDate = new Date(dividend.payment_date + "T00:00:00");
    const diffDays = Math.ceil((payDate - today) / 86400000);
    if (diffDays < 0 || diffDays > 365) return null;
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: diffDays <= 7 ? (isDark ? "#FBBF24" : "#B45309") : C.gray500, background: diffDays <= 7 ? (isDark ? "#92400E18" : "#FFFBEB") : C.gray100, padding: "2px 7px", borderRadius: 10, border: `1px solid ${diffDays <= 7 ? (isDark ? "#92400E55" : "#FDE68A") : C.gray200}` }}>
        {diffDays === 0 ? "Today" : diffDays === 1 ? "Tomorrow" : `in ${diffDays} days`}
      </span>
    );
  })();

  const t = dividend.dividend_type || "annual";
  const tColors = { interim: "#D97706", final: "#1D4ED8", special: "#7C3AED", annual: C.gray400 };
  const tBgs    = { interim: "#FFFBEB",  final: "#EFF6FF",  special: "#F5F3FF",  annual: C.gray100 };
  const tBdrs   = { interim: "#FDE68A",  final: "#BFDBFE",  special: "#DDD6FE",  annual: C.gray200 };
  const yr = dividend.dividend_year || (dividend.payment_date ? new Date(dividend.payment_date + "T00:00:00").getFullYear() : null);
  const isLocked = !!(dividend.event_id && dividend.closure_date && new Date().toISOString().split("T")[0] < dividend.closure_date);

  return (
    <div onClick={() => !isRowBusy && onOpenDetail(dividend.id)}
      style={{ background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 10, padding: "10px 12px", marginBottom: 6, cursor: isRowBusy ? "not-allowed" : "pointer", opacity: isRowBusy ? 0.6 : 1, transition: "box-shadow 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>

      {/* Row 1: Company · Year · Type | ActionMenu */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{dividend.company_name || "Unknown"}</span>
          {yr && <span style={{ fontSize: 11, fontWeight: 600, color: C.gray400 }}>{yr}</span>}
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: tColors[t], background: tBgs[t], border: `1px solid ${tBdrs[t]}` }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </span>
        </div>
        {showActions && rowActions.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}><ActionMenu actions={rowActions} /></div>
        )}
      </div>

      {/* Row 2: Status · Event · Lock · Date · Countdown */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
        <DivStatusBadge status={dividend.status} />
        {!!dividend.event_id && (
          <span title="Auto-generated from dividend event" style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", padding: "1px 7px", borderRadius: 20, fontSize: 10, fontWeight: 700 }}>Event</span>
        )}
        {isLocked && <span title={`Locked until closure date: ${dividend.closure_date}`} style={{ fontSize: 12 }}>🔒</span>}
        <span style={{ fontSize: 11, color: C.gray400, marginLeft: 2 }}>{fmtDate(dividend.payment_date)}</span>
        {countdownPill}
      </div>

      {/* Row 3: DPS × Shares → Net */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, borderRadius: 8, padding: "6px 10px" }}>
        <div>
          <div style={{ fontSize: 9, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>DPS × Shares</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(dps)} × {shares > 0 ? shares.toLocaleString() : "—"}</div>
        </div>
        <span style={{ fontSize: 12, color: C.gray300 }}>→</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 1 }}>Net Amount</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.green }}>TZS {fmtSmart(net)}</div>
        </div>
      </div>

      {perms.isRejected && dividend.rejection_reason && (
        <div style={{ marginTop: 6, padding: "5px 8px", background: isDark ? `${C.red}14` : "#FFF5F5", borderRadius: 7, border: `1px solid ${isDark ? `${C.red}33` : "#FECACA"}`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
          💬 {dividend.rejection_reason}
        </div>
      )}
      {isRowBusy && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.gray400 }}>
          <Spinner size={11} color={C.gray400} /> Processing...
        </div>
      )}
    </div>
  );
});

// ── Dividend Row ──────────────────────────────────────────────────
const DividendRow = memo(function DividendRow({
  dividend, globalIdx, selected, onToggleOne,
  onEdit, onOpenDeleteModal, onOpenMarkAsPaidModal, onUnpay, onOpenRejectModal, onConfirm,
  deletingId, bulkDeletingIds, markingPaidIds, rejectingIds, confirmingIds,
  isDE, isVR, isAD, isSA, isSAAD, showCheckbox, showActions, onOpenDetail, todayIso,
}) {
  const { C, isDark } = useTheme();
  const gross = Number(dividend.total_amount || 0);
  const tax = Number(dividend.withholding_tax || 0);
  const net = Number(dividend.net_amount || 0) || (gross - tax);
  const dps = Number(dividend.dividend_per_share || 0);
  const shares = Number(dividend.shares_held || 0);
  const isChecked = selected.has(dividend.id);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isVR, isSAAD, isAD, isSA, todayIso }), [dividend, isDE, isVR, isSAAD, isAD, isSA, todayIso]);

  const isRowDeleting    = deletingId === dividend.id || bulkDeletingIds.has(dividend.id);
  const isRowMarkingPaid = markingPaidIds.has(dividend.id);
  const isRowRejecting   = rejectingIds?.has(dividend.id);
  const isRowConfirming  = confirmingIds?.has(dividend.id);
  const isRowBusy        = isRowDeleting || isRowMarkingPaid || isRowRejecting || isRowConfirming;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm  ? [{ icon: isRowConfirming  ? null : <Icon name="checkCircle" size={14} />, label: isRowConfirming  ? "Confirming..."  : "Confirm",        disabled: isRowBusy, onClick: () => onConfirm(dividend.id) }] : []),
    ...(perms.canUnpay    ? [{ icon: <Icon name="refresh" size={14} />,    label: "Revert to Declared",                                                                disabled: isRowBusy, onClick: () => onUnpay(dividend.id) }] : []),
    ...(perms.canMarkPaid ? [{ icon: isRowMarkingPaid ? null : <Icon name="checkCircle" size={14} />, label: isRowMarkingPaid ? "Marking Paid..." : "Mark as Paid",   disabled: isRowBusy, onClick: () => onOpenMarkAsPaidModal([dividend.id], dividend.payment_date) }] : []),
    ...(perms.canReject   ? [{ icon: isRowRejecting   ? null : <Icon name="xCircle" size={14} />,    label: isRowRejecting   ? "Rejecting..."   : "Reject",           danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([dividend.id]) }] : []),
    ...(perms.canEdit     ? [{ icon: <Icon name="edit" size={14} />,  label: "Edit",                                                                                   disabled: isRowBusy, onClick: () => onEdit(dividend) }] : []),
    ...(perms.canDelete   ? [{ icon: isRowDeleting ? null : <Icon name="trash" size={14} />, label: isRowDeleting ? "Deleting..." : "Delete",                          danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(dividend) }] : []),
  ], [perms, isRowBusy, isRowMarkingPaid, isRowRejecting, isRowConfirming, isRowDeleting, dividend, onConfirm, onUnpay, onOpenMarkAsPaidModal, onOpenRejectModal, onEdit, onOpenDeleteModal]);

  const rowBg      = perms.isPaid     ? (isDark ? `${C.green}10` : "#F9FFFB") : perms.isRejected ? (isDark ? `${C.red}10` : "#FFF5F5") : "transparent";
  const rowBgHover = perms.isPaid     ? (isDark ? `${C.green}1c` : "#F0FDF4") : perms.isRejected ? (isDark ? `${C.red}1c` : "#FEF2F2") : C.gray50;
  // Lock: event-generated record where closure date has not yet passed
  const isLocked = !!(dividend.event_id && dividend.closure_date && todayIso && dividend.closure_date > todayIso);

  return (
    <tr style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: rowBg, opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
      onClick={() => onOpenDetail(dividend.id)}
      onMouseEnter={e => { if (!isRowBusy) e.currentTarget.style.background = rowBgHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
      {showCheckbox && (
        <td style={{ padding: "5px 8px" }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => onToggleOne(dividend.id)} disabled={isRowBusy}
            style={{ cursor: isRowBusy ? "not-allowed" : "pointer", width: 14, height: 14, accentColor: isDark ? C.green : C.green }} />
        </td>
      )}
      <td style={{ padding: "5px 8px", color: C.gray400, fontWeight: 600, textAlign: "right" }}>{globalIdx}</td>
      <td style={{ padding: "5px 8px" }}>
        <div style={{ fontWeight: 700, color: C.text, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.3 }}>{dividend.company_name || "Unknown"}</div>
      </td>
      <td style={{ padding: "5px 8px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700, color: C.gray500 }}>{dividend.dividend_year || (dividend.payment_date ? new Date(dividend.payment_date + "T00:00:00").getFullYear() : "—")}</td>
      <td style={{ padding: "5px 8px", textAlign: "center" }}>
        {(() => {
          const t = dividend.dividend_type || "annual";
          const colors = { interim: ["#D97706","#FFFBEB","#FDE68A"], final: ["#1D4ED8","#EFF6FF","#BFDBFE"], special: ["#7C3AED","#F5F3FF","#DDD6FE"], annual: [C.gray500, C.gray100, C.gray200] };
          const [color, bg, border] = colors[t] || colors.annual;
          return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 20, whiteSpace: "nowrap", color, background: bg, border: `1px solid ${border}` }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>;
        })()}
      </td>
      <td style={{ padding: "5px 8px", color: C.gray600, whiteSpace: "nowrap" }}>{fmtDate(dividend.payment_date)}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "2px 8px", borderRadius: 20, fontWeight: 700 }}>{fmt(dps)}</span>
      </td>
      <td style={{ padding: "5px 8px", fontWeight: 600, textAlign: "right", color: C.text }}>{shares > 0 ? fmt(shares) : "\u2014"}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 600, color: C.text }}>{fmt(gross)}</td>
      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ color: tax > 0 ? C.red : C.gray400, fontWeight: 700 }}>{tax > 0 ? fmt(tax) : "\u2014"}</span>
      </td>
      <td style={{ padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "2px 8px", borderRadius: 20, fontWeight: 800, border: `1px solid ${isDark ? `${C.green}55` : "#BBF7D0"}` }}>
          {fmt(net)}
        </span>
      </td>
      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "nowrap" }}>
          <DivStatusBadge status={dividend.status} />
          {!!dividend.event_id && (
            <span title="Auto-generated from dividend event"
              style={{ background: "#EEF2FF", color: "#4338CA", border: "1px solid #C7D2FE", padding: "0 8px", height: 22, borderRadius: 20, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
              Event
            </span>
          )}
          {isLocked && (
            <span title={`Locked until closure date: ${dividend.closure_date}`}
              style={{ display: "inline-flex", alignItems: "center", color: "#D97706", fontSize: 12, flexShrink: 0 }}>
              🔒
            </span>
          )}
          {perms.isPaymentLocked && (perms.isDeclared || perms.isExDate) && (
            <span title={`Mark as paid unlocks on ${dividend.payment_date}`}
              style={{ display: "inline-flex", alignItems: "center", color: "#D97706", fontSize: 12, flexShrink: 0 }}>
              ⏰
            </span>
          )}
        </div>
      </td>
      {showActions && (
        <td style={{ padding: "5px 8px", textAlign: "center", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
          {rowActions.length > 0 && <ActionMenu actions={rowActions} />}
        </td>
      )}
    </tr>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE
// ══════════════════════════════════════════════════════════════════
// ── Stock Timeline Modal ──────────────────────────────────────────
// Year-by-company matrix: shares held at each year-end.
// Fetches all verified transactions ONCE, then computes every year-end
// snapshot in JS — no repeated DB hits.
function StockTimelineModal({ cdsNumber, earliestTxnYear, companies, onClose }) {
  const { C, isDark } = useTheme();
  const [state, setState] = useState({ status: "loading", years: [], rows: [], error: null });

  useEffect(() => {
    if (!cdsNumber) { setState({ status: "empty", years: [], rows: [], error: null }); return; }

    const currentYear = new Date().getFullYear();
    const startYear   = earliestTxnYear || currentYear;
    const years       = [];
    for (let y = startYear; y <= currentYear; y++) years.push(y);

    setState({ status: "loading", years, rows: [], error: null });

    let cancelled = false;
    sbGetVerifiedTransactions(cdsNumber)
      .then(txns => {
        if (cancelled) return;
        if (!txns.length) { setState({ status: "empty", years, rows: [], error: null }); return; }

        // Build company name lookup from already-loaded companies list (zero extra API calls)
        const nameMap = Object.fromEntries((companies || []).map(c => [c.id, c.name]));

        // Compute net share position per company at each year-end in one JS pass
        const companyIds = [...new Set(txns.map(t => t.company_id))];
        const rows = companyIds.map(cid => {
          const compTxns = txns.filter(t => t.company_id === cid);
          const cells = years.map(year => {
            const cutoff = `${year}-12-31`;
            let shares = 0;
            for (const t of compTxns) {
              if (t.date > cutoff) break;
              shares += t.type === "Buy" ? Number(t.qty || 0) : -Number(t.qty || 0);
            }
            return Math.max(0, shares);
          });
          return { id: cid, name: nameMap[cid] || cid.slice(0, 8), cells };
        })
        .filter(r => r.cells.some(c => c > 0))
        .sort((a, b) => a.name.localeCompare(b.name));

        setState({ status: rows.length ? "ok" : "empty", years, rows, error: null });
      })
      .catch(err => {
        if (!cancelled) setState({ status: "error", years, rows: [], error: err?.message || "Failed to load timeline" });
      });

    return () => { cancelled = true; };
  }, [cdsNumber, earliestTxnYear, companies]);

  const yearCount = new Date().getFullYear() - (earliestTxnYear || new Date().getFullYear()) + 1;
  const maxWidth  = Math.min(920, Math.max(480, 200 + yearCount * 90));
  const thStyle  = { padding: "7px 10px", fontSize: 10, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" };

  return (
    <ModalShell
      title="Stock Timeline"
      subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="barChart" size={14} /> Shares held at each year-end</span>}
      onClose={onClose}
      maxWidth={maxWidth}
      footer={<Btn variant="secondary" onClick={onClose}>Close</Btn>}
    >
      {state.status === "loading" ? (
        <div style={{ padding: 40, textAlign: "center", color: C.gray500, fontSize: 13, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>Loading timeline\u2026</div>
      ) : state.status === "error" ? (
        <div style={{ padding: 20, textAlign: "center", color: C.red, fontSize: 13, fontWeight: 600 }}>
          {state.error || "Failed to load timeline. Please try again."}
        </div>
      ) : state.status === "empty" ? (
        <div style={{ padding: 20, textAlign: "center", color: C.gray500, fontSize: 13 }}>No stock holdings on record.</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "auto" }}>
            <thead>
              <tr style={{ background: isDark ? C.gray50 : "#F0F4F8", borderBottom: `2px solid ${C.gray200}` }}>
                <th style={{ ...thStyle, textAlign: "left", position: "sticky", left: 0, background: isDark ? C.gray50 : "#F0F4F8", zIndex: 1 }}>Company</th>
                {state.years.map(y => <th key={y} style={{ ...thStyle, textAlign: "right" }}>{y}</th>)}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r, ri) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.gray100}`, background: ri % 2 === 0 ? "transparent" : (isDark ? "rgba(255,255,255,0.02)" : "#FAFBFC") }}>
                  <td style={{ padding: "7px 10px", fontWeight: 700, color: C.text, whiteSpace: "nowrap", position: "sticky", left: 0, background: ri % 2 === 0 ? (isDark ? C.white : C.white) : (isDark ? "#1a1f2e" : "#FAFBFC"), zIndex: 1 }}>{r.name}</td>
                  {r.cells.map((shares, i) => (
                    <td key={i} style={{ padding: "7px 10px", textAlign: "right", color: shares > 0 ? C.text : C.gray300, fontWeight: shares > 0 ? 600 : 400, whiteSpace: "nowrap" }}>
                      {shares > 0 ? shares.toLocaleString() : "\u2014"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}

export default function DividendsPage({ companies, showToast, role, cdsNumber }) {
  const { C, isDark } = useTheme();

  const TOOLBAR_INPUT  = { ...TOOLBAR_BASE, width: "100%", border: `1.5px solid ${C.gray200}`, padding: "0 10px 0 32px", outline: "none", color: C.text, background: C.white };
  const TOOLBAR_SELECT = { ...TOOLBAR_BASE, padding: "0 10px", background: C.white, color: C.text, cursor: "pointer", outline: "none", flexShrink: 0 };

  const isSA   = role === "SA";
  const isAD   = role === "AD";
  const isDE   = role === "DE";
  const isVR   = role === "VR";
  const isRO   = role === "RO";
  const isSAAD = isSA || isAD;

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
  const [rejectingIds, setRejectingIds]       = useState(new Set());
  const [confirmingIds, setConfirmingIds]     = useState(new Set());

  const [deleteModal, setDeleteModal]           = useState(null);
  const [bulkDeleteModal, setBulkDeleteModal]   = useState(null);
  const [markAsPaidModal, setMarkAsPaidModal]   = useState(null);
  const [bulkUnpayModal, setBulkUnpayModal]     = useState(null);
  const [rejectModal, setRejectModal]           = useState(null);
  const [formModal, setFormModal]               = useState({ open: false, dividend: null });
  const [detailModal, setDetailModal]           = useState(null);
  const [showStockTimeline, setShowStockTimeline] = useState(false);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  // ── Dividend events (company-level announcements) ────────────────
  const [divEvents, setDivEvents]               = useState([]);
  const [earliestTxnYear, setEarliestTxnYear]  = useState(null);
  const [refreshingEventId, setRefreshingEventId] = useState(null);
  const todayIso = useMemo(() => new Date().toISOString().split("T")[0], []);

  const effectiveCompanies = useMemo(
    () => (companies?.length ? companies : localCompanies),
    [companies, localCompanies]
  );

  // Form dropdown: only companies with transactions on this CDS, regardless of role
  const formCompanies = localCompanies;

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
      // Only companies with transactions on this CDS (for form dropdown)
      const data = cdsNumber ? await sbGetTransactionCompanies(cdsNumber) : [];
      if (!isMountedRef.current || requestId !== companyLoadRef.current) return;
      setLocalCompanies(data);
    } catch (e) {
      if (!isMountedRef.current || requestId !== companyLoadRef.current) return;
      showToast("Error loading companies: " + e.message, "error");
    } finally {
      if (isMountedRef.current && requestId === companyLoadRef.current) setLoadingCompanies(false);
    }
  }, [showToast, cdsNumber]);

  // ── Boot effect ─────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    Promise.all([loadDividends(), loadCompanies()]);
    sbGetAllDividendEvents().then(async (data) => {
      if (!isMountedRef.current) return;
      const today = new Date().toISOString().split("T")[0];
      // Auto-complete events whose payment_date has lapsed
      const toComplete = (data || []).filter(ev => ev.status === "generated" && ev.payment_date && ev.payment_date < today);
      if (toComplete.length > 0) {
        await Promise.all(toComplete.map(ev => sbUpdateDividendEvent(ev.id, { status: "completed" }))).catch(() => {});
        data = (data || []).map(ev => toComplete.some(tc => tc.id === ev.id) ? { ...ev, status: "completed" } : ev);
      }
      if (isMountedRef.current) setDivEvents(data || []);
    }).catch(() => {});
    // Preload earliest transaction year so the Dividend Year dropdown can offer
    // historical years (one year before the first purchase through today).
    if (cdsNumber) {
      sbGetTransactions(cdsNumber, { pageSize: 1, sortCol: "date", sortDir: "asc" })
        .then(r => {
          const firstDate = r?.rows?.[0]?.date;
          if (firstDate && isMountedRef.current) {
            setEarliestTxnYear(new Date(firstDate).getFullYear());
          }
        })
        .catch(() => {});
    }
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
  const isAnyRejecting   = rejectingIds.size > 0;
  const isAnyConfirming  = confirmingIds.size > 0;
  const hasSelection     = selected.size > 0;

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const myDividends = useMemo(() => {
    // Filter to this CDS and enrich with company_name from the companies list.
    // The server-side RPC does not always join company_name, so we fall back to
    // the local companies map before anything renders "Unknown".
    const nameById = new Map(effectiveCompanies.map(c => [c.id, c.name]));
    const list = cdsNumber ? dividends.filter(d => d.cds_number === cdsNumber) : dividends;
    return list.map(d => ({ ...d, company_name: d.company_name || nameById.get(d.company_id) || null }));
  }, [dividends, cdsNumber, effectiveCompanies]);

  const divById     = useMemo(() => new Map(myDividends.map(d => [d.id, d])), [myDividends]);
  const companyById = useMemo(() => new Map(effectiveCompanies.map(c => [c.id, c])), [effectiveCompanies]);

  const stats = useMemo(() => {
    let total = 0, declared = 0, exDatePassed = 0, paid = 0;
    let totalGross = 0, totalTax = 0, totalNet = 0;
    let ytdNet = 0;
    const currentYear = new Date().getFullYear();
    for (const d of myDividends) {
      total++;
      const gross = Number(d.total_amount || 0);
      const tax = Number(d.withholding_tax || 0);
      const net = Number(d.net_amount || 0) || (gross - tax);
      totalGross += gross;
      totalTax   += tax;
      totalNet   += net;
      if      (d.status === "declared")       declared++;
      else if (d.status === "ex_date_passed") exDatePassed++;
      else if (d.status === "paid")           paid++;
      // YTD: paid dividends in current year
      if (d.status === "paid") {
        const payYear = d.payment_date ? new Date(d.payment_date + "T00:00:00").getFullYear() : null;
        if (payYear === currentYear) ytdNet += net;
      }
    }
    const upcoming = declared + exDatePassed;
    return { total, declared, exDatePassed, paid, totalGross, totalTax, totalNet, ytdNet, upcoming };
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
    const deletableCorrect = [], markablePaid = [], confirmable = [];
    for (const id of selected) {
      const d = divById.get(id);
      if (!d) continue;
      // canDelete: SA/AD on any non-paid; DE only on pending/rejected
      if ((isSAAD && d.status !== "paid") || (isDE && (d.status === "pending" || d.status === "rejected"))) deletableCorrect.push(id);
      // Mark-as-paid lock: can't mark before payment_date.
      const paymentLocked = !!(d.payment_date && d.payment_date > todayIso);
      if ((d.status === "declared" || d.status === "ex_date_passed") && !paymentLocked) markablePaid.push(id);
      // Confirm: SA, AD or DE — respect closure-date lock
      const isLocked = !!(d.event_id && d.closure_date && d.closure_date > todayIso);
      if ((isSA || isDE || isAD) && (d.status === "pending" || d.status === "rejected") && !isLocked) confirmable.push(id);
    }
    const revertable = [];
    for (const id of selected) {
      const d = divById.get(id);
      if (!d) continue;
      if (isSAAD && d.status === "paid") revertable.push(id);
    }
    const rejectable = [];
    for (const id of selected) {
      const d = divById.get(id);
      if (!d) continue;
      if ((isVR || isSAAD) && (d.status === "declared" || d.status === "ex_date_passed")) rejectable.push(id);
    }
    return { deletable: deletableCorrect, markablePaid, revertable, rejectable, confirmable };
  }, [selected, divById, isSAAD, isDE, isVR, isAD, todayIso]);

  const canBulkConfirm  = (isSA || isDE || isAD) && selectedBuckets.confirmable.length > 0;
  const canBulkDelete   = (isDE || isSAAD) && selectedBuckets.deletable.length > 0;
  const canBulkMarkPaid = (isVR || isSAAD) && selectedBuckets.markablePaid.length > 0;
  const canBulkUnpay    = isSAAD && selectedBuckets.revertable.length > 0;
  const canBulkReject   = (isVR || isSAAD) && selectedBuckets.rejectable.length > 0;

  const openFormModal    = useCallback((dividend = null) => { if (loadingCompanies) return; setFormModal({ open: true, dividend }); }, [loadingCompanies]);
  const openDeleteModal  = useCallback((dividend) => setDeleteModal({ id: dividend.id, company_name: dividend.company_name }), []);
  const openRejectModal      = useCallback((ids) => setRejectModal({ ids }), []);
  const openMarkAsPaidModal  = useCallback((ids, defaultPaymentDate) => {
    const lockedRows = ids.map(id => dividends.find(d => d.id === id))
      .filter(d => d && d.payment_date && d.payment_date > todayIso);
    if (lockedRows.length > 0) {
      showToast(`Cannot mark as paid before Payment Date: ${lockedRows[0].payment_date}`, "error");
      return;
    }
    setMarkAsPaidModal({ ids, defaultPaymentDate: defaultPaymentDate || "" });
  }, [dividends, todayIso, showToast]);

  // Smart-form holdings lookup — returns shares held as of a given date.
  // Used by the DividendFormModal to compute eligible shares on the record date.
  const fetchHoldingsAsOf = useCallback(async (asOfDate) => {
    if (!cdsNumber || !asOfDate) return [];
    const { holdings } = await sbGetPortfolioAsAt(cdsNumber, asOfDate);
    return holdings || [];
  }, [cdsNumber]);

  // Manual-form helper: set of company_ids the user made verified Buy
  // transactions on during the given calendar year. First gate for the
  // Manual mode Company dropdown (companies I bought into that year).
  // The Closure Date filter is the precise second gate.
  const fetchBuysInYear = useCallback(async (year) => {
    if (!cdsNumber || !year) return new Set();
    try {
      const r = await sbGetTransactions(cdsNumber, {
        type: "Buy", status: "verified",
        dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`,
        pageSize: 1000,
      });
      return new Set((r?.rows || []).map(t => t.company_id));
    } catch { return new Set(); }
  }, [cdsNumber]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleConfirm = useCallback(async (id) => {
    // Gate: cannot confirm before closure date
    const div = dividends.find(d => d.id === id);
    if (div?.closure_date && div.closure_date > todayIso) {
      showToast(`Cannot confirm before Closure Date: ${div.closure_date}`, "error");
      return;
    }
    setConfirmingIds(prev => { const s = new Set(prev); s.add(id); return s; });
    try {
      // Event-linked records: recalculate shares from record-date holdings before
      // declaring, so any buys/sells between initial pending save and the record
      // date get reflected. Manual (off-event) records just flip status.
      const event = div?.event_id ? divEvents.find(ev => ev.id === div.event_id) : null;
      if (event && event.closure_date) {
        const holdings = await fetchHoldingsAsOf(event.closure_date);
        const row = holdings.find(h => h.companyId === event.company_id);
        const newShares = row ? Number(row.shares_held || 0) : 0;
        const dps = Number(event.dps ?? div.dividend_per_share ?? 0);
        const taxRate = Number(event.tax_rate ?? 5);
        const newGross = Math.round(newShares * dps);
        const newTax = Math.round(newGross * taxRate / 100);
        const newNet = newGross - newTax;
        const updates = {
          shares_held: newShares,
          dividend_per_share: dps,
          total_amount: newGross,
          withholding_tax: newTax,
          net_amount: newNet,
          status: "declared",
          paid_by: null, paid_at: null,
          rejected_by: null, rejected_at: null, rejection_reason: null,
        };
        await sbUpdateDividend(id, updates);
        if (!isMountedRef.current) return;
        setDividends(p => p.map(d => d.id === id ? { ...d, ...updates } : d));
        const oldShares = Number(div.shares_held || 0);
        if (newShares !== oldShares) {
          showToast(`Confirmed. Shares auto-corrected ${oldShares.toLocaleString()} \u2192 ${newShares.toLocaleString()} (record date).`, "success");
        } else {
          showToast("Dividend confirmed as Declared.", "success");
        }
      } else {
        await sbUpdateDividendStatus(id, "declared");
        if (!isMountedRef.current) return;
        setDividends(p => p.map(d => d.id === id ? { ...d, status: "declared" } : d));
        showToast("Dividend confirmed as Declared.", "success");
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setConfirmingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [showToast, dividends, todayIso, divEvents, fetchHoldingsAsOf]);

  const doBulkConfirm = useCallback(async () => {
    const lockedInSelection = [...selected]
      .map(id => dividends.find(d => d.id === id))
      .filter(d => d && d.closure_date && d.closure_date > todayIso);
    if (lockedInSelection.length > 0) {
      const sample = lockedInSelection[0];
      showToast(`Cannot confirm before Closure Date: ${sample.closure_date}`, "error");
      return;
    }
    const ids = selectedBuckets.confirmable;
    if (!ids?.length) return;
    setConfirmingIds(new Set(ids));
    try {
      await sbBulkUpdateDividendStatus(ids, "declared");
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      setDividends(p => p.map(d => idSet.has(d.id) ? { ...d, status: "declared" } : d));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} confirmed as Declared.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setConfirmingIds(new Set());
    }
  }, [selectedBuckets.confirmable, selected, dividends, todayIso, showToast]);

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
        // Enrich with company_name for immediate display (DB returns raw row; name is joined on fetch).
        const cname = newRow.company_name || companyById.get(newRow.company_id)?.name || effectiveCompanies.find(c => c.id === newRow.company_id)?.name || null;
        const enriched = { ...newRow, company_name: cname };
        setDividends(p => [enriched, ...p]);
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

  const doMarkAsPaid = useCallback(async (paymentDate) => {
    const ids = markAsPaidModal?.ids;
    if (!ids?.length) return;
    // Guard: cannot mark as paid before the scheduled payment_date.
    const earlyIds = ids.filter(id => {
      const d = dividends.find(x => x.id === id);
      return d?.payment_date && d.payment_date > todayIso;
    });
    if (earlyIds.length > 0) {
      const sample = dividends.find(x => x.id === earlyIds[0]);
      showToast(`Cannot mark as paid before Payment Date: ${sample?.payment_date}`, "error");
      return;
    }
    setMarkAsPaidModal(null);
    setMarkingPaidIds(new Set(ids));
    try {
      // Resolve price using the most standard convention:
      //   1. Ex-dividend date (most fair historical reference)
      //   2. 31 Dec of dividend year (annual report convention)
      //   3. User-confirmed payment date / dividend's payment_date
      //   4. Today (current price — only if all else is today)
      const priceMap = new Map();
      await Promise.all(ids.map(async id => {
        const div = dividends.find(x => x.id === id);
        const company = div ? companyById.get(div.company_id) : null;
        const priceDate =
          div?.ex_dividend_date ||
          (div?.dividend_year ? `${div.dividend_year}-12-31` : null) ||
          paymentDate ||
          div?.payment_date ||
          todayIso;
        const price = priceDate === todayIso
          ? (Number(company?.price) || null)
          : await resolveHistoricalPrice(div?.company_id, company?.name, priceDate);
        priceMap.set(id, price);
        return sbUpdateDividendStatus(id, "paid", null, paymentDate || null, price);
      }));
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      setDividends(p => p.map(d => {
        if (!idSet.has(d.id)) return d;
        const price = priceMap.get(d.id);
        return { ...d, status: "paid", paid_at: now,
          ...(paymentDate ? { payment_date: paymentDate } : {}),
          ...(price > 0 ? { market_price_at_payment: price } : {}) };
      }));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} marked as paid.`, "success");
      loadDividends({ fromPull: false }).catch(() => {});
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(new Set());
    }
  }, [markAsPaidModal, showToast, loadDividends, dividends, todayIso, companyById]);

  const doBulkUnpay = useCallback(async () => {
    const ids = bulkUnpayModal?.ids;
    if (!ids?.length) return;
    setBulkUnpayModal(null);
    setMarkingPaidIds(new Set(ids));
    try {
      await sbBulkUpdateDividendStatus(ids, "declared");
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      setDividends(p => p.map(d => idSet.has(d.id) ? { ...d, status: "declared", paid_by: null, paid_at: null, paid_by_name: null } : d));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} reverted to Declared.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(new Set());
    }
  }, [bulkUnpayModal, showToast]);

  const handleUnpay = useCallback(async (id) => {
    setMarkingPaidIds(prev => { const s = new Set(prev); s.add(id); return s; });
    try {
      await sbUpdateDividendStatus(id, "declared");
      if (!isMountedRef.current) return;
      setDividends(p => p.map(d => d.id === id ? { ...d, status: "declared", paid_by: null, paid_at: null, paid_by_name: null } : d));
      showToast("Dividend reverted to Declared.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [showToast]);

  const handleReject = useCallback(async (reason) => {
    const ids = rejectModal?.ids;
    if (!ids?.length) return;
    setRejectModal(null);
    setRejectingIds(new Set(ids));
    try {
      await sbBulkUpdateDividendStatus(ids, "rejected", reason);
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      setDividends(p => p.map(d => idSet.has(d.id) ? { ...d, status: "rejected", rejected_at: now, rejection_reason: reason, paid_by: null, paid_at: null, paid_by_name: null } : d));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} rejected.`, "success");
      loadDividends({ fromPull: false }).catch(() => {});
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setRejectingIds(new Set());
    }
  }, [rejectModal, showToast, loadDividends]);

  const handleEdit = useCallback((dividend) => {
    openFormModal(dividend);
  }, [openFormModal]);

  // ── Stat cards ──────────────────────────────────────────────────
  const statCards = useMemo(() => {
    // Upcoming card is a live preview of the announced-events popup:
    // the value is the count of SA-announced events, and the sub text
    // teases the nearest-closing event so the user knows at a glance
    // what they’ll see when they tap the card.
    const nextEvent = (divEvents || [])
      .filter(ev => ev.closure_date && ev.closure_date >= todayIso)
      .sort((a, b) => (a.closure_date < b.closure_date ? -1 : 1))[0];
    const upcomingValue = divEvents.length > 0 ? divEvents.length : stats.upcoming;
    const upcomingSub = (() => {
      if (nextEvent) {
        const days = Math.ceil((new Date(nextEvent.closure_date + "T00:00:00") - new Date(todayIso + "T00:00:00")) / 86400000);
        const whenLabel = days === 0 ? "today" : days === 1 ? "1d left" : `${days}d left`;
        return `${nextEvent.company_name} · ${whenLabel}`;
      }
      if (divEvents.length > 0) return `${divEvents.length} event${divEvents.length > 1 ? "s" : ""} · closure passed`;
      if (stats.upcoming > 0) return `${stats.upcoming} upcoming dividend${stats.upcoming > 1 ? "s" : ""}`;
      return "None upcoming";
    })();
    const eventsSub = upcomingSub;
    const hasExpandable = stats.upcoming > 0 || divEvents.length > 0;
    if (isSAAD) return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: upcomingValue,                           sub: eventsSub,                                                   icon: <Icon name="clock" size={17} />,      color: C.gold, onClick: hasExpandable ? () => setUpcomingExpanded(v => !v) : undefined },
    ];
    if (isDE) return [
      { label: "My Dividends",    value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.exDatePassed} ex-date`, icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: upcomingValue,                           sub: eventsSub,                                                   icon: <Icon name="clock" size={17} />,      color: C.gold, onClick: hasExpandable ? () => setUpcomingExpanded(v => !v) : undefined },
    ];
    if (isVR || isRO) return [
      { label: "Total Records",   value: stats.total,                            sub: `${stats.paid} paid`,                                        icon: <Icon name="clipboard" size={17} />,  color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: upcomingValue,                           sub: eventsSub,                                                   icon: <Icon name="clock" size={17} />,      color: C.gold, onClick: hasExpandable ? () => setUpcomingExpanded(v => !v) : undefined },
    ];
    // fallback (same as SA/AD)
    return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: upcomingValue,                           sub: eventsSub,                                                   icon: <Icon name="clock" size={17} />,      color: C.gold, onClick: hasExpandable ? () => setUpcomingExpanded(v => !v) : undefined },
    ];
  }, [C, stats, isSAAD, isDE, isVR, isRO, divEvents, todayIso]);

  const mobileStatCards = useMemo(() => {
    if (!isMobile) return statCards;
    const preferred = statCards.filter(s => s.label === "YTD Net Income" || s.label === "Upcoming");
    return preferred.length >= 2 ? preferred.slice(0, 2) : statCards.slice(0, 2);
  }, [isMobile, statCards]);

  const showCheckbox = !isMobile;
  const showActions  = !isRO;

  const tableHeaders = showActions ? TABLE_HEADERS_WITH_ACTIONS : TABLE_HEADERS_WITHOUT_ACTIONS;

  const tfootLeftCols  = showCheckbox ? 8 : 7;
  const tfootRightCols = 1 + (showActions ? 1 : 0);

  const detailDividend = useMemo(
    () => detailModal ? (divById.get(detailModal) || null) : null,
    [detailModal, divById]
  );

  const closeDelete          = useCallback(() => setDeleteModal(null),        []);
  const closeBulkDelete      = useCallback(() => setBulkDeleteModal(null),    []);
  const closeMarkAsPaidModal = useCallback(() => setMarkAsPaidModal(null),    []);
  const closeBulkUnpay       = useCallback(() => setBulkUnpayModal(null),     []);
  const closeRejectModal     = useCallback(() => setRejectModal(null),        []);
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
      {bulkDeleteModal   && <SimpleConfirmModal title="Delete Dividends"     message="Deleting these dividends cannot be undone."                                                           count={bulkDeleteModal.ids.length}   loading={bulkDeletingIds.size > 0} onConfirm={doBulkDelete}   onClose={closeBulkDelete}   icon={<Icon name="trash" size={18} />}        confirmLabel="Delete"            />}
      {markAsPaidModal   && <MarkAsPaidModal ids={markAsPaidModal.ids} defaultPaymentDate={markAsPaidModal.defaultPaymentDate} onConfirm={doMarkAsPaid} onClose={closeMarkAsPaidModal} />}
      {bulkUnpayModal    && <SimpleConfirmModal title="Revert to Declared"   message="These dividends will be reverted to Declared. Paid status and payment details will be cleared."     count={bulkUnpayModal.ids.length}    loading={isAnyMarkingPaid}         onConfirm={doBulkUnpay}    onClose={closeBulkUnpay}    accentColor="#EA580C" icon={<Icon name="undo" size={18} stroke="#EA580C" />}        confirmLabel="Revert to Declared" />}
      {rejectModal       && <RejectModal count={rejectModal.ids.length} onConfirm={handleReject} onClose={closeRejectModal} />}
      {showStockTimeline && (
        <StockTimelineModal
          cdsNumber={cdsNumber}
          earliestTxnYear={earliestTxnYear}
          companies={effectiveCompanies}
          onClose={() => setShowStockTimeline(false)}
        />
      )}
      {formModal.open && (
        <DividendFormModal
          key={formModal.dividend?.id || "new"}
          dividend={formModal.dividend}
          companies={formCompanies}
          cdsNumber={cdsNumber}
          dividendEvents={divEvents}
          existingDividends={myDividends}
          onFetchHoldingsAsOf={fetchHoldingsAsOf}
          earliestTxnYear={earliestTxnYear}
          onConfirm={handleFormConfirm}
          onClose={closeForm}
        />
      )}
      {detailDividend && <DividendDetailModal dividend={detailDividend} companies={effectiveCompanies} allDividends={myDividends} onClose={closeDetail} />}

      {/* ── Announced dividend events modal (must live outside the transform wrapper so position:fixed works on mobile) ── */}
      {upcomingExpanded && (stats.upcoming > 0 || divEvents.length > 0) && (
        <ModalShell
          title="Announced Dividend Events"
          subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="clock" size={13} /> {
            stats.upcoming > 0
              ? `${stats.upcoming} upcoming dividend${stats.upcoming > 1 ? "s" : ""}`
              : `${divEvents.length} announced event${divEvents.length > 1 ? "s" : ""}`
          }</span>}
          onClose={() => setUpcomingExpanded(false)}
          maxWidth={640}
          footer={<Btn variant="secondary" onClick={() => setUpcomingExpanded(false)}>Close</Btn>}
        >
          {divEvents.length === 0 ? (
            <div style={{ padding: "16px 4px", textAlign: "center", color: C.gray500, fontSize: 13 }}>No announced events.</div>
          ) : isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {divEvents.map((ev, i) => {
                const closurePassed = ev.closure_date <= todayIso;
                const daysToClose = Math.ceil((new Date(ev.closure_date + "T00:00:00") - new Date(todayIso + "T00:00:00")) / 86400000);
                return (
                  <div key={ev.id} style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{ev.company_name}</span>
                        <span style={{ fontSize: 13, color: C.gray400, fontWeight: 600 }}>{ev.dividend_year}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 20, color: "#6D28D9", background: isDark ? "rgba(109,40,217,0.15)" : "#F5F3FF", border: `1px solid ${isDark ? "rgba(109,40,217,0.3)" : "#DDD6FE"}` }}>
                          {((ev.dividend_type || "annual").charAt(0).toUpperCase() + (ev.dividend_type || "annual").slice(1))}
                        </span>
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                        background: ev.status === "generated" ? (isDark ? "rgba(29,78,216,0.2)" : "#EFF6FF") : (isDark ? "rgba(146,64,14,0.3)" : "#FEF3C7"),
                        color: ev.status === "generated" ? (isDark ? "#93C5FD" : "#1D4ED8") : (isDark ? "#FCD34D" : "#92400E"),
                        border: `1px solid ${ev.status === "generated" ? (isDark ? "rgba(59,130,246,0.3)" : "#BFDBFE") : (isDark ? "rgba(146,64,14,0.5)" : "#FDE68A")}`,
                      }}>{ev.status === "generated" ? "Generated" : "Upcoming"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isDark ? "#4ADE80" : "#15803D" }}>TZS {Number(ev.dps).toLocaleString()}/Share</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: closurePassed ? (isDark ? "#4ADE80" : "#15803D") : (isDark ? "#FBBF24" : "#B45309") }}>
                          {closurePassed ? "Closure passed" : daysToClose === 0 ? "Closure today" : `Closure in ${daysToClose}d`}
                        </span>
                      </div>
                      {(role === "SA" || role === "AD") && ev.status === "generated" && (
                        <button
                          onClick={async () => {
                            setRefreshingEventId(ev.id);
                            try {
                              const result = await sbRefreshDividendEvent(ev.id);
                              showToast(`Refreshed: ${result.updated || 0} updated, ${result.inserted || 0} added`, "success");
                              await loadDividends();
                            } catch (e) { showToast("Error: " + e.message, "error"); }
                            finally { setRefreshingEventId(null); }
                          }}
                          disabled={refreshingEventId === ev.id}
                          style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          {refreshingEventId === ev.id ? "…" : "Refresh"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                <colgroup>
                  <col style={{ width: (role === "SA" || role === "AD") ? "22%" : "25%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: (role === "SA" || role === "AD") ? "16%" : "18%" }} />
                  <col style={{ width: (role === "SA" || role === "AD") ? "16%" : "18%" }} />
                  <col style={{ width: (role === "SA" || role === "AD") ? "14%" : "16%" }} />
                  {(role === "SA" || role === "AD") && <col style={{ width: "11%" }} />}
                </colgroup>
                <thead>
                  <tr style={{ background: C.gray50 }}>
                    {["Company", "Year", "Type", "DPS (TZS)", "Status", "Closure", ...(role === "SA" || role === "AD" ? ["Action"] : [])].map(h => (
                      <th key={h} style={{
                        padding: "8px 10px",
                        textAlign: h === "DPS (TZS)" ? "right" : "left",
                        color: C.gray400, fontWeight: 700, fontSize: 11,
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        borderBottom: `1px solid ${C.gray200}`, borderTop: `1px solid ${C.gray200}`,
                        whiteSpace: "nowrap", background: C.gray50,
                        overflow: "hidden",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {divEvents.map((ev, i) => {
                    const closurePassed = ev.closure_date <= todayIso;
                    const daysToClose = Math.ceil((new Date(ev.closure_date + "T00:00:00") - new Date(todayIso + "T00:00:00")) / 86400000);
                    const divType = ev.dividend_type || "annual";
                    return (
                      <tr key={ev.id} style={{ borderBottom: `1px solid ${C.gray100}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "9px 10px", fontWeight: 700, fontSize: 13, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.company_name}</td>
                        <td style={{ padding: "9px 10px", color: C.gray500, fontWeight: 600, fontSize: 13 }}>{ev.dividend_year}</td>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap",
                            color: "#6D28D9", background: isDark ? "rgba(109,40,217,0.15)" : "#F5F3FF",
                            border: `1px solid ${isDark ? "rgba(109,40,217,0.3)" : "#DDD6FE"}`,
                          }}>{divType.charAt(0).toUpperCase() + divType.slice(1)}</span>
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right", fontWeight: 700, fontSize: 13, color: isDark ? "#4ADE80" : "#15803D", whiteSpace: "nowrap" }}>
                          {Number(ev.dps).toLocaleString()}
                        </td>
                        <td style={{ padding: "9px 10px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 20, whiteSpace: "nowrap",
                            background: ev.status === "generated" ? (isDark ? "rgba(29,78,216,0.2)" : "#EFF6FF") : (isDark ? "rgba(146,64,14,0.3)" : "#FEF3C7"),
                            color: ev.status === "generated" ? (isDark ? "#93C5FD" : "#1D4ED8") : (isDark ? "#FCD34D" : "#92400E"),
                            border: `1px solid ${ev.status === "generated" ? (isDark ? "rgba(59,130,246,0.3)" : "#BFDBFE") : (isDark ? "rgba(146,64,14,0.5)" : "#FDE68A")}`,
                          }}>{ev.status === "generated" ? "Generated" : "Upcoming"}</span>
                        </td>
                        <td style={{ padding: "9px 10px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", color: closurePassed ? (isDark ? "#4ADE80" : "#15803D") : (isDark ? "#FBBF24" : "#B45309") }}>
                          {closurePassed ? "Passed" : daysToClose === 0 ? "Today" : `In ${daysToClose}d`}
                        </td>
                        {(role === "SA" || role === "AD") && (
                          <td style={{ padding: "6px 10px" }}>
                            {ev.status === "generated" && (
                              <button
                                onClick={async () => {
                                  setRefreshingEventId(ev.id);
                                  try {
                                    const result = await sbRefreshDividendEvent(ev.id);
                                    showToast(`Refreshed: ${result.updated || 0} updated, ${result.inserted || 0} added`, "success");
                                    await loadDividends();
                                  } catch (e) { showToast("Error: " + e.message, "error"); }
                                  finally { setRefreshingEventId(null); }
                                }}
                                disabled={refreshingEventId === ev.id}
                                style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: "transparent", color: C.gray600, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
                                {refreshingEventId === ev.id ? "…" : "Refresh"}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          )}
        </ModalShell>
      )}

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
                  {canBulkConfirm  && <button onClick={doBulkConfirm} disabled={isAnyConfirming} style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyConfirming ? C.gray200 : "#1D4ED8", color: "#ffffff", fontWeight: 700, cursor: isAnyConfirming ? "not-allowed" : "pointer" }}>{isAnyConfirming ? <><Spinner size={12} color="#888" /> Confirming...</> : <><Icon name="checkCircle" size={12} /> Confirm {selectedBuckets.confirmable.length}</>}</button>}
                  {canBulkMarkPaid && <button onClick={() => openMarkAsPaidModal(selectedBuckets.markablePaid, "")} disabled={isAnyMarkingPaid} style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyMarkingPaid ? C.gray200 : C.green, color: "#ffffff", fontWeight: 700, cursor: isAnyMarkingPaid ? "not-allowed" : "pointer" }}>{isAnyMarkingPaid ? <><Spinner size={12} color="#888" /> Marking Paid...</> : <><Icon name="checkCircle" size={12} /> Mark Paid {selectedBuckets.markablePaid.length}</>}</button>}
                  {canBulkUnpay && <button onClick={() => setBulkUnpayModal({ ids: selectedBuckets.revertable })} disabled={isAnyMarkingPaid} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid #EA580C55`, background: isAnyMarkingPaid ? C.gray100 : (isDark ? "rgba(234,88,12,0.15)" : "#FFF7ED"), color: "#EA580C", fontWeight: 700, cursor: isAnyMarkingPaid ? "not-allowed" : "pointer" }}>{isAnyMarkingPaid ? <><Spinner size={12} color="#EA580C" /> Reverting...</> : <><Icon name="undo" size={12} stroke="#EA580C" /> Revert to Declared {selectedBuckets.revertable.length}</>}</button>}
                  {canBulkReject && <button onClick={() => openRejectModal(selectedBuckets.rejectable)} disabled={isAnyRejecting} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyRejecting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyRejecting ? "not-allowed" : "pointer" }}>{isAnyRejecting ? <><Spinner size={12} color={C.red} /> Rejecting...</> : <><Icon name="xCircle" size={12} stroke={C.red} /> Reject {selectedBuckets.rejectable.length}</>}</button>}
                  {canBulkDelete && <button onClick={() => setBulkDeleteModal({ ids: selectedBuckets.deletable })} disabled={isAnyDeleting} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyDeleting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyDeleting ? "not-allowed" : "pointer" }}>{isAnyDeleting ? <><Spinner size={12} color={C.red} /> Deleting...</> : <><Icon name="trash" size={12} /> Delete {selectedBuckets.deletable.length}</>}</button>}
                  <Btn variant="secondary" onClick={() => setSelected(new Set())}>Clear Selection</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={loadDividends}>Refresh</Btn>
                  <Btn variant="secondary" icon={<Icon name="barChart" size={14} />} onClick={() => setShowStockTimeline(true)}>Stock Timeline</Btn>
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
                      onEdit={handleEdit} onOpenDeleteModal={openDeleteModal} onOpenMarkAsPaidModal={openMarkAsPaidModal} onUnpay={handleUnpay} onOpenRejectModal={openRejectModal} onConfirm={handleConfirm}
                      deletingId={deletingId} bulkDeletingIds={bulkDeletingIds} markingPaidIds={markingPaidIds} rejectingIds={rejectingIds} confirmingIds={confirmingIds}
                      isDE={isDE} isVR={isVR} isAD={isAD} isSA={isSA} isSAAD={isSAAD} showActions={showActions} onOpenDetail={setDetailModal} todayIso={todayIso}
                    />
                  ))}
                </div>
                <MobilePagination page={safePage} totalPages={totalPages} setPage={setPage} filtered={filtered.length} pageSize={pageSize} />
              </>
            ) : (
              <>
                <div className="div-scroll" style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
                    <colgroup>
                      {showCheckbox && <col style={{ width: 36 }} />}
                      {tableHeaders.map(h => <col key={h.label} style={{ width: h.width }} />)}
                    </colgroup>
                    <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        {showCheckbox && (
                          <th style={{ padding: "6px 8px", borderBottom: `2px solid ${C.gray200}`, width: 36, background: isDark ? C.gray50 : "#F0F4F8" }}>
                            <input type="checkbox" checked={allSelected}
                              ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                              onChange={toggleAll}
                              style={{ cursor: "pointer", width: 15, height: 15, accentColor: isDark ? C.green : C.green }} />
                          </th>
                        )}
                        {tableHeaders.map(h => (
                          <th key={h.label} style={{ padding: "6px 8px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: isDark ? C.gray50 : "#F0F4F8" }}>
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
                          onEdit={handleEdit} onOpenDeleteModal={openDeleteModal} onOpenMarkAsPaidModal={openMarkAsPaidModal} onUnpay={handleUnpay} onOpenRejectModal={openRejectModal} onConfirm={handleConfirm}
                          deletingId={deletingId} bulkDeletingIds={bulkDeletingIds} markingPaidIds={markingPaidIds} rejectingIds={rejectingIds} confirmingIds={confirmingIds}
                          isDE={isDE} isVR={isVR} isAD={isAD} isSA={isSA} isSAAD={isSAAD}
                          showCheckbox={showCheckbox} showActions={showActions} onOpenDetail={setDetailModal}
                          todayIso={todayIso}
                        />
                      ))}
                    </tbody>
                    {filtered.length > 1 && (
                      <tfoot>
                        <tr style={{ background: C.gray50, borderTop: `2px solid ${C.gray200}`, verticalAlign: "middle" }}>
                          <td colSpan={tfootLeftCols} style={{ padding: "7px 8px", fontWeight: 700, color: C.gray600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Totals ({filtered.length} rows{filtered.length > pageSize ? `, page shows ${paginated.length}` : ""})
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{fmt(totals.gross)}</div>
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>{fmt(totals.tax)}</div>
                          </td>
                          <td style={{ padding: "7px 8px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 12, fontWeight: 800, color: C.green }}>{fmt(totals.net)}</div>
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
