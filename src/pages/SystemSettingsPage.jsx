// ── src/pages/SystemSettingsPage.jsx ─────────────────────────────
import { useState, useRef, useEffect, useMemo, useCallback, memo } from "react";
import { C } from "../components/ui";
import ImageCropModal from "../components/ImageCropModal";
import { sbGetSiteSettings, sbSaveSiteSettings, sbUploadSlideImage } from "../lib/supabase";
import CompaniesPage from "./CompaniesPage";

const inp = (extra = {}) => ({
  width: "100%",
  padding: "9px 12px",
  borderRadius: 9,
  fontSize: 13,
  border: `1.5px solid ${C.gray200}`,
  outline: "none",
  fontFamily: "inherit",
  background: C.white,
  color: C.text,
  transition: "border 0.2s",
  boxSizing: "border-box",
  ...extra,
});

const focusGreen = e => { e.target.style.borderColor = C.green; };
const blurGray = e => { e.target.style.borderColor = C.gray200; };

const DEFAULT_SLIDES = [
  { label: "Investors Portal", title: "Secure Investing", sub: "Your assets are protected with us.", image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1280&q=80", color: "#064e3b", overlay: 0.35 },
  { label: "Investors Portal", title: "Smart Portfolio", sub: "Track all your holdings in one place.", image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1280&q=80", color: "#1e3a5f", overlay: 0.35 },
  { label: "Investors Portal", title: "Real-time Data", sub: "Stay ahead of the market with live insights.", image: "https://images.unsplash.com/photo-1642790551116-18a150d248c6?auto=format&fit=crop&w=1280&q=80", color: "#3b1f5e", overlay: 0.35 },
];

const DEFAULT_SETTINGS = { interval: 5000, animated: true, slides: DEFAULT_SLIDES };

const COLOR_PRESETS = [
  { label: "Forest", value: "#064e3b" },
  { label: "Navy", value: "#1e3a5f" },
  { label: "Purple", value: "#3b1f5e" },
  { label: "Gold", value: "#78350f" },
  { label: "Slate", value: "#1e293b" },
  { label: "Teal", value: "#134e4a" },
];

const Field = memo(function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.navy, display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>{hint}</div>}
    </div>
  );
});

// 4:3 preview (matches login page)
const SlidePreview = memo(function SlidePreview({ slide, allSlides = [], activeIdx = 0, animated = true }) {
  const overlayVal = slide.overlay ?? 0.35;
  const hexAlpha = Math.round(overlayVal * 255).toString(16).padStart(2, "0");
  const dots = allSlides.length > 0 ? allSlides : [slide];

  return (
    <div style={{
      position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "4/3",
      background: slide.color || "#064e3b", border: `1px solid ${C.gray200}`,
    }}>
      {slide.image && (
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `url(${slide.image})`,
          backgroundSize: "cover", backgroundPosition: "center",
          animation: animated ? "kenBurnsPreview 8s ease-in-out infinite alternate" : "none",
        }} />
      )}
      {overlayVal > 0 && (
        <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${slide.color || "#064e3b"}${hexAlpha} 0%, transparent 100%)` }} />
      )}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 6%", zIndex: 2 }}>
        {slide.title && (
          <div style={{ fontSize: "clamp(10px, 4.5%, 22px)", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "3%", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>
            {slide.title}
          </div>
        )}
        {slide.sub && (
          <div style={{ fontSize: "clamp(6px, 2.2%, 13px)", color: "rgba(255,255,255,0.9)", lineHeight: 1.5, maxWidth: "80%" }}>
            {slide.sub}
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: "8%", left: "6%", display: "flex", gap: 6, zIndex: 2 }}>
        {dots.map((_, i) => (
          <div key={i} style={{ width: i === activeIdx ? 28 : 6, height: 4, borderRadius: 2, background: "white", opacity: i === activeIdx ? 0.8 : 0.3, transition: "all 0.3s" }} />
        ))}
      </div>
    </div>
  );
});

export default function SystemSettingsPage({ role, session, showToast, setLoginSettings, companies, setCompanies, transactions }) {
  const [activeMenu, setActiveMenu] = useState("companies");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropIdx, setCropIdx] = useState(null);
  const [uploading, setUploading] = useState(null);

  const isMountedRef = useRef(true);
  const loadReqRef = useRef(0);

  const fileRef0 = useRef();
  const fileRef1 = useRef();
  const fileRef2 = useRef();
  const fileRefs = useMemo(() => [fileRef0, fileRef1, fileRef2], []);

  const isSA = role === "SA";
  const animated = settings.animated ?? true;
  const intervalSec = useMemo(() => (settings.interval / 1000).toFixed(0), [settings.interval]);
  const resetSlides = useMemo(() => {
    const userDefaults = settings.defaults;
    return DEFAULT_SLIDES.map((s, i) => userDefaults?.[i] ? { ...userDefaults[i] } : { ...s });
  }, [settings.defaults]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const broadcastSettings = useCallback((value) => {
    try {
      const bc = new BroadcastChannel("dse_site_settings");
      bc.postMessage({ key: "login_page", value });
      bc.close();
    } catch {}
  }, []);

  const loadSettings = useCallback(async () => {
    const reqId = ++loadReqRef.current;

    if (isMountedRef.current) {
      setLoading(true);
    }

    try {
      const data = await sbGetSiteSettings("login_page");
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      if (data) {
        setSettings({ ...DEFAULT_SETTINGS, ...data });
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (e) {
      if (!isMountedRef.current || reqId !== loadReqRef.current) return;
      showToast("Failed to load settings: " + e.message, "error");
    } finally {
      if (isMountedRef.current && reqId === loadReqRef.current) {
        setLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    if (!isSA) return;
    loadSettings();
  }, [isSA, loadSettings]);

  const setSlideField = useCallback((idx, field, value) => {
    setSettings(prev => ({
      ...prev,
      slides: prev.slides.map((s, i) => i === idx ? { ...s, [field]: value } : s),
    }));
  }, []);

  const handleSetAsDefault = useCallback(async (idx) => {
    const currentImage = settings.slides[idx]?.image;
    if (!currentImage) {
      showToast("No image to set as default", "error");
      return;
    }

    const newDefaults = [...(settings.defaults || DEFAULT_SLIDES.map(s => ({ ...s })))];
    newDefaults[idx] = { ...settings.slides[idx] };
    const newSettings = { ...settings, defaults: newDefaults };

    setSettings(newSettings);

    try {
      const tok = session?.access_token;
      if (!tok) throw new Error("Session expired");
      await sbSaveSiteSettings("login_page", newSettings, tok);
      if (!isMountedRef.current) return;
      if (setLoginSettings) setLoginSettings({ ...newSettings });
      broadcastSettings({ ...newSettings });
      showToast(`Slide ${idx + 1} default image updated!`, "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Failed to save default: " + err.message, "error");
    }
  }, [settings, session?.access_token, setLoginSettings, broadcastSettings, showToast]);

  const handleFileSelect = useCallback((e, idx) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      showToast("Image must be under 15MB", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      if (!isMountedRef.current) return;
      setCropSrc(ev.target.result);
      setCropIdx(idx);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, [showToast]);

  const handleCropConfirm = useCallback(async (blob) => {
    const idx = cropIdx;
    if (idx == null) return;

    setCropSrc(null);
    setUploading(idx);

    try {
      const url = await sbUploadSlideImage(blob, idx + 1, session);
      if (!isMountedRef.current) return;
      setSlideField(idx, "image", url);
      showToast(`Slide ${idx + 1} image uploaded!`, "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Upload failed: " + err.message, "error");
    } finally {
      if (isMountedRef.current) {
        setUploading(null);
        setCropIdx(null);
      }
    }
  }, [cropIdx, session, setSlideField, showToast]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const tok = session?.access_token;
      if (!tok) throw new Error("Session expired — please refresh the page.");
      await sbSaveSiteSettings("login_page", settings, tok);
      if (!isMountedRef.current) return;
      if (setLoginSettings) setLoginSettings({ ...settings });
      broadcastSettings({ ...settings });
      showToast("Settings saved! Login page updated.", "success");
    } catch (err) {
      if (!isMountedRef.current) return;
      showToast("Save failed: " + err.message, "error");
    } finally {
      if (isMountedRef.current) {
        setSaving(false);
      }
    }
  }, [session?.access_token, settings, setLoginSettings, broadcastSettings, showToast]);

  const handleReset = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS, slides: resetSlides, defaults: settings.defaults });
    showToast("Reset to defaults", "success");
  }, [resetSlides, settings.defaults, showToast]);

  const handleToggleAnimated = useCallback(() => {
    setSettings(prev => ({ ...prev, animated: !prev.animated }));
  }, []);

  if (!isSA) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 16, color: C.text }}>Access Restricted</div>
        <div style={{ fontSize: 12, color: C.gray400, marginTop: 4 }}>Only Super Admins can access System Settings.</div>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "40vh" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center", color: C.gray400 }}>
        <div style={{ width: 20, height: 20, border: `3px solid ${C.gray200}`, borderTop: `3px solid ${C.green}`, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
        <div style={{ fontSize: 12 }}>Loading settings...</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: "calc(100vh - 118px)", display: "flex", gap: 14, overflow: "hidden" }}>
      <style>{`
        @keyframes fadeIn          { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin            { to { transform: rotate(360deg); } }
        @keyframes kenBurnsPreview { 0% { transform:scale(1); } 100% { transform:scale(1.08); } }
        .ss-scroll::-webkit-scrollbar { width: 4px; }
        .ss-scroll::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 10px; }
        .ss-scroll { scrollbar-width: thin; scrollbar-color: #e5e7eb transparent; }
        .speed-slider { -webkit-appearance: none; width: 100%; height: 5px; background: ${C.gray200}; border-radius: 5px; outline: none; }
        .speed-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.green}; border-radius: 50%; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        input::placeholder { color: #9ca3af; }
        .no-overlay-check { width: 15px; height: 15px; accent-color: ${C.green}; cursor: pointer; }
      `}</style>

      <div style={{ width: 180, flexShrink: 0, background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: 10, display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.07em", padding: "6px 10px 8px" }}>Settings</div>
        {[{ id: "companies", icon: "🏢", label: "Companies" }, { id: "login_page", icon: "🖼️", label: "Login Page" }].map(item => (
          <button key={item.id} onClick={() => setActiveMenu(item.id)} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
            borderRadius: 9, border: "none", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left", width: "100%", transition: "all 0.15s",
            background: activeMenu === item.id ? `${C.navy}10` : "transparent",
            color: activeMenu === item.id ? C.navy : C.gray400,
            fontWeight: activeMenu === item.id ? 700 : 500, fontSize: 12,
            borderLeft: activeMenu === item.id ? `3px solid ${C.navy}` : "3px solid transparent",
          }}>
            <span>{item.icon}</span> {item.label}
          </button>
        ))}
      </div>

      <div className="ss-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>
        {activeMenu === "login_page" && <>
          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>🖼️ Login Page</div>
              <div style={{ color: C.gold, fontSize: 11, marginTop: 3, fontWeight: 500 }}>Customize the slideshow shown on the login screen</div>
            </div>
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, padding: "18px 20px", flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 14 }}>⏱ Slide Rotation Speed</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>2s</span>
              <input type="range" min="2000" max="10000" step="500"
                value={settings.interval} className="speed-slider"
                onChange={e => setSettings(prev => ({ ...prev, interval: parseInt(e.target.value, 10) }))} />
              <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>10s</span>
              <div style={{ background: `${C.green}15`, border: `1px solid ${C.green}40`, borderRadius: 8, padding: "4px 12px", minWidth: 52, textAlign: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{intervalSec}s</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.gray400, marginTop: 8 }}>Each slide stays visible for {intervalSec} seconds before rotating</div>

            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.gray100}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>🎬 Image Animation</div>
                  <div style={{ fontSize: 11, color: C.gray400, marginTop: 3 }}>
                    {animated ? "Ken Burns — images slowly zoom in/out" : "Static — images stay fixed"}
                  </div>
                </div>
                <div
                  onClick={handleToggleAnimated}
                  style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: animated ? C.green : C.gray200, position: "relative", transition: "background 0.25s", flexShrink: 0 }}
                >
                  <div style={{ position: "absolute", top: 3, left: animated ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "white", transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: animated ? C.green : C.gray400, fontWeight: 600 }}>
                {animated ? "✓ Animated (Ken Burns on)" : "✗ Static (Ken Burns off)"}
              </div>
            </div>
          </div>

          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ display: "flex", borderBottom: `1px solid ${C.gray200}` }}>
              {settings.slides.map((s, i) => (
                <button key={i} onClick={() => setActiveSlide(i)} style={{
                  flex: 1, padding: "12px 8px", border: "none", cursor: "pointer",
                  fontFamily: "inherit", fontSize: 12,
                  fontWeight: activeSlide === i ? 700 : 500,
                  color: activeSlide === i ? C.navy : C.gray400,
                  background: activeSlide === i ? C.white : C.gray50,
                  borderBottom: activeSlide === i ? `2px solid ${C.navy}` : "2px solid transparent",
                  transition: "all 0.15s",
                }}>
                  Slide {i + 1}
                  {s.title && <div style={{ fontSize: 9, marginTop: 2, color: activeSlide === i ? C.green : C.gray400, fontWeight: 500 }}>{s.title}</div>}
                </button>
              ))}
            </div>

            {settings.slides.map((slide, idx) => idx !== activeSlide ? null : (
              <div key={idx} style={{ padding: "20px", animation: "fadeIn 0.2s ease" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Slide Image</div>

                    <div
                      onClick={() => uploading == null && fileRefs[idx].current?.click()}
                      style={{
                        position: "relative", borderRadius: 10, overflow: "hidden",
                        aspectRatio: "4/3",
                        background: slide.color || "#064e3b",
                        border: `2px dashed ${C.gray200}`,
                        cursor: uploading === idx ? "wait" : "pointer"
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; }}
                    >
                      {slide.image && <img src={slide.image} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.9 }} />}

                      <div style={{
                        position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                        opacity: uploading === idx ? 1 : 0.85,
                        transition: "opacity 0.2s"
                      }}>
                        {uploading === idx ? (
                          <>
                            <div style={{ width: 24, height: 24, border: "3px solid rgba(255,255,255,0.3)", borderTop: "3px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: 8 }} />
                            <span style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>Click to change image</span>
                            <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, marginTop: 4 }}>JPG, PNG, WEBP — max 15MB</span>
                          </>
                        )}
                      </div>
                    </div>

                    <input ref={fileRefs[idx]} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFileSelect(e, idx)} />
                    <div style={{ fontSize: 11, color: C.gray400, marginTop: 6 }}>
                      Click to upload. Will be cropped to 4:3 (1280×960px).
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Overlay Color</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {COLOR_PRESETS.map(p => (
                          <button key={p.value} onClick={() => setSlideField(idx, "color", p.value)} title={p.label}
                            style={{ width: 28, height: 28, borderRadius: 7, border: slide.color === p.value ? `2.5px solid ${C.green}` : `2px solid ${C.gray200}`, background: p.value, cursor: "pointer", transition: "border 0.15s", boxShadow: slide.color === p.value ? `0 0 0 2px ${C.green}44` : "none" }} />
                        ))}
                        <div style={{ position: "relative", width: 28, height: 28 }}>
                          <input type="color" value={slide.color || "#064e3b"}
                            onChange={e => setSlideField(idx, "color", e.target.value)}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                          <div style={{ width: 28, height: 28, borderRadius: 7, border: `2px dashed ${C.gray300}`, background: slide.color || "#064e3b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, pointerEvents: "none" }}>✏️</div>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em" }}>Overlay Intensity</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: (slide.overlay ?? 0.35) === 0 ? C.green : C.gray400, fontWeight: (slide.overlay ?? 0.35) === 0 ? 700 : 500 }}>
                          <input type="checkbox" className="no-overlay-check"
                            checked={(slide.overlay ?? 0.35) === 0}
                            onChange={e => setSlideField(idx, "overlay", e.target.checked ? 0 : 0.35)} />
                          No overlay
                        </label>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: (slide.overlay ?? 0.35) === 0 ? 0.35 : 1, transition: "opacity 0.2s" }}>
                        <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>0%</span>
                        <input type="range" min="0.05" max="1" step="0.05"
                          value={slide.overlay ?? 0.35}
                          disabled={(slide.overlay ?? 0.35) === 0}
                          className="speed-slider"
                          onChange={e => setSlideField(idx, "overlay", parseFloat(e.target.value))} />
                        <span style={{ fontSize: 11, color: C.gray400, whiteSpace: "nowrap" }}>100%</span>
                        <div style={{ background: `${C.navy}10`, border: `1px solid ${C.navy}20`, borderRadius: 8, padding: "4px 8px", minWidth: 42, textAlign: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: (slide.overlay ?? 0.35) === 0 ? C.gray400 : C.navy }}>
                            {(slide.overlay ?? 0.35) === 0 ? "Off" : `${Math.round((slide.overlay ?? 0.35) * 100)}%`}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 5 }}>
                        {(slide.overlay ?? 0.35) === 0
                          ? "No overlay — photo shows fully. Useful for text-heavy images."
                          : "Color tint over the photo. Reduce for clearer images."}
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <button
                        onClick={() => {
                          const def = settings.defaults?.[idx] || DEFAULT_SLIDES[idx];
                          if (def) {
                            setSettings(prev => ({
                              ...prev,
                              slides: prev.slides.map((s, i) => i === idx ? { ...def } : s),
                            }));
                          }
                        }}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray400, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.gray400; }}
                      >
                        🔄 Use Default Image
                      </button>
                      <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Restore this slide's saved default image</div>

                      <div style={{ marginTop: 8 }}>
                        <button
                          onClick={() => handleSetAsDefault(idx)}
                          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.green}40`, background: `${C.green}08`, color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.background = `${C.green}15`; e.currentTarget.style.borderColor = C.green; }}
                          onMouseLeave={e => { e.currentTarget.style.background = `${C.green}08`; e.currentTarget.style.borderColor = `${C.green}40`; }}
                        >
                          ⭐ Set as Default Image
                        </button>
                        <div style={{ fontSize: 11, color: C.gray400, marginTop: 4 }}>Save current image as default — used when resetting this slide</div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Slide Text</div>

                    <Field label="Label (small gold text)">
                      <input style={inp()} placeholder="e.g. Investors Portal"
                        value={slide.label || ""}
                        onChange={e => setSlideField(idx, "label", e.target.value)}
                        onFocus={focusGreen} onBlur={blurGray} />
                    </Field>

                    <Field label="Title (large white text)">
                      <input style={inp()} placeholder="e.g. Secure Investing"
                        value={slide.title || ""}
                        onChange={e => setSlideField(idx, "title", e.target.value)}
                        onFocus={focusGreen} onBlur={blurGray} />
                    </Field>

                    <Field label="Subtitle">
                      <textarea style={{ ...inp(), resize: "vertical", minHeight: 64, lineHeight: 1.5 }}
                        placeholder="e.g. Your assets are protected with us."
                        value={slide.sub || ""}
                        onChange={e => setSlideField(idx, "sub", e.target.value)}
                        onFocus={focusGreen} onBlur={blurGray} />
                    </Field>

                    <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Live Preview</div>
                    <SlidePreview slide={slide} allSlides={settings.slides} activeIdx={idx} animated={animated} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>}

        {activeMenu === "companies" && (
          <div style={{ background: C.white, border: `1px solid ${C.gray200}`, borderRadius: 14, overflow: "hidden", flexShrink: 0 }}>
            <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px" }}>
              <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>🏢 Manage Companies</div>
              <div style={{ color: C.gold, fontSize: 11, marginTop: 3, fontWeight: 500 }}>Register, edit and manage listed companies</div>
            </div>
            <div style={{ padding: "16px" }}>
              <CompaniesPage
                companies={companies}
                setCompanies={setCompanies}
                transactions={transactions || []}
                showToast={showToast}
                role={role}
                profile={null}
                manageOnly={true}
              />
            </div>
          </div>
        )}

        {activeMenu === "login_page" && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingBottom: 16, flexShrink: 0 }}>
            <button
              onClick={handleReset}
              style={{ padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray400, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.navy; e.currentTarget.style.color = C.navy; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.gray400; }}>
              Reset to Defaults
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "10px 28px", borderRadius: 10, border: "none", background: saving ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: saving ? "none" : `0 2px 10px ${C.green}44`, display: "flex", alignItems: "center", gap: 8 }}>
              {saving ? (
                <>
                  <div style={{ width: 13, height: 13, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Saving...
                </>
              ) : "💾 Save Changes"}
            </button>
          </div>
        )}
      </div>

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          slideIndex={(cropIdx ?? 0) + 1}
          onConfirm={handleCropConfirm}
          onCancel={() => {
            setCropSrc(null);
            setCropIdx(null);
          }}
        />
      )}
    </div>
  );
}
