// ── src/components/UserMenu.jsx ────────────────────────────────────
import { useState, useRef, useEffect } from "react";
import { C } from "./ui";

const ROLE_LABELS = {
  SA: "Super Admin",
  AD: "Admin",
  DE: "Data Entrant",
  VR: "Verifier",
  RO: "Read Only",
};

export default function UserMenu({ profile, session, role, onSignOut, onOpenProfile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const email    = session?.user?.email || session?.email || "";
  const fullName = profile?.full_name  || email.split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const cds      = profile?.cds_number || "—";
  const initials = fullName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarUrl  = profile?.avatar_url || null;
  const roleLabel  = role ? ROLE_LABELS[role] : null;

  const MENU_ITEMS = [
    { icon: "👤", label: "My Profile",     sub: "View & edit your details",  soon: false, action: () => { onOpenProfile(); setOpen(false); } },
    { icon: "🎨", label: "Themes & Preferences", sub: "Theme, notifications & display", soon: true },
    { divider: true },
    { icon: "🚪", label: "Sign Out",       sub: "Exit your session",          soon: false, danger: true, action: onSignOut },
  ];

  return (
    <div ref={ref} style={{ position: "relative", marginTop: "auto" }}>

      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: 12, right: 12,
          background: "#1a2f4a", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 14, boxShadow: "0 -16px 48px rgba(0,0,0,0.5)", zIndex: 9999,
          overflow: "hidden",
        }}>

          {/* Header */}
          <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                background: avatarUrl ? "transparent" : `linear-gradient(135deg, ${C.gold}, #f97316)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: 15, color: C.navy,
                border: `2px solid ${C.white}`,
                boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
              }}>
                {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
              </div>

              <div style={{ minWidth: 0, flex: 1, overflow: "hidden" }}>
                <div style={{
                  color: C.white, fontWeight: 700, fontSize: 13,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {fullName}
                </div>
                <div style={{
                  color: "rgba(255,255,255,0.45)", fontSize: 10.5, marginTop: 1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {email}
                </div>
                <div style={{
                  color: "rgba(255,255,255,0.45)", fontSize: 11.5, fontWeight: 600, marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  letterSpacing: "0.02em",
                }}>
                  {cds}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div style={{ padding: "8px 0" }}>
            {MENU_ITEMS.map((item, i) => {
              if (item.divider) return <div key={i} style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "6px 0" }} />;
              return (
                <button key={i}
                  onClick={() => { if (!item.soon && item.action) item.action(); }}
                  style={{
                    width: "100%", padding: "10px 18px", border: "none", background: "none",
                    cursor: item.soon ? "default" : "pointer", display: "flex",
                    alignItems: "center", gap: 12, textAlign: "left",
                    fontFamily: "inherit", opacity: item.soon ? 0.5 : 1,
                  }}
                  onMouseEnter={e => { if (!item.soon) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                >
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{item.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: item.danger ? "#f87171" : C.white }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>{item.sub}</div>
                  </div>
                  {item.soon && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.gold, background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>SOON</span>
                  )}
                </button>
              );
            })}
          </div>

          <div style={{ padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", textAlign: "center" }}>Investors Portal v1.0</div>
          </div>
        </div>
      )}

      {/* ── Profile Strip ─────────────────────────────────────────── */}
      <button onClick={() => setOpen(o => !o)} style={{
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
          width: 36, height: 36, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
          background: avatarUrl ? "transparent" : `linear-gradient(135deg, ${C.gold}, #f97316)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 13, color: C.navy,
          border: `2px solid ${C.white}`,
          boxShadow: "0 3px 10px rgba(0,0,0,0.25)",
        }}>
          {avatarUrl ? <img src={avatarUrl} alt={fullName} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials}
        </div>
        <div style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden" }}>
          <div style={{ color: C.white, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {fullName}
          </div>
          <div style={{ color: C.gold, fontSize: 11, fontWeight: 600, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {cds}
          </div>
          {roleLabel && (
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: 700, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {roleLabel}
            </div>
          )}
        </div>
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▲</span>
      </button>
    </div>
  );
}
