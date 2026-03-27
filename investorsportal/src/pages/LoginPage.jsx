// ── src/pages/LoginPage.jsx ───────────────────────────────────────
import { useState, useEffect, useCallback, useMemo, useRef, memo } from "react";
import { sbSignIn, sbResetPassword, sbSaveSession } from "../lib/supabase";
import {
  loginWithPasskey,
  registerPasskey,
  isWebAuthnSupported,
  getStoredPasskeyInfo,
  storePasskeyInfo,
  clearStoredPasskeyInfo,
  getDeviceName,
} from "../lib/webauthn";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Static CSS injected once at module level ──────────────────────
if (typeof document !== "undefined" && !document.getElementById("lp-styles")) {
  const el = document.createElement("style");
  el.id = "lp-styles";
  el.textContent = `
    @keyframes lp-fadeIn    { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes lp-kenBurns  { 0% { transform:scale(1); } 100% { transform:scale(1.08); } }
    @keyframes lp-spin      { to { transform:rotate(360deg); } }
    @keyframes lp-slideUp   { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
    @keyframes lp-pulse     { 0%,100% { box-shadow: 0 0 0 0 rgba(0,132,61,0.45); } 50% { box-shadow: 0 0 0 14px rgba(0,132,61,0); } }
    @keyframes lp-modalIn   { from { opacity:0; transform:scale(0.92) translateY(12px); } to { opacity:1; transform:scale(1) translateY(0); } }
    @keyframes lp-overlayIn { from { opacity:0; } to { opacity:1; } }
    @keyframes lp-glow      { 0%,100% { box-shadow: 0 8px 32px rgba(0,132,61,0.35); } 50% { box-shadow: 0 8px 48px rgba(0,132,61,0.55); } }
    .lp-kb { animation: lp-kenBurns 12s ease-in-out infinite alternate; }
    input:focus { border-color: ${C.green} !important; }
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus {
      -webkit-box-shadow: 0 0 0px 1000px ${C.gray50} inset !important;
      -webkit-text-fill-color: ${C.text} !important;
      caret-color: ${C.text};
      transition: background-color 5000s ease-in-out 0s;
    }
    .lp-bio-btn:hover { transform: scale(1.06); }
    .lp-bio-btn:active { transform: scale(0.97); }
    .lp-link:hover { opacity: 1 !important; }
  `;
  document.head.appendChild(el);
}

// ── useIsMobile — 80ms debounce ───────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    let t;
    const h = () => { clearTimeout(t); t = setTimeout(() => setIsMobile(window.innerWidth < 768), 80); };
    window.addEventListener("resize", h, { passive: true });
    return () => { window.removeEventListener("resize", h); clearTimeout(t); };
  }, []);
  return isMobile;
};

const DEFAULT_SLIDES = [
  { id: 1, title: "Market Insights",  sub: "Real-time data at your fingertips.",           color: C.navy,    image: "https://images.unsplash.com/photo-1611974717482-480928224732?auto=format&fit=crop&q=80" },
  { id: 2, title: "Secure Investing", sub: "Your assets are protected with us.",            color: "#064e3b", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80" },
  { id: 3, title: "Digital Future",   sub: "Managing investments has never been easier.",   color: "#78350f", image: "https://images.unsplash.com/photo-1551288049-bbda38a5f9a2?auto=format&fit=crop&q=80" },
];

// ── Fingerprint SVG Icon ──────────────────────────────────────────
const FingerprintIcon = memo(function FingerprintIcon({ size = 40, color = "white" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
      <path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
      <path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
      <path d="M2 12a10 10 0 0 1 18-6" />
      <path d="M2 16h.01" />
      <path d="M21.8 16c.2-2 .131-5.354 0-6" />
      <path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
      <path d="M8.65 22c.21-.66.45-1.32.57-2" />
      <path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
    </svg>
  );
});

// ── FormLabel ─────────────────────────────────────────────────────
const FormLabel = memo(function FormLabel({ text, isMobile }) {
  return (
    <label style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
      {text}
    </label>
  );
});

// ── SubmitBtn ─────────────────────────────────────────────────────
const SubmitBtn = memo(function SubmitBtn({ label, loadingLabel, loading, isMobile }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        width: "100%",
        padding: isMobile ? "15px" : "13px",
        borderRadius: isMobile ? 12 : 10,
        border: "none",
        background: loading ? C.gray200 : `linear-gradient(135deg, ${C.green} 0%, #00a34c 100%)`,
        color: C.white,
        fontWeight: 700,
        fontSize: isMobile ? 16 : 15,
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: loading ? "none" : `0 4px 16px ${C.green}44`,
        transition: "background 0.2s, box-shadow 0.2s",
      }}
    >
      {loading ? (
        <>
          <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "lp-spin 0.8s linear infinite" }} />
          {loadingLabel}
        </>
      ) : label}
    </button>
  );
});

// ── SlidePanel ────────────────────────────────────────────────────
const SlidePanel = memo(function SlidePanel({ adverts, activeAd, animated, onDotClick, onMouseEnter, onMouseLeave }) {
  const overlayVal = adverts[activeAd]?.overlay ?? 0.35;
  const hexAlpha   = Math.round(overlayVal * 255).toString(16).padStart(2, "0");

  return (
    <div style={{ position: "relative", background: adverts[activeAd]?.color || C.navy, transition: "background 1s ease", overflow: "hidden", aspectRatio: "4/3.07", height: "auto" }}>
      {adverts.map((ad, i) => (
        <div
          key={ad.id}
          className={animated ? "lp-kb" : ""}
          style={{ position: "absolute", inset: 0, opacity: i === activeAd ? 1 : 0, backgroundImage: `url(${ad.image})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", transition: "opacity 1.2s ease" }}
        />
      ))}

      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${adverts[activeAd]?.color || "#064e3b"}${hexAlpha} 0%, transparent 100%)`, pointerEvents: "none" }} />

      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px", zIndex: 2 }}>
        {adverts.map((ad, i) => (
          <div key={ad.id} style={{ display: i === activeAd ? "block" : "none", animation: "lp-fadeIn 0.8s ease-out" }}>
            <h2 style={{ fontSize: "clamp(22px, 3vw, 29px)", fontWeight: 800, color: "white", margin: "0 0 6px 0", lineHeight: 1.2 }}>{ad.title}</h2>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, maxWidth: 270, margin: 0 }}>{ad.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ position: "absolute", bottom: 20, left: 28, zIndex: 2, display: "flex", gap: 8 }}>
        {adverts.map((_, i) => (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            aria-label={`Slide ${i + 1}`}
            style={{ width: i === activeAd ? 28 : 6, height: 4, borderRadius: 2, background: "white", opacity: i === activeAd ? 0.85 : 0.35, transition: "all 0.3s", cursor: "pointer", border: "none", padding: 0 }}
          />
        ))}
      </div>
    </div>
  );
});

// ── Biometric Registration Modal ──────────────────────────────────
const RegisterModal = memo(function RegisterModal({ isMobile, loading, onRegister, onSkip }) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (modalRef.current) {
      const btn = modalRef.current.querySelector("button");
      if (btn) btn.focus();
    }
  }, []);

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, animation: "lp-overlayIn 0.3s ease" }}
      role="dialog"
      aria-modal="true"
      aria-label="Enable biometric login"
    >
      <div
        ref={modalRef}
        style={{
          width: isMobile ? "100%" : 400,
          maxWidth: "100%",
          background: isMobile ? "rgba(15,30,55,0.97)" : "white",
          borderRadius: 24,
          padding: isMobile ? "32px 24px" : "36px 32px",
          boxShadow: "0 25px 60px rgba(0,0,0,0.35)",
          animation: "lp-modalIn 0.4s ease",
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 72, height: 72, borderRadius: "50%", margin: "0 auto 20px",
          background: `linear-gradient(135deg, ${C.green} 0%, #00a34c 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 8px 32px ${C.green}40`,
        }}>
          <FingerprintIcon size={36} color="white" />
        </div>

        <div style={{ fontWeight: 800, fontSize: isMobile ? 20 : 18, color: isMobile ? C.white : C.text, marginBottom: 8 }}>
          Enable Biometric Login
        </div>
        <div style={{ fontSize: isMobile ? 14 : 13, color: isMobile ? "rgba(255,255,255,0.6)" : C.gray400, lineHeight: 1.6, marginBottom: 28, maxWidth: 300, margin: "0 auto 28px" }}>
          Sign in faster next time with your fingerprint or face. You can manage this anytime in your Profile.
        </div>

        <button
          onClick={onRegister}
          disabled={loading}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: loading ? (isMobile ? "rgba(255,255,255,0.1)" : C.gray200) : `linear-gradient(135deg, ${C.green} 0%, #00a34c 100%)`,
            color: C.white, fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: loading ? "none" : `0 4px 20px ${C.green}44`,
            transition: "all 0.2s", marginBottom: 12,
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "lp-spin 0.8s linear infinite" }} />
              Setting up...
            </>
          ) : (
            <>
              <FingerprintIcon size={18} color="white" />
              Set Up Biometrics
            </>
          )}
        </button>

        <button
          onClick={onSkip}
          disabled={loading}
          style={{
            width: "100%", padding: "12px", borderRadius: 12,
            border: "none", background: "transparent",
            color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400,
            fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
            transition: "color 0.2s",
          }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function LoginPage({ onLogin, loginSettings }) {
  const isMobile = useIsMobile();

  const ADVERTS  = useMemo(() => (loginSettings?.slides || DEFAULT_SLIDES).map((s, i) => ({ ...s, id: i + 1 })), [loginSettings]);
  const INTERVAL = loginSettings?.interval || 5000;
  const ANIMATED = loginSettings?.animated ?? true;

  // WebAuthn capability + stored credential detection
  const [webAuthnSupported] = useState(() => isWebAuthnSupported());
  const [hasStoredPasskey, setHasStoredPasskey] = useState(() => !!getStoredPasskeyInfo());

  // View state: "biometric" | "email" | "reset"
  const [view, setView] = useState(() => {
    if (webAuthnSupported && getStoredPasskeyInfo()) return "biometric";
    return "email";
  });

  const [email,            setEmail]            = useState("");
  const [password,         setPassword]         = useState("");
  const [loading,          setLoading]          = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [error,            setError]            = useState("");
  const [success,          setSuccess]          = useState("");
  const [activeAd,         setActiveAd]         = useState(0);
  const [isHovering,       setIsHovering]       = useState(false);
  const [showPw,           setShowPw]           = useState(false);

  // Registration prompt state
  const [showRegisterPrompt, setShowRegisterPrompt] = useState(false);
  const [pendingSession,     setPendingSession]     = useState(null);
  const [registerLoading,    setRegisterLoading]    = useState(false);

  // Guard: reset activeAd when loginSettings loads asynchronously
  useEffect(() => {
    setActiveAd(prev => (prev >= ADVERTS.length ? 0 : prev));
  }, [ADVERTS.length]);

  // Slideshow autoplay
  useEffect(() => {
    if (isHovering || isMobile) return;
    const t = setInterval(() => setActiveAd(p => (p + 1) % ADVERTS.length), INTERVAL);
    return () => clearInterval(t);
  }, [isHovering, isMobile, INTERVAL, ADVERTS.length]);

  // Input style
  const inpStyle = useMemo(() => isMobile ? {
    width: "100%", padding: "14px 16px", borderRadius: 12, fontSize: 16,
    border: "1.5px solid rgba(255,255,255,0.15)", outline: "none", fontFamily: "'Inter', sans-serif",
    background: "rgba(255,255,255,0.06)", color: C.white, transition: "border 0.2s", boxSizing: "border-box",
  } : {
    width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "'Inter', sans-serif",
    background: "rgba(240,244,248,0.7)", color: C.text, transition: "border 0.2s", boxSizing: "border-box",
  }, [isMobile]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim() || !password.trim()) return setError("Email and password are required");
    setLoading(true);
    try {
      const session = await sbSignIn(email.trim(), password);
      // If WebAuthn is supported but no passkey registered, prompt to register
      if (webAuthnSupported && !getStoredPasskeyInfo()) {
        setPendingSession(session);
        setShowRegisterPrompt(true);
        setLoading(false);
      } else {
        onLogin(session);
      }
    } catch (err) {
      setError(err.message || "Invalid email or password");
      setLoading(false);
    }
  }, [email, password, onLogin, webAuthnSupported]);

  const handleBiometricLogin = useCallback(async () => {
    // In email view, require email; in biometric view, use stored info
    if (view === "email" && !email.trim()) {
      return setError("Enter your email address first");
    }
    setError(""); setSuccess("");
    setBiometricLoading(true);
    try {
      const session = await loginWithPasskey(view === "biometric" ? undefined : email.trim());
      sbSaveSession(session); // persist to localStorage so page refresh keeps the session
      setError("");
      setBiometricLoading(false);
      onLogin(session);
    } catch (err) {
      const msg = err.message || "";
      if (msg === "cancelled" || msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        setError("Biometric sign-in was cancelled. Tap the button to try again.");
      } else if (msg === "no passkeys found" || msg.toLowerCase().includes("no passkeys") || msg.toLowerCase().includes("not found")) {
        // The credential no longer exists on the server — clear stale local data
        clearStoredPasskeyInfo();
        setHasStoredPasskey(false);
        setError("Passkey not found. Please sign in with email & password.");
        if (view === "biometric") setView("email");
      } else {
        setError(msg || "Biometric sign-in failed. Please try again or use email.");
      }
      setBiometricLoading(false);
    }
  }, [email, view, onLogin]);

  const handleRegisterPasskey = useCallback(async () => {
    if (!pendingSession) return;
    setRegisterLoading(true);
    try {
      // Use the session's current token (it's fresh — we just logged in)
      const nickname = `${getDeviceName()} — ${new Date().toLocaleDateString()}`;
      const result = await registerPasskey(pendingSession.access_token, nickname);
      if (result.credentialId) {
        storePasskeyInfo(pendingSession.user?.email || email.trim(), result.credentialId);
        setHasStoredPasskey(true);
      }
      onLogin(pendingSession);
    } catch (err) {
      const msg = err.message || "";
      if (msg === "cancelled" || msg.toLowerCase().includes("cancel") || msg.toLowerCase().includes("abort")) {
        setRegisterLoading(false);
        // Let user try again or skip
      } else {
        // Registration failed — proceed to app anyway
        setRegisterLoading(false);
        onLogin(pendingSession);
      }
    }
  }, [pendingSession, email, onLogin]);

  const handleSkipRegistration = useCallback(() => {
    if (pendingSession) onLogin(pendingSession);
  }, [pendingSession, onLogin]);

  const handleReset = useCallback(async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim()) return setError("Enter your email address");
    setLoading(true);
    try {
      await sbResetPassword(email.trim());
      setSuccess("Reset link sent to your email.");
    } catch (err) {
      setError(err.message || "Password reset failed");
    } finally {
      setLoading(false);
    }
  }, [email]);

  const switchView   = useCallback((v) => { setView(v); setError(""); setSuccess(""); }, []);
  const onDotClick   = useCallback((i) => setActiveAd(i), []);
  const onHoverIn    = useCallback(() => setIsHovering(true), []);
  const onHoverOut   = useCallback(() => setIsHovering(false), []);
  const onFocusGreen = useCallback((e) => { e.target.style.borderColor = C.green; }, []);
  const onBlurReset  = useCallback((e) => {
    e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200;
  }, [isMobile]);

  // ── Divider ───────────────────────────────────────────────────
  const divider = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
      <div style={{ flex: 1, height: 1, background: isMobile ? "rgba(255,255,255,0.12)" : C.gray200 }} />
      <span style={{ fontSize: 11, color: isMobile ? "rgba(255,255,255,0.35)" : C.gray400, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em" }}>or</span>
      <div style={{ flex: 1, height: 1, background: isMobile ? "rgba(255,255,255,0.12)" : C.gray200 }} />
    </div>
  );

  // ── Alert banners ───────────────────────────────────────────────
  const alerts = (
    <div aria-live="polite">
      {error && (
        <div style={{ background: isMobile ? "rgba(239,68,68,0.12)" : "#fef2f2", border: isMobile ? "1px solid rgba(239,68,68,0.25)" : "1px solid #fecaca", color: isMobile ? "#fca5a5" : "#dc2626", borderRadius: 10, padding: isMobile ? "12px 16px" : "10px 14px", fontSize: isMobile ? 14 : 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 8, animation: "lp-fadeIn 0.3s ease" }}>
          <span style={{ flexShrink: 0 }}>!</span> {error}
        </div>
      )}
      {success && (
        <div style={{ background: isMobile ? "rgba(22,163,74,0.12)" : "#f0fdf4", border: isMobile ? "1px solid rgba(22,163,74,0.25)" : "1px solid #bbf7d0", color: isMobile ? "#86efac" : "#16a34a", borderRadius: 10, padding: isMobile ? "12px 16px" : "10px 14px", fontSize: isMobile ? 14 : 13, marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 8, animation: "lp-fadeIn 0.3s ease" }}>
          <span style={{ flexShrink: 0 }}>&#10003;</span> {success}
        </div>
      )}
    </div>
  );

  // ── Form header ─────────────────────────────────────────────────
  const formHeader = (title, subtitle) => (
    <div style={{ textAlign: "center", marginBottom: isMobile ? 28 : 20 }}>
      <img src={logo} alt="Investors Portal" style={{ width: isMobile ? 56 : 44, height: isMobile ? 56 : 44, borderRadius: 13, objectFit: "cover", marginBottom: 10, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }} />
      <div style={{ fontWeight: 800, fontSize: isMobile ? 22 : 16, color: isMobile ? C.white : C.text, letterSpacing: "-0.01em" }}>
        {title}
      </div>
      <div style={{ fontSize: isMobile ? 13 : 12, color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400, marginTop: 4 }}>
        {subtitle}
      </div>
    </div>
  );

  // ═════════════════════════════════════════════════════════════════
  // BIOMETRIC VIEW
  // ═════════════════════════════════════════════════════════════════
  const biometricView = (
    <div key="biometric" style={{ animation: "lp-slideUp 0.45s ease-out", width: "100%", maxWidth: isMobile ? "none" : 340, margin: "0 auto" }}>
      {formHeader("Investors Portal", "Welcome back")}
      {alerts}

      {/* Large biometric button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", margin: "8px 0 24px" }}>
        <button
          className="lp-bio-btn"
          onClick={handleBiometricLogin}
          disabled={biometricLoading}
          aria-label="Sign in with biometrics"
          style={{
            width: isMobile ? 96 : 80,
            height: isMobile ? 96 : 80,
            borderRadius: "50%",
            border: "none",
            background: biometricLoading
              ? (isMobile ? "rgba(255,255,255,0.08)" : C.gray100)
              : `linear-gradient(135deg, ${C.green} 0%, #00a34c 100%)`,
            cursor: biometricLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.2s ease, box-shadow 0.3s ease",
            animation: biometricLoading ? "none" : "lp-glow 2.5s ease-in-out infinite",
            position: "relative",
          }}
        >
          {biometricLoading ? (
            <div style={{ width: 28, height: 28, border: "3px solid rgba(255,255,255,0.2)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "lp-spin 0.8s linear infinite" }} />
          ) : (
            <FingerprintIcon size={isMobile ? 42 : 36} color="white" />
          )}
        </button>
        <div style={{ marginTop: 14, fontSize: isMobile ? 14 : 13, color: isMobile ? "rgba(255,255,255,0.55)" : C.gray400, fontWeight: 500 }}>
          {biometricLoading ? "Verifying..." : "Tap to sign in"}
        </div>
      </div>

      {divider}

      {/* Switch to email login */}
      <button
        className="lp-link"
        onClick={() => switchView("email")}
        aria-label="Switch to email and password login"
        style={{
          width: "100%", padding: isMobile ? "13px" : "11px", borderRadius: isMobile ? 12 : 10,
          border: isMobile ? "1.5px solid rgba(255,255,255,0.12)" : `1.5px solid ${C.gray200}`,
          background: "transparent",
          color: isMobile ? "rgba(255,255,255,0.7)" : C.gray500,
          fontWeight: 600, fontSize: isMobile ? 14 : 13, cursor: "pointer", fontFamily: "inherit",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          opacity: 0.85, transition: "all 0.2s",
        }}
      >
        Use email & password instead
      </button>

      {/* Footer */}
      {!isMobile && (
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ textAlign: "center", fontSize: 11, color: C.gray400, fontWeight: 500, marginBottom: 4 }}>Powered by Claude AI</div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            &copy; 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════
  // EMAIL/PASSWORD VIEW
  // ═════════════════════════════════════════════════════════════════
  const emailView = (
    <div key="email" style={{ animation: "lp-slideUp 0.45s ease-out", width: "100%", maxWidth: isMobile ? "none" : 340, margin: "0 auto" }}>
      {formHeader("Investors Portal", "Sign in to your account")}
      {alerts}

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: 18 }}>
          <FormLabel text="Email Address" isMobile={isMobile} />
          <input style={inpStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" onFocus={onFocusGreen} onBlur={onBlurReset} />
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.85)" : C.text }}>Password</label>
            <button type="button" onClick={() => switchView("reset")}
              style={{ fontSize: isMobile ? 12 : 11, color: C.green, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0 }}>
              Forgot password?
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <input style={{ ...inpStyle, paddingRight: 48 }} type={showPw ? "text" : "password"} placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onFocus={onFocusGreen} onBlur={onBlurReset} />
            <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: isMobile ? "rgba(255,255,255,0.4)" : C.gray400, lineHeight: 1, padding: 0, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPw ? (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                ) : (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        <SubmitBtn label="Sign In" loadingLabel="Signing in..." loading={loading} isMobile={isMobile} />
      </form>

      {/* Switch to biometric (only if passkey is registered on this device) */}
      {webAuthnSupported && hasStoredPasskey && (
        <>
          {divider}
          <button
            className="lp-link"
            onClick={handleBiometricLogin}
            disabled={biometricLoading || loading}
            aria-label="Sign in with biometrics"
            style={{
              width: "100%", padding: isMobile ? "13px" : "11px", borderRadius: isMobile ? 12 : 10,
              border: isMobile ? "1.5px solid rgba(255,255,255,0.12)" : `1.5px solid ${C.gray200}`,
              background: "transparent",
              color: isMobile ? "rgba(255,255,255,0.7)" : C.gray500,
              fontWeight: 600, fontSize: isMobile ? 14 : 13, cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              opacity: (biometricLoading || loading) ? 0.5 : 0.85, transition: "all 0.2s",
            }}
          >
            {biometricLoading ? (
              <>
                <div style={{ width: 14, height: 14, border: "2px solid rgba(128,128,128,0.3)", borderTopColor: isMobile ? "#fff" : C.text, borderRadius: "50%", animation: "lp-spin 0.8s linear infinite", flexShrink: 0 }} />
                Verifying...
              </>
            ) : (
              <>
                <FingerprintIcon size={16} color={isMobile ? "rgba(255,255,255,0.6)" : C.gray500} />
                Sign in with biometrics
              </>
            )}
          </button>
        </>
      )}

      {/* Nudge: if WebAuthn supported but no passkey yet */}
      {webAuthnSupported && !hasStoredPasskey && (
        <div style={{ marginTop: 18, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <FingerprintIcon size={13} color={isMobile ? "rgba(255,255,255,0.28)" : C.gray400} />
          <span style={{ fontSize: isMobile ? 11 : 10, color: isMobile ? "rgba(255,255,255,0.28)" : C.gray400 }}>
            Biometric login available after sign-in
          </span>
        </div>
      )}

      {/* Footer */}
      {!isMobile && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ textAlign: "center", fontSize: 11, color: C.gray400, fontWeight: 500, marginBottom: 4 }}>Powered by Claude AI</div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            &copy; 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>
      )}
    </div>
  );

  // ═════════════════════════════════════════════════════════════════
  // RESET VIEW
  // ═════════════════════════════════════════════════════════════════
  const resetView = (
    <div key="reset" style={{ animation: "lp-slideUp 0.45s ease-out", width: "100%", maxWidth: isMobile ? "none" : 340, margin: "0 auto" }}>
      {formHeader("Investors Portal", "Reset your password")}

      {!success && (
        <div style={{ marginBottom: 16, background: isMobile ? "rgba(245,158,11,0.12)" : `${C.gold}18`, border: `1px solid ${C.gold}44`, borderRadius: 10, padding: "10px 14px", fontSize: isMobile ? 13 : 12, color: C.gold, fontWeight: 600, textAlign: "center" }}>
          Enter your email to receive a reset link
        </div>
      )}

      {alerts}

      <form onSubmit={handleReset}>
        <div style={{ marginBottom: 22 }}>
          <FormLabel text="Email Address" isMobile={isMobile} />
          <input style={inpStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" onFocus={onFocusGreen} onBlur={onBlurReset} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <SubmitBtn label="Send Reset Email" loadingLabel="Sending..." loading={loading} isMobile={isMobile} />
        </div>

        <button type="button" onClick={() => switchView(hasStoredPasskey ? "biometric" : "email")}
          style={{ width: "100%", padding: isMobile ? "13px" : "11px", borderRadius: isMobile ? 12 : 10, border: isMobile ? "1.5px solid rgba(255,255,255,0.12)" : `1.5px solid ${C.gray200}`, background: "transparent", color: isMobile ? "rgba(255,255,255,0.6)" : C.gray400, fontWeight: 600, fontSize: isMobile ? 14 : 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.3)" : C.navy; e.currentTarget.style.color = isMobile ? C.white : C.navy; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.12)" : C.gray200; e.currentTarget.style.color = isMobile ? "rgba(255,255,255,0.6)" : C.gray400; }}>
          &larr; Back to Sign In
        </button>
      </form>

      {/* Footer */}
      {!isMobile && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ textAlign: "center", fontSize: 11, color: C.gray400, fontWeight: 500, marginBottom: 4 }}>Powered by Claude AI</div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            &copy; 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>
      )}
    </div>
  );

  // ── Select active view ──────────────────────────────────────────
  const activeView = view === "biometric" ? biometricView : view === "email" ? emailView : resetView;

  return (
    <div style={{ height: "100%", width: "100%", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)" }}>

      {/* Background decoration */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* ══════════ MOBILE ══════════ */}
      {isMobile && (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 24px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
          {activeView}
          <div style={{ marginTop: 22, textAlign: "center", opacity: 0.72 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 500, letterSpacing: "0.01em" }}>Powered by Claude AI</div>
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 500, letterSpacing: "0.01em" }}>&copy; 2026 <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.</div>
          </div>
        </div>
      )}

      {/* ══════════ DESKTOP ══════════ */}
      {!isMobile && (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
          <div style={{ width: "min(960px, 92vw)", background: "rgba(255,255,255,0.98)", borderRadius: 32, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.1)", display: "grid", gridTemplateColumns: "1.68fr 0.85fr", overflow: "hidden", position: "relative" }}>
            <SlidePanel
              adverts={ADVERTS}
              activeAd={activeAd}
              animated={ANIMATED}
              onDotClick={onDotClick}
              onMouseEnter={onHoverIn}
              onMouseLeave={onHoverOut}
            />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
              {activeView}
            </div>
          </div>
        </div>
      )}

      {/* ══════════ REGISTRATION MODAL ══════════ */}
      {showRegisterPrompt && (
        <RegisterModal
          isMobile={isMobile}
          loading={registerLoading}
          onRegister={handleRegisterPasskey}
          onSkip={handleSkipRegistration}
        />
      )}
    </div>
  );
}
