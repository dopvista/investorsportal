import { useState, useEffect, useCallback, useMemo } from "react";
import { sbSignIn, sbResetPassword } from "../lib/supabase";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Mobile breakpoint (passive, no SSR issues) ────────────────────
const useIsMobile = () => {
  const [m, setM] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768);
    window.addEventListener("resize", h, { passive: true });
    return () => window.removeEventListener("resize", h);
  }, []);
  return m;
};

const DEFAULT_SLIDES = [
  { id: 1, title: "Market Insights",   sub: "Real-time data at your fingertips.",                    color: C.navy,    image: "https://images.unsplash.com/photo-1611974717482-480928224732?auto=format&fit=crop&q=80" },
  { id: 2, title: "Secure Investing",  sub: "Your assets are protected with us.",                    color: "#064e3b", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80" },
  { id: 3, title: "Digital Future",    sub: "Managing investments has never been easier.",           color: "#78350f", image: "https://images.unsplash.com/photo-1551288049-bbda38a5f9a2?auto=format&fit=crop&q=80" },
];

export default function LoginPage({ onLogin, loginSettings }) {
  const ADVERTS  = useMemo(() => (loginSettings?.slides || DEFAULT_SLIDES).map((s, i) => ({ ...s, id: i + 1 })), [loginSettings]);
  const INTERVAL = loginSettings?.interval || 5000;
  const ANIMATED = loginSettings?.animated ?? true;
  const isMobile = useIsMobile();

  const [view,       setView]       = useState("login");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [success,    setSuccess]    = useState("");
  const [activeAd,   setActiveAd]   = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const [showPw,     setShowPw]     = useState(false);

  useEffect(() => {
    if (isHovering || isMobile) return;
    const t = setInterval(() => setActiveAd(p => (p + 1) % ADVERTS.length), INTERVAL);
    return () => clearInterval(t);
  }, [isHovering, isMobile, INTERVAL, ADVERTS.length]);

  // Desktop input style (original small)
  const desktopInp = {
    width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "'Inter', sans-serif",
    background: C.gray50, color: C.text, transition: "border 0.2s", boxSizing: "border-box",
  };
  // Mobile input style (larger)
  const mobileInp = {
    width: "100%", padding: "14px 16px", borderRadius: 12, fontSize: 16,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "'Inter', sans-serif",
    background: "rgba(255,255,255,0.08)", color: C.white,
    transition: "border 0.2s", boxSizing: "border-box",
  };
  const inpStyle = isMobile ? mobileInp : desktopInp;

  const Label = useCallback(({ text }) => (
    <label style={{
      fontSize: isMobile ? 14 : 13,
      fontWeight: 600,
      color: isMobile ? "rgba(255,255,255,0.9)" : C.text,
      display: "block",
      marginBottom: 6
    }}>{text}</label>
  ), [isMobile]);

  const handleLogin = useCallback(async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!email.trim() || !password.trim()) return setError("Email and password are required");
    setLoading(true);
    try {
      const data = await sbSignIn(email.trim(), password);
      // Clear loading before calling onLogin to ensure smooth transition
      setLoading(false);
      onLogin(data);
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

  const SubmitBtn = useCallback(({ label, loadingLabel }) => (
    <button type="submit" disabled={loading} style={{
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
    }}>
      {loading
        ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />{loadingLabel}</>
        : label}
    </button>
  ), [loading, isMobile]);

  // ── Form content — shared between mobile and desktop ─────────────
  const renderForm = useCallback(() => (
    <div style={{ width: "100%", maxWidth: isMobile ? "none" : 312, margin: "0 auto" }}>
      {/* Logo + title */}
      <div style={{ textAlign: "center", marginBottom: isMobile ? 32 : 20 }}>
        <img src={logo} alt="Investors Portal" style={{ width: isMobile ? 64 : 48, height: isMobile ? 64 : 48, borderRadius: 14, objectFit: "cover", marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
        <div style={{ fontWeight: 800, fontSize: isMobile ? 24 : 16, color: isMobile ? C.white : C.text }}>Investors Portal</div>
        <div style={{ fontSize: isMobile ? 14 : 13, color: isMobile ? "rgba(255,255,255,0.55)" : C.gray400, marginTop: 4 }}>
          {view === "login" ? "Sign in to your account" : "Reset your password"}
        </div>
        {/* Info box – only shown when no success */}
        {view === "reset" && !success && (
          <div style={{
            marginTop: 14,
            background: isMobile ? "rgba(245,158,11,0.15)" : `${C.gold}18`,
            border: `1px solid ${C.gold}55`,
            borderRadius: 9,
            padding: "10px 14px",
            fontSize: isMobile ? 13 : 12,
            color: C.gold,
            fontWeight: 600
          }}>
            Enter your email to receive a reset link
          </div>
        )}
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          background: "#fef2f2",
          border: "1px solid #fecaca",
          color: "#dc2626",
          borderRadius: 10,
          padding: isMobile ? "12px 16px" : "10px 14px",
          fontSize: isMobile ? 14 : 13,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <span>⚠️</span> {error}
        </div>
      )}
      {success && (
        <div style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          color: "#16a34a",
          borderRadius: 10,
          padding: isMobile ? "12px 16px" : "10px 14px",
          fontSize: isMobile ? 14 : 13,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 8
        }}>
          <span>✅</span> {success}
        </div>
      )}

      {/* Login form */}
      {view === "login" && (
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 18 }}>
            <Label text="Email Address" />
            <input
              style={inpStyle}
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} autoComplete="email"
              onFocus={e => { e.target.style.borderColor = C.green; }}
              onBlur={e => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
            />
          </div>
          <div style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <label style={{ fontSize: isMobile ? 14 : 13, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.85)" : C.text }}>Password</label>
              <button type="button"
                onClick={() => { setView("reset"); setError(""); setSuccess(""); }}
                style={{ fontSize: isMobile ? 13 : 12, color: C.green, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, padding: 0 }}>
                Forgot password?
              </button>
            </div>
            <div style={{ position: "relative" }}>
              <input
                style={{ ...inpStyle, paddingRight: 48 }}
                type={showPw ? "text" : "password"} placeholder="••••••••" value={password}
                onChange={e => setPassword(e.target.value)} autoComplete="current-password"
                onFocus={e => { e.target.style.borderColor = C.green; }}
                onBlur={e => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 18, color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400, lineHeight: 1 }}>
                {showPw ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          <SubmitBtn label="Sign In →" loadingLabel="Signing in..." />
        </form>
      )}

      {/* Reset form */}
      {view === "reset" && (
        <form onSubmit={handleReset}>
          <div style={{ marginBottom: 22 }}>
            <Label text="Email Address" />
            <input
              style={inpStyle}
              type="email" placeholder="you@example.com" value={email}
              onChange={e => setEmail(e.target.value)} autoComplete="email"
              onFocus={e => { e.target.style.borderColor = C.green; }}
              onBlur={e => { e.target.style.borderColor = isMobile ? "rgba(255,255,255,0.15)" : C.gray200; }}
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <SubmitBtn label="Send Reset Email" loadingLabel="Sending..." />
          </div>
          <button type="button"
            onClick={() => { setView("login"); setError(""); setSuccess(""); }}
            style={{
              width: "100%",
              padding: isMobile ? "14px" : "12px",
              borderRadius: isMobile ? 12 : 10,
              border: isMobile ? "1.5px solid rgba(255,255,255,0.2)" : `1.5px solid ${C.gray200}`,
              background: "transparent",
              color: isMobile ? "rgba(255,255,255,0.7)" : C.gray400,
              fontWeight: 600,
              fontSize: isMobile ? 15 : 14,
              cursor: "pointer",
              fontFamily: "inherit"
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = isMobile ? C.white : C.navy; e.currentTarget.style.color = isMobile ? C.white : C.navy; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.2)" : C.gray200; e.currentTarget.style.color = isMobile ? "rgba(255,255,255,0.7)" : C.gray400; }}>
            ← Back to Sign In
          </button>
        </form>
      )}

      {/* Footer – only on desktop, no dot */}
      {!isMobile && (
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>Manage Your Investments Digitally</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            © 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>
      )}
    </div>
  ), [isMobile, view, email, password, showPw, error, success, loading, handleLogin, handleReset, Label, SubmitBtn, inpStyle]);

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      fontFamily: "'Inter', sans-serif",
      position: "relative", overflow: "hidden",
      background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
    }}>
      <style>{`
        @keyframes fadeIn  { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes kenBurns{ 0% { transform:scale(1); } 100% { transform:scale(1.08); } }
        @keyframes spin    { to { transform:rotate(360deg); } }
        ${ANIMATED && !isMobile ? ".ad-bg { animation: kenBurns 12s ease-in-out infinite alternate; }" : ""}
        input:focus { border-color: ${C.green} !important; }
        input::placeholder { color: ${isMobile ? "rgba(255,255,255,0.3)" : "#9ca3af"} !important; }
      `}</style>

      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      {/* Green glow */}
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      {/* Gold glow */}
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* MOBILE LAYOUT */}
      {isMobile && (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
          {renderForm()}
        </div>
      )}

      {/* DESKTOP LAYOUT */}
      {!isMobile && (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, boxSizing: "border-box" }}>
          <div style={{
            width: "min(960px, 92vw)", background: "white", borderRadius: 28,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
            display: "grid", gridTemplateColumns: "1.68fr 0.85fr",
            overflow: "hidden", position: "relative",
          }}>
            {/* LEFT: Image slider */}
            <div style={{ position: "relative", background: ADVERTS[activeAd].color, transition: "background 1s ease", overflow: "hidden", aspectRatio: "4/3.07", height: "auto" }}>
              {ADVERTS.map((ad, i) => (
                <div
                  key={ad.id}
                  className={ANIMATED ? "ad-bg" : ""}
                  style={{ position: "absolute", inset: 0, opacity: i === activeAd ? 1 : 0, backgroundImage: `url(${ad.image})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat", transition: "opacity 1.2s ease" }}
                />
              ))}
              <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${ADVERTS[activeAd]?.color || "#064e3b"}${Math.round(((ADVERTS[activeAd]?.overlay ?? 0.35)) * 255).toString(16).padStart(2,"0")} 0%, transparent 100%)`, pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px", zIndex: 2 }}>
                {ADVERTS.map((ad, i) => (
                  <div key={ad.id} style={{ display: i === activeAd ? "block" : "none", animation: "fadeIn 0.8s ease-out" }}>
                    <h2 style={{ fontSize: "clamp(22px, 3vw, 29px)", fontWeight: 800, color: "white", margin: "0 0 6px 0", lineHeight: 1.2 }}>{ad.title}</h2>
                    <p style={{ fontSize: 13, color: "rgba(255,255,255,0.9)", lineHeight: 1.5, maxWidth: 270, margin: 0 }}>{ad.sub}</p>
                  </div>
                ))}
              </div>
              <div style={{ position: "absolute", bottom: 20, left: 28, zIndex: 2, display: "flex", gap: 8 }}>
                {ADVERTS.map((_, i) => (
                  <button key={i} onClick={() => setActiveAd(i)} onMouseEnter={() => setIsHovering(true)} onMouseLeave={() => setIsHovering(false)}
                    style={{ width: i === activeAd ? 28 : 6, height: 4, borderRadius: 2, background: "white", opacity: i === activeAd ? 0.85 : 0.35, transition: "all 0.3s", cursor: "pointer", border: "none", padding: 0 }} />
                ))}
              </div>
            </div>

            {/* RIGHT: Form */}
            <div style={{ background: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 26px" }}>
              <style>{`input::placeholder { color: #9ca3af !important; }`}</style>
              {renderForm()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
