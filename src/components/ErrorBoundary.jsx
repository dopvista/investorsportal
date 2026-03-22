import React from "react";

// Detect stale-chunk / failed dynamic import errors.
// These happen when a new deploy invalidates old cached JS chunks on
// an installed PWA. The right action is always a reload — not a crash report.
const isChunkError = (error) => {
  const msg = error?.message || "";
  return (
    msg.toLowerCase().includes("failed to fetch dynamically imported module") ||
    msg.toLowerCase().includes("error loading dynamically imported module") ||
    msg.toLowerCase().includes("importing a module script failed") ||
    msg.toLowerCase().includes("loading chunk") ||
    msg.toLowerCase().includes("loading css chunk")
  );
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Keep the full technical detail in the console for developers
    console.error("App crashed:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isUpdate = isChunkError(this.state.error);

    const icon      = isUpdate ? "🎉" : "⚠️";
    const heading   = isUpdate ? "App updated!" : "Something went wrong";
    const body      = isUpdate
      ? "We've just released new features and improvements. Tap the button below to load the latest version."
      : "The app ran into an unexpected problem. Reloading usually fixes it — your data is safe.";
    const btnLabel  = isUpdate ? "Load New Version" : "Reload App";
    const btnBg     = isUpdate ? "#00843D" : "#00843D";

    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          background:
            "radial-gradient(ellipse at 60% 40%,#0c2548 0%,#0B1F3A 50%,#080f1e 100%)",
          fontFamily: "'Inter',system-ui,sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            background: "#ffffff",
            borderRadius: 18,
            padding: 28,
            boxShadow: "0 18px 50px rgba(0,0,0,0.24)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>

          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: "#0B1F3A",
              marginBottom: 10,
            }}
          >
            {heading}
          </div>

          <div
            style={{
              fontSize: 14,
              color: "#5b6472",
              lineHeight: 1.7,
              marginBottom: 24,
            }}
          >
            {body}
          </div>

          <button
            onClick={this.handleReload}
            style={{
              border: "none",
              background: btnBg,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 15,
              padding: "13px 28px",
              borderRadius: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              minWidth: 200,
              boxShadow: "0 4px 14px rgba(0,132,61,0.35)",
            }}
          >
            {btnLabel}
          </button>

          {/* Version hint — only for the update case, still friendly */}
          {isUpdate && (
            <div
              style={{
                marginTop: 16,
                fontSize: 12,
                color: "#9ca3af",
              }}
            >
              This happens automatically when we ship improvements to the app.
            </div>
          )}
        </div>
      </div>
    );
  }
}
