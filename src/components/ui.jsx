import { useState, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

// ─── App Brand Colors ─────────────────────────────────────────────
export const C = {
  navy: "#0B1F3A",
  navyLight: "#132844",
  green: "#00843D",
  greenLight: "#00a34c",
  gold: "#F59E0B",
  red: "#EF4444",
  redBg: "#FEF2F2",
  greenBg: "#F0FDF4",
  white: "#FFFFFF",
  gray50: "#F8FAFC",
  gray100: "#F1F5F9",
  gray200: "#E2E8F0",
  gray400: "#94A3B8",
  gray500: "#64748B",
  gray600: "#475569",
  gray800: "#1E293B",
  text: "#0F172A",
};

// ─── Helpers ──────────────────────────────────────────────────────
export const fmt = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0
    ? v.toLocaleString("en-US")
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
export const fmtInt   = (n) => Number(n || 0).toLocaleString("en-US");
export const fmtSmart = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "B";
  if (v >= 1_000_000)     return (v / 1_000_000).toLocaleString("en-US",     { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "M";
  if (v >= 1_000)         return (v / 1_000).toLocaleString("en-US",         { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "K";
  return v.toLocaleString("en-US");
};

// ─── Spinner ──────────────────────────────────────────────────────
export function Spinner({ size = 18, color = "#fff" }) {
  return (
    <div style={{ width: size, height: size, border: `2px solid rgba(255,255,255,0.3)`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
  );
}

// ─── Toast ────────────────────────────────────────────────────────
export function Toast({ msg, type }) {
  if (!msg) return null;
  return (
    <div style={{ position: "fixed", bottom: 28, right: 28, background: type === "error" ? C.red : C.green, color: C.white, padding: "14px 22px", borderRadius: 10, fontSize: 14, fontWeight: 500, zIndex: 99999, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", gap: 10 }}>
      <span>{type === "error" ? "✕" : "✓"}</span>{msg}
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = C.green, icon }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 0 }}>
      <div style={{ width: 36, height: 36, background: color + "18", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: C.gray600, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ─── SectionCard ──────────────────────────────────────────────────
export function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.05)", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      {title && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.gray100}`, background: C.gray50, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{subtitle}</div>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

// ─── Form Primitives ──────────────────────────────────────────────
function FormField({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = (readOnly) => ({
  border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px",
  fontSize: 14, outline: "none", background: readOnly ? C.gray50 : C.white,
  color: C.text, width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s", fontFamily: "inherit",
});

export function FInput({ label, required, ...props }) {
  return (
    <FormField label={label} required={required}>
      <input {...props} style={{ ...inputStyle(props.readOnly), ...props.style }}
        onFocus={e => !props.readOnly && (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)} />
    </FormField>
  );
}

export function FSelect({ label, required, children, ...props }) {
  return (
    <FormField label={label} required={required}>
      <select {...props} style={{ ...inputStyle(false), cursor: "pointer", ...props.style }}
        onFocus={e => (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)}>
        {children}
      </select>
    </FormField>
  );
}

export function FTextarea({ label, required, ...props }) {
  return (
    <FormField label={label} required={required}>
      <textarea {...props} style={{ ...inputStyle(false), resize: "vertical", minHeight: 72, ...props.style }}
        onFocus={e => (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)} />
    </FormField>
  );
}

// ─── Button ───────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", loading, icon, ...props }) {
  const variants = {
    primary:   { background: `linear-gradient(135deg, ${C.green}, ${C.greenLight})`, color: C.white, border: "none", boxShadow: "0 4px 12px rgba(0,132,61,0.3)" },
    secondary: { background: C.white, color: C.gray800, border: `1.5px solid ${C.gray200}` },
    danger:    { background: C.redBg, color: C.red, border: `1.5px solid #FECACA` },
    navy:      { background: `linear-gradient(135deg, ${C.navy}, ${C.navyLight})`, color: C.white, border: "none", boxShadow: "0 4px 12px rgba(11,31,58,0.3)" },
  };
  return (
    <button {...props} disabled={loading || props.disabled} style={{ padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 7, transition: "opacity 0.2s", fontFamily: "inherit", ...variants[variant], ...props.style }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.88"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
      {loading ? <Spinner size={14} color={variant === "primary" || variant === "navy" ? C.white : C.green} /> : icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

// ─── Action Menu (⋯ dropdown) ─────────────────────────────────────
export function ActionMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handle);
    document.addEventListener("scroll", handleScroll, true);
    return () => { document.removeEventListener("mousedown", handle); document.removeEventListener("scroll", handleScroll, true); };
  }, [open]);

  const handleOpen = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const dropdownHeight = actions.length * 41;
      const spaceBelow = window.innerHeight - rect.bottom;
      const goUp = spaceBelow < dropdownHeight;
      setPos({ top: goUp ? rect.top - dropdownHeight : rect.bottom + 4, left: rect.right - 160 });
    }
    setOpen(o => !o);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={handleOpen} style={{ width: 32, height: 32, borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: open ? C.gray100 : C.white, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: C.gray600 }}>⋯</button>
      {open && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 9999, minWidth: 160, overflow: "hidden" }}>
          {actions.map((a, i) => (
            <button key={i} onClick={() => { setOpen(false); a.onClick(); }} style={{ width: "100%", padding: "10px 16px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: a.danger ? C.red : C.text, textAlign: "left", borderBottom: i < actions.length - 1 ? `1px solid ${C.gray100}` : "none", fontFamily: "inherit" }}
              onMouseEnter={e => e.currentTarget.style.background = a.danger ? C.redBg : C.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "none"}>
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ─── MODAL SHELL ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════
function ModalShell({ title, subtitle, headerRight, onClose, footer, children, maxWidth = 460, maxHeight, lockBackdrop = false }) {
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={e => { if (!lockBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth, display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", ...(maxHeight ? { maxHeight } : {}) }}>
        <div style={{ padding: "22px 28px 16px", borderBottom: `1px solid ${C.gray200}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.gray400, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 16, flexShrink: 0 }}>
            {headerRight}
            {!lockBackdrop && (
              <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.gray200}`, background: C.gray50, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: C.gray600, flexShrink: 0 }}>✕</button>
            )}
          </div>
        </div>
        <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: "16px 28px", borderTop: `1px solid ${C.gray200}`, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", background: C.gray50, borderRadius: "0 0 16px 16px", flexShrink: 0 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Modal (confirm / warning) ────────────────────────────────────
export function Modal({ type = "confirm", title, message, onConfirm, onClose }) {
  if (!title) return null;
  const isWarn = type === "warning";
  return (
    <ModalShell
      title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 34, height: 34, borderRadius: 10, background: isWarn ? C.redBg : "#FFF7ED", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{isWarn ? "🚫" : "🗑️"}</span>{title}</span>}
      onClose={onClose} maxWidth={420}
      footer={isWarn ? (<Btn variant="secondary" onClick={onClose}>Close</Btn>) : (<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={onConfirm} style={{ background: C.red, color: C.white, border: "none" }}>Yes, Delete</Btn></>)}
    >
      <div style={{ fontSize: 14, color: C.gray600, lineHeight: 1.7 }}>{message}</div>
    </ModalShell>
  );
}

// ─── Company Form Modal ───────────────────────────────────────────
export function CompanyFormModal({ company, onConfirm, onClose }) {
  const isEdit = !!company;
  const [name, setName] = useState(company?.name || "");
  const [price, setPrice] = useState("");
  const [remarks, setRemarks] = useState(company?.remarks || "");
  const [error, setError] = useState("");

  const handle = () => {
    if (!name.trim()) { setError("Company name is required."); return; }
    if (!isEdit && (!price || Number(price) <= 0)) { setError("A valid opening price is required."); return; }
    setError("");
    onClose();
    onConfirm({ name: name.trim(), price: isEdit ? undefined : Number(price), remarks });
  };

  return (
    <ModalShell
      title={isEdit ? "✏️ Edit Company" : "➕ Register New Company"}
      subtitle={isEdit ? "To change the price use the 💰 Price button" : undefined}
      onClose={onClose} maxWidth={460}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handle} icon="💾">{isEdit ? "Save Changes" : "Register Company"}</Btn></>}
    >
      {error && <div style={{ background: C.redBg, border: `1px solid #FECACA`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, fontWeight: 500 }}>⚠️ {error}</div>}
      <FInput label="Company Name" required value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="e.g. Tanzania Breweries" autoFocus />
      {!isEdit && <FInput label="Opening Price (TZS)" required type="number" value={price} onChange={e => { setPrice(e.target.value); setError(""); }} placeholder="0.00" />}
      <FTextarea label="Remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional notes..." style={{ minHeight: 72 }} />
    </ModalShell>
  );
}

// ─── Update Price Modal ───────────────────────────────────────────
export function UpdatePriceModal({ company, onConfirm, onClose }) {
  const nowDate = new Date();
  const localDatetime = new Date(nowDate.getTime() - nowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [newPrice, setNewPrice] = useState("");
  const [datetime, setDatetime] = useState(localDatetime);
  const [reason, setReason] = useState("Normal Price Change");
  const [error, setError] = useState("");

  if (!company) return null;

  const handleConfirm = () => {
    if (!newPrice || isNaN(Number(newPrice)) || Number(newPrice) <= 0) { setError("Please enter a valid price greater than 0."); return; }
    if (Number(company.price) !== 0 && Number(newPrice) === Number(company.price)) { setError("No change detected — the new price is the same as the current price."); return; }
    setError("");
    onConfirm({ newPrice: Number(newPrice), datetime, reason });
  };

  const changeAmt = newPrice ? Number(newPrice) - Number(company.price) : null;
  const changePct = changeAmt !== null && Number(company.price) !== 0 ? (changeAmt / Number(company.price)) * 100 : null;
  const up = changeAmt !== null ? changeAmt >= 0 : null;

  return (
    <ModalShell
      title="💰 Update Share Price"
      subtitle={<span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{company.name}</span>}
      onClose={onClose} maxWidth={440}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handleConfirm} icon="💾">Update Price</Btn></>}
    >
      <div style={{ background: C.gray50, borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Price</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.navy }}>TZS {fmt(company.price)}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>New Price (TZS) <span style={{ color: C.red }}>*</span></label>
        <input type="number" value={newPrice} onChange={e => { setNewPrice(e.target.value); setError(""); }} placeholder="Enter new price..." autoFocus
          style={{ border: `1.5px solid ${error ? C.red : C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 15, fontWeight: 700, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box" }}
          onFocus={e => !error && (e.target.style.borderColor = C.green)}
          onBlur={e => !error && (e.target.style.borderColor = C.gray200)} />
        {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      </div>
      {changeAmt !== null && newPrice && (
        <div style={{ background: up ? C.greenBg : C.redBg, border: `1px solid ${up ? "#BBF7D0" : "#FECACA"}`, borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: C.gray600, fontWeight: 600 }}>Price Movement</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: up ? C.green : C.red }}>{up ? "▲" : "▼"} TZS {fmt(Math.abs(changeAmt))}</span>
            <span style={{ background: up ? C.green : C.red, color: C.white, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{up ? "+" : ""}{changePct?.toFixed(2)}%</span>
          </div>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date & Time</label>
        <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)}
          style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box" }}
          onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Reason</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for price change..."
          style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box" }}
          onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
      </div>
    </ModalShell>
  );
}

// ─── Price History Modal ──────────────────────────────────────────
export function PriceHistoryModal({ company, history, onClose }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  if (!company) return null;

  // Remove zero-change noise (price set to same value) — keep initial entries
  const meaningful = history.filter(h => {
    const isInitial = !h.old_price || Number(h.old_price) === 0;
    if (isInitial) return true;
    return Number(h.change_amount) !== 0;
  });

  // Filter to current month only
  const now       = new Date();
  const thisMonth = meaningful.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const monthLabel  = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalPages  = Math.ceil(thisMonth.length / PAGE_SIZE);
  const pagedHistory = thisMonth.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const PaginationBar = () => totalPages <= 1 ? null : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 0 2px" }}>
      <button onClick={() => setPage(1)} disabled={page === 1}
        style={{ padding: "4px 9px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>«</button>
      <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
        style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: page === 1 ? C.gray400 : C.text, cursor: page === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>‹ Prev</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1)
        .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
        .reduce((acc, p, i, arr) => { if (i > 0 && arr[i-1] !== p - 1) acc.push("..."); acc.push(p); return acc; }, [])
        .map((p, i) => p === "..." ? (
          <span key={`d${i}`} style={{ fontSize: 12, color: C.gray400 }}>…</span>
        ) : (
          <button key={p} onClick={() => setPage(p)}
            style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${p === page ? C.navy : C.gray200}`, background: p === page ? C.navy : C.white, color: p === page ? C.white : C.text, cursor: "pointer", fontSize: 12, fontWeight: p === page ? 700 : 500, fontFamily: "inherit", minWidth: 30 }}>{p}</button>
        ))}
      <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
        style={{ padding: "4px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>Next ›</button>
      <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
        style={{ padding: "4px 9px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: page === totalPages ? C.gray400 : C.text, cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>»</button>
    </div>
  );

  return (
    <ModalShell
      title="📈 Price History"
      subtitle={<span style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{company.name}</span>}
      headerRight={<div style={{ textAlign: "right" }}><div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current Price</div><div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>TZS {fmt(company.price)}</div></div>}
      onClose={onClose} maxWidth={900}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ fontSize: 12, color: C.gray400 }}>
            {thisMonth.length} update{thisMonth.length !== 1 ? "s" : ""} in {monthLabel}
            {thisMonth.length !== meaningful.length && <span style={{ marginLeft: 6, color: C.gray400 }}>· {meaningful.length} total all-time</span>}
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      }
    >
      {/* Month filter banner */}
      <div style={{ background: "linear-gradient(135deg, #EFF6FF, #DBEAFE)", border: `1px solid #BFDBFE`, borderRadius: 10, padding: "9px 14px", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14 }}>📅</span>
        <div style={{ fontSize: 12, color: "#1D4ED8", fontWeight: 600 }}>
          Showing changes for <strong>{monthLabel}</strong>
          {thisMonth.length === 0 && " — no changes this month"}
        </div>
      </div>

      {thisMonth.length === 0 ? (
        <div style={{ textAlign: "center", padding: "30px 20px", color: C.gray400 }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📭</div>
          <div style={{ fontWeight: 600 }}>No price changes in {monthLabel}</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {meaningful.length > 0 ? `${meaningful.length} update${meaningful.length !== 1 ? "s" : ""} exist in previous months` : "No price history recorded yet"}
          </div>
        </div>
      ) : (
        <div style={{ margin: "0 -28px", overflowX: "auto" }}>
          {totalPages > 1 && (
            <div style={{ padding: "0 28px", display: "flex", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 12, color: C.gray400, paddingBottom: 6 }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, thisMonth.length)} of {thisMonth.length}
              </div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: 36  }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {["#", "Date & Time", "Old Price", "New Price", "Change", "Change %", "Notes", "Updated By"].map(h => (
                  <th key={h} style={{ padding: "11px 12px", textAlign: ["Old Price", "New Price", "Change", "Change %"].includes(h) ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${C.gray200}`, borderTop: `1px solid ${C.gray200}`, whiteSpace: "nowrap", background: C.gray50 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((h, i) => {
                const globalIdx    = (page - 1) * PAGE_SIZE + i;
                const isFirstEntry = !h.old_price || Number(h.old_price) === 0;
                const up = !isFirstEntry && h.change_amount >= 0;
                return (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${C.gray100}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 12px", color: C.gray400, fontWeight: 600 }}>{globalIdx + 1}</td>
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: C.text }}>
                        {new Date(h.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        <span style={{ color: C.gray400, margin: "0 5px" }}>|</span>
                        {new Date(h.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", color: C.gray600 }}>
                      {isFirstEntry ? <span style={{ color: C.gray400 }}>—</span> : fmt(h.old_price)}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: C.text }}>{fmt(h.new_price)}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: isFirstEntry ? C.gray400 : up ? C.green : C.red }}>
                      {isFirstEntry ? <span style={{ color: C.gray400 }}>Initial</span> : <>{up ? "▲" : "▼"} {fmt(Math.abs(h.change_amount))}</>}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      {isFirstEntry
                        ? <span style={{ color: C.gray400, fontSize: 12 }}>—</span>
                        : <span style={{ background: up ? C.greenBg : C.redBg, color: up ? C.green : C.red, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{up ? "+" : ""}{Number(h.change_percent).toFixed(2)}%</span>}
                    </td>
                    <td style={{ padding: "10px 12px", color: C.gray600, maxWidth: 160 }}>{h.notes || <span style={{ color: C.gray400 }}>—</span>}</td>
                    <td style={{ padding: "10px 12px" }}><span style={{ background: C.navy + "12", color: C.navy, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{h.updated_by}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "0 28px" }}><PaginationBar /></div>
        </div>
      )}
    </ModalShell>
  );
}

// ─── Transaction Form Modal ───────────────────────────────────────
export function TransactionFormModal({ transaction, companies, onConfirm, onClose }) {
  const today = new Date().toISOString().split("T")[0];
  const isEdit = !!transaction;
  const [form, setForm] = useState(
    transaction
      ? { date: transaction.date, companyId: transaction.company_id, type: transaction.type, qty: transaction.qty, price: transaction.price, fees: transaction.fees || "", remarks: transaction.remarks || "" }
      : { date: today, companyId: "", type: "Buy", qty: "", price: "", fees: "", remarks: "" }
  );
  const [error, setError] = useState("");

  const total = (Number(form.qty) || 0) * (Number(form.price) || 0);
  const grandTotal = total + (Number(form.fees) || 0);

  const handle = () => {
    if (!form.date || !form.companyId || !form.qty || !form.price) { setError("Please fill in Date, Company, Quantity and Price per Share."); return; }
    setError("");
    onConfirm({ ...form, total, grandTotal });
  };

  return (
    <ModalShell
      title={isEdit ? "✏️ Edit Transaction" : "📝 Record New Transaction"}
      subtitle={isEdit ? "Update the details below and save" : "Record a new buy or sell order"}
      onClose={onClose} maxWidth={620}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handle} icon="💾">{isEdit ? "Save Changes" : "Record Transaction"}</Btn></>}
    >
      {error && <div style={{ background: C.redBg, border: `1px solid #FECACA`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, fontWeight: 500 }}>⚠️ {error}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <FInput label="Date" required type="date" value={form.date} onChange={e => { setForm(f => ({ ...f, date: e.target.value })); setError(""); }} />
        <FSelect label="Company" required value={form.companyId} onChange={e => { setForm(f => ({ ...f, companyId: e.target.value })); setError(""); }}>
          <option value="">Select company...</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FSelect>
        <FSelect label="Transaction Type" required value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          <option value="Buy">🟢 Buy</option>
          <option value="Sell">🔴 Sell</option>
        </FSelect>
        <FInput label="Quantity" required type="number" value={form.qty} onChange={e => { setForm(f => ({ ...f, qty: e.target.value })); setError(""); }} placeholder="0" />
        <FInput label="Price per Share (TZS)" required type="number" value={form.price} onChange={e => { setForm(f => ({ ...f, price: e.target.value })); setError(""); }} placeholder="0.00" />
        <FInput label="Other Fees (TZS)" type="number" value={form.fees} onChange={e => setForm(f => ({ ...f, fees: e.target.value }))} placeholder="0.00" />
      </div>
      {total > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: 16 }}>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Shares Total</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>TZS {fmt(total)}</div></div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Fees</div><div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>TZS {fmt(form.fees || 0)}</div></div>
          <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Grand Total</div><div style={{ fontSize: 14, fontWeight: 800, color: C.green, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>TZS {fmt(grandTotal)}</div></div>
        </div>
      )}
      <FTextarea label="Remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes..." style={{ minHeight: 56 }} />
    </ModalShell>
  );
}

// ─── Import Transactions Modal ────────────────────────────────────
export function ImportTransactionsModal({ companies, onImport, onClose }) {
  const [step, setStep]           = useState("upload");
  const [rows, setRows]           = useState([]);
  const [errors, setErrors]       = useState([]);
  const [fileName, setFileName]   = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [parsing, setParsing]     = useState(false);
  const fileRef = useRef(null);
  const MAX_ROWS = 500;

  const downloadTemplate = () => {
    const link = document.createElement("a");
    link.href = "/Transactions_Import_Template.xlsx";
    link.download = "Transactions_Import_Template.xlsx";
    link.click();
  };

  const resetToUpload = () => {
    setStep("upload"); setRows([]); setErrors([]); setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const REQUIRED_SHEET = "Transactlons."; // exact sheet name of official DSE template (includes dot)

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { alert("Please select an Excel file (.xlsx or .xls)"); return; }
    setFileName(file.name);
    setParsing(true);
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: "array", cellDates: true });

      // ── Sheet name check — must use the official import template ───
      if (!wb.SheetNames.includes(REQUIRED_SHEET)) {
        alert("Invalid file.\n\nPlease use the official Investors Portal import template.\nCustom Excel files are not accepted.");
        setParsing(false);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      const ws = wb.Sheets[REQUIRED_SHEET];

      // ── Parse as raw 2D array (no auto-header detection) ───────────
      // Template structure: rows 1-5 are headers, data is rows 6-505, row 506 is empty
      // Column 8 (Total Amount) is auto-calculated in Excel — ignored on import
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, cellDates: true });

      const PLACEHOLDER  = "select company name";
      const END_MARKER   = "end of importation template"; // row 506 in template

      const dataRows = [];
      for (let i = 5; i < raw.length; i++) {
        const row       = raw[i];
        const firstCell = String(row[0] ?? "").trim().toLowerCase();

        // Stop at end-of-template marker (row 506)
        if (firstCell.includes(END_MARKER)) break;

        // Skip completely empty rows
        const hasContent = row.slice(0, 7).some(cell => String(cell ?? "").trim() !== "");
        if (!hasContent) continue;

        // Skip placeholder/example row
        const companyCell = String(row[1] ?? "").trim().toLowerCase();
        if (companyCell === PLACEHOLDER) continue;

        dataRows.push({ rowNum: i + 1, cells: row }); // rowNum = 1-based Excel row number
      }

      if (dataRows.length > MAX_ROWS) {
        alert(`This file has ${dataRows.length} data rows. Maximum allowed is ${MAX_ROWS} rows per import.`);
        setParsing(false);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }

      if (dataRows.length === 0) { setRows([]); setErrors([]); setStep("preview"); setParsing(false); return; }

      // ── Parse and validate each row ────────────────────────────────
      const parsed = [], errs = [];

      dataRows.forEach(({ rowNum, cells }) => {
        const getRaw = (idx) => cells[idx];
        const get    = (idx) => String(cells[idx] ?? "").trim();

        const dateRaw = getRaw(0);
        const company = get(1);
        const type    = get(2);
        const qty     = parseFloat(get(3));
        const price   = parseFloat(get(4));
        const fees    = parseFloat(get(5)) || 0;
        const remarks = get(6);
        // Column 8 (index 7) = Total Amount — auto-calculated in Excel, ignored here

        const rowErrs = [];

        // Date
        if (!dateRaw || String(dateRaw).trim() === "") rowErrs.push("Missing date");

        // Company
        if (!company) rowErrs.push("Missing company name");

        // Type
        if (!["Buy", "Sell"].includes(type)) rowErrs.push("Type must be exactly 'Buy' or 'Sell'");

        // Quantity
        if (isNaN(qty) || qty <= 0) rowErrs.push("Invalid quantity");

        // Price
        if (isNaN(price) || price <= 0) rowErrs.push("Invalid price");

        // Company lookup
        const matchedCompany = company
          ? companies.find(c => c.name.toLowerCase().trim() === company.toLowerCase())
          : null;
        if (company && !matchedCompany) rowErrs.push(`Company "${company}" not found in system`);

        // Parse date
        let date = "";
        if (dateRaw instanceof Date && !isNaN(dateRaw)) {
          date = `${dateRaw.getFullYear()}-${String(dateRaw.getMonth()+1).padStart(2,"0")}-${String(dateRaw.getDate()).padStart(2,"0")}`;
        } else if (typeof dateRaw === "number") {
          const d = new Date(Math.round((dateRaw - 25569) * 86400 * 1000));
          date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        } else {
          const dateStr = String(dateRaw).trim();
          if (dateStr.includes("/")) {
            const parts = dateStr.split("/");
            if (parts.length === 3) {
              const [dd, mm, yyyy] = parts;
              date = `${yyyy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`;
            }
          } else {
            date = dateStr;
          }
        }

        if (!date && rowErrs.filter(e => e === "Missing date").length === 0) rowErrs.push("Invalid date format");

        if (rowErrs.length) {
          errs.push({ row: rowNum, errors: rowErrs });
        } else {
          parsed.push({
            date,
            company_id:   matchedCompany.id,
            company_name: matchedCompany.name,
            type, qty, price,
            fees:    fees || null,
            remarks: remarks || null,
            total:   qty * price,
          });
        }
      });

      setRows(parsed); setErrors(errs); setStep("preview");
    } catch (err) {
      alert("Failed to read file: " + err.message);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true);
    setProgress(0);

    // Animate progress bar 0 → 85% while waiting for server
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 6 + 2; // 2–8% increments
      if (current >= 85) { current = 85; clearInterval(interval); }
      setProgress(Math.round(current));
    }, 180);

    try {
      await onImport(rows);
      clearInterval(interval);
      setProgress(100);
      await new Promise(r => setTimeout(r, 500)); // briefly show 100%
      onClose();
    } catch (e) {
      clearInterval(interval);
      setProgress(0);
      alert("Import failed: " + e.message);
    } finally {
      setImporting(false);
    }
  };

  const UploadStep = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ background: C.gray50, border: `1.5px solid ${C.gray200}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 42, height: 42, background: `${C.green}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📥</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Step 1 — Download Sample Template</div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 3, lineHeight: 1.5 }}>Download the Excel template, fill in your transactions, and save the file.</div>
            <button onClick={downloadTemplate} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: C.green, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }} onMouseEnter={e => e.currentTarget.style.opacity = "0.9"} onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
              <span>⬇️</span> Download Import_Transactions_Template.xlsx
            </button>
          </div>
        </div>
      </div>
      <div style={{ background: C.gray50, border: `1.5px dashed ${C.gray300}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 42, height: 42, background: `${C.navy}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {parsing ? <div style={{ width: 20, height: 20, border: `2px solid rgba(11,31,58,0.2)`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : "📂"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Step 2 — Select File to Import</div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 3, lineHeight: 1.5 }}>Select your filled Excel file (.xlsx). Maximum {MAX_ROWS} rows per import.</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            <button onClick={() => !parsing && fileRef.current?.click()} disabled={parsing} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: C.navy, color: C.white, border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: parsing ? "wait" : "pointer", opacity: parsing ? 0.7 : 1, fontFamily: "inherit" }}>
              <span>📁</span> {parsing ? "Reading file..." : fileName || "Choose Excel File..."}
            </button>
          </div>
        </div>
      </div>
      <div style={{ background: "#FEF9EC", border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
        <div style={{ fontSize: 13, color: "#92400E", lineHeight: 1.7 }}>
          Read the <strong>Instructions</strong> sheet inside the template, fill in your transactions in the <strong>Transactlons</strong> sheet, save the file, then come back here to upload it.
        </div>
      </div>
    </div>
  );

  const PAGE_SIZE = 10;
  const [previewPage, setPreviewPage] = useState(1);
  const totalPages   = Math.ceil(rows.length / PAGE_SIZE);
  const pagedRows    = rows.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

  const PreviewStep = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{rows.length}</div><div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginTop: 2 }}>Valid Rows</div></div>
        <div style={{ background: errors.length ? C.redBg : C.gray50, border: `1px solid ${errors.length ? C.red : C.gray200}33`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: errors.length ? C.red : C.gray400 }}>{errors.length}</div><div style={{ fontSize: 11, color: errors.length ? C.red : C.gray400, fontWeight: 600, marginTop: 2 }}>Rows with Errors</div></div>
        <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{rows.length + errors.length}</div><div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, marginTop: 2 }}>Total Rows Found</div></div>
      </div>
      {errors.length > 0 && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "12px 16px", maxHeight: 120, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>⚠️ {errors.length} row(s) will be skipped:</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}><strong>Row {e.row}:</strong> {e.errors.join(" · ")}</div>)}
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              ✅ Preview — {rows.length} rows ready to import
            </div>
            {totalPages > 1 && (
              <div style={{ fontSize: 12, color: C.gray400 }}>
                Showing {(previewPage - 1) * PAGE_SIZE + 1}–{Math.min(previewPage * PAGE_SIZE, rows.length)} of {rows.length}
              </div>
            )}
          </div>
          <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  {[["#","4%","center"],["Date","13%","left"],["Company","17%","left"],["Type","10%","left"],["Qty","10%","right"],["Price","14%","right"],["Fees","14%","right"],["Total","18%","right"]].map(([h, w, align]) => (
                    <th key={h} style={{ padding: "8px 10px", color: C.white, fontWeight: 700, fontSize: 11, textAlign: align, whiteSpace: "nowrap", width: w }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedRows.map((r, i) => {
                  const globalIdx   = (previewPage - 1) * PAGE_SIZE + i;
                  const displayDate = r.date && r.date.includes("-") ? r.date.split("-").reverse().join("/") : r.date;
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.gray100}`, background: i % 2 === 0 ? C.white : C.gray50 }}>
                      <td style={{ padding: "7px 10px", color: C.gray400, textAlign: "center" }}>{globalIdx + 1}</td>
                      <td style={{ padding: "7px 10px", color: C.text, whiteSpace: "nowrap" }}>{displayDate}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.company_name}</td>
                      <td style={{ padding: "7px 10px" }}><span style={{ background: r.type === "Buy" ? C.greenBg : C.redBg, color: r.type === "Buy" ? C.green : C.red, padding: "2px 8px", borderRadius: 12, fontWeight: 700, fontSize: 11 }}>{r.type}</span></td>
                      <td style={{ padding: "7px 10px", color: C.text, textAlign: "right" }}>{fmtInt(r.qty)}</td>
                      <td style={{ padding: "7px 10px", color: C.green, fontWeight: 600, textAlign: "right" }}>{fmtInt(r.price)}</td>
                      <td style={{ padding: "7px 10px", color: C.gray600, textAlign: "right" }}>{r.fees ? fmtInt(r.fees) : "—"}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 700, color: r.type === "Buy" ? C.green : r.type === "Sell" ? C.red : C.text, textAlign: "right" }}>{fmtInt(r.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
              <button onClick={() => setPreviewPage(1)} disabled={previewPage === 1}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: previewPage === 1 ? C.gray400 : C.text, cursor: previewPage === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>«</button>
              <button onClick={() => setPreviewPage(p => Math.max(1, p - 1))} disabled={previewPage === 1}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: previewPage === 1 ? C.gray400 : C.text, cursor: previewPage === 1 ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>‹ Prev</button>
              {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - previewPage) <= 1)
                .reduce((acc, p, i, arr) => { if (i > 0 && arr[i-1] !== p-1) acc.push("..."); acc.push(p); return acc; }, [])
                .map((p, i) => p === "..." ? (
                  <span key={`dots-${i}`} style={{ fontSize: 12, color: C.gray400, padding: "0 2px" }}>…</span>
                ) : (
                  <button key={p} onClick={() => setPreviewPage(p)}
                    style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${p === previewPage ? C.navy : C.gray200}`, background: p === previewPage ? C.navy : C.white, color: p === previewPage ? C.white : C.text, cursor: "pointer", fontSize: 12, fontWeight: p === previewPage ? 700 : 500, fontFamily: "inherit", minWidth: 32 }}>{p}</button>
                ))}
              <button onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))} disabled={previewPage === totalPages}
                style={{ padding: "5px 12px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: previewPage === totalPages ? C.gray400 : C.text, cursor: previewPage === totalPages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>Next ›</button>
              <button onClick={() => setPreviewPage(totalPages)} disabled={previewPage === totalPages}
                style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: previewPage === totalPages ? C.gray400 : C.text, cursor: previewPage === totalPages ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit" }}>»</button>
            </div>
          )}
        </div>
      )}
      {rows.length === 0 && (
        <div style={{ textAlign: "center", padding: "30px", color: C.gray400 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>😟</div>
          <div style={{ fontWeight: 600 }}>No valid rows found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{errors.length > 0 ? "Fix the errors above and try again" : "The file appears to be empty"}</div>
        </div>
      )}
    </div>
  );

  return (
    <ModalShell
      title="⬆️ Import Transactions"
      subtitle={importing
        ? `Importing ${rows.length} transaction${rows.length !== 1 ? "s" : ""}… please wait`
        : step === "upload" ? "Upload your filled Excel template" : `Reviewing ${rows.length + errors.length} rows from "${fileName}"`}
      onClose={onClose} maxWidth={640} lockBackdrop={importing}
      footer={
        <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
          {importing && (
            <div style={{ width: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.gray600, marginBottom: 5 }}>
                <span>⏳ Uploading to server…</span>
                <span style={{ fontWeight: 700, color: C.green }}>{progress}%</span>
              </div>
              <div style={{ height: 10, background: C.gray200, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: `linear-gradient(90deg, ${C.green}, ${C.greenLight})`, borderRadius: 99, transition: "width 0.3s ease" }} />
              </div>
              {progress === 100 && (
                <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 5, textAlign: "center" }}>✅ Import complete!</div>
              )}
            </div>
          )}
          {!importing && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div>{step === "preview" && <Btn variant="secondary" onClick={resetToUpload}>← Back</Btn>}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
                {step === "preview" && rows.length > 0 && (
                  <Btn variant="primary" onClick={handleImport} icon="⬆️">
                    {`Import ${rows.length} Transaction${rows.length !== 1 ? "s" : ""}`}
                  </Btn>
                )}
              </div>
            </div>
          )}
        </div>
      }
    >
      {step === "upload" ? <UploadStep /> : <PreviewStep />}
    </ModalShell>
  );
}
