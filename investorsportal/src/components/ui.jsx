// ── src/components/ui.jsx ────────────────────────────────────────
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { Icon } from "../lib/icons";

// ── Theme system re-exports ───────────────────────────────────────
export { useTheme } from "../lib/theme";
import { LIGHT_C, useTheme } from "../lib/theme";

// ── C export (light theme) — for files that don't use theming ─────
// LoginPage, ResetPasswordPage, ProfileSetupPage etc. import C from here
// and always get the light theme, which is correct since those pages
// are not included in the dark-theme rollout.
export const C = LIGHT_C;

// ── Helpers ───────────────────────────────────────────────────────
export const fmt = (n) => {
  const v = Number(n || 0);
  return v % 1 === 0
    ? v.toLocaleString("en-US")
    : v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const fmtInt = (n) => Number(n || 0).toLocaleString("en-US");

export const fmtSmart = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "B";
  if (v >= 1_000_000)     return (v / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "M";
  if (v >= 1_000)         return (v / 1_000).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + "K";
  return v.toLocaleString("en-US");
};

// ── DSE Fee Calculator ─────────────────────────────────────────────
export const calcFees = (tradeValue) => {
  const tv = Number(tradeValue) || 0;
  if (tv <= 0) return { broker: 0, cmsa: 0, dse: 0, csdr: 0, fidelity: 0, total: 0 };
  let brokerBase = 0;
  if      (tv <= 10_000_000) brokerBase = tv * 0.017;
  else if (tv <= 50_000_000) brokerBase = 10_000_000 * 0.017 + (tv - 10_000_000) * 0.015;
  else                        brokerBase = 10_000_000 * 0.017 + 40_000_000 * 0.015 + (tv - 50_000_000) * 0.008;
  const broker   = Math.round(brokerBase  * 1.18);
  const cmsa     = Math.round(tv * 0.0014);
  const dse      = Math.round(tv * 0.0014 * 1.18);
  const csdr     = Math.round(tv * 0.0006 * 1.18);
  const fidelity = Math.round(tv * 0.0002);
  return { broker, cmsa, dse, csdr, fidelity, total: broker + cmsa + dse + csdr + fidelity };
};

// ── Mobile breakpoint hook ────────────────────────────────────────
export const useIsMobile = () => {
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

// ── Spinner ───────────────────────────────────────────────────────
export function Spinner({ size = 18, color = "#fff" }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid rgba(255,255,255,0.3)`,
      borderTop: `2px solid ${color}`,
      borderRadius: "50%",
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Toast ─────────────────────────────────────────────────────────
export function Toast({ msg, type }) {
  const { C } = useTheme();
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: 28, right: 28,
      background: type === "error" ? C.red : C.green,
      color: "#ffffff", padding: "14px 22px", borderRadius: 10,
      fontSize: 14, fontWeight: 500, zIndex: 99999,
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span>{type === "error" ? "✕" : "✓"}</span>{msg}
    </div>
  );
}

// ── StatCard ──────────────────────────────────────────────────────
// Stat card icon badge: pale colored bg per accent, dark gray bold icon
// Each accent maps to a distinct pale pastel that works on both light & dark cards
const STAT_ICON_COLOR = "#374151"; // dark gray (gray-700) for all icons
const PALE_COLORS = {
  blue:   { bg: "#DBEAFE", border: "#BFDBFE" },  // pale blue
  green:  { bg: "#D1FAE5", border: "#A7F3D0" },  // pale green
  red:    { bg: "#FEE2E2", border: "#FECACA" },  // pale red
  amber:  { bg: "#FEF3C7", border: "#FDE68A" },  // pale yellow
  purple: { bg: "#EDE9FE", border: "#DDD6FE" },  // pale purple
  teal:   { bg: "#CCFBF1", border: "#99F6E4" },  // pale teal
};
function statPale(accentHex) {
  if (!accentHex) return PALE_COLORS.green;
  const h = accentHex.toLowerCase();
  if (h.includes("ef44") || h.includes("ef6e") || h === "#dc2626") return PALE_COLORS.red;
  if (h.includes("f59e") || h.includes("f0b4") || h.includes("d976")) return PALE_COLORS.amber;
  if (h.includes("2563") || h.includes("3b6f") || h.includes("0b1f") || h.includes("0a25")) return PALE_COLORS.blue;
  if (h.includes("8b5c") || h.includes("7c3a")) return PALE_COLORS.purple;
  if (h.includes("0d94") || h.includes("14b8")) return PALE_COLORS.teal;
  return PALE_COLORS.green; // default: green-tinted
}

export function StatCard({ label, value, sub, color, icon }) {
  const { C } = useTheme();
  const pale = statPale(color);
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 12, padding: "10px 14px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)", minWidth: 0,
    }}>
      <div style={{
        width: 36, height: 36, background: pale.bg,
        border: `1.5px solid ${pale.border}`,
        borderRadius: 10, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 17, flexShrink: 0,
        color: STAT_ICON_COLOR,
      }}>{icon}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 10, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: C.gray600, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── SectionCard ───────────────────────────────────────────────────
export function SectionCard({ title, subtitle, children }) {
  const { C } = useTheme();
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.gray200}`,
      borderRadius: 12, overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
      flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      {title && (
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.gray100}`, background: C.gray50, flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{subtitle}</div>}
        </div>
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>
  );
}

// ── Form Primitives ───────────────────────────────────────────────
function FormField({ label, required, children, C }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const makeInputStyle = (C) => (readOnly) => ({
  border: `1.5px solid ${C.gray200}`,
  borderRadius: 8, padding: "10px 12px", fontSize: 14,
  outline: "none", background: readOnly ? C.gray50 : C.white,
  color: C.text, width: "100%", boxSizing: "border-box",
  transition: "border-color 0.2s", fontFamily: "inherit",
});

export function FInput({ label, required, ...props }) {
  const { C } = useTheme();
  const inputStyle = makeInputStyle(C);
  return (
    <FormField label={label} required={required} C={C}>
      <input
        {...props}
        style={{ ...inputStyle(props.readOnly), ...props.style }}
        onFocus={e => !props.readOnly && (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)}
      />
    </FormField>
  );
}

export function FSelect({ label, required, children, ...props }) {
  const { C } = useTheme();
  const inputStyle = makeInputStyle(C);
  return (
    <FormField label={label} required={required} C={C}>
      <select
        {...props}
        style={{ ...inputStyle(false), cursor: "pointer", ...props.style }}
        onFocus={e => (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)}
      >
        {children}
      </select>
    </FormField>
  );
}

export function FTextarea({ label, required, ...props }) {
  const { C } = useTheme();
  const inputStyle = makeInputStyle(C);
  return (
    <FormField label={label} required={required} C={C}>
      <textarea
        {...props}
        style={{ ...inputStyle(false), resize: "vertical", minHeight: 72, ...props.style }}
        onFocus={e => (e.target.style.borderColor = C.green)}
        onBlur={e => (e.target.style.borderColor = C.gray200)}
      />
    </FormField>
  );
}

// ── Button ────────────────────────────────────────────────────────
export function Btn({ children, variant = "primary", loading, icon, ...props }) {
  const { C } = useTheme();
  const variants = {
    primary:   { background: `linear-gradient(135deg, ${C.green}, ${C.greenLight})`, color: "#ffffff", border: "none", boxShadow: "0 4px 12px rgba(0,132,61,0.3)" },
    secondary: { background: C.white, color: C.gray800, border: `1.5px solid ${C.gray200}` },
    danger:    { background: C.redBg, color: C.red, border: `1.5px solid ${C.red}40` },
    navy:      { background: `linear-gradient(135deg, ${C.navy}, ${C.navyLight})`, color: "#ffffff", border: "none", boxShadow: "0 4px 12px rgba(11,31,58,0.3)" },
  };
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      style={{
        padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: loading ? "wait" : "pointer", display: "inline-flex",
        alignItems: "center", gap: 7, transition: "opacity 0.2s",
        fontFamily: "inherit", ...variants[variant], ...props.style,
      }}
      onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = "0.88"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
    >
      {loading ? <Spinner size={14} color={variant === "primary" || variant === "navy" ? "#ffffff" : C.green} /> : icon && <span>{icon}</span>}
      {children}
    </button>
  );
}

// ── Action Menu (⋯ dropdown) ──────────────────────────────────────
export function ActionMenu({ actions }) {
  const { C } = useTheme();
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState({ top: 0, left: 0 });
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
      <button
        onClick={handleOpen}
        style={{ width: 40, height: 40, borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: open ? C.gray100 : C.white, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", color: C.gray600 }}
      >⋯</button>
      {open && (
        <div style={{ position: "fixed", top: pos.top, left: pos.left, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 9999, minWidth: 160, overflow: "hidden" }}>
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={() => { setOpen(false); a.onClick(); }}
              style={{ width: "100%", padding: "10px 16px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 500, color: a.danger ? C.red : C.text, textAlign: "left", borderBottom: i < actions.length - 1 ? `1px solid ${C.gray100}` : "none", fontFamily: "inherit" }}
              onMouseEnter={e => e.currentTarget.style.background = a.danger ? C.redBg : C.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "none"}
            >
              <span>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── MODAL SHELL ───────────────────────────────────────────────────
function ModalShell({ title, subtitle, headerRight, onClose, footer, children, maxWidth = 460, maxHeight, lockBackdrop = false }) {
  const { C } = useTheme();
  const isMobile = useIsMobile();

  return (<>
    <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }`}</style>
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(10,37,64,0.56)", backdropFilter: "blur(3px)", zIndex: 9999, display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", padding: isMobile ? 0 : 24 }}
      onClick={e => { if (!lockBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.white,
        borderRadius: isMobile ? "18px 18px 0 0" : 18,
        border: `1.5px solid ${C.gray200}`,
        borderBottom: isMobile ? "none" : undefined,
        width: "100%",
        maxWidth: isMobile ? "100%" : maxWidth,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        animation: "fadeIn 0.2s ease",
        maxHeight: isMobile ? "92vh" : (maxHeight || undefined),
      }}>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`, padding: isMobile ? "18px 20px 14px" : "18px 24px 14px", borderRadius: isMobile ? "18px 18px 0 0" : "18px 18px 0 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3, fontWeight: 600 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 16, flexShrink: 0 }}>
            {headerRight}
            {!lockBackdrop && (
              <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}><Icon name="x" size={16} stroke="#ffffff" sw={2.2} /></button>
            )}
          </div>
        </div>
        <div style={{ padding: isMobile ? "16px 18px" : "20px 28px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto", flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: isMobile ? "12px 18px" : "16px 24px", borderTop: `1px solid ${C.gray200}`, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center", background: C.gray50, borderRadius: isMobile ? 0 : "0 0 18px 18px", flexShrink: 0, position: isMobile ? "sticky" : "static", bottom: 0, zIndex: 2 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  </>);
}

// ── Modal (confirm / warning) ─────────────────────────────────────
export function Modal({ type = "confirm", title, message, onConfirm, onClose }) {
  const { C } = useTheme();
  if (!title) return null;
  const isWarn = type === "warning";
  return (
    <ModalShell
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 40, height: 40, borderRadius: 10, background: isWarn ? C.redBg : "#FFF7ED", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
            {isWarn ? <Icon name="ban" size={18} stroke={C.red} /> : <Icon name="trash" size={18} stroke={C.red} />}
          </span>
          {title}
        </span>
      }
      onClose={onClose}
      maxWidth={420}
      footer={
        isWarn ? (
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        ) : (
          <>
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="danger" onClick={onConfirm} style={{ background: C.red, color: "#ffffff", border: "none" }}>Yes, Delete</Btn>
          </>
        )
      }
    >
      <div style={{ fontSize: 14, color: C.gray600, lineHeight: 1.7 }}>{message}</div>
    </ModalShell>
  );
}

// ── Company Form Modal ────────────────────────────────────────────
export function CompanyFormModal({ company, onConfirm, onClose }) {
  const { C } = useTheme();
  const isEdit = !!company;
  const [name, setName]       = useState(company?.name || "");
  const [price, setPrice]     = useState("");
  const [remarks, setRemarks] = useState(company?.remarks || "");
  const [error, setError]     = useState("");

  const handle = () => {
    if (!name.trim()) { setError("Company name is required."); return; }
    if (!isEdit && (!price || Number(price) <= 0)) { setError("A valid opening price is required."); return; }
    setError("");
    onClose();
    onConfirm({ name: name.trim(), price: isEdit ? undefined : Number(price), remarks });
  };

  return (
    <ModalShell
      title={isEdit ? <><Icon name="edit" size={15} /> Edit Company</> : <><Icon name="plus" size={15} /> Register New Company</>}
      subtitle={isEdit ? <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>To change the price use the <Icon name="dollarSign" size={15} /> Price button</span> : undefined}
      onClose={onClose}
      maxWidth={460}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handle} icon={<Icon name="save" size={14} stroke="#ffffff" />}>{isEdit ? "Save Changes" : "Register Company"}</Btn></>}
    >
      {error && <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.red, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><Icon name="alertTriangle" size={14} stroke={C.red} /> {error}</div>}
      <FInput label="Company Name" required value={name} onChange={e => { setName(e.target.value); setError(""); }} placeholder="e.g. Tanzania Breweries" autoFocus />
      {/* FIX 1: inputMode="decimal" + autoComplete="off" suppresses the iOS/Android
          QuickType autofill bar (Key, Card, Location) on numeric fields.
          Previously type="number" alone triggered the autofill suggestion row. */}
      {!isEdit && <FInput label="Opening Price (TZS)" required type="text" inputMode="decimal" autoComplete="new-password" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-form-type="other" data-lpignore="true" value={price} onChange={e => { setPrice(e.target.value); setError(""); }} placeholder="0.00" />}
      <FInput label="Sector" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="e.g. Banking, Telecom, Energy..." />
    </ModalShell>
  );
}

// ── Update Price Modal ────────────────────────────────────────────
export function UpdatePriceModal({ company, onConfirm, onClose }) {
  const { C } = useTheme();
  const isMobile = useIsMobile();
  const nowDate = new Date();
  const localDatetime = new Date(nowDate.getTime() - nowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const [newPrice, setNewPrice] = useState("");
  const [datetime, setDatetime] = useState(localDatetime);
  const [reason, setReason]     = useState("Normal Price Change");
  const [error, setError]       = useState("");

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

  const fieldStyle = { border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", fontFamily: "inherit", color: C.text, width: "100%", boxSizing: "border-box", background: C.white };

  return (
    <ModalShell
      title={company.name}
      subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={15} /> Update share price</span>}
      headerRight={
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.green }}>TZS {fmt(company.price)}</div>
        </div>
      }
      onClose={onClose}
      maxWidth={440}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handleConfirm} icon={<Icon name="save" size={14} stroke="#ffffff" />}>Update Price</Btn></>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          New Price (TZS) <span style={{ color: C.red }}>*</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          value={newPrice}
          onChange={e => { setNewPrice(e.target.value); setError(""); }}
          placeholder="Enter new price..."
          autoFocus
          style={{ ...fieldStyle, fontSize: 15, fontWeight: 700, border: `1.5px solid ${error ? C.red : C.gray200}` }}
          onFocus={e => !error && (e.target.style.borderColor = C.green)}
          onBlur={e => !error && (e.target.style.borderColor = C.gray200)}
        />
        {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
      </div>

      {changeAmt !== null && newPrice && (
        <div style={{ background: up ? C.greenBg : C.redBg, border: `1px solid ${up ? C.green : C.red}44`, borderRadius: 10, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: C.gray600, fontWeight: 600 }}>Price Movement</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: up ? C.green : C.red }}>{up ? "▲" : "▼"} TZS {fmt(Math.abs(changeAmt))}</span>
            <span style={{ background: up ? C.green : C.red, color: "#ffffff", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>{up ? "+" : ""}{changePct?.toFixed(2)}%</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date & Time</label>
        <input type="datetime-local" value={datetime} onChange={e => setDatetime(e.target.value)} style={fieldStyle} onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Reason</label>
        <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for price change..." style={fieldStyle} onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
      </div>
    </ModalShell>
  );
}

// ── Price History Modal ───────────────────────────────────────────
export function PriceHistoryModal({ company, history, onClose }) {
  const { C } = useTheme();
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  if (!company) return null;

  const meaningful = history.filter(h => {
    const isInitial = !h.old_price || Number(h.old_price) === 0;
    if (isInitial) return true;
    return Number(h.change_amount) !== 0;
  });

  const now       = new Date();
  const thisMonth = meaningful.filter(h => {
    const d = new Date(h.created_at);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  const monthLabel   = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const totalPages   = Math.ceil(thisMonth.length / PAGE_SIZE);
  const pagedHistory = thisMonth.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const btnStyle = (disabled, active) => ({
    padding: "4px 8px", borderRadius: 7, border: `1.5px solid ${active ? C.navy : C.gray200}`,
    background: active ? C.navy : C.white, color: active ? "#ffffff" : disabled ? C.gray400 : C.text,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit", minWidth: 28,
  });

  const PaginationBar = () => totalPages <= 1 ? null : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "space-between", gap: isMobile ? 8 : 10, padding: "8px 0 0", marginTop: 2, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      {!isMobile && <div style={{ fontSize: 12, color: C.gray400, whiteSpace: "nowrap" }}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, thisMonth.length)} of {thisMonth.length}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flex: isMobile ? "0 0 auto" : 1, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <button onClick={() => setPage(1)} disabled={page === 1} style={btnStyle(page === 1, false)}>«</button>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle(page === 1, false)}>‹ Prev</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce((acc, p, i, arr) => { if (i > 0 && arr[i - 1] !== p - 1) acc.push("..."); acc.push(p); return acc; }, [])
          .map((p, i) => p === "..." ? <span key={`dots-${i}`} style={{ fontSize: 12, color: C.gray400, padding: "0 1px" }}>…</span> : (
            <button key={p} onClick={() => setPage(p)} style={btnStyle(false, p === page)}>{p}</button>
          ))}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle(page === totalPages, false)}>Next ›</button>
        <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={btnStyle(page === totalPages, false)}>»</button>
      </div>
    </div>
  );

  const colWidths = isMobile ? ["7%", "37%", "18%", "18%", "20%"] : ["5%", "27%", "15%", "15%", "20%", "18%"];

  return (
    <ModalShell
      title={company.name}
      subtitle={<span style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name="trendingUp" size={13} /> Price history</span>}
      headerRight={
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Current</div>
          <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color: C.green }}>TZS {fmt(company.price)}</div>
        </div>
      }
      onClose={onClose}
      maxWidth={isMobile ? 560 : 680}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.gray400, lineHeight: 1.4 }}>
            {thisMonth.length} update{thisMonth.length !== 1 ? "s" : ""} in {monthLabel}
            {thisMonth.length !== meaningful.length && <span style={{ marginLeft: 6, color: C.gray400 }}>· {meaningful.length} total all-time</span>}
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      }
    >
      {thisMonth.length === 0 ? (
        <div style={{ textAlign: "center", padding: isMobile ? "20px 12px" : "24px 16px", color: C.gray400 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}>📭</div>
          <div style={{ fontWeight: 600 }}>No price changes in {monthLabel}</div>
          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            {meaningful.length > 0 ? `${meaningful.length} update${meaningful.length !== 1 ? "s" : ""} exist in previous months` : "No price history recorded yet"}
          </div>
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 12 : 13, tableLayout: "fixed" }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {["#", "Date & Time", "Old Price", "New Price", "Change", !isMobile && "Updated By"].filter(Boolean).map(h => (
                  <th key={h} style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: ["Old Price", "New Price", "Change"].includes(h) ? "right" : "left", color: C.gray400, fontWeight: 700, fontSize: isMobile ? 10 : 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${C.gray200}`, borderTop: `1px solid ${C.gray200}`, whiteSpace: "nowrap", background: C.gray50 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedHistory.map((h, i) => {
                const globalIdx    = (page - 1) * PAGE_SIZE + i;
                const isFirstEntry = !h.old_price || Number(h.old_price) === 0;
                const up = !isFirstEntry && h.change_amount >= 0;
                const dateText = new Date(h.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
                const timeText = new Date(h.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                return (
                  <tr key={h.id} style={{ borderBottom: `1px solid ${C.gray100}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", color: C.gray400, fontWeight: 600 }}>{globalIdx + 1}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px" }}>
                      <div style={{ fontWeight: 600, color: C.text, whiteSpace: "nowrap", lineHeight: 1.2 }}>{dateText} <span style={{ color: C.gray400 }}>|</span> {timeText}</div>
                    </td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right", color: C.gray600 }}>{isFirstEntry ? <span style={{ color: C.gray400 }}>—</span> : fmt(h.old_price)}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right", fontWeight: 700, color: C.text }}>{fmt(h.new_price)}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right" }}>
                      {isFirstEntry ? <span style={{ fontSize: 11, color: C.gray400 }}>Initial</span> : (
                        <span style={{ background: up ? C.greenBg : C.redBg, color: up ? C.green : C.red, padding: isMobile ? "2px 7px" : "3px 8px", borderRadius: 20, fontSize: isMobile ? 11 : 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {up ? "▲" : "▼"} {Math.abs(Number(h.change_amount)).toLocaleString()}
                        </span>
                      )}
                    </td>
                    {!isMobile && (
                      <td style={{ padding: "9px 10px", textAlign: "left", whiteSpace: "nowrap" }}>
                        {h.updated_by ? <span style={{ fontSize: 11, color: C.gray600, background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 6, padding: "2px 7px" }}>{h.updated_by}</span> : <span style={{ color: C.gray400 }}>—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationBar />
        </>
      )}
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── TRANSACTION FORM MODAL ────────────────────────────────────────
export function TransactionFormModal({ transaction, companies, transactions = [], brokers = [], onConfirm, onClose }) {
  const { C } = useTheme();
  const isMobile = useIsMobile();
  const today  = new Date().toISOString().split("T")[0];
  const isEdit = !!transaction;

  const [form, setForm] = useState(() =>
    transaction
      ? { date: transaction.date, companyId: transaction.company_id, type: transaction.type, qty: String(transaction.qty), price: String(transaction.price), controlNumber: transaction.control_number || "", remarks: transaction.remarks || "", brokerId: transaction.broker_id || "", brokerName: transaction.broker_name || "" }
      : { date: today, companyId: "", type: "Buy", qty: "", price: "", controlNumber: "", remarks: "", brokerId: "", brokerName: "" }
  );
  const [error, setError]                       = useState("");
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  const [companySearch, setCompanySearch]       = useState("");
  const [companyOpen, setCompanyOpen]           = useState(false);
  const companyRef                               = useRef(null);
  const [brokerSearch, setBrokerSearch]         = useState("");
  const [brokerOpen, setBrokerOpen]             = useState(false);
  const brokerRef                               = useRef(null);

  useEffect(() => {
    if (!companyOpen) return;
    const handle = (e) => { if (companyRef.current && !companyRef.current.contains(e.target)) setCompanyOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [companyOpen]);

  useEffect(() => {
    if (!brokerOpen) return;
    const handle = (e) => { if (brokerRef.current && !brokerRef.current.contains(e.target)) setBrokerOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [brokerOpen]);

  const isBuy = form.type === "Buy";
  const tradeValue   = useMemo(() => (Number(form.qty) || 0) * (Number(form.price) || 0), [form.qty, form.price]);
  const feeBreakdown = useMemo(() => calcFees(tradeValue), [tradeValue]);
  const grandTotal   = isBuy ? tradeValue + feeBreakdown.total : tradeValue - feeBreakdown.total;

  const netMap = useMemo(() => {
    const m = {};
    transactions.forEach(t => {
      if (!t.company_id) return;
      m[t.company_id] = (m[t.company_id] || 0) + (t.type === "Buy" ? Number(t.qty || 0) : -Number(t.qty || 0));
    });
    return m;
  }, [transactions]);

  const maxSellQty = form.companyId ? Math.max(0, netMap[form.companyId] || 0) : 0;

  const availableCompanies = useMemo(() => {
    if (isBuy) return companies;
    const ownedIds = new Set(Object.entries(netMap).filter(([, qty]) => qty > 0).map(([id]) => id));
    return ownedIds.size === 0 ? companies : companies.filter(c => ownedIds.has(c.id));
  }, [isBuy, companies, netMap]);

  const isSellFiltered = !isBuy && availableCompanies.length < companies.length;

  const filteredCompanies = useMemo(() => {
    const q = companySearch.trim().toLowerCase();
    if (!q) return availableCompanies;
    return availableCompanies.filter(c => c.name.toLowerCase().includes(q));
  }, [availableCompanies, companySearch]);

  const selectedCompanyName = useMemo(() => companies.find(c => c.id === form.companyId)?.name || "", [companies, form.companyId]);

  const filteredBrokers = useMemo(() => {
    const q = brokerSearch.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter(b => b.broker_name.toLowerCase().includes(q) || b.broker_code.toLowerCase().includes(q));
  }, [brokers, brokerSearch]);

  const handleTypeChange = useCallback((newType) => {
    setForm(f => {
      if (newType === "Sell" && f.companyId) {
        const owned = new Set(Object.entries(netMap).filter(([, qty]) => qty > 0).map(([id]) => id));
        if (owned.size > 0 && !owned.has(f.companyId)) return { ...f, type: newType, companyId: "" };
      }
      return { ...f, type: newType };
    });
    setCompanySearch(""); setError("");
  }, [netMap]);

  const handleSubmit = () => {
    if (!form.date)                              { setError("Date is required."); return; }
    if (!form.companyId)                         { setError("Please select a company."); return; }
    if (!form.brokerId)                          { setError("Please select a broker."); return; }
    if (!form.qty   || Number(form.qty)   <= 0)  { setError("Quantity must be greater than 0."); return; }
    if (!form.price || Number(form.price) <= 0)  { setError("Price per share must be greater than 0."); return; }
    if (!isBuy && Number(form.qty) > maxSellQty) { setError(`You only have ${fmtInt(maxSellQty)} shares to sell.`); return; }
    setError("");
    onConfirm({ date: form.date, companyId: form.companyId, type: form.type, qty: form.qty, price: form.price, fees: feeBreakdown.total, controlNumber: form.controlNumber || null, remarks: form.remarks || null, total: tradeValue, brokerId: form.brokerId, brokerName: form.brokerName });
  };

  const ddStyle = { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 9999, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" };
  const ddSearchStyle = { width: "100%", padding: "7px 10px 7px 28px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", color: C.text, background: C.white };
  const ddItemStyle = (selected) => ({ width: "100%", padding: "9px 14px", border: "none", background: selected ? C.green + "15" : "transparent", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", borderBottom: `1px solid ${C.gray100}` });

  const fieldLabelStyle = { fontSize: 12, fontWeight: 600, color: C.gray600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 };
  const selectBtnStyle = (open) => ({ width: "100%", padding: "10px 36px 10px 12px", borderRadius: 8, textAlign: "left", border: `1.5px solid ${open ? C.green : C.gray200}`, background: C.white, color: C.text, fontSize: 14, fontFamily: "inherit", cursor: "pointer", transition: "border-color 0.2s", position: "relative", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });

  const feeItems = [
    { label: "Broker", value: feeBreakdown.broker, note: "+VAT" },
    { label: "CMSA",   value: feeBreakdown.cmsa,   note: "0.14%" },
    { label: "DSE",    value: feeBreakdown.dse,     note: "+VAT" },
    { label: "CSDR",   value: feeBreakdown.csdr,    note: "+VAT" },
    { label: "Fidelity", value: feeBreakdown.fidelity, note: "0.02%" },
  ];

  const refNoInput = (placeholder = "e.g. REF-2024-001") => (
    <input type="text" value={form.controlNumber} onChange={e => setForm(f => ({ ...f, controlNumber: e.target.value.slice(0, 20) }))} placeholder={placeholder}
      style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", background: C.white, color: C.text, width: "100%", boxSizing: "border-box", fontFamily: "inherit", letterSpacing: "0.04em", transition: "border-color 0.2s" }}
      onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
  );

  return (
    <ModalShell
      title={isEdit ? <><Icon name="edit" size={15} /> Edit Transaction</> : <><Icon name="fileText" size={15} /> Record New Transaction</>}
      subtitle={isEdit ? "Update the details below and save" : "Fees are calculated automatically"}
      onClose={onClose}
      maxWidth={580}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancel</Btn><Btn variant="primary" onClick={handleSubmit} icon={<Icon name="save" size={14} stroke="#ffffff" />}>{isEdit ? "Save Changes" : "Record Transaction"}</Btn></>}
    >
      {error && <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: C.red, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}><Icon name="alertTriangle" size={14} stroke={C.red} /> {error}</div>}

      {/* Row 1: Type · Date · Ref No. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 14 }}>
        <div>
          <div style={fieldLabelStyle}>Type <span style={{ color: C.red }}>*</span></div>
          <select value={form.type} onChange={e => handleTypeChange(e.target.value)}
            style={{ border: `1.5px solid ${C.gray200}`, borderRadius: 8, padding: "10px 12px", fontSize: 14, outline: "none", background: C.white, color: C.text, width: "100%", boxSizing: "border-box", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, transition: "border-color 0.2s" }}
            onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)}>
            <option value="Buy">▲ Buy</option>
            <option value="Sell">▼ Sell</option>
          </select>
        </div>
        <FInput label="Date" required type="date" value={form.date} onChange={e => { setForm(f => ({ ...f, date: e.target.value })); setError(""); }} />
        {!isMobile && (
          <div>
            <div style={fieldLabelStyle}>Reference No.</div>
            {refNoInput("e.g. REF-2024-001")}
          </div>
        )}
      </div>

      {/* Row 2: Company + Ref No. (mobile) */}
      <div style={{ display: isMobile ? "grid" : "block", gridTemplateColumns: isMobile ? "1fr 1fr" : undefined, gap: isMobile ? 12 : undefined, alignItems: "end" }}>
        <div>
          <div style={fieldLabelStyle}>Company <span style={{ color: C.red }}>*</span></div>
          <div ref={companyRef} style={{ position: "relative" }}>
            <button type="button" onClick={() => { setCompanyOpen(o => !o); setCompanySearch(""); }} style={selectBtnStyle(companyOpen)}>
              {form.companyId ? selectedCompanyName : (isSellFiltered ? "Select holding..." : "Select company...")}
              <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{companyOpen ? "▲" : "▼"}</span>
            </button>
            {companyOpen && (
              <div style={ddStyle}>
                <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                    <input autoFocus type="text" value={companySearch} onChange={e => setCompanySearch(e.target.value)} placeholder="Search company..." style={ddSearchStyle} onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
                  </div>
                </div>
                <div style={{ maxHeight: 200, overflowY: "auto" }}>
                  {filteredCompanies.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No companies found</div>
                    : filteredCompanies.map(c => {
                      const isSelected = form.companyId === c.id;
                      return (
                        <button key={c.id} type="button" onClick={() => { setForm(f => ({ ...f, companyId: c.id, qty: "" })); setCompanyOpen(false); setCompanySearch(""); setError(""); }} style={ddItemStyle(isSelected)}
                          onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                          onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{c.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                            {!isBuy && (netMap[c.id] || 0) > 0 && <span style={{ fontSize: 11, color: C.gray400 }}>{fmtInt(netMap[c.id])} shares</span>}
                            {isSelected && <span style={{ color: C.green, fontSize: 13 }}>✓</span>}
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        </div>
        {isMobile && (
          <div>
            <div style={fieldLabelStyle}>Ref No.</div>
            {refNoInput("e.g. REF-001")}
          </div>
        )}
      </div>

      {/* Row 3: Broker */}
      <div>
        <div style={fieldLabelStyle}>
          Broker <span style={{ color: C.red }}>*</span>
          {brokers.length === 0 && <span style={{ fontSize: 10, color: C.gold, fontWeight: 600, background: C.gold + "22", border: `1px solid ${C.gold}44`, borderRadius: 20, padding: "1px 8px", textTransform: "none", letterSpacing: 0 }}>No brokers — ask SA to add</span>}
        </div>
        <div ref={brokerRef} style={{ position: "relative" }}>
          <button type="button" onClick={() => { setBrokerOpen(o => !o); setBrokerSearch(""); }} style={selectBtnStyle(brokerOpen)}>
            {form.brokerId ? (<span style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontWeight: 600 }}>{form.brokerName}</span><span style={{ fontSize: 11, color: C.gray400, background: C.gray100, borderRadius: 5, padding: "1px 6px" }}>{brokers.find(b => b.id === form.brokerId)?.broker_code || ""}</span></span>) : "Select broker..."}
            <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: C.gray400, fontSize: 12, pointerEvents: "none" }}>{brokerOpen ? "▲" : "▼"}</span>
          </button>
          {brokerOpen && (
            <div style={ddStyle}>
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400 }}><Icon name="search" size={13} stroke={C.gray500} /></span>
                  <input autoFocus type="text" value={brokerSearch} onChange={e => setBrokerSearch(e.target.value)} placeholder="Search broker name or code..." style={ddSearchStyle} onFocus={e => (e.target.style.borderColor = C.green)} onBlur={e => (e.target.style.borderColor = C.gray200)} />
                </div>
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {filteredBrokers.length === 0 ? <div style={{ padding: "12px 14px", fontSize: 13, color: C.gray400, textAlign: "center" }}>No brokers found</div>
                  : filteredBrokers.map(b => {
                    const isSelected = form.brokerId === b.id;
                    return (
                      <button key={b.id} type="button" onClick={() => { setForm(f => ({ ...f, brokerId: b.id, brokerName: b.broker_name })); setBrokerOpen(false); setBrokerSearch(""); setError(""); }} style={ddItemStyle(isSelected)}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.gray50; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}>
                        <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? C.green : C.text }}>{b.broker_name}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 11, color: C.gray400, background: C.gray100, borderRadius: 5, padding: "1px 6px", fontWeight: 600 }}>{b.broker_code}</span>
                          {isSelected && <span style={{ color: C.green, fontSize: 13 }}>✓</span>}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Qty · Price
          FIX 2 & 3: inputMode="decimal" + autoComplete="off" on both numeric
          fields suppresses the iOS/Android QuickType autofill bar that was
          showing Key, Card, Location suggestions above the keyboard. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <FInput
            label={!isBuy && maxSellQty > 0 ? `Quantity (max ${fmtInt(maxSellQty)})` : "Quantity (Shares)"}
            required type="text" inputMode="decimal"
            autoComplete="new-password" autoCorrect="off" autoCapitalize="off"
            spellCheck={false} data-form-type="other" data-lpignore="true"
            min="1" max={!isBuy && maxSellQty > 0 ? maxSellQty : undefined}
            value={form.qty} onChange={e => { setForm(f => ({ ...f, qty: e.target.value })); setError(""); }}
            placeholder="0"
            style={!isBuy && form.qty && Number(form.qty) > maxSellQty ? { borderColor: C.red } : {}}
          />
          {!isBuy && form.qty && Number(form.qty) > maxSellQty && maxSellQty > 0 && <div style={{ fontSize: 11, color: C.red, marginTop: 3 }}>⚠ Exceeds your {fmtInt(maxSellQty)} shares</div>}
        </div>
        <FInput
          label="Price per Share (TZS)" required type="text" inputMode="decimal"
          autoComplete="new-password" autoCorrect="off" autoCapitalize="off"
          spellCheck={false} data-form-type="other" data-lpignore="true"
          min="0.01" value={form.price}
          onChange={e => { setForm(f => ({ ...f, price: e.target.value })); setError(""); }}
          placeholder="0.00"
        />
      </div>

      {/* Fee summary */}
      {tradeValue > 0 && (() => {
        const fmtFee = n => n > 99_000_000 ? fmtSmart(n) : fmt(n);
        return (
          <div style={{ background: isBuy ? C.greenBg : C.redBg, border: `1px solid ${isBuy ? C.green : C.red}44`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ flex: 1.3, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.text, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Trade Value</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{fmtFee(tradeValue)}</div>
              </div>
              <div style={{ color: C.gray400, fontSize: 12, flexShrink: 0 }}>{isBuy ? "+" : "−"}</div>
              <div style={{ flex: 0.9, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.text, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 4 }}>
                  Fees
                  <button type="button" onClick={() => setShowFeeBreakdown(v => !v)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: showFeeBreakdown ? C.navy : C.gray400, padding: 0, lineHeight: 1 }}>
                    {showFeeBreakdown ? "▲" : "ⓘ"}
                  </button>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginTop: 2 }}>{fmtFee(feeBreakdown.total)}</div>
              </div>
              <div style={{ color: C.gray400, fontSize: 12, flexShrink: 0 }}>=</div>
              <div style={{ flex: 1.4, minWidth: 0 }}>
                <div style={{ fontSize: 10, color: C.text, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>{isBuy ? "Total Paid" : "Net Proceeds"}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: isBuy ? C.green : C.red, marginTop: 2 }}>{fmtFee(grandTotal)}</div>
              </div>
            </div>
            {showFeeBreakdown && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${isBuy ? C.green : C.red}44`, display: "flex", gap: 4 }}>
                {feeItems.map(({ label, value, note }) => (
                  <div key={label} style={{ flex: 1, background: isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.7)", borderRadius: 6, padding: "5px 4px", textAlign: "center", border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}>
                    <div style={{ fontSize: 9, fontWeight: 800, color: C.text, textTransform: "uppercase" }}>{label}</div>
                    <div style={{ fontSize: 9, color: C.gray500, fontWeight: 600 }}>{note}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginTop: 2 }}>{fmt(value)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <FTextarea label="Remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes..." style={{ minHeight: 48 }} />
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// ── IMPORT TRANSACTIONS MODAL ─────────────────────────────────────
export function ImportTransactionsModal({ companies, brokers = [], onImport, onClose }) {
  const { C } = useTheme();
  const [step, setStep]           = useState("upload");
  const [rows, setRows]           = useState([]);
  const [errors, setErrors]       = useState([]);
  const [fileName, setFileName]   = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress]   = useState(0);
  const [parsing, setParsing]     = useState(false);
  const fileRef = useRef(null);
  const mountedRef = useRef(true);
  const MAX_ROWS = 500;

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

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

  const REQUIRED_SHEET = "Transactlons.";

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/i)) { alert("Please select an Excel file (.xlsx or .xls)"); return; }
    setFileName(file.name);
    setParsing(true);
    try {
      const data = await file.arrayBuffer();
      const wb   = XLSX.read(data, { type: "array", cellDates: true });
      if (!wb.SheetNames.includes(REQUIRED_SHEET)) {
        alert("Invalid file.\n\nPlease use the official Investors Portal import template.\nCustom Excel files are not accepted.");
        setParsing(false);
        if (fileRef.current) fileRef.current.value = "";
        return;
      }
      const ws  = wb.Sheets[REQUIRED_SHEET];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true, cellDates: true });
      const PLACEHOLDER = "select company name";
      const END_MARKER  = "end of importation template";
      const dataRows    = [];
      for (let i = 5; i < raw.length; i++) {
        const row = raw[i];
        const firstCell = String(row[0] ?? "").trim().toLowerCase();
        if (firstCell.includes(END_MARKER)) break;
        if (!row.slice(0, 10).some(cell => String(cell ?? "").trim() !== "")) continue;
        if (String(row[1] ?? "").trim().toLowerCase() === PLACEHOLDER) continue;
        dataRows.push({ rowNum: i + 1, cells: row });
      }
      if (dataRows.length > MAX_ROWS) { alert(`This file has ${dataRows.length} data rows. Maximum allowed is ${MAX_ROWS} rows per import.`); setParsing(false); if (fileRef.current) fileRef.current.value = ""; return; }
      if (dataRows.length === 0) { setRows([]); setErrors([]); setStep("preview"); setParsing(false); return; }
      const parsed = [], errs = [];
      dataRows.forEach(({ rowNum, cells }) => {
        const getRaw = (idx) => cells[idx];
        const get    = (idx) => String(cells[idx] ?? "").trim();
        const dateRaw = getRaw(0); const company = get(1); const type = get(2);
        const qty = parseFloat(get(3)); const price = parseFloat(get(4));
        const brokerRaw = get(7); const controlNumber = get(8).slice(0, 20) || null;
        const remarks = get(9);
        const rowErrs = [];
        if (!dateRaw || String(dateRaw).trim() === "") rowErrs.push("Missing date");
        if (!company)                                  rowErrs.push("Missing company name");
        if (!["Buy", "Sell"].includes(type))           rowErrs.push("Type must be exactly 'Buy' or 'Sell'");
        if (isNaN(qty)   || qty   <= 0)                rowErrs.push("Invalid quantity");
        if (isNaN(price) || price <= 0)                rowErrs.push("Invalid price");
        const matchedCompany = company ? companies.find(c => c.name.toLowerCase().trim() === company.toLowerCase().trim()) : null;
        if (company && !matchedCompany) rowErrs.push(`Company "${company}" not found in system`);
        const matchedBroker = brokerRaw ? brokers.find(b => b.broker_name.toLowerCase().trim() === brokerRaw.toLowerCase().trim() || b.broker_code.toLowerCase().trim() === brokerRaw.toLowerCase().trim()) : null;
        if (!brokerRaw) rowErrs.push("Missing broker — add broker name or code in column H");
        else if (!matchedBroker) rowErrs.push(`Broker "${brokerRaw}" not found — use exact name or code`);
        let date = "";
        if (dateRaw instanceof Date && !isNaN(dateRaw)) {
          date = `${dateRaw.getFullYear()}-${String(dateRaw.getMonth()+1).padStart(2,"0")}-${String(dateRaw.getDate()).padStart(2,"0")}`;
        } else if (typeof dateRaw === "number") {
          const d = new Date(Math.round((dateRaw - 25569) * 86400 * 1000));
          date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        } else {
          const dateStr = String(dateRaw).trim();
          if (dateStr.includes("/")) { const parts = dateStr.split("/"); if (parts.length === 3) { const [dd, mm, yyyy] = parts; date = `${yyyy}-${String(mm).padStart(2,"0")}-${String(dd).padStart(2,"0")}`; } }
          else { date = dateStr; }
        }
        if (!date && !rowErrs.includes("Missing date")) rowErrs.push("Invalid date format");
        if (rowErrs.length) { errs.push({ row: rowNum, errors: rowErrs }); }
        else {
          const tradeValue = qty * price;
          parsed.push({ date, company_id: matchedCompany.id, company_name: matchedCompany.name, type, qty, price, fees: calcFees(tradeValue).total, total: tradeValue, broker_id: matchedBroker.id, broker_name: matchedBroker.broker_name, control_number: controlNumber || null, remarks: remarks || null });
        }
      });
      if (mountedRef.current) { setRows(parsed); setErrors(errs); setStep("preview"); }
    } catch (err) {
      if (mountedRef.current) alert("Failed to read file: " + err.message);
    } finally {
      if (mountedRef.current) setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!rows.length) return;
    setImporting(true); setProgress(0);
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 6 + 2;
      if (current >= 85) { current = 85; clearInterval(interval); }
      if (mountedRef.current) setProgress(Math.round(current));
    }, 180);
    try {
      await onImport(rows);
      if (mountedRef.current) { clearInterval(interval); setProgress(100); await new Promise(r => setTimeout(r, 500)); onClose(); }
    } catch (e) {
      if (mountedRef.current) { clearInterval(interval); setProgress(0); alert("Import failed: " + e.message); }
    } finally {
      if (mountedRef.current) setImporting(false);
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
            <button onClick={downloadTemplate} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: C.green, color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="download" size={14} /> Download Import_Transactions_Template.xlsx
            </button>
          </div>
        </div>
      </div>
      <div style={{ background: C.gray50, border: `1.5px dashed ${C.gray200}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ width: 42, height: 42, background: `${C.navy}15`, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {parsing ? <div style={{ width: 20, height: 20, border: `2px solid ${C.navy}33`, borderTop: `2px solid ${C.navy}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> : "📂"}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>Step 2 — Select File to Import</div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 3, lineHeight: 1.5 }}>Select your filled Excel file (.xlsx). Maximum {MAX_ROWS} rows per import.</div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} style={{ display: "none" }} />
            <button onClick={() => !parsing && fileRef.current?.click()} disabled={parsing} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: C.navy, color: "#ffffff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: parsing ? "wait" : "pointer", opacity: parsing ? 0.7 : 1, fontFamily: "inherit" }}>
              <span>📁</span> {parsing ? "Reading file..." : fileName || "Choose Excel File..."}
            </button>
          </div>
        </div>
      </div>
      {brokers.length === 0 && (
        <div style={{ background: C.gold + "18", border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ flexShrink: 0 }}><Icon name="alertTriangle" size={14} stroke={C.red || "#EF4444"} /></span>
          <div style={{ fontSize: 13, color: C.gray600, lineHeight: 1.7 }}><strong>No brokers configured.</strong> Ask your SA to add brokers before importing.</div>
        </div>
      )}
      <div style={{ background: C.gold + "18", border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>💡</span>
        <div style={{ fontSize: 13, color: C.gray600, lineHeight: 1.7 }}>Read the <strong>Instructions</strong> sheet inside the template, fill in your transactions in the <strong>Transactlons</strong> sheet, save the file, then come back here to upload it.</div>
      </div>
    </div>
  );

  const PAGE_SIZE  = 10;
  const [previewPage, setPreviewPage] = useState(1);
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pagedRows  = rows.slice((previewPage - 1) * PAGE_SIZE, previewPage * PAGE_SIZE);

  const PREVIEW_COLS = [["#","4%","center"],["Date","11%","left"],["Company","18%","left"],["Type","7%","left"],["Qty","10%","right"],["Price","12%","right"],["Fees","17%","right"],["Total","21%","right"]];

  const PreviewStep = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div style={{ background: C.greenBg, border: `1px solid ${C.green}33`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{rows.length}</div>
          <div style={{ fontSize: 11, color: C.green, fontWeight: 600, marginTop: 2 }}>Valid Rows</div>
        </div>
        <div style={{ background: errors.length ? C.redBg : C.gray50, border: `1px solid ${errors.length ? C.red : C.gray200}33`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: errors.length ? C.red : C.gray400 }}>{errors.length}</div>
          <div style={{ fontSize: 11, color: errors.length ? C.red : C.gray400, fontWeight: 600, marginTop: 2 }}>Rows with Errors</div>
        </div>
        <div style={{ background: C.gray50, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "12px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.navy }}>{rows.length + errors.length}</div>
          <div style={{ fontSize: 11, color: C.gray400, fontWeight: 600, marginTop: 2 }}>Total Rows Found</div>
        </div>
      </div>
      {errors.length > 0 && (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}33`, borderRadius: 10, padding: "12px 16px", maxHeight: 120, overflowY: "auto" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}><Icon name="alertTriangle" size={14} stroke={C.red} /> {errors.length} row(s) will be skipped:</div>
          {errors.map((e, i) => <div key={i} style={{ fontSize: 12, color: C.red, marginBottom: 4 }}><strong>Row {e.row}:</strong> {e.errors.join(" · ")}</div>)}
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>✅ Preview — {rows.length} rows ready to import</div>
            {totalPages > 1 && <div style={{ fontSize: 12, color: C.gray400 }}>Showing {(previewPage - 1) * PAGE_SIZE + 1}–{Math.min(previewPage * PAGE_SIZE, rows.length)} of {rows.length}</div>}
          </div>
          <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, tableLayout: "fixed" }}>
              <thead>
                <tr style={{ background: C.navy }}>
                  {PREVIEW_COLS.map(([h, w, align]) => <th key={h} style={{ padding: "8px 10px", color: "#ffffff", fontWeight: 700, fontSize: 10, textAlign: align, whiteSpace: "nowrap", width: w }}>{h}</th>)}
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
                      <td style={{ padding: "7px 10px", fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.company_name}>{r.company_name}</td>
                      <td style={{ padding: "7px 10px" }}><span style={{ background: r.type === "Buy" ? C.greenBg : C.redBg, color: r.type === "Buy" ? C.green : C.red, padding: "2px 8px", borderRadius: 12, fontWeight: 700 }}>{r.type}</span></td>
                      <td style={{ padding: "7px 10px", color: C.text, textAlign: "right", fontWeight: 600 }}>{fmtInt(r.qty)}</td>
                      <td style={{ padding: "7px 10px", color: C.green, fontWeight: 600, textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>{fmtInt(r.price)}</td>
                      <td style={{ padding: "7px 10px", color: C.gold, fontWeight: 600, textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>{fmtInt(r.fees)}</td>
                      <td style={{ padding: "7px 10px", fontWeight: 800, color: r.type === "Buy" ? C.green : C.red, textAlign: "right", overflow: "hidden", whiteSpace: "nowrap" }}>{fmtInt(r.type === "Buy" ? r.total + r.fees : r.total - r.fees)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 10 }}>
              {[["«", () => setPreviewPage(1), previewPage === 1], ["‹ Prev", () => setPreviewPage(p => Math.max(1, p - 1)), previewPage === 1], ...Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalPages || Math.abs(p - previewPage) <= 1).map(p => [String(p), () => setPreviewPage(p), false, p === previewPage]), ["Next ›", () => setPreviewPage(p => Math.min(totalPages, p + 1)), previewPage === totalPages], ["»", () => setPreviewPage(totalPages), previewPage === totalPages]].map(([label, onClick, disabled, active], i) =>
                label === "..." ? <span key={i} style={{ fontSize: 12, color: C.gray400 }}>…</span> : (
                  <button key={i} onClick={disabled ? undefined : onClick} disabled={disabled}
                    style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${active ? C.navy : C.gray200}`, background: active ? C.navy : C.white, color: disabled ? C.gray400 : active ? "#ffffff" : C.text, cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontWeight: active ? 700 : 500, fontFamily: "inherit", minWidth: 32 }}>
                    {label}
                  </button>
                )
              )}
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
      title={<><Icon name="upload" size={15} /> Import Transactions</>}
      subtitle={importing ? `Importing ${rows.length} transaction${rows.length !== 1 ? "s" : ""}… please wait` : step === "upload" ? "Upload your filled Excel template" : `Reviewing ${rows.length + errors.length} rows from "${fileName}"`}
      onClose={onClose}
      maxWidth={760}
      lockBackdrop={importing}
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
              {progress === 100 && <div style={{ fontSize: 12, color: C.green, fontWeight: 600, marginTop: 5, textAlign: "center" }}>✅ Import complete!</div>}
            </div>
          )}
          {!importing && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
              <div>{step === "preview" && <Btn variant="secondary" onClick={resetToUpload}>← Back</Btn>}</div>
              <div style={{ display: "flex", gap: 10 }}>
                <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
                {step === "preview" && rows.length > 0 && <Btn variant="primary" onClick={handleImport} icon={<Icon name="upload" size={15} />}>{`Import ${rows.length} Transaction${rows.length !== 1 ? "s" : ""}`}</Btn>}
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

// ── Dividend Form Modal ───────────────────────────────────────────
export function DividendFormModal({ company, dividend, onConfirm, onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const isEdit = !!dividend;

  if (!company) return null;

  const [form, setForm] = useState(() =>
    dividend
      ? {
          declarationDate: dividend.declaration_date || "", exDividendDate: dividend.ex_dividend_date || "",
          paymentDate: dividend.payment_date || "", dividendPerShare: String(dividend.dividend_per_share || ""),
          sharesHeld: String(dividend.shares_held || ""), totalAmount: String(dividend.total_amount || ""),
          withholdingTax: String(dividend.withholding_tax || "0"), status: dividend.status || "declared",
          remarks: dividend.remarks || "",
        }
      : {
          declarationDate: "", exDividendDate: "", paymentDate: "",
          dividendPerShare: "", sharesHeld: "", totalAmount: "", withholdingTax: "0",
          status: "declared", remarks: "",
        }
  );
  const [error, setError] = useState("");

  // Auto-calculate total when per-share × shares
  useEffect(() => {
    const dps = Number(form.dividendPerShare) || 0;
    const shares = Number(form.sharesHeld) || 0;
    if (dps > 0 && shares > 0) setForm(f => ({ ...f, totalAmount: String((dps * shares).toFixed(2)) }));
  }, [form.dividendPerShare, form.sharesHeld]);

  const netAmount = useMemo(() => {
    return ((Number(form.totalAmount) || 0) - (Number(form.withholdingTax) || 0)).toFixed(2);
  }, [form.totalAmount, form.withholdingTax]);

  const handleSubmit = () => {
    setError("");
    if (!form.dividendPerShare || Number(form.dividendPerShare) <= 0) return setError("Enter dividend per share");
    if (!form.totalAmount || Number(form.totalAmount) <= 0) return setError("Total amount is required");
    onConfirm({
      company_id: company.id, declaration_date: form.declarationDate || null,
      ex_dividend_date: form.exDividendDate || null, payment_date: form.paymentDate || null,
      dividend_per_share: Number(form.dividendPerShare), shares_held: form.sharesHeld ? Number(form.sharesHeld) : null,
      total_amount: Number(form.totalAmount), withholding_tax: Number(form.withholdingTax) || 0,
      net_amount: Number(netAmount), status: form.status, remarks: form.remarks || null,
    });
  };

  return (
    <ModalShell
      title={company.name}
      subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={15} /> {isEdit ? "Edit dividend record" : "Record dividend income"}</span>}
      onClose={onClose} maxWidth={480}
      footer={<>
        {error && <div style={{ flex: 1, fontSize: 12, color: C.red, fontWeight: 600 }}>{error}</div>}
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={handleSubmit} icon={<Icon name="checkCircle" size={15} />}>{isEdit ? "Update" : "Record Dividend"}</Btn>
      </>}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FInput label="Dividend/Share (TZS)" required type="text" inputMode="decimal" value={form.dividendPerShare} onChange={e => { setForm(f => ({ ...f, dividendPerShare: e.target.value })); setError(""); }} placeholder="0.00" />
        <FInput label="Shares Held" type="text" inputMode="numeric" value={form.sharesHeld} onChange={e => { setForm(f => ({ ...f, sharesHeld: e.target.value })); setError(""); }} placeholder="e.g. 500" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FInput label="Total Amount (TZS)" required type="text" inputMode="decimal" value={form.totalAmount} onChange={e => { setForm(f => ({ ...f, totalAmount: e.target.value })); setError(""); }} placeholder="0.00" />
        <FInput label="Withholding Tax" type="text" inputMode="decimal" value={form.withholdingTax} onChange={e => { setForm(f => ({ ...f, withholdingTax: e.target.value })); setError(""); }} placeholder="0.00" />
      </div>

      {/* Net amount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: isDark ? "rgba(255,255,255,0.04)" : "#f0fdf4", borderRadius: 10, border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "#bbf7d0"}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.gray500 }}>Net Amount</span>
        <span style={{ fontSize: 15, fontWeight: 800, color: C.green }}>TZS {Number(netAmount).toLocaleString()}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FInput label="Declaration Date" type="date" value={form.declarationDate} onChange={e => setForm(f => ({ ...f, declarationDate: e.target.value }))} />
        <FInput label="Ex-Dividend Date" type="date" value={form.exDividendDate} onChange={e => setForm(f => ({ ...f, exDividendDate: e.target.value }))} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <FInput label="Payment Date" type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
        <FSelect label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
          <option value="declared">Declared</option>
          <option value="ex_date_passed">Ex-Date Passed</option>
          <option value="paid">Paid</option>
        </FSelect>
      </div>

      <FInput label="Remarks" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Optional notes..." />
    </ModalShell>
  );
}

// ── Dividend History Modal ────────────────────────────────────────
export function DividendHistoryModal({ companyName, dividends, onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const totalNet = useMemo(() => dividends.reduce((s, d) => s + Number(d.net_amount || d.total_amount || 0), 0), [dividends]);
  const totalPages = Math.ceil(dividends.length / PAGE_SIZE);
  const paged = dividends.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sc = (status) => ({
    declared:       { bg: isDark ? "rgba(251,191,36,0.15)" : "#FEF3C7", color: isDark ? "#fbbf24" : "#92400e", label: "Declared" },
    ex_date_passed: { bg: isDark ? "rgba(96,165,250,0.15)" : "#DBEAFE", color: isDark ? "#60a5fa" : "#1e40af", label: "Ex-Date" },
    paid:           { bg: isDark ? "rgba(52,211,153,0.15)" : "#D1FAE5", color: isDark ? "#34d399" : "#065f46", label: "Paid" },
  }[status] || { bg: C.gray100, color: C.gray500, label: status });

  const colWidths = isMobile
    ? ["7%", "22%", "18%", "18%", "17%", "18%"]
    : ["5%", "18%", "14%", "12%", "14%", "14%", "12%", "11%"];

  const headers = isMobile
    ? ["#", "Payment Date", "Per Share", "Shares", "Net Amt", "Status"]
    : ["#", "Payment Date", "Per Share", "Shares", "Gross Amt", "Tax", "Net Amt", "Status"];

  const btnStyle = (disabled, active) => ({
    padding: "4px 8px", borderRadius: 7, border: `1.5px solid ${active ? C.navy : C.gray200}`,
    background: active ? C.navy : C.white, color: active ? "#ffffff" : disabled ? C.gray400 : C.text,
    cursor: disabled ? "not-allowed" : "pointer", fontSize: 12, fontFamily: "inherit", minWidth: 28,
  });

  const PaginationBar = () => totalPages <= 1 ? null : (
    <div style={{ display: "flex", alignItems: "center", justifyContent: isMobile ? "center" : "space-between", gap: isMobile ? 8 : 10, padding: "8px 0 0", marginTop: 2, flexWrap: isMobile ? "wrap" : "nowrap" }}>
      {!isMobile && <div style={{ fontSize: 12, color: C.gray400, whiteSpace: "nowrap" }}>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, dividends.length)} of {dividends.length}</div>}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, flex: isMobile ? "0 0 auto" : 1, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <button onClick={() => setPage(1)} disabled={page === 1} style={btnStyle(page === 1, false)}>«</button>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle(page === 1, false)}>‹ Prev</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
          .reduce((acc, p, i, arr) => { if (i > 0 && arr[i - 1] !== p - 1) acc.push("..."); acc.push(p); return acc; }, [])
          .map((p, i) => p === "..." ? <span key={`dots-${i}`} style={{ fontSize: 12, color: C.gray400, padding: "0 1px" }}>…</span> : (
            <button key={p} onClick={() => setPage(p)} style={btnStyle(false, p === page)}>{p}</button>
          ))}
        <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle(page === totalPages, false)}>Next ›</button>
        <button onClick={() => setPage(totalPages)} disabled={page === totalPages} style={btnStyle(page === totalPages, false)}>»</button>
      </div>
    </div>
  );

  return (
    <ModalShell
      title={companyName}
      subtitle={<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dollarSign" size={13} /> Dividend history</span>}
      headerRight={
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {dividends.length} dividend{dividends.length !== 1 ? "s" : ""}
          </div>
          <div style={{ fontSize: isMobile ? 16 : 17, fontWeight: 800, color: C.green }}>TZS {totalNet.toLocaleString()}</div>
        </div>
      }
      onClose={onClose}
      maxWidth={isMobile ? 560 : 700}
      maxHeight={isMobile ? "92vh" : "80vh"}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.gray400, lineHeight: 1.4 }}>
            {dividends.length} record{dividends.length !== 1 ? "s" : ""} total
          </div>
          <Btn variant="secondary" onClick={onClose}>Close</Btn>
        </div>
      }
    >
      {dividends.length === 0 ? (
        <div style={{ textAlign: "center", padding: isMobile ? "20px 12px" : "24px 16px", color: C.gray400 }}>
          <div style={{ fontSize: 30, marginBottom: 8 }}><Icon name="dollarSign" size={32} stroke={C.gray300} sw={1.5} /></div>
          <div style={{ fontWeight: 600 }}>No dividends recorded yet</div>
          <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Use "Record Dividend" from the portfolio action menu</div>
        </div>
      ) : (
        <>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: isMobile ? 12 : 13, tableLayout: "fixed" }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {headers.map(h => (
                  <th key={h} style={{
                    padding: isMobile ? "8px 8px" : "9px 10px",
                    textAlign: ["Per Share", "Shares", "Gross Amt", "Tax", "Net Amt"].includes(h) ? "right" : "left",
                    color: C.gray400, fontWeight: 700, fontSize: isMobile ? 10 : 11,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    borderBottom: `1px solid ${C.gray200}`, borderTop: `1px solid ${C.gray200}`,
                    whiteSpace: "nowrap", background: C.gray50,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((d, i) => {
                const globalIdx = (page - 1) * PAGE_SIZE + i;
                const s = sc(d.status);
                const dateText = d.payment_date
                  ? new Date(d.payment_date + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                  : "—";
                return (
                  <tr key={d.id} style={{ borderBottom: `1px solid ${C.gray100}` }}
                    onMouseEnter={e => e.currentTarget.style.background = C.gray50}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", color: C.gray400, fontWeight: 600 }}>{globalIdx + 1}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{dateText}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right", color: C.text }}>{fmt(d.dividend_per_share)}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right", color: C.gray600 }}>{d.shares_held ? Number(d.shares_held).toLocaleString() : "—"}</td>
                    {!isMobile && <td style={{ padding: "9px 10px", textAlign: "right", color: C.text }}>{fmt(d.total_amount)}</td>}
                    {!isMobile && <td style={{ padding: "9px 10px", textAlign: "right", color: Number(d.withholding_tax) > 0 ? C.red : C.gray400 }}>{Number(d.withholding_tax) > 0 ? fmt(d.withholding_tax) : "—"}</td>}
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px", textAlign: "right", fontWeight: 700, color: C.green }}>{fmt(d.net_amount || d.total_amount)}</td>
                    <td style={{ padding: isMobile ? "8px 8px" : "9px 10px" }}>
                      <span style={{ background: s.bg, color: s.color, padding: isMobile ? "2px 7px" : "3px 8px", borderRadius: 20, fontSize: isMobile ? 10 : 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <PaginationBar />
        </>
      )}
    </ModalShell>
  );
}

// ── Reports Modal ─────────────────────────────────────────────────
export function ReportsModal({ onGenerate, onClose }) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();
  const today = new Date().toISOString().split("T")[0];
  const yearAgo = (() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split("T")[0]; })();

  const [reportType, setReportType] = useState("portfolio");
  const [format, setFormat] = useState("pdf");
  const [dateFrom, setDateFrom] = useState(yearAgo);
  const [dateTo, setDateTo] = useState(today);

  const reportTypes = [
    { value: "portfolio", label: "Portfolio Statement", icon: "briefcase", desc: "Current holdings, prices, and gain/loss" },
    { value: "transactions", label: "Transaction History", icon: "list", desc: "All transactions with fee breakdowns" },
    { value: "gainloss", label: "Gain/Loss Report", icon: "trendingUp", desc: "Realized and unrealized gains by company" },
  ];

  const needsDateRange = reportType === "transactions";

  return (
    <ModalShell title="Generate Report" subtitle="Export your portfolio data" onClose={onClose} maxWidth={460}
      footer={<>
        <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={() => onGenerate({ reportType, format, dateFrom, dateTo })} icon={<Icon name="download" size={15} />}>
          Download {format.toUpperCase()}
        </Btn>
      </>}
    >
      {/* Report Type */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em" }}>Report Type</div>
        {reportTypes.map(rt => (
          <button key={rt.value} onClick={() => setReportType(rt.value)}
            style={{
              padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${rt.value === reportType ? C.green : C.gray200}`,
              background: rt.value === reportType ? (isDark ? "rgba(0,132,61,0.08)" : "#f0fdf4") : "transparent",
              cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 12, textAlign: "left",
              transition: "all 0.15s",
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: rt.value === reportType ? (isDark ? "rgba(0,132,61,0.15)" : "#D1FAE5") : C.gray100, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name={rt.icon} size={18} stroke={rt.value === reportType ? C.green : C.gray400} sw={2} />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{rt.label}</div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{rt.desc}</div>
            </div>
            {rt.value === reportType && <Icon name="checkCircle" size={16} stroke={C.green} sw={2.2} style={{ marginLeft: "auto", flexShrink: 0 }} />}
          </button>
        ))}
      </div>

      {/* Date Range (for transactions) */}
      {needsDateRange && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 4 }}>
          <FInput label="From" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <FInput label="To" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      )}

      {/* Format */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.gray500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Format</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ value: "pdf", label: "PDF", icon: "file" }, { value: "xlsx", label: "Excel", icon: "grid" }].map(f => (
            <button key={f.value} onClick={() => setFormat(f.value)}
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 10,
                border: `1.5px solid ${f.value === format ? C.green : C.gray200}`,
                background: f.value === format ? (isDark ? "rgba(0,132,61,0.08)" : "#f0fdf4") : "transparent",
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                fontWeight: 700, fontSize: 13, color: f.value === format ? C.green : C.gray500,
                transition: "all 0.15s",
              }}>
              <Icon name={f.icon} size={16} stroke={f.value === format ? C.green : C.gray400} sw={2} />
              {f.label}
            </button>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
