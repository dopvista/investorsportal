// ── src/pages/ProfileSetupPage.jsx ────────────────────────────────
import { useState, useEffect } from "react";
import { sbSignOut } from "../lib/supabase";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

export default function ProfileSetupPage({ session, onComplete, onCancel }) {
  const email = session?.user?.email || session?.email || "";
  const uid   = session?.user?.id    || session?.id    || "";

  const [form, setForm]         = useState({ full_name: "", cds_number: "", phone: "" });
  const [cdsLocked, setCdsLocked] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [checking,   setChecking]   = useState(true);
  const [error,      setError]      = useState("");

  const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const tok  = session?.access_token || KEY;

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch(`${BASE}/rest/v1/profiles?id=eq.${uid}`, {
          headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}` },
        });
        if (res.ok) {
          const rows = await res.json();
          const p    = rows[0];
          if (p) {
            setForm({
              full_name:  p.full_name  || "",
              cds_number: p.cds_number || "",
              phone:      p.phone      || "",
            });
            // ── FIX: lock CDS when pre-assigned by admin ──
            if (p.cds_number) setCdsLocked(true);
          }
        }
      } catch (_) {}
      finally { setChecking(false); }
    })();
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim())  return setError("Full name is required");
    if (!form.cds_number.trim()) return setError("CDS number is required");
    if (!form.phone.trim())      return setError("Phone number is required");
    setSaving(true);
    try {
      const payload = {
        full_name:    form.full_name.trim(),
        cds_number:   form.cds_number.trim().toUpperCase(),
        phone:        form.phone.trim(),
        account_type: "Individual",
      };

      const patchRes = await fetch(`${BASE}/rest/v1/profiles?id=eq.${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}`, "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });

      if (patchRes.ok) {
        const rows = await patchRes.json();
        if (rows && rows.length > 0) { onComplete(rows[0]); return; }
      }

      const insertRes = await fetch(`${BASE}/rest/v1/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}`, "Prefer": "return=representation" },
        body: JSON.stringify({ id: uid, ...payload }),
      });

      if (!insertRes.ok) throw new Error(await insertRes.text());
      const rows = await insertRes.json();
      onComplete(rows[0] || { ...payload, id: uid });

    } catch (err) {
      setError(err.message || "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await sbSignOut();
    if (onCancel) onCancel();
    else window.location.reload();
  };

  const inp = {
    width: "100%", padding: "11px 14px", borderRadius: 10, fontSize: 14,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
    background: C.gray50, color: C.text, transition: "border 0.2s", boxSizing: "border-box",
  };

  const inpLocked = {
    ...inp, background: "#f0fdf4", border: `1.5px solid #bbf7d0`,
    color: C.green, fontWeight: 700, cursor: "not-allowed",
  };

  const lbl = (text, required) => (
    <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>
      {text} {required && <span style={{ color: C.red }}>*</span>}
    </label>
  );

  if (checking) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 14, height: 14, border: `2px solid rgba(255,255,255,0.2)`, borderTop: `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif", padding: 20,
      position: "relative", overflow: "hidden", boxSizing: "border-box",
      background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        input::placeholder { color: #9ca3af; }
      `}</style>

      {/* Dot grid */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      {/* Green glow — top right */}
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.18) 0%, transparent 70%)", pointerEvents: "none" }} />
      {/* Gold glow — bottom left */}
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Card */}
      <div style={{
        background: C.white, borderRadius: 20, padding: "36px 32px",
        width: "100%", maxWidth: 440, position: "relative", zIndex: 1,
        boxShadow: "0 24px 64px rgba(0,0,0,0.35)",
        animation: "fadeIn 0.35s ease",
      }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src={logo} alt="Investors Portal" style={{ width: 52, height: 52, borderRadius: 13, objectFit: "cover", marginBottom: 10, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }} />
          <div style={{ fontWeight: 800, fontSize: 18, color: C.text }}>Investors Portal</div>
          <div style={{ fontWeight: 600, fontSize: 13, color: C.gray400, marginTop: 2 }}>Complete Your Profile</div>
          <div style={{ fontSize: 12, color: C.navy, fontWeight: 700, marginTop: 6, background: C.gray100, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: "7px 14px", letterSpacing: "0.01em" }}>
            {email}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: `1px solid #fecaca`, color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Full Name */}
          <div style={{ marginBottom: 14 }}>
            {lbl("Full Name", true)}
            <input style={inp} type="text" placeholder="e.g. Naomi Maguya"
              value={form.full_name} onChange={e => set("full_name", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.green}
              onBlur={e  => e.target.style.borderColor = C.gray200} />
          </div>

          {/* CDS Number — locked if pre-assigned, editable if not */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              {lbl("CDS Number", true)}
              {cdsLocked && (
                <span style={{ fontSize: 11, color: C.green, fontWeight: 700, background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 6, padding: "2px 8px" }}>
                  🔒 Pre-assigned
                </span>
              )}
            </div>
            <input
              style={cdsLocked ? inpLocked : inp}
              type="text"
              placeholder="e.g. CDS-647305"
              value={form.cds_number}
              readOnly={cdsLocked}
              onChange={e => { if (!cdsLocked) set("cds_number", e.target.value); }}
              onFocus={e => { if (!cdsLocked) e.target.style.borderColor = C.green; }}
              onBlur={e  => { if (!cdsLocked) e.target.style.borderColor = C.gray200; }}
            />
            <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>
              {cdsLocked ? "Assigned by your administrator. Contact them to change it." : "Enter your CDS account number."}
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 24 }}>
            {lbl("Phone Number", true)}
            <input style={inp} type="tel" placeholder="e.g. +255713262087"
              value={form.phone} onChange={e => set("phone", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.green}
              onBlur={e  => e.target.style.borderColor = C.gray200} />
          </div>

          {/* Submit */}
          <button type="submit" disabled={saving || cancelling} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: "none",
            background: saving ? C.gray200 : C.green, color: C.white,
            fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit", marginBottom: 8,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {saving
              ? <><div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Saving...</>
              : "Continue to Portal →"}
          </button>

          {/* Cancel */}
          <button type="button" onClick={handleCancel} disabled={saving || cancelling} style={{
            width: "100%", padding: "10px", borderRadius: 10,
            border: `1.5px solid ${C.gray200}`, background: C.white,
            color: C.gray400, fontWeight: 600, fontSize: 13,
            cursor: cancelling ? "not-allowed" : "pointer", fontFamily: "inherit",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#dc2626"; e.currentTarget.style.color = "#dc2626"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200;  e.currentTarget.style.color = C.gray400; }}
          >
            {cancelling ? "Signing out..." : "Cancel & Sign Out"}
          </button>

          <div style={{ fontSize: 11, color: C.gray400, textAlign: "center", marginTop: 10 }}>
            These details can be updated later in My Profile
          </div>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.gray200}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 5 }}>
            <div style={{ width: 6, height: 6, background: C.green, borderRadius: "50%", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>Manage Your Investments Digitally</span>
          </div>
          <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
            © 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
          </div>
        </div>

      </div>
    </div>
  );
}
