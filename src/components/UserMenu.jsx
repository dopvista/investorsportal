// ── src/components/UserMenu.jsx ───────────────────────────────────
import { useState, useRef, useEffect } from "react";
import { useTheme } from "./ui";

const ROLE_LABELS = {
  SA: "Super Admin",
  AD: "Admin",
  DE: "Data Entrant",
  VR: "Verifier",
  RO: "Read Only",
};

const THEME_OPTIONS = [
  { value: "light",   label: "Light",   icon: "☀️" },
  { value: "dark",    label: "Dark",    icon: "🌙" },
  { value: "default", label: "Default", icon: "⚙️" },
];

export default function UserMenu({ profile, session, role, onSignOut, onOpenProfile }) {
  const { C, theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const email     = session?.user?.email || session?.email || "";
  const fullName  = profile?.full_name || email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const cds       = profile?.cds_number || "—";
  const initials  = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url || null;
  const roleLabel = role ? ROLE_LABELS[role] : null;

  return (
    <div ref={ref} style={{ position: "relative", marginTop: "auto" }}>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 12, right: 12,
          background: "#1a2f4a", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14, boxShadow: "0 -16px 48px rgba(0,0,0,0.5)",
          zIndex: 9999, overflow: "hidden",
        }}>

          {/* User info header */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
                overflow: "hidden",
                background: avatarUrl ? "transparent" : `linear-gradient(135deg, ${C.gold}, #f97316)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, color: C.navy,
                border: "2px solid #ffffff", boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
              }}>
                {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
              </div>
              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 10.5, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
                <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 11.5, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "0.02em" }}>{cds}</div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "8px 0" }}>

            {/* My Profile */}
            <button
              onClick={() => { onOpenProfile(); setOpen(false); }}
              style={{ width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "inherit" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>👤</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>My Profile</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>View &amp; edit your details</div>
              </div>
            </button>

            {/* ── Theme Selector ──────────────────────────────────────── */}
            <div style={{ padding: "10px 18px 12px", borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>🎨</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>App Theme</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>Appearance preference</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {THEME_OPTIONS.map(opt => {
                  const isActive = theme === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setTheme(opt.value)}
                      style={{
                        flex: 1,
                        padding: "7px 4px 8px",
                        borderRadius: 9,
                        border: isActive ? `1.5px solid ${C.green}` : "1.5px solid rgba(255,255,255,0.15)",
                        background: isActive ? `${C.green}25` : "rgba(255,255,255,0.06)",
                        color: isActive ? C.green : "rgba(255,255,255,0.55)",
                        fontWeight: isActive ? 700 : 500,
                        fontSize: 10,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 4,
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                    >
                      <span style={{ fontSize: 15, lineHeight: 1 }}>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 7, textAlign: "center" }}>
                {theme === "default" ? "Following your device setting" : theme === "dark" ? "Dark mode always on" : "Light mode always on"}
              </div>
            </div>
            {/* Sign Out */}
            <button
              onClick={onSignOut}
              style={{ width: "100%", padding: "10px 18px", border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, textAlign: "left", fontFamily: "inherit" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>🚪</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>Sign Out</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>Exit your session</div>
              </div>
            </button>
          </div>

          <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>Investors Portal v1.0</div>
          </div>
        </div>
      )}

      {/* ── Profile Strip ───────────────────────────────────────────── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "14px 16px", border: "none",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: open ? "rgba(255,255,255,0.06)" : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
          transition: "background 0.2s", fontFamily: "inherit",
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
          overflow: "hidden",
          background: avatarUrl ? "transparent" : `linear-gradient(135deg, ${C.gold}, #f97316)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 13, color: C.navy,
          border: "2px solid #ffffff", boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
        }}>
          {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden" }}>
          <div style={{ color: "#ffffff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{fullName}</div>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cds}</div>
          {roleLabel && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{roleLabel}</div>}
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▲</span>
      </button>
    </div>
  );
}
