import React from "react";

// Detect stale chunk / dynamic import failures after a deploy.
// These are usually fixed by loading a fresh copy of the app.
const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
  "loading chunk",
  "loading css chunk",
  "chunkloaderror",
];

function isChunkError(error) {
  const message = String(error?.message || "").toLowerCase();
  const name = String(error?.name || "").toLowerCase();

  return (
    CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern)) ||
    CHUNK_ERROR_PATTERNS.some((pattern) => name.includes(pattern))
  );
}

function getErrorDetails(error) {
  const updateError = isChunkError(error);

  if (updateError) {
    return {
      tone: "update",
      icon: "↻",
      heading: "A new version is available",
      body: "This app has been updated. Reload to get the latest version and continue safely.",
      buttonLabel: "Reload App",
      buttonBackground: "#0f766e",
      buttonShadow: "0 6px 18px rgba(15, 118, 110, 0.28)",
      panelBorder: "rgba(15, 118, 110, 0.18)",
      helpText: "This can happen when the app updates while an older version is still open.",
    };
  }

  return {
    tone: "error",
    icon: "!",
    heading: "Something went wrong",
    body: "The app hit an unexpected problem. Reloading usually fixes it, and your saved data should still be intact.",
    buttonLabel: "Reload App",
    buttonBackground: "#b42318",
    buttonShadow: "0 6px 18px rgba(180, 35, 24, 0.28)",
    panelBorder: "rgba(180, 35, 24, 0.16)",
    helpText: "If this keeps happening, the error details have been logged for debugging.",
  };
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("App crashed:", error, errorInfo);

    if (typeof this.props.onError === "function") {
      try {
        this.props.onError(error, errorInfo);
      } catch (reportingError) {
        console.error("ErrorBoundary onError handler failed:", reportingError);
      }
    }
  }

  handleReload = () => {
    if (typeof window === "undefined") return;

    // Using assign gives a clean navigation path that is often more reliable
    // for stale deployed assets than a soft in-place reload alone.
    window.location.assign(window.location.href);
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const {
      icon,
      heading,
      body,
      buttonLabel,
      buttonBackground,
      buttonShadow,
      panelBorder,
      helpText,
    } = getErrorDetails(this.state.error);

    return (
      <div style={styles.page}>
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          style={{
            ...styles.card,
            border: `1px solid ${panelBorder}`,
          }}
        >
          <div aria-hidden="true" style={styles.iconWrap}>
            <div style={styles.icon}>{icon}</div>
          </div>

          <h1 style={styles.heading}>{heading}</h1>

          <p style={styles.body}>{body}</p>

          <button
            type="button"
            onClick={this.handleReload}
            style={{
              ...styles.button,
              background: buttonBackground,
              boxShadow: buttonShadow,
            }}
          >
            {buttonLabel}
          </button>

          <p style={styles.helpText}>{helpText}</p>
        </div>
      </div>
    );
  }
}

const styles = {
  page: {
    position: "fixed",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background:
      "radial-gradient(circle at top, #18345a 0%, #0b1f3a 45%, #08111f 100%)",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    zIndex: 99999,
  },
  card: {
    width: "100%",
    maxWidth: 480,
    background: "#ffffff",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 22px 60px rgba(0, 0, 0, 0.28)",
    textAlign: "center",
  },
  iconWrap: {
    display: "flex",
    justifyContent: "center",
    marginBottom: 16,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#eef2f7",
    color: "#0b1f3a",
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1,
  },
  heading: {
    margin: 0,
    fontSize: 24,
    lineHeight: 1.2,
    fontWeight: 800,
    color: "#0b1f3a",
  },
  body: {
    margin: "12px 0 24px",
    fontSize: 15,
    lineHeight: 1.65,
    color: "#4b5565",
  },
  button: {
    border: "none",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: 15,
    padding: "13px 24px",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    minWidth: 200,
  },
  helpText: {
    margin: "16px 0 0",
    fontSize: 12,
    lineHeight: 1.5,
    color: "#7a8394",
  },
};
