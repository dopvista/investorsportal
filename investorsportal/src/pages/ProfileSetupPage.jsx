import { useState, useCallback, useMemo, useEffect } from "react";
import { sbUpsertProfile, sbAutoAssignRole } from "../lib/supabase";
import { C, toProperCase, formatPhoneTZ } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Mobile breakpoint — 80ms debounce, consistent with all other pages ──
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
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(t);
    };
  }, []);

  return isMobile;
};

export default function ProfileSetupPage({ session, onComplete, onCancel }) {
  const meta = session?.user?.user_metadata;
  const [fullName, setFullName] = useState(() => meta?.full_name || meta?.name || "");
  const [phone, setPhone] = useState("");
  const [cdsNumber, setCdsNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isMobile = useIsMobile();

  const desktopInp = useMemo(
    () => ({
      width: "100%",
      padding: "9px 12px",
      borderRadius: 9,
      fontSize: 13,
      border: `1.5px solid ${C.gray200}`,
      outline: "none",
      fontFamily: "inherit",
      background: C.gray50,
      color: C.text,
      transition: "border 0.2s",
      boxSizing: "border-box",
    }),
    []
  );

  const mobileInp = useMemo(
    () => ({
      width: "100%",
      padding: "13px 15px",
      borderRadius: 12,
      fontSize: 15,
      border: "1.5px solid rgba(255,255,255,0.15)",
      outline: "none",
      fontFamily: "inherit",
      background: "rgba(255,255,255,0.08)",
      color: C.white,
      transition: "border 0.2s",
      boxSizing: "border-box",
    }),
    []
  );

  const inp = isMobile ? mobileInp : desktopInp;

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError("");

      const trimmedName = fullName.trim();
      const trimmedPhone = phone.trim();

      if (!trimmedName) return setError("Please enter your full name");
      if (trimmedName.length < 2) return setError("Name must be at least 2 characters");
      if (!trimmedPhone) return setError("Please enter your phone number");
      if (trimmedPhone.length < 6) return setError("Please enter a valid phone number");

      setLoading(true);
      try {
        const profileData = {
          full_name: toProperCase(trimmedName),
          phone: formatPhoneTZ(trimmedPhone),
        };
        const trimmedCds = cdsNumber.trim();
        const fullCds = trimmedCds ? `CDS-${trimmedCds}` : "";
        if (fullCds) profileData.cds_number = fullCds;
        const updated = await sbUpsertProfile(profileData);
        // Auto-assign role based on CDS: AD if first user, RO if AD exists
        if (fullCds) {
          try { await sbAutoAssignRole(fullCds); } catch {}
        }
        onComplete(updated);
      } catch (err) {
        setError(err.message || "Failed to save profile");
      } finally {
        setLoading(false);
      }
    },
    [fullName, phone, cdsNumber, onComplete]
  );

  // ── SVG icon helpers (matching LoginPage style) ─────────────────
  const userIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const phoneIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );

  const cdsIcon = (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          aria-live="polite"
          style={{
            background: isMobile ? "rgba(239,68,68,0.12)" : "#fef2f2",
            border: isMobile ? "1px solid rgba(239,68,68,0.25)" : "1px solid #fecaca",
            color: isMobile ? "#fca5a5" : "#dc2626",
            borderRadius: 10,
            padding: isMobile ? "12px 16px" : "10px 14px",
            fontSize: isMobile ? 14 : 13,
            marginBottom: 16,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            animation: "fadeIn 0.3s ease",
          }}
        >
          <span style={{ flexShrink: 0 }}>!</span> {error}
        </div>
      )}

      <div style={{ marginBottom: isMobile ? 14 : 12 }}>
        <label style={{ fontSize: isMobile ? 13 : 12, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 4 }}>
          Full Name
        </label>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, pointerEvents: "none", display: "flex" }}>
            {userIcon}
          </div>
          <input
            style={{ ...inp, paddingLeft: 38 }}
            type="text"
            placeholder="e.g. John Doe"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            autoFocus
            onFocus={(e) => { e.target.style.borderColor = C.green; }}
            onBlur={(e) => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
          />
        </div>
      </div>

      <div style={{ marginBottom: isMobile ? 14 : 12 }}>
        <label style={{ fontSize: isMobile ? 13 : 12, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 4 }}>
          Phone Number
        </label>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, pointerEvents: "none", display: "flex" }}>
            {phoneIcon}
          </div>
          <input
            style={{ ...inp, paddingLeft: 38 }}
            type="tel"
            placeholder="e.g. +255 712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            onFocus={(e) => { e.target.style.borderColor = C.green; }}
            onBlur={(e) => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
          />
        </div>
      </div>

      <div style={{ marginBottom: isMobile ? 18 : 16 }}>
        <label style={{ fontSize: isMobile ? 13 : 12, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 4 }}>
          CDS Number <span style={{ fontWeight: 400, fontSize: isMobile ? 10 : 11, color: isMobile ? "rgba(255,255,255,0.4)" : C.gray400 }}>(optional)</span>
        </label>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, pointerEvents: "none", display: "flex" }}>
            {cdsIcon}
          </div>
          <span style={{ position: "absolute", left: 38, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.5)" : C.text, fontSize: isMobile ? 15 : 13, fontWeight: 600, pointerEvents: "none", fontFamily: "inherit" }}>CDS-</span>
          <input
            style={{ ...inp, paddingLeft: 76 }}
            type="text"
            placeholder="e.g. 200200"
            value={cdsNumber}
            onChange={(e) => setCdsNumber(e.target.value.replace(/\D/g, ""))}
            onFocus={(e) => { e.target.style.borderColor = C.green; }}
            onBlur={(e) => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
          />
        </div>
        <div style={{ fontSize: 10, color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, marginTop: 3, paddingLeft: 2 }}>
          Leave blank if you don't have one — admin can assign it later
        </div>
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: isMobile ? "13px" : "10px", borderRadius: isMobile ? 12 : 9, border: "none", background: loading ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: isMobile ? 15 : 14, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: isMobile ? (loading ? "none" : `0 4px 16px ${C.green}55`) : "none", transition: "background 0.2s" }}>
        {loading ? (<><div style={{ width: isMobile ? 15 : 14, height: isMobile ? 15 : 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Saving...</>) : "Complete Setup →"}
      </button>

      <button type="button" onClick={onCancel}
        style={{ width: "100%", padding: isMobile ? "12px" : "9px", borderRadius: isMobile ? 12 : 9, marginTop: 10, border: isMobile ? "1.5px solid rgba(255,255,255,0.2)" : `1.5px solid ${C.gray200}`, background: isMobile ? "transparent" : C.white, color: isMobile ? "rgba(255,255,255,0.7)" : C.gray400, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = isMobile ? C.white : C.navy; e.currentTarget.style.color = isMobile ? C.white : C.navy; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.2)" : C.gray200; e.currentTarget.style.color = isMobile ? "rgba(255,255,255,0.7)" : C.gray400; }}>
        Sign Out
      </button>
    </form>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isMobile ? 24 : 20,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: ${isMobile ? "rgba(255,255,255,0.3)" : "#9ca3af"} !important; }
      `}</style>

      {isMobile ? (
        <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <img src={logo} alt="Investors Portal" style={{ width: 60, height: 60, borderRadius: 14, objectFit: "cover", marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
              <div style={{ fontWeight: 800, fontSize: 22, color: C.white }}>Complete Your Profile</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Tell us a bit about yourself to get started</div>
            </div>
            {renderForm()}
          </div>
          <div style={{ marginTop: 22, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 500, letterSpacing: "0.01em" }}>Powered by Claude AI</div>
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 500, letterSpacing: "0.01em" }}>&copy; 2026 <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.</div>
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", zIndex: 1, background: C.white, borderRadius: 20, padding: "28px 32px", width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", animation: "fadeIn 0.35s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 18 }}>
            <img src={logo} alt="Investors Portal" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", marginBottom: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }} />
            <div style={{ fontWeight: 700, fontSize: 12, color: C.gray400, marginBottom: 4 }}>Investors Portal<sup style={{fontSize:"0.9em",fontWeight:800,marginLeft:2,verticalAlign:"top"}}>™</sup></div>
            <div style={{ fontWeight: 800, fontSize: 17, color: C.text }}>Complete Your Profile</div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 3 }}>Tell us a bit about yourself to get started</div>
          </div>
          {renderForm()}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.gray200}`, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.gray400, fontWeight: 500, marginBottom: 4 }}>Powered by Claude AI</div>
            <div style={{ fontSize: 10, color: C.gray400 }}>&copy; 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.</div>
          </div>
        </div>
      )}
    </div>
  );
}
