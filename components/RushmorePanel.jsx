"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const VIDEO_SRC = "/api/video";
const STORAGE_KEY = "rushmore-chat-v1";

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

const st = (n) => Math.pow(2, n / 12);
const PITCH = -1.5;

function makeImpulse(ctx, duration, decay) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (c === 0 ? 1 : 0.88);
  }
  return buf;
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
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.playbackRate.value = st(PITCH);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.5;
      analyserNode = analyser;
      const master = ctx.createGain(); master.gain.value = 0.88;
      master.connect(ctx.destination);
      analyser.connect(master);
      const dry = ctx.createGain(); dry.gain.value = 0.7;
      src.connect(analyser); analyser.connect(dry); dry.connect(master);
      const room = ctx.createConvolver(); room.buffer = makeImpulse(ctx, 0.18, 8.0);
      const roomGain = ctx.createGain(); roomGain.gain.value = 0.35;
      src.connect(room); room.connect(roomGain); roomGain.connect(master);
      const cave = ctx.createConvolver(); cave.buffer = makeImpulse(ctx, 1.2, 3.5);
      const caveGain = ctx.createGain(); caveGain.gain.value = 0.18;
      src.connect(cave); cave.connect(caveGain); caveGain.connect(master);
      const e1d = ctx.createDelay(0.065); e1d.delayTime.value = 0.060;
      const e1g = ctx.createGain(); e1g.gain.value = 0.45;
      src.connect(e1d); e1d.connect(e1g);
      const e2d = ctx.createDelay(0.125); e2d.delayTime.value = 0.120;
      const e2g = ctx.createGain(); e2g.gain.value = 0.30;
      e1g.connect(e2d); e2d.connect(e2g);
      const e3d = ctx.createDelay(0.185); e3d.delayTime.value = 0.180;
      const e3g = ctx.createGain(); e3g.gain.value = 0.18;
      e2g.connect(e3d); e3d.connect(e3g);
      const s1d = ctx.createDelay(0.31); s1d.delayTime.value = 0.300;
      const s1g = ctx.createGain(); s1g.gain.value = 0.28;
      src.connect(s1d); s1d.connect(s1g);
      const s2d = ctx.createDelay(0.61); s2d.delayTime.value = 0.600;
      const s2g = ctx.createGain(); s2g.gain.value = 0.14;
      s1g.connect(s2d); s2d.connect(s2g);
      [e1g, e2g, e3g, s1g, s2g].forEach(g => g.connect(master));
      activeSource = src;
      src.start(ctx.currentTime + 0.01);
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
          const parsed = JSON.parse(raw);
          const msgs  = Array.isArray(parsed) ? parsed : parsed.msgs;
          const name  = Array.isArray(parsed) ? null   : parsed.name;
          const first = msgs?.find(m => m.role === "user");
          chats.push({ key, ts, name: name || null, preview: first?.content?.slice(0, 60) || "(empty)", msgs: msgs || [] });
        }
      }
    }
  } catch (_) {}
  return chats.sort((a, b) => b.ts - a.ts);
}

function saveArchived(key, msgs, name) {
  try { localStorage.setItem(key, JSON.stringify({ msgs, name })); } catch (_) {}
}

function PastChatsPanel({ onLoad, onClose }) {
  const [chats, setChats]           = useState(() => loadArchived());
  const [renamingKey, setRenamingKey] = useState(null);
  const [renameVal,   setRenameVal]   = useState("");
  const refresh = () => setChats(loadArchived());
  const doDelete = (key, e) => { e.stopPropagation(); if (!confirm("Delete this chat?")) return; try { localStorage.removeItem(key); } catch (_) {} refresh(); };
  const startRename  = (c, e) => { e.stopPropagation(); setRenamingKey(c.key); setRenameVal(c.name || c.preview.slice(0, 40)); };
  const submitRename = (c, e) => { e.stopPropagation(); saveArchived(c.key, c.msgs, renameVal.trim() || null); setRenamingKey(null); refresh(); };
  return (
    <div className="ai-past-panel" style={{ maxHeight: 220 }}>
      <div className="ai-past-header">
        <span className="ai-past-title">PAST CHATS</span>
        <button className="ai-past-close" onClick={onClose}>×</button>
      </div>
      {chats.length === 0
        ? <div className="ai-past-empty">No archived chats.</div>
        : <div className="ai-past-list">
            {chats.map(c => (
              <div key={c.key} className="ai-past-row">
                <button className="ai-past-item" onClick={() => onLoad(c.msgs)}>
                  <span className="ai-past-date">{new Date(c.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  {renamingKey === c.key ? (
                    <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
                      <input className="ai-past-rename-input" value={renameVal} onChange={e => setRenameVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") submitRename(c, e); if (e.key === "Escape") setRenamingKey(null); }} autoFocus />
                      <button className="ai-past-rename-ok" onClick={e => submitRename(c, e)}>OK</button>
                    </div>
                  ) : (
                    <span className="ai-past-preview">{c.name || c.preview}</span>
                  )}
                </button>
                <button className="ai-past-action" onClick={e => startRename(c, e)} title="Rename">✎</button>
                <button className="ai-past-action ai-past-del" onClick={e => doDelete(c.key, e)} title="Delete">×</button>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

const BOOT_MSG = { role: "assistant", content: "RUSHMORE online \u2014 ask me anything. Search, research, recent events, quick answers." };

export const MODES = []; // No project modes — general only

export default function RushmorePanel() {
  const [messages,    setMessages]  = useState(() => { try { const s = localStorage.getItem(STORAGE_KEY); if (s) { const p = JSON.parse(s); if (Array.isArray(p) && p.length) return p; } } catch (_) {} return [BOOT_MSG]; });
  const [input,       setInput]     = useState("");
  const [loading,     setLoading]   = useState(false);
  const [voiceOut,    setVoiceOut]  = useState(false); // voice OFF by default
  const [listening,   setListening] = useState(false);
  const [speaking,    setSpeaking]  = useState(false);
  const [usage,       setUsage]     = useState({ inTok: 0, outTok: 0, calls: 0 });
  const [showHistory, setShowHistory] = useState(false);

  const voiceOutRef    = useRef(false);
  const continuousRef  = useRef(false);
  const recognitionRef = useRef(null);
  const messagesRef    = useRef(messages);
  const flashRef       = useRef(null);
  const dataArrRef     = useRef(null);
  const videoRef       = useRef(null);

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

  function archiveCurrent() {
    try { const arc = localStorage.getItem(STORAGE_KEY); if (arc) localStorage.setItem(`${STORAGE_KEY}-${Date.now()}`, arc); localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    try { recognitionRef.current?.abort(); } catch (_) {}
    const rec = new SR(); rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart = () => setListening(true); rec.onend = () => setListening(false);
    rec.onerror = (e) => { console.warn("SR", e.error); setListening(false); };
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) sendWith(messagesRef.current, t); };
    recognitionRef.current = rec; try { rec.start(); } catch (e) { console.warn(e); }
  }, []); // eslint-disable-line

  const stopListening = useCallback(() => {
    continuousRef.current = false;
    try { recognitionRef.current?.abort(); } catch (_) {}
    setListening(false);
  }, []);

  const sendWith = async (currentMessages, text) => {
    const content = text.trim(); if (!content || loading) return;
    const history = [...currentMessages, { role: "user", content }];
    setMessages(history); setLoading(true);
    try {
      const body = { messages: history.map(m => ({ role: m.role, content: m.content })) };
      const res  = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
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
    } catch (err) { setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]); }
    finally { setLoading(false); }
  };

  const sendMessage  = () => { const c = input.trim(); if (!c || loading) return; setInput(""); sendWith(messagesRef.current, c); };
  const handleEdit   = (i, nc) => { const fi = messages.length - 1 - i; sendWith(messages.slice(0, fi), nc); };
  const handleReplay = (c) => { if (speaking) return; setSpeaking(true); speakRaw(c, () => setSpeaking(false)); };
  const handleKey    = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const toggleMic    = () => { if (continuousRef.current) { stopListening(); } else { continuousRef.current = true; startListening(); } };
  const toggleVoice  = () => { const nv = !voiceOut; setVoiceOut(nv); voiceOutRef.current = nv; if (!nv) stopSpeech(); };
  const newChat  = () => { stopSpeech(); stopListening(); archiveCurrent(); setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); };
  const clearAll = () => { stopSpeech(); stopListening(); setVoiceOut(false); voiceOutRef.current = false; setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} };
  const loadPast = (msgs) => { setMessages(msgs); setShowHistory(false); };

  const cost     = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;
  const reversed = [...messages].reverse();

  return (
    <div className="rp-shell">
      <div className="rp-video-col">
        <div className="rp-video-box">
          <video ref={videoRef} src={VIDEO_SRC} autoPlay loop muted playsInline className="rp-video" />
          <div ref={flashRef} className="rp-flash" />
        </div>
        <div className="rp-status">
          <span className="ai-status-dot" />
          <span className="rp-mode-label">RUSHMORE</span>
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
      <div className="rp-chat-col">
        <div className="rp-toolbar">
          <button className={`rp-mic-btn${listening ? " listening" : continuousRef.current ? " continuous" : ""}`} onPointerDown={toggleMic} title="Microphone">
            {listening ? "\u25cf" : continuousRef.current ? "\u25ce" : "\u25cb"}
          </button>
          <button className={`rp-voice-btn${voiceOut ? " active" : ""}`} onClick={toggleVoice} title={voiceOut ? "Mute voice" : "Unmute voice"}>
            {voiceOut ? "\u25c9" : "\u25cb"}
          </button>
          <div style={{ flex: 1 }} />
          <button className="ai-ctrl-btn" onClick={() => setShowHistory(p => !p)}>HISTORY</button>
          <button className="ai-ctrl-btn" onClick={newChat}>+ NEW</button>
          <button className="ai-ctrl-btn" onClick={clearAll}>CLEAR</button>
        </div>
        {showHistory && <PastChatsPanel onLoad={loadPast} onClose={() => setShowHistory(false)} />}
        <div className="rp-input-row">
          <textarea className="ai-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={listening ? "Listening\u2026" : speaking ? "Speaking\u2026" : "Ask RUSHMORE anything\u2026"}
            rows={1} spellCheck={false} />
          <button className="ai-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>SEND</button>
        </div>
        <div className="rp-feed">
          {loading && <div className="ai-msg ai-msg-rushmore"><div className="ai-msg-label">RUSHMORE</div><div className="ai-msg-bubble"><TypingDots /></div></div>}
          {reversed.map((msg, i) => <Message key={i} msg={msg} index={i} onEdit={handleEdit} onReplay={handleReplay} speaking={speaking} />)}
        </div>
      </div>
    </div>
  );
}
