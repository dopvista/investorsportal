import { useState, useEffect, useCallback } from "react";
import { sbSignOut, sbGetUserCDS, sbSearchCDS, sbAssignCDS, sbCreateCDS } from "../lib/supabase";
import { C } from "../components/ui";
import logo from "../assets/logo.jpg";

export default function ProfileSetupPage({ session, onComplete, onCancel }) {
  const email = session?.user?.email || session?.email || "";
  const uid   = session?.user?.id    || session?.id    || "";

  const [form, setForm]           = useState({ full_name: "", cds_number: "", phone: "" });
  const [cdsLocked, setCdsLocked] = useState(false);
  const [saving,     setSaving]   = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [checking,   setChecking] = useState(true);
  const [error,      setError]    = useState("");

  const BASE = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const tok  = session?.access_token || KEY;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`${BASE}/rest/v1/profiles?id=eq.${uid}`, {
          headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}` },
        });
        if (res.ok) {
          const rows = await res.json();
          const p    = rows[0];
          if (p && !cancelled) {
            setForm({ full_name: p.full_name || "", cds_number: p.cds_number || "", phone: p.phone || "" });
            if (p.cds_number) setCdsLocked(true);
          }
        }
      } catch (_) {}
      finally { if (!cancelled) setChecking(false); }
    })();
    return () => { cancelled = true; };
  }, [uid, BASE, KEY, tok]);

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const ensureUserCds = useCallback(async (cdsNumber, fullName) => {
    try {
      const existing = await sbGetUserCDS(uid).catch(() => []);
      if (existing && existing.length > 0) return;
      const results = await sbSearchCDS(cdsNumber).catch(() => []);
      let cdsRecord = results?.find(r => r.cds_number === cdsNumber.toUpperCase());
      if (!cdsRecord) {
        cdsRecord = await sbCreateCDS({
          cdsNumber: cdsNumber.toUpperCase(), cdsName: fullName || cdsNumber,
          phone: form.phone || null, email: email || null,
        }).catch(() => null);
      }
      if (cdsRecord?.id) await sbAssignCDS(uid, cdsRecord.id).catch(() => {});
    } catch (_) {}
  }, [uid, form.phone, email]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim())  return setError("Full name is required");
    if (!form.cds_number.trim()) return setError("CDS number is required");
    if (!form.phone.trim())      return setError("Phone number is required");
    setSaving(true);
    try {
      const payload = { full_name: form.full_name.trim(), cds_number: form.cds_number.trim().toUpperCase(), phone: form.phone.trim(), account_type: "Individual" };
      const patchRes = await fetch(`${BASE}/rest/v1/profiles?id=eq.${uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}`, "Prefer": "return=representation" },
        body: JSON.stringify(payload),
      });
      let savedProfile = null;
      if (patchRes.ok) { const rows = await patchRes.json(); if (rows?.length > 0) savedProfile = rows[0]; }
      if (!savedProfile) {
        const insertRes = await fetch(`${BASE}/rest/v1/profiles`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "apikey": KEY, "Authorization": `Bearer ${tok}`, "Prefer": "return=representation" },
          body: JSON.stringify({ id: uid, ...payload }),
        });
        if (!insertRes.ok) throw new Error(await insertRes.text());
        const rows = await insertRes.json();
        savedProfile = rows[0] || { ...payload, id: uid };
      }
      await ensureUserCds(payload.cds_number, payload.full_name);
      onComplete(savedProfile);
    } catch (err) {
      setError(err.message || "Failed to save profile. Please try again.");
    } finally { setSaving(false); }
  }, [form, uid, BASE, KEY, tok, ensureUserCds, onComplete]);

  const handleCancel = useCallback(async () => {
    setCancelling(true);
    await sbSignOut();
    if (onCancel) onCancel(); else window.location.reload();
  }, [onCancel]);

  const isMobile = window.innerWidth < 768; // simple mobile check for layout

  // Input styles – larger on mobile
  const inp = useMemo(() => ({
    width: "100%", padding: isMobile ? "16px" : "13px 15px", borderRadius: isMobile ? 14 : 11, fontSize: isMobile ? 16 : 15,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
    background: C.gray50, color: C.text, transition: "border 0.2s", boxSizing: "border-box",
  }), [isMobile]);
  const inpLocked = useMemo(() => ({
    ...inp, background: "#f0fdf4", border: `1.5px solid #bbf7d0`,
    color: C.green, fontWeight: 700, cursor: "not-allowed",
  }), [inp]);

  if (checking) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ width: 16, height: 16, border: `2px solid rgba(255,255,255,0.2)`, borderTop: `2px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "24px 16px", boxSizing: "border-box",
      position: "relative", overflow: "hidden",
      background: "radial-gradient(ellipse at 60% 40%, #0c2548 0%, #0B1F3A 50%, #080f1e 100%)",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin   { to { transform: rotate(360deg); } }
        input::placeholder { color: #9ca3af; }
        input:focus { border-color: ${C.green} !important; }
      `}</style>

      {/* Background decorations */}
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)", backgroundSize: "28px 28px", pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: "-80px", right: "-80px", width: 360, height: 360, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,132,61,0.16) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-100px", left: "-60px", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(212,175,55,0.09) 0%, transparent 70%)", pointerEvents: "none" }} />

      {/* Card */}
      <div style={{
        background: C.white, borderRadius: 22, padding: isMobile ? "32px 20px" : "36px 28px",
        width: "100%", maxWidth: isMobile ? "100%" : 460, position: "relative", zIndex: 1,
        boxShadow: "0 28px 72px rgba(0,0,0,0.38)",
        animation: "fadeIn 0.35s ease",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <img src={logo} alt="Investors Portal" style={{ width: isMobile ? 64 : 56, height: isMobile ? 64 : 56, borderRadius: 14, objectFit: "cover", marginBottom: 12, boxShadow: "0 6px 20px rgba(0,0,0,0.2)" }} />
          <div style={{ fontWeight: 800, fontSize: isMobile ? 24 : 20, color: C.text, marginBottom: 3 }}>Investors Portal</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: C.gray400 }}>Complete Your Profile</div>
          {/* Email chip */}
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, background: C.gray100, border: `1px solid ${C.gray200}`, borderRadius: 10, padding: "8px 16px" }}>
            <span style={{ fontSize: 15 }}>📧</span>
            <span style={{ fontSize: 14, color: C.navy, fontWeight: 700, letterSpacing: "0.01em" }}>{email}</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: "#fef2f2", border: `1px solid #fecaca`, color: "#dc2626", borderRadius: 10, padding: "12px 16px", fontSize: 14, marginBottom: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Full Name */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "block", marginBottom: 7, letterSpacing: "0.01em" }}>
              Full Name <span style={{ color: C.red }}>*</span>
            </label>
            <input style={inp} type="text" placeholder="e.g. Naomi Maguya"
              value={form.full_name} onChange={e => set("full_name", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.green}
              onBlur={e  => e.target.style.borderColor = C.gray200} />
          </div>

          {/* CDS Number */}
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: C.text, letterSpacing: "0.01em" }}>
                CDS Number <span style={{ color: C.red }}>*</span>
              </label>
              {cdsLocked && (
                <span style={{ fontSize: 12, color: C.green, fontWeight: 700, background: "#f0fdf4", border: `1px solid #bbf7d0`, borderRadius: 7, padding: "2px 10px", display: "flex", alignItems: "center", gap: 4 }}>
                  🔒 Pre-assigned
                </span>
              )}
            </div>
            <input
              style={cdsLocked ? inpLocked : inp}
              type="text" placeholder="e.g. CDS-647305"
              value={form.cds_number} readOnly={cdsLocked}
              onChange={e => { if (!cdsLocked) set("cds_number", e.target.value); }}
              onFocus={e => { if (!cdsLocked) e.target.style.borderColor = C.green; }}
              onBlur={e  => { if (!cdsLocked) e.target.style.borderColor = C.gray200; }}
            />
            <div style={{ fontSize: 13, color: C.gray400, marginTop: 5, lineHeight: 1.5 }}>
              {cdsLocked
                ? "Assigned by your administrator. Contact them to change it."
                : "Enter your CDS account number from DSE."}
            </div>
          </div>

          {/* Phone */}
          <div style={{ marginBottom: 26 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "block", marginBottom: 7, letterSpacing: "0.01em" }}>
              Phone Number <span style={{ color: C.red }}>*</span>
            </label>
            <input style={inp} type="tel" placeholder="e.g. +255713262087"
              value={form.phone} onChange={e => set("phone", e.target.value)}
              onFocus={e => e.target.style.borderColor = C.green}
              onBlur={e  => e.target.style.borderColor = C.gray200} />
          </div>

          {/* Continue button */}
          <button type="submit" disabled={saving || cancelling} style={{
            width: "100%", padding: isMobile ? "16px" : "14px", borderRadius: isMobile ? 14 : 11, border: "none",
            background: saving ? C.gray200 : C.green, color: C.white,
            fontWeight: 700, fontSize: isMobile ? 17 : 15, cursor: saving ? "not-allowed" : "pointer",
            fontFamily: "inherit", marginBottom: 12,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            boxShadow: saving ? "none" : `0 4px 18px ${C.green}55`,
            transition: "background 0.15s, box-shadow 0.15s",
          }}>
            {saving
              ? <><div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />Saving...</>
              : "Continue to Portal →"}
          </button>

          {/* Cancel */}
          <button type="button" onClick={handleCancel} disabled={saving || cancelling} style={{
            width: "100%", padding: isMobile ? "16px" : "12px", borderRadius: isMobile ? 14 : 11,
            border: `1.5px solid ${C.gray200}`, background: C.white,
            color: C.gray400, fontWeight: 600, fontSize: isMobile ? 16 : 14,
            cursor: cancelling ? "not-allowed" : "pointer", fontFamily: "inherit",
            transition: "all 0.15s",
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#dc2626"; e.currentTarget.style.color = "#dc2626"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200;  e.currentTarget.style.color = C.gray400; }}
          >
            {cancelling ? "Signing out..." : "Cancel & Sign Out"}
          </button>

          <div style={{ fontSize: 13, color: C.gray400, textAlign: "center", marginTop: 14, lineHeight: 1.5 }}>
            These details can be updated later in <strong style={{ color: C.navy }}>My Profile</strong>
          </div>
        </form>

        {/* Footer – removed on mobile, kept on desktop without dot */}
        {!isMobile && (
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.gray100}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: C.gray400, fontWeight: 500 }}>Manage Your Investments Digitally</span>
            </div>
            <div style={{ textAlign: "center", fontSize: 10, color: C.gray400, fontWeight: 500, letterSpacing: "0.03em" }}>
              © 2026 <span style={{ color: C.navy, fontWeight: 700 }}>Dopvista Creative Hub</span>. All rights reserved.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
