// src/components/ChatAssistant.jsx
// In-app AI assistant — floating button (draggable) + chat panel
// Powered by Gemini via Supabase Edge Function

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { useTheme, useIsMobile } from "./ui";
import { Icon } from "../lib/icons";

const BASE = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
const STORAGE_KEY = "ip_chat_btn_y";

// ── Suggested questions by page ──────────────────────────────────
const SUGGESTIONS = {
  dashboard: [
    "What do my portfolio metrics mean?",
    "How is unrealized gain calculated?",
    "How do I read the performance chart?",
  ],
  transactions: [
    "How do I record a buy trade?",
    "What are DSE trading fees?",
    "What is the transaction workflow?",
  ],
  dividends: [
    "How is withholding tax calculated?",
    "What is dividend yield?",
    "How do I record a dividend payment?",
  ],
  companies: [
    "How does FIFO cost basis work?",
    "How do I sync DSE prices?",
    "How do I set a custom price?",
  ],
  reports: [
    "What reports can I generate?",
    "How do I export to Excel?",
    "How is the gain/loss report calculated?",
  ],
  "system-settings": [
    "What are the role permissions?",
    "How do I add a new user?",
    "How does DSE price sync work?",
  ],
  "user-management": [
    "What are the role permissions?",
    "How do I activate a user?",
    "How do I assign a CDS account?",
  ],
};

const DEFAULT_SUGGESTIONS = [
  "What can you help me with?",
  "How do I navigate this app?",
  "Tell me about DSE investing",
];

// ── Minimal markdown rendering ───────────────────────────────────
function renderMarkdown(text) {
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
    // Bold: **text** or __text__
    const parts = str.split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return parts.map((part, i) => {
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
const MessageBubble = memo(function MessageBubble({ msg, C, isDark }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: 8,
    }}>
      <div style={{
        maxWidth: "85%",
        padding: "10px 14px",
        borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser
          ? (isDark ? "rgba(34,197,94,0.2)" : "#dcfce7")
          : (isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9"),
        color: C.text,
        fontSize: 13,
        lineHeight: 1.5,
        wordBreak: "break-word",
      }}>
        {isUser ? msg.content : renderMarkdown(msg.content)}
      </div>
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
    height: "75vh", maxHeight: "75vh",
    borderRadius: "18px 18px 0 0",
    zIndex: 9998,
    display: "flex", flexDirection: "column",
    background: C.white,
    boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
    border: `1px solid ${C.gray200}`,
  } : {
    position: "fixed", bottom: 24, right: 24,
    width: 380, height: 520,
    borderRadius: 16,
    zIndex: 9998,
    display: "flex", flexDirection: "column",
    background: C.white,
    boxShadow: isDark
      ? "0 8px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)"
      : "0 8px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)",
    border: `1px solid ${C.gray200}`,
  };

  return (
    <>
      {/* Backdrop on mobile */}
      {isMobile && (
        <div onClick={onClose} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          zIndex: 9997,
        }} />
      )}

      <div style={panelStyle}>
        {/* Header */}
        <div style={{
          padding: "14px 16px",
          background: "linear-gradient(135deg, #0c2548 0%, #0B1F3A 60%, #080f1e 100%)",
          borderRadius: isMobile ? "18px 18px 0 0" : "16px 16px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="aiSpark" size={16} stroke="#fbbf24" sw={2} />
            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>Portal AI</span>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, fontWeight: 500 }}>Assistant</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {messages.length > 0 && (
              <button onClick={onClear} title="Clear chat"
                style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center" }}>
                <Icon name="trash" size={14} stroke="rgba(255,255,255,0.5)" sw={1.5} />
              </button>
            )}
            <button onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center" }}>
              <Icon name="x" size={16} stroke="rgba(255,255,255,0.7)" sw={2} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="ui-dd-scroll" style={{
          flex: 1, overflowY: "auto", padding: "14px 14px 8px",
          display: "flex", flexDirection: "column",
        }}>
          {/* Welcome message if no messages */}
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "20px 10px 14px" }}>
              <div style={{
                width: 40, height: 40, borderRadius: "50%",
                background: isDark ? "rgba(251,191,36,0.15)" : "#fef3c7",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 10px",
              }}>
                <Icon name="aiSpark" size={20} stroke="#f59e0b" sw={2} />
              </div>
              <div style={{ fontWeight: 700, color: C.text, fontSize: 14, marginBottom: 4 }}>
                How can I help you?
              </div>
              <div style={{ fontSize: 12, color: C.gray500, lineHeight: 1.5 }}>
                Ask about the app, DSE investing, or your portfolio
              </div>
            </div>
          )}

          {/* Suggested questions */}
          {messages.length === 0 && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
              {suggestions.map((q, i) => (
                <button key={i} onClick={() => onSend(q)}
                  style={{
                    padding: "9px 14px", borderRadius: 10,
                    border: `1px solid ${C.gray200}`,
                    background: isDark ? "rgba(255,255,255,0.04)" : "#f8fafc",
                    color: C.text, fontSize: 12, fontWeight: 500,
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    transition: "background 0.15s, border-color 0.15s",
                    lineHeight: 1.4,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.08)" : "#f1f5f9"; e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.15)" : "#94a3b8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.04)" : "#f8fafc"; e.currentTarget.style.borderColor = C.gray200; }}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* Message list */}
          {messages.map((msg, i) => (
            <MessageBubble key={i} msg={msg} C={C} isDark={isDark} />
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
          borderRadius: isMobile ? 0 : "0 0 16px 16px",
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
              outline: "none", maxHeight: 80, lineHeight: 1.4,
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
                : "#f59e0b",
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
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Number(saved) : -1; // -1 = use default
    } catch { return -1; }
  });
  const dragState = useRef({ dragging: false, startY: 0, startBtnY: 0 });
  const btnRef = useRef(null);

  // Default Y position
  const defaultY = isMobile ? null : null; // We use bottom positioning

  // Compute button bottom position
  const btnBottom = useMemo(() => {
    if (btnY >= 0) return btnY;
    return isMobile ? 76 : 24; // 76px on mobile to clear bottom nav
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
        const newBottom = Math.max(10, Math.min(window.innerHeight - 70, dragState.current.startBtnY + delta));
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
          context: { role, currentPage, cdsNumber, userName },
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

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  // ── Suggestions based on current page ──────────────────────
  const suggestions = useMemo(() => {
    return SUGGESTIONS[currentPage] || DEFAULT_SUGGESTIONS;
  }, [currentPage]);

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
            background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
            boxShadow: "0 4px 16px rgba(245,158,11,0.4), 0 2px 4px rgba(0,0,0,0.1)",
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
