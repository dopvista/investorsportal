import React, { useEffect, useState, useRef } from "react";
import logo from "../assets/logo.jpg";
import { Icon } from "../lib/icons";

// ── Storage keys ──────────────────────────────────────────────────
const LATER_KEY  = "pwa-install-later-at";
const NEVER_KEY  = "pwa-install-never";
const VISITS_KEY = "pwa-install-visits";
const LATER_MS   = 24 * 60 * 60 * 1000; // 24 hours

// ── Inject animation CSS once ─────────────────────────────────────
if (typeof document !== "undefined" && !document.getElementById("ib-styles")) {
  const el = document.createElement("style");
  el.id = "ib-styles";
  el.textContent = `
    @keyframes ib-overlay { from { opacity:0 } to { opacity:1 } }
    @keyframes ib-sheet   { from { transform:translateY(100%) } to { transform:translateY(0) } }
    @keyframes ib-banner  { from { transform:translateY(-100%); opacity:0 } to { transform:translateY(0); opacity:1 } }
    .ib-overlay { animation: ib-overlay 0.25s ease forwards; }
    .ib-sheet   { animation: ib-sheet   0.35s cubic-bezier(0.32,0.72,0,1) forwards; }
    .ib-banner  { animation: ib-banner  0.3s ease forwards; }
  `;
  document.head.appendChild(el);
}

// ── Platform helpers ──────────────────────────────────────────────
function getUA() {
  return typeof window !== "undefined" ? window.navigator.userAgent.toLowerCase() : "";
}
function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}
function isIos()    { return /iphone|ipad|ipod/i.test(getUA()); }
function isAndroid(){ return /android/i.test(getUA()); }
function isSafari() { const ua = getUA(); return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android"); }

function getAndroidBrowserLabel() {
  const ua = getUA();
  if (ua.includes("samsungbrowser")) return "Samsung Internet";
  if (ua.includes("android") && ua.includes("firefox")) return "Firefox";
  if (ua.includes("android") && ua.includes("opr"))     return "Opera";
  if (ua.includes("android") && ua.includes("edg"))     return "Edge";
  return "Chrome";
}

function isDesktopInstallSupported() {
  const ua = getUA();
  if (isAndroid() || isIos()) return false;
  return ua.includes("chrome") || ua.includes("edg") || ua.includes("opr");
}

function getDesktopBrowserLabel() {
  const ua = getUA();
  if (ua.includes("edg")) return "Edge";
  if (ua.includes("opr")) return "Opera";
  return "Chrome";
}

// ── Storage helpers ───────────────────────────────────────────────
function isNeverShow()   { try { return localStorage.getItem(NEVER_KEY) === "1"; } catch { return false; } }
function isLaterActive() {
  try {
    const ts = Number(localStorage.getItem(LATER_KEY));
    return Number.isFinite(ts) && Date.now() - ts < LATER_MS;
  } catch { return false; }
}
function getVisits()  { try { return parseInt(localStorage.getItem(VISITS_KEY) || "0", 10); } catch { return 0; } }
function bumpVisits() { try { localStorage.setItem(VISITS_KEY, String(getVisits() + 1)); } catch {} }
function saveLater()  { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch {} }
function saveNever()  { try { localStorage.setItem(NEVER_KEY, "1"); } catch {} }

// ── Android manual install steps ─────────────────────────────────
function getAndroidSteps(label) {
  if (label === "Samsung Internet") return [
    ["📋", "Open the browser menu", "Tap the three-line icon at the bottom"],
    ["➕", "Tap Add page to", "Then choose Add to Home screen"],
    ["✅", "Confirm", "Tap Add when prompted"],
  ];
  if (label === "Firefox") return [
    ["📋", "Open the browser menu", "Tap the three-dot icon"],
    ["➕", "Tap Install", "Or Add to Home screen"],
    ["✅", "Confirm", "Tap Add when prompted"],
  ];
  if (label === "Edge") return [
    ["📋", "Open the browser menu", "Tap the three-dot icon"],
    ["➕", "Tap Add to phone", "Or Install this site as an app"],
    ["✅", "Confirm", "Tap Add when prompted"],
  ];
  if (label === "Opera") return [
    ["📋", "Open the browser menu", "Tap the Opera icon or three-dot icon"],
    ["➕", "Tap Add to Home screen", ""],
    ["✅", "Confirm", "Tap Add when prompted"],
  ];
  // Chrome (default)
  return [
    ["📋", "Open the browser menu", "Tap ⋮ in the top-right corner"],
    ["➕", "Tap Install app", "Or Add to Home screen"],
    ["✅", "Confirm the install", "Tap Install when the dialog appears"],
  ];
}

// ── Component ─────────────────────────────────────────────────────
export default function InstallBanner() {
  const [prompt,    setPrompt]    = useState(null);
  const [visible,   setVisible]   = useState(false);
  const [installed, setInstalled] = useState(false);
  const [hidden,    setHidden]    = useState(false);
  const [isMobile,  setIsMobile]  = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  const timerRef = useRef(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (isStandalone()) { setInstalled(true); return; }
    if (isNeverShow())  { setHidden(true); return; }
    if (isLaterActive()) { setHidden(true); return; }

    bumpVisits();
    const visits = getVisits();
    // Show faster on repeat visits — they're engaged users
    const delay = visits <= 1 ? 4000 : visits <= 3 ? 2500 : 1500;

    // Pick up prompt captured early in main.jsx
    if (window.__installPrompt) setPrompt(window.__installPrompt);

    const onPromptReady = () => {
      if (window.__installPrompt) setPrompt(window.__installPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setVisible(false);
      try {
        localStorage.removeItem(LATER_KEY);
        localStorage.removeItem(NEVER_KEY);
        localStorage.removeItem(VISITS_KEY);
      } catch {}
    };

    window.addEventListener("installprompt:ready", onPromptReady);
    window.addEventListener("appinstalled", onInstalled);

    timerRef.current = setTimeout(() => setVisible(true), delay);

    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("installprompt:ready", onPromptReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Determine install mode
  const mode = (() => {
    if (prompt)                    return "prompt";
    if (isIos() && isSafari())     return "ios";
    if (isAndroid())               return "android";
    if (isDesktopInstallSupported()) return "desktop";
    return null;
  })();

  const handleInstall = async () => {
    if (!prompt) return;
    try {
      prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setVisible(false);
      } else {
        // User declined native dialog — fall through to manual Android steps
        setPrompt(null);
      }
    } catch {
      setPrompt(null);
    }
  };

  const handleLater = () => {
    saveLater();
    setVisible(false);
    setTimeout(() => setHidden(true), 400);
  };

  const handleNever = () => {
    saveNever();
    setVisible(false);
    setTimeout(() => setHidden(true), 400);
  };

  if (installed || hidden || !visible || !mode) return null;

  // ── Mobile: bottom sheet ────────────────────────────────────────
  if (isMobile) {
    const androidLabel = getAndroidBrowserLabel();
    const androidSteps = getAndroidSteps(androidLabel);

    return (
      <>
        {/* Backdrop */}
        <div
          className="ib-overlay"
          onClick={handleLater}
          style={{
            position: "fixed", inset: 0, zIndex: 9998,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(3px)",
          }}
        />

        {/* Sheet */}
        <div
          className="ib-sheet"
          onClick={e => e.stopPropagation()}
          style={{
            position: "fixed", bottom: 0, left: 0, right: 0,
            zIndex: 9999,
            background: "#ffffff",
            borderRadius: "22px 22px 0 0",
            padding: "12px 22px 40px",
            boxShadow: "0 -10px 48px rgba(0,0,0,0.22)",
          }}
        >
          {/* Handle */}
          <div style={{ width: 44, height: 4, borderRadius: 2, background: "#D1D5DB", margin: "0 auto 20px" }} />

          {/* ── iOS instructions ── */}
          {mode === "ios" && (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0B1F3A", marginBottom: 4 }}>
                Add to Home Screen
              </div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18, lineHeight: 1.5 }}>
                Install Investors Portal for instant access from your home screen — no browser bar.
              </div>

              <div style={{ background: "#F0F4F8", borderRadius: 16, padding: "14px 16px", marginBottom: 22 }}>
                {[
                  ["📤", "Tap the Share button", "At the bottom of Safari (the box with an arrow)"],
                  ["➕", "Tap Add to Home Screen", "Scroll down in the share sheet to find it"],
                  ["✅", "Tap Add", "In the top-right corner to confirm"],
                ].map(([icon, bold, sub], i, arr) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < arr.length - 1 ? 16 : 0 }}>
                    <span style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1F3A" }}>{bold}</div>
                      <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{sub}</div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleLater}
                style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: "#0B1F3A", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(11,31,58,0.28)" }}
              >
                Got it
              </button>
            </>
          )}

          {/* ── Android manual steps (no prompt available) ── */}
          {mode === "android" && (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#0B1F3A", marginBottom: 4 }}>
                Install from {androidLabel}
              </div>
              <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18, lineHeight: 1.5 }}>
                Add Investors Portal to your home screen for quick, full-screen access.
              </div>

              <div style={{ background: "#F0F4F8", borderRadius: 16, padding: "14px 16px", marginBottom: 22 }}>
                {androidSteps.map(([icon, bold, sub], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: i < androidSteps.length - 1 ? 16 : 0 }}>
                    <span style={{ fontSize: 22, lineHeight: 1.2, flexShrink: 0 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1F3A" }}>{bold}</div>
                      {sub && <div style={{ fontSize: 12, color: "#64748B", marginTop: 1 }}>{sub}</div>}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleLater}
                style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: "#0B1F3A", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 16px rgba(11,31,58,0.28)" }}
              >
                Got it
              </button>
            </>
          )}

          {/* ── Native prompt (Chrome/Edge on Android) ── */}
          {mode === "prompt" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
                <img
                  src={logo}
                  alt="Investors Portal"
                  style={{ width: 64, height: 64, borderRadius: 16, boxShadow: "0 4px 14px rgba(0,0,0,0.16)", flexShrink: 0 }}
                />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: "#0B1F3A" }}>Investors Portal</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Finance & investments</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 5 }}>
                    {[1,2,3,4,5].map(i => (
                      <span key={i} style={{ fontSize: 13, color: "#F59E0B" }}>★</span>
                    ))}
                    <span style={{ fontSize: 11, color: "#94A3B8", marginLeft: 4 }}>Free</span>
                  </div>
                </div>
              </div>

              <div style={{ background: "#F0F4F8", borderRadius: 12, padding: "12px 14px", marginBottom: 20 }}>
                {[
                  "⚡  Launches instantly from home screen",
                  "📵  Works offline — no internet needed",
                  "🔔  Get notified of important updates",
                ].map((f, i) => (
                  <div key={i} style={{ fontSize: 13, color: "#334155", fontWeight: 500, marginBottom: i < 2 ? 8 : 0 }}>{f}</div>
                ))}
              </div>

              <button
                onClick={handleInstall}
                style={{ width: "100%", padding: "15px", borderRadius: 14, border: "none", background: "#0B1F3A", color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 4px 18px rgba(11,31,58,0.32)" }}
              >
                Install App
              </button>
            </>
          )}

          {/* Dismiss options — shown for all modes */}
          <div style={{ display: "flex", justifyContent: "center", gap: 28, marginTop: 14 }}>
            <button
              onClick={handleLater}
              style={{ background: "none", border: "none", fontSize: 13, fontWeight: 600, color: "#64748B", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}
            >
              Not now
            </button>
            <button
              onClick={handleNever}
              style={{ background: "none", border: "none", fontSize: 13, color: "#94A3B8", cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}
            >
              Don't ask again
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── Desktop: top banner ─────────────────────────────────────────
  const desktopLabel = getDesktopBrowserLabel();
  return (
    <div
      className="ib-banner"
      style={{
        position: "sticky", top: 0, zIndex: 1190,
        background: "linear-gradient(135deg, #0b1f3a, #163564)",
        padding: "10px 16px",
        boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
      }}
    >
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 260px", minWidth: 0 }}>
          <img src={logo} alt="" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Install Investors Portal</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", marginTop: 1 }}>
              {mode === "prompt"
                ? "Get a dedicated app window with faster access and offline support."
                : `Look for the install icon (⊕) in your ${desktopLabel} address bar.`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {mode === "prompt" && (
            <button
              onClick={handleInstall}
              style={{ background: "#D4AF37", color: "#0B1F3A", border: "none", fontWeight: 800, fontSize: 12, padding: "9px 18px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}
            >
              Install
            </button>
          )}
          <button
            onClick={handleLater}
            style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", fontWeight: 600, fontSize: 12, padding: "9px 14px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit" }}
          >
            Later
          </button>
          <button
            onClick={handleNever}
            style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
            title="Don't show again"
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          >
            <Icon name="x" size={14} stroke="rgba(255,255,255,0.6)" sw={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
