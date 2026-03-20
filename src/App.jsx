// ── src/App.jsx ───────────────────────────────────────────────────
import { useEffect, useRef, useState, useCallback } from "react";
import {
  getSession,
  sbSignOut,
  sbGetProfile,
  sbGetMyRole,
  sbGetSiteSettings,
  sbGetActiveCDS,
  sbGetUserCDS,
  sbSwitchActiveCDS,
} from "./lib/supabase";
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

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "🏠", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "companies", label: "Portfolio", icon: "📈", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "transactions", label: "Transactions", icon: "🔁", roles: ["SA", "AD", "DE", "VR", "RO"] },
  { id: "user-management", label: "User Management", icon: "👥", roles: ["SA", "AD"] },
  { id: "system-settings", label: "System Settings", icon: "⚙️", roles: ["SA"] },
];

// ── Mobile breakpoint hook ─────────────────────────────────────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );

  useEffect(() => {
    let t;
    const handler = () => {
      clearTimeout(t);
      t = setTimeout(() => setIsMobile(window.innerWidth < 768), 80);
    };
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      window.removeEventListener("resize", handler);
      clearTimeout(t);
    };
  }, []);

  return isMobile;
};

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
  const [appBootstrapping, setAppBootstrapping] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [toast, setToast] = useState({ msg: "", type: "" });
  const [recoveryMode, setRecoveryMode] = useState(false);

  // ── CDS multi-account state ──────────────────────────────────────
  const [activeCds, setActiveCds] = useState(null);
  const [cdsList, setCdsList] = useState([]);
  const [showCdsSwitcher, setShowCdsSwitcher] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null);
  const [switching, setSwitching] = useState(false);
  const cdsChipRef = useRef(null);
  const toastTimerRef = useRef(null);
  const forceMobileDashboardOnNextLoginRef = useRef(false);

  // ── Mobile state ─────────────────────────────────────────────────
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Safety timeout to force loading false after 10 seconds
  useEffect(() => {
    if (!loading && !appBootstrapping) return;
    const timer = setTimeout(() => {
      console.warn("Loading timeout – forcing loading/bootstrap false");
      setLoading(false);
      setAppBootstrapping(false);
    }, 10000);
    return () => clearTimeout(timer);
  }, [loading, appBootstrapping]);

  // Close drawer on tab change or on resize back to desktop
  useEffect(() => {
    setDrawerOpen(false);
  }, [tab]);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  // ── Toast helper ─────────────────────────────────────────────────
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToast({ msg: "", type: "" });
      toastTimerRef.current = null;
    }, 3500);
  }, []);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Persist active tab to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("app_active_tab", tab);
    } catch {}
  }, [tab]);

  // Force mobile login screen to always reset to dashboard
  useEffect(() => {
    if (session !== null) return;
    if (!isMobile) return;

    setTab((prev) => (prev === "dashboard" ? prev : "dashboard"));

    try {
      localStorage.setItem("app_active_tab", "dashboard");
    } catch {}
  }, [session, isMobile]);

  // Close CDS switcher on outside click
  useEffect(() => {
    if (!showCdsSwitcher) return;
    const handleClickOutside = (e) => {
      if (cdsChipRef.current && !cdsChipRef.current.contains(e.target)) {
        setShowCdsSwitcher(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showCdsSwitcher]);

  // Idle logout
  useIdleLogout({
    enabled: !!session && !recoveryMode,
    onLogout: () => {
      setSession(null);
      setProfile(undefined);
      setRole(null);
      setActiveCds(null);
      setCdsList([]);
      setCompanies([]);
      setTransactions([]);
      setLoading(false);
      setAppBootstrapping(false);
      setDbError(null);
      forceMobileDashboardOnNextLoginRef.current = false;

      if (typeof window !== "undefined" && window.innerWidth < 768) {
        setTab("dashboard");
        try {
          localStorage.setItem("app_active_tab", "dashboard");
        } catch {}
      }

      showToast("You were logged out after 5 minutes of inactivity.", "error");
    },
  });

  // ── Session recovery / initial load ──────────────────────────────
  useEffect(() => {
    let cancelled = false;

    const resolveSession = async () => {
      const hash = window.location.hash;
      const search = window.location.search;

      // Handle recovery from hash (password reset email link)
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
            setAppBootstrapping(false);
          }
          return;
        }
      }

      // Handle PKCE flow recovery
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
            setAppBootstrapping(false);
            return;
          }
        } catch {
          // fall through to normal session check
        }
      }

      // Normal session check
      const s = await getSession();
      if (!cancelled) {
        setSession(s || null);
      }
    };

    resolveSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load login settings (site settings) ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    let bc;

    const loadLoginSettings = async () => {
      try {
        const data = await sbGetSiteSettings("login_page");
        if (!cancelled && data) setLoginSettings(data);
      } catch {
        // ignore
      }
    };

    loadLoginSettings();

    try {
      const handleFocus = () => loadLoginSettings();
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

  // ── Load profile, role, and active CDS on session change ─────────
  useEffect(() => {
    let cancelled = false;

    const loadAppCore = async () => {
      if (session === undefined) return;

      if (!session) {
        if (!cancelled) {
          setProfile(undefined);
          setRole(null);
          setActiveCds(null);
          setCdsList([]);
          setCompanies([]);
          setTransactions([]);
          setDbError(null);
          setLoading(false);
          setAppBootstrapping(false);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setAppBootstrapping(true);
        setDbError(null);

        if (isMobile && forceMobileDashboardOnNextLoginRef.current) {
          setTab("dashboard");
          try {
            localStorage.setItem("app_active_tab", "dashboard");
          } catch {}
        }
      }

      try {
        const freshToken = session?.access_token;
        const uid = session?.user?.id;

        const [p, r, activeCdsRow] = await Promise.all([
          sbGetProfile(freshToken),
          sbGetMyRole(freshToken),
          uid ? sbGetActiveCDS(uid).catch(() => null) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        setProfile(p ?? null);
        setRole(r ?? null);

        if (activeCdsRow) {
          setActiveCds(activeCdsRow);
        } else if (p?.cds_number) {
          setActiveCds({
            cds_number: p.cds_number,
            cds_name: p.full_name || p.cds_number,
            cds_id: null,
          });
        } else {
          setActiveCds(null);
        }

        if (uid) {
          sbGetUserCDS(uid)
            .then((list) => {
              if (!cancelled) setCdsList(list || []);
            })
            .catch(() => {
              if (!cancelled) setCdsList([]);
            });
        } else {
          setCdsList([]);
        }

        setCompanies([]);
        setTransactions([]);
      } catch (e) {
        if (!cancelled) {
          console.error("loadAppCore error:", e);
          setDbError(e?.message || "Failed to load application data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAppBootstrapping(false);
          forceMobileDashboardOnNextLoginRef.current = false;
        }
      }
    };

    loadAppCore();

    return () => {
      cancelled = true;
    };
  }, [session, isMobile]);

  // ── Ensure active tab is allowed for current role ────────────────
  useEffect(() => {
    if (!role || !tab) return;
    const visibleIds = NAV.filter((item) => item.roles.includes(role)).map((item) => item.id);
    if (tab !== "profile" && !visibleIds.includes(tab)) {
      setTab("dashboard");
    }
  }, [role, tab]);

  // ── Unified CDS switch handler ───────────────────────────────────
  const cdsSwitchReqRef = useRef(0);

  const handleCdsSwitch = useCallback(
    async (target) => {
      if (!target || !session?.user?.id || switching) return;

      const reqId = ++cdsSwitchReqRef.current;
      setSwitching(true);

      try {
        const uid = session.user.id;

        const [freshActive, freshList] = await Promise.all([
          sbSwitchActiveCDS(uid, target.cds_id),
          sbGetUserCDS(uid).catch(() => cdsList),
        ]);

        if (reqId !== cdsSwitchReqRef.current) return;

        setActiveCds(freshActive || target);
        setCdsList(freshList || []);

        setCompanies([]);
        setTransactions([]);

        setShowCdsSwitcher(false);
        setSwitchTarget(null);

        showToast(`Switched to ${(freshActive || target).cds_number}`, "success");
      } catch (e) {
        if (reqId !== cdsSwitchReqRef.current) return;
        showToast(e.message || "Failed to switch CDS", "error");
      } finally {
        if (reqId === cdsSwitchReqRef.current) setSwitching(false);
      }
    },
    [session, switching, cdsList, showToast]
  );

  const handleLogin = useCallback((s) => {
    setDbError(null);
    setLoading(true);
    setAppBootstrapping(true);
    setProfile(undefined);
    setRole(null);
    setActiveCds(null);
    setCdsList([]);
    setCompanies([]);
    setTransactions([]);

    forceMobileDashboardOnNextLoginRef.current =
      typeof window !== "undefined" && window.innerWidth < 768;

    if (forceMobileDashboardOnNextLoginRef.current) {
      setTab("dashboard");
      try {
        localStorage.setItem("app_active_tab", "dashboard");
      } catch {}
    }

    setSession(s);
  }, []);

  const handleProfileDone = (p) => setProfile(p);

  const handleSignOut = async () => {
    await sbSignOut();
    setSession(null);
    setProfile(undefined);
    setRole(null);
    setActiveCds(null);
    setCdsList([]);
    setCompanies([]);
    setTransactions([]);
    setLoading(false);
    setAppBootstrapping(false);
    setDbError(null);
    forceMobileDashboardOnNextLoginRef.current = false;

    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setTab("dashboard");
      try {
        localStorage.setItem("app_active_tab", "dashboard");
      } catch {}
    }
  };

  const activeCdsNumber = activeCds?.cds_number || profile?.cds_number;
  const activeProfile = profile && activeCdsNumber ? { ...profile, cds_number: activeCdsNumber } : profile;

  // ── Derived values ───────────────────────────────────────────────
  const filteredTransactions = transactions.filter((t) => t.cds_number === activeCdsNumber);
  const visibleNav = NAV.filter((item) => !role || item.roles.includes(role));
  const cdsCompanyCount = new Set(filteredTransactions.map((t) => t.company_id)).size;
  const counts = { companies: cdsCompanyCount, transactions: filteredTransactions.length };
  const now = new Date();

  const TAB_META = {
    dashboard: {
      title: `Welcome back, ${profile?.full_name?.split(" ")[0] || "Investor"} 👋`,
      sub: "Here's your portfolio at a glance — holdings, performance and activity.",
    },
    companies: { title: "Portfolio", sub: "Your CDS portfolio holdings" },
    transactions: { title: "Transactions", sub: "Record and view all buy/sell activity" },
    profile: { title: "My Profile", sub: "Manage your personal information" },
    "user-management": { title: "User Management", sub: "Manage system users and assign roles" },
    "system-settings": { title: "System Settings", sub: "Configure portal appearance and behaviour" },
  };

  const currentMeta = TAB_META[tab] || {
    title: NAV.find((n) => n.id === tab)?.label || tab,
    sub: "",
  };

  // ── Mobile-only nav ──────────────────────────────────────────────
  const BOTTOM_NAV = [
    { id: "dashboard", label: "Home", icon: "🏠", roles: ["SA", "AD", "DE", "VR", "RO"] },
    { id: "companies", label: "Portfolio", icon: "📈", roles: ["SA", "AD", "DE", "VR", "RO"] },
    { id: "transactions", label: "Trades", icon: "🔁", roles: ["SA", "AD", "DE", "VR", "RO"] },
    { id: "user-management", label: "Users", icon: "👥", roles: ["SA", "AD"] },
  ];

  const filteredBottomNav = BOTTOM_NAV.filter((item) => visibleNav.some((n) => n.id === item.id));
  const mobileHeaderTitle =
    tab === "dashboard" ? profile?.full_name?.split(" ")[0] || "Investor" : currentMeta.title;
  const moreIsActive = !filteredBottomNav.some((n) => n.id === tab);

  // ── Render helpers ───────────────────────────────────────────────
  const renderSidebarInner = useCallback(
    () => (
      <>
        <div style={{ padding: "24px 20px 20px", position: "relative" }}>
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(false)}
              aria-label="Close navigation"
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: C.white,
                cursor: "pointer",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={logo}
              alt="DI"
              style={{
                width: 42,
                height: 42,
                borderRadius: 10,
                objectFit: "cover",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
              }}
            />
            <div>
              <div style={{ fontSize: 17, lineHeight: 1.2, fontWeight: 800 }}>
                <span style={{ color: C.white }}>Investors</span>{" "}
                <span style={{ color: C.gold }}>Portal</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
                <div
                  style={{
                    width: 6,
                    height: 6,
                    background: C.green,
                    borderRadius: "50%",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  {now.toLocaleDateString("en-GB", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                  {" | "}
                  {now.toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
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
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>
            Supabase connected
          </span>
        </div>

        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 16px" }} />

        <nav style={{ padding: "16px 12px", flex: 1 }}>
          <div
            style={{
              color: "rgba(255,255,255,0.3)",
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "0 12px",
              marginBottom: 8,
            }}
          >
            Navigation
          </div>

          {visibleNav
            .filter((item) => !isMobile || item.id !== "system-settings")
            .map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    if (isMobile) setDrawerOpen(false);
                  }}
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
          profile={activeProfile}
          session={session}
          role={role}
          onSignOut={handleSignOut}
          onOpenProfile={() => {
            setTab("profile");
            if (isMobile) setDrawerOpen(false);
          }}
        />
      </>
    ),
    [isMobile, tab, visibleNav, counts, activeProfile, session, role, handleSignOut, now]
  );

  const renderCdsSwitcherPopover = useCallback(
    () => (
      <div
        style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          zIndex: 9999,
          background: C.white,
          border: `1.5px solid ${C.gray200}`,
          borderRadius: 14,
          minWidth: 280,
          maxWidth: 340,
          boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
          animation: "cdsPopIn 0.18s ease",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px 10px",
            borderBottom: `1px solid ${C.gray100}`,
            background: C.gray50,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: C.text,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Your CDS Accounts
          </div>
          <div style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>
            Click Switch to change active account
          </div>
        </div>

        <div style={{ padding: "8px 0", maxHeight: 320, overflowY: "auto" }}>
          {cdsList.map((c) => {
            const isActive = c.cds_number === activeCdsNumber;
            return (
              <div
                key={c.cds_id || c.cds_number}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 16px",
                  background: isActive ? C.green + "0a" : "transparent",
                  borderLeft: `3px solid ${isActive ? C.green : "transparent"}`,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: isActive ? C.green + "18" : C.navy + "0f",
                    border: `1px solid ${isActive ? C.green + "30" : C.navy + "18"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  🔒
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: C.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.cds_number}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: C.gray400,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {c.cds_name || "—"}
                  </div>
                </div>

                {isActive ? (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      background: "#f0fdf4",
                      color: C.green,
                      border: `1px solid ${C.green}25`,
                      borderRadius: 20,
                      padding: "2px 9px",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    Active
                  </span>
                ) : (
                  <button
                    onClick={() => {
                      setSwitchTarget(c);
                      setShowCdsSwitcher(false);
                    }}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: C.navy,
                      color: C.white,
                      border: "none",
                      borderRadius: 8,
                      padding: "5px 12px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                      transition: "opacity 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
                  >
                    Switch
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ),
    [cdsList, activeCdsNumber]
  );

  // ── Render guards ────────────────────────────────────────────────
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
          fontFamily: "'Inter',system-ui,sans-serif",
          background: "radial-gradient(ellipse at 60% 40%,#0c2548 0%,#0B1F3A 50%,#080f1e 100%)",
        }}
      >
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:0.4;transform:scale(0.95)}50%{opacity:1;transform:scale(1)}}
        `}</style>

        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle,rgba(255,255,255,0.06) 1px,transparent 1px)",
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
            background: "radial-gradient(circle,rgba(0,132,61,0.18) 0%,transparent 70%)",
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
            background: "radial-gradient(circle,rgba(212,175,55,0.10) 0%,transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: C.white }}>
          <div style={{ animation: "pulse 1.8s ease-in-out infinite", marginBottom: 20 }}>
            <img
              src={logo}
              alt="Investors Portal"
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                objectFit: "cover",
                boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              }}
            />
          </div>
          <div style={{ fontWeight: 800, fontSize: 17, letterSpacing: "0.01em" }}>
            Investors Portal
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            Checking your session...
          </div>
          <div
            style={{
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {[0, 1, 2].map((i) => (
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

  if (!session) {
    return <LoginPage onLogin={handleLogin} loginSettings={loginSettings} />;
  }

  if (session && (loading || appBootstrapping || profile === undefined)) {
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
          fontFamily: "'Inter',system-ui,sans-serif",
          background: "radial-gradient(ellipse at 60% 40%,#0c2548 0%,#0B1F3A 50%,#080f1e 100%)",
        }}
      >
        <style>{`
          @keyframes spin{to{transform:rotate(360deg)}}
          @keyframes pulse{0%,100%{opacity:0.4;transform:scale(0.95)}50%{opacity:1;transform:scale(1)}}
          @keyframes bar{0%{width:0%}100%{width:100%}}
        `}</style>

        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle,rgba(255,255,255,0.06) 1px,transparent 1px)",
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
            background: "radial-gradient(circle,rgba(0,132,61,0.18) 0%,transparent 70%)",
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
            background: "radial-gradient(circle,rgba(212,175,55,0.10) 0%,transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            textAlign: "center",
            color: C.white,
            minWidth: 240,
          }}
        >
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
          <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: "0.01em" }}>
            Investors Portal
          </div>
          <div
            style={{
              margin: "20px auto 0",
              width: 180,
              height: 3,
              background: "rgba(255,255,255,0.1)",
              borderRadius: 4,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: `linear-gradient(90deg,${C.green},${C.gold})`,
                borderRadius: 4,
                animation: "bar 2s ease-in-out infinite",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: "rgba(255,255,255,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                border: "2px solid rgba(255,255,255,0.15)",
                borderTop: `2px solid ${C.green}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            Loading your portfolio...
          </div>
          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            {[0, 1, 2].map((i) => (
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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.gray50,
          fontFamily: "system-ui",
        }}
      >
        <div
          style={{
            background: C.white,
            border: `1px solid ${C.gray200}`,
            borderRadius: 16,
            padding: 40,
            maxWidth: 440,
            textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h3 style={{ color: C.red, margin: "0 0 8px", fontSize: 18 }}>
            Database Connection Error
          </h3>
          <p style={{ color: C.gray600, fontSize: 14, lineHeight: 1.6 }}>{dbError}</p>
        </div>
      </div>
    );
  }

  const profileIncomplete = !profile || !profile.full_name?.trim() || !profile.phone?.trim();
  if (profileIncomplete) {
    return (
      <ProfileSetupPage
        session={session}
        onComplete={handleProfileDone}
        onCancel={handleSignOut}
      />
    );
  }

  // ── Main render ───────────────────────────────────────────────────
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        fontFamily: "'Inter',system-ui,sans-serif",
        background: C.gray50,
        overflow: "hidden",
      }}
    >
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes cdsPopIn { from { opacity:0; transform:translateY(-8px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
      `}</style>

      {/* ── Desktop Sidebar — not rendered on mobile ── */}
      {!isMobile && (
        <div
          style={{
            width: 240,
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            height: "100vh",
            overflowY: "auto",
            position: "relative",
            background: "radial-gradient(ellipse at 60% 40%,#0c2548 0%,#0B1F3A 50%,#080f1e 100%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage:
                "radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px)",
              backgroundSize: "24px 24px",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
            }}
          >
            {renderSidebarInner()}
          </div>
        </div>
      )}

      {/* ── Mobile: backdrop + slide-out drawer ── */}
      {isMobile && (
        <>
          <div
            onClick={() => setDrawerOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 300,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(2px)",
              opacity: drawerOpen ? 1 : 0,
              pointerEvents: drawerOpen ? "auto" : "none",
              transition: "opacity 0.28s",
            }}
          />
          <div
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              bottom: 0,
              width: 280,
              zIndex: 301,
              transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
              background: "radial-gradient(ellipse at 60% 40%,#0c2548 0%,#0B1F3A 50%,#080f1e 100%)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
              willChange: "transform",
              boxShadow: drawerOpen ? "4px 0 32px rgba(0,0,0,0.35)" : "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage:
                  "radial-gradient(circle,rgba(255,255,255,0.04) 1px,transparent 1px)",
                backgroundSize: "24px 24px",
                pointerEvents: "none",
                zIndex: 0,
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              {renderSidebarInner()}
            </div>
          </div>
        </>
      )}

      {/* ── Main content area ── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          height: "100vh",
          overflow: "hidden",
        }}
      >
        {isMobile && (
          <div
            style={{
              background: C.white,
              borderBottom: `1px solid ${C.gray200}`,
              padding: "0 16px",
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
              gap: 12,
            }}
          >
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                border: `1.5px solid ${C.gray200}`,
                background: C.white,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
                color: C.text,
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              ☰
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: 15,
                  color: C.text,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {mobileHeaderTitle}
              </div>
            </div>

            <div ref={cdsChipRef} style={{ position: "relative", flexShrink: 0 }}>
              <div
                onClick={() => cdsList.length > 1 && setShowCdsSwitcher((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: `linear-gradient(135deg,${C.navy},#1e3a5f)`,
                  borderRadius: 10,
                  padding: "5px 10px",
                  border: showCdsSwitcher
                    ? `1.5px solid ${C.gold}`
                    : "1.5px solid rgba(255,255,255,0.12)",
                  cursor: cdsList.length > 1 ? "pointer" : "default",
                  boxShadow: "0 2px 8px rgba(11,31,58,0.25)",
                  userSelect: "none",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: "rgba(255,255,255,0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  🔒
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 8,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.5)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      lineHeight: 1,
                    }}
                  >
                    CDS
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: C.white,
                      letterSpacing: "0.04em",
                      lineHeight: 1.3,
                    }}
                  >
                    {activeCdsNumber || "—"}
                  </div>
                </div>
                {cdsList.length > 1 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: showCdsSwitcher ? C.gold : "rgba(255,255,255,0.45)",
                      transform: showCdsSwitcher ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s, color 0.15s",
                      marginLeft: 2,
                      lineHeight: 1,
                    }}
                  >
                    ▾
                  </span>
                )}
              </div>
              {showCdsSwitcher && cdsList.length > 1 && renderCdsSwitcherPopover()}
            </div>
          </div>
        )}

        {/* ── Desktop Header ── */}
        {!isMobile && (
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
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: C.navy + "0a",
                    border: `1px solid ${C.navy}18`,
                    borderRadius: 8,
                    padding: "4px 10px",
                  }}
                >
                  <span style={{ fontSize: 12 }}>🏢</span>
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.gray400,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        lineHeight: 1,
                      }}
                    >
                      Holdings
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: C.text,
                        lineHeight: 1.2,
                      }}
                    >
                      {cdsCompanyCount}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: C.green + "0d",
                    border: `1px solid ${C.green}20`,
                    borderRadius: 8,
                    padding: "4px 10px",
                  }}
                >
                  <span style={{ fontSize: 12 }}>📋</span>
                  <div>
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: C.gray400,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        lineHeight: 1,
                      }}
                    >
                      Transactions
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: C.green,
                        lineHeight: 1.2,
                      }}
                    >
                      {filteredTransactions.length}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ width: 1, height: 36, background: C.gray200 }} />

              <div style={{ position: "relative" }} ref={cdsChipRef}>
                {cdsList.length > 2 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(135deg,#0a1c36,#162f52)",
                      borderRadius: 12,
                      transform: "translate(4px,4px)",
                      opacity: 0.5,
                      zIndex: 0,
                      border: "1.5px solid transparent",
                    }}
                  />
                )}

                {cdsList.length > 1 && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: "linear-gradient(135deg,#0c2040,#193558)",
                      borderRadius: 12,
                      transform: "translate(2px,2px)",
                      opacity: 0.7,
                      zIndex: 0,
                      border: "1.5px solid transparent",
                    }}
                  />
                )}

                <div
                  onClick={() => cdsList.length > 1 && setShowCdsSwitcher((v) => !v)}
                  style={{
                    position: "relative",
                    zIndex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: `linear-gradient(135deg,${C.navy},#1e3a5f)`,
                    borderRadius: 12,
                    padding: "6px 14px 6px 10px",
                    boxShadow: "0 2px 10px rgba(11,31,58,0.25)",
                    cursor: cdsList.length > 1 ? "pointer" : "default",
                    border: showCdsSwitcher
                      ? `1.5px solid ${C.gold}`
                      : "1.5px solid rgba(255,255,255,0.08)",
                    transition: "border 0.15s, box-shadow 0.15s",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (cdsList.length > 1) {
                      e.currentTarget.style.boxShadow = "0 4px 18px rgba(11,31,58,0.45)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = "0 2px 10px rgba(11,31,58,0.25)";
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
                    <div
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.5)",
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        lineHeight: 1,
                      }}
                    >
                      CDS Account
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: C.white,
                        letterSpacing: "0.04em",
                        lineHeight: 1.3,
                      }}
                    >
                      {activeCdsNumber || "—"}
                    </div>
                  </div>
                  {cdsList.length > 1 && (
                    <span
                      style={{
                        fontSize: 11,
                        color: showCdsSwitcher ? C.gold : "rgba(255,255,255,0.45)",
                        transform: showCdsSwitcher ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s, color 0.15s",
                        marginLeft: 2,
                        lineHeight: 1,
                      }}
                    >
                      ▾
                    </span>
                  )}
                </div>

                {showCdsSwitcher && cdsList.length > 1 && renderCdsSwitcherPopover()}
              </div>
            </div>
          </div>
        )}

        {/* ── Pages ── */}
        <div
          style={{
            flex: 1,
            padding: isMobile ? "16px" : "28px 32px",
            overflowY: "auto",
            paddingBottom: isMobile ? 76 : undefined,
          }}
        >
          {tab === "dashboard" && (
            <DashboardPage
              key={`dashboard-${activeCdsNumber || "none"}`}
              profile={activeProfile}
              role={role}
              session={session}
              showToast={showToast}
              onNavigate={setTab}
              activeCds={activeCds}
            />
          )}

          {tab === "companies" && (
            <CompaniesPage
              key={`companies-${activeCdsNumber || "none"}`}
              companies={companies}
              setCompanies={setCompanies}
              transactions={filteredTransactions}
              showToast={showToast}
              role={role}
              profile={activeProfile}
            />
          )}

          {tab === "transactions" && (
            <TransactionsPage
              key={`transactions-${activeCdsNumber || "none"}`}
              companies={companies}
              transactions={transactions}
              setTransactions={setTransactions}
              showToast={showToast}
              role={role}
              cdsNumber={activeCdsNumber}
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
              activeCds={activeCds}
              cdsList={cdsList}
              onSwitchCds={handleCdsSwitch}
            />
          )}

          {tab === "user-management" && (
            <UserManagementPage role={role} showToast={showToast} profile={activeProfile} />
          )}

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

      {/* ── Mobile Bottom Navigation ── */}
      {isMobile && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            height: 60,
            background: C.white,
            borderTop: `1px solid ${C.gray200}`,
            display: "flex",
            alignItems: "stretch",
            zIndex: 200,
            boxShadow: "0 -4px 16px rgba(0,0,0,0.08)",
          }}
        >
          {filteredBottomNav.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  padding: "8px 4px",
                  borderTop: active ? `3px solid ${C.green}` : "3px solid transparent",
                  transition: "border-color 0.15s",
                }}
              >
                <span style={{ fontSize: 20, lineHeight: 1 }}>{item.icon}</span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: active ? 700 : 500,
                    color: active ? C.green : C.gray400,
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => setDrawerOpen(true)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: "8px 4px",
              borderTop: moreIsActive ? `3px solid ${C.green}` : "3px solid transparent",
              transition: "border-color 0.15s",
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
            <span
              style={{
                fontSize: 10,
                fontWeight: moreIsActive ? 700 : 500,
                color: moreIsActive ? C.green : C.gray400,
                lineHeight: 1,
              }}
            >
              More
            </span>
          </button>
        </div>
      )}

      {/* ── Switch confirmation modal ── */}
      {switchTarget && (
        <div
          onClick={() => !switching && setSwitchTarget(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(10,37,64,0.55)",
            backdropFilter: "blur(3px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.white,
              borderRadius: 18,
              width: "100%",
              maxWidth: 400,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
              animation: "cdsPopIn 0.2s ease",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg,#0c2548,#0B1F3A)",
                padding: "16px 22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>
                  Switch CDS Account
                </div>
                <div
                  style={{
                    color: C.gold,
                    fontSize: 11,
                    marginTop: 3,
                    fontWeight: 600,
                  }}
                >
                  Confirm account change
                </div>
              </div>

              <button
                onClick={() => !switching && setSwitchTarget(null)}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: C.white,
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  cursor: "pointer",
                  fontSize: 14,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: "22px 24px" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🔄</div>
                <div
                  style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}
                >
                  Switch to {switchTarget.cds_number}?
                </div>
                <div style={{ fontSize: 13, color: C.gray400, lineHeight: 1.6 }}>
                  {switchTarget.cds_name && (
                    <>
                      <strong style={{ color: C.text }}>{switchTarget.cds_name}</strong>
                      <br />
                    </>
                  )}
                  All portfolio data will update to reflect this CDS account.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: C.gray50,
                  borderRadius: 10,
                  marginBottom: 20,
                  fontSize: 12,
                }}
              >
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.gray400,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    Current
                  </div>
                  <div style={{ fontWeight: 800, color: C.text, marginTop: 2 }}>
                    {activeCdsNumber}
                  </div>
                </div>

                <div style={{ fontSize: 16, color: C.gray400 }}>→</div>

                <div style={{ flex: 1, textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 10,
                      color: C.gray400,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    New
                  </div>
                  <div style={{ fontWeight: 800, color: C.navy, marginTop: 2 }}>
                    {switchTarget.cds_number}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => !switching && setSwitchTarget(null)}
                  disabled={switching}
                  style={{
                    flex: 1,
                    padding: "11px",
                    borderRadius: 10,
                    border: `1.5px solid ${C.gray200}`,
                    background: C.white,
                    color: C.text,
                    fontWeight: 600,
                    fontSize: 13,
                    cursor: switching ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={() => handleCdsSwitch(switchTarget)}
                  disabled={switching}
                  style={{
                    flex: 2,
                    padding: "11px",
                    borderRadius: 10,
                    border: "none",
                    background: switching ? C.gray200 : C.navy,
                    color: C.white,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: switching ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                  }}
                >
                  {switching ? (
                    <>
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          border: "2px solid rgba(255,255,255,0.3)",
                          borderTop: "2px solid #fff",
                          borderRadius: "50%",
                          animation: "spin 0.8s linear infinite",
                        }}
                      />
                      Switching...
                    </>
                  ) : (
                    "Yes, Switch Account"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} type={toast.type} />
    </div>
  );
}
