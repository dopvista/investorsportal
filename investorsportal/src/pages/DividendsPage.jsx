// ── src/pages/DividendsPage.jsx ─────────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  useTheme,
  fmt, fmtSmart, downloadPNGWithWatermark,
  Btn, StatCard, SectionCard, Modal, ActionMenu,
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
  pending:        { label: "Pending",   color: "#6B7280", bg: isDark ? "rgba(107,114,128,0.18)" : "#F3F4F6", border: isDark ? "rgba(107,114,128,0.4)" : "#D1D5DB", icon: <Icon name="clock" size={14} /> },
  declared:       { label: "Declared",  color: "#C2410C", bg: isDark ? "#C2410C22" : "#FFF7ED", border: isDark ? "#C2410C55" : "#FED7AA", icon: <Icon name="checkCircle" size={14} /> },
  ex_date_passed: { label: "Ex-Date",   color: "#1D4ED8", bg: isDark ? "#1D4ED828" : "#EFF6FF", border: isDark ? "#1D4ED855" : "#BFDBFE", icon: <Icon name="calendar" size={14} /> },
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
  { label: "#",           align: "right"  },
  { label: "Payment Date",align: "left"   },
  { label: "Div. Year",   align: "center" },
  { label: "Company",     align: "left"   },
  { label: "Per Share",   align: "right"  },
  { label: "Shares",      align: "right"  },
  { label: "Gross Amount",align: "right"  },
  { label: "Tax",         align: "right"  },
  { label: "Net Amount",  align: "right"  },
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
function getDivPermissions({ dividend, isDE, isVR, isSAAD }) {
  const isPending    = dividend.status === "pending";
  const isDeclared   = dividend.status === "declared";
  const isExDate     = dividend.status === "ex_date_passed";
  const isPaid       = dividend.status === "paid";
  const isRejected   = dividend.status === "rejected";
  const isReviewable = isDeclared || isExDate;
  return {
    canConfirm:  (isDE || isSAAD) && (isPending || isRejected),
    canEdit:     (isSAAD && !isPaid) || (isDE && (isPending || isRejected)),
    canDelete:   isDE ? (isPending || isRejected) : (isSAAD && !isPaid),
    canMarkPaid: (isSAAD || isVR) && isReviewable,
    canReject:   (isSAAD || isVR) && isReviewable,
    canUnpay:    isSAAD && isPaid,
    isPending, isDeclared, isExDate, isPaid, isRejected,
  };
}

// ── Dividend Detail Modal ─────────────────────────────────────────
const DividendDetailModal = memo(function DividendDetailModal({ dividend, companies = [], allDividends = [], onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const STATUS = useMemo(() => getStatusConfig(C, isDark), [C, isDark]);
  const captureRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

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

  // Dividend yield = DPS / Market Price × 100
  const marketPrice = Number(company?.price || 0);
  const yieldPct = (dps > 0 && marketPrice > 0) ? ((dps / marketPrice) * 100).toFixed(2) : null;

  // DPS growth vs previous dividend from same company
  const dpsGrowth = useMemo(() => {
    if (!dividend.company_id || dps <= 0) return null;
    const sameCo = allDividends
      .filter(d => d.company_id === dividend.company_id && d.id !== dividend.id)
      .sort((a, b) => {
        const da = a.payment_date || a.declaration_date || "";
        const db = b.payment_date || b.declaration_date || "";
        return db > da ? 1 : db < da ? -1 : 0;
      });
    // Find previous dividend (before this one)
    const thisDate = dividend.payment_date || dividend.declaration_date || "";
    const prev = sameCo.find(d => {
      const dd = d.payment_date || d.declaration_date || "";
      return dd < thisDate;
    });
    if (!prev) return null;
    const prevDps = Number(prev.dividend_per_share || 0);
    if (prevDps <= 0) return null;
    const change = ((dps - prevDps) / prevDps) * 100;
    return { prevDps, change };
  }, [allDividends, dividend, dps]);

  const renderSectionTitle = (title) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
  );

  const renderKVRows = (rows) => rows.map(([label, value, valueColor], i, arr) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
      <span style={{ fontSize: 12, color: C.gray500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: valueColor || C.text, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  ));

  const summaryItems = [
    { label: "Gross Amount",          currency: "TZS", amount: fmt(gross), sub: `${shares > 0 ? fmt(shares) : "—"} shares`, valueColor: C.text },
    { label: "Withholding Tax (5%)",  currency: "TZS", amount: fmt(tax),   sub: `${taxPct}% of gross`,                      valueColor: C.red },
    { label: "Net Amount",            currency: "TZS", amount: fmt(net),   sub: "after tax",                                valueColor: C.green },
  ];

  // Left panel: Dividend details (dates, per-share, shares, status, remarks)
  const leftRows = [
    ["Declaration Date", fmtDate(dividend.declaration_date)],
    ["Books Closure / Ex-Date", fmtDate(dividend.ex_dividend_date)],
    ["Payment Date",     fmtDate(dividend.payment_date)],
    ["Dividend Year",    dividend.dividend_year ? String(dividend.dividend_year) : "—"],
    ["Dividend/Share",   `TZS ${fmt(dps)}`],
    ...(yieldPct ? [["Dividend Yield", `${yieldPct}%`, C.green]] : []),
    ...(dpsGrowth ? [["DPS Growth", `${dpsGrowth.change >= 0 ? "+" : ""}${dpsGrowth.change.toFixed(1)}% vs TZS ${fmt(dpsGrowth.prevDps)}`, dpsGrowth.change >= 0 ? C.green : C.red]] : []),
    ["Shares Held",      shares > 0 ? fmt(shares) : "\u2014"],
    ["Status",           st.label],
    ["Remarks",          dividend.remarks || "\u2014"],
    ...(dividend.status === "rejected" && dividend.rejection_reason ? [["Rejection Reason", dividend.rejection_reason, C.red]] : []),
  ];

  // Right panel: Tax & income breakdown
  const taxRows = [
    ["Gross Amount",     `TZS ${fmt(gross)}`],
    ["Tax Rate",         `${taxPct}%`],
    ["Withholding Tax",  `TZS ${fmt(tax)}`, C.red],
  ];

  const auditIconColor = isDark ? undefined : "#374151";

  const renderLeftPanel = () => (
    <div style={{ padding: "14px 20px" }}>
      {renderSectionTitle("Dividend Details")}
      {renderKVRows(leftRows)}
    </div>
  );

  const renderTaxPanel = () => (
    <div style={{ padding: "14px 20px", borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}` }}>
      {renderSectionTitle("Tax & Income")}
      {renderKVRows(taxRows)}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `2px solid ${C.gray200}`, marginTop: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Net Income</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.green }}>TZS {fmt(net)}</span>
      </div>
    </div>
  );

  const renderAuditTrail = () => (
    <div style={{ padding: "14px 20px" }}>
      {renderSectionTitle("Audit trail")}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Recorded step */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: C.gray100, border: `1px solid ${C.gray600}22` }}>
          <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.gray600}20`, border: `1.5px solid ${C.gray600}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="fileText" size={11} stroke={auditIconColor} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray600 }}>Recorded</div>
            <div style={{ fontSize: 10, color: C.gray400 }}>{fmtDateTime(dividend.created_at) || "—"}</div>
          </div>
          {dividend.created_by_name && (
            <span style={{ fontSize: 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.created_by_name}</span>
          )}
        </div>
        {/* Paid step (if paid) */}
        {dividend.status === "paid" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: C.greenBg, border: `1px solid ${C.green}22` }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.green}20`, border: `1.5px solid ${C.green}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="checkCircle" size={11} stroke={auditIconColor} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Paid</div>
              <div style={{ fontSize: 10, color: C.gray400 }}>{fmtDateTime(dividend.paid_at) || fmtDateTime(dividend.updated_at) || "—"}</div>
            </div>
            {dividend.paid_by_name && (
              <span style={{ fontSize: 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.paid_by_name}</span>
            )}
          </div>
        )}
        {/* Rejected step (if rejected) */}
        {dividend.status === "rejected" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: isDark ? `${C.red}18` : "#FFF5F5", border: `1px solid ${isDark ? `${C.red}44` : "#FECACA"}` }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: `${C.red}20`, border: `1.5px solid ${C.red}40`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name="xCircle" size={11} stroke={C.red} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.red }}>Rejected</div>
                <div style={{ fontSize: 10, color: C.gray400 }}>{fmtDateTime(dividend.rejected_at) || "—"}</div>
              </div>
              {dividend.rejected_by_name && (
                <span style={{ fontSize: 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dividend.rejected_by_name}</span>
              )}
            </div>
            {dividend.rejection_reason && (
              <div style={{ padding: "6px 10px", background: isDark ? `${C.red}14` : "#FFF5F5", borderRadius: 8, border: `1px solid ${isDark ? `${C.red}33` : "#FECACA"}`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
                💬 {dividend.rejection_reason}
              </div>
            )}
          </div>
        )}
        {/* Awaiting steps (if not paid and not rejected) */}
        {dividend.status !== "paid" && dividend.status !== "rejected" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: "transparent", border: `1px solid ${C.gray100}`, opacity: 0.45 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.gray100, border: `1.5px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="checkCircle" size={11} stroke={C.gray400} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.gray400 }}>Paid</div>
              <div style={{ fontSize: 10, color: C.gray400 }}>Awaiting</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderRightPanel = () => (
    <>
      {renderTaxPanel()}
      {renderAuditTrail()}
    </>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.56)", backdropFilter: "blur(3px)", zIndex: 9999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={captureRef} style={{ background: C.white, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1.5px solid ${C.gray200}`, borderBottom: isMobile ? "none" : undefined, width: "100%", maxWidth: isMobile ? "100%" : 680, maxHeight: isMobile ? "92vh" : "95vh", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: isMobile ? "16px 18px 14px" : "18px 24px 16px", borderRadius: isMobile ? "16px 16px 0 0" : "16px 16px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#ffffff" }}>{companyName}</span>
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", gap: 8, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
              <span style={{ whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={12} stroke="rgba(255,255,255,0.6)" sw={2} /> {fmt(dps)} per share</span>
              <span style={{ whiteSpace: "nowrap", flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="calendar" size={12} stroke="rgba(255,255,255,0.6)" sw={2} /> {fmtDate(dividend.payment_date)}</span>
              {dividend.cds_number && (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  CDS {dividend.cds_number}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>

        {/* Summary strip — 3 columns on desktop, stacked on mobile */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", borderBottom: `1px solid ${C.gray200}`, background: C.gray50, flexShrink: 0 }}>
          {summaryItems.map((item, i) => (
            <div key={i} style={{ padding: isMobile ? "10px 18px" : "12px 20px", borderLeft: (!isMobile && i > 0) ? `1px solid ${C.gray200}` : "none", borderBottom: isMobile && i < 2 ? `1px solid ${C.gray200}` : "none", background: i === 2 ? C.greenBg : "transparent", display: isMobile ? "flex" : "block", alignItems: isMobile ? "center" : undefined, justifyContent: isMobile ? "space-between" : undefined }}>
              <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isMobile ? 0 : 2 }}>{item.label}</div>
              {isMobile ? (
                <div style={{ fontSize: 14, fontWeight: 800, color: item.valueColor, lineHeight: 1 }}>{item.currency} {item.amount}</div>
              ) : (
                <>
                  <div style={{ fontSize: 17, fontWeight: 800, color: item.valueColor, lineHeight: 1 }}><span style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>{item.currency}</span> {item.amount}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{item.sub}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Body — 2-column on desktop, single on mobile */}
        <div className="div-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {isMobile ? (
            <>
              {renderLeftPanel()}
              <div style={{ borderTop: `1px solid ${C.gray100}` }}>{renderAuditTrail()}</div>
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
  isDE, isVR, isSAAD, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const net = Number(dividend.net_amount || 0) || (Number(dividend.total_amount || 0) - Number(dividend.withholding_tax || 0));
  const dps = Number(dividend.dividend_per_share || 0);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isVR, isSAAD }), [dividend, isDE, isVR, isSAAD]);

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

  return (
    <div onClick={() => !isRowBusy && onOpenDetail(dividend.id)}
      style={{ background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: isRowBusy ? "not-allowed" : "pointer", opacity: isRowBusy ? 0.6 : 1, transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>

      {/* Row 1: Company name + ActionMenu */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 5 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dividend.company_name || "Unknown"}</div>
          {(() => { const yr = dividend.dividend_year || (dividend.payment_date ? new Date(dividend.payment_date + "T00:00:00").getFullYear() : null); return yr ? <div style={{ fontSize: 11, fontWeight: 600, color: C.gray400, marginTop: 2 }}>Div. Year: {yr}</div> : null; })()}
        </div>
        {showActions && rowActions.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}><ActionMenu actions={rowActions} /></div>
        )}
      </div>

      {/* Row 2: DPS badge + Status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ background: C.greenBg, color: C.green, border: `1px solid ${isDark ? `${C.green}55` : "#BBF7D0"}`, padding: "0 10px", height: 24, borderRadius: 20, fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center" }}>TZS {fmt(dps)}/Share</span>
        <DivStatusBadge status={dividend.status} />
      </div>

      {/* Row 3: Date + countdown */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.gray500 }}>📅 {fmtDate(dividend.payment_date)}</span>
        {countdownPill}
      </div>

      {/* Row 4: Stat box — DPS × Shares → Net Amount */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, borderRadius: 9, padding: "8px 12px" }}>
        <div>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>DPS × Shares</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmt(dps)} × {shares > 0 ? shares.toLocaleString() : "—"}</div>
        </div>
        <span style={{ fontSize: 14, color: C.gray400, margin: "0 6px" }}>→</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Net Amount</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.green }}>TZS {fmtSmart(net)}</div>
        </div>
      </div>

      {/* Rejection reason */}
      {perms.isRejected && dividend.rejection_reason && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: isDark ? `${C.red}14` : "#FFF5F5", borderRadius: 8, border: `1px solid ${isDark ? `${C.red}33` : "#FECACA"}`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
          💬 {dividend.rejection_reason}
        </div>
      )}
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
  onEdit, onOpenDeleteModal, onOpenMarkAsPaidModal, onUnpay, onOpenRejectModal, onConfirm,
  deletingId, bulkDeletingIds, markingPaidIds, rejectingIds, confirmingIds,
  isDE, isVR, isSAAD, showCheckbox, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const gross = Number(dividend.total_amount || 0);
  const tax = Number(dividend.withholding_tax || 0);
  const net = Number(dividend.net_amount || 0) || (gross - tax);
  const dps = Number(dividend.dividend_per_share || 0);
  const shares = Number(dividend.shares_held || 0);
  const isChecked = selected.has(dividend.id);

  const perms = useMemo(() => getDivPermissions({ dividend, isDE, isVR, isSAAD }), [dividend, isDE, isVR, isSAAD]);

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

  return (
    <tr style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: rowBg, opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
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
      <td style={{ padding: "7px 10px", textAlign: "center", whiteSpace: "nowrap", fontWeight: 700, color: C.gray500, fontSize: 12 }}>{dividend.dividend_year || "—"}</td>
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
  const [rejectingIds, setRejectingIds]       = useState(new Set());
  const [confirmingIds, setConfirmingIds]     = useState(new Set());

  const [deleteModal, setDeleteModal]           = useState(null);
  const [bulkDeleteModal, setBulkDeleteModal]   = useState(null);
  const [markAsPaidModal, setMarkAsPaidModal]   = useState(null);
  const [bulkUnpayModal, setBulkUnpayModal]     = useState(null);
  const [rejectModal, setRejectModal]           = useState(null);
  const [formModal, setFormModal]               = useState({ open: false, dividend: null });
  const [detailModal, setDetailModal]           = useState(null);

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

  const myDividends = useMemo(
    () => (cdsNumber ? dividends.filter(d => d.cds_number === cdsNumber) : dividends),
    [dividends, cdsNumber]
  );

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
      if (d.status === "declared" || d.status === "ex_date_passed") markablePaid.push(id);
      if ((isDE || isSAAD) && (d.status === "pending" || d.status === "rejected")) confirmable.push(id);
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
  }, [selected, divById, isSAAD, isDE, isVR]);

  const canBulkConfirm  = (isDE || isSAAD) && selectedBuckets.confirmable.length > 0;
  const canBulkDelete   = (isDE || isSAAD) && selectedBuckets.deletable.length > 0;
  const canBulkMarkPaid = (isVR || isSAAD) && selectedBuckets.markablePaid.length > 0;
  const canBulkUnpay    = isSAAD && selectedBuckets.revertable.length > 0;
  const canBulkReject   = (isVR || isSAAD) && selectedBuckets.rejectable.length > 0;

  const openFormModal    = useCallback((dividend = null) => { if (loadingCompanies) return; setFormModal({ open: true, dividend }); }, [loadingCompanies]);
  const openDeleteModal  = useCallback((dividend) => setDeleteModal({ id: dividend.id, company_name: dividend.company_name }), []);
  const openRejectModal      = useCallback((ids) => setRejectModal({ ids }), []);
  const openMarkAsPaidModal  = useCallback((ids, defaultPaymentDate) => setMarkAsPaidModal({ ids, defaultPaymentDate: defaultPaymentDate || "" }), []);

  // ── Handlers ────────────────────────────────────────────────────
  const handleConfirm = useCallback(async (id) => {
    setConfirmingIds(prev => { const s = new Set(prev); s.add(id); return s; });
    try {
      await sbUpdateDividendStatus(id, "declared");
      if (!isMountedRef.current) return;
      setDividends(p => p.map(d => d.id === id ? { ...d, status: "declared" } : d));
      showToast("Dividend confirmed as Declared.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setConfirmingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [showToast]);

  const doBulkConfirm = useCallback(async () => {
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
  }, [selectedBuckets.confirmable, showToast]);

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

  const doMarkAsPaid = useCallback(async (paymentDate) => {
    const ids = markAsPaidModal?.ids;
    if (!ids?.length) return;
    setMarkAsPaidModal(null);
    setMarkingPaidIds(new Set(ids));
    try {
      await sbBulkUpdateDividendStatus(ids, "paid", null, paymentDate || null);
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      setDividends(p => p.map(d => idSet.has(d.id)
        ? { ...d, status: "paid", paid_at: now, ...(paymentDate ? { payment_date: paymentDate } : {}) }
        : d
      ));
      setSelected(new Set());
      showToast(`${ids.length} dividend${ids.length > 1 ? "s" : ""} marked as paid.`, "success");
      loadDividends({ fromPull: false }).catch(() => {});
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setMarkingPaidIds(new Set());
    }
  }, [markAsPaidModal, showToast, loadDividends]);

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
    const upcomingSub = stats.upcoming > 0 ? `${stats.upcoming} upcoming` : "None upcoming";
    if (isSAAD) return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: stats.upcoming,                          sub: upcomingSub,                                                 icon: <Icon name="clock" size={17} />,      color: C.gold  },
    ];
    if (isDE) return [
      { label: "My Dividends",    value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.exDatePassed} ex-date`, icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: stats.upcoming,                          sub: upcomingSub,                                                 icon: <Icon name="clock" size={17} />,      color: C.gold  },
    ];
    if (isVR || isRO) return [
      { label: "Total Records",   value: stats.total,                            sub: `${stats.paid} paid`,                                        icon: <Icon name="clipboard" size={17} />,  color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: stats.upcoming,                          sub: upcomingSub,                                                 icon: <Icon name="clock" size={17} />,      color: C.gold  },
    ];
    // fallback (same as SA/AD)
    return [
      { label: "Total Dividends", value: stats.total,                            sub: `${stats.declared} declared \u00B7 ${stats.paid} paid`,      icon: <Icon name="dollarSign" size={17} />, color: C.navy  },
      { label: "YTD Net Income",  value: `TZS ${fmtSmart(stats.ytdNet)}`,        sub: `${new Date().getFullYear()} paid net`,                      icon: <Icon name="download" size={17} />,   color: C.green },
      { label: "Total Tax",       value: `TZS ${fmtSmart(stats.totalTax)}`,      sub: "Withholding tax",                                           icon: <Icon name="upload" size={17} />,     color: C.red   },
      { label: "Upcoming",        value: stats.upcoming,                          sub: upcomingSub,                                                 icon: <Icon name="clock" size={17} />,      color: C.gold  },
    ];
  }, [C, stats, isSAAD, isDE, isVR, isRO]);

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
      {formModal.open && <DividendFormModal key={formModal.dividend?.id || "new"} dividend={formModal.dividend} companies={formCompanies} onConfirm={handleFormConfirm} onClose={closeForm} />}
      {detailDividend && <DividendDetailModal dividend={detailDividend} companies={effectiveCompanies} allDividends={myDividends} onClose={closeDetail} />}

      {/* ── Transform wrapper ── */}
      <div style={{ transform: isMobile ? `translateY(${pullDistance}px)` : "none", transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"), willChange: isMobile ? "transform" : "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>

        {/* ── Stat cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: isMobile ? 6 : 8, marginBottom: isMobile ? 10 : 8, flexShrink: 0 }}>
          {mobileStatCards.map(s => <StatCard key={s.label} {...s} />)}
        </div>

        {/* ── Upcoming alert strip ── */}
        {stats.upcoming > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "8px 12px" : "8px 14px",
            marginBottom: isMobile ? 10 : 8, borderRadius: 10, flexShrink: 0,
            background: isDark ? "#92400E18" : "#FFFBEB",
            border: `1px solid ${isDark ? "#92400E55" : "#FDE68A"}`,
          }}>
            <Icon name="clock" size={15} stroke={isDark ? "#FBBF24" : "#B45309"} />
            <span style={{ fontSize: 12, fontWeight: 600, color: isDark ? "#FBBF24" : "#92400E" }}>
              {stats.upcoming} upcoming dividend{stats.upcoming > 1 ? "s" : ""} — {stats.declared > 0 ? `${stats.declared} declared` : ""}{stats.declared > 0 && stats.exDatePassed > 0 ? ", " : ""}{stats.exDatePassed > 0 ? `${stats.exDatePassed} ex-date passed` : ""}
            </span>
          </div>
        )}

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
                      isDE={isDE} isVR={isVR} isSAAD={isSAAD} showActions={showActions} onOpenDetail={setDetailModal}
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
                          onEdit={handleEdit} onOpenDeleteModal={openDeleteModal} onOpenMarkAsPaidModal={openMarkAsPaidModal} onUnpay={handleUnpay} onOpenRejectModal={openRejectModal} onConfirm={handleConfirm}
                          deletingId={deletingId} bulkDeletingIds={bulkDeletingIds} markingPaidIds={markingPaidIds} rejectingIds={rejectingIds} confirmingIds={confirmingIds}
                          isDE={isDE} isVR={isVR} isSAAD={isSAAD}
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
