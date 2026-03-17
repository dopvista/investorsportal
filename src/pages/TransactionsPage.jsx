// ── src/pages/TransactionsPage.jsx ───────────────────────────────
import { useState, useMemo, useCallback, useEffect, useRef, memo } from "react";
import {
  sbGetAllCompanies,
  sbGetTransactions,
  sbInsertTransaction,
  sbUpdateTransaction,
  sbDeleteTransaction,
  sbConfirmTransaction,
  sbVerifyTransactions,
  sbRejectTransactions,
  sbUnverifyTransaction,
  sbUnverifyTransactions,
  sbGetActiveBrokers,
} from "../lib/supabase";
import {
  C, fmt, fmtInt, fmtSmart, calcFees,
  Btn, StatCard, SectionCard, Modal, ActionMenu,
  TransactionFormModal, ImportTransactionsModal,
} from "../components/ui";

const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d.includes("T") ? d : d + "T00:00:00");
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const STATUS = {
  pending:   { label: "Pending",   bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA", icon: "🕐" },
  confirmed: { label: "Confirmed", bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE", icon: "✅" },
  verified:  { label: "Verified",  bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0", icon: "✔️" },
  rejected:  { label: "Rejected",  bg: "#FEF2F2", color: "#DC2626", border: "#FECACA", icon: "✖" },
};

const defaultStatus = "All";
const statusOptions = [
  ["All", "All Statuses"],
  ["pending", "🕐 Pending"],
  ["confirmed", "✅ Confirmed"],
  ["verified", "✔️ Verified"],
  ["rejected", "✖ Rejected"],
];

// ── Spinner ────────────────────────────────────────────────────────
const Spinner = memo(function Spinner({ size = 13, color = "#fff", style = {} }) {
  return (
    <>
      <style>{`@keyframes _txSpin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${color}33`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "_txSpin 0.65s linear infinite", flexShrink: 0, ...style }} />
    </>
  );
});

// ── Status Badge ───────────────────────────────────────────────────
const StatusBadge = memo(function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.pending;
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
      {s.icon} {s.label}
    </span>
  );
});

// ── Reject Modal ───────────────────────────────────────────────────
function RejectModal({ count, onConfirm, onClose }) {
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
        <div style={{ background: `linear-gradient(135deg, ${C.navy}, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>✖ Reject Transaction{count > 1 ? "s" : ""}</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>{count > 1 ? `${count} transactions selected` : "1 transaction selected"}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: C.white, width: 28, height: 28, borderRadius: "50%", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>
          {err && <div style={{ background: C.redBg, border: `1px solid #FECACA`, color: C.red, borderRadius: 8, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>{err}</div>}
          <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Rejection Reason <span style={{ color: C.red }}>*</span></label>
          <textarea value={comment} onChange={e => { setComment(e.target.value); setErr(""); }} placeholder="Explain why this transaction is being rejected..." rows={4}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, fontSize: 14, border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit", resize: "vertical", color: C.text, boxSizing: "border-box" }}
            onFocus={e => { e.target.style.borderColor = C.red; }} onBlur={e => { e.target.style.borderColor = C.gray200; }} />
          <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>This comment will be visible to the Data Entrant.</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !comment.trim()} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: saving || !comment.trim() ? C.gray200 : C.red, color: C.white, fontWeight: 700, fontSize: 13, cursor: saving || !comment.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {saving ? <><Spinner size={13} color="#fff" /> Rejecting...</> : `Reject ${count > 1 ? `${count} Transactions` : "Transaction"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Confirm Action Modal ───────────────────────────────────────────
const ConfirmActionModal = memo(function ConfirmActionModal({ action, count = 1, company, onConfirm, onClose, loading }) {
  const isVerify    = action === "verify";
  const accentColor = isVerify ? C.green : "#1D4ED8";
  const accentBg    = isVerify ? C.greenBg : "#EFF6FF";
  const accentBdr   = isVerify ? "#BBF7D0" : "#BFDBFE";
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
        <div style={{ background: `linear-gradient(135deg, ${C.navy}, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>{icon} {title}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{subtitle}</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: C.white, width: 28, height: 28, borderRadius: "50%", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: loading ? C.gray200 : accentColor, color: C.white, fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading
              ? <><Spinner size={13} color="#fff" />{isVerify ? "Verifying..." : "Confirming..."}</>
              : <>{icon} {isVerify ? (count > 1 ? `Verify ${count}` : "Verify") : "Confirm"}</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Simple Confirm Modal ───────────────────────────────────────────
const SimpleConfirmModal = memo(function SimpleConfirmModal({ title, message, count, onConfirm, onClose, loading }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 20, backdropFilter: "blur(2px)" }}>
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy}, #1e3a5f)`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>{title}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 2 }}>{count} transaction{count > 1 ? "s" : ""} selected</div>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: "rgba(255,255,255,0.1)", border: "none", color: C.white, width: 28, height: 28, borderRadius: "50%", cursor: loading ? "not-allowed" : "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "20px" }}>
          <div style={{ fontSize: 14, color: C.text, marginBottom: 16 }}>{message}</div>
        </div>
        <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit" }}>Cancel</button>
          <button onClick={onConfirm} disabled={loading} style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: loading ? C.gray200 : C.red, color: C.white, fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {loading ? <><Spinner size={13} color="#fff" /> Processing...</> : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
});

// ── Pagination ─────────────────────────────────────────────────────
const Pagination = memo(function Pagination({ page, totalPages, pageSize, setPage, setPageSize, total, filtered }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, filtered);
  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) pages.push(i);
    else if (pages[pages.length - 1] !== "...") pages.push("...");
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: `1px solid ${C.gray200}`, flexShrink: 0, background: `${C.navy}04` }}>
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

const PgBtn = memo(function PgBtn({ onClick, disabled, label, active }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ width: 28, height: 28, borderRadius: 6, border: `1.5px solid ${active ? C.navy : C.gray200}`, background: active ? C.navy : disabled ? C.gray50 : C.white, color: active ? C.white : disabled ? C.gray400 : C.gray600, fontWeight: active ? 700 : 500, fontSize: 12, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {label}
    </button>
  );
});

// ── Row permissions helper ─────────────────────────────────────────
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

// ── Transaction Detail Modal ───────────────────────────────────────
const fmtDateTime = (d) => {
  if (!d) return null;
  return new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const DetailRow = memo(function DetailRow({ label, value, accent, mono }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.gray100}`, gap: 12, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: C.gray400, fontWeight: 600, flexShrink: 0, minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent || C.text, textAlign: "right", wordBreak: "break-word", fontFamily: mono ? "monospace" : "inherit" }}>{value}</span>
    </div>
  );
});

const DetailSection = memo(function DetailSection({ title, icon, children, color }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "9px 14px", background: color || C.gray50, borderBottom: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: color ? C.white : C.navy, textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</span>
      </div>
      <div style={{ padding: "4px 14px 6px" }}>{children}</div>
    </div>
  );
});

const TransactionDetailModal = memo(function TransactionDetailModal({ transaction, onClose }) {
  if (!transaction) return null;

  const isBuy    = transaction.type === "Buy";
  const tradeVal = Number(transaction.total || 0);
  const fees     = Number(transaction.fees  || 0);
  const gt       = isBuy ? tradeVal + fees : tradeVal - fees;
  const st       = STATUS[transaction.status] || STATUS.pending;

  // Reconstruct fee breakdown from total using calcFees — matches what was stored
  const breakdown = calcFees(tradeVal);

  const shortId = (uid) => uid ? uid.slice(0, 8).toUpperCase() : null;

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(2px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.gray50, borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.3)", overflow: "hidden" }}>

        {/* ── Header ── */}
        <div style={{ background: `linear-gradient(135deg, ${C.navy}, #1e3a5f)`, padding: "18px 22px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ background: isBuy ? C.green : "#EF4444", color: C.white, padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 800 }}>
                {isBuy ? "▲ Buy" : "▼ Sell"}
              </span>
              <span style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                {st.icon} {st.label}
              </span>
            </div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 18, lineHeight: 1.2 }}>{transaction.company_name}</div>
            <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 4 }}>{fmtDate(transaction.date)}</div>
          </div>
          <div style={{ textAlign: "right", marginLeft: 16, flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{isBuy ? "Total Paid" : "Net Received"}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: isBuy ? "#6EE7B7" : "#FCA5A5", marginTop: 2 }}>
              TZS {fmt(gt)}
            </div>
          </div>
          <button onClick={onClose}
            style={{ marginLeft: 16, width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 15, color: C.white, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ overflowY: "auto", flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* ── Transaction details ── */}
          <DetailSection title="Transaction" icon="📋">
            <DetailRow label="Date"         value={fmtDate(transaction.date)} />
            <DetailRow label="Quantity"     value={`${fmtInt(transaction.qty)} shares`} />
            <DetailRow label="Price/Share"  value={`TZS ${fmt(transaction.price)}`} />
            <DetailRow label="Trade Value"  value={`TZS ${fmt(tradeVal)}`} />
          </DetailSection>

          {/* ── Fee breakdown ── */}
          <DetailSection title="Commission & Fees" icon="💰">
            <DetailRow label="Broker (+VAT)"  value={`TZS ${fmt(breakdown.broker)}`}   accent={C.gray600} />
            <DetailRow label="CMSA (0.14%)"   value={`TZS ${fmt(breakdown.cmsa)}`}     accent={C.gray600} />
            <DetailRow label="DSE (+VAT)"     value={`TZS ${fmt(breakdown.dse)}`}      accent={C.gray600} />
            <DetailRow label="CSDR (+VAT)"    value={`TZS ${fmt(breakdown.csdr)}`}     accent={C.gray600} />
            <DetailRow label="Fidelity (0.02%)" value={`TZS ${fmt(breakdown.fidelity)}`} accent={C.gray600} />
            <div style={{ borderTop: `2px solid ${C.gray200}`, marginTop: 4, paddingTop: 4 }}>
              <DetailRow label="Total Fees"   value={`TZS ${fmt(fees || breakdown.total)}`} accent={C.navy} />
              <DetailRow
                label={isBuy ? "Total Paid" : "Net Received"}
                value={`TZS ${fmt(gt)}`}
                accent={isBuy ? C.green : "#EF4444"}
              />
            </div>
          </DetailSection>

          {/* ── Reference & Broker ── */}
          <DetailSection title="Reference & Broker" icon="🏦">
            <DetailRow label="Broker"       value={transaction.broker_name || null} />
            <DetailRow label="Reference No." value={transaction.control_number || null} mono />
            <DetailRow label="Remarks"      value={transaction.remarks || null} accent={C.gray600} />
          </DetailSection>

          {/* ── Audit Trail ── */}
          <DetailSection title="Audit Trail" icon="🔍" color={C.navy}>
            <DetailRow
              label="Created"
              value={transaction.created_at
                ? `${fmtDateTime(transaction.created_at)}${transaction.created_by ? `  ·  ID: ${shortId(transaction.created_by)}` : ""}`
                : null}
              accent={C.gray600}
            />
            <DetailRow
              label="Confirmed"
              value={transaction.confirmed_at
                ? `${fmtDateTime(transaction.confirmed_at)}${transaction.confirmed_by ? `  ·  ID: ${shortId(transaction.confirmed_by)}` : ""}`
                : null}
              accent="#1D4ED8"
            />
            <DetailRow
              label="Verified"
              value={transaction.verified_at
                ? `${fmtDateTime(transaction.verified_at)}${transaction.verified_by ? `  ·  ID: ${shortId(transaction.verified_by)}` : ""}`
                : null}
              accent={C.green}
            />
            {transaction.status === "rejected" && (
              <>
                <DetailRow
                  label="Rejected"
                  value={transaction.rejected_at
                    ? `${fmtDateTime(transaction.rejected_at)}${transaction.rejected_by ? `  ·  ID: ${shortId(transaction.rejected_by)}` : ""}`
                    : "—"}
                  accent="#EF4444"
                />
                {transaction.rejection_comment && (
                  <DetailRow label="Reason" value={transaction.rejection_comment} accent="#EF4444" />
                )}
              </>
            )}
            {!transaction.confirmed_at && !transaction.verified_at && transaction.status !== "rejected" && (
              <div style={{ padding: "10px 0 4px", fontSize: 12, color: C.gray400, textAlign: "center" }}>
                No workflow actions yet — transaction is pending confirmation
              </div>
            )}
          </DetailSection>

          {/* ── Transaction ID ── */}
          <div style={{ textAlign: "center", padding: "4px 0 2px" }}>
            <span style={{ fontSize: 10, color: C.gray400, fontFamily: "monospace" }}>ID: {transaction.id}</span>
          </div>
        </div>
      </div>
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
  const isBuy     = transaction.type === "Buy";
  const tradeVal  = Number(transaction.total || 0);
  const fees      = Number(transaction.fees  || 0);
  // FIX: Buy = investor pays trade+fees; Sell = investor receives trade−fees
  const gt        = isBuy ? tradeVal + fees : tradeVal - fees;
  const isChecked = selected.has(transaction.id);
  const perms     = getRowPermissions({ transaction, isDE, isVR, isSAAD });

  const isRowConfirming  = confirmingIds.has(transaction.id);
  const isRowVerifying   = verifyingIds.has(transaction.id);
  const isRowRejecting   = rejectingIds.has(transaction.id);
  const isRowUnverifying = unverifyingIds.has(transaction.id);
  const isRowDeleting    = deletingId === transaction.id || bulkDeletingIds.has(transaction.id);
  const isRowBusy        = isRowConfirming || isRowVerifying || isRowRejecting || isRowUnverifying || isRowDeleting;

  const rowActions = [
    ...(perms.canEdit    ? [{ icon: "✏️", label: "Edit",      disabled: isRowBusy, onClick: () => onOpenFormModal(transaction) }] : []),
    ...(perms.canVerify  ? [{ icon: isRowVerifying  ? null : "✔️", label: isRowVerifying  ? "Verifying..."  : "Verify",   disabled: isRowBusy, onClick: () => onHandleVerify([transaction.id], transaction.company_name) }] : []),
    ...(perms.canReject  ? [{ icon: isRowRejecting  ? null : "✖",  label: isRowRejecting  ? "Rejecting..."  : "Reject",   danger: true, disabled: isRowBusy, onClick: () => onOpenRejectModal([transaction.id]) }] : []),
    ...(perms.canUnVerify? [{ icon: isRowUnverifying? null : "↩️", label: isRowUnverifying? "Unverifying...": "UnVerify", danger: true, disabled: isRowBusy, onClick: () => onHandleUnverify(transaction.id) }] : []),
    ...(perms.canDelete  ? [{ icon: isRowDeleting   ? null : "🗑️", label: isRowDeleting   ? "Deleting..."   : "Delete",   danger: true, disabled: isRowBusy, onClick: () => onOpenDeleteModal(transaction) }] : []),
  ];

  return (
    <tr
      style={{ borderBottom: `1px solid ${C.gray100}`, transition: "background 0.15s, opacity 0.2s", background: perms.isRejected ? "#FFF5F5" : perms.isVerified ? "#F9FFFB" : "transparent", opacity: isRowBusy ? 0.6 : 1, pointerEvents: isRowBusy ? "none" : "auto", cursor: "pointer" }}
      onClick={() => onOpenDetail(transaction)}
      onMouseEnter={e => { if (!isRowBusy) e.currentTarget.style.background = perms.isRejected ? "#FFF0F0" : perms.isVerified ? "#F0FDF4" : C.gray50; }}
      onMouseLeave={e => { e.currentTarget.style.background = perms.isRejected ? "#FFF5F5" : perms.isVerified ? "#F9FFFB" : "transparent"; }}
    >
      {showCheckbox && (
        <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={isChecked} onChange={() => onToggleOne(transaction.id)} disabled={isRowBusy}
            style={{ cursor: isRowBusy ? "not-allowed" : "pointer", width: 15, height: 15, accentColor: C.navy }} />
        </td>
      )}
      <td style={{ padding: "7px 10px", color: C.gray400, fontWeight: 600, fontSize: 12 }}>{globalIdx}</td>
      <td style={{ padding: "7px 10px", color: C.gray600, whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(transaction.date)}</td>
      <td style={{ padding: "7px 10px", minWidth: 100 }}>
        <div style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>{transaction.company_name}</div>
      </td>
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        <span style={{ background: isBuy ? C.greenBg : C.redBg, color: isBuy ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, border: `1px solid ${isBuy ? "#BBF7D0" : "#FECACA"}` }}>
          {isBuy ? "▲ Buy" : "▼ Sell"}
        </span>
      </td>
      <td style={{ padding: "7px 10px", fontWeight: 600, textAlign: "right" }}>{fmtInt(transaction.qty)}</td>
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: C.greenBg, color: C.green, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{fmt(transaction.price)}</span>
      </td>
      {/* Broker — single line truncated */}
      <td style={{ padding: "7px 10px", maxWidth: 130, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {transaction.broker_name
          ? <span style={{ fontSize: 12, fontWeight: 600, color: C.text }} title={transaction.broker_name}>{transaction.broker_name}</span>
          : <span style={{ color: C.gray400 }}>—</span>}
      </td>
      {/* Grand Total */}
      <td style={{ padding: "7px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
        <span style={{ background: isBuy ? C.greenBg : C.redBg, color: isBuy ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 800, border: `1px solid ${isBuy ? "#BBF7D0" : "#FECACA"}` }}>
          {fmt(gt)}
        </span>
      </td>
      {/* Status */}
      <td style={{ padding: "7px 10px", whiteSpace: "nowrap" }}>
        <StatusBadge status={transaction.status} />
        {perms.isRejected && transaction.rejection_comment && (
          <div style={{ fontSize: 10, color: "#EF4444", marginTop: 3, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={transaction.rejection_comment}>
            💬 {transaction.rejection_comment}
          </div>
        )}
      </td>
      {showActions && (
        <td style={{ padding: "7px 12px", textAlign: "right", whiteSpace: "nowrap" }} onClick={e => e.stopPropagation()}>
          {perms.canConfirm && (
            <button
              onClick={() => onHandleConfirm(transaction.id, transaction.company_name, transaction.status)}
              disabled={isRowBusy}
              style={{ padding: "4px 10px", borderRadius: 7, border: "none", background: isRowConfirming ? C.gray100 : "#EFF6FF", color: isRowConfirming ? C.gray400 : "#1D4ED8", fontWeight: 700, fontSize: 11, cursor: isRowBusy ? "not-allowed" : "pointer", fontFamily: "inherit", marginRight: rowActions.length ? 6 : 0, display: "inline-flex", alignItems: "center", gap: 5, minWidth: 80, justifyContent: "center" }}
            >
              {isRowConfirming ? <><Spinner size={11} color={C.gray400} /> Confirming</> : "✅ Confirm"}
            </button>
          )}
          {rowActions.length > 0 && <ActionMenu actions={rowActions} />}
        </td>
      )}
    </tr>
  );
});

// ── Table column headers ───────────────────────────────────────────
const buildTableHeaders = (showActions) => [
  { label: "#",           align: "left"  },
  { label: "Date",        align: "left"  },
  { label: "Company",     align: "left"  },
  { label: "Type",        align: "left"  },
  { label: "Qty",         align: "right" },
  { label: "Price/Share", align: "right" },
  { label: "Broker",      align: "left"  },
  { label: "Grand Total", align: "right" },
  { label: "Status",      align: "left"  },
  ...(showActions ? [{ label: "Actions", align: "right" }] : []),
];

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
export default function TransactionsPage({ companies, transactions, setTransactions, showToast, role, cdsNumber }) {
  const isDE   = role === "DE";
  const isVR   = role === "VR";
  const isRO   = role === "RO";
  const isSAAD = role === "SA" || role === "AD";

  const isMountedRef   = useRef(true);
  const txLoadRef      = useRef(0);
  const companyLoadRef = useRef(0);

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

  const [confirmingIds,   setConfirmingIds]  = useState(new Set());
  const [verifyingIds,    setVerifyingIds]   = useState(new Set());
  const [rejectingIds,    setRejectingIds]   = useState(new Set());
  const [unverifyingIds,  setUnverifyingIds] = useState(new Set());
  const [deletingId,      setDeletingId]     = useState(null);
  const [bulkDeletingIds, setBulkDeletingIds]= useState(new Set());

  const [deleteModal,       setDeleteModal]       = useState(null);
  const [bulkDeleteModal,   setBulkDeleteModal]   = useState(null);
  const [bulkUnverifyModal, setBulkUnverifyModal] = useState(null);
  const [formModal,         setFormModal]         = useState({ open: false, transaction: null });
  const [importModal,       setImportModal]       = useState(false);
  const [actionModal,       setActionModal]       = useState(null);
  const [rejectModal,       setRejectModal]       = useState(null);
  const [detailModal,       setDetailModal]       = useState(null); // transaction detail popup

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const effectiveCompanies = useMemo(
    () => (companies?.length ? companies : localCompanies),
    [companies, localCompanies]
  );

  const toolbarControlStyle = useMemo(() => ({ height: 36, borderRadius: 8, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }), []);
  const toolbarButtonStyle  = useMemo(() => ({ ...toolbarControlStyle, padding: "0 14px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }), [toolbarControlStyle]);
  const toolbarInputStyle   = useMemo(() => ({ ...toolbarControlStyle, width: "100%", border: `1.5px solid ${C.gray200}`, padding: "0 10px 0 32px", outline: "none", color: C.text }), [toolbarControlStyle]);
  const toolbarSelectStyle  = useMemo(() => ({ ...toolbarControlStyle, padding: "0 10px", background: C.white, cursor: "pointer", outline: "none", flexShrink: 0 }), [toolbarControlStyle]);

  // ── Data loading ──────────────────────────────────────────────
  const loadTransactions = useCallback(async () => {
    const requestId = ++txLoadRef.current;
    if (isMountedRef.current) { setLoadingTransactions(true); setPageError(null); }
    try {
      const data = await sbGetTransactions();
      if (!isMountedRef.current || requestId !== txLoadRef.current) return;
      setTransactions(data);
    } catch (e) {
      if (!isMountedRef.current || requestId !== txLoadRef.current) return;
      setPageError(e.message || "Failed to load transactions.");
    } finally {
      if (isMountedRef.current && requestId === txLoadRef.current) setLoadingTransactions(false);
    }
  }, [setTransactions]);

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

  const isAnyConfirming  = confirmingIds.size > 0;
  const isAnyVerifying   = verifyingIds.size > 0;
  const isAnyRejecting   = rejectingIds.size > 0;
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
    const buys  = myTransactions.filter(t => t.type === "Buy");
    const sells = myTransactions.filter(t => t.type === "Sell");
    return {
      total:        myTransactions.length,
      buys:         buys.length,
      sells:        sells.length,
      totalBuyVal:  buys.reduce((s, t) => s + Number(t.total || 0), 0),
      totalSellVal: sells.reduce((s, t) => s + Number(t.total || 0), 0),
      pending:   myTransactions.filter(t => t.status === "pending").length,
      confirmed: myTransactions.filter(t => t.status === "confirmed").length,
      verified:  myTransactions.filter(t => t.status === "verified").length,
      rejected:  myTransactions.filter(t => t.status === "rejected").length,
    };
  }, [myTransactions]);

  const filtered = useMemo(() => {
    let list = myTransactions;
    if (typeFilter !== "All")   list = list.filter(t => t.type === typeFilter);
    if (statusFilter !== "All") list = list.filter(t => t.status === statusFilter);
    if (normalizedSearch) {
      list = list.filter(t =>
        t.company_name?.toLowerCase().includes(normalizedSearch)  ||
        t.type?.toLowerCase().includes(normalizedSearch)          ||
        t.date?.includes(normalizedSearch)                        ||
        t.remarks?.toLowerCase().includes(normalizedSearch)       ||
        t.status?.toLowerCase().includes(normalizedSearch)        ||
        t.control_number?.includes(normalizedSearch)              // search by control number
      );
    }
    const isActive = s => s === "pending" || s === "confirmed" || s === "rejected";
    return [...list].sort((a, b) => {
      const aA = isActive(a.status), bA = isActive(b.status);
      if (aA !== bA) return aA ? -1 : 1;
      return (b.date || "").localeCompare(a.date || "");
    });
  }, [myTransactions, typeFilter, statusFilter, normalizedSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paginated  = useMemo(() => filtered.slice((safePage - 1) * pageSize, safePage * pageSize), [filtered, safePage, pageSize]);

  const resetPage    = useCallback(() => setPage(1), []);
  const resetFilters = useCallback(() => { setSearch(""); setTypeFilter("All"); setStatusFilter(defaultStatus); setPage(1); }, []);

  // Corrected totals: sell grand deducts fees
  const totals = useMemo(() => {
    const buyFees  = filtered.filter(t => t.type === "Buy") .reduce((s, t) => s + Number(t.fees || 0), 0);
    const sellFees = filtered.filter(t => t.type === "Sell").reduce((s, t) => s + Number(t.fees || 0), 0);
    const buyAmt   = filtered.filter(t => t.type === "Buy") .reduce((s, t) => s + Number(t.total || 0), 0);
    const sellAmt  = filtered.filter(t => t.type === "Sell").reduce((s, t) => s + Number(t.total || 0), 0);
    return {
      buyAmount:  buyAmt,
      sellAmount: sellAmt,
      fees:       buyFees + sellFees,
      buyGrand:   buyAmt  + buyFees,    // total paid out
      sellGrand:  sellAmt - sellFees,   // net received
    };
  }, [filtered]);

  const paginatedIds = useMemo(() => paginated.map(t => t.id), [paginated]);
  const allSelected  = paginatedIds.length > 0 && paginatedIds.every(id => selected.has(id));
  const someSelected = paginatedIds.some(id => selected.has(id));

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

  // ── handleFormConfirm — includes control_number ───────────────
  const handleFormConfirm = useCallback(async ({ date, companyId, type, qty, price, fees, controlNumber, remarks, total, brokerId, brokerName }) => {
    const isEdit  = !!formModal.transaction;
    const company = companyById.get(companyId);
    const payload = {
      date,
      company_id:     companyId,
      company_name:   company?.name,
      type,
      qty:            Number(qty),
      price:          Number(price),
      total,
      fees:           fees ? Number(fees) : null,
      control_number: controlNumber || null,
      remarks:        remarks || null,
      cds_number:     cdsNumber || null,
      broker_id:      brokerId   || null,
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

  const handleConfirm = useCallback((id, company, status) => {
    setActionModal({ action: status === "rejected" ? "confirm-rejected" : "confirm", ids: [id], company });
  }, []);

  const doBulkConfirm = useCallback(async () => {
    const ids = actionModal?.ids;
    if (!ids?.length) return;
    setActionModal(null);
    setConfirmingIds(new Set(ids));
    try {
      const updated = [...myTransactions];
      for (const id of ids) {
        const rows = await sbConfirmTransaction(id);
        if (!rows || rows.length === 0) throw new Error(`Transaction ${id} could not be confirmed.`);
        const idx = updated.findIndex(t => t.id === id);
        if (idx !== -1) updated[idx] = rows[0];
      }
      if (!isMountedRef.current) return;
      setTransactions(updated);
      setSelected(new Set());
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} confirmed!`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setConfirmingIds(new Set());
    }
  }, [actionModal, myTransactions, setTransactions, showToast]);

  const handleVerify = useCallback((ids, company) => setActionModal({ action: "verify", ids, company: company || null }), []);

  const doVerify = useCallback(async () => {
    const ids = actionModal?.ids;
    if (!ids?.length) return;
    setActionModal(null);
    setVerifyingIds(new Set(ids));
    try {
      await sbVerifyTransactions(ids);
      if (!isMountedRef.current) return;
      setTransactions(p => p.map(t => ids.includes(t.id) ? { ...t, status: "verified" } : t));
      setSelected(new Set());
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} verified!`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setVerifyingIds(new Set());
    }
  }, [actionModal, setTransactions, showToast]);

  const handleReject = useCallback(async (comment) => {
    const ids = rejectModal?.ids;
    if (!ids?.length) return;
    setRejectingIds(new Set(ids));
    try {
      await sbRejectTransactions(ids, comment);
      if (!isMountedRef.current) return;
      setTransactions(p => p.map(t => ids.includes(t.id) ? { ...t, status: "rejected", rejection_comment: comment } : t));
      setSelected(new Set());
      setRejectModal(null);
      showToast(`${ids.length} transaction${ids.length > 1 ? "s" : ""} rejected.`, "error");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setRejectingIds(new Set());
    }
  }, [rejectModal, setTransactions, showToast]);

  const handleUnVerify = useCallback(async (id) => {
    setUnverifyingIds(prev => new Set([...prev, id]));
    try {
      const rows = await sbUnverifyTransaction(id);
      if (!rows || rows.length === 0) throw new Error("Unverify failed.");
      if (!isMountedRef.current) return;
      setTransactions(p => p.map(t => t.id === id ? rows[0] : t));
      showToast("Transaction unverified and returned to Pending.", "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUnverifyingIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, [setTransactions, showToast]);

  const doBulkUnverify = useCallback(async () => {
    const ids = bulkUnverifyModal?.ids;
    if (!ids?.length) return;
    setBulkUnverifyModal(null);
    setUnverifyingIds(new Set(ids));
    try {
      const rows = await sbUnverifyTransactions(ids);
      if (!rows || rows.length === 0) throw new Error("No verified transactions could be unverified.");
      if (!isMountedRef.current) return;
      const rowMap = new Map(rows.map(r => [r.id, r]));
      setTransactions(p => p.map(t => rowMap.get(t.id) || t));
      setSelected(new Set());
      showToast(`${rows.length} transaction${rows.length > 1 ? "s" : ""} unverified.`, "success");
    } catch (e) {
      if (!isMountedRef.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMountedRef.current) setUnverifyingIds(new Set());
    }
  }, [bulkUnverifyModal, setTransactions, showToast]);

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
      for (const id of ids) await sbDeleteTransaction(id);
      if (!isMountedRef.current) return;
      setTransactions(p => p.filter(t => !ids.includes(t.id)));
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
    inserted.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (!isMountedRef.current) return;
    setTransactions(p => [...inserted, ...p]);
    setImportModal(false);
    showToast(`Imported ${inserted.length} transaction${inserted.length !== 1 ? "s" : ""} successfully!`, "success");
  }, [cdsNumber, setTransactions, showToast]);

  const statCards = useMemo(() => {
    if (isVR) return [
      { label: "Awaiting Review", value: stats.confirmed, sub: "Confirmed by Data Entrant",       icon: "📋", color: "#1D4ED8" },
      { label: "Verified",        value: stats.verified,  sub: "Approved transactions",            icon: "✔️", color: C.green  },
      { label: "Rejected",        value: stats.rejected,  sub: "Sent back for correction",         icon: "✖",  color: C.red    },
      { label: "Selected",        value: selected.size,   sub: selected.size > 0 ? "Ready to action" : "Use checkboxes below", icon: "☑️", color: C.gold },
    ];
    if (isDE) return [
      { label: "My Transactions", value: stats.total,                           sub: `${stats.pending} pending · ${stats.confirmed} confirmed`, icon: "📋", color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyVal)}`,  sub: `${stats.buys} buy orders`,   icon: "📥", color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellVal)}`, sub: `${stats.sells} sell orders`, icon: "📤", color: C.red   },
      { label: "Pending Confirm", value: stats.pending,                         sub: "Awaiting your confirmation", icon: "🕐", color: C.gold  },
    ];
    if (isRO) return [
      { label: "Total Records",   value: stats.total,                           sub: `${stats.verified} verified`, icon: "📋", color: C.navy  },
      { label: "Total Bought",    value: `TZS ${fmtSmart(stats.totalBuyVal)}`,  sub: `${stats.buys} buy orders`,   icon: "📥", color: C.green },
      { label: "Total Sold",      value: `TZS ${fmtSmart(stats.totalSellVal)}`, sub: `${stats.sells} sell orders`, icon: "📤", color: C.red   },
      { label: "Net Position",    value: `TZS ${fmtSmart(Math.abs(stats.totalBuyVal - stats.totalSellVal))}`, sub: stats.totalBuyVal >= stats.totalSellVal ? "Net invested" : "Net realised", icon: "📊", color: C.gold },
    ];
    return [
      { label: "Total Transactions", value: stats.total,                           sub: `${stats.buys} buys · ${stats.sells} sells`,                    icon: "📋", color: C.navy  },
      { label: "Total Bought",       value: `TZS ${fmtSmart(stats.totalBuyVal)}`,  sub: `${stats.buys} buy orders`,   icon: "📥", color: C.green },
      { label: "Total Sold",         value: `TZS ${fmtSmart(stats.totalSellVal)}`, sub: `${stats.sells} sell orders`, icon: "📤", color: C.red   },
      { label: "Pending Verify",     value: stats.confirmed,                       sub: `${stats.pending} pending · ${stats.rejected} rejected`, icon: "⏳", color: C.gold },
    ];
  }, [stats, selected.size, isVR, isDE, isRO]);

  const showCheckbox   = true;
  const showActions    = !isRO;
  const tableHeaders   = useMemo(() => buildTableHeaders(showActions), [showActions]);
  // tfoot right: Status + Actions
  const tfootRightCols = 1 + (showActions ? 1 : 0);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div style={{ height: "calc(100vh - 118px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Modals ── */}
      {deleteModal && (
        <Modal type="confirm" title="Delete Transaction"
          message={`Delete this ${deleteModal.type} transaction for "${deleteModal.company}"? This cannot be undone.`}
          onConfirm={handleDelete} onClose={() => setDeleteModal(null)} />
      )}
      {bulkDeleteModal && (
        <SimpleConfirmModal title="Delete Transactions"
          message={`Are you sure you want to delete ${bulkDeleteModal.ids.length} transaction(s)? This cannot be undone.`}
          count={bulkDeleteModal.ids.length} loading={bulkDeletingIds.size > 0}
          onConfirm={doBulkDelete} onClose={() => setBulkDeleteModal(null)} />
      )}
      {bulkUnverifyModal && (
        <SimpleConfirmModal title="Unverify Transactions"
          message={`Are you sure you want to unverify ${bulkUnverifyModal.ids.length} transaction(s)? They will be moved back to Pending.`}
          count={bulkUnverifyModal.ids.length} loading={isAnyUnverifying}
          onConfirm={doBulkUnverify} onClose={() => setBulkUnverifyModal(null)} />
      )}
      {/* Pass myTransactions so form can filter companies by holdings on Sell */}
      {/* Pass brokers so the broker searchable dropdown is populated */}
      {formModal.open && (
        <TransactionFormModal
          key={formModal.transaction?.id || "new"}
          transaction={formModal.transaction}
          companies={effectiveCompanies}
          transactions={myTransactions}
          brokers={brokers}
          onConfirm={handleFormConfirm}
          onClose={() => setFormModal({ open: false, transaction: null })}
        />
      )}
      {importModal && <ImportTransactionsModal companies={effectiveCompanies} onImport={handleImport} onClose={() => setImportModal(false)} />}
      {actionModal && (
        <ConfirmActionModal action={actionModal.action} count={actionModal.ids.length} company={actionModal.company}
          loading={isAnyConfirming || isAnyVerifying}
          onConfirm={actionModal.action === "verify" ? doVerify : doBulkConfirm}
          onClose={() => setActionModal(null)} />
      )}
      {rejectModal && <RejectModal count={rejectModal.ids.length} onConfirm={handleReject} onClose={() => setRejectModal(null)} />}
      {detailModal && <TransactionDetailModal transaction={detailModal} onClose={() => setDetailModal(null)} />}

      {/* ── Stat Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 8, flexShrink: 0 }}>
        {statCards.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8, flexShrink: 0, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1, overflow: "hidden" }}>
          <div style={{ flex: 1, minWidth: 220, maxWidth: 360, position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}>🔍</span>
            <input value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search company, control no., status..."
              style={toolbarInputStyle}
              onFocus={e => { e.target.style.borderColor = C.navy; }}
              onBlur={e => { e.target.style.borderColor = C.gray200; }} />
          </div>
          {["All", "Buy", "Sell"].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); resetPage(); }}
              style={{ ...toolbarButtonStyle, border: `1.5px solid ${typeFilter === t ? C.navy : C.gray200}`, background: typeFilter === t ? C.navy : C.white, color: typeFilter === t ? C.white : C.gray600, fontWeight: 600, cursor: "pointer" }}>
              {t}
            </button>
          ))}
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); resetPage(); }}
            style={{ ...toolbarSelectStyle, border: `1.5px solid ${statusFilter !== "All" ? C.navy : C.gray200}`, color: statusFilter !== "All" ? C.navy : C.gray600, fontWeight: statusFilter !== "All" ? 700 : 400 }}
            onFocus={e => { e.target.style.borderColor = C.navy; }}
            onBlur={e => { e.target.style.borderColor = statusFilter !== "All" ? C.navy : C.gray200; }}>
            {statusOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
          {hasSelection ? (
            <>
              {canBulkConfirm  && <button onClick={() => setActionModal({ action: "confirm", ids: selectedBuckets.pendingRejected, company: null })} disabled={isAnyConfirming} style={{ ...toolbarButtonStyle, border: "none", background: isAnyConfirming ? C.gray200 : "#1D4ED8", color: C.white, fontWeight: 700, cursor: isAnyConfirming ? "not-allowed" : "pointer" }}>{isAnyConfirming ? <><Spinner size={12} color="#888" /> Confirming...</> : `✅ Confirm ${selectedBuckets.pendingRejected.length}`}</button>}
              {canBulkVerify   && <button onClick={() => handleVerify(selectedBuckets.confirmed)} disabled={isAnyVerifying} style={{ ...toolbarButtonStyle, border: "none", background: isAnyVerifying ? C.gray200 : C.green, color: C.white, fontWeight: 700, cursor: isAnyVerifying ? "not-allowed" : "pointer" }}>{isAnyVerifying ? <><Spinner size={12} color="#888" /> Verifying...</> : `✔ Verify ${selectedBuckets.confirmed.length}`}</button>}
              {canBulkReject   && <button onClick={() => setRejectModal({ ids: selectedBuckets.confirmed })} disabled={isAnyRejecting} style={{ ...toolbarButtonStyle, border: `1.5px solid #FECACA`, background: isAnyRejecting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyRejecting ? "not-allowed" : "pointer" }}>{isAnyRejecting ? <><Spinner size={12} color={C.red} /> Rejecting...</> : `✖ Reject ${selectedBuckets.confirmed.length}`}</button>}
              {canBulkUnverify && <button onClick={() => setBulkUnverifyModal({ ids: selectedBuckets.verified })} disabled={isAnyUnverifying} style={{ ...toolbarButtonStyle, border: `1.5px solid ${C.gray200}`, background: isAnyUnverifying ? C.gray100 : C.white, color: C.gray600, fontWeight: 700, cursor: isAnyUnverifying ? "not-allowed" : "pointer" }}>{isAnyUnverifying ? <><Spinner size={12} color={C.gray400} /> Unverifying...</> : `↩️ UnVerify ${selectedBuckets.verified.length}`}</button>}
              {canBulkDelete   && <button onClick={() => setBulkDeleteModal({ ids: selectedBuckets.deletable })} disabled={isAnyDeleting} style={{ ...toolbarButtonStyle, border: `1.5px solid #FECACA`, background: isAnyDeleting ? C.gray100 : C.redBg, color: C.red, fontWeight: 700, cursor: isAnyDeleting ? "not-allowed" : "pointer" }}>{isAnyDeleting ? <><Spinner size={12} color={C.red} /> Deleting...</> : `🗑️ Delete ${selectedBuckets.deletable.length}`}</button>}
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

      {/* ── Table ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <SectionCard title={`Transaction History (${filtered.length}${filtered.length !== stats.total ? ` of ${stats.total}` : ""})`}>
          {loadingTransactions ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: C.gray400 }}>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ width: 28, height: 28, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
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
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No transactions yet</div>
              <div style={{ fontSize: 13 }}>{isDE ? 'Click "Record Transaction" to add your first buy or sell' : "Transactions will appear here once created"}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
              <div style={{ fontWeight: 600 }}>No results found</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters</div>
              <button onClick={resetFilters} style={{ marginTop: 12, padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Reset Filters</button>
            </div>
          ) : (
            <>
              <div style={{ overflowX: "auto", overflowY: "auto", flex: 1, minHeight: 0 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                    <tr>
                      {showCheckbox && (
                        <th style={{ padding: "7px 10px", borderBottom: `2px solid ${C.gray200}`, width: 36, background: "#f5f6fa" }}>
                          <input type="checkbox" checked={allSelected}
                            ref={el => el && (el.indeterminate = someSelected && !allSelected)}
                            onChange={toggleAll}
                            style={{ cursor: "pointer", width: 15, height: 15, accentColor: C.navy }} />
                        </th>
                      )}
                      {tableHeaders.map(h => (
                        <th key={h.label} style={{ padding: "7px 10px", textAlign: h.align, color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: "#f5f6fa" }}>
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
                  <tfoot>
                    <tr style={{ background: `${C.navy}08`, borderTop: `2px solid ${C.gray200}` }}>
                      {/* checkbox + # Date Company Type Qty Price/Share Broker = 8 cols (7 without checkbox) */}
                      <td colSpan={showCheckbox ? 8 : 7} style={{ padding: "8px 10px", fontWeight: 700, color: C.gray600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        TOTALS ({filtered.length} rows{filtered.length > pageSize ? `, page shows ${paginated.length}` : ""})
                      </td>
                      {/* Grand Total column */}
                      <td style={{ padding: "8px 10px", textAlign: "right" }}>
                        <div style={{ fontSize: 13, fontWeight: 800, color: C.green, display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}><span style={{ fontSize: 10 }}>▲</span>{fmt(totals.buyGrand)}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: "#EF4444", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end", marginTop: 3 }}><span style={{ fontSize: 10 }}>▼</span>{fmt(totals.sellGrand)}</div>
                      </td>
                      {/* Status + Actions */}
                      <td colSpan={tfootRightCols} />
                    </tr>
                  </tfoot>
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
  );
}
