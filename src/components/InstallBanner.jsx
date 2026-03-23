import React, { useEffect, useMemo, useState } from "react";

const DISMISS_KEY = "pwa-install-banner-dismissed-at";
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isAndroid() {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent);
}

function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isSafari() {
  if (typeof window === "undefined") return false;

  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android");
}

function getDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;

    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;

    return Date.now() - ts < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

function storeDismissedNow() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {}
}

const baseStyles = {
  banner: {
    position: "sticky",
    top: 0,
    zIndex: 1190,
    padding: "10px 14px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
  },
  content: {
    maxWidth: 1400,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  message: {
    minWidth: 0,
    flex: "1 1 260px",
  },
  title: {
    fontSize: 13,
    fontWeight: 800,
  },
  text: {
    fontSize: 12,
    lineHeight: 1.45,
    marginTop: 2,
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  primaryButton: {
    border: "none",
    fontWeight: 800,
    fontSize: 12,
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    fontWeight: 700,
    fontSize: 12,
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  helperPanel: {
    width: "100%",
    marginTop: 10,
    borderRadius: 12,
    padding: "12px 14px",
    fontSize: 12,
    lineHeight: 1.55,
  },
  helperTitle: {
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 6,
  },
  helperStep: {
    marginTop: 4,
  },
};

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showAndroidHint, setShowAndroidHint] = useState(false);
  const [showHowToInstall, setShowHowToInstall] = useState(false);
  const [isMobileView, setIsMobileView] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  useEffect(() => {
    const handleResize = () => setIsMobileView(window.innerWidth < 768);
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const standalone = isStandalone();
    const dismissedRecently = getDismissedRecently();
    const ios = isIos();
    const safari = isSafari();
    const android = isAndroid();

    setInstalled(standalone);
    setDismissed(dismissedRecently);
    setShowIosHint(!standalone && ios && safari);
    setShowAndroidHint(!standalone && android);

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowAndroidHint(false);
      setShowHowToInstall(false);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHint(false);
      setShowAndroidHint(false);
      setShowHowToInstall(false);

      try {
        localStorage.removeItem(DISMISS_KEY);
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const variant = useMemo(() => {
    if (deferredPrompt) {
      return {
        title: "Install this app",
        text: "Add Investors Portal to your device for faster access and a more app-like experience.",
        mode: "prompt",
      };
    }

    if (showIosHint) {
      return {
        title: "Install this app",
        text: 'Install Investors Portal on your device for quicker access.',
        mode: "ios",
      };
    }

    if (showAndroidHint) {
      return {
        title: "Install this app",
        text: "Install Investors Portal on your Android device for faster access and a full-screen app experience.",
        mode: "android",
      };
    }

    return null;
  }, [deferredPrompt, showIosHint, showAndroidHint]);

  const theme = isMobileView
    ? {
        banner: {
          background: "#FFF6BF",
          color: "#5C4400",
        },
        title: {
          color: "#5C4400",
        },
        text: {
          color: "#6B5300",
        },
        primaryButton: {
          background: "#D4AF37",
          color: "#0B1F3A",
        },
        secondaryButton: {
          background: "transparent",
          color: "#5C4400",
          border: "1px solid rgba(92,68,0,0.24)",
        },
        helperPanel: {
          background: "rgba(255,255,255,0.45)",
          color: "#5C4400",
          border: "1px solid rgba(92,68,0,0.12)",
        },
      }
    : {
        banner: {
          background: "linear-gradient(135deg, #0b1f3a, #163564)",
          color: "#ffffff",
        },
        title: {
          color: "#ffffff",
        },
        text: {
          color: "rgba(255,255,255,0.92)",
        },
        primaryButton: {
          background: "#D4AF37",
          color: "#0B1F3A",
        },
        secondaryButton: {
          background: "transparent",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.24)",
        },
        helperPanel: {
          background: "rgba(255,255,255,0.08)",
          color: "#ffffff",
          border: "1px solid rgba(255,255,255,0.12)",
        },
      };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice?.outcome !== "accepted") {
        setDeferredPrompt(null);
        if (isAndroid() && !isStandalone()) {
          setShowAndroidHint(true);
        }
      }
    } catch {
      setDeferredPrompt(null);
      if (isAndroid() && !isStandalone()) {
        setShowAndroidHint(true);
      }
    }
  };

  const handleDismiss = () => {
    storeDismissedNow();
    setDismissed(true);
  };

  const handleHowToInstall = () => {
    setShowHowToInstall((prev) => !prev);
  };

  if (installed || dismissed || !variant) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ ...baseStyles.banner, ...theme.banner }}
    >
      <div style={baseStyles.content}>
        <div style={baseStyles.message}>
          <div style={{ ...baseStyles.title, ...theme.title }}>{variant.title}</div>
          <div style={{ ...baseStyles.text, ...theme.text }}>{variant.text}</div>
        </div>

        <div style={baseStyles.actions}>
          {variant.mode === "prompt" && (
            <button
              type="button"
              onClick={handleInstall}
              style={{ ...baseStyles.primaryButton, ...theme.primaryButton }}
            >
              Install
            </button>
          )}

          {(variant.mode === "android" || variant.mode === "ios") && (
            <button
              type="button"
              onClick={handleHowToInstall}
              style={{ ...baseStyles.primaryButton, ...theme.primaryButton }}
            >
              {showHowToInstall ? "Hide Steps" : "How to Install"}
            </button>
          )}

          <button
            type="button"
            onClick={handleDismiss}
            style={{ ...baseStyles.secondaryButton, ...theme.secondaryButton }}
          >
            Dismiss
          </button>
        </div>

        {showHowToInstall && variant.mode === "android" && (
          <div style={{ ...baseStyles.helperPanel, ...theme.helperPanel }}>
            <div style={baseStyles.helperTitle}>Install on Android Chrome</div>
            <div style={baseStyles.helperStep}>1. Tap the Chrome menu icon `⋮` in the top-right corner.</div>
            <div style={baseStyles.helperStep}>2. Tap `Install app` or `Add to Home screen`.</div>
            <div style={baseStyles.helperStep}>3. Confirm the install when Chrome asks.</div>
          </div>
        )}

        {showHowToInstall && variant.mode === "ios" && (
          <div style={{ ...baseStyles.helperPanel, ...theme.helperPanel }}>
            <div style={baseStyles.helperTitle}>Install on iPhone or iPad</div>
            <div style={baseStyles.helperStep}>1. Tap the `Share` button in Safari.</div>
            <div style={baseStyles.helperStep}>2. Scroll down and tap `Add to Home Screen`.</div>
            <div style={baseStyles.helperStep}>3. Tap `Add` to finish installing the app.</div>
          </div>
        )}
      </div>
    </div>
  );
}
