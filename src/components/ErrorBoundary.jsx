import React from "react";

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
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
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
            <div style={{ fontSize: 44, marginBottom: 10 }}>⚠️</div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#0B1F3A",
                marginBottom: 8,
              }}
            >
              Something went wrong
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#5b6472",
                lineHeight: 1.7,
                marginBottom: 20,
              }}
            >
              The app hit an unexpected problem. Reload to recover safely.
            </div>

            {this.state.error?.message && (
              <div
                style={{
                  marginBottom: 18,
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#fff8f8",
                  border: "1px solid #ffd9d9",
                  color: "#b42318",
                  fontSize: 13,
                  lineHeight: 1.5,
                  textAlign: "left",
                  wordBreak: "break-word",
                }}
              >
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReload}
              style={{
                border: "none",
                background: "#00843D",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 14,
                padding: "12px 18px",
                borderRadius: 12,
                cursor: "pointer",
                fontFamily: "inherit",
                minWidth: 160,
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
