// ── src/components/ImageCropModal.jsx ────────────────────────────
// Updated: 4:3 crop tool for login slide images (matches login page + settings preview)
// Output: 1280×960 JPEG
import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "./ui";

const CANVAS_W = 560;
const CANVAS_H = 420;          // ← 4:3
const OUT_W = 1280;
const OUT_H = 960;             // ← 4:3
const ASPECT = 4 / 3;

// Initial crop rect as fraction of canvas
const INIT_FRAC = 0.82;

export default function ImageCropModal({ imageSrc, slideIndex, onConfirm, onCancel }) {
  const canvasRef = useRef();
  const imgRef = useRef(new Image());
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, rx: 0, ry: 0, rw: 0, rh: 0 });
  const lastPinchDist = useRef(null);

  const [imgLoaded, setImgLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [naturalSize, setNaturalSize] = useState({ w: 1, h: 1 });
  const [layout, setLayout] = useState({ drawX: 0, drawY: 0, drawW: 0, drawH: 0, baseScale: 1 });

  // Crop rect in canvas coords { x, y, w, h }
  const [crop, setCrop] = useState({
    x: CANVAS_W * (1 - INIT_FRAC) / 2,
    y: CANVAS_H * (1 - INIT_FRAC) / 2,
    w: CANVAS_W * INIT_FRAC,
    h: CANVAS_W * INIT_FRAC / ASPECT,
  });

  // ── Load image ─────────────────────────────────────────────────
  useEffect(() => {
    const img = imgRef.current;
    img.onload = () => {
      const baseScale = Math.min(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
      const drawW = img.naturalWidth * baseScale;
      const drawH = img.naturalHeight * baseScale;
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
      setLayout({ drawX: (CANVAS_W - drawW) / 2, drawY: (CANVAS_H - drawH) / 2, drawW, drawH, baseScale });

      // Init crop centered, 82% of canvas width, 4:3
      const cw = Math.min(drawW * 0.92, CANVAS_W * INIT_FRAC);
      const ch = cw / ASPECT;
      setCrop({
        x: (CANVAS_W - cw) / 2,
        y: (CANVAS_H - ch) / 2,
        w: cw,
        h: ch,
      });
      setImgLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // ── Computed zoomed image dimensions ───────────────────────────
  const currentScale = layout.baseScale * zoom;
  const currentW = naturalSize.w * currentScale;
  const currentH = naturalSize.h * currentScale;
  const currentX = (CANVAS_W - currentW) / 2;
  const currentY = (CANVAS_H - currentH) / 2;

  // ── Clamp crop rect within image bounds, enforce 4:3 ───────────
  const clampCrop = useCallback((x, y, w) => {
    const minW = 80;
    const maxW = currentW;
    const safeW = Math.min(Math.max(w, minW), maxW);
    const safeH = safeW / ASPECT;
    const safeX = Math.max(currentX, Math.min(currentX + currentW - safeW, x));
    const safeY = Math.max(currentY, Math.min(currentY + currentH - safeH, y));
    return { x: safeX, y: safeY, w: safeW, h: safeH };
  }, [currentW, currentH, currentX, currentY]);

  // ── Corner handle positions ─────────────────────────────────────
  const handles = (c) => [
    { id: "tl", x: c.x, y: c.y },
    { id: "tr", x: c.x + c.w, y: c.y },
    { id: "bl", x: c.x, y: c.y + c.h },
    { id: "br", x: c.x + c.w, y: c.y + c.h },
  ];

  // ── Mouse wheel zoom ───────────────────────────────────────────
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

  // Re-clamp crop when zoom changes
  useEffect(() => {
    setCrop(c => clampCrop(c.x, c.y, c.w));
  }, [zoom, clampCrop]);

  // ── Reset ──────────────────────────────────────────────────────
  const handleReset = () => {
    setZoom(1);
    const cw = Math.min(layout.drawW * 0.92, CANVAS_W * INIT_FRAC);
    const ch = cw / ASPECT;
    setCrop({
      x: (CANVAS_W - cw) / 2,
      y: (CANVAS_H - ch) / 2,
      w: cw, h: ch,
    });
  };

  // ── Draw ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgLoaded) return;
    const ctx = canvas.getContext("2d");
    const c = crop;

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Dark background
    ctx.fillStyle = "#111827";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Dimmed full image
    ctx.globalAlpha = 0.3;
    ctx.drawImage(imgRef.current, currentX, currentY, currentW, currentH);
    ctx.globalAlpha = 1.0;

    // Dark overlay outside crop
    ctx.fillStyle = "rgba(10,37,64,0.55)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Bright image inside crop rect
    ctx.save();
    ctx.beginPath();
    ctx.rect(c.x, c.y, c.w, c.h);
    ctx.clip();
    ctx.drawImage(imgRef.current, currentX, currentY, currentW, currentH);
    ctx.restore();

    // Crop border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x, c.y, c.w, c.h);

    // Rule-of-thirds grid lines
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(c.x + (c.w / 3) * i, c.y);
      ctx.lineTo(c.x + (c.w / 3) * i, c.y + c.h);
      ctx.stroke();
    }
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(c.x, c.y + (c.h / 3) * i);
      ctx.lineTo(c.x + c.w, c.y + (c.h / 3) * i);
      ctx.stroke();
    }
    ctx.restore();

    // Corner handles
    handles(c).forEach(h => {
      ctx.beginPath();
      ctx.arc(h.x, h.y, 7, 0, Math.PI * 2);
      ctx.fillStyle = C.green;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
    });
  }, [imgLoaded, crop, currentX, currentY, currentW, currentH]);

  useEffect(() => { draw(); }, [draw]);

  // ── Hit test helpers ───────────────────────────────────────────
  const hitHandle = (px, py, c) => {
    return handles(c).find(h => Math.hypot(px - h.x, py - h.y) < 14)?.id || null;
  };
  const hitInside = (px, py, c) =>
    px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h;

  // ── Pointer events ─────────────────────────────────────────────
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left) * scaleX,
      y: (touch.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e) => {
    if (e.touches?.length === 2) {
      lastPinchDist.current = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      return;
    }
    const { x, y } = getPos(e);
    const handle = hitHandle(x, y, crop);
    if (handle) {
      resizing.current = handle;
      dragStart.current = { x, y, rx: crop.x, ry: crop.y, rw: crop.w, rh: crop.h };
    } else if (hitInside(x, y, crop)) {
      dragging.current = true;
      dragStart.current = { x, y, rx: crop.x, ry: crop.y, rw: crop.w, rh: crop.h };
    }
  };

  const handlePointerMove = (e) => {
    if (e.touches?.length === 2 && lastPinchDist.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = (dist - lastPinchDist.current) / 200;
      setZoom(prev => Math.min(Math.max(prev + delta, 0.5), 3));
      lastPinchDist.current = dist;
      return;
    }
    if (!dragging.current && !resizing.current) return;

    const { x, y } = getPos(e);
    const dx = x - dragStart.current.x;
    const dy = y - dragStart.current.y;
    const { rx, ry, rw, rh } = dragStart.current;

    if (dragging.current) {
      setCrop(clampCrop(rx + dx, ry + dy, rw));
    } else {
      // Resize from corner — maintain 4:3 by driving width
      const h = resizing.current;
      let newW = rw;
      if (h === "br") newW = rw + dx;
      if (h === "bl") newW = rw - dx;
      if (h === "tr") newW = rw + dx;
      if (h === "tl") newW = rw - dx;
      newW = Math.max(80, newW);
      const newH = newW / ASPECT;
      let newX = rx;
      let newY = ry;
      if (h === "bl" || h === "tl") newX = rx + rw - newW;
      if (h === "tr" || h === "tl") newY = ry + rh - newH;
      setCrop(clampCrop(newX, newY, newW));
    }
  };

  const handlePointerUp = () => {
    dragging.current = false;
    resizing.current = false;
    lastPinchDist.current = null;
  };

  // ── Confirm — extract crop to 1280×960 ────────────────────────
  const handleConfirm = () => {
    setProcessing(true);
    const c = crop;

    const srcX = (c.x - currentX) / currentScale;
    const srcY = (c.y - currentY) / currentScale;
    const srcW = c.w / currentScale;
    const srcH = c.h / currentScale;

    const out = document.createElement("canvas");
    out.width = OUT_W;
    out.height = OUT_H;
    const ctx = out.getContext("2d");
    ctx.drawImage(imgRef.current, srcX, srcY, srcW, srcH, 0, 0, OUT_W, OUT_H);
    out.toBlob(blob => onConfirm(blob), "image/jpeg", 0.92);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(10,37,64,0.75)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(3px)",
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .img-zoom-slider { -webkit-appearance: none; width: 100%; height: 5px; background: ${C.gray200}; border-radius: 5px; outline: none; }
        .img-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: ${C.green}; border-radius: 50%; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 4px rgba(0,0,0,0.2); }
      `}</style>

      <div style={{
        background: C.white, borderRadius: 18, overflow: "hidden",
        boxShadow: "0 24px 64px rgba(0,0,0,0.45)", animation: "fadeIn 0.22s ease",
        width: CANVAS_W,
      }}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)", padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ color: C.white, fontWeight: 800, fontSize: 15 }}>
              Crop Slide {slideIndex} Image
            </div>
            <div style={{ color: C.gold, fontSize: 11, marginTop: 2, fontWeight: 500 }}>
              Drag to reposition · Corner handles to resize · Scroll to zoom · Output: 1280×960
            </div>
          </div>
          <button onClick={onCancel} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: C.white, width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        {/* Canvas */}
        <div style={{ background: "#111827", lineHeight: 0, position: "relative" }}>
          {imgLoaded ? (
            <canvas
              ref={canvasRef}
              width={CANVAS_W} height={CANVAS_H}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              style={{ display: "block", cursor: "crosshair", touchAction: "none", width: "100%" }}
            />
          ) : (
            <div style={{ width: CANVAS_W, height: CANVAS_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ color: "#9ca3af", fontSize: 13 }}>Loading image...</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.gray100}` }}>
          {/* Zoom slider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.gray400, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
              🔍 Zoom
            </span>
            <input
              type="range" min="0.5" max="3" step="0.01"
              value={zoom} className="img-zoom-slider"
              onChange={e => setZoom(parseFloat(e.target.value))}
            />
            <span style={{ fontSize: 11, color: C.gray400, minWidth: 32 }}>{Math.round(zoom * 100)}%</span>
            <button onClick={handleReset} style={{ background: "none", border: "none", color: C.green, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline", padding: 0, whiteSpace: "nowrap", fontFamily: "inherit" }}>Reset</button>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11, color: C.gray400 }}>4:3 · JPEG 1280×960</span>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={onCancel} style={{ padding: "9px 18px", borderRadius: 9, border: `1.5px solid ${C.gray200}`, background: C.white, color: C.gray400, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.color = C.gray400; }}>
                Cancel
              </button>
              <button onClick={handleConfirm} disabled={!imgLoaded || processing} style={{ padding: "9px 22px", borderRadius: 9, border: "none", background: !imgLoaded || processing ? C.gray200 : C.green, color: C.white, fontWeight: 700, fontSize: 13, cursor: !imgLoaded || processing ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 8, boxShadow: !imgLoaded || processing ? "none" : `0 4px 12px ${C.green}44` }}>
                {processing ? (
                  <>
                    <div style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                    Processing...
                  </>
                ) : "✓ Use This Image"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
