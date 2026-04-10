// src/components/ChatAssistant.jsx
// In-app AI assistant — floating button (draggable) + chat panel
// Powered by Gemini via Supabase Edge Function

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useTheme, useIsMobile } from "./ui";
import { Icon } from "../lib/icons";
import logo from "../assets/logo.jpg";

const BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const STORAGE_KEY = "ip_chat_btn_y";
const POSITION_VER = "ip_chat_pos_v2"; // change to force-reset all saved positions

// ── Suggested questions pool by page (randomly picks 3 on each open) ────
const SUGGESTION_POOL = {
  dashboard: [
    "What do my portfolio metrics mean?",
    "How is unrealized gain calculated?",
    "How do I read the performance chart?",
    "What is the difference between realized and unrealized gain?",
    "How is my market value calculated?",
    "What does the Dividend Income card show?",
    "How does the daily snapshot work?",
  ],
  transactions: [
    "How do I record a buy trade?",
    "What are DSE trading fees?",
    "What is the transaction workflow?",
    "How do I confirm a transaction?",
    "What happens after a transaction is verified?",
    "How do I import transactions from Excel?",
    "Can I edit a verified transaction?",
    "How do I record a sell trade?",
  ],
  dividends: [
    "How is withholding tax calculated?",
    "How do I record a dividend payment?",
    "What is the difference between declared and paid dividends?",
    "How do I mark a dividend as paid?",
    "What does ex-dividend date mean?",
    "How is net dividend amount calculated?",
    "What is YTD dividend income?",
  ],
  companies: [
    "How does FIFO cost basis work?",
    "How do I sync DSE prices?",
    "How do I set a custom price?",
    "How do I view price history for a company?",
    "What does auto-sync do?",
    "How do I read the price chart?",
    "How do I register a new company?",
  ],
  reports: [
    "What reports can I generate?",
    "How do I export to Excel?",
    "How is the gain/loss report calculated?",
    "What does the Portfolio Statement show?",
    "How do I filter a report by date range?",
    "What is included in the Transaction History report?",
    "How do I generate a Dividend Income report?",
  ],
  "system-settings": [
    "What are the role permissions?",
    "How do I add a new user?",
    "How does DSE price sync work?",
    "How do I enable the server cron job?",
    "How do I manage brokers?",
    "What is a CDS account?",
    "How do I manage login page slides?",
  ],
  "user-management": [
    "What are the role permissions?",
    "How do I activate a user?",
    "How do I assign a CDS account?",
    "How do I invite a new user?",
    "What is the difference between SA and AD roles?",
    "How do I change a user's role?",
    "What can a Read Only user do?",
  ],
};

const DEFAULT_POOL = [
  "How do I navigate this app?",
  "What pages are available to me?",
  "How do I record a transaction?",
  "What is FIFO and how is it used?",
  "How are DSE fees calculated?",
  "How do I generate a report?",
  "What is my role and what can I do?",
  "How does dividend withholding tax work?",
];

function pickSuggestions(page) {
  const pool = SUGGESTION_POOL[page] || DEFAULT_POOL;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

// ── Minimal markdown rendering ───────────────────────────────────
function renderMarkdown(text, isDark) {
  if (!text) return null;
  const lines = text.split("\n");
  const elements = [];
  let inList = false;
  let listItems = [];

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${elements.length}`} style={{ margin: "4px 0 4px 16px", padding: 0, listStyle: "disc" }}>{listItems}</ul>);
      listItems = [];
      inList = false;
    }
  };

  const formatInline = (str, keyPrefix) => {
    // First: replace "Investors Portal" with branded version (before bold processing)
    const branded = str.replace(/Investors\s+Portal(?:™|®)?/g, "{{IP_BRAND}}");
    // Bold: **text** or __text__
    const parts = branded.split(/(\*\*[^*]+\*\*|__[^_]+__|{{IP_BRAND}})/g);
    return parts.map((part, i) => {
      if (part === "{{IP_BRAND}}") return <strong key={`${keyPrefix}-${i}`}><span style={{ color: isDark ? "#fff" : "#0B1F3A" }}>Investors </span><span style={{ color: "#D4A017" }}>Portal</span><sup style={{ fontSize: "130%", verticalAlign: "top", color: "#D4A017", fontWeight: 800, marginLeft: 1, position: "relative", top: "-0.15em" }}>™</sup></strong>;
      if (/^\*\*(.+)\*\*$/.test(part)) return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
      if (/^__(.+)__$/.test(part)) return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
      return part;
    });
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();

    // Empty line
    if (!trimmed) {
      flushList();
      return;
    }

    // Heading: ## or ###
    if (/^#{1,3}\s/.test(trimmed)) {
      flushList();
      const hText = trimmed.replace(/^#{1,3}\s+/, "");
      elements.push(<div key={`h-${i}`} style={{ fontWeight: 700, marginTop: 6, marginBottom: 2 }}>{formatInline(hText, `h-${i}`)}</div>);
      return;
    }

    // Bullet: - item or * item or numbered: 1. item
    if (/^[-*]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      inList = true;
      const itemText = trimmed.replace(/^[-*]\s+|^\d+\.\s+/, "");
      listItems.push(<li key={`li-${i}`} style={{ marginBottom: 2 }}>{formatInline(itemText, `li-${i}`)}</li>);
      return;
    }

    // Regular paragraph
    flushList();
    elements.push(<div key={`p-${i}`} style={{ marginBottom: 4 }}>{formatInline(trimmed, `p-${i}`)}</div>);
  });

  flushList();
  return elements;
}

// ── Thinking dots animation ──────────────────────────────────────
function ThinkingDots({ C }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "8px 0" }}>
      <style>{`@keyframes _chatDot{0%,80%,100%{opacity:0.3;transform:scale(0.8)}40%{opacity:1;transform:scale(1)}}`}</style>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: C.gray400,
          display: "inline-block", animation: `_chatDot 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ── Message bubble ───────────────────────────────────────────────
const MessageBubble = memo(function MessageBubble({ msg, C, isDark, isMobile }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      alignItems: "flex-end", gap: 6, marginBottom: 10,
    }}>
      {/* Assistant avatar — system logo */}
      {!isUser && (
        <div style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          overflow: "hidden",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "#e2e8f0"}`,
          marginBottom: 2,
        }}>
          <img src={logo} alt="IP" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}
      <div style={{
        maxWidth: "82%",
        padding: "10px 14px",
        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser
          ? (isDark ? "rgba(34,197,94,0.15)" : "#dcfce7")
          : (isDark ? "rgba(255,255,255,0.06)" : "#f8fafc"),
        border: `1px solid ${isUser
          ? (isDark ? "rgba(34,197,94,0.2)" : "#bbf7d0")
          : (isDark ? "rgba(255,255,255,0.08)" : "#e2e8f0")}`,
        color: C.text,
        fontSize: isMobile ? 13 : 11.5,
        lineHeight: 1.5,
        wordBreak: "break-word",
      }}>
        {isUser ? msg.content : renderMarkdown(msg.content, isDark)}
      </div>
      {/* User avatar — person icon */}
      {isUser && (
        <div style={{
          width: 24, height: 24, borderRadius: 7, flexShrink: 0,
          background: isDark ? "rgba(59,130,246,0.2)" : "#dbeafe",
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px solid ${isDark ? "rgba(59,130,246,0.3)" : "#93c5fd"}`,
          marginBottom: 2,
        }}>
          <Icon name="user" size={13} stroke={isDark ? "#60a5fa" : "#2563eb"} sw={2} />
        </div>
      )}
    </div>
  );
});

// ── Chat Panel ───────────────────────────────────────────────────
const ChatPanel = memo(function ChatPanel({
  messages, loading, onSend, onClose, onClear, suggestions, C, isDark, isMobile,
}) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    // Focus input on open (desktop only)
    if (!isMobile) {
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [isMobile]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    onSend(trimmed);
    setInput("");
  }, [input, loading, onSend]);

  const handleKey = useCallback((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const panelStyle = isMobile ? {
    position: "fixed", bottom: 0, left: 0, right: 0,
    height: "70vh", maxHeight: "70vh",
    borderRadius: "18px 18px 0 0",
    zIndex: 9998,
    display: "flex", flexDirection: "column",
    background: C.white,
    boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
    border: `1px solid ${C.gray200}`,
  } : {
    position: "fixed", bottom: 24, right: 24,
    width: 360, height: 480,
    borderRadius: 18,
    zIndex: 9998,
    display: "flex", flexDirection: "column",
    background: C.white,
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    border: `1.5px solid ${C.gray200}`,
    overflow: "hidden",
  };

  return (
    <>
      {/* Backdrop on mobile */}
      {isMobile && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(10,31,58,0.55)", backdropFilter: "blur(2px)",
          zIndex: 9997,
        }} />
      )}

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          padding: isMobile ? "18px 20px 14px" : "18px 20px 14px",
          background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyLight} 100%)`,
          borderRadius: isMobile ? "18px 18px 0 0" : "18px 18px 0 0",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            <img src={logo} alt="" style={{ width: 38, height: 38, borderRadius: 11, objectFit: "cover", boxShadow: "0 2px 8px rgba(0,0,0,0.3)", border: "1.5px solid rgba(255,255,255,0.2)", flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.2 }}><span style={{ color: "#fff" }}>Investors </span><span style={{ color: "#D4A017" }}>Portal</span><sup style={{ fontSize: "130%", verticalAlign: "top", color: "#D4A017", fontWeight: 800, marginLeft: 1, position: "relative", top: "-0.15em" }}>™</sup></div>
              <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: 600, lineHeight: 1.2, marginTop: 2 }}>AI Assistant</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 12, flexShrink: 0 }}>
            {messages.length > 0 && (
              <button onClick={onClear} title="Clear chat"
                style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
                onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}>
                <Icon name="trash" size={14} stroke="#ffffff" sw={1.8} />
              </button>
            )}
            <button onClick={onClose}
              style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.25)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"}>
              <Icon name="x" size={16} stroke="#ffffff" sw={2.2} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <style>{`.chat-scroll::-webkit-scrollbar{width:5px}.chat-scroll::-webkit-scrollbar-track{background:transparent}.chat-scroll::-webkit-scrollbar-thumb{border-radius:10px;background:${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"}}.chat-scroll::-webkit-scrollbar-thumb:hover{background:${isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.2)"}}.chat-scroll{scrollbar-width:thin;scrollbar-color:${isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)"} transparent}`}</style>
        <div className="chat-scroll" style={{
          flex: 1, overflowY: "auto", padding: "14px 14px 8px",
          display: "flex", flexDirection: "column",
        }}>
          {/* Welcome card + suggestions */}
          {messages.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Capabilities */}
              <div style={{ fontSize: 10.5, color: C.gray400, padding: "8px 2px 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>What I can help with</div>
              {[
                { icon: "home",      color: "#00843D", text: "Navigate the app",       q: "How do I navigate the app? What pages are available?" },
                { icon: "briefcase", color: "#2563eb", text: "Guide workflows",         q: "Walk me through the main workflows — transactions, dividends, and reports." },
                { icon: "barChart",  color: "#7c3aed", text: "Explain features",        q: "Explain the key features — FIFO gains, fee calculation, and price sync." },
                { icon: "shield",    color: "#d97706", text: "Answer role questions",   q: "What can I do with my current role? What are my permissions?" },
                { icon: "globe",     color: "#0891b2", text: "DSE investing context",   q: "Explain DSE investing and how Investors Portal handles it." },
              ].map(({ icon, color, text, q }) => (
                <button key={icon} onClick={() => onSend(q)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 8,
                    background: isDark ? "rgba(255,255,255,0.03)" : "#f8fafc",
                    border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "#e2e8f0"}`,
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s ease", width: "100%",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}40`; e.currentTarget.style.transform = "translateX(2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.03)" : "#f8fafc"; e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.05)" : "#e2e8f0"; e.currentTarget.style.transform = "translateX(0)"; }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: 6, background: `${color}18`, border: `1px solid ${color}35`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name={icon} size={11} stroke={color} sw={2} />
                  </div>
                  <span style={{ fontSize: 11, color: C.text }}>{text}</span>
                </button>
              ))}
              {/* Suggested questions */}
              <div style={{ fontSize: 10.5, color: C.gray400, padding: "8px 2px 4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em" }}>Try asking</div>
              {suggestions.map((q, i) => (
                <button key={i} onClick={() => onSend(q)}
                  style={{
                    padding: "7px 10px", borderRadius: 9,
                    border: `1px solid ${C.gray200}`,
                    background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                    color: C.text, fontSize: 11.5, fontWeight: 500,
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "all 0.15s ease", lineHeight: 1.4,
                    display: "flex", alignItems: "center", gap: 8,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(0,132,61,0.12)" : "#f0fdf4"; e.currentTarget.style.borderColor = isDark ? "rgba(0,132,61,0.3)" : "#86efac"; e.currentTarget.style.transform = "translateX(2px)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc"; e.currentTarget.style.borderColor = C.gray200; e.currentTarget.style.transform = "translateX(0)"; }}
                >
                  <Icon name="arrowRight" size={11} stroke={isDark ? "#00843D" : "#16a34a"} sw={2.5} style={{ flexShrink: 0 }} />
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} C={C} isDark={isDark} isMobile={isMobile} />
          ))}

          {/* Thinking indicator */}
          {loading && (
            <div style={{
              display: "flex", justifyContent: "flex-start", marginBottom: 8,
            }}>
              <div style={{
                padding: "8px 14px",
                borderRadius: "14px 14px 14px 4px",
                background: isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9",
              }}>
                <ThinkingDots C={C} />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{
          padding: "10px 14px", borderTop: `1px solid ${C.gray200}`,
          display: "flex", alignItems: "flex-end", gap: 8, flexShrink: 0,
          background: C.white,
          borderRadius: isMobile ? 0 : "0 0 18px 18px",
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything..."
            disabled={loading}
            rows={1}
            style={{
              flex: 1, resize: "none", border: `1.5px solid ${C.gray200}`,
              borderRadius: 10, padding: "9px 12px", fontSize: 13,
              fontFamily: "inherit", color: C.text, background: C.white,
              outline: "none", maxHeight: 80, lineHeight: 1.4, overflow: "hidden",
              transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = "#f59e0b"}
            onBlur={e => e.target.style.borderColor = C.gray200}
            onInput={e => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 80) + "px";
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: "none", cursor: (!input.trim() || loading) ? "not-allowed" : "pointer",
              background: (!input.trim() || loading)
                ? (isDark ? "rgba(255,255,255,0.08)" : C.gray100)
                : C.green,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "background 0.15s",
            }}
          >
            <Icon name="send" size={15}
              stroke={(!input.trim() || loading) ? C.gray400 : "#fff"} sw={2} />
          </button>
        </div>
      </div>
    </>
  );
});

// ── Main ChatAssistant component ─────────────────────────────────
const ChatAssistant = memo(function ChatAssistant({
  session, role, currentPage, cdsNumber, userName,
}) {
  const { C, isDark } = useTheme();
  const isMobile = useIsMobile();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  // ── Draggable button state ──────────────────────────────────
  const [btnY, setBtnY] = useState(() => {
    try {
      // Reset saved position if version changed (clears stale positions from old defaults)
      if (!localStorage.getItem(POSITION_VER)) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(POSITION_VER, "1");
      }
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Number(saved) : -1; // -1 = use default (bottom)
    } catch { return -1; }
  });
  const dragState = useRef({ dragging: false, startY: 0, startBtnY: 0 });
  const btnRef = useRef(null);

  // Default Y position
  const defaultY = isMobile ? null : null; // We use bottom positioning

  // Compute button bottom position
  const btnBottom = useMemo(() => {
    if (btnY >= 0) return btnY;
    return isMobile ? 80 : 24; // default: above bottom nav bar
  }, [btnY, isMobile]);

  // ── Drag handlers ──────────────────────────────────────────
  const handlePointerDown = useCallback((e) => {
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    dragState.current = { dragging: false, startY: clientY, startBtnY: btnBottom };
    // Add move/up listeners
    const onMove = (ev) => {
      const cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const delta = dragState.current.startY - cy;
      if (!dragState.current.dragging && Math.abs(delta) > 5) {
        dragState.current.dragging = true;
      }
      if (dragState.current.dragging) {
        ev.preventDefault();
        const minBottom = isMobile ? 76 : 10;
        const maxBottom = window.innerHeight - (isMobile ? 120 : 120); // keep below header (56px) + button (52px) + gap
        const newBottom = Math.max(minBottom, Math.min(maxBottom, dragState.current.startBtnY + delta));
        setBtnY(newBottom);
      }
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove, { passive: false });
      document.removeEventListener("touchend", onUp);
      if (dragState.current.dragging) {
        // Save position
        try { localStorage.setItem(STORAGE_KEY, String(btnBottom)); } catch {}
      } else {
        // Tap — toggle panel
        setOpen(prev => !prev);
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }, [btnBottom]);

  // ── Send message ───────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const userMsg = { role: "user", content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(`${BASE}/functions/v1/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "apikey": KEY,
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          context: { role, currentPage, cdsNumber, userName, device: isMobile ? "mobile" : "desktop" },
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errText = data.error || `Error ${res.status}`;
        setMessages(prev => [...prev, { role: "assistant", content: `Sorry, I couldn't process that. ${errText}` }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: err.name === "AbortError"
          ? "Request timed out. Please try again."
          : "Sorry, something went wrong. Please try again.",
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, session, role, currentPage, cdsNumber, userName]);

  const [suggestions, setSuggestions] = useState(() => pickSuggestions(currentPage));

  const clearChat = useCallback(() => {
    setMessages([]);
    setSuggestions(pickSuggestions(currentPage));
  }, [currentPage]);

  // Re-randomize suggestions each time the chat is opened
  useEffect(() => {
    if (open) setSuggestions(pickSuggestions(currentPage));
  }, [open, currentPage]);

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      {/* Floating AI button */}
      {!open && (
        <div
          ref={btnRef}
          onMouseDown={handlePointerDown}
          onTouchStart={handlePointerDown}
          style={{
            position: "fixed",
            right: isMobile ? 16 : 24,
            bottom: btnBottom,
            width: 52, height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #00843D 0%, #006B32 100%)",
            boxShadow: "0 4px 16px rgba(0,132,61,0.4), 0 2px 4px rgba(0,0,0,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            zIndex: 201,
            transition: dragState.current.dragging ? "none" : "bottom 0.2s ease, transform 0.15s ease",
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            touchAction: "none",
          }}
          onMouseEnter={e => { if (!dragState.current.dragging) e.currentTarget.style.transform = "scale(1.08)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          <Icon name="aiSpark" size={24} stroke="#fff" sw={2} />
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <ChatPanel
          messages={messages}
          loading={loading}
          onSend={sendMessage}
          onClose={() => setOpen(false)}
          onClear={clearChat}
          suggestions={suggestions}
          C={C}
          isDark={isDark}
          isMobile={isMobile}
        />
      )}
    </>
  );
});

export default ChatAssistant;
