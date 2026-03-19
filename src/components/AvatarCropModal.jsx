// ── src/components/AvatarCropModal.jsx ───────────────────────────
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { C } from "./ui";

// Canvas size — responsive: fixed 420px on desktop, 90vw on mobile, clamped
const DESKTOP_SIZE = 420;
const MOBILE_SIZE  = "90vw";
const CROP_SIZE    = 200;      // output square side
const MIN_CROP     = 80;       // minimum crop diameter

// ── Mobile breakpoint hook (copied for self‑containment) ─────────
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
};

// ── Modal Shell (copied from ProfilePage for consistency) ────────
function ModalShell({ title, subtitle, onClose, children, footer, maxWidth = 460, lockBackdrop = false }) {
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",
        justifyContent: "center",
        padding: isMobile ? 0 : 24,
      }}
      onClick={e => { if (!lockBackdrop && e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: C.white,
        borderRadius: isMobile ? "16px 16px 0 0" : 16,
        width: "100%",
        maxWidth: isMobile ? "100%" : maxWidth,
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        maxHeight: isMobile ? "92vh" : undefined,
      }}>
        {/* Header with navy gradient */}
        <div style={{
          background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)",
          padding: isMobile ? "18px 20px 14px" : "22px 28px 16px",
          borderBottom: `1px solid ${C.gray200}`,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.white }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, color: C.gold, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {!lockBackdrop && (
            <button
              onClick={onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                border: "none",
                background: "rgba(255,255,255,0.1)",
                cursor: "pointer",
                fontSize: 15,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.white,
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>
        {/* Body */}
        <div style={{
          padding: isMobile ? "16px 18px" : "20px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          overflowY: "auto",
          flex: 1,
        }}>
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div style={{
            padding: isMobile ? "12px 18px" : "16px 28px",
            borderTop: `1px solid ${C.gray200}`,
            display: "flex",
            gap: 10,
            justifyContent: "flex-end",
            alignItems: "center",
            background: C.gray50,
            borderRadius: isMobile ? 0 : "0 0 16px 16px",
            flexShrink: 0,
            position: isMobile ? "sticky" : "static",
            bottom: 0,
            zIndex: 2,
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AvatarCropModal({ imageSrc, onConfirm, onCancel }) {
  const isMobile = useIsMobile();
  const canvasRef = useRef();
  const imgRef = useRef(new Image());
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef(null);
  const rafId = useRef(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [cropCircle, setCropCircle] = useState({ x: 0, y: 0, r: 100 });
  const [layout, setLayout] = useState({ drawX: 0, drawY: 0, drawW: 0, drawH: 0, baseScale: 1 });
  const [processing, setProcessing] = useState(false);

  // Canvas size (responsive)
  const canvasSize = useMemo(() => {
    if (!isMobile) return DESKTOP_SIZE;
    // On mobile, use 90vw but ensure it's not too small
    const vw = Math.min(window.innerWidth * 0.9, 420);
    return Math.max(300, vw);
  }, [isMobile]);

  // Load image and compute initial layout
  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const baseScale = Math.min(canvasSize / img.naturalWidth, canvasSize / img.naturalHeight);
      const drawW = img.naturalWidth * baseScale;
      const drawH = img.naturalHeight * baseScale;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setLayout({
        drawX: (canvasSize - drawW) / 2,
        drawY: (canvasSize - drawH) / 2,
        drawW,
        drawH,
        baseScale,
      });
      // initial crop circle: centered, 40% of min dimension
      const r = Math.round(Math.min(drawW, drawH) * 0.4);
      setCropCircle({ x: canvasSize / 2, y: canvasSize / 2, r });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc, canvasSize]);

  // Current scaled dimensions
  const currentScale = useMemo(() => layout.baseScale * zoom, [layout.baseScale, zoom]);
  const currentW = useMemo(() => naturalSize.w * currentScale, [naturalSize.w, currentScale]);
  const currentH = useMemo(() => naturalSize.h * currentScale, [naturalSize.h, currentScale]);
  const currentX = useMemo(() => (canvasSize - currentW) / 2, [canvasSize, currentW]);
  const currentY = useMemo(() => (canvasSize - currentH) / 2, [canvasSize, currentH]);

  // Clamp circle within image bounds (respecting current image position)
  const clampCircle = useCallback((nx, ny, nr) => {
    const maxR = Math.min(currentW, currentH) / 2;
    const safeR = Math.min(Math.max(nr, MIN_CROP / 2), maxR);
    return {
      x: Math.max(currentX + safeR, Math.min(currentX + currentW - safeR, nx)),
      y: Math.max(currentY + safeR, Math.min(currentY + currentH - safeR, ny)),
      r: safeR,
    };
  }, [currentW, currentH, currentX, currentY]);

  // Update circle when zoom changes to keep it inside
  useEffect(() => {
    setCropCircle(prev => clampCircle(prev.x, prev.y, prev.r));
  }, [clampCircle, zoom, currentX, currentY, currentW, currentH]);

  // Mouse wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.08 : 0.08;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, []);

  // Draw function (uses requestAnimationFrame for smoothness)
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    const { x, y, r } = cropCircle;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    // Dark background
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Dimmed full image
    ctx.globalAlpha = 0.35;
    ctx.drawImage(imgRef.current, currentX, currentY, currentW, currentH);
    ctx.globalAlpha = 1.0;

    // Dark overlay
    ctx.fillStyle = "rgba(10,37,64,0.45)";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Bright image inside crop circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imgRef.current, currentX, currentY, currentW, currentH);
    ctx.restore();

    // Circle border
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Dashed inner ring
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Resize handle (green dot at 45°)
    const hx = x + r * Math.cos(Math.PI * 0.25);
    const hy = y + r * Math.sin(Math.PI * 0.25);
    ctx.beginPath();
    ctx.arc(hx, hy, 9, 0, Math.PI * 2);
    ctx.fillStyle = C.green;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }, [imgLoaded, cropCircle, currentX, currentY, currentW, currentH, canvasSize]);

  // Animation loop
  useEffect(() => {
    if (!imgLoaded) return;
    const animate = () => {
      draw();
      rafId.current = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [imgLoaded, draw]);

  // Interaction handlers
  const handleInteractionStart = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const touches = e.touches || [e];

    if (touches.length === 2) {
      lastPinchDist.current = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      return;
    }

    const px = touches[0].clientX - rect.left;
    const py = touches[0].clientY - rect.top;
    const hx = cropCircle.x + cropCircle.r * Math.cos(Math.PI * 0.25);
    const hy = cropCircle.y + cropCircle.r * Math.sin(Math.PI * 0.25);

    if (Math.hypot(px - hx, py - hy) < 20) {
      resizing.current = true;
    } else if (Math.hypot(px - cropCircle.x, py - cropCircle.y) < cropCircle.r) {
      dragging.current = true;
      dragStart.current = { x: px - cropCircle.x, y: py - cropCircle.y };
    }
  }, [cropCircle]);

  const handleInteractionMove = useCallback((e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const touches = e.touches || [e];

    if (touches.length === 2 && lastPinchDist.current !== null) {
      const dist = Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY
      );
      const delta = (dist - lastPinchDist.current) / 150;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
      lastPinchDist.current = dist;
      return;
    }

    if (!dragging.current && !resizing.current) return;
    const px = touches[0].clientX - rect.left;
    const py = touches[0].clientY - rect.top;

    if (dragging.current) {
      setCropCircle(prev =>
        clampCircle(px - dragStart.current.x, py - dragStart.current.y, prev.r)
      );
    } else if (resizing.current) {
      setCropCircle(prev =>
        clampCircle(prev.x, prev.y, Math.hypot(px - prev.x, py - prev.y))
      );
    }
  }, [clampCircle]);

  const handleInteractionEnd = useCallback(() => {
    dragging.current = false;
    resizing.current = false;
    lastPinchDist.current = null;
  }, []);

  const handleReset = useCallback(() => {
    setZoom(1);
    const r = Math.round(Math.min(layout.drawW, layout.drawH) * 0.4);
    setCropCircle({ x: canvasSize / 2, y: canvasSize / 2, r });
  }, [layout.drawW, layout.drawH, canvasSize]);

  const handleConfirm = useCallback(async () => {
    setProcessing(true);
    const { x, y, r } = cropCircle;
    const srcX = (x - r - currentX) / currentScale;
    const srcY = (y - r - currentY) / currentScale;
    const srcSide = (r * 2) / currentScale;

    const out = document.createElement("canvas");
    out.width = CROP_SIZE;
    out.height = CROP_SIZE;
    const ctx = out.getContext("2d");
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(imgRef.current, srcX, srcY, srcSide, srcSide, 0, 0, CROP_SIZE, CROP_SIZE);
    out.toBlob(blob => onConfirm(blob), "image/jpeg", 0.9);
  }, [cropCircle, currentX, currentY, currentScale, onConfirm]);

  return (
    <ModalShell
      title="Edit Profile Picture"
      subtitle="Drag to reposition · Green handle to resize · Pinch/scroll to zoom"
      onClose={onCancel}
      maxWidth={canvasSize + 80} // allow some padding
      lockBackdrop={processing}
    >
      <style>{`
        .zoom-slider { -webkit-appearance: none; width: 100%; height: 5px; background: ${C.gray200}; border-radius: 5px; outline: none; }
        .zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.green}; border-radius: 50%; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
        .zoom-slider::-moz-range-thumb { width: 18px; height: 18px; background: ${C.green}; border-radius: 50%; cursor: pointer; border: 2px solid white; }
        canvas { display: block; cursor: move; touch-action: none; width: 100%; height: auto; border-radius: 8px; }
      `}</style>

      {/* Canvas container – responsive */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
        {imgLoaded ? (
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            onMouseDown={handleInteractionStart}
            onMouseMove={handleInteractionMove}
            onMouseUp={handleInteractionEnd}
            onMouseLeave={handleInteractionEnd}
            onTouchStart={handleInteractionStart}
            onTouchMove={handleInteractionMove}
            onTouchEnd={handleInteractionEnd}
            onTouchCancel={handleInteractionEnd}
            style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}
          />
        ) : (
          <div style={{
            width: canvasSize,
            height: canvasSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: C.gray50,
            borderRadius: 8,
            fontSize: 13,
            color: C.gray400,
          }}>
            Loading image...
          </div>
        )}
      </div>

      {/* Zoom slider and reset */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
          🔍 Zoom
        </span>
        <input
          type="range"
          min="0.5"
          max="3"
          step="0.01"
          value={zoom}
          className="zoom-slider"
          onChange={e => setZoom(parseFloat(e.target.value))}
        />
        <button
          onClick={handleReset}
          style={{
            background: "none",
            border: "none",
            color: C.green,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            textDecoration: "underline",
            padding: 0,
            whiteSpace: "nowrap",
            fontFamily: "inherit",
          }}
        >
          Reset
        </button>
      </div>

      {/* Footer buttons (custom, not using ModalShell footer to keep layout inside body) */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 4,
      }}>
        <span style={{ fontSize: 11, color: C.gray400 }}>Output: 200×200px JPEG</span>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={processing}
            style={{
              padding: "9px 18px",
              borderRadius: 9,
              border: `1.5px solid ${C.gray200}`,
              background: C.white,
              color: C.gray400,
              fontWeight: 600,
              fontSize: 13,
              cursor: processing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              if (!processing) {
                e.currentTarget.style.borderColor = C.red;
                e.currentTarget.style.color = C.red;
              }
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = C.gray200;
              e.currentTarget.style.color = C.gray400;
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!imgLoaded || processing}
            style={{
              padding: "9px 22px",
              borderRadius: 9,
              border: "none",
              background: !imgLoaded || processing ? C.gray200 : C.green,
              color: C.white,
              fontWeight: 700,
              fontSize: 13,
              cursor: !imgLoaded || processing ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: !imgLoaded || processing ? "none" : `0 4px 12px ${C.green}44`,
              transition: "all 0.15s",
            }}
          >
            {processing ? (
              <>
                <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Saving...
              </>
            ) : (
              "✓ Save Photo"
            )}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
