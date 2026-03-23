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
};

export default function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [showAndroidHint, setShowAndroidHint] = useState(false);
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
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHint(false);
      setShowAndroidHint(false);

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
        actionLabel: "Install",
        mode: "prompt",
      };
    }

    if (showIosHint) {
      return {
        title: "Install this app",
        text: 'On iPhone or iPad, tap Share and then "Add to Home Screen" to install this app.',
        actionLabel: null,
        mode: "ios",
      };
    }

    if (showAndroidHint) {
      return {
        title: "Install this app",
        text: 'If the install prompt does not appear automatically, open Chrome menu (⋮) and tap "Install app" or "Add to Home screen".',
        actionLabel: null,
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
      };

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
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
              {variant.actionLabel}
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
      </div>
    </div>
  );
}
