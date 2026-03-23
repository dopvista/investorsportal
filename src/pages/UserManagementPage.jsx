import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";

// ═══════════════════════════════════════════════════════
// ── MOCKED THEME & API (For Sandbox Preview) ───────────
// ═══════════════════════════════════════════════════════
const LIGHT_C = {
  navy: "#0A2540", navyLight: "#1E3A5F", green: "#059669", greenLight: "#10B981", greenBg: "#ecfdf5",
  red: "#DC2626", redBg: "#fef2f2", gold: "#D97706", gray50: "#F9FAFB", gray100: "#F3F4F6",
  gray200: "#E5E7EB", gray300: "#D1D5DB", gray400: "#9CA3AF", gray500: "#6B7280", gray600: "#4B5563",
  text: "#111827", white: "#ffffff"
};

const useTheme = () => ({ C: LIGHT_C, isDark: false });

// Dummy Data
const dummyRoles = [
  { id: 1, code: "SA", name: "Super Admin", description: "Full system access" },
  { id: 2, code: "AD", name: "Admin", description: "Manage users and standard settings" },
  { id: 3, code: "DE", name: "Data Entrant", description: "Can enter and edit records" },
  { id: 4, code: "VR", name: "Verifier", description: "Verifies entered data" },
];

const dummyUsers = [
  { id: "1", full_name: "Alice Johnson", email: "alice@example.com", phone: "+255712345678", role_code: "SA", is_active: true, cds_number: "CDS-882190", cds_count: 1, account_type: "Individual", assigned_at: new Date().toISOString() },
  { id: "2", full_name: "Bob Smith", email: "bob@example.com", phone: "+255798765432", role_code: "DE", is_active: true, cds_number: "CDS-114892", cds_count: 2, account_type: "Corporate", assigned_at: new Date().toISOString() },
  { id: "3", full_name: "Charlie Davis", email: "charlie@example.com", phone: "+255611223344", role_code: "VR", is_active: false, cds_number: "CDS-992311", cds_count: 1, account_type: "Individual", assigned_at: new Date(Date.now() - 864000000).toISOString() },
  { id: "4", full_name: "Diana Prince", email: "diana@example.com", phone: "", role_code: null, is_active: true, cds_number: null, cds_count: 0, account_type: null, assigned_at: null },
];

// Mock API Functions
const delay = (ms) => new Promise(res => setTimeout(res, ms));
const sbGetAllUsers = async () => { await delay(600); return dummyUsers; };
const sbGetRoles = async () => { await delay(300); return dummyRoles; };
const sbAssignRole = async () => { await delay(500); return true; };
const sbDeactivateRole = async () => { await delay(500); return true; };
const sbAdminCreateUser = async () => { await delay(800); return { user: { id: "new_123" } }; };
const sbGetUserCDS = async () => { await delay(400); return [{ cds_id: 1, cds_number: "CDS-882190", cds_name: "Alice Johnson", is_active: true }]; };
const sbSearchCDS = async () => { await delay(300); return []; };
const sbCreateCDS = async () => { await delay(500); return { cds_id: 99, cds_number: "CDS-NEW123", cds_name: "New Owner" }; };
const sbAssignCDS = async () => { await delay(500); return true; };
const sbRemoveCDS = async () => { await delay(500); return true; };
const sbRemoveCDSFromAdminCascade = async () => { await delay(500); return true; };
const sbGetCDSAssignedUsers = async () => { await delay(300); return []; };


// ═══════════════════════════════════════════════════════
// ── CUSTOM ICON LIBRARY (Replacing Emojis) ─────────────
// ═══════════════════════════════════════════════════════
const Icons = {
  Search: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Close: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Check: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Plus: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  Trash: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>,
  Edit: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  Bank: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="21" width="18" height="2"/><path d="M4 21V9l8-5 8 5v12"/><path d="M8 21v-8"/><path d="M12 21v-8"/><path d="M16 21v-8"/></svg>,
  Users: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  User: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Lock: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  Unlock: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>,
  Mail: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  Alert: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  Shield: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  Key: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>,
  Pen: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
  CheckCircle: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  Ban: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  ChevronDown: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>,
  Sparkles: ({ size=16, color="currentColor", style }) => <svg width={size} height={size} style={style} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3v4M11 5H7M19 14v4M21 16h-4M5 21a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5zM15 11a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4z"/></svg>,
  Spinner: ({ size=16, color="currentColor", style }) => <div style={{ width: size, height: size, border: `2px solid ${color}40`, borderTop: `2px solid ${color}`, borderRadius: "50%", animation: "spin 0.7s linear infinite", ...style }} />
};

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
    return () => { window.removeEventListener("resize", handler); clearTimeout(t); };
  }, []);
  return isMobile;
};

// ── Theming Constants ─────────────────────────────────────────────
const ROLE_META = {
  SA: { label: "Super Admin",  bg: "#0A254015", border: "#0A254030", text: "#0A2540", darkBg: "#4B8FFF22", darkBorder: "#4B8FFF44", darkText: "#7EB3FF" },
  AD: { label: "Admin",        bg: "#10B98115", border: "#10B98130", text: "#059669", darkBg: "#34D39922", darkBorder: "#34D39944", darkText: "#6EE7B7" },
  DE: { label: "Data Entrant", bg: "#3B82F615", border: "#3B82F630", text: "#2563EB", darkBg: "#60A5FA22", darkBorder: "#60A5FA44", darkText: "#93C5FD" },
  VR: { label: "Verifier",     bg: "#8B5CF615", border: "#8B5CF630", text: "#7C3AED", darkBg: "#A78BFA22", darkBorder: "#A78BFA44", darkText: "#C4B5FD" },
  RO: { label: "Read Only",    bg: "#6B728015", border: "#6B728030", text: "#4B5563", darkBg: "#9CA3AF22", darkBorder: "#9CA3AF44", darkText: "#D1D5DB" },
};

const GRID = "40px 1.5fr 1fr 1fr 0.9fr 1.1fr 1.3fr 90px 145px";

function inp(C, extra = {}) {
  return {
    width: "100%", padding: "10px 14px", borderRadius: 10, fontSize: 13,
    border: `1px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
    background: C.white, color: C.text, transition: "all 0.2s ease",
    boxSizing: "border-box", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.02)", ...extra,
  };
}

const focusGreen = (C) => (e) => { e.target.style.borderColor = C.green; e.target.style.boxShadow = `0 0 0 3px ${C.green}15`; };
const blurGray   = (C) => (e) => { e.target.style.borderColor = C.gray200; e.target.style.boxShadow = "inset 0 1px 2px rgba(0,0,0,0.02)"; };

const MOBILE_INPUT_ATTRS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
};

// ── Modal portal ─────────────
const Modal = memo(function Modal({ title, subtitle, onClose, children, footer, maxWidth = 480, closeOnBackdrop = true }) {
  const { C } = useTheme();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  return createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{ position:"fixed", inset:0, zIndex:9999, background:"rgba(10,37,64,0.45)", backdropFilter:"blur(3px)", display:"flex", alignItems: isMobile ? "flex-end" : "center", justifyContent:"center", padding: isMobile ? 0 : 24 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: isMobile ? "20px 20px 0 0" : 16,
          border: `1px solid ${C.gray200}`,
          borderBottom: isMobile ? "none" : undefined,
          width: "100%",
          maxWidth: isMobile ? "100%" : maxWidth,
          maxHeight: isMobile ? "92vh" : "85vh",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          animation: isMobile ? "slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)" : "fadeInScale 0.2s ease",
          fontFamily: "'Inter', system-ui, sans-serif",
          overflow: "hidden"
        }}
      >
        <style>{`
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @keyframes fadeInScale { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
        `}</style>
        <div style={{ background: `linear-gradient(135deg, ${C.navy} 0%, #1a365d 100%)`, padding: isMobile ? "20px 24px 18px" : "24px 30px 20px", display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexShrink:0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color:"#ffffff", fontWeight:800, fontSize:18, display:"flex", alignItems:"center", gap:8 }}>{title}</div>
            {subtitle && <div style={{ color:"rgba(255,255,255,0.65)", fontSize:13, marginTop:4, fontWeight:500 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.12)", border:"none", color:"#ffffff", width:36, height:36, borderRadius:10, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"background 0.2s", marginLeft:16 }} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}>
            <Icons.Close size={18} />
          </button>
        </div>
        <div style={{ padding: isMobile ? "20px 24px" : "24px 30px", overflowY:"auto", flex:1 }}>{children}</div>
        {footer && (
          <div style={{ display:"flex", gap:10, padding: isMobile ? "14px 24px" : "18px 30px", flexShrink:0, background:C.gray50, borderTop:`1px solid ${C.gray200}`, position:"sticky", bottom:0, justifyContent:"flex-end" }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
});

const CancelBtn = memo(function CancelBtn({ onClose }) {
  const { C } = useTheme();
  return (
    <button onClick={onClose}
      style={{ padding:"10px 18px", borderRadius:10, border:`1px solid ${C.gray300}`, background:C.white, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.background = C.gray50; }}
      onMouseLeave={e => { e.currentTarget.style.background = C.white; }}
    >Cancel</button>
  );
});

const ConfirmBtn = memo(function ConfirmBtn({ onClick, label, color, loading, disabled, icon }) {
  const { C } = useTheme();
  const off = loading || disabled;
  const btnColor = color || C.green;
  return (
    <button onClick={onClick} disabled={off}
      style={{ padding:"10px 20px", borderRadius:10, border:"none", background:off ? C.gray300 : btnColor, color:"#ffffff", fontWeight:700, fontSize:13, cursor:off ? "not-allowed" : "pointer", fontFamily:"inherit", boxShadow:off ? "none" : `0 4px 12px ${btnColor}44`, display:"flex", alignItems:"center", gap:8, transition:"all 0.2s" }}
      onMouseEnter={e => { if(!off) e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { if(!off) e.currentTarget.style.transform = "none"; }}
    >
      {loading ? <Icons.Spinner size={16} /> : icon}
      {loading ? "Saving..." : label}
    </button>
  );
});

const Field = memo(function Field({ label, required, hint, children }) {
  const { C, isDark } = useTheme();
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ fontSize:12, fontWeight:600, color: isDark ? C.gray400 : C.gray600, display:"block", marginBottom:6, letterSpacing:"0.03em", textTransform:"uppercase" }}>
        {label}{required && <span style={{ color:C.red, marginLeft:4 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize:12, color:C.gray400, marginTop:6, lineHeight:1.4 }}>{hint}</div>}
    </div>
  );
});

// ── CDSSearchBox ──────────────────────────────────────────────────
const CDSSearchBox = memo(function CDSSearchBox({ callerRole, adCdsList=[], excludeCdsIds=[], excludeCdsNumbers=[], onSelect, placeholder="Search by CDS number or owner name..." }) {
  const { C, isDark } = useTheme();
  const [query,setQuery]             = useState("");
  const [results,setResults]         = useState([]);
  const [rawResults,setRawResults]   = useState([]);
  const [searching,setSearching]     = useState(false);
  const [showCreate,setShowCreate]   = useState(false);
  const [createForm,setCreateForm]   = useState({ cdsNumber:"", cdsName:"", phone:"", email:"" });
  const [creating,setCreating]       = useState(false);
  const [createError,setCreateError] = useState("");
  const [selected,setSelected]       = useState(null);
  const debounceRef  = useRef(null);
  const searchReqRef = useRef(0);
  const mountedRef   = useRef(true);
  const isAD = callerRole === "AD";

  const excludedIds  = useMemo(() => new Set((excludeCdsIds||[]).map(String)), [excludeCdsIds]);
  const excludedNums = useMemo(() => new Set((excludeCdsNumbers||[]).map(v => String(v).toUpperCase())), [excludeCdsNumbers]);

  const isExcluded = useCallback((c) => {
    const id  = String(c?.id ?? c?.cds_id ?? "");
    const num = String(c?.cds_number || "").toUpperCase();
    return (id && excludedIds.has(id)) || (num && excludedNums.has(num));
  }, [excludedIds, excludedNums]);

  const adFiltered = useMemo(() => {
    if (!isAD || !query.trim()) return [];
    const q = query.toLowerCase();
    return adCdsList.filter(c => !isExcluded(c) && (c.cds_number?.toLowerCase().includes(q) || c.cds_name?.toLowerCase().includes(q)));
  }, [isAD, adCdsList, query, isExcluded]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (isAD) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setRawResults([]); setShowCreate(false); return; }
    const reqId = ++searchReqRef.current;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await sbSearchCDS(query);
        if (!mountedRef.current || reqId !== searchReqRef.current) return;
        const all = rows||[]; const filtered = all.filter(c => !isExcluded(c));
        setRawResults(all); setResults(filtered); setShowCreate(all.length === 0);
      } catch {
        if (!mountedRef.current || reqId !== searchReqRef.current) return;
        setResults([]); setRawResults([]);
      } finally {
        if (mountedRef.current && reqId === searchReqRef.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, isAD, isExcluded]);

  const foundButExcluded = !isAD && !selected && query.trim().length > 2 && rawResults.length > 0 && results.length === 0;
  const queryMatchesExcluded = useMemo(() => {
    if (isAD || !showCreate || !query.trim()) return false;
    const q = query.toUpperCase().replace(/^CDS-/, "").trim();
    return [...excludedNums].some(n => { const n2 = n.replace(/^CDS-/, ""); return n2===q||n2.includes(q)||q.includes(n2); });
  }, [isAD, showCreate, query, excludedNums]);

  const displayResults = isAD ? adFiltered : results;

  const handleSelect = useCallback((cds) => {
    setSelected(cds); setQuery(cds.cds_number);
    setResults([]); setRawResults([]); setShowCreate(false);
    onSelect(cds);
  }, [onSelect]);

  const handleCreate = useCallback(async () => {
    setCreateError("");
    if (!createForm.cdsNumber.trim()) return setCreateError("CDS number is required");
    if (!createForm.cdsName.trim())   return setCreateError("Owner name is required");
    setCreating(true);
    try {
      const newCds = await sbCreateCDS(createForm);
      handleSelect(newCds); setShowCreate(false);
    } catch (e) {
      setCreateError(e.message || "Failed to create CDS");
    } finally {
      setCreating(false);
    }
  }, [createForm, handleSelect]);

  const createPanelBg  = isDark ? `${C.gold}11` : "#fffbeb";
  const createPanelBdr = isDark ? `${C.gold}44` : `${C.gold}30`;
  const createTitleCol = isDark ? C.gold : "#92400e";

  return (
    <div>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, pointerEvents:"none", display:"flex" }}>
          <Icons.Search size={16} />
        </span>
        <input style={{ ...inp(C), paddingLeft:36 }} type="text" placeholder={placeholder} value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); onSelect(null); }}
          onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} name="cds_lookup" data-lpignore="true" data-form-type="other" />
        {searching && <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:C.green, display:"flex" }}><Icons.Spinner size={16} /></span>}
      </div>

      {displayResults.length > 0 && !selected && (
        <div style={{ border:`1px solid ${C.green}`, borderRadius:10, marginTop:6, overflow:"hidden", maxHeight:200, overflowY:"auto", background:C.white, boxShadow:"0 8px 24px rgba(0,0,0,0.12)" }}>
          {displayResults.map(c => (
            <div key={c.id||c.cds_id||c.cds_number} onClick={() => handleSelect(c)}
              style={{ padding:"12px 16px", cursor:"pointer", borderBottom:`1px solid ${C.gray100}`, transition:"background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background=C.gray50}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.cds_number}</div>
              <div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{c.cds_name}{c.phone ? ` · ${c.phone}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {isAD && !selected && query.trim().length > 1 && adFiltered.length === 0 && (
        <div style={{ marginTop:8, padding:"10px 14px", borderRadius:10, background:C.gray50, border:`1px solid ${C.gray200}`, fontSize:12, color:C.gray500, display:"flex", alignItems:"center", gap:8 }}>
          <Icons.Search size={16} color={C.gray400} /> No matching CDS in your pool
        </div>
      )}

      {(foundButExcluded || queryMatchesExcluded) && !selected && (
        <div style={{ marginTop:8, padding:"10px 14px", borderRadius:10, background:C.greenBg, border:`1px solid ${isDark ? `${C.green}44` : "#bbf7d0"}`, fontSize:12, color:C.green, display:"flex", alignItems:"center", gap:8, fontWeight:500 }}>
          <Icons.CheckCircle size={16} /> Already assigned to this user
        </div>
      )}

      {selected && (
        <div style={{ marginTop:8, padding:"10px 14px", borderRadius:10, background:`${C.green}0f`, border:`1px solid ${C.green}33`, display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:C.green, display:"flex" }}><Icons.CheckCircle size={20} /></span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{selected.cds_number}</div>
            <div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{selected.cds_name}</div>
          </div>
          <button onClick={() => { setSelected(null); setQuery(""); onSelect(null); }} style={{ background:"rgba(0,0,0,0.05)", border:"none", cursor:"pointer", color:C.gray500, width:28, height:28, borderRadius:8, display:"flex", alignItems:"center", justifyContent:"center" }}><Icons.Close size={14}/></button>
        </div>
      )}

      {showCreate && !isAD && !queryMatchesExcluded && query.trim().length > 2 && !selected && (
        <div style={{ marginTop:8, padding:"16px", borderRadius:12, background:createPanelBg, border:`1px solid ${createPanelBdr}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:createTitleCol, marginBottom:12, display:"flex", alignItems:"center", gap:8 }}>
            <Icons.Sparkles size={16} /> Not found — create new CDS record
          </div>
          {createError && (
            <div style={{ fontSize:12, color:C.red, marginBottom:12, background:C.redBg, padding:"8px 12px", borderRadius:8, border:`1px solid ${isDark ? `${C.red}44` : "#fecaca"}`, display:"flex", alignItems:"center", gap:8 }}>
              <Icons.Alert size={16} /> {createError}
            </div>
          )}
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <div style={{ flex:"0 0 auto" }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.gray500, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>Number *</div>
              <div style={{ display:"flex", alignItems:"center", border:`1px solid ${C.gray300}`, borderRadius:8, overflow:"hidden", background:C.white, transition:"border 0.2s" }}>
                <span style={{ padding:"8px 10px", fontSize:13, fontWeight:700, color:isDark ? C.gray400 : C.gray600, background:C.gray50, borderRight:`1px solid ${C.gray200}`, whiteSpace:"nowrap", userSelect:"none" }}>CDS-</span>
                <input style={{ border:"none", outline:"none", padding:"8px 10px", fontSize:13, fontFamily:"inherit", width:90, background:"transparent", color:C.text }} placeholder="647305" value={createForm.cdsNumber.replace(/^CDS-/i,"")} onChange={e => setCreateForm(f => ({ ...f, cdsNumber:"CDS-"+e.target.value.replace(/[^0-9A-Za-z]/g,"").toUpperCase() }))} autoComplete="off" />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.gray500, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>Owner Name *</div>
              <input style={inp(C, { fontSize:13, padding:"8px 12px", borderRadius:8 })} placeholder="Full name" value={createForm.cdsName} onChange={e => setCreateForm(f => ({ ...f, cdsName:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.gray500, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>Phone</div>
              <input style={inp(C, { fontSize:13, padding:"8px 12px", borderRadius:8 })} placeholder="+255..." value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:10, fontWeight:600, color:C.gray500, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.04em" }}>Email</div>
              <input style={inp(C, { fontSize:13, padding:"8px 12px", borderRadius:8 })} placeholder="owner@email.com" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ width:"100%", padding:"10px", borderRadius:8, border:"none", background:creating?C.gray300:C.navy, color:"#ffffff", fontWeight:700, fontSize:13, cursor:creating?"not-allowed":"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {creating ? <><Icons.Spinner size={16}/> Creating...</> : <><Icons.Plus size={16}/> Create & Select CDS</>}
          </button>
        </div>
      )}
    </div>
  );
});

// ── CDSPoolPicker ─────────────────────────────────────────────────
const CDSPoolPicker = memo(function CDSPoolPicker({ pool=[], excludeCdsIds=[], excludeCdsNumbers=[], mode="single", onSelect, onSelectMulti }) {
  const { C } = useTheme();
  const [open,setOpen]         = useState(false);
  const [selected,setSelected] = useState([]);
  const excludedIds  = useMemo(() => new Set((excludeCdsIds||[]).map(String)), [excludeCdsIds]);
  const excludedNums = useMemo(() => new Set((excludeCdsNumbers||[]).map(v => String(v).toUpperCase())), [excludeCdsNumbers]);
  const available = useMemo(() => pool.filter(c => {
    const id=String(c?.id??c?.cds_id??""); const num=String(c?.cds_number||"").toUpperCase();
    return !(id&&excludedIds.has(id))&&!(num&&excludedNums.has(num));
  }), [pool,excludedIds,excludedNums]);

  const toggle = useCallback((cds) => {
    if (mode==="single") {
      const already = selected[0]?.cds_number === cds.cds_number;
      const next = already ? [] : [cds];
      setSelected(next); onSelect?.(next[0] || null); setOpen(false);
    } else {
      setSelected(prev => {
        const exists = prev.some(c => c.cds_number === cds.cds_number);
        const next = exists ? prev.filter(c => c.cds_number !== cds.cds_number) : [...prev, cds];
        onSelectMulti?.(next); return next;
      });
    }
  }, [mode, onSelect, onSelectMulti]);

  const label = selected.length === 0
    ? `Select CDS account${mode==="multi"?"s":""} `
    : mode==="single" ? selected[0].cds_number : `${selected.length} CDS selected`;

  return (
    <div style={{ position:"relative" }}>
      <div onClick={() => available.length>0 && setOpen(o=>!o)} style={{ ...inp(C), display:"flex", alignItems:"center", justifyContent:"space-between", cursor:available.length>0?"pointer":"not-allowed", userSelect:"none", borderColor:open?C.green:C.gray200, borderRadius:open?"10px 10px 0 0":10, background:available.length===0?C.gray50:C.white }}>
        <span style={{ fontSize:13, color:selected.length>0?C.text:C.gray400 }}>{label}</span>
        <span style={{ color:C.gray400, transform:open?"rotate(180deg)":"none", transition:"transform 0.2s", display:"flex" }}><Icons.ChevronDown size={16}/></span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, border:`1px solid ${C.green}`, borderTop:"none", borderRadius:"0 0 10px 10px", background:C.white, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.12)", maxHeight:240, overflowY:"auto" }}>
          {available.length===0 ? <div style={{ padding:"12px 16px", fontSize:13, color:C.gray400, textAlign:"center" }}>No available CDS in your pool</div>
          : available.map((c,i) => {
            const isSel=selected.some(s=>s.cds_number===c.cds_number);
            return (
              <div key={c.id||c.cds_id||c.cds_number} onClick={() => toggle(c)}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", cursor:"pointer", background:isSel?`${C.green}0f`:"transparent", borderBottom:i<available.length-1?`1px solid ${C.gray100}`:"none", transition:"background 0.1s" }}
                onMouseEnter={e => { if(!isSel)e.currentTarget.style.background=C.gray50; }}
                onMouseLeave={e => { e.currentTarget.style.background=isSel?`${C.green}0f`:"transparent"; }}>
                <div style={{ width:18, height:18, borderRadius:mode==="single"?"50%":5, border:`2px solid ${isSel?C.green:C.gray300}`, background:isSel?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                  {isSel&&<Icons.Check size={12} color="#fff" />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.cds_number}</div>
                  <div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{c.cds_name||"—"}</div>
                </div>
              </div>
            );
          })}
          {mode==="multi" && selected.length>0 && (
            <div style={{ padding:"10px 16px", borderTop:`1px solid ${C.gray100}`, background:C.gray50, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => setOpen(false)} style={{ padding:"6px 16px", borderRadius:8, border:"none", background:C.green, color:"#ffffff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Done</button>
            </div>
          )}
        </div>
      )}
      {mode==="multi" && selected.length>0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginTop:10 }}>
          {selected.map(c => (
            <span key={c.cds_number} style={{ display:"inline-flex", alignItems:"center", gap:6, background:`${C.green}15`, border:`1px solid ${C.green}33`, borderRadius:20, padding:"4px 10px", fontSize:12, fontWeight:600, color:C.green }}>
              <Icons.Lock size={12} /> {c.cds_number}
              <button onClick={() => toggle(c)} style={{ background:"rgba(0,0,0,0.05)", border:"none", cursor:"pointer", color:C.green, width:18, height:18, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center" }}><Icons.Close size={10}/></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
});

// ═══════════════════════════════════════════════════════
// MODAL — Manage CDS
// ═══════════════════════════════════════════════════════
const ManageCDSModal = memo(function ManageCDSModal({ user, callerRole, callerCdsList, onClose, showToast, onRefresh }) {
  const { C, isDark } = useTheme();
  const [userCdsList,setUserCdsList]   = useState([]);
  const [loadingList,setLoadingList]   = useState(true);
  const [selectedCds,setSelectedCds]   = useState(null);
  const [assigning,setAssigning]       = useState(false);
  const [removeTarget,setRemoveTarget] = useState(null);
  const [searchBoxKey,setSearchBoxKey] = useState(0);
  const isSA = callerRole==="SA";
  const mountedRef=useRef(true); const loadRef=useRef(0);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current=false; }; }, []);

  const loadUserCds = useCallback(async (silent=false) => {
    const reqId=++loadRef.current;
    if (!silent && mountedRef.current) setLoadingList(true);
    try {
      const list = await sbGetUserCDS(user.id);
      if (!mountedRef.current || reqId!==loadRef.current) return;
      setUserCdsList(list||[]);
    } catch(e) {
      if (!mountedRef.current || reqId!==loadRef.current) return;
      if (!silent) showToast("Failed to load CDS list","error");
    } finally {
      if (mountedRef.current && reqId===loadRef.current && !silent) setLoadingList(false);
    }
  }, [user.id, showToast]);

  useEffect(() => { loadUserCds(); }, [loadUserCds]);

  const handleAssign = useCallback(async () => {
    if (!selectedCds) return showToast("Select a CDS to assign","error");
    const selectedId = String(selectedCds.id ?? selectedCds.cds_id ?? "");
    const selectedNumber = String(selectedCds.cds_number || "").trim().toUpperCase();
    const alreadyAssigned = userCdsList.some(c =>
      String(c.cds_id??"") === selectedId || String(c.cds_number||"").trim().toUpperCase() === selectedNumber
    );
    if (alreadyAssigned) { setSelectedCds(null); return showToast("This CDS is already assigned to the user","error"); }
    const optimistic = { cds_id: selectedCds.id || selectedCds.cds_id, cds_number: selectedCds.cds_number, cds_name: selectedCds.cds_name || "", phone: selectedCds.phone || "", is_active: userCdsList.length === 0 };
    setUserCdsList(prev => [...prev, optimistic]); setSelectedCds(null); setAssigning(true);
    try {
      await sbAssignCDS(user.id, selectedCds.id || selectedCds.cds_id);
      showToast(`${selectedCds.cds_number} assigned`,"success");
      setSearchBoxKey(k=>k+1); loadUserCds(true); onRefresh?.();
    } catch(e) {
      if (mountedRef.current) setUserCdsList(prev => prev.filter(c => c.cds_id !== optimistic.cds_id));
      showToast(e.message || "Failed to assign CDS","error");
    } finally {
      if (mountedRef.current) setAssigning(false);
    }
  }, [selectedCds, user, userCdsList, loadUserCds, onRefresh, showToast]);

  const handleRemove = useCallback(async (cdsEntry) => {
    if (isSA && user.role_code==="AD") { setRemoveTarget(cdsEntry); return; }
    const snapshot = [...userCdsList];
    setUserCdsList(prev => prev.filter(c => c.cds_id !== cdsEntry.cds_id));
    try {
      await sbRemoveCDS(user.id, cdsEntry.cds_id);
      showToast(`${cdsEntry.cds_number} removed`,"success"); loadUserCds(true); onRefresh?.();
    } catch(e) {
      if (mountedRef.current) setUserCdsList(snapshot);
      showToast(e.message || "Failed to remove CDS","error");
    }
  }, [isSA, user, userCdsList, loadUserCds, onRefresh, showToast]);

  return (
    <>
      <Modal
        title="Manage CDS Accounts"
        subtitle={`${user.full_name||"User"} · ${userCdsList.length} account${userCdsList.length!==1?"s":""}`}
        onClose={onClose} maxWidth={520}
        footer={<CancelBtn onClose={onClose} />}
      >
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:isDark ? C.gray400 : C.navy, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}><Icons.Bank size={16}/> Assigned CDS</div>
          {loadingList
            ? <div style={{ textAlign:"center", padding:"24px 0", color:C.gray400, display:"flex", justifyContent:"center" }}><Icons.Spinner size={24}/></div>
            : userCdsList.length===0
              ? <div style={{ textAlign:"center", padding:"24px 0", color:C.gray500, fontSize:13, background:C.gray50, borderRadius:12, border:`1px dashed ${C.gray300}` }}>No CDS accounts assigned yet</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {userCdsList.map(c => (
                    <div key={c.cds_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:c.is_active?`${C.green}0a`:C.gray50, border:`1px solid ${c.is_active?C.green+"44":C.gray200}` }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:c.is_active?C.green+"15":C.navy+"10", border:`1px solid ${c.is_active?C.green+"33":C.navy+"15"}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color:c.is_active?C.green:C.navy }}><Icons.Lock size={16}/></div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{c.cds_number}</div>
                        <div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{c.cds_name||"—"}</div>
                      </div>
                      {c.is_active && <span style={{ fontSize:11, fontWeight:700, background:C.greenBg, color:C.green, border:`1px solid ${isDark ? `${C.green}40` : `${C.green}33`}`, borderRadius:20, padding:"3px 10px", whiteSpace:"nowrap", flexShrink:0 }}>Active</span>}
                      <button onClick={() => handleRemove(c)} style={{ fontSize:12, fontWeight:600, background:C.redBg, color:C.red, border:"none", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontFamily:"inherit", flexShrink:0, transition:"background 0.2s" }} onMouseEnter={e=>e.currentTarget.style.background=`${C.red}22`} onMouseLeave={e=>e.currentTarget.style.background=C.redBg}>Remove</button>
                    </div>
                  ))}
                </div>
          }
        </div>
        {isSA && (
          <>
            <div style={{ height:1, background:C.gray200, margin:"8px 0 20px" }}/>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:isDark ? C.gray400 : C.navy, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}><Icons.Plus size={16}/> Assign New CDS</div>
              <CDSSearchBox key={searchBoxKey} callerRole={callerRole} adCdsList={[]} excludeCdsIds={userCdsList.map(c=>c.cds_id)} excludeCdsNumbers={userCdsList.map(c=>c.cds_number)} onSelect={setSelectedCds} placeholder="Search CDS number or owner name..." />
              {selectedCds && (
                <button onClick={handleAssign} disabled={assigning} style={{ marginTop:12, width:"100%", padding:"12px", borderRadius:10, border:"none", background:assigning?C.gray300:C.green, color:"#ffffff", fontWeight:700, fontSize:14, cursor:assigning?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:assigning?"none":`0 4px 12px ${C.green}44`, display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"transform 0.2s" }} onMouseEnter={e=>{if(!assigning)e.currentTarget.style.transform="translateY(-1px)"}} onMouseLeave={e=>{if(!assigning)e.currentTarget.style.transform="none"}}>
                  {assigning ? <><Icons.Spinner size={18}/> Assigning...</> : `Assign ${selectedCds.cds_number}`}
                </button>
              )}
            </div>
          </>
        )}
      </Modal>
      {removeTarget && (
        <CascadeRemoveModal admin={user} cdsEntry={removeTarget} onClose={() => setRemoveTarget(null)} onDone={async () => { setRemoveTarget(null); await loadUserCds(true); onRefresh?.(); }} showToast={showToast} />
      )}
    </>
  );
});

// ═══════════════════════════════════════════════════════
// MODAL — Cascade Remove
// ═══════════════════════════════════════════════════════
const CascadeRemoveModal = memo(function CascadeRemoveModal({ admin, cdsEntry, onClose, onDone, showToast }) {
  const { C, isDark } = useTheme();
  const [affectedUsers,setAffectedUsers] = useState([]);
  const [loading,setLoading]             = useState(true);
  const [saving,setSaving]               = useState(false);
  const [cascade,setCascade]             = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const load = async () => {
      try {
        const users = await sbGetCDSAssignedUsers(cdsEntry.cds_id);
        if (mountedRef.current) setAffectedUsers((users||[]).filter(u => u.user_id !== admin.id));
      } catch {
        if (mountedRef.current) setAffectedUsers([]);
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    };
    load();
    return () => { mountedRef.current = false; };
  }, [cdsEntry.cds_id, admin.id]);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    try {
      if (affectedUsers.length > 0 && cascade !== null) {
        await sbRemoveCDSFromAdminCascade(admin.id, cdsEntry.cds_id, cascade);
        showToast(cascade ? `${cdsEntry.cds_number} removed from ${admin.full_name} and ${affectedUsers.length} user${affectedUsers.length>1?"s":""}` : `${cdsEntry.cds_number} removed from ${admin.full_name} only`,"success");
      } else {
        await sbRemoveCDS(admin.id, cdsEntry.cds_id);
        showToast(`${cdsEntry.cds_number} removed from ${admin.full_name}`,"success");
      }
      onDone();
    } catch(e) {
      showToast(e.message || "Failed to remove CDS","error"); setSaving(false);
    }
  }, [admin, cdsEntry, cascade, affectedUsers, onDone, showToast]);

  const canConfirm = affectedUsers.length === 0 || cascade !== null;

  return (
    <Modal
      title="Remove CDS from Admin"
      subtitle={`${cdsEntry.cds_number} · ${admin.full_name}`}
      onClose={onClose} maxWidth={500}
      footer={
        <><CancelBtn onClose={onClose}/>{canConfirm
          ? <ConfirmBtn onClick={handleConfirm} label="Confirm Remove" color={C.red} loading={saving} icon={<Icons.Trash size={16}/>}/>
          : <div style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:C.gray500, fontStyle:"italic" }}>← Choose an option above</div>
        }</>
      }
    >
      {loading
        ? <div style={{ textAlign:"center", padding:"30px 0", color:C.gray400, display:"flex", justifyContent:"center" }}><Icons.Spinner size={24}/></div>
        : affectedUsers.length === 0 ? (
          <div style={{ textAlign:"center", padding:"10px 0" }}>
            <div style={{ display:"inline-flex", padding:20, borderRadius:"50%", background:C.redBg, color:C.red, marginBottom:16 }}><Icons.Trash size={32}/></div>
            <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:8 }}>Remove {cdsEntry.cds_number}?</div>
            <div style={{ fontSize:14, color:C.gray500, lineHeight:1.6 }}>No other users are assigned this CDS under <strong style={{ color:C.text }}>{admin.full_name}</strong>. It will simply be removed.</div>
          </div>
        ) : (
          <div>
            <div style={{ padding:"14px 18px", borderRadius:12, background:C.redBg, border:`1px solid ${isDark ? `${C.red}44` : "#fecaca"}`, marginBottom:20, fontSize:13, color:C.red, display:"flex", alignItems:"flex-start", gap:10 }}>
              <span style={{ marginTop:2 }}><Icons.Alert size={18}/></span>
              <div style={{ lineHeight:1.5 }}>
                <strong>{affectedUsers.length} user{affectedUsers.length>1?"s":""}</strong> assigned by this admin also have access to <strong>{cdsEntry.cds_number}</strong>.
              </div>
            </div>
            <div style={{ maxHeight:160, overflowY:"auto", marginBottom:20, border:`1px solid ${C.gray200}`, borderRadius:12, overflow:"hidden" }}>
              {affectedUsers.map((u,i) => (
                <div key={u.user_id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:i%2?C.gray50:C.white, borderBottom:i<affectedUsers.length-1?`1px solid ${C.gray100}`:"none" }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:C.gray200, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:C.gray600, flexShrink:0 }}>{(u.full_name||"?")[0]?.toUpperCase()}</div>
                  <div style={{ flex:1, fontSize:13, fontWeight:600, color:C.text }}>{u.full_name||"—"}</div>
                  <RoleBadge code={u.role_code} />
                </div>
              ))}
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:isDark ? C.gray400 : C.navy, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:12 }}>What to do with their access?</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:8 }}>
              {[
                { val:false, icon:<Icons.Lock size={20}/>, label:"Remove from admin only", desc:"Users keep their CDS access" },
                { val:true,  icon:<Icons.Trash size={20}/>, label:"Remove from all users too", desc:"All listed users lose this CDS" }
              ].map(opt => (
                <button key={String(opt.val)} onClick={() => setCascade(opt.val)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`2px solid ${cascade===opt.val ? (opt.val ? C.red : C.navy) : C.gray200}`, background:cascade===opt.val ? (opt.val ? C.redBg : C.navy+"0a") : C.white, transition:"all 0.2s" }}>
                  <span style={{ color:cascade===opt.val ? (opt.val ? C.red : C.navy) : C.gray400, flexShrink:0 }}>{opt.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{opt.label}</div>
                    <div style={{ fontSize:12, color:C.gray500, marginTop:3 }}>{opt.desc}</div>
                  </div>
                  <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${cascade===opt.val ? (opt.val ? C.red : C.navy) : C.gray300}`, background:cascade===opt.val ? (opt.val ? C.red : C.navy) : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {cascade===opt.val && <div style={{ width:8, height:8, borderRadius:"50%", background:"#ffffff" }}/>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )
      }
    </Modal>
  );
});

// ═══════════════════════════════════════════════════════
// MODAL — Change Role
// ═══════════════════════════════════════════════════════
const ChangeRoleModal = memo(function ChangeRoleModal({ user, roles, callerRole, onClose, onSave, showToast }) {
  const { C, isDark } = useTheme();
  const available = useMemo(() => (callerRole==="SA" ? roles : roles.filter(r=>r.code!=="SA")), [callerRole, roles]);
  const [sel, setSel]       = useState(() => roles.find(r=>r.code===user.role_code)?.id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!sel) return showToast("Select a role","error");
    setSaving(true);
    try { await onSave(user.id, parseInt(sel, 10)); onClose(); }
    catch(e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  }, [sel, showToast, onSave, user.id, onClose]);

  return (
    <Modal title="Change Role" subtitle={`Assigning to ${user.full_name||"user"}`} onClose={onClose} footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleSave} label="Save Role" icon={<Icons.Check size={16}/>} loading={saving}/></>}>
      <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderRadius:12, background:C.gray50, border:`1px solid ${C.gray200}`, marginBottom:20 }}>
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={42}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{user.full_name||"User"}</div>
          <div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{user.cds_number||"No CDS"}</div>
        </div>
        {user.role_code && <RoleBadge code={user.role_code}/>}
      </div>
      <div style={{ fontSize:12, fontWeight:700, color:isDark ? C.gray400 : C.navy, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12, display:"flex", alignItems:"center", gap:8 }}><Icons.Shield size={16}/> Select New Role</div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:4 }}>
        {available.map(r => {
          const m = ROLE_META[r.code];
          const checked = String(sel) === String(r.id);
          return (
            <button key={r.id} onClick={() => setSel(r.id)} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderRadius:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`2px solid ${checked ? (isDark ? m.darkText : m.text) : C.gray200}`, background:checked ? (isDark ? m.darkBg : m.bg) : C.white, transition:"all 0.2s" }}>
              <div style={{ width:20, height:20, borderRadius:"50%", border:`2px solid ${checked ? (isDark ? m.darkText : m.text) : C.gray300}`, background:checked ? (isDark ? m.darkText : m.text) : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {checked && <div style={{ width:8, height:8, borderRadius:"50%", background:"#ffffff" }}/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{r.name}</div>
                {r.description && <div style={{ fontSize:12, color:C.gray500, marginTop:3 }}>{r.description}</div>}
              </div>
              <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:8, background:isDark ? m.darkBg : m.bg, border:`1px solid ${isDark ? m.darkBorder : m.border}`, color:isDark ? m.darkText : m.text }}>{r.code}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
});

// ═══════════════════════════════════════════════════════
// MODAL — Toggle Status
// ═══════════════════════════════════════════════════════
const ToggleStatusModal = memo(function ToggleStatusModal({ user, onClose, onConfirm, showToast }) {
  const { C } = useTheme();
  const [saving, setSaving] = useState(false);
  const deactivating = user.is_active;

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    try { await onConfirm(user); onClose(); }
    catch(e) { setSaving(false); showToast(e.message, "error"); }
  }, [onConfirm, user, onClose, showToast]);

  return (
    <Modal
      title={deactivating ? "Deactivate User" : "Reactivate User"}
      onClose={onClose}
      footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleConfirm} label={deactivating ? "Yes, Deactivate" : "Yes, Reactivate"} color={deactivating ? C.red : C.green} loading={saving} icon={deactivating ? <Icons.Ban size={16}/> : <Icons.CheckCircle size={16}/>}/></>}
    >
      <div style={{ textAlign:"center", padding:"10px 0 6px" }}>
        <div style={{ display:"inline-flex", padding:20, borderRadius:"50%", background:deactivating?C.redBg:C.greenBg, color:deactivating?C.red:C.green, marginBottom:16 }}>
          {deactivating ? <Icons.Ban size={40}/> : <Icons.CheckCircle size={40}/>}
        </div>
        <div style={{ fontSize:17, fontWeight:800, color:C.text, marginBottom:10 }}>{deactivating ? `Deactivate ${user.full_name}?` : `Reactivate ${user.full_name}?`}</div>
        <div style={{ fontSize:14, color:C.gray500, lineHeight:1.6 }}>
          {deactivating ? "This user will lose access immediately. Their data is preserved and they can be reactivated anytime." : "This user will regain access with their previous role restored."}
        </div>
      </div>
    </Modal>
  );
});

// ═══════════════════════════════════════════════════════
// MODAL — Invite User
// ═══════════════════════════════════════════════════════
const InviteModal = memo(function InviteModal({ roles, callerRole, callerCdsList, onClose, onSuccess, showToast }) {
  const { C, isDark } = useTheme();
  const isAD = callerRole === "AD";
  const [form, setForm]                         = useState({ email:"", password:"", role_id:"" });
  const [selectedCds, setSelectedCds]           = useState(isAD && callerCdsList?.length === 1 ? callerCdsList[0] : null);
  const [selectedCdsMulti, setSelectedCdsMulti] = useState([]);
  const [saving, setSaving]                     = useState(false);
  const [error, setError]                       = useState("");

  const allowedRoles = useMemo(() => (isAD ? roles.filter(r => r.code !== "SA") : roles), [isAD, roles]);

  const passwordChecks = useMemo(() => {
    const pw = form.password;
    return [
      { label:"8+ chars", ok:pw.length >= 8 },
      { label:"Upper",    ok:/[A-Z]/.test(pw) },
      { label:"Lower",    ok:/[a-z]/.test(pw) },
      { label:"Number",   ok:/[0-9]/.test(pw) },
      { label:"Symbol",   ok:/[^A-Za-z0-9]/.test(pw) },
    ];
  }, [form.password]);

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]:v })), []);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!form.email.trim()) return setError("Email is required");
    if (!form.password.trim()) return setError("Temporary password is required.");
    const pwErrors = [];
    if (form.password.length < 8)            pwErrors.push("at least 8 characters");
    if (!/[A-Z]/.test(form.password))        pwErrors.push("one uppercase letter");
    if (!/[a-z]/.test(form.password))        pwErrors.push("one lowercase letter");
    if (!/[0-9]/.test(form.password))        pwErrors.push("one number");
    if (!/[^A-Za-z0-9]/.test(form.password)) pwErrors.push("one special character");
    if (pwErrors.length > 0) return setError("Password must contain: " + pwErrors.join(", ") + ".");
    const adMultiMode = isAD && (callerCdsList?.length ?? 0) > 1;
    const cdsReady = adMultiMode ? selectedCdsMulti.length > 0 : !!selectedCds;
    if (!cdsReady) return setError("Please select at least one CDS account");
    if (!form.role_id) return setError("Please select a role");

    setSaving(true);
    try {
      const primaryCds = adMultiMode ? selectedCdsMulti[0] : selectedCds;
      const result = await sbAdminCreateUser(form.email, form.password, primaryCds.cds_number);
      const uid = result?.user?.id || result?.id;

      if (!uid) throw new Error("User created but no ID returned — contact support.");

      let roleAssigned = false;
      let cdsFailCount = 0;

      try {
        await sbAssignRole(uid, parseInt(form.role_id, 10));
        roleAssigned = true;
      } catch (roleErr) {
        showToast(`User account created but role assignment failed: ${roleErr.message}. Find the user and set their role manually.`, "error");
        onSuccess();
        onClose();
        return;
      }

      if (roleAssigned) {
        const cdsToAssign = adMultiMode ? selectedCdsMulti : [selectedCds];
        for (const cds of cdsToAssign) {
          const cdsId = cds.id || cds.cds_id;
          if (cdsId) { try { await sbAssignCDS(uid, cdsId); } catch { cdsFailCount++; } }
        }
        if (cdsFailCount > 0) {
          showToast(`User created, but ${cdsFailCount} CDS assignment${cdsFailCount > 1 ? "s" : ""} failed. Use "Manage CDS" on the user to fix.`, "error");
        } else {
          showToast("User created successfully!", "success");
        }
      }

      onSuccess();
      onClose();
    } catch(err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [form, selectedCds, selectedCdsMulti, isAD, callerCdsList, onClose, onSuccess, showToast]);

  return (
    <Modal title="Invite New User" subtitle="Create an account and assign a role" onClose={onClose} closeOnBackdrop={false} footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleSubmit} label="Create & Invite" icon={<Icons.Plus size={16}/>} loading={saving}/></>}>
      {error && (
        <div style={{ background:C.redBg, border:`1px solid ${isDark ? `${C.red}44` : "#fecaca"}`, color:C.red, borderRadius:12, padding:"12px 16px", fontSize:13, marginBottom:20, display:"flex", alignItems:"center", gap:10 }}>
          <Icons.Alert size={18} /> {error}
        </div>
      )}
      <Field label="Email Address" required>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, display:"flex" }}><Icons.Mail size={16}/></span>
          <input style={{...inp(C), paddingLeft:36}} type="email" placeholder="user@example.com" value={form.email} onChange={e=>set("email", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)}/>
        </div>
      </Field>
      <Field label="CDS Account" required hint={isAD ? (callerCdsList?.length===1 ? "Auto-assigned from your account" : "Select one or more CDS from your pool") : "Search existing CDS or create a new one"}>
        {isAD && callerCdsList?.length === 1 && selectedCds ? (
          <div style={{ padding:"12px 16px", borderRadius:10, background:`${C.green}0f`, border:`1px solid ${C.green}33`, display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ color:C.green, display:"flex" }}><Icons.Lock size={16} /></span>
            <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:700, color:C.green }}>{selectedCds.cds_number}</div><div style={{ fontSize:12, color:C.gray500, marginTop:2 }}>{selectedCds.cds_name}</div></div>
            <span style={{ fontSize:11, fontWeight:700, color:C.green, background:C.greenBg, padding:"2px 8px", borderRadius:6 }}>Auto-selected</span>
          </div>
        ) : isAD && (callerCdsList?.length ?? 0) > 1 ? (
          <CDSPoolPicker pool={callerCdsList||[]} mode="multi" onSelectMulti={setSelectedCdsMulti}/>
        ) : (
          <CDSSearchBox callerRole={callerRole} adCdsList={[]} onSelect={setSelectedCds} placeholder="Search CDS number or owner name..."/>
        )}
      </Field>
      <div style={{ height:1, background:C.gray200, margin:"8px 0 20px" }}/>
      <Field label="Temporary Password" required hint="Share this with the user — they can change it after first login">
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, display:"flex" }}><Icons.Key size={16}/></span>
          <input style={{...inp(C), paddingLeft:36}} type="password" placeholder="Min 8 chars, upper, lower, number, symbol" value={form.password} onChange={e=>set("password", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="new-password" name="invite_temp_password" data-lpignore="true" data-form-type="other"/>
        </div>
        {form.password.length > 0 && (
          <div style={{ display:"flex", gap:6, flexWrap:"nowrap", marginTop:10, alignItems:"center" }}>
            {passwordChecks.map(c => (
              <span key={c.label} style={{
                flex:"1 1 0", minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"flex", alignItems:"center", justifyContent:"center", gap:4,
                fontSize:10, fontWeight:700, padding:"4px 6px", borderRadius:8,
                background: c.ok ? (isDark ? `${C.green}22` : "#dcfce7") : (isDark ? `${C.red}22` : "#fee2e2"),
                color:       c.ok ? (isDark ? C.green : "#166534")        : (isDark ? C.red  : "#991b1b"),
                border:     `1px solid ${c.ok ? (isDark ? `${C.green}44` : "#bbf7d0") : (isDark ? `${C.red}44` : "#fecaca")}`,
              }}>
                {c.ok ? <Icons.Check size={10} /> : <Icons.Close size={10} />} {c.label}
              </span>
            ))}
          </div>
        )}
      </Field>
      <Field label="Assign Role" required>
        <div style={{ position:"relative" }}>
          <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, display:"flex", pointerEvents:"none" }}><Icons.Shield size={16}/></span>
          <select style={{ ...inp(C), paddingLeft:36, cursor:"pointer", appearance:"none" }} value={form.role_id} onChange={e=>set("role_id", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)}>
            <option value="">Select a role...</option>
            {allowedRoles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
          </select>
          <span style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, display:"flex", pointerEvents:"none" }}><Icons.ChevronDown size={16}/></span>
        </div>
      </Field>
    </Modal>
  );
});

// ── Role badge / User avatar / Stat card ──────────────────────────
const RoleBadge = memo(function RoleBadge({ code }) {
  const { C, isDark } = useTheme();
  const m = ROLE_META[code];
  if (!m) return (
    <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
      background: isDark ? `${C.gold}22` : "#fffbeb",
      border: `1px solid ${isDark ? `${C.gold}55` : "#fde68a"}`,
      color: C.gold, whiteSpace:"nowrap" }}>No Role</span>
  );
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"3px 8px", borderRadius:8,
      background: isDark ? m.darkBg   : m.bg,
      border:    `1px solid ${isDark ? m.darkBorder : m.border}`,
      color:      isDark ? m.darkText : m.text,
      whiteSpace: "nowrap" }}>{m.label}</span>
  );
});

const UserAvatar = memo(function UserAvatar({ name, avatarUrl, isActive, size=34 }) {
  const { C } = useTheme();
  const initial = (name || "U").charAt(0).toUpperCase();
  return (
    <div style={{ position:"relative", flexShrink:0, width:size, height:size }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name||"User"} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", display:"block", border:`1px solid ${C.gray300}` }} onError={e => { e.target.style.display="none"; if(e.target.nextSibling) e.target.nextSibling.style.display="flex"; }}/>
      ) : null}
      <div style={{ width:size, height:size, borderRadius:"50%", border:`1px solid ${C.gray300}`, background:C.gray100, color:C.gray600, display:avatarUrl?"none":"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.4, fontWeight:800 }}>
        {initial}
      </div>
      <div style={{ position:"absolute", bottom:-2, right:-2, width:size*0.3, height:size*0.3, borderRadius:"50%", border:`2px solid ${C.white}`, background:isActive ? C.green : C.gray400, zIndex:2 }}/>
    </div>
  );
});

const StatCard = memo(function StatCard({ label, value, color, icon }) {
  const { C } = useTheme();
  return (
    <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:14, flex:1, minWidth:110, boxShadow:"0 2px 8px rgba(0,0,0,0.02)" }}>
      <div style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:`${color}15`, border:`1px solid ${color}33`, display:"flex", alignItems:"center", justifyContent:"center", color:color }}>{icon}</div>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontSize:20, fontWeight:800, color:C.text, lineHeight:1, marginBottom:4 }}>{value}</div>
        <div style={{ fontSize:11, color:C.gray500, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{label}</div>
      </div>
    </div>
  );
});

// ── Mobile User Card ──────────────────────────────────────────────
const MobileUserCard = memo(function MobileUserCard({ user, onChangeRole, onManageCDS, onToggleStatus }) {
  const { C, isDark } = useTheme();
  const hasCds      = !!user.cds_number;
  const extraCount  = (user.cds_count && user.cds_count > 1) ? user.cds_count - 1 : 0;
  const inactiveBorder = isDark ? `${C.red}44` : "#fecaca";

  // shared label style
  const LBL = { fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", color:C.gray400, marginBottom:4 };

  return (
    <div style={{ background:C.white, border:`1px solid ${user.is_active ? C.gray200 : inactiveBorder}`, borderRadius:16, padding:"16px", marginBottom:12, opacity:user.is_active ? 1 : 0.8, boxShadow:"0 4px 12px rgba(0,0,0,0.03)" }}>

      {/* ── Row 1: Avatar + name + badges ── */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={44}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:800, fontSize:15, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:6 }}>
            {user.full_name || "New User"}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:8, background:user.is_active ? C.greenBg : C.redBg, border:`1px solid ${user.is_active ? (isDark ? `${C.green}44` : "#bbf7d0") : (isDark ? `${C.red}44` : "#fecaca")}`, color:user.is_active ? C.green : C.red }}>
              {user.is_active ? "Active" : "Inactive"}
            </span>
            <RoleBadge code={user.role_code}/>
          </div>
        </div>
      </div>

      {/* ── Row 2: CDS (left, tappable) + Phone (right) ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
        <div
          onClick={() => onManageCDS(user)}
          style={{
            background: hasCds ? (isDark ? `${C.navy}15` : "#EEF4FB") : C.gray50,
            border: `1px solid ${hasCds ? (isDark ? `${C.navy}40` : "#B5D4F4") : C.gray200}`,
            borderRadius:12, padding:"10px 12px", cursor:"pointer", transition:"all 0.2s"
          }}
        >
          <div style={{ ...LBL, color: hasCds ? (isDark ? "#93C5FD" : "#185FA5") : C.gray500, display:"flex", alignItems:"center", gap:4 }}><Icons.Bank size={12}/> CDS</div>
          <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
            {hasCds ? (
              <>
                <span style={{ fontSize:13, fontWeight:700, color: isDark ? "#93C5FD" : "#185FA5", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {user.cds_number}
                </span>
                {extraCount > 0 && (
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:8, background:"#185FA5", color:"#fff", flexShrink:0 }}>
                    +{extraCount}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize:12, color:C.gray400, fontStyle:"italic" }}>Not assigned</span>
            )}
          </div>
        </div>

        <div style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:12, padding:"10px 12px" }}>
          <div style={LBL}>Phone</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {user.phone || <span style={{ color:C.gray400, fontWeight:500, fontStyle:"italic" }}>—</span>}
          </div>
        </div>
      </div>

      {/* ── Row 3: Email full width ── */}
      <div style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:12, padding:"10px 12px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ color:C.gray400, flexShrink:0, display:"flex" }}><Icons.Mail size={16}/></span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={LBL}>Email</div>
          <div style={{ fontSize:13, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {user.email || <span style={{ color:C.gray400, fontWeight:500, fontStyle:"italic" }}>—</span>}
          </div>
        </div>
      </div>

      {/* ── Row 4: Change Role + Deactivate/Activate ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <button
          onClick={() => onChangeRole(user)}
          style={{ padding:"10px", borderRadius:10, border:`1px solid ${C.gray200}`, background:C.white, color:C.text, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor=C.green; e.currentTarget.style.color=C.green; e.currentTarget.style.background=`${C.green}10`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor=C.gray200; e.currentTarget.style.color=C.text; e.currentTarget.style.background=C.white; }}>
          <Icons.Shield size={16} /> Role
        </button>

        {user.role_code ? (
          <button
            onClick={() => onToggleStatus(user)}
            style={{ padding:"10px", borderRadius:10, border:`1px solid ${user.is_active ? (isDark ? `${C.red}44` : "#fecaca") : (isDark ? `${C.green}44` : "#bbf7d0")}`, background:user.is_active ? C.redBg : C.greenBg, color:user.is_active ? C.red : C.green, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"all 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.opacity="0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            {user.is_active ? <Icons.Ban size={16} /> : <Icons.CheckCircle size={16} />}
            {user.is_active ? "Deactivate" : "Activate"}
          </button>
        ) : (
          <div style={{ padding:"10px", borderRadius:10, border:`1px solid ${C.gray200}`, background:C.gray50, color:C.gray400, fontFamily:"inherit", fontWeight:700, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            No Role Set
          </div>
        )}
      </div>

    </div>
  );
});

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function App({ role = "SA", profile = {id: "me"}, showToast = () => {} }) {
  const { C, isDark } = useTheme();

  const SEARCH_INPUT_STYLE = useMemo(() => ({ ...inp(C), paddingLeft: 36 }), [C]);
  const SELECT_STYLE       = useMemo(() => ({ ...inp(C), width: "auto", cursor: "pointer", appearance: "none", paddingRight:32, backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(C.gray500)}' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center" }), [C]);
  const INVITE_BTN_STYLE   = useMemo(() => ({
    display: "flex", alignItems: "center", gap: 8, padding: "10px 18px",
    borderRadius: 10, border: "none", background: C.green, color: "#ffffff",
    fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
    boxShadow: `0 4px 12px ${C.green}44`, whiteSpace: "nowrap", transition:"all 0.2s"
  }), [C]);

  const theadBg = useMemo(
    () => isDark ? C.gray100 : "#F9FAFB",
    [isDark, C]
  );

  const [users, setUsers]                   = useState([]);
  const [roles, setRoles]                   = useState([]);
  const [callerCdsList, setCallerCdsList]   = useState([]);
  const [adScopeUserIds, setAdScopeUserIds] = useState(null);
  const [adScopeReady, setAdScopeReady]     = useState(false);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState(null);
  const [search, setSearch]                 = useState("");
  const [filterRole, setFilterRole]         = useState("ALL");
  const [filterStatus, setFilterStatus]     = useState("ALL");
  const [inviteOpen, setInviteOpen]         = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [toggleUser, setToggleUser]         = useState(null);
  const [manageCdsUser, setManageCdsUser]   = useState(null);

  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing]     = useState(false);

  const isMobile     = useIsMobile();
  const isMountedRef = useRef(true);
  const loadReqRef   = useRef(0);
  const cdsLoadRef   = useRef(0);
  const isAllowed    = ["SA","AD"].includes(role);

  const rootRef        = useRef(null);
  const touchStartYRef = useRef(null);
  const pullingRef     = useRef(false);
  const scrollHostRef  = useRef(null);

  useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

  const roleNameById = useMemo(() => Object.fromEntries(roles.map(r => [r.id, r.name])), [roles]);

  const loadData = useCallback(async ({ fromPull = false } = {}) => {
    const reqId = ++loadReqRef.current;
    if (!fromPull && isMountedRef.current) { setLoading(true); setError(null); }
    try {
      const [u, r] = await Promise.all([sbGetAllUsers(), sbGetRoles()]);
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      setUsers(u); setRoles(r); setError(null);
    } catch(e) {
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      if (!fromPull) setError(e.message);
      else showToast?.("Refresh failed", "error");
    } finally {
      if (isMountedRef.current && reqId === loadReqRef.current) {
        setLoading(false);
        if (fromPull) { setRefreshing(false); setPullDistance(0); }
      }
    }
  }, [showToast]);

  const refreshUsersQuiet = useCallback(async () => {
    const reqId = ++loadReqRef.current;
    try {
      const [u, r] = await Promise.all([sbGetAllUsers(), sbGetRoles()]);
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      setUsers(u); setRoles(r);
    } catch {}
  }, []);

  const loadCallerCds = useCallback(async () => {
    if (!isAllowed || !profile?.id) return;
    const reqId = ++cdsLoadRef.current;
    try {
      const list = await sbGetUserCDS(profile.id);
      if (!isMountedRef.current || reqId !== cdsLoadRef.current) return;
      setCallerCdsList(list || []);
      if (role === "AD") {
        if (!list || list.length === 0) {
          setAdScopeUserIds(new Set());
        } else {
          const results = await Promise.all(list.map(c => sbGetCDSAssignedUsers(c.cds_id).catch(() => [])));
          if (!isMountedRef.current || reqId !== cdsLoadRef.current) return;
          setAdScopeUserIds(new Set(results.flat().map(u => String(u.user_id))));
        }
      } else {
        setAdScopeUserIds(null);
      }
    } catch {
      if (!isMountedRef.current || reqId !== cdsLoadRef.current) return;
      if (role === "AD") setAdScopeUserIds(new Set());
    } finally {
      if (isMountedRef.current && reqId === cdsLoadRef.current) setAdScopeReady(true);
    }
  }, [isAllowed, profile?.id, role]);

  useEffect(() => { loadCallerCds(); }, [loadCallerCds]);
  useEffect(() => { if (!isAllowed) return; loadData(); }, [isAllowed, loadData]);

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
    if (!isMobile || refreshing || loading) return;
    const host = getScrollParent(rootRef.current);
    scrollHostRef.current = host;
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; return; }
    touchStartYRef.current = e.touches[0].clientY; pullingRef.current = false;
  }, [isMobile, refreshing, loading, getScrollParent]);

  const handleTouchMove = useCallback((e) => {
    if (!isMobile || refreshing || loading) return;
    if (touchStartYRef.current == null) return;
    const host = scrollHostRef.current || getScrollParent(rootRef.current);
    if ((host?.scrollTop || 0) > 0) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY <= 0) { pullingRef.current = false; setPullDistance(0); return; }
    pullingRef.current = true;
    setPullDistance(Math.min(92, Math.round(Math.pow(deltaY, 0.85))));
  }, [isMobile, refreshing, loading, getScrollParent]);

  const handleTouchEnd = useCallback(() => {
    if (!isMobile || refreshing || loading) { touchStartYRef.current = null; pullingRef.current = false; setPullDistance(0); return; }
    const shouldRefresh = pullingRef.current && pullDistance >= 64;
    touchStartYRef.current = null; pullingRef.current = false;
    if (shouldRefresh) { setPullDistance(56); setRefreshing(true); loadData({ fromPull: true }); }
    else setPullDistance(0);
  }, [isMobile, refreshing, loading, pullDistance, loadData]);

  const handleAssignRole = useCallback(async (userId, roleId) => {
    await sbAssignRole(userId, roleId);
    showToast(`Role updated to ${roleNameById[roleId] || "role"}`, "success");
    await loadData();
  }, [showToast, roleNameById, loadData]);

  const handleToggleActive = useCallback(async (user) => {
    if (user.is_active) {
      await sbDeactivateRole(user.id);
      showToast(`${user.full_name} deactivated`, "success");
    } else {
      if (!user.role_id) { showToast("No previous role — assign a role first", "error"); return; }
      await sbAssignRole(user.id, user.role_id);
      showToast(`${user.full_name} reactivated`, "success");
    }
    await loadData();
  }, [showToast, loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      if (role === "AD") {
        if (!adScopeReady) return false;
        if (adScopeUserIds !== null && !adScopeUserIds.has(String(u.id))) return false;
      }
      const roleLabel  = ROLE_META[u.role_code]?.label?.toLowerCase() || "";
      const roleCode   = (u.role_code || "").toLowerCase();
      const statusText = u.is_active ? "active" : "inactive";
      const matchSearch = !q
        || (u.full_name||"").toLowerCase().includes(q)
        || (u.cds_number||"").toLowerCase().includes(q)
        || (u.phone||"").toLowerCase().includes(q)
        || (u.email||"").toLowerCase().includes(q)
        || roleLabel.includes(q) || roleCode.includes(q) || statusText.includes(q);
      const matchRole   = filterRole === "ALL" || u.role_code === filterRole || (filterRole === "" && !u.role_code);
      const matchStatus = filterStatus === "ALL" || (filterStatus === "ACTIVE" && u.is_active) || (filterStatus === "INACTIVE" && !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, filterRole, filterStatus, role, adScopeUserIds, adScopeReady]);

  const stats = useMemo(() => ({
    total: users.length,
    activeCount: users.filter(u => u.is_active).length,
    noRoleCount: users.filter(u => !u.role_code).length,
  }), [users]);

  const handleOpenInvite      = useCallback(() => setInviteOpen(true), []);
  const handleCloseInvite     = useCallback(() => setInviteOpen(false), []);
  const handleCloseChangeRole = useCallback(() => setChangeRoleUser(null), []);
  const handleCloseToggle     = useCallback(() => setToggleUser(null), []);
  const handleCloseManageCds  = useCallback(() => setManageCdsUser(null), []);

  const pullReady = pullDistance >= 64;

  if (!isAllowed) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", backgroundColor: C.gray50 }}>
        <div style={{ textAlign:"center", background:C.white, padding:"40px", borderRadius:20, boxShadow:"0 8px 32px rgba(0,0,0,0.05)", border:`1px solid ${C.gray200}` }}>
          <div style={{ color:C.red, display:"flex", justifyContent:"center", marginBottom:16 }}><Icons.Lock size={48} /></div>
          <div style={{ fontWeight:800, fontSize:20, color:C.text }}>Access Restricted</div>
          <div style={{ fontSize:14, color:C.gray500, marginTop:8, maxWidth:280, lineHeight:1.5 }}>Only Admins and Super Admins can manage users.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", backgroundColor: C.gray50 }}>
        <div style={{ textAlign:"center", color:C.green, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
          <Icons.Spinner size={32} />
          <div style={{ fontSize:14, fontWeight:600, color:C.gray500 }}>Loading users...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 24, backgroundColor: C.gray50, height: "100vh" }}>
        <div style={{ background:C.redBg, border:`1px solid ${isDark ? `${C.red}44` : "#fecaca"}`, color:C.red, borderRadius:12, padding:16, fontSize:14, display:"flex", alignItems:"center", gap:12 }}>
          <Icons.Alert size={20} /> {error}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
      onTouchCancel={isMobile ? handleTouchEnd : undefined}
      style={{ height: isMobile ? "auto" : "100vh", padding: "24px", boxSizing: "border-box", backgroundColor: C.gray50, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden", position: "relative" }}
    >
      <style>{`
        body { margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif; background: #F9FAFB; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        .um-scroll::-webkit-scrollbar { width: 6px; }
        .um-scroll::-webkit-scrollbar-track { background: transparent; }
        .um-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .um-scroll { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
        input::placeholder { color: #9ca3af; }
        select option { font-weight: 500; }
      `}</style>

      {/* Pull-to-refresh indicator */}
      {isMobile && (
        <div style={{ position:"absolute", top:0, left:0, right:0, height:0, pointerEvents:"none", zIndex:3 }}>
          <div style={{ position:"absolute", left:"50%", top:0, transform:`translate(-50%, ${Math.max(8, pullDistance - 34)}px)`, opacity: refreshing || pullDistance > 6 ? 1 : 0, transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease", background: C.white, border: `1px solid ${pullReady || refreshing ? C.green : C.gray200}`, borderRadius: 999, padding:"8px 14px", boxShadow:"0 8px 24px rgba(0,0,0,0.08)", display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ display:"flex", color:refreshing||pullReady?C.green:C.gray400, transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`, transition:"transform 0.12s ease, color 0.12s ease" }}>
               {refreshing ? <Icons.Spinner size={16} /> : <Icons.ChevronDown size={16} />}
            </div>
            <span style={{ fontSize:12, fontWeight:700, color: refreshing ? C.green : (pullReady ? C.text : C.gray500), whiteSpace:"nowrap" }}>
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      {/* Transform wrapper */}
      <div style={{ transform: isMobile ? `translateY(${pullDistance}px)` : "none", transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"), willChange: isMobile ? "transform" : "auto", flex: isMobile ? "unset" : 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>

        {/* ══════════ MOBILE LAYOUT ══════════ */}
        {isMobile && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
              <StatCard label="Total Users" value={stats.total}       color={C.navy}  icon={<Icons.Users size={20}/>}/>
              <StatCard label="Active"      value={stats.activeCount} color={C.green} icon={<Icons.CheckCircle size={20}/>}/>
              <StatCard label="No Role"     value={stats.noRoleCount} color={C.gold}  icon={<Icons.Alert size={20}/>}/>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:16 }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, pointerEvents:"none", display:"flex" }}><Icons.Search size={16}/></span>
                <input placeholder="Search name, CDS, role..." value={search} onChange={e => setSearch(e.target.value)} {...MOBILE_INPUT_ATTRS}
                  style={{ width:"100%", height:44, borderRadius:12, border:`1px solid ${C.gray200}`, background:C.white, color:C.text, paddingLeft:36, fontSize:14, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                  onFocus={focusGreen(C)} onBlur={blurGray(C)}
                />
              </div>
              <button onClick={handleOpenInvite}
                style={{ height:44, padding:"0 16px", borderRadius:12, border:"none", background:C.green, color:"#ffffff", fontWeight:700, fontSize:14, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 4px 12px ${C.green}44`, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:6 }}>
                <Icons.Plus size={16}/> Invite
              </button>
            </div>

            <div style={{ fontSize:12, color:C.gray500, marginBottom:12, fontWeight:600, display:"flex", alignItems:"center" }}>
              {filtered.length} of {stats.total} user{stats.total!==1?"s":""}
              {search && <button onClick={() => setSearch("")} style={{ marginLeft:12, fontSize:12, color:isDark ? C.gray400 : C.navy, fontWeight:700, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Clear Filter</button>}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.gray400, background:C.white, borderRadius:16, border:`1px dashed ${C.gray200}` }}>
                <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}><Icons.Search size={32} color={C.gray300}/></div>
                <div style={{ fontSize:14, fontWeight:600 }}>No users match your search</div>
              </div>
            ) : (
              filtered.map(user => (
                <MobileUserCard key={user.id} user={user} onChangeRole={setChangeRoleUser} onManageCDS={setManageCdsUser} onToggleStatus={setToggleUser} />
              ))
            )}
          </div>
        )}

        {/* ══════════ DESKTOP LAYOUT ══════════ */}
        {!isMobile && (
          <>
            <div style={{ display:"flex", gap:10, marginBottom:16, flexShrink:0, flexWrap:"wrap" }}>
              <StatCard label="Total Users"   value={stats.total}                                      color={C.navy}   icon={<Icons.Users size={20}/>}/>
              <StatCard label="Active"        value={stats.activeCount}                                color={C.green}  icon={<Icons.CheckCircle size={20}/>}/>
              <StatCard label="No Role"       value={stats.noRoleCount}                                color={C.gold}   icon={<Icons.Alert size={20}/>}/>
              <StatCard label="Super Admins"  value={users.filter(u=>u.role_code==="SA").length||0}    color="#0A2540"  icon={<Icons.Key size={20}/>}/>
              <StatCard label="Data Entrants" value={users.filter(u=>u.role_code==="DE").length||0}    color="#2563EB"  icon={<Icons.Pen size={20}/>}/>
              <StatCard label="Verifiers"     value={users.filter(u=>u.role_code==="VR").length||0}    color="#7C3AED"  icon={<Icons.Check size={20}/>}/>
            </div>

            <div style={{ display:"flex", gap:10, marginBottom:16, flexShrink:0, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:200 }}>
                <span style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:C.gray400, display:"flex", pointerEvents:"none" }}><Icons.Search size={16}/></span>
                <input placeholder="Search by name, CDS, phone..." value={search} onChange={e=>setSearch(e.target.value)} style={SEARCH_INPUT_STYLE} onFocus={focusGreen(C)} onBlur={blurGray(C)}/>
              </div>
              <select value={filterRole}   onChange={e=>setFilterRole(e.target.value)}   onFocus={focusGreen(C)} onBlur={blurGray(C)} style={SELECT_STYLE}>
                <option value="ALL">All Roles</option>
                {Object.entries(ROLE_META).map(([c,m])=><option key={c} value={c}>{m.label}</option>)}
                <option value="">No Role</option>
              </select>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} style={SELECT_STYLE}>
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
              <span style={{ fontSize:12, fontWeight:600, color:C.gray500, background:C.white, border:`1px solid ${C.gray200}`, borderRadius:10, padding:"8px 14px", whiteSpace:"nowrap" }}>{filtered.length}/{stats.total}</span>
              <button onClick={handleOpenInvite} style={INVITE_BTN_STYLE} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="none"}>
                <Icons.Plus size={16}/> Invite User
              </button>
            </div>

            <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:16, overflow:"hidden", flex:1, display:"flex", flexDirection:"column", minHeight:0, minWidth:0, boxShadow:"0 4px 12px rgba(0,0,0,0.03)" }}>
              <div style={{ overflowX:"auto", flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
                <div style={{ display:"grid", gridTemplateColumns:GRID, padding:"12px 16px", minWidth:940, borderBottom:`1px solid ${C.gray200}`, background:theadBg, flexShrink:0 }}>
                  {["#","User","CDS Number","Account Type","Role","Phone Number","Email Address","Created","Actions"].map((h,i)=>(
                    <div key={i} style={{ fontSize:10, fontWeight:700, color:C.gray500, textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</div>
                  ))}
                </div>
                <div className="um-scroll" style={{ overflowY:"auto", flex:1 }}>
                  {filtered.length===0 ? (
                    <div style={{ padding:"60px 20px", textAlign:"center", color:C.gray400 }}>
                      <div style={{ display:"flex", justifyContent:"center", marginBottom:12 }}><Icons.Search size={40} color={C.gray300}/></div>
                      <div style={{ fontSize:15, fontWeight:600, color:C.text }}>No users found</div>
                      <div style={{ fontSize:13, marginTop:4 }}>Adjust your search or filters.</div>
                    </div>
                  ) : filtered.map((user,idx)=>(
                    <div key={user.id}
                      style={{ display:"grid", gridTemplateColumns:GRID, padding:"12px 16px", minWidth:940, borderBottom:`1px solid ${C.gray100}`, alignItems:"center", transition:"background 0.15s", opacity:user.is_active?1:0.6 }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.gray50}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    >
                      <div style={{ fontSize:12, color:C.gray500, fontWeight:600 }}>{idx+1}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
                        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={36}/>
                        <div style={{ minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.full_name||"New User"}</span>
                            <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:8, flexShrink:0, background:user.is_active ? C.greenBg : C.redBg, border:`1px solid ${user.is_active ? (isDark ? `${C.green}44` : "#bbf7d0") : (isDark ? `${C.red}44` : "#fecaca")}`, color:user.is_active ? C.green : C.red }}>{user.is_active?"Active":"Inactive"}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {user.cds_number || <span style={{ color:C.gray400, fontWeight:500 }}>—</span>}
                        </span>
                        {(user.cds_count && user.cds_count > 1) && (
                          <span style={{ fontSize:10, fontWeight:700, padding:"2px 6px", borderRadius:8, background:"#185FA5", color:"#fff", flexShrink:0 }}>
                            +{user.cds_count - 1}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:C.gray600 }}>{user.account_type||<span style={{ color:C.gray400 }}>—</span>}</div>
                      <div><RoleBadge code={user.role_code}/></div>
                      <div style={{ fontSize:12, color:C.gray600, fontWeight:500 }}>{user.phone||<span style={{ color:C.gray400 }}>—</span>}</div>
                      <div style={{ fontSize:12, color:C.gray500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email||"—"}</div>
                      <div style={{ fontSize:11, color:C.gray500 }}>{user.assigned_at?new Date(user.assigned_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—"}</div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => setChangeRoleUser(user)}
                          style={{ padding:"6px", borderRadius:8, border:`1px solid ${C.gray200}`, background:C.white, color:C.text, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", display:"flex", flexDirection:"column", alignItems:"center", gap:3, minWidth:44 }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.green;e.currentTarget.style.color=C.green;e.currentTarget.style.background=`${C.green}0a`;}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.gray200;e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.white;}}>
                          <Icons.Shield size={16} />
                          <span style={{ fontSize:9, fontWeight:700, lineHeight:1 }}>Role</span>
                        </button>
                        <button onClick={() => setManageCdsUser(user)}
                          style={{ padding:"6px", borderRadius:8, border:`1px solid ${isDark ? `${C.navy}44` : `${C.navy}33`}`, background:isDark ? `${C.navy}15` : C.navy+"0a", color:isDark ? "#93C5FD" : C.navy, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", display:"flex", flexDirection:"column", alignItems:"center", gap:3, minWidth:44 }}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.navy;e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor=C.navy;}}
                          onMouseLeave={e=>{e.currentTarget.style.background=isDark?`${C.navy}15`:C.navy+"0a";e.currentTarget.style.color=isDark?"#93C5FD":C.navy;e.currentTarget.style.borderColor=isDark?`${C.navy}44`:`${C.navy}33`;}}>
                          <Icons.Bank size={16} />
                          <span style={{ fontSize:9, fontWeight:700, lineHeight:1 }}>CDS</span>
                        </button>
                        {user.role_code && (
                          <button onClick={() => setToggleUser(user)}
                            style={{ padding:"6px", borderRadius:8, border:`1px solid ${user.is_active ? (isDark ? `${C.red}44` : "#fecaca") : (isDark ? `${C.green}44` : "#bbf7d0")}`, background:user.is_active ? C.redBg : C.greenBg, color:user.is_active ? C.red : C.green, cursor:"pointer", fontFamily:"inherit", transition:"all 0.2s", display:"flex", flexDirection:"column", alignItems:"center", gap:3, minWidth:44 }}
                            onMouseEnter={e=>e.currentTarget.style.opacity="0.7"}
                            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                            {user.is_active ? <Icons.Ban size={16}/> : <Icons.CheckCircle size={16}/>}
                            <span style={{ fontSize:9, fontWeight:700, lineHeight:1 }}>{user.is_active ? "Off" : "On"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      {/* Modals */}
      {inviteOpen && <InviteModal roles={roles} callerRole={role} callerCdsList={callerCdsList} onClose={handleCloseInvite} onSuccess={() => { loadData(); loadCallerCds(); }} showToast={showToast}/>}
      {changeRoleUser && <ChangeRoleModal user={changeRoleUser} roles={roles} callerRole={role} onClose={handleCloseChangeRole} onSave={async (uid, rid) => { await handleAssignRole(uid, rid); if (isMountedRef.current) setChangeRoleUser(null); }} showToast={showToast}/>}
      {toggleUser && <ToggleStatusModal user={toggleUser} onClose={handleCloseToggle} onConfirm={handleToggleActive} showToast={showToast}/>}
      {manageCdsUser && <ManageCDSModal user={manageCdsUser} callerRole={role} callerCdsList={callerCdsList} onClose={handleCloseManageCds} showToast={showToast} onRefresh={refreshUsersQuiet}/>}
    </div>
  );
}
