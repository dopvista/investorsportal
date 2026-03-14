import { useEffect, useRef, useState } from "react";
import { getSession, sbSignOut, sbGetProfile, sbGetMyRole, sbGetSiteSettings } from "./lib/supabase";
import { C, Toast } from "./components/ui";
import CompaniesPage from "./pages/CompaniesPage";
import TransactionsPage from "./pages/TransactionsPage";
import LoginPage from "./pages/LoginPage";
import ProfileSetupPage from "./pages/ProfileSetupPage";
import ProfilePage from "./pages/ProfilePage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import UserManagementPage from "./pages/UserManagementPage";
import SystemSettingsPage from "./pages/SystemSettingsPage";
import DashboardPage from "./pages/DashboardPage";
import UserMenu from "./components/UserMenu";
import useIdleLogout from "./hooks/useIdleLogout";
import logo from "./assets/logo.jpg";

// ── Role-based nav visibility ──────────────────────────────────────
const NAV = [
  { id: "dashboard",       label: "Dashboard",       icon: "🏠", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "companies",       label: "Portfolio",        icon: "📊", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "transactions",    label: "Transactions",     icon: "📋", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "user-management", label: "User Management",  icon: "👥", roles: ["SA", "AD"] },
  { id: "system-settings", label: "System Settings",  icon: "⚙️", roles: ["SA"] },
];

// ── Role display config ────────────────────────────────────────────
export { ROLE_META } from "./lib/constants";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(undefined);
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem("app_active_tab") || "dashboard";
    } catch {
      return "dashboard";
    }
  });
  const [loginSettings, setLoginSettings] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [toast, setToast] = useState({ msg: "", type: "" });
  const [recoveryMode, setRecoveryMode] = useState(false);

  const toastTimerRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToast({ msg: "", type: "" });
      toastTimerRef.current = null;
    }, 3500);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("app_active_tab", tab);
    } catch {}
  }, [tab]);

  // ── Auto logout after 5 minutes of inactivity ────────────────────
  useIdleLogout({
    enabled: !!session && !recoveryMode,
    onLogout: () => {
      setSession(null);
      setProfile(undefined);
      setRole(null);
      setCompanies([]);
      setTransactions([]);
      setLoading(false);
      setDbError(null);
      showToast("You were logged out after 5 minutes of inactivity.", "error");
    },
  });

  // ── Check session on mount — intercepts recovery tokens (hash + PKCE) ──
  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const hash = window.location.hash;
      const search = window.location.search;

      // ── Old hash-based recovery flow ──────────────────────────────
      if (hash.includes("type=recovery")) {
        const params = new URLSearchParams(hash.replace("#", ""));
        const accessToken = params.get("access_token");
        if (accessToken) {
          localStorage.setItem("sb_recovery_token", accessToken);
          window.history.replaceState(null, "", window.location.pathname);
          if (!cancelled) {
            setRecoveryMode(true);
            setSession(null);
            setLoading(false);
          }
          return;
        }
      }

      // ── New PKCE code-based recovery flow ─────────────────────────
      const qp = new URLSearchParams(search);
      const code = qp.get("code");
      const type = qp.get("type");

      if (code && type === "recovery") {
        window.history.replaceState(null, "", window.location.pathname);

        const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
        const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

        try {
          const res = await fetch(`${BASE}/auth/v1/token?grant_type=pkce`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: KEY },
            body: JSON.stringify({ auth_code: code }),
          });

          const data = await res.json();

          if (cancelled) return;

          if (data?.access_token) {
            localStorage.setItem("sb_recovery_token", data.access_token);
            setRecoveryMode(true);
            setSession(null);
            setLoading(false);
            return;
          }
        } catch {}

        const s = await Promise.resolve(getSession());
        if (!cancelled) {
          setSession(s || null);
        }
        return;
      }

      const s = await Promise.resolve(getSession());
      if (!cancelled) {
        setSession(s || null);
      }
    };

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load login page settings + subscribe to realtime changes ─────
  useEffect(() => {
    let cancelled = false;
    let bc;

    const loadLoginSettings = async () => {
      try {
        const data = await sbGetSiteSettings("login_page");
        if (!cancelled && data) {
          setLoginSettings(data);
        }
      } catch {}
    };

    loadLoginSettings();

    try {
      const handleFocus = () => {
        loadLoginSettings();
      };

      window.addEventListener("focus", handleFocus);

      bc = new BroadcastChannel("dse_site_settings");
      bc.onmessage = (e) => {
        if (!cancelled && e.data?.key === "login_page" && e.data?.value) {
          setLoginSettings(e.data.value);
        }
      };

      return () => {
        cancelled = true;
        window.removeEventListener("focus", handleFocus);
        if (bc) bc.close();
      };
    } catch {
      return () => {
        cancelled = true;
      };
    }
  }, []);

  // ── Load profile + role + core settings once session confirmed ───
  useEffect(() => {
    let cancelled = false;

    const loadAppCore = async () => {
      if (session === undefined) return;

      if (!session) {
        if (!cancelled) {
          setProfile(undefined);
          setRole(null);
          setCompanies([]);
          setTransactions([]);
          setDbError(null);
          setLoading(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setDbError(null);
      }

      try {
        const freshToken = session?.access_token;

        const [p, r] = await Promise.all([
          sbGetProfile(freshToken),
          sbGetMyRole(freshToken),
        ]);

        if (cancelled) return;

        setProfile(p);
        setRole(r);

        // Keep app boot light:
        // do not fetch all companies / all transactions here.
        setCompanies([]);
        setTransactions([]);
      } catch (e) {
        if (!cancelled) {
          setDbError(e?.message || "Failed to load application data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAppCore();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // ── Safety: if saved tab is not allowed for current role, fallback ──
  useEffect(() => {
    if (!role || !tab) return;

    const visibleIds = NAV.filter(item => item.roles.includes(role)).map(item => item.id);
    if (tab !== "profile" && !visibleIds.includes(tab)) {
      setTab("dashboard");
    }
  }, [role, tab]);

  const handleLogin = (s) => {
    setDbError(null);
    setSession(s);
  };

  const handleProfileDone = (p) => setProfile(p);

  const handleSignOut = async () => {
    await sbSignOut();
    setSession(null);
    setProfile(undefined);
    setRole(null);
    setCompanies([]);
    setTransactions([]);
    setLoading(false);
    setDbError(null);
  };

  if (recoveryMode) {
    return (
      <ResetPasswordPage
        onDone={() => {
          setRecoveryMode(false);
          localStorage.removeItem("sb_recovery_token");
        }}
      />
    );
  }

  if (session === undefined) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          fontFamily: "'Inter', system-ui, sans-serif",
          background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        }}
      >
        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:0.4; transform:scale(0.95); } 50% { opacity:1; transform:scale(1); } }
        `}</style>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "-60px",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: C.white }}>
          <div style={{ animation: "pulse 1.8s ease-in-out infinite", marginBottom: 20 }}>
            <img
              src={logo}
              alt="Investors Portal"
              style={{ width: 64, height: 64, borderRadius: 16, objectFit: "cover", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
            />
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "0.01em" }}>Investors Portal</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>Checking your session...</div>
          <div style={{ marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.green,
                  opacity: 0.3,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!session) return <LoginPage onLogin={handleLogin} loginSettings={loginSettings} />;

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          fontFamily: "'Inter', system-ui, sans-serif",
          background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        }}
      >
        <style>{`
          @keyframes spin  { to { transform: rotate(360deg); } }
          @keyframes pulse { 0%,100% { opacity:0.4; transform:scale(0.95); } 50% { opacity:1; transform:scale(1); } }
          @keyframes bar   { 0% { width:"0%" } 100% { width:"100%" } }
        `}</style>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: 360,
            height: 360,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-100px",
            left: "-60px",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: C.white, minWidth: 240 }}>
          <div style={{ animation: "pulse 1.8s ease-in-out infinite", marginBottom: 22 }}>
            <img
              src={logo}
              alt="Investors Portal"
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                objectFit: "cover",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                border: "3px solid rgba(255,255,255,0.15)",
              }}
            />
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.01em" }}>Investors Portal</div>
          <div style={{ margin: "20px auto 0", width: 180, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.gold})`, borderRadius: 4, animation: "bar 2s ease-in-out infinite" }} />
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.15)", borderTop: `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            Loading your portfolio...
          </div>
          <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: C.green,
                  opacity: 0.3,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (dbError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.gray50, fontFamily: "system-ui" }}>
        <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 16, padding: 40, maxWidth: 440, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ color: C.red, margin: "0 0 8px", fontSize: 18 }}>Database Connection Error</h3>
          <p style={{ color: C.gray600, fontSize: 14, lineHeight: 1.6 }}>{dbError}</p>
        </div>
      </div>
    );
  }

  const profileIncomplete = !profile || !profile.full_name?.trim() || !profile.phone?.trim();
  if (profileIncomplete) {
    return <ProfileSetupPage session={session} onComplete={handleProfileDone} onCancel={handleSignOut} />;
  }

  const filteredTransactions = transactions.filter(t => t.cds_number === profile?.cds_number);

  const visibleNav = NAV.filter(item => !role || item.roles.includes(role));
  const cdsCompanyCount = new Set(filteredTransactions.map(t => t.company_id)).size;
  const counts = { companies: cdsCompanyCount, transactions: filteredTransactions.length };
  const now = new Date();

  // ── Tab header meta ────────────────────────────────────────────────
  const TAB_META = {
    dashboard:        { title: `Welcome back, ${profile?.full_name?.split(" ")[0] || "Investor"} 👋`, sub: "Here's your portfolio at a glance — holdings, performance and activity." },
    companies:        { title: "Portfolio",        sub: "Your CDS portfolio holdings" },
    transactions:     { title: "Transactions",     sub: "Record and view all buy/sell activity" },
    profile:          { title: "My Profile",       sub: "Manage your personal information" },
    "user-management":{ title: "User Management",  sub: "Manage system users and assign roles" },
    "system-settings":{ title: "System Settings",  sub: "Configure portal appearance and behaviour" },
  };
  const currentMeta = TAB_META[tab] || { title: NAV.find(n => n.id === tab)?.label || tab, sub: "" };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100%", fontFamily: "'Inter', system-ui, sans-serif", background: C.gray50, overflow: "hidden" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Sidebar ── */}
      <div
        style={{
          width: 240,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          height: "100vh",
          overflowY: "auto",
          position: "relative",
          background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
          <div style={{ padding: "24px 20px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={logo}
                alt="DI"
                style={{ width: 42, height: 42, borderRadius: 10, objectFit: "cover", flexShrink: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}
              />
              <div>
                <div style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 800 }}>
                  <span style={{ color: C.white }}>Investors</span>{" "}
                  <span style={{ color: C.gold }}>Portal</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                  <div style={{ width: 6, height: 6, background: C.green, borderRadius: "50%", flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 500 }}>
                    {now.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                    {" | "}
                    {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              margin: "0 16px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 7,
                height: 7,
                background: C.green,
                borderRadius: "50%",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                color: "rgba(255,255,255,0.4)",
                fontSize: 11,
              }}
            >
              Supabase connected
            </span>
          </div>

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />

          <nav style={{ padding: "16px 12px", flex: 1 }}>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "0 12px", marginBottom: 8 }}>
              Navigation
            </div>
            {visibleNav.map(item => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "11px 14px",
                    borderRadius: 10,
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 4,
                    background: active ? `${C.green}22` : "transparent",
                    borderLeft: `3px solid ${active ? C.green : "transparent"}`,
                    transition: "all 0.2s",
                  }}
                >
                  <span style={{ fontSize: 17 }}>{item.icon}</span>
                  <span
                    style={{
                      color: active ? C.white : "rgba(255,255,255,0.55)",
                      fontWeight: active ? 700 : 500,
                      fontSize: 14,
                      flex: 1,
                      textAlign: "left",
                    }}
                  >
                    {item.label}
                  </span>
                  {counts[item.id] !== undefined && (
                    <span
                      style={{
                        background: active ? C.green : "rgba(255,255,255,0.1)",
                        color: active ? C.white : "rgba(255,255,255,0.4)",
                        fontSize: 11,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 10,
                      }}
                    >
                      {counts[item.id]}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <UserMenu
            profile={profile}
            session={session}
            role={role}
            onSignOut={handleSignOut}
            onOpenProfile={() => setTab("profile")}
          />
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100vh", overflow: "hidden" }}>
        <div
          style={{
            background: C.white,
            borderBottom: `1px solid ${C.gray200}`,
            padding: "0 32px",
            height: 62,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>
              {currentMeta.title}
            </div>
            <div style={{ fontSize: 12, color: C.gray400, marginTop: 1 }}>
              {currentMeta.sub}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.navy + "0a", border: `1px solid ${C.navy}18`, borderRadius: 8, padding: "4px 10px" }}>
                <span style={{ fontSize: 12 }}>🏢</span>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1 }}>
                    Holdings
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{cdsCompanyCount}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.green + "0d", border: `1px solid ${C.green}20`, borderRadius: 8, padding: "4px 10px" }}>
                <span style={{ fontSize: 12 }}>📋</span>
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", lineHeight: 1 }}>
                    Transactions
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.green, lineHeight: 1.2 }}>{filteredTransactions.length}</div>
                </div>
              </div>
            </div>

            <div style={{ width: 1, height: 36, background: C.gray200 }} />

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: `linear-gradient(135deg, ${C.navy}, #1e3a5f)`,
                borderRadius: 12,
                padding: "6px 14px 6px 10px",
                boxShadow: "0 2px 10px rgba(11,31,58,0.25)",
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.12)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                }}
              >
                🔒
              </div>
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.08em", lineHeight: 1 }}>
                  CDS Account
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.white, letterSpacing: "0.04em", lineHeight: 1.3 }}>
                  {profile?.cds_number || "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
          {tab === "dashboard" && (
            <DashboardPage
              profile={profile}
              role={role}
              session={session}
              showToast={showToast}
              onNavigate={setTab}
            />
          )}
          {tab === "companies" && (
            <CompaniesPage
              companies={companies}
              setCompanies={setCompanies}
              transactions={filteredTransactions}
              showToast={showToast}
              role={role}
              profile={profile}
            />
          )}
          {tab === "transactions" && (
            <TransactionsPage
              companies={companies}
              transactions={transactions}
              setTransactions={setTransactions}
              showToast={showToast}
              role={role}
              cdsNumber={profile?.cds_number}
            />
          )}
          {tab === "profile" && (
            <ProfilePage
              profile={profile}
              setProfile={setProfile}
              session={session}
              role={role}
              email={session?.user?.email || session?.email || ""}
              showToast={showToast}
            />
          )}
          {tab === "user-management" && <UserManagementPage role={role} showToast={showToast} profile={profile} />}
          {tab === "system-settings" && (
            <SystemSettingsPage
              role={role}
              showToast={showToast}
              session={session}
              setLoginSettings={setLoginSettings}
              companies={companies}
              setCompanies={setCompanies}
              transactions={transactions}
            />
          )}
        </div>
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
