import React from "react";

export default function ConnectionBanner({
  offline,
  updateAvailable,
  onRefresh,
}) {
  if (!offline && !updateAvailable) return null;

  const bg = offline
    ? "linear-gradient(135deg,#7a0916,#b42318)"
    : "linear-gradient(135deg,#0c2548,#0B1F3A)";

  const title = offline ? "You are offline" : "New version available";
  const text = offline
    ? "Live data and saving may not work until your internet connection returns."
    : "Refresh now to get the latest app updates.";

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1200,
        background: bg,
        color: "#ffffff",
        padding: "10px 14px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{title}</div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.9,
              lineHeight: 1.45,
              marginTop: 2,
            }}
          >
            {text}
          </div>
        </div>

        {updateAvailable && !offline && (
          <button
            onClick={onRefresh}
            style={{
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
            }}
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  );
}
