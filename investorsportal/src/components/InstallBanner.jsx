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

function getUA() {
  if (typeof window === "undefined") return "";
  return window.navigator.userAgent.toLowerCase();
}

function isAndroid() {
  return /android/i.test(getUA());
}

function isIos() {
  return /iphone|ipad|ipod/i.test(getUA());
}

function isSafari() {
  const ua = getUA();
  return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android");
}

function isSamsungInternet() {
  return getUA().includes("samsungbrowser");
}

function isFirefoxAndroid() {
  const ua = getUA();
  return ua.includes("android") && ua.includes("firefox");
}

function isOperaAndroid() {
  const ua = getUA();
  return ua.includes("android") && ua.includes("opr");
}

function isEdgeAndroid() {
  const ua = getUA();
  return ua.includes("android") && ua.includes("edg");
}

function isDesktopChrome() {
  const ua = getUA();
  return !isAndroid() && !isIos() && ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr") && !ua.includes("samsungbrowser");
}

function isDesktopEdge() {
  const ua = getUA();
  return !isAndroid() && !isIos() && ua.includes("edg");
}

function isDesktopOpera() {
  const ua = getUA();
  return !isAndroid() && !isIos() && ua.includes("opr");
}

function isDesktopInstallSupported() {
  return isDesktopChrome() || isDesktopEdge() || isDesktopOpera();
}

function getDesktopBrowserLabel() {
  if (isDesktopEdge()) return "Edge";
  if (isDesktopOpera()) return "Opera";
  return "Chrome";
}

function isChromeAndroid() {
  const ua = getUA();
  return (
    ua.includes("android") &&
    ua.includes("chrome") &&
    !ua.includes("edg") &&
    !ua.includes("opr") &&
    !ua.includes("samsungbrowser") &&
    !ua.includes("firefox")
  );
}

function getAndroidBrowserLabel() {
  if (isSamsungInternet()) return "Samsung Internet";
  if (isFirefoxAndroid()) return "Firefox";
  if (isOperaAndroid()) return "Opera";
  if (isEdgeAndroid()) return "Edge";
  if (isChromeAndroid()) return "Chrome";
  return "your browser";
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
  const [showDesktopHint, setShowDesktopHint] = useState(false);
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
    setShowDesktopHint(!standalone && !ios && !android && isDesktopInstallSupported());

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowAndroidHint(false);
      setShowHowToInstall(false);
      setShowDesktopHint(false);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHint(false);
      setShowAndroidHint(false);
      setShowHowToInstall(false);
      setShowDesktopHint(false);

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
        text: "Install Investors Portal on your device for quicker access.",
        mode: "ios",
      };
    }

    if (showAndroidHint) {
      const browserLabel = getAndroidBrowserLabel();
      const browserText =
        browserLabel === "Chrome"
          ? "Install Investors Portal on your Android device for faster access and a full-screen app experience."
          : `Install Investors Portal from ${browserLabel} for faster access and a more app-like experience.`;

      return {
        title: "Install this app",
        text: browserText,
        mode: "android",
        browserLabel,
      };
    }

    if (showDesktopHint) {
      const label = getDesktopBrowserLabel();
      return {
        title: "Install this app",
        text: `Install Investors Portal on your computer for a dedicated app window and faster access.`,
        mode: "desktop",
        browserLabel: label,
      };
    }

    return null;
  }, [deferredPrompt, showIosHint, showAndroidHint, showDesktopHint]);

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

  const androidInstructions = (() => {
    const browserLabel = getAndroidBrowserLabel();

    if (browserLabel === "Chrome") {
      return [
        'Tap the browser menu icon `⋮` in the top-right corner.',
        'Tap `Install app` or `Add to Home screen`.',
        "Confirm the install when the browser asks.",
      ];
    }

    if (browserLabel === "Samsung Internet") {
      return [
        "Open the browser menu.",
        'Look for `Add page to`, `Add to Home screen`, or an install option.',
        "Confirm the action if the browser asks.",
      ];
    }

    if (browserLabel === "Firefox") {
      return [
        "Open the browser menu.",
        'Look for `Install`, `Add to Home screen`, or a similar shortcut option.',
        "Confirm the action if prompted.",
      ];
    }

    if (browserLabel === "Edge") {
      return [
        "Open the browser menu.",
        'Look for `Install this site as an app` or `Add to phone`.',
        "Confirm the install if prompted.",
      ];
    }

    if (browserLabel === "Opera") {
      return [
        "Open the browser menu.",
        'Look for `Add to Home screen` or an install option.',
        "Confirm the action if prompted.",
      ];
    }

    return [
      "Open your browser menu.",
      'Look for `Install app`, `Install`, or `Add to Home screen`.',
      "Confirm the action if prompted.",
    ];
  })();

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

          {(variant.mode === "android" || variant.mode === "ios" || variant.mode === "desktop") && (
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
            <div style={baseStyles.helperTitle}>
              Install from {getAndroidBrowserLabel()}
            </div>
            {androidInstructions.map((step, index) => (
              <div key={index} style={baseStyles.helperStep}>
                {index + 1}. {step}
              </div>
            ))}
          </div>
        )}

        {showHowToInstall && variant.mode === "ios" && (
          <div style={{ ...baseStyles.helperPanel, ...theme.helperPanel }}>
            <div style={baseStyles.helperTitle}>Install on iPhone or iPad</div>
            <div style={baseStyles.helperStep}>1. Tap the `Share` button in Safari.</div>
            <div style={baseStyles.helperStep}>2. Scroll down and tap `Add to Home Screen`.</div>
            <div style={baseStyles.helperStep}>3. Tap `Add` to finish installing the app.</div>
            <div style={{ ...baseStyles.helperStep, marginTop: 10, opacity: 0.75, fontSize: 11 }}>
              Note: On iOS, push notifications and background data sync are not supported by Safari.
            </div>
          </div>
        )}

        {showHowToInstall && variant.mode === "desktop" && (
          <div style={{ ...baseStyles.helperPanel, ...theme.helperPanel }}>
            <div style={baseStyles.helperTitle}>
              Install from {getDesktopBrowserLabel()}
            </div>
            <div style={baseStyles.helperStep}>1. Look for the install icon (⊕) in the address bar on the right side.</div>
            <div style={baseStyles.helperStep}>2. Click it and select `Install`.</div>
            <div style={baseStyles.helperStep}>3. The app will open in its own window — pin it to your taskbar for quick access.</div>
          </div>
        )}
      </div>
    </div>
  );
}
