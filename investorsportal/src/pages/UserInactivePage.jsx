// ── src/pages/UserInactivePage.jsx ─────────────────────────────
// Full-screen gate shown when the user's role is deactivated.
// Shows relevant admin contacts based on user's role.
import { useState, useEffect, memo } from "react";
import { useIsMobile } from "../components/ui";
import { sbGetUserAdminContacts } from "../lib/supabase";
import { Icon } from "../lib/icons";
import logo from "../assets/logo.jpg";

const C = {
  green: "#00843D", navy: "#0A2540", gold: "#D4AF37",
  white: "#ffffff", gray400: "#9CA3AF", red: "#EF4444",
};

const ContactCard = memo(function ContactCard({ admin, isMobile }) {
  const initials = (admin.full_name || "AD")
    .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div style={{
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 14,
      padding: isMobile ? "14px 16px" : "16px 20px",
      display: "flex", alignItems: "center", gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.green} 0%, #00a34c 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, fontSize: 15, fontWeight: 800, color: C.white,
        boxShadow: `0 4px 12px ${C.green}40`,
      }}>
        {initials}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: isMobile ? 14 : 15, color: C.white, marginBottom: 4 }}>
          {admin.full_name || "Administrator"}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {admin.phone && (
            <a href={`tel:${admin.phone}`} style={{
              fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="user" size={11} stroke="rgba(255,255,255,0.4)" />
              {admin.phone}
            </a>
          )}
          {admin.email && (
            <a href={`mailto:${admin.email}`} style={{
              fontSize: 12, color: "rgba(255,255,255,0.6)", textDecoration: "none",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <Icon name="externalLink" size={11} stroke="rgba(255,255,255,0.4)" />
              {admin.email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
});

export default function UserInactivePage({ userId, userName, onSignOut }) {
  const isMobile = useIsMobile();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    sbGetUserAdminContacts(userId)
      .then(list => { if (!cancelled) setAdmins(list || []); })
      .catch(() => { if (!cancelled) setAdmins([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  return (
    <div style={{
      height: "100%", width: "100%", fontFamily: "'Inter', sans-serif",
      position: "relative", overflow: "hidden",
      background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
    }}>
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.15) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.08) 0%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: isMobile ? "24px" : "40px",
        boxSizing: "border-box", position: "relative", zIndex: 1,
      }}>
        <div style={{ width: "100%", maxWidth: isMobile ? "100%" : 440, textAlign: "center" }}>
          <img src={logo} alt="Investors Portal"
            style={{
              width: isMobile ? 56 : 48, height: isMobile ? 56 : 48,
              borderRadius: 13, objectFit: "cover", marginBottom: 12,
              boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
            }}
          />

          <div style={{ fontWeight: 800, fontSize: isMobile ? 22 : 20, color: C.white, marginBottom: 6 }}>
            Investors Portal
          </div>

          {/* Lock icon */}
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            margin: "20px auto 16px",
            background: "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.08) 100%)",
            border: "1px solid rgba(239,68,68,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon name="lock" size={32} stroke={C.red} sw={1.8} />
          </div>

          <div style={{ fontWeight: 800, fontSize: isMobile ? 18 : 17, color: C.white, marginBottom: 8 }}>
            Account Deactivated
          </div>

          {isMobile ? (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 28 }}>
              {userName ? <>Hi <span style={{ color: C.gold, fontWeight: 700 }}>{userName}</span>, your</> : "Your"} account has been deactivated.
              <br />
              Contact an administrator below to reactivate.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 6 }}>
                {userName ? <>Hi <span style={{ color: C.gold, fontWeight: 700 }}>{userName}</span>, your</> : "Your"} account has been deactivated by an administrator.
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 28 }}>
                Contact an administrator below to reactivate your access.
              </div>
            </>
          )}

          {/* Admin contacts */}
          {loading ? (
            <div style={{ padding: "20px 0" }}>
              <div style={{
                width: 20, height: 20,
                border: "2px solid rgba(255,255,255,0.15)",
                borderTop: `2px solid ${C.green}`,
                borderRadius: "50%",
                animation: "uip-spin 0.8s linear infinite",
                margin: "0 auto",
              }} />
            </div>
          ) : admins.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28, textAlign: "left" }}>
              {admins.map((a, i) => (
                <ContactCard key={i} admin={a} isMobile={isMobile} />
              ))}
            </div>
          ) : (
            <div style={{
              fontSize: 13, color: "rgba(255,255,255,0.4)",
              marginBottom: 28, padding: "16px",
              background: "rgba(255,255,255,0.04)", borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
              No administrator contacts available. Please reach out to your system administrator.
            </div>
          )}

          {/* Sign out button */}
          <button
            onClick={onSignOut}
            style={{
              width: "100%", padding: isMobile ? "14px" : "12px",
              borderRadius: 12, border: "1.5px solid rgba(255,255,255,0.12)",
              background: "transparent", color: "rgba(255,255,255,0.6)",
              fontWeight: 600, fontSize: isMobile ? 14 : 13,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "all 0.2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; e.currentTarget.style.color = C.white; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "rgba(255,255,255,0.6)"; }}
          >
            <Icon name="arrowLeft" size={14} stroke="currentColor" />
            Sign Out
          </button>

          <div style={{ marginTop: 24, opacity: 0.72 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", fontWeight: 500 }}>Powered by Claude AI</div>
            <div style={{ marginTop: 5, fontSize: 10, color: "rgba(255,255,255,0.28)", fontWeight: 500 }}>
              &copy; 2026 <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes uip-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
