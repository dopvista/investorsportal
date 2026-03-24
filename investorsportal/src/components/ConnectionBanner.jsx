import React from "react";

const styles = {
  banner: (background) => ({
    position: "sticky",
    top: 0,
    zIndex: 1200,
    background,
    color: "#ffffff",
    padding: "10px 14px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
  }),
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
  button: {
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
  buttonDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
};

export default function ConnectionBanner({
  offline = false,
  updateAvailable = false,
  onRefresh,
}) {
  if (!offline && !updateAvailable) return null;

  const showOffline = offline;
  const showUpdate = !offline && updateAvailable;

  const background = showOffline
    ? "linear-gradient(135deg, #7a0916, #b42318)"
    : "linear-gradient(135deg, #0c2548, #0B1F3A)";

  const title = showOffline ? "You are offline" : "New version available";
  const text = showOffline
    ? offline && updateAvailable
      ? "Cached data is available to view. An update is also pending and will apply when you reconnect."
      : "Cached data is available to view. Saving changes will resume when connection returns."
    : "Refresh now to get the latest app updates.";

  const handleRefresh = () => {
    if (typeof onRefresh === "function") {
      onRefresh();
    }
  };

  return (
    <div
      role={showOffline ? "alert" : "status"}
      aria-live={showOffline ? "assertive" : "polite"}
      style={styles.banner(background)}
    >
      <div style={styles.content}>
        <div style={styles.message}>
          <div style={styles.title}>{title}</div>
          <div style={styles.text}>{text}</div>
        </div>

        {showUpdate && (
          <button
            type="button"
            onClick={handleRefresh}
            disabled={typeof onRefresh !== "function"}
            style={{
              ...styles.button,
              ...(typeof onRefresh !== "function"
                ? styles.buttonDisabled
                : null),
            }}
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
