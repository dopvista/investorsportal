// ── src/pages/UserManagementPage.jsx ──────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import { createPortal } from "react-dom";
import {
  sbGetAllUsers, sbGetRoles, sbAssignRole, sbDeactivateRole, sbAdminCreateUser,
  sbGetUserCDS, sbSearchCDS, sbCreateCDS, sbAssignCDS, sbRemoveCDS,
  sbRemoveCDSFromAdminCascade, sbGetCDSAssignedUsers,
} from "../lib/supabase";
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

const AVATAR_COLORS = ["#0A2540", "#1E3A5F", "#1D4ED8", "#065F46", "#374151", "#7C3AED", "#B45309", "#0369A1"];
const GRID = "28px 1.5fr 0.9fr 0.8fr 0.8fr 1.1fr 1.3fr 90px 145px";

function inp(extra = {}) {
  return {
    width: "100%", padding: "9px 12px", borderRadius: 9, fontSize: 13,
    border: `1.5px solid ${C.gray200}`, outline: "none", fontFamily: "inherit",
    background: C.white, color: C.text, transition: "border 0.2s",
    boxSizing: "border-box", ...extra,
  };
}

const SEARCH_INPUT_STYLE = inp({ paddingLeft: 28 });
const SELECT_STYLE       = { ...inp(), width: "auto", cursor: "pointer" };
const INVITE_BTN_STYLE   = {
  display: "flex", alignItems: "center", gap: 6, padding: "8px 16px",
  borderRadius: 9, border: "none", background: C.green, color: C.white,
  fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit",
  boxShadow: `0 2px 10px ${C.green}44`, whiteSpace: "nowrap",
};

const focusGreen = (e) => { e.target.style.borderColor = C.green; };
const blurGray   = (e) => { e.target.style.borderColor = C.gray200; };

// ── Modal portal ───────────────────────────────────────────────────
const Modal = memo(function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = 460,
  closeOnBackdrop = true,
}) {
  return createPortal(
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(10,37,64,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: C.white, borderRadius: 20, width: "100%", maxWidth, boxShadow: "0 32px 80px rgba(0,0,0,0.35)", overflow: "hidden", animation: "fadeIn 0.2s ease", fontFamily: "'Inter', system-ui, sans-serif" }}
      >
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
});

const CancelBtn = memo(function CancelBtn({ onClose }) {
  return (
    <button onClick={onClose}
      style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.text; }}
    >Cancel</button>
  );
});

const ConfirmBtn = memo(function ConfirmBtn({ onClick, label, color, saving }) {
  return (
    <button onClick={onClick} disabled={saving}
      style={{ flex: 2, padding: "10px", borderRadius: 10, border: "none", background: saving ? C.gray200 : (color || C.green), color: C.white, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: saving ? "none" : `0 2px 10px ${(color || C.green)}44` }}
    >{saving ? "Saving..." : label}</button>
  );
});

const Field = memo(function Field({ label, required, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.navy, display: "block", marginBottom: 5, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: "#dc2626", marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
});

// ── CDS search box (search-as-you-type + create) ───────────────────
function CDSSearchBox({ callerRole, adCdsList = [], onSelect, placeholder = "Search by CDS number or owner name..." }) {
  const [query, setQuery]         = useState("");
  const [results, setResults]     = useState([]);
  const [searching, setSearching] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ cdsNumber: "", cdsName: "", phone: "", email: "" });
  const [creating, setCreating]   = useState(false);
  const [createError, setCreateError] = useState("");
  const [selected, setSelected]   = useState(null);
  const [editable, setEditable]   = useState(false);
  const debounceRef = useRef(null);

  const isAdmin = callerRole === "AD";

  const adFiltered = useMemo(() => {
    if (!isAdmin || !query.trim()) return isAdmin ? adCdsList : [];
    const q = query.toLowerCase();
    return adCdsList.filter(c =>
      c.cds_number?.toLowerCase().includes(q) ||
      c.cds_name?.toLowerCase().includes(q)
    );
  }, [isAdmin, adCdsList, query]);

  useEffect(() => {
    if (isAdmin) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setShowCreate(false); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const rows = await sbSearchCDS(query);
        setResults(rows || []);
        setShowCreate(rows?.length === 0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query, isAdmin]);

  const displayResults = isAdmin ? adFiltered : results;

  const handleSelect = (cds) => {
    setSelected(cds);
    setQuery(cds.cds_number);
    setResults([]);
    setShowCreate(false);
    onSelect(cds);
  };

  const handleCreate = async () => {
    setCreateError("");
    if (!createForm.cdsNumber.trim()) return setCreateError("CDS number is required");
    if (!createForm.cdsName.trim()) return setCreateError("Owner name is required");
    setCreating(true);
    try {
      const newCds = await sbCreateCDS(createForm);
      handleSelect(newCds);
      setShowCreate(false);
    } catch (e) {
      setCreateError(e.message || "Failed to create CDS");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.gray400, pointerEvents: "none" }}>🔍</span>
        <input
          style={{ ...inp(), paddingLeft: 32 }}
          type="text"
          placeholder={placeholder}
          value={query}
          readOnly={!editable}
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          name="cds_lookup"
          id="cds_lookup"
          data-lpignore="true"
          data-form-type="other"
          onFocus={(e) => {
            setEditable(true);
            focusGreen(e);
          }}
          onBlur={blurGray}
          onChange={e => {
            setQuery(e.target.value);
            setSelected(null);
            onSelect(null);
          }}
        />
        {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.gray400 }}>...</span>}
      </div>

      {displayResults.length > 0 && !selected && (
        <div style={{ border: `1.5px solid ${C.green}`, borderRadius: 9, marginTop: 4, overflow: "hidden", maxHeight: 200, overflowY: "auto", background: C.white, boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}>
          {displayResults.map(c => (
            <div key={c.id || c.cds_id || c.cds_number}
              onClick={() => handleSelect(c)}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: `1px solid ${C.gray100}`, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.gray50}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.cds_number}</div>
              <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{c.cds_name}{c.phone ? ` · ${c.phone}` : ""}</div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ marginTop: 6, padding: "8px 12px", borderRadius: 9, background: `${C.green}0d`, border: `1.5px solid ${C.green}30`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{selected.cds_number}</div>
            <div style={{ fontSize: 11, color: C.gray400 }}>{selected.cds_name}</div>
          </div>
          <button onClick={() => { setSelected(null); setQuery(""); onSelect(null); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: C.gray400, fontSize: 14, padding: 2 }}>✕</button>
        </div>
      )}

      {showCreate && !isAdmin && query.trim().length > 2 && !selected && (
        <div style={{ marginTop: 6, padding: "10px 12px", borderRadius: 9, background: "#fffbeb", border: `1.5px solid ${C.gold}40` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span>✨</span> Not found — create new CDS record
          </div>
          {createError && (
            <div style={{ fontSize: 11, color: "#dc2626", marginBottom: 6, background: "#fef2f2", padding: "5px 9px", borderRadius: 6 }}>⚠️ {createError}</div>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Number *</div>
              <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${C.gray200}`, borderRadius: 8, overflow: "hidden", background: C.white, transition: "border 0.2s" }}
                onFocus={e => e.currentTarget.style.borderColor = C.green}
                onBlur={e => e.currentTarget.style.borderColor = C.gray200}
              >
                <span style={{ padding: "6px 6px 6px 9px", fontSize: 12, fontWeight: 700, color: C.navy, background: C.navy + "0a", borderRight: `1px solid ${C.gray200}`, whiteSpace: "nowrap", userSelect: "none" }}>CDS-</span>
                <input
                  style={{ border: "none", outline: "none", padding: "6px 9px", fontSize: 12, fontFamily: "inherit", width: 80, background: "transparent", color: C.text }}
                  placeholder="647305"
                  value={createForm.cdsNumber.replace(/^CDS-/i, "")}
                  onChange={e => setCreateForm(f => ({ ...f, cdsNumber: "CDS-" + e.target.value.replace(/[^0-9A-Za-z]/g, "").toUpperCase() }))}
                  autoComplete="off"
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Owner Name *</div>
              <input
                style={inp({ fontSize: 12, padding: "6px 9px" })}
                placeholder="Full name"
                value={createForm.cdsName}
                onChange={e => setCreateForm(f => ({ ...f, cdsName: e.target.value }))}
                onFocus={focusGreen}
                onBlur={blurGray}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="words"
                spellCheck={false}
                name="cds_owner_name"
                data-lpignore="true"
              />
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Phone</div>
              <input
                style={inp({ fontSize: 12, padding: "6px 9px" })}
                placeholder="+255..."
                value={createForm.phone}
                onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                onFocus={focusGreen}
                onBlur={blurGray}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                name="cds_owner_phone"
                data-lpignore="true"
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.04em" }}>Email</div>
              <input
                style={inp({ fontSize: 12, padding: "6px 9px" })}
                type="email"
                placeholder="owner@email.com"
                value={createForm.email}
                onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                onFocus={focusGreen}
                onBlur={blurGray}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                name="cds_owner_email"
                data-lpignore="true"
              />
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating}
            style={{ width: "100%", padding: "7px", borderRadius: 8, border: "none", background: creating ? C.gray200 : C.navy, color: C.white, fontWeight: 700, fontSize: 12, cursor: creating ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {creating ? "Creating..." : "✚ Create & Select CDS"}
          </button>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Manage CDS
// ═══════════════════════════════════════════════════════
function ManageCDSModal({ user, callerRole, callerCdsList, onClose, showToast, onRefresh }) {
  const [userCdsList, setUserCdsList] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedCds, setSelectedCds] = useState(null);
  const [assigning, setAssigning]     = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);
  const isSA = callerRole === "SA";
  const isAD = callerRole === "AD";

  const loadUserCds = useCallback(async () => {
    setLoadingList(true);
    try {
      const list = await sbGetUserCDS(user.id);
      setUserCdsList(list || []);
    } catch {
      showToast("Failed to load CDS list", "error");
    } finally {
      setLoadingList(false);
    }
  }, [user.id, showToast]);

  useEffect(() => { loadUserCds(); }, [loadUserCds]);

  const handleAssign = useCallback(async () => {
    if (!selectedCds) return showToast("Select a CDS to assign", "error");
    setAssigning(true);
    try {
      await sbAssignCDS(user.id, selectedCds.id || selectedCds.cds_id);
      showToast(`${selectedCds.cds_number} assigned to ${user.full_name}`, "success");
      setSelectedCds(null);
      await loadUserCds();
      onRefresh?.();
    } catch (e) {
      showToast(e.message || "Failed to assign CDS", "error");
    } finally {
      setAssigning(false);
    }
  }, [selectedCds, user, loadUserCds, onRefresh, showToast]);

  const handleRemove = useCallback(async (cdsEntry) => {
    if (isSA && user.role_code === "AD") {
      setRemoveTarget(cdsEntry);
      return;
    }
    try {
      await sbRemoveCDS(user.id, cdsEntry.cds_id);
      showToast(`${cdsEntry.cds_number} removed`, "success");
      await loadUserCds();
      onRefresh?.();
    } catch (e) {
      showToast(e.message || "Failed to remove CDS", "error");
    }
  }, [isSA, user, loadUserCds, onRefresh, showToast]);

  const adPool = isAD ? callerCdsList : [];

  return (
    <>
      <Modal
        title="Manage CDS Accounts"
        subtitle={`${user.full_name || "User"} · ${userCdsList.length} account${userCdsList.length !== 1 ? "s" : ""}`}
        onClose={onClose}
        maxWidth={520}
        footer={<button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.text, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Close</button>}
      >
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Assigned CDS</div>
          {loadingList ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.gray400, fontSize: 12 }}>Loading...</div>
          ) : userCdsList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "16px 0", color: C.gray400, fontSize: 12, background: C.gray50, borderRadius: 9, border: `1px dashed ${C.gray200}` }}>No CDS accounts assigned yet</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {userCdsList.map(c => (
                <div key={c.cds_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: c.is_active ? `${C.green}09` : C.gray50, border: `1.5px solid ${c.is_active ? C.green + "30" : C.gray200}` }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: c.is_active ? C.green + "18" : C.navy + "10", border: `1px solid ${c.is_active ? C.green + "30" : C.navy + "15"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>🔒</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{c.cds_number}</div>
                    <div style={{ fontSize: 11, color: C.gray400 }}>{c.cds_name || "—"}</div>
                  </div>
                  {c.is_active && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: "#f0fdf4", color: C.green, border: `1px solid ${C.green}25`, borderRadius: 20, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>Active</span>
                  )}
                  <button
                    onClick={() => handleRemove(c)}
                    style={{ fontSize: 11, fontWeight: 600, background: "#fef2f2", color: "#dc2626", border: "none", borderRadius: 7, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
                    onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                  >Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 1, background: C.gray100, margin: "4px 0 14px" }} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            {isSA ? "Assign CDS" : "Assign CDS from your pool"}
          </div>
          <CDSSearchBox
            callerRole={callerRole}
            adCdsList={adPool}
            onSelect={setSelectedCds}
            placeholder={isSA ? "Search CDS number or owner name..." : "Search your CDS accounts..."}
          />
          {selectedCds && (
            <button
              onClick={handleAssign}
              disabled={assigning}
              style={{ marginTop: 10, width: "100%", padding: "9px", borderRadius: 9, border: "none", background: assigning ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: 13, cursor: assigning ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: assigning ? "none" : `0 2px 10px ${C.green}44` }}
            >
              {assigning ? "Assigning..." : `Assign ${selectedCds.cds_number}`}
            </button>
          )}
        </div>
      </Modal>

      {removeTarget && (
        <CascadeRemoveModal
          admin={user}
          cdsEntry={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onDone={async () => {
            setRemoveTarget(null);
            await loadUserCds();
            onRefresh?.();
          }}
          showToast={showToast}
        />
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Cascade Remove
// ═══════════════════════════════════════════════════════
function CascadeRemoveModal({ admin, cdsEntry, onClose, onDone, showToast }) {
  const [affectedUsers, setAffectedUsers] = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [cascade, setCascade]             = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const users = await sbGetCDSAssignedUsers(cdsEntry.cds_id);
        setAffectedUsers((users || []).filter(u => u.user_id !== admin.id));
      } catch {
        setAffectedUsers([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cdsEntry.cds_id, admin.id]);

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    try {
      if (affectedUsers.length > 0 && cascade !== null) {
        await sbRemoveCDSFromAdminCascade(admin.id, cdsEntry.cds_id, cascade);
        showToast(
          cascade
            ? `${cdsEntry.cds_number} removed from ${admin.full_name} and ${affectedUsers.length} user${affectedUsers.length > 1 ? "s" : ""}`
            : `${cdsEntry.cds_number} removed from ${admin.full_name} only`,
          "success"
        );
      } else {
        await sbRemoveCDS(admin.id, cdsEntry.cds_id);
        showToast(`${cdsEntry.cds_number} removed from ${admin.full_name}`, "success");
      }
      onDone();
    } catch (e) {
      showToast(e.message || "Failed to remove CDS", "error");
      setSaving(false);
    }
  }, [admin, cdsEntry, cascade, affectedUsers, onDone, showToast]);

  const canConfirm = affectedUsers.length === 0 || cascade !== null;

  return (
    <Modal
      title="Remove CDS from Admin"
      subtitle={`${cdsEntry.cds_number} · ${admin.full_name}`}
      onClose={onClose}
      maxWidth={480}
      footer={
        <>
          <CancelBtn onClose={onClose} />
          <ConfirmBtn onClick={handleConfirm} label="Confirm Remove" color="#dc2626" saving={saving || !canConfirm} />
        </>
      }
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: C.gray400, fontSize: 12 }}>Checking affected users...</div>
      ) : affectedUsers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Remove {cdsEntry.cds_number}?</div>
          <div style={{ fontSize: 13, color: C.gray400, lineHeight: 1.6 }}>
            No other users are assigned this CDS under <strong style={{ color: C.text }}>{admin.full_name}</strong>. It will simply be removed.
          </div>
        </div>
      ) : (
        <div>
          <div style={{ padding: "10px 14px", borderRadius: 9, background: "#fef2f2", border: "1px solid #fecaca", marginBottom: 14, fontSize: 13, color: "#dc2626" }}>
            ⚠️ <strong>{affectedUsers.length} user{affectedUsers.length > 1 ? "s" : ""}</strong> assigned by this admin also have <strong>{cdsEntry.cds_number}</strong>.
          </div>

          <div style={{ maxHeight: 140, overflowY: "auto", marginBottom: 14, border: `1px solid ${C.gray200}`, borderRadius: 9, overflow: "hidden" }}>
            {affectedUsers.map((u, i) => (
              <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: i % 2 ? C.gray50 : C.white, borderBottom: i < affectedUsers.length - 1 ? `1px solid ${C.gray100}` : "none" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: C.navy + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: C.navy, flexShrink: 0 }}>
                  {(u.full_name || "?")[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{u.full_name || "—"}</div>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.gray400 }}>{u.role_code || "—"}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>What to do with their access?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 4 }}>
            {[
              { val: false, icon: "🔒", label: "Remove from admin only", desc: "Users keep their CDS access" },
              { val: true,  icon: "🗑️", label: "Remove from all users too", desc: "All listed users lose this CDS" },
            ].map(opt => (
              <button key={String(opt.val)} onClick={() => setCascade(opt.val)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `2px solid ${cascade === opt.val ? (opt.val ? "#dc2626" : C.navy) : C.gray200}`, background: cascade === opt.val ? (opt.val ? "#fef2f2" : C.navy + "08") : C.white, transition: "all 0.15s" }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{opt.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 1 }}>{opt.desc}</div>
                </div>
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${cascade === opt.val ? (opt.val ? "#dc2626" : C.navy) : C.gray300}`, background: cascade === opt.val ? (opt.val ? "#dc2626" : C.navy) : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {cascade === opt.val && <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.white }} />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// MODAL — Change Role
// ═══════════════════════════════════════════════════════
function ChangeRoleModal({ user, roles, callerRole, onClose, onSave, showToast }) {
  const available = useMemo(
    () => (callerRole === "SA" ? roles : roles.filter(r => r.code !== "SA")),
    [callerRole, roles]
  );
  const [sel, setSel]       = useState(() => roles.find(r => r.code === user.role_code)?.id ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!sel) return showToast("Select a role", "error");
    setSaving(true);
    try {
      await onSave(user.id, parseInt(sel, 10));
      onClose();
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }, [sel, showToast, onSave, user.id, onClose]);

  return (
    <Modal title="Change Role" subtitle={`Assigning to ${user.full_name || "user"}`} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleSave} label="✓  Save Role" saving={saving} /></>}
    >
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
            <button key={r.id} onClick={() => setSel(r.id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left", border: `2px solid ${checked ? m.text : C.gray200}`, background: checked ? m.bg : C.white, transition: "all 0.15s" }}
            >
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

  const handleConfirm = useCallback(async () => {
    setSaving(true);
    try {
      await onConfirm(user);
      onClose();
    } catch (e) {
      setSaving(false);
      showToast(e.message, "error");
    }
  }, [onConfirm, user, onClose, showToast]);

  return (
    <Modal title={deactivating ? "Deactivate User" : "Reactivate User"} onClose={onClose}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleConfirm} label={deactivating ? "Yes, Deactivate" : "Yes, Reactivate"} color={deactivating ? "#dc2626" : "#16a34a"} saving={saving} /></>}
    >
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
function InviteModal({ roles, callerRole, callerCdsList, onClose, onSuccess, showToast }) {
  const isAdmin = callerRole === "AD";
  const [form, setForm]         = useState({ email: "", password: "", role_id: "" });
  const [selectedCds, setSelectedCds] = useState(
    isAdmin && callerCdsList?.length === 1 ? callerCdsList[0] : null
  );
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    setForm({ email: "", password: "", role_id: "" });
    setError("");
    setSaving(false);
    setSelectedCds(isAdmin && callerCdsList?.length === 1 ? callerCdsList[0] : null);
  }, [isAdmin, callerCdsList]);

  const allowedRoles = useMemo(
    () => (isAdmin ? roles.filter(r => r.code !== "SA") : roles),
    [isAdmin, roles]
  );

  const passwordChecks = useMemo(() => {
    const pw = form.password;
    return [
      { label: "8+ characters", ok: pw.length >= 8 },
      { label: "Uppercase", ok: /[A-Z]/.test(pw) },
      { label: "Lowercase", ok: /[a-z]/.test(pw) },
      { label: "Number", ok: /[0-9]/.test(pw) },
      { label: "Special char", ok: /[^A-Za-z0-9]/.test(pw) },
    ];
  }, [form.password]);

  const set = useCallback((k, v) => setForm(p => ({ ...p, [k]: v })), []);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!form.email.trim()) return setError("Email is required");
    if (!form.password.trim()) return setError("Temporary password is required.");

    const pwErrors = [];
    if (form.password.length < 8) pwErrors.push("at least 8 characters");
    if (!/[A-Z]/.test(form.password)) pwErrors.push("one uppercase letter");
    if (!/[a-z]/.test(form.password)) pwErrors.push("one lowercase letter");
    if (!/[0-9]/.test(form.password)) pwErrors.push("one number");
    if (!/[^A-Za-z0-9]/.test(form.password)) pwErrors.push("one special character");
    if (pwErrors.length > 0) return setError("Password must contain: " + pwErrors.join(", ") + ".");
    if (!selectedCds) return setError("Please select a CDS account");
    if (!form.role_id) return setError("Please select a role");

    setSaving(true);
    try {
      const cdsNumber = selectedCds.cds_number;
      const result = await sbAdminCreateUser(form.email, form.password, cdsNumber);
      const uid = result?.user?.id || result?.id;
      if (uid) {
        await sbAssignRole(uid, parseInt(form.role_id, 10));
        const cdsId = selectedCds.id || selectedCds.cds_id;
        if (cdsId) await sbAssignCDS(uid, cdsId).catch(() => {});
      }
      showToast("User created successfully!", "success");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }, [form, selectedCds, onClose, onSuccess, showToast]);

  return (
    <Modal
      title="Invite New User"
      subtitle="Create an account and assign a role"
      onClose={onClose}
      closeOnBackdrop={false}
      footer={<><CancelBtn onClose={onClose} /><ConfirmBtn onClick={handleSubmit} label="Create & Invite" saving={saving} /></>}
    >
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span> {error}
        </div>
      )}

      <Field label="Email Address" required>
        <input
          style={inp()}
          type="email"
          placeholder="user@example.com"
          value={form.email}
          onChange={e => set("email", e.target.value)}
          onFocus={focusGreen}
          onBlur={blurGray}
        />
      </Field>

      <Field label="CDS Account" required hint={isAdmin ? "Select from your assigned CDS accounts" : "Search existing CDS or create a new one"}>
        {isAdmin && callerCdsList?.length <= 1 && selectedCds ? (
          <div style={{ padding: "9px 12px", borderRadius: 9, background: `${C.green}08`, border: `1.5px solid ${C.green}30`, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13 }}>🔒</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{selectedCds.cds_number}</div>
              <div style={{ fontSize: 11, color: C.gray400 }}>{selectedCds.cds_name}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.green }}>Auto-selected</span>
          </div>
        ) : (
          <CDSSearchBox
            callerRole={callerRole}
            adCdsList={callerCdsList || []}
            onSelect={setSelectedCds}
            placeholder={isAdmin ? "Select from your CDS accounts..." : "Search CDS number or owner name..."}
          />
        )}
      </Field>

      <div style={{ height: 1, background: C.gray100, margin: "4px 0 14px" }} />

      <Field label="Temporary Password" required hint="Share this with the user — they can change it after first login">
        <input
          style={inp()}
          type="password"
          placeholder="Min 8 chars, upper, lower, number, symbol"
          value={form.password}
          onChange={e => set("password", e.target.value)}
          onFocus={focusGreen}
          onBlur={blurGray}
        />
        {form.password.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: 3,
              flexWrap: "nowrap",
              marginTop: 6,
              whiteSpace: "nowrap",
              alignItems: "center",
            }}
          >
            {passwordChecks.map(c => (
              <span
                key={c.label}
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textAlign: "center",
                  fontSize: 9,
                  lineHeight: 1.15,
                  fontWeight: 700,
                  padding: "2px 4px",
                  borderRadius: 999,
                  background: c.ok ? "#dcfce7" : "#fee2e2",
                  color: c.ok ? "#166534" : "#991b1b",
                  border: `1px solid ${c.ok ? "#bbf7d0" : "#fecaca"}`,
                }}
                title={`${c.ok ? "✓" : "✗"} ${c.label}`}
              >
                {c.ok ? "✓" : "✗"} {c.label}
              </span>
            ))}
          </div>
        )}
      </Field>

      <Field label="Assign Role" required>
        <select
          style={{ ...inp(), cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236b7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}
          value={form.role_id}
          onChange={e => set("role_id", e.target.value)}
          onFocus={focusGreen}
          onBlur={blurGray}
        >
          <option value="">Select a role...</option>
          {allowedRoles.map(r => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
        </select>
      </Field>
    </Modal>
  );
}

// ── Role badge ─────────────────────────────────────────────────────
const RoleBadge = memo(function RoleBadge({ code }) {
  const m = ROLE_META[code];
  if (!m) return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "#fffbeb", border: "1px solid #fde68a", color: "#b45309" }}>No Role</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: m.bg, border: `1px solid ${m.border}`, color: m.text, whiteSpace: "nowrap" }}>{m.label}</span>;
});

// ── User avatar ────────────────────────────────────────────────────
const UserAvatar = memo(function UserAvatar({ name, avatarUrl, isActive, size = 34 }) {
  const initials = useMemo(() => (name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(), [name]);
  const color    = useMemo(() => AVATAR_COLORS[(name || "").charCodeAt(0) % AVATAR_COLORS.length], [name]);
  const radius   = Math.round(size * 0.28);
  return (
    <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name || "User"}
          style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", display: "block", border: `1.5px solid ${C.gray200}` }}
          onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }}
        />
      ) : null}
      <div style={{ width: size, height: size, borderRadius: radius, background: `linear-gradient(135deg, ${color}, ${color}99)`, display: avatarUrl ? "none" : "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: Math.round(size * 0.35), color: "#fff" }}>{initials}</div>
      <div style={{ position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%", border: `2px solid ${C.white}`, background: isActive ? "#16a34a" : "#d1d5db" }} />
    </div>
  );
});

// ── Stat card ──────────────────────────────────────────────────────
const StatCard = memo(function StatCard({ label, value, color, icon }) {
  return (
    <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 12, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 90 }}>
      <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: `${color}18`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: 10, color: C.gray400, marginTop: 2 }}>{label}</div>
      </div>
    </div>
  );
});

// ═══════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════
export default function UserManagementPage({ role, showToast, profile }) {
  const [users, setUsers]               = useState([]);
  const [roles, setRoles]               = useState([]);
  const [callerCdsList, setCallerCdsList] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [search, setSearch]             = useState("");
  const [filterRole, setFilterRole]     = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [inviteOpen, setInviteOpen]     = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState(null);
  const [toggleUser, setToggleUser]     = useState(null);
  const [manageCdsUser, setManageCdsUser] = useState(null);

  const isMountedRef = useRef(true);
  const loadReqRef   = useRef(0);
  const isAllowed    = ["SA", "AD"].includes(role);

  useEffect(() => () => { isMountedRef.current = false; }, []);

  const roleNameById = useMemo(
    () => Object.fromEntries(roles.map(r => [r.id, r.name])),
    [roles]
  );

  const loadData = useCallback(async () => {
    const reqId = ++loadReqRef.current;
    if (isMountedRef.current) { setLoading(true); setError(null); }
    try {
      const [u, r] = await Promise.all([sbGetAllUsers(), sbGetRoles()]);
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      setUsers(u);
      setRoles(r);
    } catch (e) {
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      setError(e.message);
    } finally {
      if (isMountedRef.current && reqId === loadReqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAllowed || !profile?.id) return;
    sbGetUserCDS(profile.id)
      .then(list => { if (isMountedRef.current) setCallerCdsList(list || []); })
      .catch(() => {});
  }, [isAllowed, profile?.id]);

  useEffect(() => { if (!isAllowed) return; loadData(); }, [isAllowed, loadData]);

  const handleAssignRole = useCallback(async (userId, roleId) => {
    await sbAssignRole(userId, roleId);
    showToast(`Role updated to ${roleNameById[roleId] || "role"}`, "success");
    await loadData();
  }, [showToast, roleNameById, loadData]);

  const handleToggleActive = useCallback(async (user) => {
    if (user.is_active) {
      await sbDeactivateRole(user.id);
      showToast(`${user.full_name} deactivated`, "success");
    } else {
      if (!user.role_id) { showToast("No previous role — assign a role first", "error"); return; }
      await sbAssignRole(user.id, user.role_id);
      showToast(`${user.full_name} reactivated`, "success");
    }
    await loadData();
  }, [showToast, loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter(u => {
      const matchSearch = !q ||
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.cds_number || "").toLowerCase().includes(q) ||
        (u.phone || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q);
      const matchRole   = filterRole === "ALL" || u.role_code === filterRole || (filterRole === "" && !u.role_code);
      const matchStatus = filterStatus === "ALL" || (filterStatus === "ACTIVE" && u.is_active) || (filterStatus === "INACTIVE" && !u.is_active);
      return matchSearch && matchRole && matchStatus;
    });
  }, [users, search, filterRole, filterStatus]);

  const stats = useMemo(() => {
    const total       = users.length;
    const activeCount = users.filter(u => u.is_active).length;
    const noRoleCount = users.filter(u => !u.role_code).length;
    const rCounts     = Object.fromEntries(Object.keys(ROLE_META).map(c => [c, users.filter(u => u.role_code === c).length]));
    return { total, activeCount, noRoleCount, rCounts };
  }, [users]);

  const handleOpenInvite       = useCallback(() => setInviteOpen(true), []);
  const handleCloseInvite      = useCallback(() => setInviteOpen(false), []);
  const handleCloseChangeRole  = useCallback(() => setChangeRoleUser(null), []);
  const handleCloseToggle      = useCallback(() => setToggleUser(null), []);
  const handleCloseManageCds   = useCallback(() => setManageCdsUser(null), []);

  if (!isAllowed) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Access Restricted</div>
          <div style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>Only Admins and Super Admins can manage users.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ textAlign: "center", color: C.gray400 }}>
          <div style={{ width: 20, height: 20, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
          <div style={{ fontSize: 12 }}>Loading users...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 12, padding: 14, fontSize: 12 }}>⚠️ {error}</div>;
  }

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

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0, flexWrap: "wrap" }}>
        <StatCard label="Total Users"   value={stats.total}           color="#0A2540" icon="👥" />
        <StatCard label="Active"        value={stats.activeCount}     color={C.green} icon="✅" />
        <StatCard label="No Role"       value={stats.noRoleCount}     color={C.gold}  icon="⚠️" />
        <StatCard label="Super Admins"  value={stats.rCounts.SA || 0} color="#0A2540" icon="🔑" />
        <StatCard label="Data Entrants" value={stats.rCounts.DE || 0} color="#1D4ED8" icon="✏️" />
        <StatCard label="Verifiers"     value={stats.rCounts.VR || 0} color="#065F46" icon="✔️" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
          <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: C.gray400, pointerEvents: "none" }}>🔍</span>
          <input placeholder="Search by name, CDS or phone..." value={search} onChange={e => setSearch(e.target.value)} style={SEARCH_INPUT_STYLE} onFocus={focusGreen} onBlur={blurGray} />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} onFocus={focusGreen} onBlur={blurGray} style={SELECT_STYLE}>
          <option value="ALL">All Roles</option>
          {Object.entries(ROLE_META).map(([c, m]) => <option key={c} value={c}>{m.label}</option>)}
          <option value="">No Role</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} onFocus={focusGreen} onBlur={blurGray} style={SELECT_STYLE}>
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
        <span style={{ fontSize: 11, color: C.gray400, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 8, padding: "5px 10px", whiteSpace: "nowrap" }}>
          {filtered.length}/{stats.total}
        </span>
        <button onClick={handleOpenInvite} style={INVITE_BTN_STYLE}
          onMouseEnter={e => e.currentTarget.style.opacity = "0.9"}
          onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        >+ Invite User</button>
      </div>

      <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, minWidth: 0 }}>
        <div style={{ overflowX: "auto", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "8px 14px", minWidth: 940, borderBottom: `1px solid ${C.gray100}`, background: C.gray50, flexShrink: 0 }}>
            {["#", "User", "CDS Number", "Account Type", "Role", "Phone Number", "Email Address", "Created", "Actions"].map((h, i) => (
              <div key={i} style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</div>
            ))}
          </div>

          <div className="um-scroll" style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.gray400 }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
                <div style={{ fontSize: 13 }}>No users match your search</div>
              </div>
            ) : filtered.map((user, idx) => (
              <div key={user.id}
                style={{ display: "grid", gridTemplateColumns: GRID, padding: "9px 14px", minWidth: 940, borderBottom: `1px solid ${C.gray100}`, alignItems: "center", transition: "background 0.12s", opacity: user.is_active ? 1 : 0.5 }}
                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
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
                <div style={{ fontSize: 11, color: C.gray400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email || "—"}</div>
                <div style={{ fontSize: 10, color: C.gray400 }}>
                  {user.assigned_at ? new Date(user.assigned_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" }) : "—"}
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setChangeRoleUser(user)}
                    style={{ padding: "4px 7px", borderRadius: 7, border: `1px solid ${C.gray200}`, background: C.white, color: C.text, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.text; }}
                  >✏️ Role</button>

                  <button onClick={() => setManageCdsUser(user)}
                    style={{ padding: "4px 7px", borderRadius: 7, border: `1px solid ${C.navy}25`, background: C.navy + "08", color: C.navy, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.navy; e.currentTarget.style.color = C.white; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.navy + "08"; e.currentTarget.style.color = C.navy; }}
                  >🏦 CDS</button>

                  {user.role_code && (
                    <button onClick={() => setToggleUser(user)}
                      style={{ padding: "4px 7px", borderRadius: 7, border: "none", background: user.is_active ? "#fef2f2" : "#f0fdf4", color: user.is_active ? "#dc2626" : "#16a34a", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}
                    >{user.is_active ? "🚫" : "✅"}</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {inviteOpen && (
        <InviteModal
          roles={roles}
          callerRole={role}
          callerCdsList={callerCdsList}
          onClose={handleCloseInvite}
          onSuccess={loadData}
          showToast={showToast}
        />
      )}

      {changeRoleUser && (
        <ChangeRoleModal
          user={changeRoleUser}
          roles={roles}
          callerRole={role}
          onClose={handleCloseChangeRole}
          onSave={async (uid, rid) => { await handleAssignRole(uid, rid); if (isMountedRef.current) setChangeRoleUser(null); }}
          showToast={showToast}
        />
      )}

      {toggleUser && (
        <ToggleStatusModal user={toggleUser} onClose={handleCloseToggle} onConfirm={handleToggleActive} showToast={showToast} />
      )}

      {manageCdsUser && (
        <ManageCDSModal
          user={manageCdsUser}
          callerRole={role}
          callerCdsList={callerCdsList}
          onClose={handleCloseManageCds}
          showToast={showToast}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
