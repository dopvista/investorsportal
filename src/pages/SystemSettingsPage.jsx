// ── src/pages/SystemSettingsPage.jsx ─────────────────────────────
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { useTheme } from "../components/ui";
import ImageCropModal from "../components/ImageCropModal";
import {
  sbGetSiteSettings, sbSaveSiteSettings, sbUploadSlideImage,
  sbGetAllBrokers, sbInsertBroker, sbUpdateBroker,
  sbToggleBrokerStatus, sbDeleteBroker,
} from "../lib/supabase";
import CompaniesPage from "./CompaniesPage";

// ── inp(C, extra) — must receive live C from useTheme() ───────────
function inp(C, extra = {}) {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 9, fontSize: 13,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
    background: C.white, color: C.text, transition: "border 0.2s",
    boxSizing: "border-box", ...extra,
  };
}
const focusGreen = (C) => (e) => { e.target.style.borderColor = C.green; };
const blurGray   = (C) => (e) => { e.target.style.borderColor = C.gray200; };

const DEFAULT_SLIDES = [
  { label: "Investors Portal", title: "Secure Investing",   sub: "Your assets are protected with us.",          image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1280&q=80", color: "#064e3b", overlay: 0.35 },
  { label: "Investors Portal", title: "Smart Portfolio",    sub: "Track all your holdings in one place.",       image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1280&q=80", color: "#1e3a5f", overlay: 0.35 },
  { label: "Investors Portal", title: "Real-time Data",     sub: "Stay ahead of the market with live insights.",image: "https://images.unsplash.com/photo-1642790551116-18a150d248c6?auto=format&fit=crop&w=1280&q=80", color: "#3b1f5e", overlay: 0.35 },
];
const DEFAULT_SETTINGS  = { interval: 5000, animated: true, slides: DEFAULT_SLIDES };
const ACTIVE_MENU_KEY   = "system_settings_active_menu";
const COLOR_PRESETS = [
  { label: "Forest", value: "#064e3b" }, { label: "Navy",   value: "#1e3a5f" },
  { label: "Purple", value: "#3b1f5e" }, { label: "Gold",   value: "#78350f" },
  { label: "Slate",  value: "#1e293b" }, { label: "Teal",   value: "#134e4a" },
];

// ── Shared Field wrapper ──────────────────────────────────────────
const Field = memo(function Field({ label, children, hint }) {
  const { C, isDark } = useTheme();
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{hint}</div>}
    </div>
  );
});

// ── Slide Preview ─────────────────────────────────────────────────
const SlidePreview = memo(function SlidePreview({ slide, allSlides = [], activeIdx = 0, animated = true }) {
  const { C } = useTheme();
  const overlayVal = slide.overlay ?? 0.35;
  const hexAlpha   = Math.round(overlayVal * 255).toString(16).padStart(2, "0");
  const dots       = allSlides.length > 0 ? allSlides : [slide];
  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3", background: slide.color || "#064e3b", border: `1px solid ${C.gray200}` }}>
      {slide.image && (
        <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${slide.image})`, backgroundSize: "cover", backgroundPosition: "center", animation: animated ? "kenBurnsPreview 8s ease-in-out infinite alternate" : "none" }} />
      )}
      {overlayVal > 0 && (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${slide.color || "#064e3b"}${hexAlpha} 0%, transparent 100%)` }} />
      )}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6%", zIndex: 2 }}>
        {slide.title && <div style={{ fontSize: "clamp(10px,4.5%,22px)", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "3%", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{slide.title}</div>}
        {slide.sub   && <div style={{ fontSize: "clamp(6px,2.2%,13px)", color: "rgba(255,255,255,0.9)", lineHeight: 1.5, maxWidth: "80%" }}>{slide.sub}</div>}
      </div>
      <div style={{ position: "absolute", bottom: "8%", left: "6%", display: "flex", gap: 6, zIndex: 2 }}>
        {dots.map((_, i) => (
          <div key={i} style={{ width: i === activeIdx ? 28 : 6, height: 4, borderRadius: 2, background: "white", opacity: i === activeIdx ? 0.8 : 0.3, transition: "all 0.3s" }} />
        ))}
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── BROKER FORM MODAL ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const BrokerFormModal = memo(function BrokerFormModal({ broker, onConfirm, onClose }) {
  const { C, isDark } = useTheme();
  const isEdit = !!broker;
  const [form, setForm] = useState({
    broker_name:   broker?.broker_name   || "",
    broker_code:   broker?.broker_code   || "",
    contact_phone: broker?.contact_phone || "",
    contact_email: broker?.contact_email || "",
    status:        broker?.status        || "Active",
    remarks:       broker?.remarks       || "",
  });
  const [error, setSError] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setSError(""); };

  const handleSubmit = async () => {
    if (!form.broker_name.trim()) return setSError("Broker name is required.");
    if (!form.broker_code.trim()) return setSError("Broker code is required.");
    if (form.broker_code.trim().length > 10) return setSError("Broker code max 10 characters.");
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email))
      return setSError("Invalid email address.");
    setSaving(true);
    try { await onConfirm(form); }
    catch (e) { setSError(e.message); setSaving(false); }
  };

  const fieldStyle = inp(C, { borderRadius: 8, padding: "10px 12px", fontSize: 13 });
  const onFocus    = focusGreen(C);
  const onBlur     = blurGray(C);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{
        background: C.white, borderRadius: 16, width: "100%", maxWidth: 500,
        border: `1.5px solid ${C.gray200}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden", display: "flex", flexDirection: "column",
      }}>
        {/* Header — navy gradient matching all other modals */}
        <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "18px 24px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>{isEdit ? "✏️ Edit Broker" : "➕ Register New Broker"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>Fill in the broker details below</div>
          </div>
          <button onClick={onClose} style={{ width: 40, height: 40, borderRadius: 8, border: "none", background: "rgba(255,255,255,0.12)", cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", color: "#ffffff", flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {error && (
            <div style={{ background: C.redBg, border: `1px solid ${isDark ? `${C.red}55` : "#FECACA"}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, color: C.red, fontWeight: 500 }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                Broker Name <span style={{ color: C.red }}>*</span>
              </label>
              <input value={form.broker_name} onChange={e => set("broker_name", e.target.value)}
                placeholder="e.g. Wealth Capital Fund" style={fieldStyle} onFocus={onFocus} onBlur={onBlur} autoFocus />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>
                Broker Code <span style={{ color: C.red }}>*</span>
              </label>
              <input value={form.broker_code} onChange={e => set("broker_code", e.target.value.toUpperCase().slice(0, 10))}
                placeholder="e.g. WCF" style={{ ...fieldStyle, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }} onFocus={onFocus} onBlur={onBlur} />
              <div style={{ fontSize: 10, color: C.gray400, marginTop: 3 }}>Short unique code — max 10 chars</div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value)}
                style={{ ...fieldStyle, cursor: "pointer" }} onFocus={onFocus} onBlur={onBlur}>
                <option value="Active">✅ Active</option>
                <option value="Inactive">⛔ Inactive</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Contact Phone</label>
              <input value={form.contact_phone} onChange={e => set("contact_phone", e.target.value)}
                placeholder="e.g. +255 22 123 4567" style={fieldStyle} onFocus={onFocus} onBlur={onBlur} />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Contact Email</label>
              <input value={form.contact_email} onChange={e => set("contact_email", e.target.value)}
                placeholder="e.g. info@broker.co.tz" type="email" style={fieldStyle} onFocus={onFocus} onBlur={onBlur} />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: isDark ? C.gray500 : C.navy, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Remarks</label>
              <textarea value={form.remarks} onChange={e => set("remarks", e.target.value)}
                placeholder="Optional notes..."
                style={{ ...fieldStyle, resize: "vertical", minHeight: 60, lineHeight: 1.5 }}
                onFocus={onFocus} onBlur={onBlur} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.gray200}`, display: "flex", gap: 10, justifyContent: "flex-end", background: C.gray50, borderRadius: "0 0 16px 16px" }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: "10px 18px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: saving ? C.gray200 : C.green, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8 }}>
            {saving
              ? <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Saving...</>
              : <>{isEdit ? "💾 Save Changes" : "➕ Register Broker"}</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── BROKERS SECTION ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const BrokersSection = memo(function BrokersSection({ showToast, session }) {
  const { C, isDark } = useTheme();
  // Navy gradient thead — matches TransactionsPage/CompaniesPage
  const theadBg = isDark ? C.gray50 : `linear-gradient(135deg, ${C.navy}0a, ${C.navy}05)`;

  const [brokers,       setBrokers]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [formModal,     setFormModal]     = useState({ open: false, broker: null });
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [togglingId,    setTogglingId]    = useState(null);
  const [deletingId,    setDeletingId]    = useState(null);
  const [search,        setSearch]        = useState("");

  const isMounted = useRef(true);
  useEffect(() => () => { isMounted.current = false; }, []);

  const loadBrokers = useCallback(async () => {
    if (isMounted.current) setLoading(true);
    try {
      const data = await sbGetAllBrokers();
      if (!isMounted.current) return;
      setBrokers(data);
    } catch (e) {
      if (!isMounted.current) return;
      showToast("Error loading brokers: " + e.message, "error");
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadBrokers(); }, [loadBrokers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter(b =>
      b.broker_name.toLowerCase().includes(q) ||
      b.broker_code.toLowerCase().includes(q)  ||
      b.contact_email?.toLowerCase().includes(q)
    );
  }, [brokers, search]);

  const handleFormConfirm = useCallback(async (formData) => {
    const isEdit    = !!formModal.broker;
    const createdBy = session?.user?.email || "SA";
    try {
      if (isEdit) {
        const rows = await sbUpdateBroker(formModal.broker.id, formData);
        if (!isMounted.current) return;
        setBrokers(p => p.map(b => b.id === formModal.broker.id ? rows[0] : b));
        showToast("Broker updated!", "success");
      } else {
        const rows = await sbInsertBroker({ ...formData, created_by: createdBy });
        if (!isMounted.current) return;
        setBrokers(p => [...p, rows[0]]);
        showToast("Broker registered!", "success");
      }
      setFormModal({ open: false, broker: null });
    } catch (e) { throw e; }
  }, [formModal.broker, session, showToast]);

  const handleToggleStatus = useCallback(async (broker) => {
    const newStatus = broker.status === "Active" ? "Inactive" : "Active";
    setTogglingId(broker.id);
    try {
      const rows = await sbToggleBrokerStatus(broker.id, newStatus);
      if (!isMounted.current) return;
      setBrokers(p => p.map(b => b.id === broker.id ? rows[0] : b));
      showToast(`Broker ${newStatus === "Active" ? "activated" : "deactivated"}.`, "success");
    } catch (e) {
      if (!isMounted.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMounted.current) setTogglingId(null);
    }
  }, [showToast]);

  const handleDelete = useCallback(async () => {
    const id = deleteConfirm?.id;
    if (!id) return;
    setDeleteConfirm(null);
    setDeletingId(id);
    try {
      await sbDeleteBroker(id);
      if (!isMounted.current) return;
      setBrokers(p => p.filter(b => b.id !== id));
      showToast("Broker deleted.", "success");
    } catch (e) {
      if (!isMounted.current) return;
      showToast("Error: " + e.message, "error");
    } finally {
      if (isMounted.current) setDeletingId(null);
    }
  }, [deleteConfirm, showToast]);

  const activeCount   = brokers.filter(b => b.status === "Active").length;
  const inactiveCount = brokers.filter(b => b.status === "Inactive").length;

  // Theme-aware badge border helpers
  const activeBdr   = isDark ? `${C.green}55` : "#BBF7D0";
  const inactiveBdr = isDark ? `${C.red}55`   : "#FECACA";

  return (
    <>
      {/* Header */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
          <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 15 }}>🏦 Manage Brokers</div>
          <div style={{ color: "#F0B429", fontSize: 11, marginTop: 3, fontWeight: 500 }}>Register and manage DSE-licensed stockbrokers available across the platform</div>
        </div>
      </div>

      {/* Stats + toolbar */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "14px 18px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { label: "Total",    value: brokers.length,  color: isDark ? "#93C5FD" : C.navy, bg: isDark ? `${C.navy}22` : `${C.navy}10` },
              { label: "Active",   value: activeCount,     color: C.green,                     bg: C.greenBg                              },
              { label: "Inactive", value: inactiveCount,   color: C.red,                       bg: C.redBg                                },
            ].map(s => (
              <div key={s.label} style={{ background: s.bg, borderRadius: 10, padding: "6px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: s.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: C.gray400 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search broker..."
                style={{ padding: "8px 12px 8px 32px", border: `1.5px solid ${C.gray200}`, background: C.white, color: C.text, borderRadius: 8, fontSize: 12, outline: "none", width: 200, fontFamily: "inherit" }}
                onFocus={e => (e.target.style.borderColor = C.green)}
                onBlur={e => (e.target.style.borderColor = C.gray200)} />
            </div>
            <button onClick={() => setFormModal({ open: true, broker: null })}
              style={{ padding: "8px 16px", border: "none", borderRadius: 8, background: C.green, color: "#ffffff", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, boxShadow: `0 2px 8px ${C.green}44` }}>
              ➕ Add Broker
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ width: 24, height: 24, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
            <div style={{ fontSize: 12 }}>Loading brokers...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: C.gray400 }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏦</div>
            <div style={{ fontWeight: 700, color: C.text }}>{search ? "No brokers match your search" : "No brokers registered yet"}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{search ? "Try a different keyword" : "Click 'Add Broker' to register the first one"}</div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: theadBg }}>
                  {["#", "Broker Name", "Code", "Phone", "Email", "Remarks", "Status", "Actions"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: h === "#" || h === "Actions" ? "center" : "left", color: C.gray400, fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `2px solid ${C.gray200}`, whiteSpace: "nowrap", background: theadBg }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((b, i) => {
                  const isActive   = b.status === "Active";
                  const isToggling = togglingId === b.id;
                  const isDeleting = deletingId === b.id;
                  const isBusy     = isToggling || isDeleting;
                  return (
                    <tr key={b.id}
                      style={{ borderBottom: `1px solid ${C.gray100}`, background: !isActive ? C.gray50 : "transparent", opacity: isBusy ? 0.6 : 1, transition: "background 0.15s" }}
                      onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = C.gray50; }}
                      onMouseLeave={e => { e.currentTarget.style.background = !isActive ? C.gray50 : "transparent"; }}
                    >
                      <td style={{ padding: "10px 14px", color: C.gray400, fontWeight: 600, textAlign: "center", fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: "10px 14px", fontWeight: 700, color: C.text, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={b.broker_name}>{b.broker_name}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ background: isDark ? `${C.navy}22` : `${C.navy}10`, color: isDark ? "#93C5FD" : C.navy, padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em" }}>{b.broker_code}</span>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.gray600, fontSize: 12 }}>{b.contact_phone || <span style={{ color: C.gray400 }}>—</span>}</td>
                      <td style={{ padding: "10px 14px", color: C.gray600, fontSize: 12 }}>{b.contact_email || <span style={{ color: C.gray400 }}>—</span>}</td>
                      <td style={{ padding: "10px 14px", color: C.gray600, fontSize: 11, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.remarks || <span style={{ color: C.gray400 }}>—</span>}</td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap" }}>
                        <span style={{ background: isActive ? C.greenBg : C.redBg, color: isActive ? C.green : C.red, border: `1px solid ${isActive ? activeBdr : inactiveBdr}`, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                          {isActive ? "✅ Active" : "⛔ Inactive"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                          <button onClick={() => setFormModal({ open: true, broker: b })} disabled={isBusy} title="Edit broker"
                            style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 11, cursor: isBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            ✏️
                          </button>
                          <button onClick={() => handleToggleStatus(b)} disabled={isBusy} title={isActive ? "Deactivate" : "Activate"}
                            style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${isActive ? inactiveBdr : activeBdr}`, background: isActive ? C.redBg : C.greenBg, color: isActive ? C.red : C.green, fontWeight: 600, fontSize: 11, cursor: isBusy ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                            {isToggling
                              ? <div style={{ width: 11, height: 11, border: "2px solid rgba(0,0,0,0.15)", borderTop: `2px solid ${isActive ? C.red : C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                              : isActive ? "⛔" : "✅"}
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button onClick={() => setDeleteConfirm({ id: b.id, name: b.broker_name })} disabled={isBusy} title="Delete broker"
                            style={{ padding: "5px 10px", borderRadius: 7, border: `1.5px solid ${inactiveBdr}`, background: C.redBg, color: C.red, fontWeight: 600, fontSize: 11, cursor: isBusy ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
                            {isDeleting ? "..." : "🗑️"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formModal.open && (
        <BrokerFormModal broker={formModal.broker} onConfirm={handleFormConfirm} onClose={() => setFormModal({ open: false, broker: null })} />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: C.white, borderRadius: 16, width: "100%", maxWidth: 400, border: `1.5px solid ${C.gray200}`, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
            <div style={{ background: "linear-gradient(135deg, #7f1d1d, #991b1b)", padding: "16px 20px" }}>
              <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 15 }}>🗑️ Delete Broker</div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 2 }}>{deleteConfirm.name}</div>
            </div>
            <div style={{ padding: "20px" }}>
              <div style={{ fontSize: 14, color: C.text }}>
                Are you sure you want to delete <strong>{deleteConfirm.name}</strong>?<br />
                <span style={{ fontSize: 12, color: C.gray400, marginTop: 6, display: "block" }}>
                  ⚠️ This will fail if the broker is linked to any existing transactions. Deactivate instead if in use.
                </span>
              </div>
            </div>
            <div style={{ padding: "0 20px 20px", display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray600, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleDelete}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: C.red, color: "#ffffff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
});

// ══════════════════════════════════════════════════════════════════
// ── MAIN PAGE ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
export default function SystemSettingsPage({ role, session, showToast, setLoginSettings, companies, setCompanies, transactions }) {
  const { C, isDark } = useTheme();

  const [activeMenu, setActiveMenu] = useState(() => {
    try { return localStorage.getItem(ACTIVE_MENU_KEY) || "companies"; }
    catch { return "companies"; }
  });
  const [settings,     setSettings]     = useState(DEFAULT_SETTINGS);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [activeSlide,  setActiveSlide]  = useState(0);
  const [cropSrc,      setCropSrc]      = useState(null);
  const [cropIdx,      setCropIdx]      = useState(null);
  const [uploading,    setUploading]    = useState(null);

  const isMountedRef = useRef(true);
  const loadReqRef   = useRef(0);
  const fileRef0 = useRef(); const fileRef1 = useRef(); const fileRef2 = useRef();
  const fileRefs = useMemo(() => [fileRef0, fileRef1, fileRef2], []);

  const isSA        = role === "SA";
  const animated    = settings.animated ?? true;
  const intervalSec = useMemo(() => (settings.interval / 1000).toFixed(0), [settings.interval]);
  const resetSlides = useMemo(() => {
    const userDefaults = settings.defaults;
    return DEFAULT_SLIDES.map((s, i) => userDefaults?.[i] ? { ...userDefaults[i] } : { ...s });
  }, [settings.defaults]);

  useEffect(() => () => { isMountedRef.current = false; }, []);
  useEffect(() => { try { localStorage.setItem(ACTIVE_MENU_KEY, activeMenu); } catch {} }, [activeMenu]);
  useEffect(() => { if (activeMenu !== "login_page") setActiveSlide(0); }, [activeMenu]);

  const broadcastSettings = useCallback((value) => {
    try { const bc = new BroadcastChannel("dse_site_settings"); bc.postMessage({ key: "login_page", value }); bc.close(); } catch {}
  }, []);

  const loadSettings = useCallback(async () => {
    const reqId = ++loadReqRef.current;
    if (isMountedRef.current) setLoading(true);
    try {
      const data = await sbGetSiteSettings("login_page");
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      setSettings(data ? { ...DEFAULT_SETTINGS, ...data } : DEFAULT_SETTINGS);
    } catch (e) {
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      showToast("Failed to load settings: " + e.message, "error");
    } finally {
      if (isMountedRef.current && reqId === loadReqRef.current) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { if (!isSA) return; loadSettings(); }, [isSA, loadSettings]);

  const setSlideField = useCallback((idx, field, value) => {
    setSettings(prev => ({ ...prev, slides: prev.slides.map((s, i) => i === idx ? { ...s, [field]: value } : s) }));
  }, []);

  const handleSetAsDefault = useCallback(async (idx) => {
    const currentImage = settings.slides[idx]?.image;
    if (!currentImage) { showToast("No image to set as default", "error"); return; }
    const newDefaults = [...(settings.defaults || DEFAULT_SLIDES.map(s => ({ ...s })))];
    newDefaults[idx]  = { ...settings.slides[idx] };
    const newSettings = { ...settings, defaults: newDefaults };
    setSettings(newSettings);
    try {
      const tok = session?.access_token;
      if (!tok) throw new Error("Session expired");
      await sbSaveSiteSettings("login_page", newSettings, tok);
      if (!isMountedRef.current) return;
      if (setLoginSettings) setLoginSettings({ ...newSettings });
      broadcastSettings({ ...newSettings });
      showToast(`Slide ${idx + 1} default image updated!`, "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Failed to save default: " + err.message, "error");
    }
  }, [settings, session?.access_token, setLoginSettings, broadcastSettings, showToast]);

  const handleFileSelect = useCallback((e, idx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast("Image must be under 15MB", "error"); return; }
    const reader = new FileReader();
    reader.onload = ev => { if (!isMountedRef.current) return; setCropSrc(ev.target.result); setCropIdx(idx); };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [showToast]);

  const handleCropConfirm = useCallback(async (blob) => {
    const idx = cropIdx;
    if (idx == null) return;
    setCropSrc(null); setUploading(idx);
    try {
      const url = await sbUploadSlideImage(blob, idx + 1, session);
      if (!isMountedRef.current) return;
      setSlideField(idx, "image", url);
      showToast(`Slide ${idx + 1} image uploaded!`, "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Upload failed: " + err.message, "error");
    } finally {
      if (isMountedRef.current) { setUploading(null); setCropIdx(null); }
    }
  }, [cropIdx, session, setSlideField, showToast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const tok = session?.access_token;
      if (!tok) throw new Error("Session expired — please refresh the page.");
      await sbSaveSiteSettings("login_page", settings, tok);
      if (!isMountedRef.current) return;
      if (setLoginSettings) setLoginSettings({ ...settings });
      broadcastSettings({ ...settings });
      showToast("Settings saved! Login page updated.", "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Save failed: " + err.message, "error");
    } finally {
      if (isMountedRef.current) setSaving(false);
    }
  }, [session?.access_token, settings, setLoginSettings, broadcastSettings, showToast]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, slides: resetSlides, defaults: settings.defaults });
    showToast("Reset to defaults", "success");
  }, [resetSlides, settings.defaults, showToast]);

  const handleToggleAnimated = useCallback(() => setSettings(prev => ({ ...prev, animated: !prev.animated })), []);

  if (!isSA) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Access Restricted</div>
        <div style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>Only Super Admins can access System Settings.</div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center", color: C.gray400 }}>
        <div style={{ width: 20, height: 20, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 12 }}>Loading settings...</div>
      </div>
    </div>
  );

  const menuItems = [
    { id: "companies",  icon: "🏢", label: "Companies"  },
    { id: "brokers",    icon: "🏦", label: "Brokers"    },
    { id: "login_page", icon: "🖼️", label: "Login Page" },
  ];

  return (
    <div style={{ height: "calc(100vh - 118px)", display: "flex", gap: 14, overflow: "hidden" }}>
      <style>{`
        @keyframes fadeIn          { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin            { to { transform: rotate(360deg); } }
        @keyframes kenBurnsPreview { 0% { transform:scale(1); } 100% { transform:scale(1.08); } }
        .ss-scroll::-webkit-scrollbar { width: 4px; }
        .ss-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .ss-scroll { scrollbar-width: thin; scrollbar-color: #e5e7eb transparent; }
        .speed-slider { -webkit-appearance: none; width: 100%; height: 5px; background: ${C.gray200}; border-radius: 5px; outline: none; }
        .speed-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.green}; border-radius: 50%; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        input::placeholder { color: #9ca3af; }
        .no-overlay-check { width: 15px; height: 15px; accent-color: ${C.green}; cursor: pointer; }
      `}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 180, flexShrink: 0, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.07em", padding: "6px 10px 8px" }}>Settings</div>
        {menuItems.map(item => (
          <button key={item.id} onClick={() => setActiveMenu(item.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", width: "100%", transition: "all 0.15s",
              background:   activeMenu === item.id ? (isDark ? `${C.navy}25` : `${C.navy}10`) : "transparent",
              color:        activeMenu === item.id ? (isDark ? "#93C5FD" : C.navy) : C.gray400,
              fontWeight:   activeMenu === item.id ? 700 : 500,
              fontSize: 12,
              borderLeft:   activeMenu === item.id ? `3px solid ${isDark ? "#93C5FD" : C.navy}` : "3px solid transparent",
            }}>
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="ss-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>

        {/* ── BROKERS ── */}
        {activeMenu === "brokers" && (
          <BrokersSection showToast={showToast} session={session} />
        )}

        {/* ── COMPANIES ── */}
        {activeMenu === "companies" && (
          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
              <div style={{ color: "#ffffff", fontWeight: 800, fontSize: 15 }}>🏢 Manage Companies</div>
              <div style={{ color: "#F0B429", fontSize: 11, marginTop: 3, fontWeight: 500 }}>Register, edit and manage listed companies</div>
            </div>
            <div style={{ padding: "16px" }}>
              <CompaniesPage
                companies={companies} setCompanies={setCompanies}
                transactions={transactions || []} showToast={showToast}
                role={role} profile={null} manageOnly={true}
              />
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════
            LOGIN PAGE — UNTOUCHED (preserved character-for-character)
            ════════════════════════════════════════════════════════ */}
        {activeMenu === "login_page" && (
          <>
            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
                <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>🖼️ Login Page</div>
                <div style={{ color: "#ffffff", fontSize: 11, marginTop: 3, fontWeight: 500 }}>Customize the slideshow shown on the login screen</div>
              </div>
            </div>

            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "18px 20px", flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 14 }}>⏱ Slide Rotation Speed</div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>2s</span>
                <input type="range" min="2000" max="10000" step="500" value={settings.interval} className="speed-slider"
                  onChange={e => setSettings(prev => ({ ...prev, interval: parseInt(e.target.value, 10) }))} />
                <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>10s</span>
                <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}40`, borderRadius: 8, padding: "4px 12px", minWidth: 52, textAlign: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{intervalSec}s</span>
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 8 }}>Each slide stays visible for {intervalSec} seconds before rotating</div>
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.gray100}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>🎬 Image Animation</div>
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>{animated ? "Ken Burns — images slowly zoom in/out" : "Static — images stay fixed"}</div>
                  </div>
                  <div onClick={handleToggleAnimated}
                    style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: animated ? C.green : C.gray200, position: "relative", transition: "background 0.25s", flexShrink: 0 }}>
                    <div style={{ position: "absolute", top: 3, left: animated ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                  </div>
                </div>
                <div style={{ marginTop: 6, fontSize: 11, color: animated ? C.green : C.gray400, fontWeight: 600 }}>
                  {animated ? "✓ Animated (Ken Burns on)" : "✗ Static (Ken Burns off)"}
                </div>
              </div>
            </div>

            <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
              <div style={{ display: "flex", borderBottom: `1px solid ${C.gray200}` }}>
                {settings.slides.map((s, i) => (
                  <button key={i} onClick={() => setActiveSlide(i)}
                    style={{ flex: 1, padding: "12px 8px", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: activeSlide === i ? 700 : 500, color: activeSlide === i ? C.navy : C.gray400, background: activeSlide === i ? C.white : C.gray50, borderBottom: activeSlide === i ? `2px solid ${C.navy}` : "2px solid transparent", transition: "all 0.15s" }}>
                    Slide {i + 1}
                    {s.title && <div style={{ fontSize: 9, marginTop: 2, color: activeSlide === i ? C.green : C.gray400, fontWeight: 500 }}>{s.title}</div>}
                  </button>
                ))}
              </div>
              {settings.slides.map((slide, idx) => idx !== activeSlide ? null : (
                <div key={idx} style={{ padding: "20px", animation: "fadeIn 0.2s ease" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Slide Image</div>
                      <div onClick={() => uploading == null && fileRefs[idx].current?.click()}
                        style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3", background: slide.color || "#064e3b", border: `2px dashed ${C.gray200}`, cursor: uploading === idx ? "wait" : "pointer" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; }}>
                        {slide.image && <img src={slide.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />}
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", opacity: uploading === idx ? 1 : 0.85, transition: "opacity 0.2s" }}>
                          {uploading === idx ? (
                            <><div style={{ width: 24, height: 24, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 8 }} /><span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>Uploading...</span></>
                          ) : (
                            <><div style={{ fontSize: 28, marginBottom: 8 }}>📷</div><span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>Click to change image</span><span style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 4 }}>JPG, PNG, WEBP — max 15MB</span></>
                          )}
                        </div>
                      </div>
                      <input ref={fileRefs[idx]} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFileSelect(e, idx)} />
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 6 }}>Click to upload. Will be cropped to 4:3 (1280×960px).</div>
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Overlay Color</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {COLOR_PRESETS.map(p => (
                            <button key={p.value} onClick={() => setSlideField(idx, "color", p.value)} title={p.label}
                              style={{ width: 28, height: 28, borderRadius: 7, border: slide.color === p.value ? `2.5px solid ${C.green}` : `2px solid ${C.gray200}`, background: p.value, cursor: "pointer", boxShadow: slide.color === p.value ? `0 0 0 2px ${C.green}44` : "none" }} />
                          ))}
                          <div style={{ position: "relative", width: 28, height: 28 }}>
                            <input type="color" value={slide.color || "#064e3b"} onChange={e => setSlideField(idx, "color", e.target.value)}
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                            <div style={{ width: 28, height: 28, borderRadius: 7, border: `2px dashed ${C.gray200}`, background: slide.color || "#064e3b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, pointerEvents: "none" }}>✏️</div>
                          </div>
                        </div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em" }}>Overlay Intensity</div>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: (slide.overlay ?? 0.35) === 0 ? C.green : C.gray400, fontWeight: (slide.overlay ?? 0.35) === 0 ? 700 : 500 }}>
                            <input type="checkbox" className="no-overlay-check" checked={(slide.overlay ?? 0.35) === 0} onChange={e => setSlideField(idx, "overlay", e.target.checked ? 0 : 0.35)} />
                            No overlay
                          </label>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: (slide.overlay ?? 0.35) === 0 ? 0.35 : 1, transition: "opacity 0.2s" }}>
                          <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>0%</span>
                          <input type="range" min="0.05" max="1" step="0.05" value={slide.overlay ?? 0.35} disabled={(slide.overlay ?? 0.35) === 0} className="speed-slider" onChange={e => setSlideField(idx, "overlay", parseFloat(e.target.value))} />
                          <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>100%</span>
                          <div style={{ background: `${C.navy}10`, border: `1px solid ${C.navy}20`, borderRadius: 8, padding: "4px 8px", minWidth: 42, textAlign: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: (slide.overlay ?? 0.35) === 0 ? C.gray400 : C.navy }}>
                              {(slide.overlay ?? 0.35) === 0 ? "Off" : `${Math.round((slide.overlay ?? 0.35) * 100)}%`}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: C.gray400, marginTop: 5 }}>
                          {(slide.overlay ?? 0.35) === 0 ? "No overlay — photo shows fully." : "Color tint over the photo. Reduce for clearer images."}
                        </div>
                      </div>
                      <div style={{ marginTop: 16 }}>
                        <button onClick={() => { const def = settings.defaults?.[idx] || DEFAULT_SLIDES[idx]; if (def) setSettings(prev => ({ ...prev, slides: prev.slides.map((s, i) => i === idx ? { ...def } : s) })); }}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray400, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.gray400; }}>
                          🔄 Use Default Image
                        </button>
                        <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Restore this slide&apos;s saved default image</div>
                        <div style={{ marginTop: 8 }}>
                          <button onClick={() => handleSetAsDefault(idx)}
                            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.green}40`, background: `${C.green}08`, color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${C.green}15`; e.currentTarget.style.borderColor = C.green; }}
                            onMouseLeave={e => { e.currentTarget.style.background = `${C.green}08`; e.currentTarget.style.borderColor = `${C.green}40`; }}>
                            ⭐ Set as Default Image
                          </button>
                          <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Save current image as default — used when resetting this slide</div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Slide Text</div>
                      <Field label="Label (small gold text)">
                        <input style={inp(C)} placeholder="e.g. Investors Portal" value={slide.label || ""} onChange={e => setSlideField(idx, "label", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} />
                      </Field>
                      <Field label="Title (large white text)">
                        <input style={inp(C)} placeholder="e.g. Secure Investing" value={slide.title || ""} onChange={e => setSlideField(idx, "title", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} />
                      </Field>
                      <Field label="Subtitle">
                        <textarea style={{ ...inp(C), resize: "vertical", minHeight: 64, lineHeight: 1.5 }} placeholder="e.g. Your assets are protected with us." value={slide.sub || ""} onChange={e => setSlideField(idx, "sub", e.target.value)} onFocus={focusGreen(C)} onBlur={blurGray(C)} />
                      </Field>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Live Preview</div>
                      <SlidePreview slide={slide} allSlides={settings.slides} activeIdx={idx} animated={animated} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Save / Reset buttons */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 16, flexShrink: 0 }}>
              <button onClick={handleReset}
                style={{ padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray400, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.gray400; }}>
                Reset to Defaults
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: saving ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: saving ? "none" : `0 2px 10px ${C.green}44`, display: "flex", alignItems: "center", gap: 8 }}>
                {saving ? <><div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Saving...</> : "💾 Save Changes"}
              </button>
            </div>
          </>
        )}
      </div>

      {cropSrc && (
        <ImageCropModal imageSrc={cropSrc} slideIndex={(cropIdx ?? 0) + 1}
          onConfirm={handleCropConfirm} onCancel={() => { setCropSrc(null); setCropIdx(null); }} />
      )}
    </div>
  );
}
