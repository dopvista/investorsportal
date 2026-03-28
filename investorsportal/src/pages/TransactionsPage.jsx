// ── src/pages/TransactionsPage.jsx ───────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  useTheme,
  fmt, fmtInt, fmtSmart, calcFees,
  Btn, StatCard, SectionCard, Modal, ActionMenu,
  TransactionFormModal, ImportTransactionsModal,
} from "../components/ui";
import { Icon } from "../lib/icons";
import {
  sbGetAllCompanies,
  sbGetTransactions,
  sbGetTransactionsByIds,
  sbInsertTransaction,
  sbUpdateTransaction,
  sbDeleteTransaction,
  sbConfirmTransaction,
  sbVerifyTransactions,
  sbRejectTransactions,
  sbUnverifyTransaction,
  sbUnverifyTransactions,
  sbGetActiveBrokers,
  sbGetCdsAccount,
} from "../lib/supabase";

// ── Module-level CSS injection (once, not per-render) ─────────────
if (typeof document !== "undefined" && !document.getElementById("_tx_keyframes")) {
  const s = document.createElement("style");
  s.id = "_tx_keyframes";
  s.textContent = "@keyframes _txSpin{to{transform:rotate(360deg)}} @keyframes _txPageSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}

const TOOLBAR_BASE   = { height: 36, borderRadius: 8, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" };
const TOOLBAR_BUTTON = { ...TOOLBAR_BASE, padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 };

// ── FIX 7: useIsMobile with debounce ─────────────────────────────
// Previously fired setIsMobile on every resize pixel — same 80ms
// debounce pattern used in CompaniesPage and DashboardPage.
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
  if (!d) return "—";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const fmtDateTime = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const getStatusConfig = (C, isDark) => ({
  pending:   { label: "Pending",   color: "#C2410C", bg: isDark ? "#C2410C22" : "#FFF7ED", border: isDark ? "#C2410C55" : "#FED7AA", icon: <Icon name="clock" size={14} /> },
  confirmed: { label: "Confirmed", color: "#1D4ED8", bg: isDark ? "#1D4ED828" : "#EFF6FF", border: isDark ? "#1D4ED855" : "#BFDBFE", icon: <Icon name="checkCircle" size={14} /> },
  verified:  { label: "Verified",  color: C.green,   bg: C.greenBg,                        border: isDark ? `${C.green}55` : "#BBF7D0", icon: <Icon name="check" size={14} /> },
  rejected:  { label: "Rejected",  color: C.red,     bg: C.redBg,                          border: isDark ? `${C.red}55`  : "#FECACA", icon: <Icon name="xCircle" size={14} /> },
});

const defaultStatus = "All";
const statusOptions = [
  ["All", "All Statuses"],
  ["pending", "Pending"],
  ["confirmed", "Confirmed"],
  ["verified", "Verified"],
  ["rejected", "Rejected"],
];

const TABLE_HEADERS_WITH_ACTIONS = [
  { label: "#",           align: "right"  },
  { label: "Date",        align: "left"   },
  { label: "Company",     align: "left"   },
  { label: "Type",        align: "left"   },
  { label: "Qty",         align: "right"  },
  { label: "Price/Share", align: "right"  },
  { label: "Total Fees",  align: "right"  },
  { label: "Grand Total", align: "right"  },
  { label: "Broker",      align: "left"   },
  { label: "Status",      align: "left"   },
  { label: "Actions",     align: "center" },
];
const TABLE_HEADERS_WITHOUT_ACTIONS = TABLE_HEADERS_WITH_ACTIONS.slice(0, -1);

// ── Spinner ───────────────────────────────────────────────────────
const Spinner = memo(function Spinner({ size = 13, color = "#fff", style = {} }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "_txSpin 0.65s linear infinite", flexShrink: 0, ...style }} />
  );
});

// ── Status Badge ──────────────────────────────────────────────────
const StatusBadge = memo(function StatusBadge({ status }) {
  const { C, isDark } = useTheme();
  const STATUS = getStatusConfig(C, isDark);
  const s = STATUS[status] || STATUS.pending;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {s.icon} {s.label}
    </span>
  );
});

// ── Reject Modal ──────────────────────────────────────────────────
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20 }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}><Icon name="xCircle" size={15} /> Reject Transaction{count > 1 ? "s" : ""}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count > 1 ? `${count} transactions selected` : "1 transaction selected"}</div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          {err && <div style={{ background: C.redBg, border: `1px solid ${C.red}55`, color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Rejection Reason <span style={{ color: C.red }}>*</span></label>
          <textarea value={comment} onChange={e => { setComment(e.target.value); setErr(""); }} placeholder="Explain why this transaction is being rejected..." rows={4}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit", resize: "vertical", color: C.text, background: C.white, boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = C.red; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
          <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>This comment will be visible to the Data Entrant.</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !comment.trim()} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: saving || !comment.trim() ? C.gray200 : C.red, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: saving || !comment.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {saving ? <><Spinner size={13} color="#fff" /> Rejecting...</> : `Reject ${count > 1 ? `${count} Transactions` : "Transaction"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Action Modal ──────────────────────────────────────────
const ConfirmActionModal = memo(function ConfirmActionModal({ action, count = 1, company, onConfirm, onClose, loading }) {
  const { C, isDark } = useTheme();
  const isVerify    = action === "verify";
  const accentColor = isVerify ? C.green : "#1D4ED8";
  const accentBg    = isVerify ? C.greenBg                      : (isDark ? "#1D4ED828" : "#EFF6FF");
  const accentBdr   = isVerify ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? "#1D4ED855" : "#BFDBFE");
  const icon        = isVerify ? <Icon name="check" size={15} /> : <Icon name="checkCircle" size={15} />;
  const title       = isVerify ? `Verify Transaction${count > 1 ? "s" : ""}` : "Confirm Transaction";
  const subtitle    = count > 1 ? `${count} transactions selected` : company || "1 transaction";
  const description = isVerify
    ? `Verifying will mark ${count > 1 ? "these transactions" : "this transaction"} as verified and finalize them.`
    : action === "confirm-rejected"
      ? "This transaction was previously rejected. Confirming will resubmit it to the Verifier for review."
      : "Confirming will send this transaction to the Verifier for review.";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", border: `1.5px solid ${C.gray200}`, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: "18px 20px 14px", borderRadius: "18px 18px 0 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16 }}>{icon} {title}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ background: accentBg, border: `1px solid ${accentBdr}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 18, marginTop: 1 }}>{isVerify ? <Icon name="search" size={18} /> : <Icon name="clipboard" size={18} />}</span>
            <div style={{ fontSize: 13, color: accentColor, lineHeight: 1.5 }}>{description}</div>
          </div>
          <div style={{ fontSize: 13, color: C.gray600 }}>Are you sure you want to proceed?</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: loading ? C.gray200 : accentColor, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading
              ? <><Spinner size={13} color="#fff" />{isVerify ? "Verifying..." : "Confirming..."}</>
              : <>{icon} {isVerify ? (count > 1 ? `Verify ${count}` : "Verify") : "Confirm"}</>}
          </button>
        </div>
      </div>
    </div>
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
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 3, fontWeight: 600 }}>{count} transaction{count > 1 ? "s" : ""} selected</div>
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
          Showing <strong style={{ color: C.text }}>{from === to ? from.toLocaleString() : `${from.toLocaleString()}–${to.toLocaleString()}`}</strong> of <strong style={{ color: C.text }}>{filtered.toLocaleString()}</strong>
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
          <PgBtn onClick={() => setPage(1)} disabled={page === 1} label="«" />
          <PgBtn onClick={() => setPage(p => p - 1)} disabled={page === 1} label="‹" />
          {pages.map((p, i) => p === "..." ? (
            <span key={`e${i}`} style={{ padding: "0 4px", color: C.gray400, fontSize: 12 }}>…</span>
          ) : (
            <PgBtn key={p} onClick={() => setPage(p)} active={p === page} label={p} />
          ))}
          <PgBtn onClick={() => setPage(p => p + 1)} disabled={page === totalPages} label="›" />
          <PgBtn onClick={() => setPage(totalPages)} disabled={page === totalPages} label="»" />
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
        <strong style={{ color: C.text }}>{from === to ? from.toLocaleString() : `${from.toLocaleString()}–${to.toLocaleString()}`}</strong> of <strong style={{ color: C.text }}>{filtered.toLocaleString()}</strong>
      </span>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === 1 ? C.gray50 : C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <span style={{ fontSize: 11, color: C.gray500, fontWeight: 600, whiteSpace: "nowrap" }}>{page.toLocaleString()} / {totalPages.toLocaleString()}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
            style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === totalPages ? C.gray50 : C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
      )}
    </div>
  );
});

// ── Row permissions ───────────────────────────────────────────────
const getRowPermissions = ({ transaction, isDE, isVR, isSAAD }) => {
  const isPending   = transaction.status === "pending";
  const isConfirmed = transaction.status === "confirmed";
  const isVerified  = transaction.status === "verified";
  const isRejected  = transaction.status === "rejected";
  return {
    canConfirm:  (isDE || isSAAD) && (isPending || isRejected),
    canEdit:     isSAAD || (isDE && (isPending || isRejected)),
    canDelete:   isDE ? (isPending || isRejected) : (isSAAD && !isVerified),
    canUnVerify: isSAAD && isVerified,
    canVerify:   (isVR || isSAAD) && isConfirmed,
    canReject:   (isVR || isSAAD) && isConfirmed,
    isPending, isConfirmed, isVerified, isRejected,
  };
};

// ── Transaction Detail Modal ──────────────────────────────────────
const TransactionDetailModal = memo(function TransactionDetailModal({ transaction, transactions = [], companies = [], onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();

  const [cdsAccountName, setCdsAccountName] = useState(null);
  useEffect(() => {
    const cdsNum = transaction?.cds_number;
    if (!cdsNum) { setCdsAccountName(""); return; }
    setCdsAccountName(null);
    let cancelled = false;
    sbGetCdsAccount(cdsNum)
      .then(acc => { if (cancelled) return; setCdsAccountName(acc?.cds_name || ""); })
      .catch(() => { if (!cancelled) setCdsAccountName(""); });
    return () => { cancelled = true; };
  }, [transaction?.cds_number]);

  if (!transaction) return null;

  const STATUS      = getStatusConfig(C, isDark);
  const isBuy       = transaction.type === "Buy";
  const isVerified  = transaction.status === "verified";
  const tradeVal    = Number(transaction.total || 0);
  const fees        = Number(transaction.fees  || 0);
  const gt          = isBuy ? tradeVal + fees : tradeVal - fees;
  const st          = STATUS[transaction.status] || STATUS.pending;
  const bd          = calcFees(tradeVal);
  const totalFees   = fees || bd.total;
  const feePct      = tradeVal > 0 ? (totalFees / tradeVal * 100).toFixed(2) : "0.00";
  const qty         = Number(transaction.qty || 0);
  const accentColor = isBuy ? C.green : C.red;
  const accentBg    = isBuy ? C.greenBg : C.redBg;
  const accentBdr   = isBuy ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");
  const allInCostPerShare = isBuy && qty > 0 ? gt / qty : null;

  const companiesMap = useMemo(() => new Map(companies.map(c => [c.id, c])), [companies]);

  const unrealizedGL = useMemo(() => {
    if (!isBuy || !isVerified || !qty) return null;
    const company = companiesMap.get(transaction.company_id);
    const currentPrice = Number(company?.price || company?.cds_price || 0);
    if (!currentPrice) return null;
    const currentValue = currentPrice * qty;
    const costBasis    = gt;
    const gain         = currentValue - costBasis;
    const pct          = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    return { currentPrice, currentValue, costBasis, gain, pct };
  }, [isBuy, isVerified, qty, companiesMap, transaction.company_id, gt]);

  const realizedGL = useMemo(() => {
    if (isBuy || !transaction.company_id) return null;
    const companyTxns = transactions
      .filter(t => t.company_id === transaction.company_id && t.status === "verified")
      .map(t => ({ ...t, _ts: new Date(t.date || t.created_at || 0).getTime() }))
      .sort((a, b) => a._ts !== b._ts ? a._ts - b._ts : new Date(a.created_at||0) - new Date(b.created_at||0));

    let sharesHeld = 0, costHeld = 0, runningAvg = 0;
    for (const t of companyTxns) {
      const tQty = Number(t.qty || 0), tTotal = Number(t.total || 0), tFees = Number(t.fees || 0);
      if (t.type === "Buy") {
        const cost = tTotal + tFees; costHeld += cost; sharesHeld += tQty;
        runningAvg = sharesHeld > 0 ? costHeld / sharesHeld : 0;
      } else if (t.type === "Sell") {
        const actualSold = Math.min(tQty, sharesHeld);
        const costBasis  = actualSold * runningAvg;
        const proceeds   = tTotal - tFees;
        const gain       = proceeds - costBasis;
        if (t.id === transaction.id) {
          return { gain, costBasis, proceeds, avgBuyCostPerShare: runningAvg, sellNetPerShare: actualSold > 0 ? proceeds / actualSold : 0, pct: costBasis > 0 ? (gain / costBasis) * 100 : 0 };
        }
        costHeld -= costBasis; sharesHeld -= actualSold;
        if (sharesHeld <= 0) { sharesHeld = 0; costHeld = 0; runningAvg = 0; }
      }
    }
    return null;
  }, [isBuy, transaction.id, transaction.company_id, transactions]);

  const auditIconColor = isDark ? undefined : "#374151";
  const AUDIT_STEPS = useMemo(() => [
    { icon: <Icon name="fileText" size={11} stroke={auditIconColor} />, label: "Recorded",  time: transaction.created_at,   name: transaction.created_by_name,   stepColor: C.gray600, activeBg: C.gray100 },
    { icon: <Icon name="checkCircle" size={11} stroke={auditIconColor} />, label: "Confirmed", time: transaction.confirmed_at, name: transaction.confirmed_by_name, stepColor: "#1D4ED8", activeBg: isDark ? "#1D4ED820" : "#EFF6FF" },
    { icon: <Icon name="check" size={11} stroke={auditIconColor} />, label: "Verified",  time: transaction.verified_at,  name: transaction.verified_by_name,  stepColor: C.green,   activeBg: C.greenBg },
    ...(transaction.status === "rejected"
      ? [{ icon: <Icon name="xCircle" size={11} stroke={auditIconColor} />, label: "Rejected", time: transaction.rejected_at, name: transaction.rejected_by_name, stepColor: C.red, activeBg: C.redBg }]
      : []
    ),
  ], [C, isDark, auditIconColor, transaction.created_at, transaction.confirmed_at, transaction.verified_at, transaction.rejected_at,
      transaction.created_by_name, transaction.confirmed_by_name, transaction.verified_by_name, transaction.rejected_by_name, transaction.status]);

  const summaryItems = [
    { label: "Trade Value",                          value: `TZS ${fmt(tradeVal)}`,  sub: `${fmtInt(transaction.qty)} shares × ${fmt(transaction.price)}`, valueColor: C.text     },
    { label: "Total Fees",                           value: `TZS ${fmt(totalFees)}`, sub: `${feePct}% of trade value`,                                     valueColor: C.gold     },
    { label: isBuy ? "Total Paid" : "Net Received", value: `TZS ${fmt(gt)}`,         sub: isBuy ? "trade + fees" : "trade − fees",                        valueColor: accentColor },
  ];

  const transactionRows = [
    ["Date",        fmtDate(transaction.date)],
    ["Quantity",    `${fmtInt(transaction.qty)} shares`],
    ["Price/Share", `TZS ${fmt(transaction.price)}`],
    ["Trade Value", `TZS ${fmt(tradeVal)}`],
    ...(allInCostPerShare ? [["All-in Cost/Share",  `TZS ${fmt(Math.round(allInCostPerShare))}`]] : []),
    ...(unrealizedGL      ? [["Market Value/Share", `TZS ${fmt(unrealizedGL.currentPrice)}`]]     : []),
    ...(realizedGL        ? [["All-in Cost/Share",  `TZS ${fmt(Math.round(realizedGL.avgBuyCostPerShare))}`]] : []),
    ...(realizedGL        ? [["Net Sell/Share",      `TZS ${fmt(Math.round(realizedGL.sellNetPerShare))}`]]   : []),
  ];

  const commissionRows = [
    ["Broker (+VAT)",    bd.broker   ],
    ["CMSA (0.14%)",     bd.cmsa     ],
    ["DSE (+VAT)",       bd.dse      ],
    ["CSDR (+VAT)",      bd.csdr     ],
    ["Fidelity (0.02%)", bd.fidelity ],
  ];

  const renderKVRows = (rows) => rows.map(([label, value], i, arr) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
      <span style={{ fontSize: 12, color: C.gray500 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{typeof value === "number" ? fmt(value) : value}</span>
    </div>
  ));

  const renderSectionTitle = (title) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
  );

  const renderGLCard = (gl, type) => {
    if (!gl) return null;
    const isGain = gl.gain >= 0;
    const glBg   = isGain ? C.greenBg : C.redBg;
    const glBdr  = isGain ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");
    const glCol  = isGain ? C.green : C.red;
    const rows   = type === "buy"
      ? [["Current Price × " + fmtInt(qty) + " shares", `TZS ${fmt(gl.currentValue)}`], ["All-in Cost (trade + fees)", `TZS ${fmt(gl.costBasis)}`]]
      : [["Cost Basis", `TZS ${fmt(Math.round(gl.costBasis))}`], ["Net Proceeds", `TZS ${fmt(Math.round(gl.proceeds))}`]];
    const cardTitle = type === "buy" ? "Unrealized Gain / Loss" : "Realized Gain / Loss";
    return (
      <div style={{ padding: "0 20px 14px" }}>
        <div style={{ padding: "8px 10px", background: glBg, borderRadius: 8, border: `1px solid ${glBdr}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: glCol, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{cardTitle}</div>
          {rows.map(([label, value], i, arr) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: i < arr.length - 1 ? 3 : 6, ...(i === arr.length - 1 ? { paddingBottom: 6, borderBottom: `1px solid ${glBdr}` } : {}) }}>
              <span style={{ fontSize: 11, color: C.gray500 }}>{label}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{value}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: glCol }}>{isGain ? "▲ Gain" : "▼ Loss"}</span>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: glCol }}>{isGain ? "+" : ""}TZS {fmt(Math.round(gl.gain))}</span>
              <span style={{ fontSize: 10, color: glCol, marginLeft: 6 }}>({isGain ? "+" : ""}{gl.pct.toFixed(2)}%)</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => (
    <>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.gray100}` }}>
        {renderSectionTitle("Reference & Broker")}
        {[
          ["Broker",  transaction.broker_name,    false],
          ["Ref No.", transaction.control_number, true ],
          ["Remarks", transaction.remarks,        false],
        ].map(([label, value, mono]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.gray100}`, gap: 10 }}>
            <span style={{ fontSize: 12, color: C.gray500, flexShrink: 0 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: value ? C.text : C.gray400, fontFamily: mono ? "monospace" : "inherit", letterSpacing: mono ? "0.04em" : 0, textAlign: "right", wordBreak: "break-all" }}>{value || "—"}</span>
          </div>
        ))}
        {transaction.status === "rejected" && transaction.rejection_comment && (
          <div style={{ marginTop: 8, padding: "8px 10px", background: C.redBg, borderRadius: 8, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.red, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Rejection reason</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>{transaction.rejection_comment}</div>
          </div>
        )}
      </div>
      <div style={{ padding: "14px 20px" }}>
        {renderSectionTitle("Audit trail")}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {AUDIT_STEPS.map((step) => {
            const done = !!step.time;
            return (
              <div key={step.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 8, background: done ? step.activeBg : "transparent", border: `1px solid ${done ? step.stepColor + "22" : C.gray100}`, opacity: done ? 1 : 0.45 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: done ? step.stepColor + "20" : C.gray100, border: `1.5px solid ${done ? step.stepColor + "40" : C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>{step.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: done ? step.stepColor : C.gray400 }}>{step.label}</div>
                  <div style={{ fontSize: 10, color: C.gray400 }}>{done ? fmtDateTime(step.time) : "Awaiting"}</div>
                </div>
                {done && step.name && (
                  <span style={{ fontSize: 11, color: C.gray600, fontWeight: 600, flexShrink: 0, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.name}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {unrealizedGL && renderGLCard(unrealizedGL, "buy")}
      {realizedGL   && renderGLCard(realizedGL,   "sell")}
    </>
  );

  const renderLeftPanel = () => (
    <>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.gray100}` }}>
        {renderSectionTitle("Transaction")}
        {renderKVRows(transactionRows)}
      </div>
      <div style={{ padding: "14px 20px" }}>
        {renderSectionTitle("Commission breakdown")}
        {commissionRows.map(([label, value]) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.gray100}` }}>
            <span style={{ fontSize: 12, color: C.gray500 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{fmt(value)}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: `2px solid ${C.gray200}`, marginTop: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Total Fees</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>TZS {fmt(totalFees)}</span>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.56)", backdropFilter: "blur(3px)", zIndex: 9999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.white, borderRadius: isMobile ? "16px 16px 0 0" : 16, border: `1.5px solid ${C.gray200}`, borderBottom: isMobile ? "none" : undefined, width: "100%", maxWidth: isMobile ? "100%" : 720, maxHeight: isMobile ? "92vh" : "95vh", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: isMobile ? "16px 18px 14px" : "18px 24px 16px", borderRadius: isMobile ? "16px 16px 0 0" : "16px 16px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: "#ffffff" }}>{transaction.company_name}</span>
              <span style={{ background: "rgba(255,255,255,0.15)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.3)", padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{isBuy ? "▲ Buy" : "▼ Sell"}</span>
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", display: "flex", gap: 8, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
              <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>📅 {fmtDate(transaction.date)}</span>
              {transaction.cds_number && (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  🪪 {transaction.cds_number}
                  {cdsAccountName === null
                    ? <span style={{ color: "rgba(255,255,255,0.4)" }}> — …</span>
                    : cdsAccountName
                      ? <span style={{ color: "rgba(255,255,255,0.8)", fontWeight: 600 }}> — {cdsAccountName}</span>
                      : null}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16, transition: "background 0.15s" }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.25)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", borderBottom: `1px solid ${C.gray200}`, background: C.gray50, flexShrink: 0 }}>
          {summaryItems.map((item, i) => (
            <div key={i} style={{ padding: isMobile ? "10px 18px" : "12px 20px", borderLeft: (!isMobile && i > 0) ? `1px solid ${C.gray200}` : "none", borderBottom: isMobile && i < 2 ? `1px solid ${C.gray200}` : "none", background: i === 2 ? accentBg : "transparent", display: "flex", alignItems: isMobile ? "center" : "block", justifyContent: isMobile ? "space-between" : "initial" }}>
              <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isMobile ? 0 : 4 }}>{item.label}</div>
              <div>
                <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: item.valueColor, lineHeight: 1 }}>{item.value}</div>
                {!isMobile && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{item.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        <div className="tx-scroll" style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {isMobile ? renderRightPanel() : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ borderRight: `1px solid ${C.gray200}` }}>{renderLeftPanel()}</div>
              <div>{renderRightPanel()}</div>
            </div>
          )}
        </div>

        <div style={{ padding: isMobile ? "8px 18px" : "8px 24px", borderTop: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 8 : 11, color: C.gray400, fontFamily: "monospace", letterSpacing: isMobile ? 0 : "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "65%" : "none" }}>ID: {transaction.id}</span>
          <button onClick={onClose} style={{ padding: "5px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", transition: "border-color 0.15s" }} onMouseEnter={e=>e.currentTarget.style.borderColor=C.navy} onMouseLeave={e=>e.currentTarget.style.borderColor=C.gray200}>Close</button>
        </div>
      </div>
    </div>
  );
});

// ── Transaction Mobile Card ───────────────────────────────────────
const TransactionMobileCard = memo(function TransactionMobileCard({
  transaction, onOpenFormModal, onOpenRejectModal, onOpenDeleteModal,
  onHandleConfirm, onHandleVerify, onHandleUnverify,
  confirmingIds, verifyingIds, rejectingIds, unverifyingIds,
  deletingId, bulkDeletingIds, isDE, isVR, isSAAD, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const isBuy    = transaction.type === "Buy";
  const tradeVal = Number(transaction.total || 0);
  const fees     = Number(transaction.fees  || 0);
  const gt       = isBuy ? tradeVal + fees : tradeVal - fees;

  const perms = useMemo(() => getRowPermissions({ transaction, isDE, isVR, isSAAD }), [transaction, isDE, isVR, isSAAD]);

  const isRowConfirming  = confirmingIds.has(transaction.id);
  const isRowVerifying   = verifyingIds.has(transaction.id);
  const isRowRejecting   = rejectingIds.has(transaction.id);
  const isRowUnverifying = unverifyingIds.has(transaction.id);
  const isRowDeleting    = deletingId === transaction.id || bulkDeletingIds.has(transaction.id);
  const isRowBusy        = isRowConfirming || isRowVerifying || isRowRejecting || isRowUnverifying || isRowDeleting;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm  ? [{ icon: <Icon name="checkCircle" size={14} />, label: isRowConfirming  ? "Confirming..."  : (transaction.status === "rejected" ? "Re-Confirm" : "Confirm"), disabled: isRowBusy, onClick: () => onHandleConfirm(transaction.id, transaction.company_name, transaction.status) }] : []),
    ...(perms.canEdit     ? [{ icon: <Icon name="edit" size={14} />, label: "Edit",      disabled: isRowBusy, onClick: () => onOpenFormModal(transaction) }] : []),
    ...(perms.canVerify   ? [{ icon: <Icon name="check" size={14} />, label: isRowVerifying   ? "Verifying..."   : "Verify",    disabled: isRowBusy, onClick: () => onHandleVerify([transaction.id], transaction.company_name) }] : []),
    ...(perms.canReject   ? [{ icon: <Icon name="xCircle" size={14} />,  label: isRowRejecting   ? "Rejecting..."   : "Reject",    danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([transaction.id]) }] : []),
    ...(perms.canUnVerify ? [{ icon: <Icon name="undo" size={14} />, label: isRowUnverifying ? "Unverifying..." : "UnVerify",  danger: true, disabled: isRowBusy, onClick: () => onHandleUnverify(transaction.id) }] : []),
    ...(perms.canDelete   ? [{ icon: <Icon name="trash" size={14} />, label: isRowDeleting    ? "Deleting..."    : "Delete",    danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(transaction) }] : []),
  ], [perms, isRowBusy, isRowConfirming, isRowVerifying, isRowRejecting, isRowUnverifying, isRowDeleting,
      transaction, onHandleConfirm, onOpenFormModal, onHandleVerify, onOpenRejectModal, onHandleUnverify, onOpenDeleteModal]);

  const accentColor = isBuy ? C.green : C.red;
  const accentBg    = isBuy ? C.greenBg : C.redBg;
  const accentBdr   = isBuy ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");
  const cardBg  = perms.isRejected ? (isDark ? `${C.red}18`    : "#FFF5F5") : perms.isVerified ? (isDark ? `${C.green}10` : "#F9FFFB") : C.white;
  const cardBdr = perms.isRejected ? (isDark ? `${C.red}55`    : "#FECACA") : perms.isVerified ? (isDark ? `${C.green}55` : "#BBF7D0") : C.gray200;

  return (
    <div onClick={() => !isRowBusy && onOpenDetail(transaction.id)}
      style={{ background: cardBg, border: `1px solid ${cardBdr}`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, cursor: isRowBusy ? "not-allowed" : "pointer", opacity: isRowBusy ? 0.6 : 1, transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 5 }}>{transaction.company_name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBdr}`, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{isBuy ? "▲ Buy" : "▼ Sell"}</span>
            <StatusBadge status={transaction.status} />
          </div>
        </div>
        {showActions && rowActions.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}><ActionMenu actions={rowActions} /></div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.gray500 }}>📅 {fmtDate(transaction.date)}</span>
        {transaction.broker_name && (
          <span style={{ fontSize: 11, color: C.gray500, fontWeight: 500, maxWidth: 140, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{transaction.broker_name}</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, borderRadius: 9, padding: "8px 12px" }}>
        <div>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>Qty × Price</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{fmtInt(transaction.qty)} × {fmt(transaction.price)}</div>
        </div>
        <span style={{ fontSize: 14, color: C.gray400, margin: "0 6px" }}>→</span>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{isBuy ? "Total Paid" : "Net Received"}</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: accentColor }}>TZS {fmtSmart(gt)}</div>
        </div>
      </div>
      {perms.isRejected && transaction.rejection_comment && (
        <div style={{ marginTop: 8, padding: "6px 10px", background: C.redBg, borderRadius: 8, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, fontSize: 11, color: C.text, lineHeight: 1.5 }}>
          💬 {transaction.rejection_comment}
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

// ── Transaction Row ────────────────────────────────────────────────
const TransactionRow = memo(function TransactionRow({
  transaction, globalIdx, selected, onToggleOne,
  onOpenFormModal, onOpenRejectModal, onOpenDeleteModal,
  onHandleConfirm, onHandleVerify, onHandleUnverify,
  confirmingIds, verifyingIds, rejectingIds, unverifyingIds,
  deletingId, bulkDeletingIds, isDE, isVR, isSAAD,
  showCheckbox, showActions, onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const isBuy    = transaction.type === "Buy";
  const tradeVal = Number(transaction.total || 0);
  const fees     = Number(transaction.fees  || 0);
  const gt       = isBuy ? tradeVal + fees : tradeVal - fees;
  const isChecked = selected.has(transaction.id);

  const perms = useMemo(() => getRowPermissions({ transaction, isDE, isVR, isSAAD }), [transaction, isDE, isVR, isSAAD]);

  const isRowConfirming  = confirmingIds.has(transaction.id);
  const isRowVerifying   = verifyingIds.has(transaction.id);
  const isRowRejecting   = rejectingIds.has(transaction.id);
  const isRowUnverifying = unverifyingIds.has(transaction.id);
  const isRowDeleting    = deletingId === transaction.id || bulkDeletingIds.has(transaction.id);
  const isRowBusy        = isRowConfirming || isRowVerifying || isRowRejecting || isRowUnverifying || isRowDeleting;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm ? [{ icon: isRowConfirming  ? null : <Icon name="checkCircle" size={14} />, label: isRowConfirming  ? "Confirming..."  : (transaction.status === "rejected" ? "Re-Confirm" : "Confirm"), disabled: isRowBusy, onClick: () => onHandleConfirm(transaction.id, transaction.company_name, transaction.status) }] : []),
    ...(perms.canEdit    ? [{ icon: <Icon name="edit" size={14} />, label: "Edit",       disabled: isRowBusy, onClick: () => onOpenFormModal(transaction) }] : []),
    ...(perms.canVerify  ? [{ icon: isRowVerifying  ? null : <Icon name="check" size={14} />, label: isRowVerifying  ? "Verifying..."   : "Verify",    disabled: isRowBusy, onClick: () => onHandleVerify([transaction.id], transaction.company_name) }] : []),
    ...(perms.canReject  ? [{ icon: isRowRejecting  ? null : <Icon name="xCircle" size={14} />,  label: isRowRejecting  ? "Rejecting..."   : "Reject",    danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([transaction.id]) }] : []),
    ...(perms.canUnVerify? [{ icon: isRowUnverifying? null : <Icon name="undo" size={14} />, label: isRowUnverifying? "Unverifying..." : "UnVerify",  danger: true, disabled: isRowBusy, onClick: () => onHandleUnverify(transaction.id) }] : []),
    ...(perms.canDelete  ? [{ icon: isRowDeleting   ? null : <Icon name="trash" size={14} />, label: isRowDeleting   ? "Deleting..."    : "Delete",    danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(transaction) }] : []),
  ], [perms, isRowBusy, isRowConfirming, isRowVerifying, isRowRejecting, isRowUnverifying, isRowDeleting,
      transaction, onHandleConfirm, onOpenFormModal, onHandleVerify, onOpenRejectModal, onHandleUnverify, onOpenDeleteModal]);

  const rowBg      = perms.isRejected ? (isDark ? `${C.red}18`    : "#FFF5F5") : perms.isVerified ? (isDark ? `${C.green}10` : "#F9FFFB") : "transparent";
  const rowBgHover = perms.isRejected ? (isDark ? `${C.red}28`    : "#FFF0F0") : perms.isVerified ? (isDark ? `${C.green}1c` : "#F0FDF4") : C.gray50;
  const buyBdr  = isDark ? `${C.green}55` : "#BBF7D0";
  const sellBdr = isDark ? `${C.red}55`   : "#FECACA";

  return (
    <tr style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: rowBg, opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
      onClick={() => onOpenDetail(transaction.id)}
      onMouseEnter={e => { if (!isRowBusy) e.currentTarget.style.background = rowBgHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}>
      {showCheckbox && (
        <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => onToggleOne(transaction.id)} disabled={isRowBusy}
            style={{ cursor: isRowBusy ? "not-allowed" : "pointer", width: 15, height: 15, accentColor: isDark ? C.green : C.green }} />
        </td>
      )}
      <td style={{ padding: "7px 10px", color: C.gray400, fontWeight: 600, textAlign: "right" }}>{globalIdx}</td>
      <td style={{ padding: "7px 10px", color: C.gray600, whiteSpace: "nowrap" }}>{fmtDate(transaction.date)}</td>
      <td style={{ padding: "7px 10px" }}>
        <div style={{ fontWeight: 700, color: C.text, whiteSpace: "normal", wordBreak: "break-word", lineHeight: 1.35 }}>{transaction.company_name}</div>
      </td>
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        <span style={{ background: isBuy ? C.greenBg : C.redBg, color: isBuy ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontWeight: 700, border: `1px solid ${isBuy ? buyBdr : sellBdr}` }}>
          {isBuy ? "▲ Buy" : "▼ Sell"}
        </span>
      </td>
      <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right", color: C.text }}>{fmtInt(transaction.qty)}</td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontWeight: 700 }}>{fmt(transaction.price)}</span>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }} title={fees > 0 ? fmt(fees) : ""}>
        <span style={{ color: C.gold, fontWeight: 700 }}>{fees > 0 ? fmt(fees) : <span style={{ color: C.gray400 }}>—</span>}</span>
      </td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap", overflow: "hidden" }} title={fmt(gt)}>
        <span style={{ background: isBuy ? C.greenBg : C.redBg, color: isBuy ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontWeight: 800, border: `1px solid ${isBuy ? buyBdr : sellBdr}` }}>
          {fmt(gt)}
        </span>
      </td>
      <td style={{ padding: "7px 10px", maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {transaction.broker_name
          ? <span style={{ fontSize: 11, fontWeight: 600, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 8px", display: "inline-block", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={transaction.broker_name}>{transaction.broker_name}</span>
          : <span style={{ color: C.gray400 }}>—</span>}
      </td>
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        <StatusBadge status={transaction.status} />
        {perms.isRejected && transaction.rejection_comment && (
          <div style={{ fontSize: 10, color: C.red, marginTop: 3, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={transaction.rejection_comment}>
            💬 {transaction.rejection_comment}
          </div>
        )}
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
export default function TransactionsPage({ companies, transactions, setTransactions, showToast, role, cdsNumber }) {
  const { C, isDark } = useTheme();

  const TOOLBAR_INPUT  = { ...TOOLBAR_BASE, width: "100%", border: `1.5px solid ${C.gray200}`, padding: "0 10px 0 32px", outline: "none", color: C.text, background: C.white };
  const TOOLBAR_SELECT = { ...TOOLBAR_BASE, padding: "0 10px", background: C.white, color: C.text, cursor: "pointer", outline: "none", flexShrink: 0 };

  const isDE   = role === "DE";
  const isVR   = role === "VR";
  const isRO   = role === "RO";
  const isSAAD = role === "SA" || role === "AD";

  const isMobile = useIsMobile();

  const isMountedRef    = useRef(true);
  const txLoadRef       = useRef(0);
  const companyLoadRef  = useRef(0);
  // FIX 5: Add request ID ref for brokers — matches pattern used by
  // loadTransactions and loadCompanies to prevent stale responses
  // from a fast unmount/remount overwriting fresh broker data.
  const brokerLoadRef   = useRef(0);

  const rootRef        = useRef(null);
  const touchStartYRef = useRef(null);
  const pullingRef     = useRef(false);
  const scrollHostRef  = useRef(null);

  const [localCompanies, setLocalCompanies]           = useState([]);
  const [brokers, setBrokers]                         = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [loadingCompanies, setLoadingCompanies]       = useState(true);
  const [loadingBrokers, setLoadingBrokers]           = useState(true);
  const [pageError, setPageError]                     = useState(null);

  const [searchInput, setSearchInput]   = useState("");
  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("All");
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(50);

  // Debounce search input — waits 400ms after typing stops before triggering server query
  const searchTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchInput]);
  const [selected, setSelected]         = useState(new Set());

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);

  const [confirmingIds,   setConfirmingIds]   = useState(new Set());
  const [verifyingIds,    setVerifyingIds]    = useState(new Set());
  const [rejectingIds,    setRejectingIds]    = useState(new Set());
  const [unverifyingIds,  setUnverifyingIds]  = useState(new Set());
  const [deletingId,      setDeletingId]      = useState(null);
  const [bulkDeletingIds, setBulkDeletingIds] = useState(new Set());

  const [deleteModal,       setDeleteModal]       = useState(null);
  const [bulkDeleteModal,   setBulkDeleteModal]   = useState(null);
  const [bulkUnverifyModal, setBulkUnverifyModal] = useState(null);
  const [formModal,         setFormModal]         = useState({ open: false, transaction: null });
  const [importModal,       setImportModal]       = useState(false);
  const [actionModal,       setActionModal]       = useState(null);
  const [rejectModal,       setRejectModal]       = useState(null);
  const [detailModal,       setDetailModal]       = useState(null);


  const effectiveCompanies = useMemo(
    () => (companies?.length ? companies : localCompanies),
    [companies, localCompanies]
  );

  // Server-side pagination state
  const [serverTotal, setServerTotal]       = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);

  // ── Individual loaders (kept as callbacks for pull-to-refresh) ───
  const loadTransactions = useCallback(async ({ fromPull = false } = {}) => {
    if (!cdsNumber) return;
    const requestId = ++txLoadRef.current;
    if (!fromPull && isMountedRef.current) { setLoadingTransactions(true); setPageError(null); }
    try {
      const envelope = await sbGetTransactions(cdsNumber, {
        page, pageSize,
        status: statusFilter !== "All" ? statusFilter : undefined,
        type: typeFilter !== "All" ? typeFilter : undefined,
        search: search.trim() || undefined,
      });
      if (!isMountedRef.current || requestId !== txLoadRef.current) return;
      setTransactions(envelope.rows);
      setServerTotal(envelope.total);
      setServerTotalPages(envelope.totalPages);
      setPageError(null);
    } catch (e) {
      if (!isMountedRef.current || requestId !== txLoadRef.current) return;
      setPageError(e.message || "Failed to load transactions.");
      if (fromPull) showToast?.("Refresh failed", "error");
    } finally {
      if (isMountedRef.current && requestId === txLoadRef.current) {
        setLoadingTransactions(false);
        if (fromPull) { setRefreshing(false); setPullDistance(0); }
      }
    }
  }, [cdsNumber, page, pageSize, statusFilter, typeFilter, search, setTransactions, showToast]);

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

  // FIX 5 (continued): loadBrokers now uses brokerLoadRef to guard against
  // stale responses — mirrors loadTransactions / loadCompanies pattern.
  const loadBrokers = useCallback(async () => {
    const requestId = ++brokerLoadRef.current;
    if (!isMountedRef.current) return;
    setLoadingBrokers(true);
    try {
      const data = await sbGetActiveBrokers();
      if (!isMountedRef.current || requestId !== brokerLoadRef.current) return;
      setBrokers(data);
    } catch (e) {
      if (!isMountedRef.current || requestId !== brokerLoadRef.current) return;
      showToast("Error loading brokers: " + e.message, "error");
    } finally {
      if (isMountedRef.current && requestId === brokerLoadRef.current) setLoadingBrokers(false);
    }
  }, [showToast]);

  // FIX 6: Single boot effect — fires all three loads in parallel with
  // Promise.all instead of three separate effects that each trigger
  // a sequential React render cycle. Companies and brokers are served
  // from the supabase.js TTL cache on subsequent page visits (2 min TTL),
  // so only transactions always go to the network on first visit.
  useEffect(() => {
    isMountedRef.current = true;
    const companiesNeeded = !companies?.length;
    Promise.all([
      loadTransactions(),
      companiesNeeded ? loadCompanies() : Promise.resolve().then(() => {
        if (isMountedRef.current) setLoadingCompanies(false);
      }),
      loadBrokers(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { isMountedRef.current = false; };
  }, []); // intentionally run once on mount

  // Re-fetch when server-side filters, page, or pageSize change
  const prevParamsRef = useRef("");
  useEffect(() => {
    const key = `${cdsNumber}|${page}|${pageSize}|${statusFilter}|${typeFilter}|${search}`;
    if (prevParamsRef.current && prevParamsRef.current !== key) {
      loadTransactions();
    }
    prevParamsRef.current = key;
  }, [cdsNumber, page, pageSize, statusFilter, typeFilter, search, loadTransactions]);

  // When parent passes companies directly, skip local load
  useEffect(() => {
    if (companies?.length) setLoadingCompanies(false);
  }, [companies]);

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
    if (!isMobile || refreshing || loadingTransactions) return;
    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; return; }
    touchStartYRef.current = e.touches[0].clientY;
    pullingRef.current = false;
  }, [isMobile, refreshing, loadingTransactions, getScrollParent]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing || loadingTransactions) return;
    if (touchStartYRef.current == null) return;
    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) { pullingRef.current = false; setPullDistance(0); return; }
    pullingRef.current = true;
    setPullDistance(Math.min(92, Math.round(Math.pow(deltaY, 0.85))));
  }, [isMobile, refreshing, loadingTransactions, getScrollParent]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || loadingTransactions) {
      touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return;
    }
    const shouldRefresh = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null; pullingRef.current = false;
    if (shouldRefresh) { setPullDistance(56); setRefreshing(true); loadTransactions({ fromPull: true }); }
    else setPullDistance(0);
  }, [isMobile, refreshing, loadingTransactions, pullDistance, loadTransactions]);

  const isAnyConfirming  = confirmingIds.size  > 0;
  const isAnyVerifying   = verifyingIds.size   > 0;
  const isAnyRejecting   = rejectingIds.size   > 0;
  const isAnyUnverifying = unverifyingIds.size > 0;
  const isAnyDeleting    = !!deletingId || bulkDeletingIds.size > 0;
  const hasSelection     = selected.size > 0;


  // With server-side pagination, transactions are already filtered to the current CDS + page
  const myTransactions = transactions;

  const txById      = useMemo(() => new Map(myTransactions.map(t => [t.id, t])), [myTransactions]);
  const companyById = useMemo(() => new Map(effectiveCompanies.map(c => [c.id, c])), [effectiveCompanies]);

  const stats = useMemo(() => {
    let total = 0, buys = 0, sells = 0, totalBuyVal = 0, totalSellVal = 0;
    let totalBuyGrand = 0, totalSellGrand = 0;
    let pending = 0, confirmed = 0, verified = 0, rejected = 0;
    for (const t of myTransactions) {
      total++;
      const v = Number(t.total || 0), fees = Number(t.fees || 0);
      if (t.type === "Buy") { buys++; totalBuyVal += v; totalBuyGrand += v + fees; }
      else                  { sells++; totalSellVal += v; totalSellGrand += v - fees; }
      if      (t.status === "pending")   pending++;
      else if (t.status === "confirmed") confirmed++;
      else if (t.status === "verified")  verified++;
      else if (t.status === "rejected")  rejected++;
    }
    return { total, buys, sells, totalBuyVal, totalSellVal, totalBuyGrand, totalSellGrand, pending, confirmed, verified, rejected };
  }, [myTransactions]);

  // Server-side filtering — transactions already filtered/paginated by RPC
  const filtered  = myTransactions;
  const totalPages = serverTotalPages;
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered;

  const resetPage    = useCallback(() => setPage(1), []);
  const resetFilters = useCallback(() => { setSearchInput(""); setSearch(""); setTypeFilter("All"); setStatusFilter(defaultStatus); setPage(1); }, []);

  const totals = useMemo(() => {
    let buyAmt = 0, sellAmt = 0, buyFees = 0, sellFees = 0;
    for (const t of filtered) {
      const amt = Number(t.total || 0), fees = Number(t.fees || 0);
      if (t.type === "Buy") { buyAmt  += amt; buyFees  += fees; }
      else                  { sellAmt += amt; sellFees += fees; }
    }
    return { buyAmount: buyAmt, sellAmount: sellAmt, fees: buyFees + sellFees, buyGrand: buyAmt + buyFees, sellGrand: sellAmt - sellFees };
  }, [filtered]);

  const paginatedIds = useMemo(() => paginated.map(t => t.id), [paginated]);

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
    const pendingRejected = [], confirmed = [], verified = [], deletable = [];
    for (const id of selected) {
      const t = txById.get(id);
      if (!t) continue;
      if (t.status === "pending" || t.status === "rejected") pendingRejected.push(id);
      if (t.status === "confirmed") confirmed.push(id);
      if (t.status === "verified")  verified.push(id);
      if ((isSAAD && t.status !== "verified") || (!isSAAD && (t.status === "pending" || t.status === "rejected"))) deletable.push(id);
    }
    return { pendingRejected, confirmed, verified, deletable };
  }, [selected, txById, isSAAD]);

  const canBulkConfirm  = (isDE || isSAAD) && selectedBuckets.pendingRejected.length > 0;
  const canBulkDelete   = (isDE || isSAAD) && selectedBuckets.deletable.length > 0;
  const canBulkVerify   = (isVR || isSAAD) && selectedBuckets.confirmed.length > 0;
  const canBulkReject   = (isVR || isSAAD) && selectedBuckets.confirmed.length > 0;
  const canBulkUnverify = isSAAD && selectedBuckets.verified.length > 0;

  const openFormModal   = useCallback((transaction = null) => { if (loadingCompanies) return; setFormModal({ open: true, transaction }); }, [loadingCompanies]);
  const openRejectModal = useCallback((ids) => setRejectModal({ ids }), []);
  const openDeleteModal = useCallback((transaction) => setDeleteModal({ id: transaction.id, type: transaction.type, company: transaction.company_name }), []);

  // ── FIX 1 & 2: handleFormConfirm — enrich after insert/update ────
  // Previously put the raw DB row into state after insert, and replaced
  // the existing row with a raw DB row after update. Both paths lost
  // *_by_name fields, so the Detail Modal audit trail showed no names.
  //
  // Now we call refetchEnriched after both operations so the transaction
  // in state always has created_by_name, confirmed_by_name etc. populated.
  const refetchEnriched = useCallback(async (ids) => {
    if (!ids?.length) return;
    const enriched = await sbGetTransactionsByIds(ids);
    if (!isMountedRef.current) return;
    const map = new Map(enriched.map(r => [r.id, r]));
    setTransactions(p => p.map(t => map.get(t.id) || t));
  }, [setTransactions]);

  const handleFormConfirm = useCallback(async ({ date, companyId, type, qty, price, fees, controlNumber, remarks, total, brokerId, brokerName }) => {
    const isEdit  = !!formModal.transaction;
    const company = companyById.get(companyId);
    const payload = {
      date, company_id: companyId, company_name: company?.name, type,
      qty: Number(qty), price: Number(price), total,
      fees:           fees ? Number(fees) : null,
      control_number: controlNumber || null,
      remarks:        remarks || null,
      cds_number:     cdsNumber || null,
      broker_id:      brokerId  || null,
      broker_name:    brokerName || null,
    };
    try {
      if (isEdit) {
        // Step 1: persist the update
        await sbUpdateTransaction(formModal.transaction.id, payload);
        if (!isMountedRef.current) return;
        // Step 2: re-fetch enriched row so *_by_name fields are preserved
        await refetchEnriched([formModal.transaction.id]);
        showToast("Transaction updated!", "success");
      } else {
        // Step 1: insert the new transaction
        const rows = await sbInsertTransaction(payload);
        if (!isMountedRef.current) return;
        const newId = rows?.[0]?.id;
        if (!newId) throw new Error("Insert succeeded but returned no ID.");
        // Step 2: optimistically add the raw row so it appears immediately
        setTransactions(p => [rows[0], ...p]);
        // Step 3: enrich in background — adds created_by_name etc.
        refetchEnriched([newId]).catch(() => {});
        showToast("Transaction recorded!", "success");
      }
      if (isMountedRef.current) setFormModal({ open: false, transaction: null });
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    }
  }, [formModal.transaction, companyById, cdsNumber, setTransactions, refetchEnriched, showToast]);

  const handleConfirm = useCallback((id, company, status) => {
    setActionModal({ action: status === "rejected" ? "confirm-rejected" : "confirm", ids: [id], company });
  }, []);

  // FIX 3a: doBulkConfirm — partial failure handling
  // Previously: if batch 1 confirms and batch 2 throws, refetchEnriched
  // was SKIPPED entirely — confirmed transactions stayed "pending" in UI.
  // Fix: track succeeded IDs in a local array, always refetch them in
  // finally so the UI reflects actual DB state regardless of errors.
  const doBulkConfirm = useCallback(async () => {
    const ids = actionModal?.ids;
    if (!ids?.length) return;
    setActionModal(null);
    setConfirmingIds(new Set(ids));

    const succeededIds = [];
    let lastError = null;

    try {
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batchIds = ids.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batchIds.map(async id => {
            const rows = await sbConfirmTransaction(id);
            if (!rows || rows.length === 0) throw new Error(`Transaction ${id} could not be confirmed.`);
            return id;
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled") succeededIds.push(r.value);
          else lastError = r.reason;
        }
      }
    } catch (e) {
      lastError = e;
    } finally {
      // Always sync UI with actual DB state for any succeeded transactions
      if (succeededIds.length > 0 && isMountedRef.current) {
        await refetchEnriched(succeededIds).catch(() => {});
        setSelected(new Set());
      }
      if (isMountedRef.current) {
        setConfirmingIds(new Set());
        if (lastError) showToast("Error: " + lastError.message, "error");
        else showToast(`${succeededIds.length} transaction${succeededIds.length > 1 ? "s" : ""} confirmed!`, "success");
      }
    }
  }, [actionModal, refetchEnriched, showToast]);

  const handleVerify = useCallback((ids, company) => setActionModal({ action: "verify", ids, company: company || null }), []);

  const doVerify = useCallback(async () => {
    const ids = actionModal?.ids;
    if (!ids?.length) return;
    setActionModal(null);
    setVerifyingIds(new Set(ids));
    try {
      await sbVerifyTransactions(ids);
      await refetchEnriched(ids);
      setSelected(new Set());
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} verified!`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setVerifyingIds(new Set());
    }
  }, [actionModal, refetchEnriched, showToast]);

  const handleReject = useCallback(async (comment) => {
    const ids = rejectModal?.ids;
    if (!ids?.length) return;
    setRejectingIds(new Set(ids));
    try {
      await sbRejectTransactions(ids, comment);
      await refetchEnriched(ids);
      setSelected(new Set());
      setRejectModal(null);
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} rejected.`, "error");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setRejectingIds(new Set());
    }
  }, [rejectModal, refetchEnriched, showToast]);

  const handleUnVerify = useCallback(async (id) => {
    setUnverifyingIds(prev => { const s = new Set(prev); s.add(id); return s; });
    try {
      const rows = await sbUnverifyTransaction(id);
      if (!rows || rows.length === 0) throw new Error("Unverify failed.");
      await refetchEnriched([id]);
      showToast("Transaction unverified and returned to Pending.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUnverifyingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [refetchEnriched, showToast]);

  const doBulkUnverify = useCallback(async () => {
    const ids = bulkUnverifyModal?.ids;
    if (!ids?.length) return;
    setBulkUnverifyModal(null);
    setUnverifyingIds(new Set(ids));
    try {
      const rows = await sbUnverifyTransactions(ids);
      if (!rows || rows.length === 0) throw new Error("No verified transactions could be unverified.");
      await refetchEnriched(ids);
      setSelected(new Set());
      showToast(`${rows.length} transaction${rows.length > 1 ? "s" : ""} unverified.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUnverifyingIds(new Set());
    }
  }, [bulkUnverifyModal, refetchEnriched, showToast]);

  const handleDelete = useCallback(async () => {
    const id = deleteModal?.id;
    if (!id) return;
    setDeleteModal(null);
    setDeletingId(id);
    try {
      await sbDeleteTransaction(id);
      if (!isMountedRef.current) return;
      setTransactions(p => p.filter(t => t.id !== id));
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s; });
      showToast("Transaction deleted.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setDeletingId(null);
    }
  }, [deleteModal, setTransactions, showToast]);

  // FIX 3b: doBulkDelete — partial failure handling
  // Previously: if batch 1 deletes and batch 2 throws, the setTransactions
  // filter was SKIPPED — batch-1 deletions remained visible in the UI.
  // Fix: track succeeded IDs, always remove them from state in finally.
  const doBulkDelete = useCallback(async () => {
    const ids = bulkDeleteModal?.ids;
    if (!ids?.length) return;
    setBulkDeleteModal(null);
    setBulkDeletingIds(new Set(ids));

    const succeededIds = [];
    let lastError = null;

    try {
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batchIds = ids.slice(i, i + BATCH);
        const results  = await Promise.allSettled(batchIds.map(id => sbDeleteTransaction(id).then(() => id)));
        for (const r of results) {
          if (r.status === "fulfilled") succeededIds.push(r.value);
          else lastError = r.reason;
        }
      }
    } catch (e) {
      lastError = e;
    } finally {
      if (isMountedRef.current) {
        // Always remove successfully deleted IDs from state
        if (succeededIds.length > 0) {
          const idSet = new Set(succeededIds);
          setTransactions(p => p.filter(t => !idSet.has(t.id)));
          setSelected(new Set());
        }
        setBulkDeletingIds(new Set());
        if (lastError) showToast("Error: " + lastError.message, "error");
        else showToast(`${succeededIds.length} transaction${succeededIds.length > 1 ? "s" : ""} deleted.`, "success");
      }
    }
  }, [bulkDeleteModal, setTransactions, showToast]);

  // FIX 2: handleImport — enrich inserted rows after bulk import
  // Previously: imported rows put in state without *_by_name fields.
  // Now: after all inserts complete, refetch all inserted IDs in one
  // batched request to get properly enriched rows with name fields.
  const handleImport = useCallback(async (rows) => {
    const BATCH = 20;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const results = await Promise.all(rows.slice(i, i + BATCH).map(row => sbInsertTransaction({ ...row, cds_number: cdsNumber || null })));
      results.forEach(r => inserted.push(r[0]));
    }

    if (!isMountedRef.current) return;

    // Step 1: Optimistically add raw rows so they appear immediately
    inserted.sort((a, b) => (b.date || "") > (a.date || "") ? 1 : -1);
    setTransactions(p => [...inserted, ...p]);
    setImportModal(false);
    showToast(`Imported ${inserted.length} transaction${inserted.length !== 1 ? "s" : ""} successfully!`, "success");

    // Step 2: Enrich in background — sbGetTransactionsByIds batches all IDs
    // in a single request so even large imports only fire one extra call.
    const insertedIds = inserted.map(r => r.id).filter(Boolean);
    if (insertedIds.length > 0) refetchEnriched(insertedIds).catch(() => {});
  }, [cdsNumber, setTransactions, refetchEnriched, showToast]);

  const statCards = useMemo(() => {
    if (isVR) return [
      { label: "Awaiting Review", value: stats.confirmed, sub: "Confirmed by Data Entrant",                                                icon: <Icon name="clipboard" size={17} />, color: "#1D4ED8" },
      { label: "Verified",        value: stats.verified,  sub: "Approved transactions",                                                    icon: <Icon name="check" size={17} />, color: C.green  },
      { label: "Rejected",        value: stats.rejected,  sub: "Sent back for correction",                                                 icon: <Icon name="xCircle" size={17} />,  color: C.red    },
      { label: "Selected",        value: selected.size,   sub: selected.size > 0 ? "Ready to action" : "Use checkboxes below",             icon: <Icon name="checkCircle" size={17} />, color: C.gold  },
    ];
    if (isDE) return [
      { label: "My Transactions", value: stats.total,                           sub: `${stats.pending} pending · ${stats.confirmed} confirmed`, icon: <Icon name="clipboard" size={17} />, color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                           icon: <Icon name="download" size={17} />, color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                          icon: <Icon name="upload" size={17} />, color: C.red   },
      { label: "Pending Confirm", value: stats.pending,                         sub: "Awaiting your confirmation",                             icon: <Icon name="clock" size={17} />, color: C.gold  },
    ];
    if (isRO) return [
      { label: "Total Records",   value: stats.total,                           sub: `${stats.verified} verified`,                             icon: <Icon name="clipboard" size={17} />, color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                           icon: <Icon name="download" size={17} />, color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                          icon: <Icon name="upload" size={17} />, color: C.red   },
      { label: "Net Position",    value: `TZS ${fmtSmart(Math.abs(stats.totalBuyGrand - stats.totalSellGrand))}`, sub: stats.totalBuyGrand >= stats.totalSellGrand ? "Net invested" : "Net realised", icon: <Icon name="barChart" size={17} />, color: C.gold },
    ];
    return [
      { label: "Total Transactions", value: stats.total,                           sub: `${stats.buys} buys · ${stats.sells} sells`,           icon: <Icon name="clipboard" size={17} />, color: C.navy  },
      { label: "Total Bought",       value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                        icon: <Icon name="download" size={17} />, color: C.green },
      { label: "Total Sold",         value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                       icon: <Icon name="upload" size={17} />, color: C.red   },
      { label: "Pending Verify",     value: stats.confirmed,                       sub: `${stats.pending} pending · ${stats.rejected} rejected`, icon: <Icon name="hourglass" size={17} />, color: C.gold  },
    ];
  }, [C, stats, selected.size, isVR, isDE, isRO]);

  const mobileStatCards = useMemo(() => {
    if (!isMobile) return statCards;
    const preferred = statCards.filter(s => s.label === "Total Bought" || s.label === "Total Sold");
    return preferred.length >= 2 ? preferred : statCards.slice(0, 2);
  }, [isMobile, statCards]);

  const showCheckbox = !isMobile;
  const showActions  = !isRO;
  const tableHeaders = showActions ? TABLE_HEADERS_WITH_ACTIONS : TABLE_HEADERS_WITHOUT_ACTIONS;

  const tfootLeftCols  = showCheckbox ? 7 : 6;
  const tfootRightCols = 2 + (showActions ? 1 : 0);

  const detailTransaction = useMemo(
    () => detailModal ? (txById.get(detailModal) || null) : null,
    [detailModal, txById]
  );

  const closeDelete       = useCallback(() => setDeleteModal(null),                            []);
  const closeBulkDelete   = useCallback(() => setBulkDeleteModal(null),                        []);
  const closeBulkUnverify = useCallback(() => setBulkUnverifyModal(null),                      []);
  const closeForm         = useCallback(() => setFormModal({ open: false, transaction: null }), []);
  const closeImport       = useCallback(() => setImportModal(false),                           []);
  const closeAction       = useCallback(() => setActionModal(null),                            []);
  const closeReject       = useCallback(() => setRejectModal(null),                            []);
  const closeDetail       = useCallback(() => setDetailModal(null),                            []);

  const hasActiveFilters = search || typeFilter !== "All" || statusFilter !== "All";

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
        .tx-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
        .tx-scroll::-webkit-scrollbar-track { background: transparent; }
        .tx-scroll::-webkit-scrollbar-thumb { background: ${isDark ? C.gray200 : "#cbd5e1"}; border-radius: 10px; }
        .tx-scroll { scrollbar-width: thin; scrollbar-color: ${isDark ? C.gray200 : "#cbd5e1"} transparent; }
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
      {deleteModal && <Modal type="confirm" title="Delete Transaction" message={`Delete this ${deleteModal.type} transaction for "${deleteModal.company}"? This cannot be undone.`} onConfirm={handleDelete} onClose={closeDelete} />}
      {bulkDeleteModal   && <SimpleConfirmModal title="Delete Transactions"   message={`Are you sure you want to delete ${bulkDeleteModal.ids.length} transaction(s)? This cannot be undone.`}                               count={bulkDeleteModal.ids.length}   loading={bulkDeletingIds.size > 0} onConfirm={doBulkDelete}   onClose={closeBulkDelete}   />}
      {bulkUnverifyModal && <SimpleConfirmModal title="Unverify Transactions" message={`Are you sure you want to unverify ${bulkUnverifyModal.ids.length} transaction(s)? They will be moved back to Pending.`}             count={bulkUnverifyModal.ids.length} loading={isAnyUnverifying}         onConfirm={doBulkUnverify} onClose={closeBulkUnverify} />}
      {formModal.open && <TransactionFormModal key={formModal.transaction?.id || "new"} transaction={formModal.transaction} companies={effectiveCompanies} transactions={myTransactions} brokers={brokers} onConfirm={handleFormConfirm} onClose={closeForm} />}
      {importModal && <ImportTransactionsModal companies={effectiveCompanies} brokers={brokers} onImport={handleImport} onClose={closeImport} />}
      {actionModal && <ConfirmActionModal action={actionModal.action} count={actionModal.ids.length} company={actionModal.company} loading={isAnyConfirming || isAnyVerifying} onConfirm={actionModal.action === "verify" ? doVerify : doBulkConfirm} onClose={closeAction} />}
      {rejectModal && <RejectModal count={rejectModal.ids.length} onConfirm={handleReject} onClose={closeReject} />}
      {detailTransaction && <TransactionDetailModal transaction={detailTransaction} transactions={myTransactions} companies={effectiveCompanies} onClose={closeDetail} />}

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
                  <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search company, date, status..." {...mobileInputAttrs}
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
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Search company, date, status..." {...mobileInputAttrs}
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
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search company, date, month, type, broker, status, remarks..."
                  style={TOOLBAR_INPUT}
                  onFocus={e => { e.target.style.borderColor = C.green; e.target.style.background = C.white; }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; }} />
              </div>
              {["All", "Buy", "Sell"].map(t => (
                <button key={t} onClick={() => { setTypeFilter(t); resetPage(); }}
                  style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${typeFilter === t ? "#0B1F3A" : C.gray200}`, background: typeFilter === t ? "#0B1F3A" : C.white, color: typeFilter === t ? "#ffffff" : C.gray600, fontWeight: 600, cursor: "pointer" }}>
                  {t}
                </button>
              ))}
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
                  {canBulkConfirm  && <button onClick={() => setActionModal({ action: "confirm", ids: selectedBuckets.pendingRejected, company: null })} disabled={isAnyConfirming}  style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyConfirming  ? C.gray200 : "#1D4ED8", color: "#ffffff", fontWeight: 700, cursor: isAnyConfirming  ? "not-allowed" : "pointer" }}>{isAnyConfirming  ? <><Spinner size={12} color="#888" /> Confirming...</>  : <><Icon name="checkCircle" size={12} /> Confirm {selectedBuckets.pendingRejected.length}</>}</button>}
                  {canBulkVerify   && <button onClick={() => handleVerify(selectedBuckets.confirmed)}                                                     disabled={isAnyVerifying}   style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyVerifying   ? C.gray200 : C.green,   color: "#ffffff", fontWeight: 700, cursor: isAnyVerifying   ? "not-allowed" : "pointer" }}>{isAnyVerifying   ? <><Spinner size={12} color="#888" /> Verifying...</>   : <><Icon name="check" size={12} /> Verify {selectedBuckets.confirmed.length}</>}</button>}
                  {canBulkReject   && <button onClick={() => setRejectModal({ ids: selectedBuckets.confirmed })}                                          disabled={isAnyRejecting}   style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyRejecting   ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyRejecting   ? "not-allowed" : "pointer" }}>{isAnyRejecting   ? <><Spinner size={12} color={C.red} /> Rejecting...</>   : <><Icon name="xCircle" size={12} /> Reject {selectedBuckets.confirmed.length}</>}</button>}
                  {canBulkUnverify && <button onClick={() => setBulkUnverifyModal({ ids: selectedBuckets.verified })}                                     disabled={isAnyUnverifying} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.gray200}`, background: isAnyUnverifying ? C.gray100 : C.white, color: C.gray600, fontWeight: 700, cursor: isAnyUnverifying ? "not-allowed" : "pointer" }}>{isAnyUnverifying ? <><Spinner size={12} color={C.gray400} /> Unverifying...</> : <><Icon name="undo" size={12} /> UnVerify {selectedBuckets.verified.length}</>}</button>}
                  {canBulkDelete   && <button onClick={() => setBulkDeleteModal({ ids: selectedBuckets.deletable })}                                      disabled={isAnyDeleting}    style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyDeleting    ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyDeleting    ? "not-allowed" : "pointer" }}>{isAnyDeleting    ? <><Spinner size={12} color={C.red} /> Deleting...</>    : <><Icon name="trash" size={12} /> Delete {selectedBuckets.deletable.length}</>}</button>}
                  <Btn variant="secondary" onClick={() => setSelected(new Set())}>Clear Selection</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={loadTransactions}>Refresh</Btn>
                  {(search || typeFilter !== "All" || statusFilter !== defaultStatus) && <Btn variant="secondary" onClick={resetFilters}>Reset</Btn>}
                  {(isDE || isSAAD) && <Btn variant="navy" icon={<Icon name="plus" size={14} stroke="#ffffff" />} onClick={() => openFormModal(null)} disabled={loadingCompanies} style={{ boxShadow: "0 4px 16px rgba(11,31,58,0.45)" }}>Record Transaction</Btn>}
                  {(isDE || isSAAD) && <Btn variant="primary" icon={<Icon name="upload" size={14} />} onClick={() => setImportModal(true)} disabled={loadingCompanies}>Import</Btn>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: isMobile ? "unset" : 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
          <SectionCard title={`Transaction History (${serverTotal})`}>
            {loadingTransactions ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <div style={{ width: 28, height: 28, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
                <div style={{ fontSize: 13 }}>Loading transactions...</div>
              </div>
            ) : pageError ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.red }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
                <div style={{ fontWeight: 600 }}>Failed to load transactions</div>
                <div style={{ fontSize: 13, marginTop: 4, color: C.gray400 }}>{pageError}</div>
                <button onClick={loadTransactions} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Retry</button>
              </div>
            ) : stats.total === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}><Icon name="clipboard" size={40} /></div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>No transactions yet</div>
                <div style={{ fontSize: 13 }}>{isDE ? 'Tap "Record" to add your first buy or sell' : "Transactions will appear here once created"}</div>
              </div>
            ) : serverTotal === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}><Icon name="search" size={32} /></div>
                <div style={{ fontWeight: 600, color: C.text }}>No results found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</div>
                <button onClick={resetFilters} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reset Filters</button>
              </div>
            ) : isMobile ? (
              <>
                <div style={{ padding: "8px 12px" }}>
                  {paginated.map(transaction => (
                    <TransactionMobileCard key={transaction.id} transaction={transaction}
                      onOpenFormModal={openFormModal} onOpenRejectModal={openRejectModal} onOpenDeleteModal={openDeleteModal}
                      onHandleConfirm={handleConfirm} onHandleVerify={handleVerify} onHandleUnverify={handleUnVerify}
                      confirmingIds={confirmingIds} verifyingIds={verifyingIds} rejectingIds={rejectingIds} unverifyingIds={unverifyingIds}
                      deletingId={deletingId} bulkDeletingIds={bulkDeletingIds}
                      isDE={isDE} isVR={isVR} isSAAD={isSAAD} showActions={showActions} onOpenDetail={setDetailModal}
                    />
                  ))}
                </div>
                <MobilePagination page={safePage} totalPages={totalPages} setPage={setPage} filtered={serverTotal} pageSize={pageSize} />
              </>
            ) : (
              <>
                <div className="tx-scroll" style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
                    {showActions ? (
                      <colgroup>
                        <col style={{ width: 30 }} /><col style={{ width: 32 }} /><col style={{ width: 88 }} />
                        <col style={{ width: 110 }} /><col style={{ width: 58 }} /><col style={{ width: 68 }} />
                        <col style={{ width: 96 }} /><col style={{ width: 136 }} /><col style={{ width: 148 }} />
                        <col style={{ width: 100 }} /><col style={{ width: 96 }} /><col style={{ width: 80 }} />
                      </colgroup>
                    ) : (
                      <colgroup>
                        <col style={{ width: 30 }} /><col style={{ width: 32 }} /><col style={{ width: 88 }} />
                        <col style={{ width: 110 }} /><col style={{ width: 58 }} /><col style={{ width: 68 }} />
                        <col style={{ width: 96 }} /><col style={{ width: 136 }} /><col style={{ width: 148 }} />
                        <col style={{ width: 100 }} /><col style={{ width: 96 }} />
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
                      {paginated.map((transaction, i) => (
                        <TransactionRow key={transaction.id} transaction={transaction}
                          globalIdx={(safePage - 1) * pageSize + i + 1}
                          selected={selected} onToggleOne={toggleOne}
                          onOpenFormModal={openFormModal} onOpenRejectModal={openRejectModal} onOpenDeleteModal={openDeleteModal}
                          onHandleConfirm={handleConfirm} onHandleVerify={handleVerify} onHandleUnverify={handleUnVerify}
                          confirmingIds={confirmingIds} verifyingIds={verifyingIds} rejectingIds={rejectingIds} unverifyingIds={unverifyingIds}
                          deletingId={deletingId} bulkDeletingIds={bulkDeletingIds}
                          isDE={isDE} isVR={isVR} isSAAD={isSAAD}
                          showCheckbox={showCheckbox} showActions={showActions} onOpenDetail={setDetailModal}
                        />
                      ))}
                    </tbody>
                    {paginated.length > 1 && (
                      <tfoot>
                        <tr style={{ background: C.gray50, borderTop: `2px solid ${C.gray200}`, verticalAlign: "top" }}>
                          <td colSpan={tfootLeftCols} style={{ padding: "8px 10px", fontWeight: 700, color: C.gray600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            TOTALS ({paginated.length} rows on this page)
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }} title={fmt(totals.fees)}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.gold }}>{fmt(totals.fees)}</div>
                          </td>
                          <td style={{ padding: "8px 10px", textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 800, color: C.green, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><span style={{ fontSize: 10 }}>▲</span>{fmt(totals.buyGrand)}</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#EF4444", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 3 }}><span style={{ fontSize: 10 }}>▼</span>{fmt(totals.sellGrand)}</div>
                          </td>
                          <td colSpan={tfootRightCols} />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
                <Pagination page={safePage} totalPages={totalPages} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} total={serverTotal} filtered={serverTotal} />
              </>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
