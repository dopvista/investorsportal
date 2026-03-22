// ── src/pages/TransactionsPage.jsx ───────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  useTheme,
  fmt, fmtInt, fmtSmart, calcFees,
  Btn, StatCard, SectionCard, Modal, ActionMenu,
  TransactionFormModal, ImportTransactionsModal,
} from "../components/ui";
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

// ── TOOLBAR_BASE and TOOLBAR_BUTTON are theme-independent (no C usage) ──
// TOOLBAR_INPUT and TOOLBAR_SELECT use C, so they are computed inside the
// main component after useTheme() is called.
const TOOLBAR_BASE   = { height: 36, borderRadius: 8, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" };
const TOOLBAR_BUTTON = { ...TOOLBAR_BASE, padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 };

// ── Module-level mobile breakpoint hook ──────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
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

// ── Status config — theme-aware function (replaces static object) ─
// The old static STATUS object used hardcoded light-only hex values for
// backgrounds and borders. Dark mode needs alpha-based tints derived from
// the live theme C so they sit correctly on dark card surfaces.
const getStatusConfig = (C, isDark) => ({
  pending:   { label: "Pending",   color: "#C2410C", bg: isDark ? "#C2410C22" : "#FFF7ED", border: isDark ? "#C2410C55" : "#FED7AA", icon: "🕐" },
  confirmed: { label: "Confirmed", color: "#1D4ED8", bg: isDark ? "#1D4ED828" : "#EFF6FF", border: isDark ? "#1D4ED855" : "#BFDBFE", icon: "✅" },
  verified:  { label: "Verified",  color: C.green,   bg: C.greenBg,                        border: isDark ? `${C.green}55` : "#BBF7D0", icon: "✔️" },
  rejected:  { label: "Rejected",  color: C.red,     bg: C.redBg,                          border: isDark ? `${C.red}55`  : "#FECACA", icon: "✖"  },
});

const defaultStatus = "All";
const statusOptions = [
  ["All", "All Statuses"],
  ["pending", "🕐 Pending"],
  ["confirmed", "✅ Confirmed"],
  ["verified", "✔️ Verified"],
  ["rejected", "✖ Rejected"],
];

// ── Table headers ─────────────────────────────────────────────────
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

// ── Status Badge — fully theme-aware ─────────────────────────────
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
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, #0B1F3A, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            {/* "#ffffff" not C.white — C.white in dark mode is a surface colour, not white */}
            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>✖ Reject Transaction{count > 1 ? "s" : ""}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>{count > 1 ? `${count} transactions selected` : "1 transaction selected"}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#ffffff", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 14 }}>✕</button>
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
  const icon        = isVerify ? "✔" : "✅";
  const title       = isVerify ? `Verify Transaction${count > 1 ? "s" : ""}` : "Confirm Transaction";
  const subtitle    = count > 1 ? `${count} transactions selected` : company || "1 transaction";
  const description = isVerify
    ? `Verifying will mark ${count > 1 ? "these transactions" : "this transaction"} as verified and finalize them.`
    : action === "confirm-rejected"
      ? "This transaction was previously rejected. Confirming will resubmit it to the Verifier for review."
      : "Confirming will send this transaction to the Verifier for review.";

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, #0B1F3A, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>{icon} {title}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#ffffff", width: 28, height: 28, borderRadius: "50%", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ background: accentBg, border: `1px solid ${accentBdr}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 18, marginTop: 1 }}>{isVerify ? "🔍" : "📋"}</span>
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
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, #0B1F3A, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>{title}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{count} transaction{count > 1 ? "s" : ""} selected</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: "#ffffff", width: 28, height: 28, borderRadius: "50%", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
  // Navy brand active state — white text on dark bg works in both light and dark themes
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
          Showing <strong style={{ color: C.text }}>{from}–{to}</strong> of <strong style={{ color: C.text }}>{filtered}</strong>
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
        <strong style={{ color: C.text }}>{from}–{to}</strong> of <strong style={{ color: C.text }}>{filtered}</strong>
      </span>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === 1 ? C.gray50 : C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ‹
          </button>
          <span style={{ fontSize: 12, color: C.gray500, fontWeight: 600, whiteSpace: "nowrap" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ width: 36, height: 36, borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: page === totalPages ? C.gray50 : C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "default" : "pointer", fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center" }}>
            ›
          </button>
        </div>
      )}
    </div>
  );
});

// ── Row permissions helper ────────────────────────────────────────
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
  // Theme-aware sell accent — C.red is readable in both themes; borders alpha-keyed
  const accentColor = isBuy ? C.green : C.red;
  const accentBg    = isBuy ? C.greenBg : C.redBg;
  const accentBdr   = isBuy ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");
  const allInCostPerShare = isBuy && qty > 0 ? gt / qty : null;

  const companiesMap = useMemo(
    () => new Map(companies.map(c => [c.id, c])),
    [companies]
  );

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
      const tQty   = Number(t.qty   || 0);
      const tTotal = Number(t.total || 0);
      const tFees  = Number(t.fees  || 0);
      if (t.type === "Buy") {
        const cost = tTotal + tFees;
        costHeld   += cost;
        sharesHeld += tQty;
        runningAvg  = sharesHeld > 0 ? costHeld / sharesHeld : 0;
      } else if (t.type === "Sell") {
        const actualSold = Math.min(tQty, sharesHeld);
        const costBasis  = actualSold * runningAvg;
        const proceeds   = tTotal - tFees;
        const gain       = proceeds - costBasis;
        if (t.id === transaction.id) {
          return {
            gain, costBasis, proceeds,
            avgBuyCostPerShare: runningAvg,
            sellNetPerShare:    actualSold > 0 ? proceeds / actualSold : 0,
            pct:                costBasis > 0 ? (gain / costBasis) * 100 : 0,
          };
        }
        costHeld   -= costBasis;
        sharesHeld -= actualSold;
        if (sharesHeld <= 0) { sharesHeld = 0; costHeld = 0; runningAvg = 0; }
      }
    }
    return null;
  }, [isBuy, transaction.id, transaction.company_id, transactions]);

  const AUDIT_STEPS = useMemo(() => [
    { icon: "📝", label: "Recorded",  time: transaction.created_at,   name: transaction.created_by_name,   stepColor: C.gray600, activeBg: C.gray100 },
    { icon: "✅", label: "Confirmed", time: transaction.confirmed_at, name: transaction.confirmed_by_name, stepColor: "#1D4ED8", activeBg: isDark ? "#1D4ED820" : "#EFF6FF" },
    { icon: "✔️", label: "Verified",  time: transaction.verified_at,  name: transaction.verified_by_name,  stepColor: C.green,   activeBg: C.greenBg },
    ...(transaction.status === "rejected"
      ? [{ icon: "✖", label: "Rejected", time: transaction.rejected_at, name: transaction.rejected_by_name, stepColor: C.red, activeBg: C.redBg }]
      : []
    ),
  ], [C, isDark, transaction.created_at, transaction.confirmed_at, transaction.verified_at, transaction.rejected_at,
      transaction.created_by_name, transaction.confirmed_by_name, transaction.verified_by_name, transaction.rejected_by_name,
      transaction.status]);

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

  // Section title uses C.gray500 — always readable in both themes (C.navy was invisible in dark mode)
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
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.6)", zIndex: 1000, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.white,
        borderRadius: isMobile ? "16px 16px 0 0" : 16,
        width: "100%",
        maxWidth: isMobile ? "100%" : 720,
        maxHeight: isMobile ? "92vh" : "95vh",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        overflow: "hidden",
        border: isMobile ? "none" : `1px solid ${C.gray200}`,
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── Header ── */}
        <div style={{ padding: isMobile ? "16px 18px 14px" : "18px 24px 16px", borderBottom: `1px solid ${C.gray200}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: isMobile ? 16 : 18, fontWeight: 800, color: C.text }}>{transaction.company_name}</span>
              <span style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBdr}`, padding: "3px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{isBuy ? "▲ Buy" : "▼ Sell"}</span>
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{st.icon} {st.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.gray400, display: "flex", gap: 8, flexWrap: "nowrap", overflow: "hidden", alignItems: "center" }}>
              <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>📅 {fmtDate(transaction.date)}</span>
              {transaction.cds_number && (
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                  🪪 {transaction.cds_number}
                  {cdsAccountName === null
                    ? <span style={{ color: C.gray400 }}> — …</span>
                    : cdsAccountName
                      ? <span style={{ color: C.gray600, fontWeight: 600 }}> — {cdsAccountName}</span>
                      : null}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.gray200}`, background: C.gray50, cursor: "pointer", fontSize: 15, color: C.gray600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 16 }}>✕</button>
        </div>

        {/* ── Summary row ── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
          borderBottom: `1px solid ${C.gray200}`,
          background: C.gray50,
          flexShrink: 0,
        }}>
          {summaryItems.map((item, i) => (
            <div key={i} style={{
              padding: isMobile ? "10px 18px" : "12px 20px",
              borderLeft: (!isMobile && i > 0) ? `1px solid ${C.gray200}` : "none",
              borderBottom: isMobile && i < 2 ? `1px solid ${C.gray200}` : "none",
              background: i === 2 ? accentBg : "transparent",
              display: "flex",
              alignItems: isMobile ? "center" : "block",
              justifyContent: isMobile ? "space-between" : "initial",
            }}>
              <div style={{ fontSize: 10, color: C.gray400, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: isMobile ? 0 : 4 }}>{item.label}</div>
              <div>
                <div style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, color: item.valueColor, lineHeight: 1 }}>{item.value}</div>
                {!isMobile && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{item.sub}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
          {isMobile ? (
            renderRightPanel()
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
              <div style={{ borderRight: `1px solid ${C.gray200}` }}>
                {renderLeftPanel()}
              </div>
              <div>
                {renderRightPanel()}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ padding: isMobile ? "8px 18px" : "8px 24px", borderTop: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.gray50, flexShrink: 0 }}>
          <span style={{ fontSize: isMobile ? 8 : 11, color: C.gray400, fontFamily: "monospace", letterSpacing: isMobile ? 0 : "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? "65%" : "none" }}>ID: {transaction.id}</span>
          <button onClick={onClose} style={{ padding: "6px 18px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Close</button>
        </div>

      </div>
    </div>
  );
});

// ── Transaction Mobile Card ───────────────────────────────────────
const TransactionMobileCard = memo(function TransactionMobileCard({
  transaction,
  onOpenFormModal, onOpenRejectModal, onOpenDeleteModal,
  onHandleConfirm, onHandleVerify, onHandleUnverify,
  confirmingIds, verifyingIds, rejectingIds, unverifyingIds,
  deletingId, bulkDeletingIds,
  isDE, isVR, isSAAD, showActions,
  onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const isBuy    = transaction.type === "Buy";
  const tradeVal = Number(transaction.total || 0);
  const fees     = Number(transaction.fees  || 0);
  const gt       = isBuy ? tradeVal + fees : tradeVal - fees;

  const perms = useMemo(
    () => getRowPermissions({ transaction, isDE, isVR, isSAAD }),
    [transaction, isDE, isVR, isSAAD]
  );

  const isRowConfirming  = confirmingIds.has(transaction.id);
  const isRowVerifying   = verifyingIds.has(transaction.id);
  const isRowRejecting   = rejectingIds.has(transaction.id);
  const isRowUnverifying = unverifyingIds.has(transaction.id);
  const isRowDeleting    = deletingId === transaction.id || bulkDeletingIds.has(transaction.id);
  const isRowBusy        = isRowConfirming || isRowVerifying || isRowRejecting || isRowUnverifying || isRowDeleting;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm  ? [{ icon: "✅", label: isRowConfirming  ? "Confirming..."  : (transaction.status === "rejected" ? "Re-Confirm" : "Confirm"), disabled: isRowBusy, onClick: () => onHandleConfirm(transaction.id, transaction.company_name, transaction.status) }] : []),
    ...(perms.canEdit     ? [{ icon: "✏️", label: "Edit",      disabled: isRowBusy, onClick: () => onOpenFormModal(transaction) }] : []),
    ...(perms.canVerify   ? [{ icon: "✔️", label: isRowVerifying   ? "Verifying..."   : "Verify",    disabled: isRowBusy, onClick: () => onHandleVerify([transaction.id], transaction.company_name) }] : []),
    ...(perms.canReject   ? [{ icon: "✖",  label: isRowRejecting   ? "Rejecting..."   : "Reject",    danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([transaction.id]) }] : []),
    ...(perms.canUnVerify ? [{ icon: "↩️", label: isRowUnverifying ? "Unverifying..." : "UnVerify",  danger: true, disabled: isRowBusy, onClick: () => onHandleUnverify(transaction.id) }] : []),
    ...(perms.canDelete   ? [{ icon: "🗑️", label: isRowDeleting    ? "Deleting..."    : "Delete",    danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(transaction) }] : []),
  ], [perms, isRowBusy, isRowConfirming, isRowVerifying, isRowRejecting, isRowUnverifying, isRowDeleting,
      transaction, onHandleConfirm, onOpenFormModal, onHandleVerify, onOpenRejectModal, onHandleUnverify, onOpenDeleteModal]);

  const accentColor = isBuy ? C.green : C.red;
  const accentBg    = isBuy ? C.greenBg : C.redBg;
  const accentBdr   = isBuy ? (isDark ? `${C.green}55` : "#BBF7D0") : (isDark ? `${C.red}55` : "#FECACA");
  // Theme-aware card backgrounds — stronger tint in dark so status is readable
  const cardBg  = perms.isRejected ? (isDark ? `${C.red}18`    : "#FFF5F5") : perms.isVerified ? (isDark ? `${C.green}10` : "#F9FFFB") : C.white;
  const cardBdr = perms.isRejected ? (isDark ? `${C.red}55`    : "#FECACA") : perms.isVerified ? (isDark ? `${C.green}55` : "#BBF7D0") : C.gray200;

  return (
    <div
      onClick={() => !isRowBusy && onOpenDetail(transaction.id)}
      style={{
        background: cardBg,
        border: `1px solid ${cardBdr}`,
        borderRadius: 12,
        padding: "12px 14px",
        marginBottom: 8,
        cursor: isRowBusy ? "not-allowed" : "pointer",
        opacity: isRowBusy ? 0.6 : 1,
        transition: "box-shadow 0.15s",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginBottom: 5 }}>
            {transaction.company_name}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ background: accentBg, color: accentColor, border: `1px solid ${accentBdr}`, padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              {isBuy ? "▲ Buy" : "▼ Sell"}
            </span>
            <StatusBadge status={transaction.status} />
          </div>
        </div>
        {showActions && rowActions.length > 0 && (
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
            <ActionMenu actions={rowActions} />
          </div>
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
  deletingId, bulkDeletingIds,
  isDE, isVR, isSAAD, showCheckbox, showActions,
  onOpenDetail,
}) {
  const { C, isDark } = useTheme();
  const isBuy    = transaction.type === "Buy";
  const tradeVal = Number(transaction.total || 0);
  const fees     = Number(transaction.fees  || 0);
  const gt       = isBuy ? tradeVal + fees : tradeVal - fees;
  const isChecked = selected.has(transaction.id);

  const perms = useMemo(
    () => getRowPermissions({ transaction, isDE, isVR, isSAAD }),
    [transaction, isDE, isVR, isSAAD]
  );

  const isRowConfirming  = confirmingIds.has(transaction.id);
  const isRowVerifying   = verifyingIds.has(transaction.id);
  const isRowRejecting   = rejectingIds.has(transaction.id);
  const isRowUnverifying = unverifyingIds.has(transaction.id);
  const isRowDeleting    = deletingId === transaction.id || bulkDeletingIds.has(transaction.id);
  const isRowBusy        = isRowConfirming || isRowVerifying || isRowRejecting || isRowUnverifying || isRowDeleting;

  const rowActions = useMemo(() => [
    ...(perms.canConfirm ? [{ icon: isRowConfirming ? null : "✅", label: isRowConfirming ? "Confirming..." : (transaction.status === "rejected" ? "Re-Confirm" : "Confirm"), disabled: isRowBusy, onClick: () => onHandleConfirm(transaction.id, transaction.company_name, transaction.status) }] : []),
    ...(perms.canEdit    ? [{ icon: "✏️", label: "Edit",       disabled: isRowBusy, onClick: () => onOpenFormModal(transaction) }] : []),
    ...(perms.canVerify  ? [{ icon: isRowVerifying  ? null : "✔️", label: isRowVerifying  ? "Verifying..."   : "Verify",    disabled: isRowBusy, onClick: () => onHandleVerify([transaction.id], transaction.company_name) }] : []),
    ...(perms.canReject  ? [{ icon: isRowRejecting  ? null : "✖",  label: isRowRejecting  ? "Rejecting..."   : "Reject",    danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([transaction.id]) }] : []),
    ...(perms.canUnVerify? [{ icon: isRowUnverifying? null : "↩️", label: isRowUnverifying? "Unverifying..." : "UnVerify",  danger: true, disabled: isRowBusy, onClick: () => onHandleUnverify(transaction.id) }] : []),
    ...(perms.canDelete  ? [{ icon: isRowDeleting   ? null : "🗑️", label: isRowDeleting   ? "Deleting..."    : "Delete",    danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(transaction) }] : []),
  ], [perms, isRowBusy, isRowConfirming, isRowVerifying, isRowRejecting, isRowUnverifying, isRowDeleting,
      transaction, onHandleConfirm, onOpenFormModal, onHandleVerify, onOpenRejectModal, onHandleUnverify, onOpenDeleteModal]);

  // Theme-aware row tints — dark needs stronger values to show on dark card surface
  const rowBg      = perms.isRejected ? (isDark ? `${C.red}18`    : "#FFF5F5") : perms.isVerified ? (isDark ? `${C.green}10` : "#F9FFFB") : "transparent";
  const rowBgHover = perms.isRejected ? (isDark ? `${C.red}28`    : "#FFF0F0") : perms.isVerified ? (isDark ? `${C.green}1c` : "#F0FDF4") : C.gray50;
  // Buy/Sell badge borders — alpha-keyed so they work on any background
  const buyBdr  = isDark ? `${C.green}55` : "#BBF7D0";
  const sellBdr = isDark ? `${C.red}55`   : "#FECACA";

  return (
    <tr
      style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: rowBg, opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
      onClick={() => onOpenDetail(transaction.id)}
      onMouseEnter={e => { if (!isRowBusy) e.currentTarget.style.background = rowBgHover; }}
      onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
    >
      {showCheckbox && (
        <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => onToggleOne(transaction.id)} disabled={isRowBusy}
            style={{ cursor: isRowBusy ? "not-allowed" : "pointer", width: 15, height: 15, accentColor: "#0B1F3A" }} />
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
  const { C } = useTheme();

  // TOOLBAR_INPUT and TOOLBAR_SELECT reference C, so computed here after useTheme()
  const TOOLBAR_INPUT  = { ...TOOLBAR_BASE, width: "100%", border: `1.5px solid ${C.gray200}`, padding: "0 10px 0 32px", outline: "none", color: C.text, background: C.white };
  const TOOLBAR_SELECT = { ...TOOLBAR_BASE, padding: "0 10px", background: C.white, color: C.text, cursor: "pointer", outline: "none", flexShrink: 0 };

  const isDE   = role === "DE";
  const isVR   = role === "VR";
  const isRO   = role === "RO";
  const isSAAD = role === "SA" || role === "AD";

  const isMobile = useIsMobile();

  const isMountedRef   = useRef(true);
  const txLoadRef      = useRef(0);
  const companyLoadRef = useRef(0);

  // ── Pull-to-refresh refs ──────────────────────────────────────
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

  const [search, setSearch]             = useState("");
  const [typeFilter, setTypeFilter]     = useState("All");
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState(50);
  const [selected, setSelected]         = useState(new Set());

  // ── Pull-to-refresh state ─────────────────────────────────────
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

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const effectiveCompanies = useMemo(
    () => (companies?.length ? companies : localCompanies),
    [companies, localCompanies]
  );

  const loadTransactions = useCallback(async ({ fromPull = false } = {}) => {
    const requestId = ++txLoadRef.current;
    if (!fromPull && isMountedRef.current) { setLoadingTransactions(true); setPageError(null); }
    try {
      const data = await sbGetTransactions();
      if (!isMountedRef.current || requestId !== txLoadRef.current) return;
      setTransactions(data);
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
  }, [setTransactions, showToast]);

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

  const loadBrokers = useCallback(async () => {
    if (!isMountedRef.current) return;
    setLoadingBrokers(true);
    try {
      const data = await sbGetActiveBrokers();
      if (!isMountedRef.current) return;
      setBrokers(data);
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error loading brokers: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setLoadingBrokers(false);
    }
  }, [showToast]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);
  useEffect(() => {
    if (companies?.length) { setLoadingCompanies(false); return; }
    loadCompanies();
  }, [companies, loadCompanies]);
  useEffect(() => { loadBrokers(); }, [loadBrokers]);

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
    const resisted = Math.min(92, Math.round(Math.pow(deltaY, 0.85)));
    setPullDistance(resisted);
  }, [isMobile, refreshing, loadingTransactions, getScrollParent]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || loadingTransactions) {
      touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return;
    }
    const shouldRefresh = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null;
    pullingRef.current = false;
    if (shouldRefresh) {
      setPullDistance(56);
      setRefreshing(true);
      loadTransactions({ fromPull: true });
    } else {
      setPullDistance(0);
    }
  }, [isMobile, refreshing, loadingTransactions, pullDistance, loadTransactions]);

  const isAnyConfirming  = confirmingIds.size  > 0;
  const isAnyVerifying   = verifyingIds.size   > 0;
  const isAnyRejecting   = rejectingIds.size   > 0;
  const isAnyUnverifying = unverifyingIds.size > 0;
  const isAnyDeleting    = !!deletingId || bulkDeletingIds.size > 0;
  const hasSelection     = selected.size > 0;

  const normalizedSearch = useMemo(() => search.trim().toLowerCase(), [search]);

  const myTransactions = useMemo(
    () => (cdsNumber ? transactions.filter(t => t.cds_number === cdsNumber) : transactions),
    [transactions, cdsNumber]
  );

  const txById      = useMemo(() => new Map(myTransactions.map(t => [t.id, t])), [myTransactions]);
  const companyById = useMemo(() => new Map(effectiveCompanies.map(c => [c.id, c])), [effectiveCompanies]);

  const stats = useMemo(() => {
    let total = 0, buys = 0, sells = 0, totalBuyVal = 0, totalSellVal = 0;
    let totalBuyGrand = 0, totalSellGrand = 0;
    let pending = 0, confirmed = 0, verified = 0, rejected = 0;
    for (const t of myTransactions) {
      total++;
      const v    = Number(t.total || 0);
      const fees = Number(t.fees  || 0);
      if (t.type === "Buy") { buys++; totalBuyVal += v; totalBuyGrand += v + fees; }
      else                  { sells++; totalSellVal += v; totalSellGrand += v - fees; }
      if      (t.status === "pending")   pending++;
      else if (t.status === "confirmed") confirmed++;
      else if (t.status === "verified")  verified++;
      else if (t.status === "rejected")  rejected++;
    }
    return { total, buys, sells, totalBuyVal, totalSellVal, totalBuyGrand, totalSellGrand, pending, confirmed, verified, rejected };
  }, [myTransactions]);

  const filtered = useMemo(() => {
    let list = myTransactions;
    if (typeFilter !== "All")   list = list.filter(t => t.type === typeFilter);
    if (statusFilter !== "All") list = list.filter(t => t.status === statusFilter);
    if (normalizedSearch) {
      list = list.filter(t => {
        const dateObj    = t.date ? new Date(t.date + "T00:00:00") : null;
        const monthName  = dateObj ? dateObj.toLocaleDateString("en-GB", { month: "long" }).toLowerCase()  : "";
        const monthShort = dateObj ? dateObj.toLocaleDateString("en-GB", { month: "short" }).toLowerCase() : "";
        const yearStr    = dateObj ? String(dateObj.getFullYear()) : "";
        const matchDate  = monthName.includes(normalizedSearch)
                        || monthShort.includes(normalizedSearch)
                        || (yearStr && normalizedSearch.length >= 4 && yearStr.includes(normalizedSearch));
        return matchDate
          || t.date?.includes(normalizedSearch)
          || t.company_name?.toLowerCase().includes(normalizedSearch)
          || t.type?.toLowerCase().includes(normalizedSearch)
          || t.broker_name?.toLowerCase().includes(normalizedSearch)
          || t.status?.toLowerCase().includes(normalizedSearch)
          || t.remarks?.toLowerCase().includes(normalizedSearch);
      });
    }
    return list.slice().sort((a, b) => {
      const aActive = a.status === "pending" || a.status === "confirmed" || a.status === "rejected";
      const bActive = b.status === "pending" || b.status === "confirmed" || b.status === "rejected";
      if (aActive !== bActive) return aActive ? -1 : 1;
      const da = a.date || "", db = b.date || "";
      return db > da ? 1 : db < da ? -1 : 0;
    });
  }, [myTransactions, typeFilter, statusFilter, normalizedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = useMemo(() => Math.min(page, totalPages), [page, totalPages]);
  const paginated  = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  const resetPage    = useCallback(() => setPage(1), []);
  const resetFilters = useCallback(() => { setSearch(""); setTypeFilter("All"); setStatusFilter(defaultStatus); setPage(1); }, []);

  const totals = useMemo(() => {
    let buyAmt = 0, sellAmt = 0, buyFees = 0, sellFees = 0;
    for (const t of filtered) {
      const amt  = Number(t.total || 0);
      const fees = Number(t.fees  || 0);
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
        const rows = await sbUpdateTransaction(formModal.transaction.id, payload);
        if (!rows || rows.length === 0) throw new Error("Update failed – transaction may have been modified or you lack permission.");
        if (!isMountedRef.current) return;
        setTransactions(p => p.map(t => t.id === formModal.transaction.id ? rows[0] : t));
        showToast("Transaction updated!", "success");
      } else {
        const rows = await sbInsertTransaction(payload);
        if (!isMountedRef.current) return;
        setTransactions(p => [rows[0], ...p]);
        showToast("Transaction recorded!", "success");
      }
      if (isMountedRef.current) setFormModal({ open: false, transaction: null });
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    }
  }, [formModal.transaction, companyById, cdsNumber, setTransactions, showToast]);

  const refetchEnriched = useCallback(async (ids) => {
    const enriched = await sbGetTransactionsByIds(ids);
    if (!isMountedRef.current) return;
    const map = new Map(enriched.map(r => [r.id, r]));
    setTransactions(p => p.map(t => map.get(t.id) || t));
  }, [setTransactions]);

  const handleConfirm = useCallback((id, company, status) => {
    setActionModal({ action: status === "rejected" ? "confirm-rejected" : "confirm", ids: [id], company });
  }, []);

  const doBulkConfirm = useCallback(async () => {
    const ids = actionModal?.ids;
    if (!ids?.length) return;
    setActionModal(null);
    setConfirmingIds(new Set(ids));
    try {
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        await Promise.all(ids.slice(i, i + BATCH).map(async id => {
          const rows = await sbConfirmTransaction(id);
          if (!rows || rows.length === 0) throw new Error(`Transaction ${id} could not be confirmed.`);
        }));
      }
      await refetchEnriched(ids);
      setSelected(new Set());
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} confirmed!`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setConfirmingIds(new Set());
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

  const doBulkDelete = useCallback(async () => {
    const ids = bulkDeleteModal?.ids;
    if (!ids?.length) return;
    setBulkDeleteModal(null);
    setBulkDeletingIds(new Set(ids));
    try {
      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        await Promise.all(ids.slice(i, i + BATCH).map(id => sbDeleteTransaction(id)));
      }
      if (!isMountedRef.current) return;
      const idSet = new Set(ids);
      setTransactions(p => p.filter(t => !idSet.has(t.id)));
      setSelected(new Set());
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} deleted.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setBulkDeletingIds(new Set());
    }
  }, [bulkDeleteModal, setTransactions, showToast]);

  const handleImport = useCallback(async (rows) => {
    const BATCH = 20;
    const inserted = [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const results = await Promise.all(rows.slice(i, i + BATCH).map(row => sbInsertTransaction({ ...row, cds_number: cdsNumber || null })));
      results.forEach(r => inserted.push(r[0]));
    }
    inserted.sort((a, b) => (b.date || "") > (a.date || "") ? 1 : -1);
    if (!isMountedRef.current) return;
    setTransactions(p => [...inserted, ...p]);
    setImportModal(false);
    showToast(`Imported ${inserted.length} transaction${inserted.length !== 1 ? "s" : ""} successfully!`, "success");
  }, [cdsNumber, setTransactions, showToast]);

  const statCards = useMemo(() => {
    if (isVR) return [
      { label: "Awaiting Review", value: stats.confirmed, sub: "Confirmed by Data Entrant",                                                icon: "📋", color: "#1D4ED8" },
      { label: "Verified",        value: stats.verified,  sub: "Approved transactions",                                                    icon: "✔️", color: C.green  },
      { label: "Rejected",        value: stats.rejected,  sub: "Sent back for correction",                                                 icon: "✖",  color: C.red    },
      { label: "Selected",        value: selected.size,   sub: selected.size > 0 ? "Ready to action" : "Use checkboxes below",             icon: "☑️", color: C.gold  },
    ];
    if (isDE) return [
      { label: "My Transactions", value: stats.total,                           sub: `${stats.pending} pending · ${stats.confirmed} confirmed`, icon: "📋", color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                           icon: "📥", color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                          icon: "📤", color: C.red   },
      { label: "Pending Confirm", value: stats.pending,                         sub: "Awaiting your confirmation",                             icon: "🕐", color: C.gold  },
    ];
    if (isRO) return [
      { label: "Total Records",   value: stats.total,                           sub: `${stats.verified} verified`,                             icon: "📋", color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                           icon: "📥", color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                          icon: "📤", color: C.red   },
      { label: "Net Position",    value: `TZS ${fmtSmart(Math.abs(stats.totalBuyGrand - stats.totalSellGrand))}`, sub: stats.totalBuyGrand >= stats.totalSellGrand ? "Net invested" : "Net realised", icon: "📊", color: C.gold },
    ];
    return [
      { label: "Total Transactions", value: stats.total,                           sub: `${stats.buys} buys · ${stats.sells} sells`,           icon: "📋", color: C.navy  },
      { label: "Total Bought",       value: `TZS ${fmtSmart(stats.totalBuyGrand)}`,  sub: `${stats.buys} buy orders`,                        icon: "📥", color: C.green },
      { label: "Total Sold",         value: `TZS ${fmtSmart(stats.totalSellGrand)}`, sub: `${stats.sells} sell orders`,                       icon: "📤", color: C.red   },
      { label: "Pending Verify",     value: stats.confirmed,                       sub: `${stats.pending} pending · ${stats.rejected} rejected`, icon: "⏳", color: C.gold  },
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

  const pullReady = pullDistance >= 64;

  const mobileInputAttrs = isMobile ? {
    autoComplete: "off",
    autoCorrect: "off",
    autoCapitalize: "off",
    spellCheck: false,
    "data-form-type": "other",
    "data-lpignore": "true",
  } : {};

  return (
    <div
      ref={rootRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onTouchCancel={isMobile ? handleTouchEnd : undefined}
      style={{
        height: isMobile ? "auto" : pageHeight,
        display: "flex",
        flexDirection: "column",
        overflow: isMobile ? "visible" : "hidden",
        position: "relative",
        paddingBottom: isMobile ? 96 : 0,
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Pull-to-refresh indicator ── */}
      {isMobile && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 0, pointerEvents: "none", zIndex: 3 }}>
          <div style={{
            position: "absolute", left: "50%", top: 0,
            transform: `translate(-50%, ${Math.max(8, pullDistance - 34)}px)`,
            opacity: refreshing || pullDistance > 6 ? 1 : 0,
            transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease",
            background: C.white,
            border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`,
            borderRadius: 999, padding: "7px 12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              border: `2px solid ${refreshing ? `${C.green}33` : C.gray200}`,
              borderTop: `2px solid ${pullReady || refreshing ? C.green : C.gray400}`,
              animation: refreshing ? "spin 0.8s linear infinite" : "none",
              transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`,
              transition: "transform 0.12s ease, border-color 0.12s ease",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: refreshing ? C.green : (pullReady ? C.text : C.gray500), whiteSpace: "nowrap" }}>
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      {/* ── Modals — OUTSIDE transform wrapper so position:fixed works correctly ── */}
      {deleteModal && (
        <Modal type="confirm" title="Delete Transaction"
          message={`Delete this ${deleteModal.type} transaction for "${deleteModal.company}"? This cannot be undone.`}
          onConfirm={handleDelete} onClose={closeDelete} />
      )}
      {bulkDeleteModal && (
        <SimpleConfirmModal title="Delete Transactions"
          message={`Are you sure you want to delete ${bulkDeleteModal.ids.length} transaction(s)? This cannot be undone.`}
          count={bulkDeleteModal.ids.length} loading={bulkDeletingIds.size > 0}
          onConfirm={doBulkDelete} onClose={closeBulkDelete} />
      )}
      {bulkUnverifyModal && (
        <SimpleConfirmModal title="Unverify Transactions"
          message={`Are you sure you want to unverify ${bulkUnverifyModal.ids.length} transaction(s)? They will be moved back to Pending.`}
          count={bulkUnverifyModal.ids.length} loading={isAnyUnverifying}
          onConfirm={doBulkUnverify} onClose={closeBulkUnverify} />
      )}
      {formModal.open && (
        <TransactionFormModal
          key={formModal.transaction?.id || "new"}
          transaction={formModal.transaction}
          companies={effectiveCompanies}
          transactions={myTransactions}
          brokers={brokers}
          onConfirm={handleFormConfirm}
          onClose={closeForm}
        />
      )}
      {importModal && (
        <ImportTransactionsModal
          companies={effectiveCompanies}
          brokers={brokers}
          onImport={handleImport}
          onClose={closeImport}
        />
      )}
      {actionModal && (
        <ConfirmActionModal action={actionModal.action} count={actionModal.ids.length} company={actionModal.company}
          loading={isAnyConfirming || isAnyVerifying}
          onConfirm={actionModal.action === "verify" ? doVerify : doBulkConfirm}
          onClose={closeAction} />
      )}
      {rejectModal && <RejectModal count={rejectModal.ids.length} onConfirm={handleReject} onClose={closeReject} />}
      {detailTransaction && (
        <TransactionDetailModal
          transaction={detailTransaction}
          transactions={myTransactions}
          companies={effectiveCompanies}
          onClose={closeDetail}
        />
      )}

      {/* ── Transform wrapper ── */}
      <div style={{
        transform: isMobile ? `translateY(${pullDistance}px)` : "none",
        transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"),
        willChange: isMobile ? "transform" : "auto",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: isMobile ? "visible" : "hidden",
      }}>

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
                  <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400, pointerEvents: "none" }}>🔍</span>
                  <input
                    value={search}
                    onChange={e => { setSearch(e.target.value); resetPage(); }}
                    placeholder="Search company, date, status..."
                    {...mobileInputAttrs}
                    style={{ width: "100%", height: 40, borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, paddingLeft: 34, fontSize: 13, outline: "none", color: C.text, boxSizing: "border-box" }}
                    onFocus={e => { e.target.style.borderColor = C.green; }}
                    onBlur={e => { e.target.style.borderColor = C.gray200; }}
                  />
                </div>
                <button
                  onClick={() => openFormModal(null)}
                  disabled={loadingCompanies}
                  style={{ height: 40, padding: "0 16px", borderRadius: 9, border: "none", background: loadingCompanies ? C.gray200 : C.navy, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: loadingCompanies ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
                >
                  + Record
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400, pointerEvents: "none" }}>🔍</span>
                <input
                  value={search}
                  onChange={e => { setSearch(e.target.value); resetPage(); }}
                  placeholder="Search company, date, status..."
                  {...mobileInputAttrs}
                  style={{ width: "100%", height: 40, borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, paddingLeft: 34, fontSize: 13, outline: "none", color: C.text, boxSizing: "border-box" }}
                  onFocus={e => { e.target.style.borderColor = C.green; }}
                  onBlur={e => { e.target.style.borderColor = C.gray200; }}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Desktop toolbar ── */}
        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexShrink: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
              <div style={{ flex: 1, minWidth: 220, maxWidth: 360, position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}>🔍</span>
                <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
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
                  {canBulkConfirm  && <button onClick={() => setActionModal({ action: "confirm", ids: selectedBuckets.pendingRejected, company: null })} disabled={isAnyConfirming} style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyConfirming ? C.gray200 : "#1D4ED8", color: "#ffffff", fontWeight: 700, cursor: isAnyConfirming ? "not-allowed" : "pointer" }}>{isAnyConfirming ? <><Spinner size={12} color="#888" /> Confirming...</> : `✅ Confirm ${selectedBuckets.pendingRejected.length}`}</button>}
                  {canBulkVerify   && <button onClick={() => handleVerify(selectedBuckets.confirmed)} disabled={isAnyVerifying} style={{ ...TOOLBAR_BUTTON, border: "none", background: isAnyVerifying ? C.gray200 : C.green, color: "#ffffff", fontWeight: 700, cursor: isAnyVerifying ? "not-allowed" : "pointer" }}>{isAnyVerifying ? <><Spinner size={12} color="#888" /> Verifying...</> : `✔ Verify ${selectedBuckets.confirmed.length}`}</button>}
                  {canBulkReject   && <button onClick={() => setRejectModal({ ids: selectedBuckets.confirmed })} disabled={isAnyRejecting} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyRejecting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyRejecting ? "not-allowed" : "pointer" }}>{isAnyRejecting ? <><Spinner size={12} color={C.red} /> Rejecting...</> : `✖ Reject ${selectedBuckets.confirmed.length}`}</button>}
                  {canBulkUnverify && <button onClick={() => setBulkUnverifyModal({ ids: selectedBuckets.verified })} disabled={isAnyUnverifying} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.gray200}`, background: isAnyUnverifying ? C.gray100 : C.white, color: C.gray600, fontWeight: 700, cursor: isAnyUnverifying ? "not-allowed" : "pointer" }}>{isAnyUnverifying ? <><Spinner size={12} color={C.gray400} /> Unverifying...</> : `↩️ UnVerify ${selectedBuckets.verified.length}`}</button>}
                  {canBulkDelete   && <button onClick={() => setBulkDeleteModal({ ids: selectedBuckets.deletable })} disabled={isAnyDeleting} style={{ ...TOOLBAR_BUTTON, border: `1.5px solid ${C.red}55`, background: isAnyDeleting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyDeleting ? "not-allowed" : "pointer" }}>{isAnyDeleting ? <><Spinner size={12} color={C.red} /> Deleting...</> : `🗑️ Delete ${selectedBuckets.deletable.length}`}</button>}
                  <Btn variant="secondary" onClick={() => setSelected(new Set())}>Clear Selection</Btn>
                </>
              ) : (
                <>
                  <Btn variant="secondary" icon="🔄" onClick={loadTransactions}>Refresh</Btn>
                  {(search || typeFilter !== "All" || statusFilter !== defaultStatus) && <Btn variant="secondary" onClick={resetFilters}>Reset</Btn>}
                  {(isDE || isSAAD) && <Btn variant="navy" icon="+" onClick={() => openFormModal(null)} disabled={loadingCompanies}>Record Transaction</Btn>}
                  {(isDE || isSAAD) && <Btn variant="primary" icon="⬆️" onClick={() => setImportModal(true)} disabled={loadingCompanies}>Import</Btn>}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Content area ── */}
        <div style={{ flex: isMobile ? "unset" : 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>
          <SectionCard title={`Transaction History (${filtered.length}${filtered.length !== stats.total ? ` of ${stats.total}` : ""})`}>
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
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>No transactions yet</div>
                <div style={{ fontSize: 13 }}>{isDE ? 'Tap "Record" to add your first buy or sell' : "Transactions will appear here once created"}</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                <div style={{ fontWeight: 600, color: C.text }}>No results found</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</div>
                <button onClick={resetFilters} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reset Filters</button>
              </div>
            ) : isMobile ? (
              <>
                <div style={{ padding: "8px 12px" }}>
                  {paginated.map(transaction => (
                    <TransactionMobileCard
                      key={transaction.id}
                      transaction={transaction}
                      onOpenFormModal={openFormModal}
                      onOpenRejectModal={openRejectModal}
                      onOpenDeleteModal={openDeleteModal}
                      onHandleConfirm={handleConfirm}
                      onHandleVerify={handleVerify}
                      onHandleUnverify={handleUnVerify}
                      confirmingIds={confirmingIds}
                      verifyingIds={verifyingIds}
                      rejectingIds={rejectingIds}
                      unverifyingIds={unverifyingIds}
                      deletingId={deletingId}
                      bulkDeletingIds={bulkDeletingIds}
                      isDE={isDE} isVR={isVR} isSAAD={isSAAD}
                      showActions={showActions}
                      onOpenDetail={setDetailModal}
                    />
                  ))}
                </div>
                <MobilePagination
                  page={safePage} totalPages={totalPages}
                  setPage={setPage} filtered={filtered.length} pageSize={pageSize}
                />
              </>
            ) : (
              <>
                <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
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
                          <th style={{ padding: "7px 10px", borderBottom: `2px solid ${C.gray200}`, width: 36, background: isDark ? C.gray50 : `linear-gradient(135deg, ${C.navy}0a, ${C.navy}05)` }}>
                            <input type="checkbox" checked={allSelected}
                              ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                              onChange={toggleAll}
                              style={{ cursor: "pointer", width: 15, height: 15, accentColor: "#0B1F3A" }} />
                          </th>
                        )}
                        {tableHeaders.map(h => (
                          <th key={h.label} style={{ padding: "7px 10px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: isDark ? C.gray50 : `linear-gradient(135deg, ${C.navy}0a, ${C.navy}05)` }}>
                            {h.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((transaction, i) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          globalIdx={(safePage - 1) * pageSize + i + 1}
                          selected={selected}
                          onToggleOne={toggleOne}
                          onOpenFormModal={openFormModal}
                          onOpenRejectModal={openRejectModal}
                          onOpenDeleteModal={openDeleteModal}
                          onHandleConfirm={handleConfirm}
                          onHandleVerify={handleVerify}
                          onHandleUnverify={handleUnVerify}
                          confirmingIds={confirmingIds}
                          verifyingIds={verifyingIds}
                          rejectingIds={rejectingIds}
                          unverifyingIds={unverifyingIds}
                          deletingId={deletingId}
                          bulkDeletingIds={bulkDeletingIds}
                          isDE={isDE} isVR={isVR} isSAAD={isSAAD}
                          showCheckbox={showCheckbox} showActions={showActions}
                          onOpenDetail={setDetailModal}
                        />
                      ))}
                    </tbody>
                    {filtered.length > 1 && (
                    <tfoot>
                      <tr style={{ background: C.gray50, borderTop: `2px solid ${C.gray200}`, verticalAlign: "top" }}>
                        <td colSpan={tfootLeftCols} style={{ padding: "8px 10px", fontWeight: 700, color: C.gray600, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          TOTALS ({filtered.length} rows{filtered.length > pageSize ? `, page shows ${paginated.length}` : ""})
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
                <Pagination
                  page={safePage} totalPages={totalPages} pageSize={pageSize}
                  setPage={setPage} setPageSize={setPageSize}
                  total={stats.total} filtered={filtered.length}
                />
              </>
            )}
          </SectionCard>
        </div>

      </div>
    </div>
  );
}
