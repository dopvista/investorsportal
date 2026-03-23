// ── src/pages/UserManagementPage.jsx ──────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  sbGetAllUsers, sbGetRoles, sbAssignRole, sbDeactivateRole, sbAdminCreateUser,
  sbGetUserCDS, sbSearchCDS, sbCreateCDS, sbAssignCDS, sbRemoveCDS,
  sbRemoveCDSFromAdminCascade, sbGetCDSAssignedUsers,
} from "../lib/supabase";
import { useTheme } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Helpers ───────────────────────────────────────────────────────
const alpha = (hex, value) => `${hex}${value}`;

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

const ROLE_META = {
  SA: { label: "Super Admin",  bg: "#EEF4FB", border: "#CFE0F4", text: "#0B1F3A", darkBg: "#173252", darkBorder: "#31547D", darkText: "#D6E7FF" },
  AD: { label: "Admin",        bg: "#EDF6FF", border: "#C8DCF5", text: "#185FA5", darkBg: "#173A56", darkBorder: "#30607F", darkText: "#B9DBFF" },
  DE: { label: "Data Entrant", bg: "#EFF6FF", border: "#BFDBFE", text: "#1D4ED8", darkBg: "#172F63", darkBorder: "#3458A7", darkText: "#BFD7FF" },
  VR: { label: "Verifier",     bg: "#ECFDF3", border: "#BBF7D0", text: "#0F7A4A", darkBg: "#123A31", darkBorder: "#2B6C59", darkText: "#9DE7C0" },
  RO: { label: "Read Only",    bg: "#F4F6F8", border: "#D7DDE3", text: "#4B5565", darkBg: "#2B313A", darkBorder: "#4A5563", darkText: "#D7DEE7" },
};

const AVATAR_COLORS = ["#0A2540","#1E3A5F","#1D4ED8","#065F46","#374151","#7C3AED","#B45309","#0369A1"];
const GRID = "28px 1.5fr 0.9fr 0.8fr 0.8fr 1.1fr 1.3fr 90px 145px";

function inp(C, extra = {}) {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    fontSize: 13,
    border: `1.5px solid ${C.gray200}`,
    outline: "none",
    fontFamily: "inherit",
    background: C.white,
    color: C.text,
    transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
    boxSizing: "border-box",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    ...extra,
  };
}

const focusGreen = (C) => (e) => {
  e.target.style.borderColor = C.green;
  e.target.style.boxShadow = `0 0 0 3px ${alpha(C.green, "14")}`;
};
const blurGray = (C) => (e) => {
  e.target.style.borderColor = C.gray200;
  e.target.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04)";
};

const MOBILE_INPUT_ATTRS = {
  autoComplete: "off",
  autoCorrect: "off",
  autoCapitalize: "off",
  spellCheck: false,
  "data-form-type": "other",
  "data-lpignore": "true",
};

// ── Modal portal ──────────────────────────────────────────────────
const Modal = memo(function Modal({ title, subtitle, onClose, children, footer, maxWidth = 460, closeOnBackdrop = true }) {
  const { C } = useTheme();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  return createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(11,31,58,0.52)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: isMobile ? "18px 18px 0 0" : 20,
          border: `1.5px solid ${C.gray200}`,
          borderBottom: isMobile ? "none" : undefined,
          width: "100%",
          maxWidth: isMobile ? "100%" : maxWidth,
          maxHeight: isMobile ? "92vh" : undefined,
          boxShadow: "0 24px 64px rgba(0,0,0,0.25)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "fadeIn 0.2s ease",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        <div style={{
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`,
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 16 }}>{title}</div>
            {subtitle && <div style={{ color: "rgba(255,255,255,0.62)", fontSize: 12, marginTop: 3, fontWeight: 600, letterSpacing: "0.01em" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.14)", color: "#ffffff", width: 34, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px 4px", overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ display: "flex", gap: 8, padding: "16px 24px", flexShrink: 0, background: C.gray50, borderTop: `1px solid ${C.gray200}`, position: "sticky", bottom: 0 }}>
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
    <button
      onClick={onClose}
      style={{
        flex: 1,
        padding: "10px",
        borderRadius: 10,
        border: `1.5px solid ${C.gray200}`,
        background: C.white,
        color: C.text,
        fontWeight: 600,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.text; }}
    >Cancel</button>
  );
});

const ConfirmBtn = memo(function ConfirmBtn({ onClick, label, color, loading, disabled }) {
  const { C } = useTheme();
  const off = loading || disabled;
  const bg = color || C.green;
  return (
    <button
      onClick={onClick}
      disabled={off}
      style={{
        flex: 2,
        padding: "10px",
        borderRadius: 10,
        border: "none",
        background: off ? C.gray200 : `linear-gradient(135deg, ${bg}, ${bg})`,
        color: "#ffffff",
        fontWeight: 700,
        fontSize: 13,
        cursor: off ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        boxShadow: off ? "none" : `0 4px 12px ${alpha(bg, "33")}`,
      }}
    >{loading ? "Saving..." : label}</button>
  );
});

const Field = memo(function Field({ label, required, hint, children }) {
  const { C } = useTheme();
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.gray600, display: "block", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
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

  const createPanelBg  = isDark ? alpha(C.gold, "18") : "#FFF8E6";
  const createPanelBdr = isDark ? alpha(C.gold, "55") : "#F4D48A";
  const createTitleCol = isDark ? C.gold : "#9A6700";

  return (
    <div>
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", fontSize:13, color:C.gray400, pointerEvents:"none" }}>🔍</span>
        <input
          style={{ ...inp(C), paddingLeft:32 }}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); setSelected(null); onSelect(null); }}
          onFocus={focusGreen(C)}
          onBlur={blurGray(C)}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          name="cds_lookup"
          data-lpignore="true"
          data-form-type="other"
        />
        {searching && <span style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", fontSize:11, color:C.gray400 }}>...</span>}
      </div>

      {displayResults.length > 0 && !selected && (
        <div style={{ border:`1.5px solid ${C.gray200}`, borderRadius:10, marginTop:6, overflow:"hidden", maxHeight:220, overflowY:"auto", background:C.white, boxShadow:"0 10px 24px rgba(0,0,0,0.12)" }}>
          {displayResults.map(c => (
            <div key={c.id||c.cds_id||c.cds_number} onClick={() => handleSelect(c)}
              style={{ padding:"11px 14px", cursor:"pointer", borderBottom:`1px solid ${C.gray100}`, transition:"background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background=C.gray50}
              onMouseLeave={e => e.currentTarget.style.background="transparent"}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.cds_number}</div>
              <div style={{ fontSize:11, color:C.gray400, marginTop:1 }}>{c.cds_name}{c.phone ? ` · ${c.phone}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {isAD && !selected && query.trim().length > 1 && adFiltered.length === 0 && (
        <div style={{ marginTop:6, padding:"9px 11px", borderRadius:9, background:C.gray50, border:`1px solid ${C.gray200}`, fontSize:11, color:C.gray400 }}>🔍 No matching CDS in your pool</div>
      )}

      {(foundButExcluded || queryMatchesExcluded) && !selected && (
        <div style={{ marginTop:6, padding:"9px 11px", borderRadius:9, background:C.greenBg, border:`1px solid ${isDark ? alpha(C.green, "55") : "#BBF7D0"}`, fontSize:11, color:C.green, display:"flex", alignItems:"center", gap:6 }}>
          <span>✅</span> Already assigned to this user
        </div>
      )}

      {selected && (
        <div style={{ marginTop:8, padding:"9px 12px", borderRadius:10, background:alpha(C.green, "0d"), border:`1.5px solid ${alpha(C.green, "30")}`, display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:16 }}>✅</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{selected.cds_number}</div>
            <div style={{ fontSize:11, color:C.gray400 }}>{selected.cds_name}</div>
          </div>
          <button onClick={() => { setSelected(null); setQuery(""); onSelect(null); }} style={{ background:"none", border:"none", cursor:"pointer", color:C.gray400, fontSize:14, padding:2 }}>✕</button>
        </div>
      )}

      {showCreate && !isAD && !queryMatchesExcluded && query.trim().length > 2 && !selected && (
        <div style={{ marginTop:8, padding:"11px 12px", borderRadius:10, background:createPanelBg, border:`1.5px solid ${createPanelBdr}`, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:createTitleCol, marginBottom:8, display:"flex", alignItems:"center", gap:5 }}>
            <span>✨</span> Not found — create new CDS record
          </div>
          {createError && (
            <div style={{ fontSize:11, color:C.red, marginBottom:6, background:C.redBg, padding:"6px 9px", borderRadius:7, border:`1px solid ${isDark ? alpha(C.red, "55") : "#FECACA"}` }}>
              ⚠️ {createError}
            </div>
          )}
          <div style={{ display:"flex", gap:6, marginBottom:6 }}>
            <div style={{ flex:"0 0 auto" }}>
              <div style={{ fontSize:9, fontWeight:700, color:C.gray400, marginBottom:2, textTransform:"uppercase", letterSpacing:"0.04em" }}>Number *</div>
              <div style={{ display:"flex", alignItems:"center", border:`1.5px solid ${C.gray200}`, borderRadius:8, overflow:"hidden", background:C.white, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                <span style={{ padding:"6px 6px 6px 9px", fontSize:12, fontWeight:700, color:C.navy, background:alpha(C.navy, "0a"), borderRight:`1px solid ${C.gray200}`, whiteSpace:"nowrap", userSelect:"none" }}>CDS-</span>
                <input style={{ border:"none", outline:"none", padding:"6px 9px", fontSize:12, fontFamily:"inherit", width:80, background:"transparent", color:C.text }} placeholder="647305" value={createForm.cdsNumber.replace(/^CDS-/i,"")} onChange={e => setCreateForm(f => ({ ...f, cdsNumber:"CDS-"+e.target.value.replace(/[^0-9A-Za-z]/g,"").toUpperCase() }))} autoComplete="off" />
              </div>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:C.gray400, marginBottom:2, textTransform:"uppercase", letterSpacing:"0.04em" }}>Owner Name *</div>
              <input style={inp(C, { fontSize:12, padding:"6px 9px" })} placeholder="Full name" value={createForm.cdsName} onChange={e => setCreateForm(f => ({ ...f, cdsName:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
          </div>
          <div style={{ display:"flex", gap:6, marginBottom:8 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:C.gray400, marginBottom:2, textTransform:"uppercase", letterSpacing:"0.04em" }}>Phone</div>
              <input style={inp(C, { fontSize:12, padding:"6px 9px" })} placeholder="+255..." value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:C.gray400, marginBottom:2, textTransform:"uppercase", letterSpacing:"0.04em" }}>Email</div>
              <input style={inp(C, { fontSize:12, padding:"6px 9px" })} placeholder="owner@email.com" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email:e.target.value }))} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="off" />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating} style={{ width:"100%", padding:"8px", borderRadius:8, border:"none", background:creating?C.gray200:`linear-gradient(135deg, ${C.navy}, ${C.navyLight})`, color:"#ffffff", fontWeight:700, fontSize:12, cursor:creating?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:creating?"none":"0 4px 12px rgba(11,31,58,0.22)" }}>
            {creating ? "Creating..." : "✚ Create & Select CDS"}
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
  }, [mode, onSelect, onSelectMulti, selected]);

  const label = selected.length === 0
    ? `Select CDS account${mode==="multi"?"s":""} ▾`
    : mode==="single" ? selected[0].cds_number : `${selected.length} CDS selected ▾`;

  return (
    <div style={{ position:"relative" }}>
      <div onClick={() => available.length>0 && setOpen(o=>!o)} style={{ ...inp(C), display:"flex", alignItems:"center", justifyContent:"space-between", cursor:available.length>0?"pointer":"not-allowed", userSelect:"none", borderColor:open?C.green:C.gray200, borderRadius:open?"9px 9px 0 0":9, background:available.length===0?C.gray50:C.white, transition:"border-radius 0.15s, border 0.15s" }}>
        <span style={{ fontSize:13, color:selected.length>0?C.text:C.gray400 }}>{label}</span>
        <span style={{ fontSize:10, color:C.gray400, transform:open?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▼</span>
      </div>
      {open && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:999, border:`1.5px solid ${C.gray200}`, borderTop:"none", borderRadius:"0 0 9px 9px", background:C.white, overflow:"hidden", boxShadow:"0 12px 28px rgba(0,0,0,0.14)", maxHeight:220, overflowY:"auto" }}>
          {available.length===0 ? <div style={{ padding:"10px 14px", fontSize:12, color:C.gray400 }}>No available CDS in your pool</div>
          : available.map((c,i) => {
            const isSel=selected.some(s=>s.cds_number===c.cds_number);
            return (
              <div key={c.id||c.cds_id||c.cds_number} onClick={() => toggle(c)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", cursor:"pointer", background:isSel?alpha(C.green,"09"):"transparent", borderBottom:i<available.length-1?`1px solid ${C.gray100}`:"none", transition:"background 0.1s" }}
                onMouseEnter={e => { if(!isSel)e.currentTarget.style.background=C.gray50; }}
                onMouseLeave={e => { e.currentTarget.style.background=isSel?alpha(C.green,"09"):"transparent"; }}>
                <div style={{ width:16, height:16, borderRadius:mode==="single"?"50%":4, border:`2px solid ${isSel?C.green:C.gray200}`, background:isSel?C.green:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all 0.15s" }}>
                  {isSel&&<span style={{ color:"#ffffff", fontSize:9, fontWeight:900, lineHeight:1 }}>✓</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.cds_number}</div>
                  <div style={{ fontSize:11, color:C.gray400 }}>{c.cds_name||"—"}</div>
                </div>
              </div>
            );
          })}
          {mode==="multi" && selected.length>0 && (
            <div style={{ padding:"7px 14px", borderTop:`1px solid ${C.gray100}`, background:C.gray50, display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => setOpen(false)} style={{ padding:"4px 12px", borderRadius:7, border:"none", background:`linear-gradient(135deg, ${C.green}, ${C.greenLight || C.green})`, color:"#ffffff", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 4px 10px ${alpha(C.green,"33")}` }}>Done</button>
            </div>
          )}
        </div>
      )}
      {mode==="multi" && selected.length>0 && (
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:6 }}>
          {selected.map(c => (
            <span key={c.cds_number} style={{ display:"inline-flex", alignItems:"center", gap:4, background:alpha(C.green,"12"), border:`1px solid ${alpha(C.green,"30")}`, borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700, color:C.green }}>
              🔒 {c.cds_number}
              <button onClick={() => toggle(c)} style={{ background:"none", border:"none", cursor:"pointer", color:C.green, fontSize:11, padding:0, lineHeight:1 }}>✕</button>
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
        footer={<button onClick={onClose} style={{ flex:1, padding:"10px", borderRadius:10, border:`1.5px solid ${C.gray200}`, background:C.white, color:C.text, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:"inherit", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>Close</button>}
      >
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:isDark ? C.gray500 : C.gray600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8 }}>Assigned CDS</div>
          {loadingList
            ? <div style={{ textAlign:"center", padding:"16px 0", color:C.gray400, fontSize:12 }}>Loading...</div>
            : userCdsList.length===0
              ? <div style={{ textAlign:"center", padding:"16px 0", color:C.gray400, fontSize:12, background:C.gray50, borderRadius:10, border:`1px dashed ${C.gray200}` }}>No CDS accounts assigned yet</div>
              : <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {userCdsList.map(c => (
                    <div key={c.cds_id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:c.is_active?alpha(C.green,"09"):C.gray50, border:`1.5px solid ${c.is_active?alpha(C.green,"30"):C.gray200}`, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
                      <div style={{ width:30, height:30, borderRadius:8, background:c.is_active?alpha(C.green,"18"):alpha(C.navy,"10"), border:`1px solid ${c.is_active?alpha(C.green,"30"):alpha(C.navy,"15")}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0 }}>🔒</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.cds_number}</div>
                        <div style={{ fontSize:11, color:C.gray400 }}>{c.cds_name||"—"}</div>
                      </div>
                      {c.is_active && <span style={{ fontSize:10, fontWeight:700, background:C.greenBg, color:C.green, border:`1px solid ${isDark ? alpha(C.green,"40") : alpha(C.green,"25")}`, borderRadius:20, padding:"2px 8px", whiteSpace:"nowrap", flexShrink:0 }}>Active</span>}
                      <button onClick={() => handleRemove(c)} style={{ fontSize:11, fontWeight:600, background:C.redBg, color:C.red, border:"none", borderRadius:8, padding:"5px 10px", cursor:"pointer", fontFamily:"inherit", flexShrink:0 }} onMouseEnter={e=>e.currentTarget.style.opacity="0.75"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>Remove</button>
                    </div>
                  ))}
                </div>
          }
        </div>
        {isSA && (
          <>
            <div style={{ height:1, background:C.gray100, margin:"4px 0 14px" }}/>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:isDark ? C.gray500 : C.gray600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8 }}>Assign CDS</div>
              <CDSSearchBox key={searchBoxKey} callerRole={callerRole} adCdsList={[]} excludeCdsIds={userCdsList.map(c=>c.cds_id)} excludeCdsNumbers={userCdsList.map(c=>c.cds_number)} onSelect={setSelectedCds} placeholder="Search CDS number or owner name..." />
              {selectedCds && (
                <button onClick={handleAssign} disabled={assigning} style={{ marginTop:10, width:"100%", padding:"10px", borderRadius:9, border:"none", background:assigning?C.gray200:`linear-gradient(135deg, ${C.green}, ${C.greenLight || C.green})`, color:"#ffffff", fontWeight:700, fontSize:13, cursor:assigning?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:assigning?"none":`0 4px 12px ${alpha(C.green,"33")}`, display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
                  {assigning ? <><div style={{ width:12, height:12, border:"2px solid rgba(255,255,255,0.3)", borderTop:"2px solid #fff", borderRadius:"50%", animation:"spin 0.7s linear infinite" }}/>Assigning...</> : `Assign ${selectedCds.cds_number}`}
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
      onClose={onClose} maxWidth={480}
      footer={
        <><CancelBtn onClose={onClose}/>{canConfirm
          ? <ConfirmBtn onClick={handleConfirm} label="Confirm Remove" color={C.red} loading={saving}/>
          : <div style={{ flex:2, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.gray400, fontStyle:"italic" }}>← Choose an option above</div>
        }</>
      }
    >
      {loading
        ? <div style={{ textAlign:"center", padding:"20px 0", color:C.gray400, fontSize:12 }}>Checking affected users...</div>
        : affectedUsers.length === 0 ? (
          <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🗑️</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text, marginBottom:6 }}>Remove {cdsEntry.cds_number}?</div>
            <div style={{ fontSize:13, color:C.gray400, lineHeight:1.6 }}>No other users are assigned this CDS under <strong style={{ color:C.text }}>{admin.full_name}</strong>. It will simply be removed.</div>
          </div>
        ) : (
          <div>
            <div style={{ padding:"10px 14px", borderRadius:10, background:C.redBg, border:`1px solid ${isDark ? alpha(C.red,"55") : "#FECACA"}`, marginBottom:14, fontSize:13, color:C.red }}>
              ⚠️ <strong>{affectedUsers.length} user{affectedUsers.length>1?"s":""}</strong> assigned by this admin also have <strong>{cdsEntry.cds_number}</strong>.
            </div>
            <div style={{ maxHeight:140, overflowY:"auto", marginBottom:14, border:`1px solid ${C.gray200}`, borderRadius:10, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
              {affectedUsers.map((u,i) => (
                <div key={u.user_id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 12px", background:i%2?C.gray50:C.white, borderBottom:i<affectedUsers.length-1?`1px solid ${C.gray100}`:"none" }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:C.gray100, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:C.text, flexShrink:0 }}>{(u.full_name||"?")[0]?.toUpperCase()}</div>
                  <div style={{ flex:1, fontSize:12, fontWeight:600, color:C.text }}>{u.full_name||"—"}</div>
                  <span style={{ fontSize:10, fontWeight:700, color:C.gray400 }}>{u.role_code||"—"}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, fontWeight:700, color:isDark ? C.gray500 : C.gray600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8 }}>What to do with their access?</div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:4 }}>
              {[
                { val:false, icon:"🔒", label:"Remove from admin only", desc:"Users keep their CDS access" },
                { val:true,  icon:"🗑️", label:"Remove from all users too", desc:"All listed users lose this CDS" }
              ].map(opt => (
                <button key={String(opt.val)} onClick={() => setCascade(opt.val)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`2px solid ${cascade===opt.val ? (opt.val ? C.red : C.navy) : C.gray200}`, background:cascade===opt.val ? (opt.val ? C.redBg : alpha(C.navy,"08")) : C.white, transition:"all 0.15s", boxShadow:cascade===opt.val?"0 4px 12px rgba(0,0,0,0.05)":"none" }}>
                  <span style={{ fontSize:18, flexShrink:0 }}>{opt.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:C.gray400, marginTop:1 }}>{opt.desc}</div>
                  </div>
                  <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${cascade===opt.val ? (opt.val ? C.red : C.navy) : C.gray200}`, background:cascade===opt.val ? (opt.val ? C.red : C.navy) : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                    {cascade===opt.val && <div style={{ width:6, height:6, borderRadius:"50%", background:"#ffffff" }}/>}
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
    <Modal title="Change Role" subtitle={`Assigning to ${user.full_name||"user"}`} onClose={onClose} footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleSave} label="✓  Save Role" loading={saving}/></>}>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, background:C.gray50, border:`1px solid ${C.gray200}`, marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={34}/>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{user.full_name||"User"}</div>
          <div style={{ fontSize:11, color:C.gray400 }}>{user.cds_number||"No CDS"}</div>
        </div>
        {user.role_code && <RoleBadge code={user.role_code}/>}
      </div>
      <div style={{ fontSize:11, fontWeight:700, color:isDark ? C.gray500 : C.gray600, textTransform:"uppercase", letterSpacing:"0.04em", marginBottom:8 }}>Select New Role</div>
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:4 }}>
        {available.map(r => {
          const m = ROLE_META[r.code];
          const checked = String(sel) === String(r.id);
          return (
            <button key={r.id} onClick={() => setSel(r.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left", border:`2px solid ${checked ? (isDark ? m.darkText : m.text) : C.gray200}`, background:checked ? (isDark ? m.darkBg : m.bg) : C.white, transition:"all 0.15s", boxShadow:checked?"0 4px 12px rgba(0,0,0,0.05)":"none" }}>
              <div style={{ width:16, height:16, borderRadius:"50%", border:`2px solid ${checked ? (isDark ? m.darkText : m.text) : C.gray200}`, background:checked ? (isDark ? m.darkText : m.text) : "transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                {checked && <div style={{ width:6, height:6, borderRadius:"50%", background:"#ffffff" }}/>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{r.name}</div>
                {r.description && <div style={{ fontSize:11, color:C.gray400, marginTop:1 }}>{r.description}</div>}
              </div>
              <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:6, background:isDark ? m.darkBg : m.bg, border:`1px solid ${isDark ? m.darkBorder : m.border}`, color:isDark ? m.darkText : m.text }}>{r.code}</span>
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
      footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleConfirm} label={deactivating ? "Yes, Deactivate" : "Yes, Reactivate"} color={deactivating ? C.red : C.green} loading={saving}/></>}
    >
      <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
        <div style={{ fontSize:40, marginBottom:10 }}>{deactivating ? "🚫" : "✅"}</div>
        <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:8 }}>{deactivating ? `Deactivate ${user.full_name}?` : `Reactivate ${user.full_name}?`}</div>
        <div style={{ fontSize:13, color:C.gray400, lineHeight:1.7 }}>
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
        showToast(
          `User account created but role assignment failed: ${roleErr.message}. Find the user and set their role manually.`,
          "error"
        );
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
          showToast(
            `User created, but ${cdsFailCount} CDS assignment${cdsFailCount > 1 ? "s" : ""} failed. Use "Manage CDS" on the user to fix.`,
            "error"
          );
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
    <Modal title="Invite New User" subtitle="Create an account and assign a role" onClose={onClose} closeOnBackdrop={false} footer={<><CancelBtn onClose={onClose}/><ConfirmBtn onClick={handleSubmit} label="Create & Invite" loading={saving}/></>}>
      {error && (
        <div style={{ background:C.redBg, border:`1px solid ${isDark ? alpha(C.red,"55") : "#FECACA"}`, color:C.red, borderRadius:10, padding:"10px 14px", fontSize:13, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          <span>⚠️</span> {error}
        </div>
      )}
      <Field label="Email Address" required>
        <input style={inp(C)} type="email" placeholder="user@example.com" value={form.email} onChange={e=>set("email", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)}/>
      </Field>
      <Field label="CDS Account" required hint={isAD ? (callerCdsList?.length===1 ? "Auto-assigned from your account" : "Select one or more CDS from your pool") : "Search existing CDS or create a new one"}>
        {isAD && callerCdsList?.length === 1 && selectedCds ? (
          <div style={{ padding:"10px 12px", borderRadius:10, background:alpha(C.green,"08"), border:`1.5px solid ${alpha(C.green,"30")}`, display:"flex", alignItems:"center", gap:8, boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <span style={{ fontSize:13 }}>🔒</span>
            <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:C.green }}>{selectedCds.cds_number}</div><div style={{ fontSize:11, color:C.gray400 }}>{selectedCds.cds_name}</div></div>
            <span style={{ fontSize:10, fontWeight:700, color:C.green }}>Auto-selected</span>
          </div>
        ) : isAD && (callerCdsList?.length ?? 0) > 1 ? (
          <CDSPoolPicker pool={callerCdsList||[]} mode="multi" onSelectMulti={setSelectedCdsMulti}/>
        ) : (
          <CDSSearchBox callerRole={callerRole} adCdsList={[]} onSelect={setSelectedCds} placeholder="Search CDS number or owner name..."/>
        )}
      </Field>
      <div style={{ height:1, background:C.gray100, margin:"4px 0 14px" }}/>
      <Field label="Temporary Password" required hint="Share this with the user — they can change it after first login">
        <input style={inp(C)} type="password" placeholder="Min 8 chars, upper, lower, number, symbol" value={form.password} onChange={e=>set("password", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} autoComplete="new-password" name="invite_temp_password" data-lpignore="true" data-form-type="other"/>
        {form.password.length > 0 && (
          <div style={{ display:"flex", gap:3, flexWrap:"nowrap", marginTop:6, alignItems:"center" }}>
            {passwordChecks.map(c => (
              <span key={c.label} style={{
                flex:"1 1 0", minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                textAlign:"center", fontSize:9, fontWeight:700, padding:"2px 4px", borderRadius:999,
                background: c.ok ? (isDark ? alpha(C.green,"22") : "#DCFCE7") : (isDark ? alpha(C.red,"22") : "#FEE2E2"),
                color:       c.ok ? (isDark ? C.green : "#166534")        : (isDark ? C.red  : "#991B1B"),
                border:     `1px solid ${c.ok ? (isDark ? alpha(C.green,"55") : "#BBF7D0") : (isDark ? alpha(C.red,"55") : "#FECACA")}`,
              }}>
                {c.ok ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
        )}
      </Field>
      <Field label="Assign Role" required>
        <select style={{ ...inp(C), cursor:"pointer", appearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 12px center", paddingRight:32 }} value={form.role_id} onChange={e=>set("role_id", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)}>
          <option value="">Select a role...</option>
          {allowedRoles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
        </select>
      </Field>
    </Modal>
  );
});

// ── Role badge / User avatar / Stat card ──────────────────────────
const RoleBadge = memo(function RoleBadge({ code }) {
  const { C, isDark } = useTheme();
  const m = ROLE_META[code];
  if (!m) return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20,
      background: isDark ? alpha(C.gold,"22") : "#FFF8E6",
      border: `1px solid ${isDark ? alpha(C.gold,"55") : "#F4D48A"}`,
      color: C.gold, whiteSpace:"nowrap" }}>No Role</span>
  );
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:20,
      background: isDark ? m.darkBg   : m.bg,
      border:    `1px solid ${isDark ? m.darkBorder : m.border}`,
      color:      isDark ? m.darkText : m.text,
      whiteSpace: "nowrap" }}>{m.label}</span>
  );
});

const UserAvatar = memo(function UserAvatar({ name, avatarUrl, isActive, size=34 }) {
  const { C } = useTheme();
  return (
    <div style={{ position:"relative", flexShrink:0, width:size, height:size }}>
      {avatarUrl ? <img src={avatarUrl} alt={name||"User"} style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", display:"block", border:`1.5px solid ${C.gray200}`, boxShadow:"0 2px 6px rgba(0,0,0,0.08)" }} onError={e => { e.target.style.display="none"; if(e.target.nextSibling) e.target.nextSibling.style.display="block"; }}/> : null}
      <img src={logo} alt="logo" style={{ width:size, height:size, borderRadius:"50%", objectFit:"cover", display:avatarUrl ? "none" : "block", border:`1.5px solid ${C.gray200}`, boxShadow:"0 2px 6px rgba(0,0,0,0.08)" }}/>
      <div style={{ position:"absolute", bottom:-1, right:-1, width:9, height:9, borderRadius:"50%", border:`2px solid ${C.white}`, background:isActive ? C.green : C.gray200 }}/>
    </div>
  );
});

const StatCard = memo(function StatCard({ label, value, color, icon }) {
  const { C } = useTheme();
  return (
    <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:12, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, flex:1, minWidth:90, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ width:34, height:34, borderRadius:10, flexShrink:0, background:alpha(color,"18"), border:`1px solid ${alpha(color,"28")}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>{icon}</div>
      <div>
        <div style={{ fontSize:18, fontWeight:800, color:C.text, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:10, color:C.gray400, marginTop:2 }}>{label}</div>
      </div>
    </div>
  );
});

// ── Mobile User Card ──────────────────────────────────────────────
const MobileUserCard = memo(function MobileUserCard({ user, onChangeRole, onManageCDS, onToggleStatus }) {
  const { C, isDark } = useTheme();
  const hasCds      = !!user.cds_number;
  const extraCount  = (user.cds_count && user.cds_count > 1) ? user.cds_count - 1 : 0;
  const inactiveBorder = isDark ? alpha(C.red,"55") : "#FECACA";
  const LBL = { fontSize:9, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.06em", color:C.gray400, marginBottom:2 };

  return (
    <div style={{ background:C.white, border:`1px solid ${user.is_active ? C.gray200 : inactiveBorder}`, borderRadius:14, padding:"12px 14px", marginBottom:8, opacity:user.is_active ? 1 : 0.82, boxShadow:"0 1px 5px rgba(0,0,0,0.05)" }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={38}/>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:700, fontSize:14, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:4 }}>
            {user.full_name || "New User"}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, fontWeight:700, padding:"1px 7px", borderRadius:20, background:user.is_active ? C.greenBg : C.redBg, border:`1px solid ${user.is_active ? (isDark ? alpha(C.green,"55") : "#BBF7D0") : (isDark ? alpha(C.red,"55") : "#FECACA")}`, color:user.is_active ? C.green : C.red }}>
              {user.is_active ? "Active" : "Inactive"}
            </span>
            <RoleBadge code={user.role_code}/>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom:6 }}>
        <div
          onClick={() => onManageCDS(user)}
          style={{
            background: hasCds ? (isDark ? alpha(C.navy,"22") : "#F3F8FE") : C.gray50,
            border: `1px solid ${hasCds ? (isDark ? alpha(C.navy,"55") : "#C8DCF5") : C.gray200}`,
            borderRadius:10, padding:"8px 10px", cursor:"pointer",
          }}
        >
          <div style={{ ...LBL, color: hasCds ? (isDark ? "#93C5FD" : "#185FA5") : C.gray400 }}>CDS</div>
          <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
            {hasCds ? (
              <>
                <span style={{ fontSize:12, fontWeight:700, color: isDark ? "#93C5FD" : "#185FA5", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                  {user.cds_number}
                </span>
                {extraCount > 0 && (
                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:20, background:"#185FA5", color:"#fff", flexShrink:0 }}>
                    +{extraCount}
                  </span>
                )}
              </>
            ) : (
              <span style={{ fontSize:11, color:C.gray400, fontStyle:"italic" }}>Not assigned</span>
            )}
          </div>
        </div>

        <div style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:10, padding:"8px 10px" }}>
          <div style={LBL}>Phone</div>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {user.phone || <span style={{ color:C.gray400, fontWeight:400, fontStyle:"italic" }}>—</span>}
          </div>
        </div>
      </div>

      <div style={{ background:C.gray50, border:`1px solid ${C.gray200}`, borderRadius:10, padding:"8px 10px", marginBottom:10, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:13, flexShrink:0 }}>✉️</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={LBL}>Email</div>
          <div style={{ fontSize:12, fontWeight:700, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {user.email || <span style={{ color:C.gray400, fontWeight:400, fontStyle:"italic" }}>—</span>}
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
        <button
          onClick={() => onChangeRole(user)}
          style={{ padding:"9px 8px", borderRadius:9, border:`1px solid ${C.gray200}`, background:C.white, color:C.text, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:6, boxShadow:"0 1px 3px rgba(0,0,0,0.03)" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor=C.green; e.currentTarget.style.color=C.green; e.currentTarget.style.background=alpha(C.green,"10"); }}
          onMouseLeave={e => { e.currentTarget.style.borderColor=C.gray200; e.currentTarget.style.color=C.text; e.currentTarget.style.background=C.white; }}>
          <span style={{ fontSize:14 }}>✏️</span> Change Role
        </button>

        {user.role_code ? (
          <button
            onClick={() => onToggleStatus(user)}
            style={{ padding:"9px 8px", borderRadius:9, border:`1px solid ${user.is_active ? (isDark ? alpha(C.red,"55") : "#FECACA") : (isDark ? alpha(C.green,"55") : "#BBF7D0")}`, background:user.is_active ? C.redBg : C.greenBg, color:user.is_active ? C.red : C.green, cursor:"pointer", fontFamily:"inherit", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}
            onMouseEnter={e => e.currentTarget.style.opacity="0.8"}
            onMouseLeave={e => e.currentTarget.style.opacity="1"}>
            <span style={{ fontSize:14 }}>{user.is_active ? "🚫" : "✅"}</span>
            {user.is_active ? "Deactivate" : "Activate"}
          </button>
        ) : (
          <div style={{ padding:"9px 8px", borderRadius:9, border:`1px solid ${C.gray200}`, background:C.gray50, color:C.gray400, fontFamily:"inherit", fontWeight:700, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
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
export default function UserManagementPage({ role, showToast, profile }) {
  const { C, isDark } = useTheme();

  const SEARCH_INPUT_STYLE = useMemo(() => inp(C, { paddingLeft: 28 }), [C]);
  const SELECT_STYLE       = useMemo(() => ({ ...inp(C), width: "auto", cursor: "pointer" }), [C]);
  const INVITE_BTN_STYLE   = useMemo(() => ({
    display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
    borderRadius: 9, border: "none", background: `linear-gradient(135deg, ${C.green}, ${C.greenLight || C.green})`, color: "#ffffff",
    fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
    boxShadow: `0 4px 12px ${alpha(C.green,"33")}`, whiteSpace: "nowrap",
  }), [C]);

  const theadBg = useMemo(() => C.gray50, [C]);

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
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"60vh" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:44, marginBottom:10 }}>🔒</div>
          <div style={{ fontWeight:800, fontSize:16, color:C.text }}>Access Restricted</div>
          <div style={{ fontSize:12, color:C.gray400, marginTop:4 }}>Only Admins and Super Admins can manage users.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"40vh" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign:"center", color:C.gray400 }}>
          <div style={{ width:20, height:20, border:`3px solid ${C.gray200}`, borderTop:`3px solid ${C.green}`, borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }}/>
          <div style={{ fontSize:12 }}>Loading users...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background:C.redBg, border:`1px solid ${isDark ? alpha(C.red,"55") : "#FECACA"}`, color:C.red, borderRadius:12, padding:14, fontSize:12 }}>
        ⚠️ {error}
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
      style={{ height: isMobile ? "auto" : "calc(100vh - 118px)", display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden", position: "relative", paddingBottom: isMobile ? 96 : 0 }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        .um-scroll::-webkit-scrollbar { width: 4px; }
        .um-scroll::-webkit-scrollbar-track { background: transparent; }
        .um-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .um-scroll { scrollbar-width: thin; scrollbar-color: #e5e7eb transparent; }
        input::placeholder { color: #9ca3af; }
        select option { font-weight: 500; }
      `}</style>

      {isMobile && (
        <div style={{ position:"absolute", top:0, left:0, right:0, height:0, pointerEvents:"none", zIndex:3 }}>
          <div style={{ position:"absolute", left:"50%", top:0, transform:`translate(-50%, ${Math.max(8, pullDistance - 34)}px)`, opacity: refreshing || pullDistance > 6 ? 1 : 0, transition: refreshing ? "none" : "transform 0.12s ease, opacity 0.12s ease", background: C.white, border: `1.5px solid ${pullReady || refreshing ? C.green : C.gray200}`, borderRadius: 999, padding:"7px 12px", boxShadow:"0 8px 24px rgba(0,0,0,0.08)", display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:14, height:14, borderRadius:"50%", border: `2px solid ${refreshing ? alpha(C.green,"33") : C.gray200}`, borderTop: `2px solid ${pullReady || refreshing ? C.green : C.gray400}`, animation: refreshing ? "spin 0.8s linear infinite" : "none", transform: refreshing ? "none" : `rotate(${Math.min(180, pullDistance * 3)}deg)`, transition:"transform 0.12s ease, border-color 0.12s ease", flexShrink:0 }}/>
            <span style={{ fontSize:11, fontWeight:700, color: refreshing ? C.green : (pullReady ? C.text : C.gray500), whiteSpace:"nowrap" }}>
              {refreshing ? "Refreshing..." : pullReady ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}

      <div style={{ transform: isMobile ? `translateY(${pullDistance}px)` : "none", transition: refreshing ? "none" : (pullDistance === 0 ? "transform 0.18s ease" : "none"), willChange: isMobile ? "transform" : "auto", flex: isMobile ? "unset" : 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: isMobile ? "visible" : "hidden" }}>

        {isMobile && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
              <StatCard label="Total Users" value={stats.total}       color={C.navy}  icon="👥"/>
              <StatCard label="Active"      value={stats.activeCount} color={C.green} icon="✅"/>
              <StatCard label="No Role"     value={stats.noRoleCount} color={C.gold}  icon="⚠️"/>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:12 }}>
              <div style={{ flex:1, position:"relative" }}>
                <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.gray400, pointerEvents:"none" }}>🔍</span>
                <input placeholder="Search name, CDS, role, status..." value={search} onChange={e => setSearch(e.target.value)} {...MOBILE_INPUT_ATTRS}
                  style={{ width:"100%", height:40, borderRadius:9, border:`1.5px solid ${C.gray200}`, background:C.white, color:C.text, paddingLeft:28, fontSize:13, outline:"none", boxSizing:"border-box", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}
                  onFocus={focusGreen(C)} onBlur={blurGray(C)}
                />
              </div>
              <button onClick={handleOpenInvite}
                style={{ height:40, padding:"0 14px", borderRadius:9, border:"none", background:`linear-gradient(135deg, ${C.green}, ${C.greenLight || C.green})`, color:"#ffffff", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit", boxShadow:`0 4px 12px ${alpha(C.green,"33")}`, whiteSpace:"nowrap", display:"flex", alignItems:"center", gap:5 }}>
                + Invite
              </button>
            </div>

            <div style={{ fontSize:11, color:C.gray400, marginBottom:8, fontWeight:600 }}>
              {filtered.length} of {stats.total} user{stats.total!==1?"s":""}
              {search && <button onClick={() => setSearch("")} style={{ marginLeft:10, fontSize:11, color:C.navy, fontWeight:700, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}>Clear</button>}
            </div>

            {filtered.length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 20px", color:C.gray400 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
                <div style={{ fontSize:13 }}>No users match your search</div>
              </div>
            ) : (
              filtered.map(user => (
                <MobileUserCard key={user.id} user={user} onChangeRole={setChangeRoleUser} onManageCDS={setManageCdsUser} onToggleStatus={setToggleUser} />
              ))
            )}
          </div>
        )}

        {!isMobile && (
          <>
            <div style={{ display:"flex", gap:8, marginBottom:10, flexShrink:0, flexWrap:"wrap" }}>
              <StatCard label="Total Users"   value={stats.total}                                          color={C.navy}   icon="👥"/>
              <StatCard label="Active"        value={stats.activeCount}                                    color={C.green}  icon="✅"/>
              <StatCard label="No Role"       value={stats.noRoleCount}                                    color={C.gold}   icon="⚠️"/>
              <StatCard label="Super Admins"  value={users.filter(u=>u.role_code==="SA").length||0}        color="#0A2540"  icon="🔑"/>
              <StatCard label="Data Entrants" value={users.filter(u=>u.role_code==="DE").length||0}        color="#1D4ED8"  icon="✏️"/>
              <StatCard label="Verifiers"     value={users.filter(u=>u.role_code==="VR").length||0}        color="#0F7A4A"  icon="✔️"/>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:10, flexShrink:0, alignItems:"center", flexWrap:"wrap" }}>
              <div style={{ position:"relative", flex:1, minWidth:180 }}>
                <span style={{ position:"absolute", left:9, top:"50%", transform:"translateY(-50%)", fontSize:12, color:C.gray400, pointerEvents:"none" }}>🔍</span>
                <input placeholder="Search by name, CDS or phone..." value={search} onChange={e=>setSearch(e.target.value)} style={SEARCH_INPUT_STYLE} onFocus={focusGreen(C)} onBlur={blurGray(C)}/>
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
              <span style={{ fontSize:11, color:C.gray400, background:C.white, border:`1px solid ${C.gray200}`, borderRadius:8, padding:"5px 10px", whiteSpace:"nowrap", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>{filtered.length}/{stats.total}</span>
              <button onClick={handleOpenInvite} style={INVITE_BTN_STYLE} onMouseEnter={e=>e.currentTarget.style.opacity="0.9"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>+ Invite User</button>
            </div>

            <div style={{ background:C.white, border:`1px solid ${C.gray200}`, borderRadius:14, overflow:"hidden", flex:1, display:"flex", flexDirection:"column", minHeight:0, minWidth:0, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
              <div style={{ overflowX:"auto", flex:1, display:"flex", flexDirection:"column", minHeight:0 }}>
                <div style={{ display:"grid", gridTemplateColumns:GRID, padding:"9px 14px", minWidth:940, borderBottom:`1px solid ${C.gray200}`, background:theadBg, flexShrink:0 }}>
                  {["#","User","CDS Number","Account Type","Role","Phone Number","Email Address","Created","Actions"].map((h,i)=>(
                    <div key={i} style={{ fontSize:9, fontWeight:700, color:C.gray400, textTransform:"uppercase", letterSpacing:"0.07em" }}>{h}</div>
                  ))}
                </div>
                <div className="um-scroll" style={{ overflowY:"auto", flex:1 }}>
                  {filtered.length===0 ? (
                    <div style={{ padding:"40px 20px", textAlign:"center", color:C.gray400 }}>
                      <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
                      <div style={{ fontSize:13 }}>No users match your search</div>
                    </div>
                  ) : filtered.map((user,idx)=>(
                    <div key={user.id}
                      style={{ display:"grid", gridTemplateColumns:GRID, padding:"10px 14px", minWidth:940, borderBottom:`1px solid ${C.gray100}`, alignItems:"center", transition:"background 0.12s", opacity:user.is_active?1:0.62 }}
                      onMouseEnter={e=>e.currentTarget.style.background=C.gray50}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                    >
                      <div style={{ fontSize:11, color:C.gray400, fontWeight:600 }}>{idx+1}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:8, minWidth:0 }}>
                        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={32}/>
                        <div style={{ minWidth:0 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.full_name||"New User"}</span>
                            <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:20, flexShrink:0, background:user.is_active ? C.greenBg : C.redBg, border:`1px solid ${user.is_active ? (isDark ? alpha(C.green,"55") : "#BBF7D0") : (isDark ? alpha(C.red,"55") : "#FECACA")}`, color:user.is_active ? C.green : C.red }}>{user.is_active?"Active":"Inactive"}</span>
                          </div>
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:5, minWidth:0 }}>
                        <span style={{ fontSize:11, fontWeight:600, color:C.text, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                          {user.cds_number || <span style={{ color:C.gray400 }}>—</span>}
                        </span>
                        {(user.cds_count && user.cds_count > 1) && (
                          <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:20, background:"#185FA5", color:"#fff", flexShrink:0 }}>
                            +{user.cds_count - 1}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:C.text }}>{user.account_type||<span style={{ color:C.gray400 }}>—</span>}</div>
                      <div><RoleBadge code={user.role_code}/></div>
                      <div style={{ fontSize:11, color:C.text }}>{user.phone||<span style={{ color:C.gray400 }}>—</span>}</div>
                      <div style={{ fontSize:11, color:C.gray400, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email||"—"}</div>
                      <div style={{ fontSize:10, color:C.gray400 }}>{user.assigned_at?new Date(user.assigned_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"2-digit"}):"—"}</div>
                      <div style={{ display:"flex", gap:4 }}>
                        <button onClick={() => setChangeRoleUser(user)}
                          style={{ padding:"4px 7px", borderRadius:8, border:`1.5px solid ${C.gray200}`, background:C.white, color:C.text, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s", display:"flex", flexDirection:"column", alignItems:"center", gap:1, minWidth:36, boxShadow:"0 1px 3px rgba(0,0,0,0.03)" }}
                          onMouseEnter={e=>{e.currentTarget.style.borderColor=C.green;e.currentTarget.style.color=C.green;e.currentTarget.style.background=alpha(C.green,"10");}}
                          onMouseLeave={e=>{e.currentTarget.style.borderColor=C.gray200;e.currentTarget.style.color=C.text;e.currentTarget.style.background=C.white;}}>
                          <span style={{ fontSize:13 }}>✏️</span>
                          <span style={{ fontSize:9, fontWeight:700, lineHeight:1 }}>Role</span>
                        </button>
                        <button onClick={() => setManageCdsUser(user)}
                          style={{ padding:"4px 7px", borderRadius:8, border:`1.5px solid ${isDark ? alpha(C.navy,"60") : alpha(C.navy,"40")}`, background:isDark ? alpha(C.navy,"20") : alpha(C.navy,"0d"), color:isDark ? "#93C5FD" : C.navy, cursor:"pointer", fontFamily:"inherit", transition:"all 0.12s", display:"flex", flexDirection:"column", alignItems:"center", gap:1, minWidth:36 }}
                          onMouseEnter={e=>{e.currentTarget.style.background=C.navy;e.currentTarget.style.color="#ffffff";e.currentTarget.style.borderColor=C.navy;}}
                          onMouseLeave={e=>{e.currentTarget.style.background=isDark?alpha(C.navy,"20"):alpha(C.navy,"0d");e.currentTarget.style.color=isDark?"#93C5FD":C.navy;e.currentTarget.style.borderColor=isDark?alpha(C.navy,"60"):alpha(C.navy,"40");}}>
                          <span style={{ fontSize:13 }}>🏦</span>
                          <span style={{ fontSize:9, fontWeight:700, lineHeight:1 }}>CDS</span>
                        </button>
                        {user.role_code && (
                          <button onClick={() => setToggleUser(user)}
                            style={{ padding:"4px 7px", borderRadius:8, border:`1.5px solid ${user.is_active ? (isDark ? alpha(C.red,"55") : "#FECACA") : (isDark ? alpha(C.green,"55") : "#BBF7D0")}`, background:user.is_active ? C.redBg : C.greenBg, color:user.is_active ? C.red : C.green, cursor:"pointer", fontFamily:"inherit", display:"flex", flexDirection:"column", alignItems:"center", gap:1, minWidth:36 }}
                            onMouseEnter={e=>e.currentTarget.style.opacity="0.8"}
                            onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
                            <span style={{ fontSize:13 }}>{user.is_active ? "🚫" : "✅"}</span>
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

      {inviteOpen && <InviteModal roles={roles} callerRole={role} callerCdsList={callerCdsList} onClose={handleCloseInvite} onSuccess={() => { loadData(); loadCallerCds(); }} showToast={showToast}/>}
      {changeRoleUser && <ChangeRoleModal user={changeRoleUser} roles={roles} callerRole={role} onClose={handleCloseChangeRole} onSave={async (uid, rid) => { await handleAssignRole(uid, rid); if (isMountedRef.current) setChangeRoleUser(null); }} showToast={showToast}/>}
      {toggleUser && <ToggleStatusModal user={toggleUser} onClose={handleCloseToggle} onConfirm={handleToggleActive} showToast={showToast}/>}
      {manageCdsUser && <ManageCDSModal user={manageCdsUser} callerRole={role} callerCdsList={callerCdsList} onClose={handleCloseManageCds} showToast={showToast} onRefresh={refreshUsersQuiet}/>}
    </div>
  );
}
