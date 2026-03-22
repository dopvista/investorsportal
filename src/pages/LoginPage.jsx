// ── src/pages/LoginPage.jsx ───────────────────────────────────────
import { useState, useEffect, useCallback, useMemo, memo } from "react";
import { sbSignIn, sbResetPassword } from "../lib/supabase";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Static CSS injected once at module level ──────────────────────
// Previously this lived inside a JSX <style> tag. That caused the
// browser to re-parse the keyframes string on every re-render and
// visibly restart the Ken Burns animation each time state changed
// (e.g. every keystroke in the email/password fields).
// Injecting into <head> once at module load means keyframes are
// stable for the lifetime of the page.
if (typeof document !== "undefined" && !document.getElementById("lp-styles")) {
  const el = document.createElement("style");
  el.id = "lp-styles";
  el.textContent = `
    @keyframes lp-fadeIn   { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
    @keyframes lp-kenBurns { 0% { transform:scale(1); } 100% { transform:scale(1.08); } }
    @keyframes lp-spin     { to { transform:rotate(360deg); } }
    .lp-kb { animation: lp-kenBurns 12s ease-in-out infinite alternate; }
    input:focus { border-color: ${C.green} !important; }
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

// ── FormLabel ─────────────────────────────────────────────────────
// Defined outside the parent so React never unmounts/remounts it
// on parent re-renders. Previously defined as useCallback inside
// the component which caused React to treat it as a new component
// type on every state change.
const FormLabel = memo(function FormLabel({ text, isMobile }) {
  return (
    <label style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
      {text}
    </label>
  );
});

// ── SubmitBtn ─────────────────────────────────────────────────────
// Defined outside the parent for the same reason. The previous
// implementation caused the button to unmount/remount on every
// keystroke while loading — the spinner animation restarted from
// zero on each state change, causing a visible flicker.
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
        background: loading ? C.gray200 : C.green,
        color: C.white,
        fontWeight: 700,
        fontSize: isMobile ? 16 : 15,
        cursor: loading ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        boxShadow: loading ? "none" : `0 4px 16px ${C.green}55`,
        transition: "background 0.2s",
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
// Extracted as a memo component so it never re-renders due to form
// state changes (typing, error display, loading). Only re-renders
// when the slide data or active index actually changes.
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
            style={{ width: i === activeAd ? 28 : 6, height: 4, borderRadius: 2, background: "white", opacity: i === activeAd ? 0.85 : 0.35, transition: "all 0.3s", cursor: "pointer", border: "none", padding: 0 }}
          />
        ))}
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

  const [view,       setView]       = useState("login");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [activeAd,   setActiveAd]   = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [showPw,     setShowPw]     = useState(false);

  // Guard: reset activeAd when loginSettings loads asynchronously and
  // the new slide array has fewer items than the current activeAd index.
  // Without this, ADVERTS[activeAd] would be undefined → blank slide panel.
  useEffect(() => {
    setActiveAd(prev => (prev >= ADVERTS.length ? 0 : prev));
  }, [ADVERTS.length]);

  // Slideshow autoplay
  useEffect(() => {
    if (isHovering || isMobile) return;
    const t = setInterval(() => setActiveAd(p => (p + 1) % ADVERTS.length), INTERVAL);
    return () => clearInterval(t);
  }, [isHovering, isMobile, INTERVAL, ADVERTS.length]);

  // Input style — only rebuilds when mobile breakpoint changes
  const inpStyle = useMemo(() => isMobile ? {
    width: "100%", padding: "14px 16px", borderRadius: 12, fontSize: 16,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "'Inter', sans-serif",
    background: "rgba(255,255,255,0.08)", color: C.white, transition: "border 0.2s", boxSizing: "border-box",
  } : {
    width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "'Inter', sans-serif",
    background: C.gray50, color: C.text, transition: "border 0.2s", boxSizing: "border-box",
  }, [isMobile]);

  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim() || !password.trim()) return setError("Email and password are required");
    setLoading(true);
    try {
      const session = await sbSignIn(email.trim(), password);
      onLogin(session);
    } catch (err) {
      setError(err.message || "Invalid email or password");
      setLoading(false);
    }
  }, [email, password, onLogin]);

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

  // ── Form header (shared between login + reset views) ────────────
  const formHeader = (
    <div style={{ textAlign: "center", marginBottom: isMobile ? 32 : 20 }}>
      <img src={logo} alt="Investors Portal" style={{ width: isMobile ? 64 : 48, height: isMobile ? 64 : 48, borderRadius: 14, objectFit: "cover", marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
      <div style={{ fontWeight: 800, fontSize: isMobile ? 24 : 16, color: isMobile ? C.white : C.text }}>
        Investors Portal
      </div>
      <div style={{ fontSize: isMobile ? 14 : 13, color: isMobile ? "rgba(255,255,255,0.55)" : C.gray400, marginTop: 4 }}>
        {view === "login" ? "Sign in to your account" : "Reset your password"}
      </div>
      {view === "reset" && !success && (
        <div style={{ marginTop: 14, background: isMobile ? "rgba(245,158,11,0.15)" : `${C.gold}18`, border: `1px solid ${C.gold}55`, borderRadius: 9, padding: "10px 14px", fontSize: isMobile ? 13 : 12, color: C.gold, fontWeight: 600 }}>
          Enter your email to receive a reset link
        </div>
      )}
    </div>
  );

  // ── Alert banners ───────────────────────────────────────────────
  const alerts = (
    <>
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: isMobile ? "12px 16px" : "10px 14px", fontSize: isMobile ? 14 : 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span> {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a", borderRadius: 10, padding: isMobile ? "12px 16px" : "10px 14px", fontSize: isMobile ? 14 : 13, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span>✅</span> {success}
        </div>
      )}
    </>
  );

  // ── Login form ──────────────────────────────────────────────────
  const loginForm = (
    <form onSubmit={handleLogin}>
      <div style={{ marginBottom: 18 }}>
        <FormLabel text="Email Address" isMobile={isMobile} />
        <input style={inpStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" onFocus={onFocusGreen} onBlur={onBlurReset} />
      </div>

      <div style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.85)" : C.text }}>Password</label>
          <button type="button" onClick={() => switchView("reset")}
            style={{ fontSize: isMobile ? 13 : 12, color: C.green, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0 }}>
            Forgot password?
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <input style={{ ...inpStyle, paddingRight: 48 }} type={showPw ? "text" : "password"} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onFocus={onFocusGreen} onBlur={onBlurReset} />
          <button type="button" onClick={() => setShowPw(v => !v)}
            style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400, lineHeight: 1 }}>
            {showPw ? "🙈" : "👁"}
          </button>
        </div>
      </div>

      <SubmitBtn label="Sign In" loadingLabel="Signing in..." loading={loading} isMobile={isMobile} />
    </form>
  );

  // ── Reset form ──────────────────────────────────────────────────
  const resetForm = (
    <form onSubmit={handleReset}>
      <div style={{ marginBottom: 22 }}>
        <FormLabel text="Email Address" isMobile={isMobile} />
        <input style={inpStyle} type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" onFocus={onFocusGreen} onBlur={onBlurReset} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <SubmitBtn label="Send Reset Email" loadingLabel="Sending..." loading={loading} isMobile={isMobile} />
      </div>

      <button type="button" onClick={() => switchView("login")}
        style={{ width: "100%", padding: isMobile ? "14px" : "12px", borderRadius: isMobile ? 12 : 10, border: isMobile ? "1.5px solid rgba(255,255,255,0.2)" : `1.5px solid ${C.gray200}`, background: "transparent", color: isMobile ? "rgba(255,255,255,0.7)" : C.gray400, fontWeight: 600, fontSize: isMobile ? 15 : 14, cursor: "pointer", fontFamily: "inherit" }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = isMobile ? C.white : C.navy; e.currentTarget.style.color = isMobile ? C.white : C.navy; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.2)" : C.gray200; e.currentTarget.style.color = isMobile ? "rgba(255,255,255,0.7)" : C.gray400; }}>
        ← Back to Sign In
      </button>
    </form>
  );

  // ── Form panel (shared between mobile and desktop) ──────────────
  const formPanel = (
    <div style={{ width: "100%", maxWidth: isMobile ? "none" : 312, margin: "0 auto" }}>
      {formHeader}
      {alerts}
      {view === "login" ? loginForm : resetForm}
      {!isMobile && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ textAlign: "center", fontSize: 11, color: C.gray400, fontWeight: 500, marginBottom: 4 }}>Manage Your Investments Digitally</div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            © 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ height: "100%", width: "100%", fontFamily: "'Inter', sans-serif", position: "relative", overflow: "hidden", background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)" }}>

      {/* Background decoration */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* ══════════ MOBILE ══════════ */}
      {isMobile && (
        <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
          {formPanel}
          <div style={{ marginTop: 22, textAlign: "center", opacity: 0.72 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", fontWeight: 500, letterSpacing: "0.01em" }}>Manage Your Investments Digitally</div>
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.34)", fontWeight: 500, letterSpacing: "0.01em" }}>© 2026 Dopvista Creative Hub. All rights reserved.</div>
          </div>
        </div>
      )}

      {/* ══════════ DESKTOP ══════════ */}
      {!isMobile && (
        <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
          <div style={{ width: "min(960px, 92vw)", background: "white", borderRadius: 28, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", display: "grid", gridTemplateColumns: "1.68fr 0.85fr", overflow: "hidden", position: "relative" }}>
            <SlidePanel
              adverts={ADVERTS}
              activeAd={activeAd}
              animated={ANIMATED}
              onDotClick={onDotClick}
              onMouseEnter={onHoverIn}
              onMouseLeave={onHoverOut}
            />
            <div style={{ background: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 26px" }}>
              {formPanel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
