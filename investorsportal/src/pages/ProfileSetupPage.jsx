import { useState, useCallback, useMemo, useEffect } from "react";
import { sbUpsertProfile } from "../lib/supabase";
import { C } from "../components/ui";
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
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isMobile = useIsMobile();

  const desktopInp = useMemo(
    () => ({
      width: "100%",
      padding: "11px 14px",
      borderRadius: 10,
      fontSize: 14,
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
        const updated = await sbUpsertProfile({
          full_name: trimmedName,
          phone: trimmedPhone,
        });
        onComplete(updated);
      } catch (err) {
        setError(err.message || "Failed to save profile");
      } finally {
        setLoading(false);
      }
    },
    [fullName, phone, onComplete]
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

      <div style={{ marginBottom: isMobile ? 16 : 18 }}>
        <label style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
          Full Name
        </label>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, pointerEvents: "none", display: "flex" }}>
            {userIcon}
          </div>
          <input
            style={{ ...inp, paddingLeft: 42 }}
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

      <div style={{ marginBottom: isMobile ? 20 : 28 }}>
        <label style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
          Phone Number
        </label>
        <div style={{ position: "relative" }}>
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, pointerEvents: "none", display: "flex" }}>
            {phoneIcon}
          </div>
          <input
            style={{ ...inp, paddingLeft: 42 }}
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

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: isMobile ? "14px" : "13px", borderRadius: isMobile ? 12 : 10, border: "none", background: loading ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: isMobile ? (loading ? "none" : `0 4px 16px ${C.green}55`) : "none", transition: "background 0.2s" }}>
        {loading ? (<><div style={{ width: isMobile ? 15 : 16, height: isMobile ? 15 : 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Saving...</>) : "Complete Setup →"}
      </button>

      <button type="button" onClick={onCancel}
        style={{ width: "100%", padding: isMobile ? "13px" : "11px", borderRadius: isMobile ? 12 : 10, marginTop: 12, border: isMobile ? "1.5px solid rgba(255,255,255,0.2)" : `1.5px solid ${C.gray200}`, background: isMobile ? "transparent" : C.white, color: isMobile ? "rgba(255,255,255,0.7)" : C.gray400, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
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
          <div style={{ marginTop: 22, textAlign: "center", opacity: 0.72 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 500, letterSpacing: "0.01em" }}>Manage Your Investments Digitally</div>
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.34)", fontWeight: 500, letterSpacing: "0.01em" }}>© 2026 Dopvista Creative Hub. All rights reserved.</div>
          </div>
        </div>
      ) : (
        <div style={{ position: "relative", zIndex: 1, background: C.white, borderRadius: 20, padding: "40px 36px", width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(0,0,0,0.35)", animation: "fadeIn 0.35s ease" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <img src={logo} alt="Investors Portal" style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover", marginBottom: 14, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }} />
            <div style={{ fontWeight: 700, fontSize: 14, color: C.gray400, marginBottom: 6 }}>Investors Portal</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: C.text }}>Complete Your Profile</div>
            <div style={{ fontSize: 14, color: C.gray400, marginTop: 4 }}>Tell us a bit about yourself to get started</div>
          </div>
          {renderForm()}
          <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>Manage Your Investments Digitally</span>
          </div>
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <span style={{ fontSize: 11, color: C.gray400 }}>© 2026 </span>
            <span style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>
            <span style={{ fontSize: 11, color: C.gray400 }}>. All rights reserved.</span>
          </div>
        </div>
      )}
    </div>
  );
}
