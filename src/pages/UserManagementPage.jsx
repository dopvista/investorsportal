// ── src/pages/UserManagementPage.jsx ──────────────────────────────
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { sbGetAllUsers, sbGetRoles, sbAssignRole, sbDeactivateRole, sbAdminCreateUser } from "../lib/supabase";
import { C } from "../components/ui";

const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;

const ROLE_META = {
  SA: { label: "Super Admin",  bg: "#0A254015", border: "#0A254040", text: "#0A2540" },
  AD: { label: "Admin",        bg: "#1E3A5F15", border: "#1E3A5F40", text: "#1E3A5F" },
  DE: { label: "Data Entrant", bg: "#1D4ED815", border: "#1D4ED840", text: "#1D4ED8" },
  VR: { label: "Verifier",     bg: "#065F4615", border: "#065F4640", text: "#065F46" },
  RO: { label: "Read Only",    bg: "#37415115", border: "#37415140", text: "#374151" },
};

const inp = (extra = {}) => ({
  width: "100%", padding: "9px 12px", borderRadius: 9, fontSize: 13,
  border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
  background: C.white, color: C.text, transition: "border 0.2s",
  boxSizing: "border-box", ...extra,
});
const focusGreen = e => e.target.style.borderColor = C.green;
const blurGray   = e => e.target.style.borderColor = C.gray200;

// ── Modal portal ───────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children, footer }) {
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,37,64,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth: 460, boxShadow: "0 32px 80px rgba(0,0,0,0.35)", overflow: "hidden", animation: "fadeIn 0.2s ease", fontFamily: "'Inter', system-ui, sans-serif" }}>
        {/* Navy header — gradient matching sidebar */}
        <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 16 }}>{title}</div>
            {subtitle && <div style={{ color: C.gold, fontSize: 11, marginTop: 3, fontWeight: 600, letterSpacing: "0.02em" }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px 4px" }}>{children}</div>
        {footer && <div style={{ display: "flex", gap: 8, padding: "16px 24px" }}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

function CancelBtn({ onClose }) {
  return (
    <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.text; }}>
      Cancel
    </button>
  );
}
function ConfirmBtn({ onClick, label, color, saving }) {
  return (
    <button onClick={onClick} disabled={saving} style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: saving ? C.gray200 : (color || C.green), color: C.white, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: saving ? "none" : `0 2px 10px ${(color || C.green)}44` }}>
      {saving ? "Saving..." : label}
    </button>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.navy, display: "block", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Change Role
// ═══════════════════════════════════════════════════════
function ChangeRoleModal({ user, roles, callerRole, onClose, onSave, showToast }) {
  const available = callerRole === "SA" ? roles : roles.filter(r => r.code !== "SA");
  const [sel, setSel] = useState(roles.find(r => r.code === user.role_code)?.id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!sel) return showToast("Select a role", "error");
    setSaving(true);
    try { await onSave(user.id, parseInt(sel)); onClose(); }
    catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Change Role" subtitle={`Assigning to ${user.full_name || "user"}`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleSave} label="✓  Save Role" saving={saving} /></>}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: C.gray50, border: `1px solid ${C.gray200}`, marginBottom: 14 }}>
        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={34} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{user.full_name || "User"}</div>
          <div style={{ fontSize: 11, color: C.gray400 }}>{user.cds_number || "No CDS"}</div>
        </div>
        {user.role_code && <RoleBadge code={user.role_code} />}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Select New Role</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
        {available.map(r => {
          const m = ROLE_META[r.code];
          const checked = String(sel) === String(r.id);
          return (
            <button key={r.id} onClick={() => setSel(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `2px solid ${checked ? m.text : C.gray200}`, background: checked ? m.bg : C.white, transition: "all 0.15s" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${checked ? m.text : C.gray300}`, background: checked ? m.text : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {checked && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.name}</div>
                {r.description && <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{r.description}</div>}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: m.bg, border: `1px solid ${m.border}`, color: m.text }}>{r.code}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Toggle Status
// ═══════════════════════════════════════════════════════
function ToggleStatusModal({ user, onClose, onConfirm, showToast }) {
  const [saving, setSaving] = useState(false);
  const deactivating = user.is_active;
  const handleConfirm = async () => {
    setSaving(true);
    try { await onConfirm(user); onClose(); }
    catch (e) { setSaving(false); showToast(e.message, "error"); }
  };

  return (
    <Modal title={deactivating ? "Deactivate User" : "Reactivate User"} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleConfirm} label={deactivating ? "Yes, Deactivate" : "Yes, Reactivate"} color={deactivating ? "#dc2626" : "#16a34a"} saving={saving} /></>}>
      <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>{deactivating ? "🚫" : "✅"}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          {deactivating ? `Deactivate ${user.full_name}?` : `Reactivate ${user.full_name}?`}
        </div>
        <div style={{ fontSize: 13, color: C.gray400, lineHeight: 1.7 }}>
          {deactivating
            ? "This user will lose access immediately. Their data is preserved and they can be reactivated anytime."
            : "This user will regain access with their previous role restored."}
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Invite User
// ═══════════════════════════════════════════════════════
function InviteModal({ roles, callerRole, callerCds, onClose, onSuccess, showToast }) {
  const isAdmin = callerRole === "AD";
  const [form, setForm]     = useState({ email: "", password: "", cds_number: isAdmin ? callerCds : "", role_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setError("");
    if (!form.email.trim())       return setError("Email is required");
    if (!form.password.trim()) return setError("Temporary password is required.");
    // Validate password policy — must match Supabase Auth settings
    const pw = form.password;
    const pwErrors = [];
    if (pw.length < 8)              pwErrors.push("at least 8 characters");
    if (!/[A-Z]/.test(pw))          pwErrors.push("one uppercase letter");
    if (!/[a-z]/.test(pw))          pwErrors.push("one lowercase letter");
    if (!/[0-9]/.test(pw))          pwErrors.push("one number");
    if (!/[^A-Za-z0-9]/.test(pw))   pwErrors.push("one special character");
    if (pwErrors.length > 0) return setError("Password must contain: " + pwErrors.join(", ") + ".");
    if (!form.cds_number.trim())  return setError("CDS Number is required");
    if (!form.role_id)            return setError("Please select a role");
    setSaving(true);
    try {
      // ── FIX: pass cds_number as third argument so Edge Function receives it ──
      const result = await sbAdminCreateUser(
        form.email,
        form.password,
        form.cds_number.trim().toUpperCase()
      );
      const uid = result?.user?.id || result?.id;
      if (uid) {
        await sbAssignRole(uid, parseInt(form.role_id));
      }
      showToast("User created successfully!", "success");
      onSuccess(); onClose();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal title="Invite New User" subtitle="Create an account and assign a role" onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleSubmit} label="Create & Invite" saving={saving} /></>}>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span> {error}
        </div>
      )}

      <Field label="Email Address" required>
        <input style={inp()} type="email" placeholder="user@example.com"
          value={form.email} onChange={e => set("email", e.target.value)} onFocus={focusGreen} onBlur={blurGray} />
      </Field>

      <Field label="CDS Number" required hint={isAdmin ? "Auto-filled from your account — users will share your CDS" : "Enter digits only — e.g. 647305"}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, fontWeight: 700, color: isAdmin ? C.green : C.gray400, pointerEvents: "none", userSelect: "none" }}>CDS-</span>
          <input
            style={isAdmin
              ? { ...inp(), paddingLeft: 48, background: `${C.green}08`, border: `1.5px solid ${C.green}30`, color: C.green, fontWeight: 600, cursor: "not-allowed" }
              : { ...inp(), paddingLeft: 48 }}
            type="text"
            placeholder="647305"
            value={(form.cds_number || "").replace(/^CDS-/i, "")}
            onChange={e => {
              if (isAdmin) return;
              const digits = e.target.value.replace(/[^0-9]/g, "");
              set("cds_number", digits ? `CDS-${digits}` : "");
            }}
            readOnly={isAdmin}
            onFocus={isAdmin ? null : focusGreen}
            onBlur={isAdmin ? null : blurGray}
            maxLength={10}
          />
        </div>
      </Field>

      {/* Divider */}
      <div style={{ height: 1, background: C.gray100, margin: "4px 0 14px" }} />

      <Field label="Temporary Password" required hint="Share this with the user — they can change it after first login">
        <input style={inp()} type="password" placeholder="Min 8 chars, upper, lower, number, symbol"
          value={form.password} onChange={e => set("password", e.target.value)} onFocus={focusGreen} onBlur={blurGray} />
        {form.password.length > 0 && (() => {
          const pw = form.password;
          const checks = [
            { label: "8+ characters",    ok: pw.length >= 8 },
            { label: "Uppercase",         ok: /[A-Z]/.test(pw) },
            { label: "Lowercase",         ok: /[a-z]/.test(pw) },
            { label: "Number",            ok: /[0-9]/.test(pw) },
            { label: "Special char",      ok: /[^A-Za-z0-9]/.test(pw) },
          ];
          return (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {checks.map(c => (
                <span key={c.label} style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 5,
                  background: c.ok ? "#dcfce7" : "#fee2e2", color: c.ok ? "#166534" : "#991b1b" }}>
                  {c.ok ? "✓" : "✗"} {c.label}
                </span>
              ))}
            </div>
          );
        })()}
      </Field>

      <Field label="Assign Role" required>
        <select style={{ ...inp(), cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}
          value={form.role_id} onChange={e => set("role_id", e.target.value)} onFocus={focusGreen} onBlur={blurGray}>
          <option value="">Select a role...</option>
          {(isAdmin ? roles.filter(r => r.code !== "SA") : roles).map(r => (
            <option key={r.id} value={r.id}>{r.name} ({r.code})</option>
          ))}
        </select>
      </Field>

    </Modal>
  );
}

// ── Role badge ─────────────────────────────────────────────────────
function RoleBadge({ code }) {
  const m = ROLE_META[code];
  if (!m) return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309" }}>No Role</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.text, whiteSpace: "nowrap" }}>{m.label}</span>;
}

// ── User avatar ────────────────────────────────────────────────────
const AVATAR_COLORS = ["#0A2540","#1E3A5F","#1D4ED8","#065F46","#374151","#7C3AED","#B45309","#0369A1"];
function UserAvatar({ name, avatarUrl, isActive, size = 34 }) {
  const initials = (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const color    = AVATAR_COLORS[(name || "").charCodeAt(0) % AVATAR_COLORS.length];
  const radius   = Math.round(size * 0.28);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name || "User"}
          style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block", border: `1.5px solid ${C.gray200}` }}
          onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
        />
      ) : null}
      <div style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: avatarUrl ? "none" : "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: Math.round(size * 0.35), color: "#fff" }}>{initials}</div>
      <div style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.white}`, background: isActive ? "#16a34a" : "#d1d5db" }} />
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, color, icon }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 90 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
}

const GRID = "28px 1.5fr 0.9fr 0.8fr 0.8fr 1.1fr 1.3fr 90px 110px";

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function UserManagementPage({ role, showToast, profile }) {
  const [users, setUsers]               = useState([]);
  const [roles, setRoles]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState("");
  const [filterRole, setFilterRole]     = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [toggleUser, setToggleUser]     = useState(null);

  if (!["SA","AD"].includes(role)) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Access Restricted</div>
        <div style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>Only Admins and Super Admins can manage users.</div>
      </div>
    </div>
  );

  const loadData = async () => {
    try {
      setLoading(true);
      const [u, r] = await Promise.all([sbGetAllUsers(), sbGetRoles()]);
      setUsers(u); setRoles(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleAssignRole = async (userId, roleId) => {
    await sbAssignRole(userId, roleId);
    showToast(`Role updated to ${roles.find(r => r.id === roleId)?.name || "role"}`, "success");
    await loadData();
  };

  const handleToggleActive = async (user) => {
    if (user.is_active) {
      await sbDeactivateRole(user.id);
      showToast(`${user.full_name} deactivated`, "success");
    } else {
      if (!user.role_id) { showToast("No previous role — assign a role first", "error"); return; }
      await sbAssignRole(user.id, user.role_id);
      showToast(`${user.full_name} reactivated`, "success");
    }
    await loadData();
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const matchSearch = !search || (u.full_name||"").toLowerCase().includes(q) || (u.cds_number||"").toLowerCase().includes(q) || (u.phone||"").toLowerCase().includes(q);
    const matchRole   = filterRole === "ALL" || u.role_code === filterRole || (filterRole === "" && !u.role_code);
    const matchStatus = filterStatus === "ALL" || (filterStatus === "ACTIVE" && u.is_active) || (filterStatus === "INACTIVE" && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

  const total       = users.length;
  const activeCount = users.filter(u => u.is_active).length;
  const noRoleCount = users.filter(u => !u.role_code).length;
  const rCounts     = Object.fromEntries(Object.keys(ROLE_META).map(c => [c, users.filter(u => u.role_code === c).length]));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center", color: C.gray400 }}>
        <div style={{ width: 20, height: 20, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 12 }}>Loading users...</div>
      </div>
    </div>
  );

  if (error) return (
    <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: 14, fontSize: 12 }}>⚠️ {error}</div>
  );

  return (
    <div style={{ height: "calc(100vh - 118px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        .um-scroll::-webkit-scrollbar { width: 4px; }
        .um-scroll::-webkit-scrollbar-track { background: transparent; }
        .um-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .um-scroll { scrollbar-width: thin; scrollbar-color: #e5e7eb transparent; }
        input::placeholder { color: #9ca3af; }
        select option { font-weight: 500; }
      `}</style>

      {/* ── Stats row ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <StatCard label="Total Users"   value={total}           color="#0A2540" icon="👥" />
        <StatCard label="Active"        value={activeCount}     color={C.green} icon="✅" />
        <StatCard label="No Role"       value={noRoleCount}     color={C.gold}  icon="⚠️" />
        <StatCard label="Super Admins"  value={rCounts.SA || 0} color="#0A2540" icon="🔑" />
        <StatCard label="Data Entrants" value={rCounts.DE || 0} color="#1D4ED8" icon="✏️" />
        <StatCard label="Verifiers"     value={rCounts.VR || 0} color="#065F46" icon="✔️" />
      </div>

      {/* ── Filters + Invite ── */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.gray400, pointerEvents: "none" }}>🔍</span>
          <input placeholder="Search by name, CDS or phone..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={inp({ paddingLeft: 28 })} onFocus={focusGreen} onBlur={blurGray} />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} onFocus={focusGreen} onBlur={blurGray}
          style={{ ...inp(), width: "auto", cursor: "pointer" }}>
          <option value="ALL">All Roles</option>
          {Object.entries(ROLE_META).map(([c,m]) => <option key={c} value={c}>{m.label}</option>)}
          <option value="">No Role</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} onFocus={focusGreen} onBlur={blurGray}
          style={{ ...inp(), width: "auto", cursor: "pointer" }}>
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span style={{ fontSize: 11, color: C.gray400, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {filtered.length}/{total}
        </span>
        <button onClick={() => setInviteOpen(true)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
          borderRadius: 9, border: "none", background: C.green, color: C.white,
          fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
          boxShadow: `0 2px 10px ${C.green}44`, whiteSpace: "nowrap",
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
          + Invite User
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        <div style={{ overflowX: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Header */}
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "8px 14px", minWidth: 900, borderBottom: `1px solid ${C.gray100}`, background: C.gray50, flexShrink: 0 }}>
            {["#","User","CDS Number","Account Type","Role","Phone Number","Email Address","Created","Actions"].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
            ))}
          </div>

          {/* Scrollable body */}
          <div className="um-scroll" style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.gray400 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13 }}>No users match your search</div>
              </div>
            ) : filtered.map((user, idx) => (
              <div key={user.id} style={{
                display: "grid", gridTemplateColumns: GRID,
                padding: "9px 14px", minWidth: 900, borderBottom: `1px solid ${C.gray100}`,
                alignItems: "center", transition: "background 0.12s",
                opacity: user.is_active ? 1 : 0.5,
              }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

                <div style={{ fontSize: 11, color: C.gray400, fontWeight: 600 }}>{idx + 1}</div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} isActive={user.is_active} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.full_name || "New User"}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 20, flexShrink: 0, background: user.is_active ? "#f0fdf4" : "#fef2f2", border: `1px solid ${user.is_active ? "#bbf7d0" : "#fecaca"}`, color: user.is_active ? "#16a34a" : "#dc2626" }}>
                        {user.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{user.cds_number || <span style={{ color: C.gray400 }}>—</span>}</div>
                <div style={{ fontSize: 11, color: C.text }}>{user.account_type || <span style={{ color: C.gray400 }}>—</span>}</div>
                <div><RoleBadge code={user.role_code} /></div>
                <div style={{ fontSize: 11, color: C.text }}>{user.phone || <span style={{ color: C.gray400 }}>—</span>}</div>
                <div style={{ fontSize: 10, color: C.gray400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email || "—"}</div>
                <div style={{ fontSize: 10, color: C.gray400 }}>
                  {user.assigned_at ? new Date(user.assigned_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                </div>

                <div style={{ display: "flex", gap: 5 }}>
                  <button onClick={() => setChangeRoleUser(user)} style={{ padding: "4px 9px", borderRadius: 7, border: `1px solid ${C.gray200}`, background: C.white, color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.text; }}>
                    ✏️ Role
                  </button>
                  {user.role_code && (
                    <button onClick={() => setToggleUser(user)} style={{ padding: "4px 9px", borderRadius: 7, border: "none", background: user.is_active ? "#fef2f2" : "#f0fdf4", color: user.is_active ? "#dc2626" : "#16a34a", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      {user.is_active ? "🚫" : "✅"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {inviteOpen     && <InviteModal roles={roles} callerRole={role} callerCds={profile?.cds_number || ""} onClose={() => setInviteOpen(false)} onSuccess={loadData} showToast={showToast} />}
      {changeRoleUser && <ChangeRoleModal user={changeRoleUser} roles={roles} callerRole={role} onClose={() => setChangeRoleUser(null)} onSave={async (uid, rid) => { await handleAssignRole(uid, rid); setChangeRoleUser(null); }} showToast={showToast} />}
      {toggleUser     && <ToggleStatusModal user={toggleUser} onClose={() => setToggleUser(null)} onConfirm={handleToggleActive} showToast={showToast} />}
    </div>
  );
}
