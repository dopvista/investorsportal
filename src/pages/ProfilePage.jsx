// ── src/pages/ProfilePage.jsx ─────────────────────────────────────
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { C } from "../components/ui";
import { ROLE_META } from "../lib/constants";
import AvatarCropModal from "../components/AvatarCropModal";

// ── Mobile breakpoint hook ────────────────────────────────────────
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

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
const PW_MAX_DAILY = 3;
const pwKey = (uid) => `dse_pw_changes_${uid || "unknown"}`;

function getPwChanges(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem(pwKey(uid)) || "{}");
    const today = new Date().toDateString();
    if (raw.date !== today) return { date: today, count: 0 };
    return raw;
  } catch {
    return { date: new Date().toDateString(), count: 0 };
  }
}
function incrementPwChanges(uid) {
  const data = getPwChanges(uid);
  const next = { date: data.date, count: data.count + 1 };
  localStorage.setItem(pwKey(uid), JSON.stringify(next));
  return next.count;
}
function remainingPwChanges(uid) {
  return PW_MAX_DAILY - getPwChanges(uid).count;
}

const COUNTRIES = [
  "Tanzania",
  "Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia",
  "Austria","Azerbaijan","Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium",
  "Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei",
  "Bulgaria","Burkina Faso","Burundi","Cambodia","Cameroon","Canada","Cape Verde",
  "Central African Republic","Chad","Chile","China","Colombia","Comoros","Congo",
  "Costa Rica","Croatia","Cuba","Cyprus","Czech Republic","Denmark","Djibouti","Dominica",
  "Dominican Republic","Ecuador","Egypt","El Salvador","Equatorial Guinea","Eritrea",
  "Estonia","Eswatini","Ethiopia","Fiji","Finland","France","Gabon","Gambia","Georgia",
  "Germany","Ghana","Greece","Grenada","Guatemala","Guinea","Guinea-Bissau","Guyana",
  "Haiti","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland",
  "Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kiribati","Kuwait",
  "Kyrgyzstan","Laos","Latvia","Lebanon","Lesotho","Liberia","Libya","Liechtenstein",
  "Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta",
  "Marshall Islands","Mauritania","Mauritius","Mexico","Micronesia","Moldova","Monaco",
  "Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nauru","Nepal",
  "Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia",
  "Norway","Oman","Pakistan","Palau","Palestine","Panama","Papua New Guinea","Paraguay",
  "Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda",
  "Saint Kitts and Nevis","Saint Lucia","Saint Vincent and the Grenadines","Samoa",
  "San Marino","São Tomé and Príncipe","Saudi Arabia","Senegal","Serbia","Seychelles",
  "Sierra Leone","Singapore","Slovakia","Slovenia","Solomon Islands","Somalia","South Africa",
  "South Korea","South Sudan","Spain","Sri Lanka","Sudan","Suriname","Sweden","Switzerland",
  "Syria","Taiwan","Tajikistan","Thailand","Timor-Leste","Togo","Tonga","Trinidad and Tobago",
  "Tunisia","Turkey","Turkmenistan","Tuvalu","Uganda","Ukraine","United Arab Emirates",
  "United Kingdom","United States","Uruguay","Uzbekistan","Vanuatu","Vatican City",
  "Venezuela","Vietnam","Yemen","Zambia","Zimbabwe",
];

const GENDERS = ["Male", "Female", "Prefer not to say"];

function calcCompletion(form, avatarPreview) {
  const fields = [
    form.full_name, form.phone, form.nationality, form.postal_address,
    form.national_id, form.date_of_birth, form.gender, avatarPreview,
  ];
  return Math.round((fields.filter(f => f && String(f).trim()).length / fields.length) * 100);
}

const profileToForm = (profile) => ({
  full_name:      profile?.full_name      || "",
  phone:          profile?.phone          || "",
  nationality:    profile?.nationality    || "",
  postal_address: profile?.postal_address || "",
  national_id:    profile?.national_id    || "",
  date_of_birth:  profile?.date_of_birth  || "",
  gender:         profile?.gender         || "",
});

const inp = (extra = {}) => ({
  width: "100%", padding: "8px 11px", borderRadius: 8, fontSize: 13,
  border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
  background: C.white, color: C.text, transition: "border 0.2s",
  boxSizing: "border-box", ...extra,
});
const focusGreen = (e) => { e.target.style.borderColor = C.green; };
const blurGray   = (e) => { e.target.style.borderColor = C.gray200; };

// ── Desktop-only helpers ──────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, marginBottom: 6 }}>
      <div style={{ padding: "6px 12px", borderBottom: `1px solid ${C.gray100}`, display: "flex", alignItems: "center", gap: 6, background: C.gray50, borderRadius: "12px 12px 0 0" }}>
        <span style={{ fontSize: 13 }}>{icon}</span>
        <span style={{ fontWeight: 700, fontSize: 10, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</span>
      </div>
      <div style={{ padding: "8px 12px" }}>{children}</div>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.gray400, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {label}{required && <span style={{ color: C.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef();

  const filtered = useMemo(
    () => COUNTRIES.filter(c => c.toLowerCase().includes(search.toLowerCase())),
    [search]
  );

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => { setOpen(o => !o); setSearch(""); }}
        style={{ ...inp(), display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none", borderColor: open ? C.green : C.gray200 }}
      >
        <span style={{ color: value ? C.text : "#9ca3af" }}>{value || "Select country"}</span>
        <span style={{ fontSize: 10, color: C.gray400, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, background: C.white, border: `1.5px solid ${C.green}`, borderRadius: 10, zIndex: 9999, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden" }}>
          <div style={{ padding: "8px 10px", borderBottom: `1px solid ${C.gray100}` }}>
            <input autoFocus placeholder="🔍 Search country..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 7, fontSize: 12, border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 12px", color: C.gray400, fontSize: 12 }}>No results</div>
            ) : filtered.map((c, i) => (
              <div key={c} onClick={() => { onChange(c); setOpen(false); setSearch(""); }}
                style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer", background: c === value ? `${C.green}12` : "transparent", color: c === value ? C.green : C.text, fontWeight: c === value ? 700 : 400, borderBottom: i === 0 && c === "Tanzania" ? `1px solid ${C.gray100}` : "none" }}
                onMouseEnter={e => { if (c !== value) e.currentTarget.style.background = C.gray50; }}
                onMouseLeave={e => { if (c !== value) e.currentTarget.style.background = "transparent"; }}
              >
                {c === "Tanzania" ? "🇹🇿 " : ""}{c}{c === value && <span style={{ float: "right" }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal Shell (used by ChangePasswordModal) ───────────────────
function ModalShell({ title, subtitle, headerRight, onClose, footer, children, maxWidth = 460, maxHeight, lockBackdrop = false }) {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
      onClick={e => { if (!lockBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.white,
        borderRadius: isMobile ? "18px 18px 0 0" : 18,
        width: "100%",
        maxWidth: isMobile ? "100%" : maxWidth,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        maxHeight: isMobile ? "92vh" : (maxHeight || undefined),
        ...((!isMobile && maxHeight) ? { maxHeight } : {}),
      }}>
        {/* Header with navy gradient */}
        <div style={{
          background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)",
          padding: isMobile ? "18px 20px 14px" : "22px 28px 16px",
          borderBottom: `1px solid ${C.gray200}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexShrink: 0,
          borderTopLeftRadius: isMobile ? "18px" : 18,
          borderTopRightRadius: isMobile ? "18px" : 18,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.gold, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginLeft: 16, flexShrink: 0 }}>
            {headerRight}
            {!lockBackdrop && (
              <button
                onClick={onClose}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  border: "none",
                  background: "rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  fontSize: 15,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: C.white,
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
        {/* Body */}
        <div style={{
          padding: isMobile ? "16px 18px" : "20px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          flex: 1,
        }}>
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div style={{
            padding: isMobile ? "12px 18px" : "16px 28px",
            borderTop: `1px solid ${C.gray200}`,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            alignItems: "center",
            background: C.gray50,
            borderRadius: isMobile ? 0 : "0 0 16px 16px",
            flexShrink: 0,
            position: isMobile ? "sticky" : "static",
            bottom: 0,
            zIndex: 2,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Change Password Modal ────────────────────────────────────────
function ChangePasswordModal({ email, session, uid, onClose, showToast }) {
  const [step, setStep] = useState("send");
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [show, setShow] = useState({ new: false, confirm: false });
  const [countdown, setCountdown] = useState(0);
  const remaining = remainingPwChanges(uid);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const strength = (p) => {
    if (!p) return { score: 0, label: "", color: C.gray200 };
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return [
      { score: 0, label: "", color: C.gray200 },
      { score: 1, label: "Weak",   color: "#ef4444" },
      { score: 2, label: "Fair",   color: "#f97316" },
      { score: 3, label: "Good",   color: "#eab308" },
      { score: 4, label: "Strong", color: C.green   },
    ][s];
  };
  const pw = strength(newPw);

  const handleSendOtp = async () => {
    if (remaining <= 0) { setError(`Maximum ${PW_MAX_DAILY} changes/day reached. Try tomorrow.`); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${BASE}/auth/v1/otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY },
        body: JSON.stringify({ email, type: "email" }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error_description || d.message || "Failed to send code"); }
      setStep("verify"); setCountdown(300);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleVerifyAndUpdate = async () => {
    setError("");
    if (otp.length < 8) return setError("Enter the 8-digit code from your email");
    if (newPw.length < 6) return setError("Password must be at least 6 characters");
    if (newPw !== confirmPw) return setError("Passwords do not match");
    if (remainingPwChanges(uid) <= 0) return setError("Daily limit reached");
    setLoading(true);
    try {
      const verifyRes = await fetch(`${BASE}/auth/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY },
        body: JSON.stringify({ email, token: otp, type: "email" }),
      });
      const verifyText = await verifyRes.text();
      if (!verifyRes.ok) { let d = {}; try { d = JSON.parse(verifyText); } catch {} throw new Error(d.error_description || d.message || "Invalid or expired code"); }
      const tok = session?.access_token;
      if (!tok) throw new Error("Session expired. Please sign in again.");
      const updateRes = await fetch(`${BASE}/auth/v1/user`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", apikey: KEY, "Authorization": `Bearer ${tok}` },
        body: JSON.stringify({ password: newPw }),
      });
      if (!updateRes.ok) { const d = await updateRes.json().catch(() => ({})); throw new Error(d.error_description || d.message || "Failed to update password"); }
      incrementPwChanges(uid);
      setStep("done");
      showToast(`Password updated! ${remainingPwChanges(uid)} change${remainingPwChanges(uid) !== 1 ? "s" : ""} remaining today.`, "success");
      setTimeout(() => onClose(), 2500);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const renderContent = () => {
    if (step === "send") {
      return (
        <>
          <p style={{ fontSize
