import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

// ── Mobile breakpoint hook ─────────────────────────────────────────
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

  const inp = useMemo(
    () => ({
      width: "100%",
      padding: isMobile ? "16px" : "11px 14px",
      borderRadius: isMobile ? 14 : 10,
      fontSize: isMobile ? 16 : 14,
      border: `1.5px solid ${C.gray200}`,
      outline: "none",
      fontFamily: "inherit",
      background: C.gray50,
      color: C.text,
      transition: "border 0.2s",
      boxSizing: "border-box",
    }),
    [isMobile]
  );

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

  const handleBack = useCallback(() => {
    localStorage.removeItem("sb_recovery_token");
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
        const token = localStorage.getItem("sb_recovery_token");
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

        localStorage.removeItem("sb_recovery_token");
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

  return (
    <div
      style={{
        height: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        fontFamily: "'Inter', system-ui, sans-serif",
        padding: isMobile ? 16 : 20,
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "-80px",
          right: "-80px",
          width: 360,
          height: 360,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-100px",
          left: "-60px",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes checkPop { 0% { transform:scale(0); } 70% { transform:scale(1.2); } 100% { transform:scale(1); } }
        input::placeholder { color: #9ca3af; }
      `}</style>

      <div
        style={{
          position: "relative",
          zIndex: 1,
          background: C.white,
          borderRadius: isMobile ? 24 : 20,
          padding: isMobile ? "32px 20px" : "40px 36px",
          width: "100%",
          maxWidth: isMobile ? "100%" : 420,
          boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
          animation: "fadeIn 0.35s ease",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: isMobile ? 32 : 28 }}>
          <img
            src={logo}
            alt="Investors Portal"
            style={{
              width: isMobile ? 64 : 56,
              height: isMobile ? 64 : 56,
              borderRadius: 14,
              objectFit: "cover",
              marginBottom: 14,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
          />
          <div style={{ fontWeight: 700, fontSize: 14, color: C.gray400, marginBottom: 6 }}>
            Investors Portal
          </div>
          <div style={{ fontWeight: 800, fontSize: isMobile ? 24 : 20, color: C.text }}>
            Set New Password
          </div>
          <div style={{ fontSize: 14, color: C.gray400, marginTop: 4 }}>
            Choose a strong password for your account
          </div>
        </div>

        {success ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div
              style={{
                width: 64,
                height: 64,
                background: `${C.green}15`,
                border: `2px solid ${C.green}`,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
                animation: "checkPop 0.4s ease",
              }}
            >
              <span style={{ fontSize: 28 }}>✓</span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 8 }}>
              Password Updated!
            </div>
            <div style={{ fontSize: 14, color: C.gray400, lineHeight: 1.6 }}>
              Your password has been changed successfully.
              <br />
              Redirecting you to sign in...
            </div>
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${C.green}33`,
                  borderTop: `2px solid ${C.green}`,
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  color: "#dc2626",
                  borderRadius: 10,
                  padding: "12px 16px",
                  fontSize: 14,
                  marginBottom: 20,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              <label
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.text,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                New Password
              </label>

              <div style={{ position: "relative" }}>
                <input
                  style={{
                    ...inp,
                    paddingRight: 48,
                    borderColor: passwordTooShort ? "#fca5a5" : C.gray200,
                  }}
                  type={show.pw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, pw: !s.pw }))}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 18,
                    color: C.gray400,
                    padding: 0,
                  }}
                >
                  {show.pw ? "🙈" : "👁️"}
                </button>
              </div>

              {password && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    {[1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 4,
                          background: i <= pw.score ? pw.color : C.gray200,
                          transition: "background 0.3s",
                        }}
                      />
                    ))}
                  </div>
                  {pw.label && (
                    <div style={{ fontSize: 12, color: pw.color, fontWeight: 600 }}>
                      {pw.label} password
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 28 }}>
              <label
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: C.text,
                  display: "block",
                  marginBottom: 6,
                }}
              >
                Confirm Password
              </label>

              <div style={{ position: "relative" }}>
                <input
                  style={{
                    ...inp,
                    paddingRight: 48,
                    borderColor: confirm && !passwordsMatch ? "#fca5a5" : C.gray200,
                  }}
                  type={show.cf ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => ({ ...s, cf: !s.cf }))}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 18,
                    color: C.gray400,
                    padding: 0,
                  }}
                >
                  {show.cf ? "🙈" : "👁️"}
                </button>
              </div>

              {confirm && (
                <div
                  style={{
                    fontSize: 12,
                    marginTop: 5,
                    fontWeight: 600,
                    color: passwordsMatch ? C.green : "#ef4444",
                  }}
                >
                  {passwordsMatch ? "✓ Passwords match" : "✗ Passwords do not match"}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                padding: isMobile ? "16px" : "13px",
                borderRadius: isMobile ? 14 : 10,
                border: "none",
                background: loading ? C.gray200 : C.green,
                color: C.white,
                fontWeight: 700,
                fontSize: isMobile ? 17 : 15,
                cursor: loading ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                transition: "background 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      border: "2px solid rgba(255,255,255,0.3)",
                      borderTop: "2px solid #fff",
                      borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                  Updating...
                </>
              ) : (
                "Update Password →"
              )}
            </button>

            <button
              type="button"
              onClick={handleBack}
              style={{
                width: "100%",
                padding: isMobile ? "16px" : "11px",
                borderRadius: isMobile ? 14 : 10,
                marginTop: 12,
                border: `1.5px solid ${C.gray200}`,
                background: C.white,
                color: C.gray400,
                fontWeight: 600,
                fontSize: isMobile ? 16 : 14,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = C.navy;
                e.currentTarget.style.color = C.navy;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = C.gray200;
                e.currentTarget.style.color = C.gray400;
              }}
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {!isMobile && !success && (
          <div
            style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: `1px solid ${C.gray200}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>
              Manage Your Investments Digitally
            </span>
          </div>
        )}

        {!isMobile && !success && (
          <div style={{ marginTop: 8, textAlign: "center" }}>
            <span style={{ fontSize: 11, color: C.gray400 }}>© 2026 </span>
            <span style={{ fontSize: 11, color: C.navy, fontWeight: 700 }}>
              Dopvista Creative Hub
            </span>
            <span style={{ fontSize: 11, color: C.gray400 }}>. All rights reserved.</span>
          </div>
        )}
      </div>
    </div>
  );
}
