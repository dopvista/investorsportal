import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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

export default function ResetPasswordPage({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [show, setShow] = useState({ pw: false, cf: false });

  const successTimerRef = useRef(null);

  const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const isMobile = useIsMobile();

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, []);

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

  const strength = useCallback((p) => {
    if (!p) return { score: 0, label: "", color: C.gray200 };

    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;

    const map = [
      { score: 0, label: "", color: C.gray200 },
      { score: 1, label: "Weak", color: "#ef4444" },
      { score: 2, label: "Fair", color: "#f97316" },
      { score: 3, label: "Good", color: "#eab308" },
      { score: 4, label: "Strong", color: C.green },
    ];

    return map[score];
  }, []);

  const pw = strength(password);
  const passwordsMatch = !confirm || password === confirm;
  const passwordTooShort = password.length > 0 && password.length < 8;

  // FIX: App.jsx writes the recovery token to sessionStorage (not localStorage).
  // Previously this read from localStorage so the token was never found,
  // causing every password reset attempt to fail with "Reset link expired".
  const handleBack = useCallback(() => {
    sessionStorage.removeItem("sb_recovery_token");
    onDone();
  }, [onDone]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError("");

      if (password.length < 8) {
        return setError("Password must be at least 8 characters");
      }
      if (password !== confirm) {
        return setError("Passwords do not match");
      }

      setLoading(true);

      try {
        // FIX: read from sessionStorage to match App.jsx which writes there
        const token = sessionStorage.getItem("sb_recovery_token");
        if (!token) {
          throw new Error(
            "Reset link expired or already used. Please request a new password reset link."
          );
        }

        const res = await fetch(`${BASE}/auth/v1/user`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            apikey: KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg =
            data.error_description || data.message || data.msg || data.error || null;

          if (
            msg?.toLowerCase().includes("expired") ||
            msg?.toLowerCase().includes("invalid")
          ) {
            throw new Error("Reset link has expired. Please go back and request a new one.");
          }

          throw new Error(msg || "Failed to update password — please try again.");
        }

        // FIX: remove from sessionStorage to match the write location
        sessionStorage.removeItem("sb_recovery_token");
        setSuccess(true);

        successTimerRef.current = setTimeout(() => {
          onDone();
        }, 3000);
      } catch (err) {
        setError(err.message || "Failed to update password.");
      } finally {
        setLoading(false);
      }
    },
    [password, confirm, BASE, KEY, onDone]
  );

  const renderSuccess = () => (
    <div style={{ textAlign: "center", padding: isMobile ? "12px 0" : "20px 0" }}>
      <div
        style={{
          width: isMobile ? 60 : 64,
          height: isMobile ? 60 : 64,
          background: isMobile ? "rgba(0,132,61,0.15)" : `${C.green}15`,
          border: `2px solid ${C.green}`,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: `0 auto ${isMobile ? 18 : 20}px`,
          animation: "checkPop 0.4s ease",
        }}
      >
        <span style={{ fontSize: isMobile ? 26 : 28, color: isMobile ? C.white : C.text }}>✓</span>
      </div>
      <div style={{ fontWeight: 700, fontSize: isMobile ? 17 : 16, color: isMobile ? C.white : C.text, marginBottom: 8 }}>
        Password Updated!
      </div>
      <div style={{ fontSize: isMobile ? 13 : 14, color: isMobile ? "rgba(255,255,255,0.65)" : C.gray400, lineHeight: 1.6 }}>
        Your password has been changed successfully.<br />Redirecting you to sign in...
      </div>
      <div style={{ marginTop: isMobile ? 18 : 20, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 16, height: 16, border: isMobile ? "2px solid rgba(255,255,255,0.2)" : `2px solid ${C.green}33`, borderTop: isMobile ? `2px solid ${C.white}` : `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    </div>
  );

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#dc2626",
            borderRadius: 10,
            padding: isMobile ? "11px 14px" : "12px 16px",
            fontSize: isMobile ? 13 : 14,
            marginBottom: isMobile ? 16 : 20,
            display: isMobile ? "flex" : "block",
            alignItems: isMobile ? "center" : undefined,
            gap: isMobile ? 8 : undefined,
          }}
        >
          {isMobile && <span>⚠️</span>}
          {error}
        </div>
      )}

      <div style={{ marginBottom: isMobile ? 16 : 18 }}>
        <label style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
          New Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            style={{ ...inp, paddingRight: 48, borderColor: passwordTooShort ? "#fca5a5" : (isMobile ? "rgba(255,255,255,0.15)" : C.gray200) }}
            type={show.pw ? "text" : "password"}
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            onFocus={(e) => { e.target.style.borderColor = passwordTooShort ? "#fca5a5" : C.green; }}
            onBlur={(e) => { e.target.style.borderColor = passwordTooShort ? "#fca5a5" : (isMobile ? "rgba(255,255,255,0.15)" : C.gray200); }}
          />
          <button type="button" onClick={() => setShow((s) => ({ ...s, pw: !s.pw }))}
            style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: isMobile ? 17 : 18, color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400, padding: 0 }}>
            {show.pw ? "🙈" : "👁️"}
          </button>
        </div>
        {password && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} style={{ flex: 1, height: 4, borderRadius: 4, background: i <= pw.score ? pw.color : (isMobile ? "rgba(255,255,255,0.14)" : C.gray200), transition: "background 0.3s" }} />
              ))}
            </div>
            {pw.label && <div style={{ fontSize: isMobile ? 11 : 12, color: pw.color, fontWeight: 600 }}>{pw.label} password</div>}
          </div>
        )}
      </div>

      <div style={{ marginBottom: isMobile ? 20 : 28 }}>
        <label style={{ fontSize: isMobile ? 13 : 14, fontWeight: 600, color: isMobile ? "rgba(255,255,255,0.9)" : C.text, display: "block", marginBottom: 6 }}>
          Confirm Password
        </label>
        <div style={{ position: "relative" }}>
          <input
            style={{ ...inp, paddingRight: 48, borderColor: confirm && !passwordsMatch ? "#fca5a5" : (isMobile ? "rgba(255,255,255,0.15)" : C.gray200) }}
            type={show.cf ? "text" : "password"}
            placeholder="Repeat your password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            onFocus={(e) => { e.target.style.borderColor = confirm && !passwordsMatch ? "#fca5a5" : C.green; }}
            onBlur={(e) => { e.target.style.borderColor = confirm && !passwordsMatch ? "#fca5a5" : (isMobile ? "rgba(255,255,255,0.15)" : C.gray200); }}
          />
          <button type="button" onClick={() => setShow((s) => ({ ...s, cf: !s.cf }))}
            style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: isMobile ? 17 : 18, color: isMobile ? "rgba(255,255,255,0.5)" : C.gray400, padding: 0 }}>
            {show.cf ? "🙈" : "👁️"}
          </button>
        </div>
        {confirm && (
          <div style={{ fontSize: isMobile ? 11 : 12, marginTop: 5, fontWeight: 600, color: passwordsMatch ? C.green : "#ef4444" }}>
            {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
          </div>
        )}
      </div>

      <button type="submit" disabled={loading}
        style={{ width: "100%", padding: isMobile ? "14px" : "13px", borderRadius: isMobile ? 12 : 10, border: "none", background: loading ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: isMobile ? 15 : 15, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: isMobile ? (loading ? "none" : `0 4px 16px ${C.green}55`) : "none", transition: "background 0.2s" }}>
        {loading ? (<><div style={{ width: isMobile ? 15 : 16, height: isMobile ? 15 : 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Updating...</>) : "Update Password →"}
      </button>

      <button type="button" onClick={handleBack}
        style={{ width: "100%", padding: isMobile ? "13px" : "11px", borderRadius: isMobile ? 12 : 10, marginTop: 12, border: isMobile ? "1.5px solid rgba(255,255,255,0.2)" : `1.5px solid ${C.gray200}`, background: isMobile ? "transparent" : C.white, color: isMobile ? "rgba(255,255,255,0.7)" : C.gray400, fontWeight: 600, fontSize: isMobile ? 14 : 14, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = isMobile ? C.white : C.navy; e.currentTarget.style.color = isMobile ? C.white : C.navy; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = isMobile ? "rgba(255,255,255,0.2)" : C.gray200; e.currentTarget.style.color = isMobile ? "rgba(255,255,255,0.7)" : C.gray400; }}>
        ← Back to Sign In
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
        @keyframes checkPop { 0% { transform:scale(0); } 70% { transform:scale(1.2); } 100% { transform:scale(1); } }
        input::placeholder { color: ${isMobile ? "rgba(255,255,255,0.3)" : "#9ca3af"} !important; }
      `}</style>

      {isMobile ? (
        <div style={{ minHeight: "100vh", width: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", boxSizing: "border-box", position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: "none", margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 30 }}>
              <img src={logo} alt="Investors Portal" style={{ width: 60, height: 60, borderRadius: 14, objectFit: "cover", marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.25)" }} />
              <div style={{ fontWeight: 800, fontSize: 22, color: C.white }}>Set New Password</div>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>Choose a strong password for your account</div>
            </div>
            {success ? renderSuccess() : renderForm()}
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
            <div style={{ fontWeight: 800, fontSize: 20, color: C.text }}>Set New Password</div>
            <div style={{ fontSize: 14, color: C.gray400, marginTop: 4 }}>Choose a strong password for your account</div>
          </div>
          {success ? renderSuccess() : renderForm()}
          {!success && (
            <>
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: `1px solid ${C.gray200}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>Manage Your Investments Digitally</span>
              </div>
              <div style={{ marginTop: 8, textAlign: "center" }}>
                <span style={{ fontSize: 11, color: C.gray400 }}>© 2026 </span>
                <span style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>
                <span style={{ fontSize: 11, color: C.gray400 }}>. All rights reserved.</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
