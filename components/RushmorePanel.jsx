"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const VIDEO_SRC = "/api/video";
const STORAGE_KEY = "rushmore-chat-v1";

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

let audioCtx     = null;
let analyserNode = null;
let activeSource = null;

function getCtx() {
  if (!audioCtx || audioCtx.state === "closed")
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

async function speakRaw(text, onDone) {
  if (typeof window === "undefined") return;
  try { activeSource?.stop(); } catch (_) {}
  activeSource = null;
  window.speechSynthesis?.cancel();
  const clean = text.replace(/[#*`_~\[\]()>]/g, "").replace(/\n+/g, " ").trim();
  try {
    const res = await fetch("/api/tts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });
    if (res.ok) {
      const ctx     = getCtx();
      const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.5;
      analyserNode = analyser;
      analyser.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = decoded; src.connect(analyser);
      src.start(ctx.currentTime + 0.01);
      activeSource = src;
      src.onended = () => { analyserNode = null; activeSource = null; onDone?.(); };
      return;
    }
  } catch (_) {}
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find(v => /google uk english male/i.test(v.name)) || voices.find(v => v.lang === "en-GB") || voices.find(v => v.lang.startsWith("en"));
  if (pref) utt.voice = pref;
  utt.onend = () => onDone?.(); utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  try { activeSource?.stop(); } catch (_) {}
  activeSource = null; analyserNode = null;
  window.speechSynthesis?.cancel();
}

function useTVFlash(flashRef, dataArr) {
  const rafRef = useRef(null);
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!flashRef.current) return;
      if (!analyserNode) { flashRef.current.style.opacity = "0"; return; }
      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount)
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArr.current);
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255;
      const active = Math.max(0, rms - 0.04);
      if (active <= 0) { flashRef.current.style.opacity = "0"; return; }
      flashRef.current.style.opacity = Math.min(1, active * 4.0).toFixed(3);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [flashRef, dataArr]);
}

function TypingDots() { return <div className="ai-typing"><span /><span /><span /></div>; }

function Message({ msg, onEdit, onReplay, speaking, index }) {
  const isUser = msg.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(msg.content);
  const submitEdit = () => { if (draft.trim() && draft.trim() !== msg.content) onEdit(index, draft.trim()); setEditing(false); };
  return (
    <div className={`ai-msg ${isUser ? "ai-msg-user" : "ai-msg-rushmore"}`}>
      {!isUser && <div className="ai-msg-label">RUSHMORE</div>}
      {editing ? (
        <div className="ai-msg-edit">
          <textarea className="ai-msg-edit-area" value={draft} onChange={e => setDraft(e.target.value)} autoFocus rows={3} />
          <div className="ai-msg-edit-btns">
            <button className="ai-edit-save" onClick={submitEdit}>Resend</button>
            <button className="ai-edit-cancel" onClick={() => { setDraft(msg.content); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="ai-msg-bubble-wrap">
          <div className="ai-msg-bubble">
            {msg.content.split("\n").map((line, i) => <p key={i} style={{ margin: line === "" ? "6px 0 0" : "0" }}>{line}</p>)}
          </div>
          <div className="ai-msg-actions">
            {isUser && <button className="ai-msg-action-btn" onClick={() => setEditing(true)}>✎</button>}
            {!isUser && <button className={`ai-msg-action-btn${speaking ? " disabled" : ""}`} onClick={() => !speaking && onReplay(msg.content)}>&#9654;</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function loadArchived() {
  if (typeof window === "undefined") return [];
  const chats = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(STORAGE_KEY + "-")) {
        const ts  = parseInt(key.replace(STORAGE_KEY + "-", ""), 10);
        const raw = localStorage.getItem(key);
        if (raw) {
          const msgs = JSON.parse(raw);
          const first = msgs.find(m => m.role === "user");
          chats.push({ key, ts, preview: first?.content?.slice(0, 60) || "(empty)", msgs });
        }
      }
    }
  } catch (_) {}
  return chats.sort((a, b) => b.ts - a.ts);
}

const BOOT_MSG = {
  role: "assistant",
  content: "RUSHMORE online. General mode — ask me anything, or activate a project mode below.",
};

function bootMsg(mode) {
  if (!mode) return BOOT_MSG;
  return { role: "assistant", content: `${mode} mode active. Reading project instructions\u2026` };
}

// Mode definitions: label shown on button, GitHub owner/repo/path for context file
export const MODES = [
  { id: "geocomforter", label: "GeoComforter", owner: "GeoAltaSolutions", repo: "GeoComforter-QuestLog", path: "README.md" },
  { id: "chronoslate",  label: "ChronoSlate",  owner: "GeoAltaSolutions", repo: "ChronoSlate-QuestLog",  path: "README.md" },
  { id: "geoalta",      label: "GeoAlta",      owner: "GeoAltaSolutions", repo: "GeoAlta-QuestLog",      path: "README.md" },
  { id: "nmgco",        label: "NMGCO",        owner: "GeoAltaSolutions", repo: "NMGCO-QuestLog",        path: "README.md" },
  { id: "riipen",       label: "Riipen",       owner: "GeoAltaSolutions", repo: "GeoComforter-QuestLog", path: "Riipen/README.md" },
];

export default function RushmorePanel({ activeMode, onModeChange }) {
  const [messages,      setMessages]  = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; } } catch (_) {} return [BOOT_MSG]; });
  const [input,         setInput]     = useState("");
  const [loading,       setLoading]   = useState(false);
  const [voiceOut,      setVoiceOut]  = useState(true);
  const [listening,     setListening] = useState(false);
  const [speaking,      setSpeaking]  = useState(false);
  const [usage,         setUsage]     = useState({ inTok: 0, outTok: 0, calls: 0 });
  const [showHistory,   setShowHistory] = useState(false);
  const [modeLoading,   setModeLoading] = useState(false);
  const [modeContext,   setModeContext] = useState(null); // fetched md content

  const voiceOutRef   = useRef(true);
  const continuousRef = useRef(false);
  const messagesRef   = useRef(messages);
  const flashRef      = useRef(null);
  const dataArrRef    = useRef(null);
  const videoRef      = useRef(null);

  useTVFlash(flashRef, dataArrRef);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch (_) {} }, [messages]);
  useEffect(() => { voiceOutRef.current = voiceOut; }, [voiceOut]);

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    v.addEventListener("canplay", tryPlay); tryPlay();
    return () => v.removeEventListener("canplay", tryPlay);
  }, []);

  // When activeMode changes (from parent), fetch context and reset chat
  useEffect(() => {
    if (!activeMode) {
      setModeContext(null);
      return;
    }
    const def = MODES.find(m => m.id === activeMode);
    if (!def) return;
    setModeLoading(true);
    setModeContext(null);
    // Archive current chat
    try {
      const arc = localStorage.getItem(STORAGE_KEY);
      if (arc) localStorage.setItem(`${STORAGE_KEY}-${Date.now()}`, arc);
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    const start = bootMsg(def.label);
    setMessages([start]);
    setUsage({ inTok: 0, outTok: 0, calls: 0 });

    fetch(`/api/github-context?owner=${def.owner}&repo=${def.repo}&path=${encodeURIComponent(def.path)}`)
      .then(r => r.json())
      .then(d => {
        setModeContext(d.content || "");
        setMessages([{ role: "assistant", content: `${def.label} mode active. I've loaded the project instructions from ${def.repo}. What do you need?` }]);
      })
      .catch(() => {
        setModeContext("");
        setMessages([{ role: "assistant", content: `${def.label} mode active. (Couldn't fetch context file — working from memory.)` }]);
      })
      .finally(() => setModeLoading(false));
  }, [activeMode]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try { recognitionRef.current?.abort(); } catch (_) {}
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = (e) => { console.warn("SR", e.error); setListening(false); };
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) sendWith(messagesRef.current, t); };
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn(e); }
  }, []); // eslint-disable-line

  const recognitionRef = useRef(null);

  const stopListening = useCallback(() => {
    continuousRef.current = false;
    try { recognitionRef.current?.abort(); } catch (_) {}
    setListening(false);
  }, []);

  const sendWith = async (currentMessages, text) => {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg = { role: "user", content };
    const history = [...currentMessages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      const body = { messages: history.map(m => ({ role: m.role, content: m.content })) };
      if (activeMode) { body.mode = activeMode; body.modeContext = modeContext || ""; }
      const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      // Extract text from content blocks (web search returns multiple blocks)
      const reply = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || data.error?.message || "[No response]";
      const updated = [...history, { role: "assistant", content: reply }];
      setMessages(updated);
      if (data.usage) setUsage(prev => ({ inTok: prev.inTok + (data.usage.input_tokens||0), outTok: prev.outTok + (data.usage.output_tokens||0), calls: prev.calls + 1 }));
      if (voiceOutRef.current) {
        setSpeaking(true);
        speakRaw(reply, () => { setSpeaking(false); if (continuousRef.current) setTimeout(() => { if (continuousRef.current) startListening(); }, 400); });
      } else {
        if (continuousRef.current) setTimeout(() => { if (continuousRef.current) startListening(); }, 400);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const sendMessage = () => { const c = input.trim(); if (!c || loading) return; setInput(""); sendWith(messagesRef.current, c); };
  const handleEdit  = (i, nc) => { const fi = messages.length - 1 - i; sendWith(messages.slice(0, fi), nc); };
  const handleReplay = (c) => { if (speaking) return; setSpeaking(true); speakRaw(c, () => setSpeaking(false)); };
  const handleKey   = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const toggleMic   = () => { if (continuousRef.current) { stopListening(); } else { continuousRef.current = true; startListening(); } };
  const toggleVoice = () => { if (voiceOut) { setVoiceOut(false); stopSpeech(); } else setVoiceOut(true); voiceOutRef.current = !voiceOut; };

  const newChat = () => {
    stopSpeech(); stopListening(); onModeChange(null);
    try { const arc = localStorage.getItem(STORAGE_KEY); if (arc) localStorage.setItem(`${STORAGE_KEY}-${Date.now()}`, arc); localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); setModeContext(null);
  };
  const clearAll = () => {
    stopSpeech(); stopListening(); onModeChange(null); setVoiceOut(true); voiceOutRef.current = true;
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); setModeContext(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  };
  const loadPast = (msgs) => { setMessages(msgs); setShowHistory(false); };

  const cost = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;
  const reversed = [...messages].reverse();
  const modeDef = MODES.find(m => m.id === activeMode);

  return (
    <div className="rp-shell">
      {/* ── Video column ── */}
      <div className="rp-video-col">
        <div className="rp-video-box">
          <video ref={videoRef} src={VIDEO_SRC} autoPlay loop muted playsInline className="rp-video" />
          <div ref={flashRef} className="rp-flash" />
        </div>
        {/* Status */}
        <div className="rp-status">
          <span className="ai-status-dot" />
          {modeLoading
            ? <span className="rp-mode-label">Loading\u2026</span>
            : modeDef
              ? <span className="rp-mode-label" style={{ color: "var(--orange)" }}>{modeDef.label.toUpperCase()}</span>
              : <span className="rp-mode-label">GENERAL</span>
          }
          {speaking  && <span className="ai-speaking-label">&#9654;</span>}
          {listening && <span className="ai-listening-label">&#9679;</span>}
        </div>
        {totalTok > 0 && (
          <div className="rp-usage">
            <span>{totalTok.toLocaleString()} tok</span>
            <span style={{ color: "var(--orange)" }}>${cost.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* ── Chat column ── */}
      <div className="rp-chat-col">
        {/* Toolbar */}
        <div className="rp-toolbar">
          <div className="ai-voice-btns" style={{ flexDirection: "row", gap: 6 }}>
            <button className={`ai-mic-btn${listening ? " listening" : continuousRef.current ? " continuous" : ""}`} onPointerDown={toggleMic} style={{ width: 28, height: 28, fontSize: 13 }}>
              {listening ? "\u25cf" : continuousRef.current ? "\u25ce" : "\u25cb"}
            </button>
            <button className={`ai-voice-out-btn${voiceOut ? " active" : ""}`} onClick={toggleVoice}>
              {voiceOut ? "\u25c9" : "\u25cb"}
            </button>
          </div>
          <div style={{ flex: 1 }} />
          <button className="ai-ctrl-btn" onClick={() => setShowHistory(p => !p)}>HISTORY</button>
          <button className="ai-ctrl-btn" onClick={newChat}>+ NEW</button>
          <button className="ai-ctrl-btn" onClick={clearAll}>CLEAR</button>
        </div>

        {showHistory && (
          <div className="ai-past-panel" style={{ maxHeight: 180 }}>
            <div className="ai-past-header">
              <span className="ai-past-title">PAST CHATS</span>
              <button className="ai-past-close" onClick={() => setShowHistory(false)}>×</button>
            </div>
            {loadArchived().length === 0
              ? <div className="ai-past-empty">No archived chats.</div>
              : <div className="ai-past-list">
                  {loadArchived().map(c => (
                    <div key={c.key} className="ai-past-row">
                      <button className="ai-past-item" onClick={() => loadPast(c.msgs)}>
                        <span className="ai-past-date">{new Date(c.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="ai-past-preview">{c.preview}</span>
                      </button>
                    </div>
                  ))}
                </div>
            }
          </div>
        )}

        {/* Input */}
        <div className="rp-input-row">
          <textarea className="ai-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={modeLoading ? "Loading mode\u2026" : listening ? "Listening\u2026" : speaking ? "Speaking\u2026" : "Command RUSHMORE\u2026"}
            rows={1} spellCheck={false} disabled={modeLoading} />
          <button className="ai-send-btn" onClick={sendMessage} disabled={loading || modeLoading || !input.trim()}>SEND</button>
        </div>

        {/* Feed */}
        <div className="rp-feed">
          {loading && <div className="ai-msg ai-msg-rushmore"><div className="ai-msg-label">RUSHMORE</div><div className="ai-msg-bubble"><TypingDots /></div></div>}
          {reversed.map((msg, i) => <Message key={i} msg={msg} index={i} onEdit={handleEdit} onReplay={handleReplay} speaking={speaking} />)}
        </div>
      </div>
    </div>
  );
}
