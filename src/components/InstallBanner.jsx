import React, { useEffect, useState } from "react";

const DISMISS_KEY = "pwa-install-banner-dismissed";

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

function isSafari() {
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("android");
}

const styles = {
  banner: {
    position: "sticky",
    top: 0,
    zIndex: 1190,
    background: "linear-gradient(135deg, #0b1f3a, #163564)",
    color: "#ffffff",
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
    opacity: 0.92,
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
    background: "#D4AF37",
    color: "#0B1F3A",
    fontWeight: 800,
    fontSize: 12,
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
    fontFamily: "inherit",
    whiteSpace: "nowrap",
  },
  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.24)",
    background: "transparent",
    color: "#ffffff",
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

  useEffect(() => {
    const wasDismissed = localStorage.getItem(DISMISS_KEY) === "true";
    const standalone = isStandalone();

    setDismissed(wasDismissed);
    setInstalled(standalone);

    if (!standalone && isIos() && isSafari()) {
      setShowIosHint(true);
    }

    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setShowIosHint(false);
      localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  };

  if (installed || dismissed) return null;
  if (!deferredPrompt && !showIosHint) return null;

  const title = "Install this app";
  const text = deferredPrompt
    ? "Add Investors Portal to your device for faster access and a more app-like experience."
    : 'On iPhone or iPad, tap Share and then "Add to Home Screen" to install this app.';

  return (
    <div role="status" aria-live="polite" style={styles.banner}>
      <div style={styles.content}>
        <div style={styles.message}>
          <div style={styles.title}>{title}</div>
          <div style={styles.text}>{text}</div>
        </div>

        <div style={styles.actions}>
          {deferredPrompt && (
            <button type="button" onClick={handleInstall} style={styles.primaryButton}>
              Install
            </button>
          )}

          <button type="button" onClick={handleDismiss} style={styles.secondaryButton}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
