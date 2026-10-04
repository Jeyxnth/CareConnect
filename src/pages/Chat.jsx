import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { askCareConnect, buildSystemPrompt } from "../lib/api";
import { t as translate } from "../lib/translations";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";

const RETRIABLE = /high demand|temporar|429/i;
const SCROLL_THRESHOLD = 100;
const TITLE_CHARS = 40;

// Mobile browsers' 100vh includes the collapsing URL bar; prefer dvh where supported
const VH = typeof CSS !== "undefined" && CSS.supports?.("height", "100dvh") ? "dvh" : "vh";

let tmpCounter = 0;
const tmpId = () => `tmp-${++tmpCounter}`;
const isTransient = (m) => m.kind === "loading" || m.kind === "error";

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()];
}

// supabase.functions.invoke throws a generic FunctionsHttpError for non-2xx responses;
// the function's actual { error } message is in the response body on `error.context`.
async function errorMessage(err) {
  try {
    if (typeof err?.context?.json === "function") {
      const body = await err.context.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    /* body unreadable — fall back to the generic message */
  }
  return err?.message ? String(err.message) : String(err);
}

// ─── Pieces ────────────────────────────────────────────────────────────────

function Avatar({ size, fontSize }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: "var(--color-primary-light)",
        color: "var(--color-primary)",
        fontWeight: 700,
        fontSize,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      CC
    </div>
  );
}

function BounceDots() {
  return (
    <div style={{ display: "flex", flexDirection: "row", gap: 4, padding: "4px 0" }} aria-hidden="true">
      {[0, 1, 2].map((dotIdx) => (
        <div
          key={dotIdx}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--color-primary)",
            animation: `bounce 1.2s ease-in-out ${dotIdx * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function Message({ msg, locale, onRetry, canRetry }) {
  const { t } = useLanguage();
  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
    : "";

  if (msg.role === "user") {
    return (
      <div
        style={{
          alignSelf: "flex-end",
          maxWidth: "75%",
          background: "var(--color-primary)",
          color: "#fff",
          borderRadius: "18px 18px 4px 18px",
          padding: "12px 16px",
          fontSize: 15,
          lineHeight: 1.5,
          animation: "slideInRight 0.25s ease-out",
        }}
      >
        <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{msg.content}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", textAlign: "right", marginTop: 4 }}>{time}</div>
      </div>
    );
  }

  const isError = msg.kind === "error";
  const bubbleStyle = isError
    ? { background: "var(--color-emergency-bg)", borderLeft: "3px solid var(--color-alert)", color: "var(--color-alert)" }
    : { background: "var(--color-surface-alt)", borderLeft: "3px solid var(--color-primary-light)", color: "var(--color-body)" };

  return (
    <div style={{ display: "flex", gap: 10, width: "100%", animation: "slideInLeft 0.25s ease-out" }}>
      <div style={{ alignSelf: "flex-start" }}>
        <Avatar size={32} fontSize={12} />
      </div>
      <div style={{ maxWidth: "75%", minWidth: 0 }}>
        <div
          style={{
            ...bubbleStyle,
            borderRadius: "18px 18px 18px 4px",
            padding: "12px 16px",
            fontSize: 15,
            lineHeight: 1.6,
          }}
        >
          {msg.kind === "loading" ? (
            <BounceDots />
          ) : (
            <>
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{msg.content}</div>
              {isError && msg.retriable && (
                <div style={{ marginTop: 10 }}>
                  <Button variant="secondary" size="sm" disabled={!canRetry} onClick={onRetry}>
                    {t("retry")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
        {msg.kind !== "loading" && !isError && (
          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 4 }}>{time}</div>
        )}
      </div>
    </div>
  );
}

function Chip({ text, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flexShrink: 0,
        whiteSpace: "nowrap",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 500,
        borderRadius: 20,
        padding: "8px 16px",
        border: `1.5px solid ${hovered ? "var(--color-primary)" : "var(--color-border)"}`,
        color: hovered ? "var(--color-primary)" : "var(--color-body)",
        background: hovered ? "var(--color-primary-light)" : "var(--color-surface)",
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
      }}
    >
      {text}
    </button>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Chat() {
  const { user, profile } = useAuthContext();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const userId = user.id;

  const [ready, setReady] = useState(false);
  const [docs, setDocs] = useState([]);
  const [carePlan, setCarePlan] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [sessionTitle, setSessionTitle] = useState("");
  const [chatLang, setChatLang] = useState(lang); // affects subsequent messages only
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastUserMessage, setLastUserMessage] = useState(null);
  const [focused, setFocused] = useState(false);

  const listRef = useRef(null);
  const inputRef = useRef(null);
  const stickRef = useRef(true); // false once the user scrolls up to read history
  const firstScrollRef = useRef(true);

  const locale = lang === "ta" ? "ta-IN" : "en-IN";

  // Stable identity so `t` changing on language switch doesn't re-run the load
  const failRef = useRef();
  failRef.current = (err) => {
    console.error(err);
    toast.show(t("error"), "error");
  };

  // ── Load documents + today's session ─────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      const [start, end] = todayRange();
      let docRows = [];
      let session = null;
      let history = [];
      let plan = null;

      try {
        const [docsRes, sessionRes, planRes] = await Promise.all([
          supabase
            .from("medical_documents")
            .select("document_text, structured_data, created_at")
            .eq("user_id", userId)
            .order("created_at", { ascending: false }),
          supabase
            .from("chat_sessions")
            .select("*")
            .eq("user_id", userId)
            .gte("created_at", start)
            .lt("created_at", end)
            .order("created_at", { ascending: true })
            .limit(1),
          supabase.from("care_plans").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        if (planRes.error) failRef.current(planRes.error);
        else plan = planRes.data;
        if (docsRes.error) failRef.current(docsRes.error);
        else docRows = docsRes.data;
        if (sessionRes.error) failRef.current(sessionRes.error);
        else session = sessionRes.data[0] ?? null;

        if (session) {
          const { data, error } = await supabase
            .from("chat_messages")
            .select("id, role, content, created_at")
            .eq("session_id", session.id)
            .order("created_at", { ascending: true });
          if (error) failRef.current(error);
          else history = data;
        }
      } catch (err) {
        failRef.current(err);
      }

      if (!alive) return;
      setDocs(docRows);
      setCarePlan(plan);
      if (session) {
        setSessionId(session.id);
        setSessionTitle(session.title ?? "");
      }
      setMessages(history);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // ── Scrolling: follow new messages unless the user scrolled up ───────────
  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_THRESHOLD;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!ready || !el || !stickRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: firstScrollRef.current ? "auto" : "smooth" });
    firstScrollRef.current = false;
  }, [messages, ready]);

  // ── Textarea auto-resize (also resets to min-height when cleared on send) ─
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight excludes the border; add it back so the box isn't a few px too short
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.min(el.scrollHeight + border, 120)}px`;
  }, [input, ready]);

  // ── Sending ──────────────────────────────────────────────────────────────
  const loadingMsg = () => ({ id: tmpId(), role: "assistant", kind: "loading" });

  async function getAnswer(history, sid) {
    let reply = null;
    let errorKey = null;

    try {
      const system = buildSystemPrompt(profile, docs.map((d) => d.document_text), carePlan);
      const promptText =
        system +
        "\n\n" +
        history.map((m) => (m.role === "user" ? "User" : "Assistant") + ": " + m.content).join("\n");

      const raw = await askCareConnect(promptText, chatLang);
      // The model sometimes echoes the "Assistant:" turn label from the prompt
      const cleaned = typeof raw === "string" ? raw.replace(/^\s*Assistant:\s*/i, "").trim() : "";
      if (/^Error:/.test(cleaned)) throw new Error(cleaned);
      if (!cleaned || cleaned === "No response") throw new Error("Empty reply");
      reply = cleaned;
    } catch (err) {
      console.error(err);
      const message = await errorMessage(err);
      errorKey = RETRIABLE.test(message) ? "chatBusy" : "chatFailed";
    }

    if (errorKey) {
      const retriable = errorKey === "chatBusy";
      setMessages((prev) => [
        ...prev.filter((m) => m.kind !== "loading"),
        {
          id: tmpId(),
          role: "assistant",
          kind: "error",
          retriable,
          content: translate(errorKey, chatLang),
          created_at: new Date().toISOString(),
        },
      ]);
      // Keep the message for Retry only when the error is retriable
      if (!retriable) setLastUserMessage(null);
      setLoading(false);
      return;
    }

    setLastUserMessage(null);
    setMessages((prev) => [
      ...prev.filter((m) => m.kind !== "loading"),
      { id: tmpId(), role: "assistant", content: reply, created_at: new Date().toISOString() },
    ]);
    try {
      const { error } = await supabase
        .from("chat_messages")
        .insert({ session_id: sid, user_id: userId, role: "assistant", content: reply });
      if (error) throw error;
    } catch (err) {
      failRef.current(err);
    }
    setLoading(false);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;

    setLastUserMessage(text);
    setInput("");
    setLoading(true);
    stickRef.current = true;

    const userMsg = { id: tmpId(), role: "user", content: text, created_at: new Date().toISOString() };
    const history = [...messages.filter((m) => !isTransient(m)), userMsg];
    setMessages([...history, loadingMsg()]);

    // Create today's session on the first message
    let sid = sessionId;
    if (!sid) {
      const title = text.length > TITLE_CHARS ? text.slice(0, TITLE_CHARS) + "..." : text;
      try {
        const { data, error } = await supabase
          .from("chat_sessions")
          .insert({ user_id: userId, title, language: chatLang })
          .select()
          .single();
        if (error) throw error;
        sid = data.id;
        setSessionId(sid);
        setSessionTitle(data.title ?? title);
      } catch (err) {
        // Nothing can be saved without a session — undo the optimistic send
        failRef.current(err);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id && m.kind !== "loading"));
        setInput(text);
        setLastUserMessage(null);
        setLoading(false);
        return;
      }
    }

    try {
      const { error } = await supabase
        .from("chat_messages")
        .insert({ session_id: sid, user_id: userId, role: "user", content: text });
      if (error) throw error;
    } catch (err) {
      failRef.current(err); // the chat still works, it just won't be saved
    }

    await getAnswer(history, sid);
  }

  // Re-ask using the user message that's already in the conversation (no duplicate bubble)
  async function handleRetry() {
    if (!lastUserMessage || loading || !sessionId) return;
    setLoading(true);
    stickRef.current = true;
    const history = messages.filter((m) => !isTransient(m));
    setMessages([...history, loadingMsg()]);
    await getAnswer(history, sessionId);
  }

  // ── Quick chips ──────────────────────────────────────────────────────────
  const chipLabel = (key, x) => {
    const text = translate(key, chatLang);
    return x === undefined ? text : text.replace("{x}", x);
  };

  const chips = [
    chipLabel("chipMeds"),
    chipLabel("chipFollowUp"),
    chipLabel("chipFood"),
    chipLabel("chipWarning"),
  ];
  const firstData = docs[0]?.structured_data;
  if (firstData?.diagnosis?.[0]) chips[0] = chipLabel("chipAbout", firstData.diagnosis[0]);
  if (firstData?.follow_ups?.[0]) chips[1] = chipLabel("chipWhen", firstData.follow_ups[0]);

  const pickChip = (text) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const canSend = input.trim().length > 0 && !loading;
  const height = isDesktop
    ? "calc(100vh - 64px)"
    : // viewport − header(56) − tab bar(60 + safe area) − main padding(32)
      `calc(100${VH} - 148px - env(safe-area-inset-bottom, 0px))`;

  const langButton = (code, label) => {
    const active = chatLang === code;
    return (
      <button
        key={code}
        type="button"
        onClick={() => setChatLang(code)}
        aria-pressed={active}
        style={{
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          padding: "5px 12px",
          borderRadius: 20,
          border: `1.5px solid ${active ? "var(--color-primary)" : "var(--color-border)"}`,
          background: active ? "var(--color-primary)" : "transparent",
          color: active ? "#fff" : "var(--color-muted)",
          transition: "background 0.15s, color 0.15s, border-color 0.15s",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      style={{
        height,
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg)",
        border: "1px solid var(--color-border)",
        borderRadius: 16,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          padding: "0 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Avatar size={32} fontSize={13} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontWeight: 600, color: "var(--color-heading)" }}>{t("appName")}</span>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
            </div>
            {sessionTitle && (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--color-muted)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {sessionTitle}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {langButton("en", "EN")}
          {langButton("ta", "தமிழ்")}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {!ready ? (
          <>
            <Skeleton height={48} width="60%" borderRadius={16} />
            <div style={{ alignSelf: "flex-end", width: "45%" }}>
              <Skeleton height={40} borderRadius={16} />
            </div>
          </>
        ) : (
          messages.map((m) => (
            <Message
              key={m.id}
              msg={m}
              locale={locale}
              onRetry={handleRetry}
              canRetry={!loading && !!lastUserMessage}
            />
          ))
        )}
      </div>

      {/* Quick chips */}
      {ready && messages.length === 0 && (
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            gap: 8,
            padding: "0 20px 12px",
            overflowX: "auto",
            scrollbarWidth: "none",
          }}
        >
          {chips.map((text) => (
            <Chip key={text} text={text} onClick={() => pickChip(text)} />
          ))}
        </div>
      )}

      {/* Input row */}
      <div
        style={{
          flexShrink: 0,
          background: "var(--color-surface)",
          borderTop: "1px solid var(--color-border)",
          padding: "12px 16px",
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
        }}
      >
        <textarea
          ref={inputRef}
          className="cc-input"
          rows={1}
          value={input}
          placeholder={translate(chatLang === "ta" ? "chatPlaceholderTa" : "chatPlaceholder", chatLang)}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            // isComposing: don't send while an IME (e.g. Tamil) is mid-composition
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            padding: "10px 14px",
            fontSize: 15,
            lineHeight: 1.4,
            resize: "none",
            overflowY: "auto",
            background: "var(--color-bg)",
            color: "var(--color-heading)",
            border: `1.5px solid ${focused ? "var(--color-primary)" : "var(--color-border)"}`,
            borderRadius: 12,
            outline: "none",
            boxShadow: focused ? "0 0 0 3px rgba(74,155,142,0.15)" : "none",
            transition: "border-color 0.2s, box-shadow 0.2s",
          }}
        />
        <SendButton disabled={!canSend} onClick={handleSend} label={t("sendMessage")} />
      </div>
    </div>
  );
}

function SendButton({ disabled, onClick, label }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: "50%",
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        background: hovered && !disabled ? "var(--color-primary-dark)" : "var(--color-primary)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s, opacity 0.15s",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z" />
      </svg>
    </button>
  );
}
