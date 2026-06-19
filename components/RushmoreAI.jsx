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

// ── Voice tuning ────────────────────────────────────────────────────────────
// 0.64 = two successive 20% slowdowns (0.8 × 0.8).
// PITCH_COMP raises semitones to keep perceived pitch matching original.
// log2(0.64) × 12 ≈ −7.274 st drop from speed alone; we compensate +3.864
// from the first pass and let the second 0.8× naturally lower pitch further
// (gives that deep Overmind quality without going fully unintelligible).
const SLOW       = 0.64;
const PITCH_COMP = 3.864;

const BASE    = -2.39 + PITCH_COMP; // main voice
const UNDER   = BASE  - 1.5;        // dark sub-layer
const PIT_DN1 = BASE  - 2.5;        // deeper harmonic

// ── Reverb impulse (cave/cathedral feel) ───────────────────────────────────
function makeImpulse(ctx, duration, decay) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (c === 0 ? 1 : 0.92);
  }
  return buf;
}

function makeSatCurve(amount = 8) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

let audioCtx      = null;
let analyserNode  = null;
let activeSources = [];

function getCtx() {
  if (!audioCtx || audioCtx.state === "closed")
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function makeSource(ctx, decoded, semitones) {
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = st(semitones) * SLOW;
  activeSources.push(src);
  return src;
}

async function speakWithFX(text, onDone) {
  if (typeof window === "undefined") return;
  activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
  activeSources = [];
  window.speechSynthesis?.cancel();

  const clean = text.replace(/[#*`_~\[\]()>]/g, "").replace(/\n+/g, " ").trim();

  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });

    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      const ctx      = getCtx();
      const decoded  = await ctx.decodeAudioData(arrayBuf);

      // ── Three voice layers: main, dark sub, deep harmonic ────────────────
      const srcMain  = makeSource(ctx, decoded, BASE);
      const srcUnder = makeSource(ctx, decoded, UNDER);
      const srcDn1   = makeSource(ctx, decoded, PIT_DN1);

      // ── EQ chain on main voice ───────────────────────────────────────────
      // Scoop mids, boost lows and presence — dark telepathic character
      const hiPass   = ctx.createBiquadFilter();
      hiPass.type = "highpass"; hiPass.frequency.value = 80; hiPass.Q.value = 0.7;

      const lowBoost = ctx.createBiquadFilter();
      lowBoost.type = "lowshelf"; lowBoost.frequency.value = 200; lowBoost.gain.value = 4;

      const midScoop = ctx.createBiquadFilter();
      midScoop.type = "peaking"; midScoop.frequency.value = 900;
      midScoop.Q.value = 1.0; midScoop.gain.value = -6;

      const presence = ctx.createBiquadFilter();
      presence.type = "peaking"; presence.frequency.value = 3200;
      presence.Q.value = 1.2; presence.gain.value = 4;

      hiPass.connect(lowBoost); lowBoost.connect(midScoop); midScoop.connect(presence);

      // Light saturation for grit
      const sat = ctx.createWaveShaper();
      sat.curve = makeSatCurve(8); sat.oversample = "2x";
      presence.connect(sat);

      // Compressor to glue it
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 6;
      comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.15;
      sat.connect(comp);

      // Post-comp bus — everything wet/dry hangs off this
      const bus = ctx.createGain(); bus.gain.value = 1.0;
      comp.connect(bus);

      // ── Analyser for the TV flash ────────────────────────────────────────
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.5;
      analyserNode = analyser;
      bus.connect(analyser);

      // ── Master output ────────────────────────────────────────────────────
      const master = ctx.createGain(); master.gain.value = 0.85;
      master.connect(ctx.destination);
      analyser.connect(master);

      // ── Dry voice ────────────────────────────────────────────────────────
      const dryGain = ctx.createGain(); dryGain.gain.value = 0.7;
      bus.connect(dryGain); dryGain.connect(master);

      // ── Cave reverb (long, dark) ─────────────────────────────────────────
      const cave = ctx.createConvolver();
      cave.buffer = makeImpulse(ctx, 2.8, 2.5); // long decay, slow rolloff
      const caveGain = ctx.createGain(); caveGain.gain.value = 0.55;
      bus.connect(cave); cave.connect(caveGain); caveGain.connect(master);

      // ── Distinct spaced echo repeats ─────────────────────────────────────
      // Each is clearly audible — Overmind-style "I am here... here... here"
      // Six layers, each feeding the next (true echo-on-echo cascade).
      // High gains so you actually HEAR each repeat.
      const makeDelay = (dt) => {
        const d = ctx.createDelay(dt + 0.01);
        d.delayTime.value = dt;
        return d;
      };

      const d1 = makeDelay(0.30); const g1 = ctx.createGain(); g1.gain.value = 0.60;
      bus.connect(d1); d1.connect(g1);

      const d2 = makeDelay(0.30); const g2 = ctx.createGain(); g2.gain.value = 0.50;
      g1.connect(d2); d2.connect(g2);

      const d3 = makeDelay(0.30); const g3 = ctx.createGain(); g3.gain.value = 0.40;
      g2.connect(d3); d3.connect(g3);

      const d4 = makeDelay(0.30); const g4 = ctx.createGain(); g4.gain.value = 0.30;
      g3.connect(d4); d4.connect(g4);

      const d5 = makeDelay(0.30); const g5 = ctx.createGain(); g5.gain.value = 0.20;
      g4.connect(d5); d5.connect(g5);

      const d6 = makeDelay(0.30); const g6 = ctx.createGain(); g6.gain.value = 0.12;
      g5.connect(d6); d6.connect(g6);

      // Each echo also gets cave reverb so each repeat sounds distant
      [g1, g2, g3, g4, g5, g6].forEach(g => g.connect(master));

      // ── Sub-layer (pitched down) — low rumble underneath ─────────────────
      const subLow = ctx.createBiquadFilter();
      subLow.type = "lowpass"; subLow.frequency.value = 3000;
      const subGain = ctx.createGain(); subGain.gain.value = 0.30;

      // ── Deep harmonic layer ──────────────────────────────────────────────
      const deepLow = ctx.createBiquadFilter();
      deepLow.type = "lowpass"; deepLow.frequency.value = 2000;
      const deepGain = ctx.createGain(); deepGain.gain.value = 0.20;

      // ── Stereo width on echo tail ────────────────────────────────────────
      const panL = ctx.createStereoPanner(); panL.pan.value = -0.5;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.5;
      g2.connect(panL); panL.connect(master);
      g3.connect(panR); panR.connect(master);

      // ── Wire sub and deep layers ─────────────────────────────────────────
      srcUnder.connect(subLow); subLow.connect(subGain); subGain.connect(master);
      srcDn1.connect(deepLow); deepLow.connect(deepGain); deepGain.connect(master);

      // ── Start everything ─────────────────────────────────────────────────
      srcMain.connect(hiPass);
      const t = ctx.currentTime + 0.01;
      srcMain.start(t); srcUnder.start(t); srcDn1.start(t);

      let ended = false;
      srcMain.onended = () => {
        if (!ended) { ended = true; analyserNode = null; activeSources = []; onDone?.(); }
      };
      return;
    }
  } catch (_) {}

  // Fallback: browser TTS
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(v => /google uk english male/i.test(v.name)) ||
    voices.find(v => /microsoft george/i.test(v.name)) ||
    voices.find(v => /daniel/i.test(v.name)) ||
    voices.find(v => v.lang === "en-GB") ||
    voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.75; utt.pitch = 0.6; utt.volume = 1;
  utt.onend = () => onDone?.(); utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
  activeSources = []; analyserNode = null;
  window.speechSynthesis?.cancel();
}

// ── Green TV flash ──────────────────────────────────────────────────────────
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

function Message({ msg, index, onEdit, onReplay, speaking }) {
  const isUser = msg.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(msg.content);
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
            {msg.content.split("\n").map((line, i) => (<p key={i} style={{ margin: line === "" ? "6px 0 0" : "0" }}>{line}</p>))}
          </div>
          <div className="ai-msg-actions">
            {isUser && <button className="ai-msg-action-btn" onClick={() => setEditing(true)} title="Edit & resend">✎</button>}
            {!isUser && <button className={`ai-msg-action-btn${speaking ? " disabled" : ""}`} onClick={() => !speaking && onReplay(msg.content)} title="Replay">&#9654;</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function loadArchivedChats() {
  if (typeof window === "undefined") return [];
  const chats = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_KEY + "-")) {
        const ts = parseInt(key.replace(STORAGE_KEY + "-", ""), 10);
        const raw = localStorage.getItem(key);
        if (raw) {
          const msgs = JSON.parse(raw);
          const firstUser = msgs.find(m => m.role === "user");
          chats.push({ key, ts, preview: firstUser?.content?.slice(0, 60) || "(empty)", msgs });
        }
      }
    }
  } catch (_) {}
  return chats.sort((a, b) => b.ts - a.ts);
}

function PastChatsPanel({ onLoad, onClose }) {
  const [chats, setChats] = useState(() => loadArchivedChats());
  const deleteChat = (key, e) => {
    e.stopPropagation();
    try { localStorage.removeItem(key); } catch (_) {}
    setChats(prev => prev.filter(c => c.key !== key));
  };
  return (
    <div className="ai-past-panel">
      <div className="ai-past-header">
        <span className="ai-past-title">PAST CHATS</span>
        <button className="ai-past-close" onClick={onClose}>×</button>
      </div>
      {chats.length === 0 ? (
        <div className="ai-past-empty">No archived chats yet.</div>
      ) : (
        <div className="ai-past-list">
          {chats.map(c => (
            <div key={c.key} className="ai-past-row">
              <button className="ai-past-item" onClick={() => onLoad(c.msgs)}>
                <span className="ai-past-date">{new Date(c.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="ai-past-preview">{c.preview}</span>
              </button>
              <button className="ai-past-delete" onClick={(e) => deleteChat(c.key, e)} title="Delete">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const BOOT_MSG = {
  role: "assistant",
  content: "RUSHMORE online. All systems nominal.\n\nI have full context on GeoAlta, GeoComforter, ChronoSlate, NMGCO, The Order, and TheGame. GitHub actions and Microsoft Graph are not yet wired \u2014 everything else, ask away."
};

function loadHistory() {
  if (typeof window === "undefined") return [BOOT_MSG];
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
  } catch (_) {}
  return [BOOT_MSG];
}

export default function RushmoreAI() {
  const [messages,      setMessages]      = useState(() => loadHistory());
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [voiceOut,      setVoiceOut]      = useState(true);
  const [listening,     setListening]     = useState(false);
  const [speaking,      setSpeaking]      = useState(false);
  const [usage,         setUsage]         = useState({ inTok: 0, outTok: 0, calls: 0 });
  const [showPastChats, setShowPastChats] = useState(false);
  const recognitionRef = useRef(null);
  const voiceOutRef    = useRef(true);
  const continuousRef  = useRef(false);
  const messagesRef    = useRef(messages);
  const flashRef       = useRef(null);
  const dataArrRef     = useRef(null);
  const videoRef       = useRef(null);

  useTVFlash(flashRef, dataArrRef);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages)); } catch (_) {} }, [messages]);
  useEffect(() => { voiceOutRef.current = voiceOut; }, [voiceOut]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => v.play().catch(() => {});
    v.addEventListener("canplay", tryPlay);
    tryPlay();
    return () => v.removeEventListener("canplay", tryPlay);
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try { recognitionRef.current?.abort(); } catch (_) {}
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = (e) => { console.warn("SR", e.error); setListening(false); };
    rec.onresult = (e) => { const transcript = e.results[0]?.[0]?.transcript; if (transcript) sendMessageWith(messagesRef.current, transcript); };
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn("SR start", e); }
  }, []); // eslint-disable-line

  const stopListening = useCallback(() => {
    continuousRef.current = false;
    try { recognitionRef.current?.abort(); } catch (_) {}
    setListening(false);
  }, []);

  const sendMessageWith = async (currentMessages, text) => {
    const content = text.trim();
    if (!content || loading) return;
    const userMsg = { role: "user", content };
    const history = [...currentMessages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }) });
      const data  = await res.json();
      const reply = data.content?.[0]?.text || data.error?.message || "[No response]";
      const updated = [...history, { role: "assistant", content: reply }];
      setMessages(updated);
      if (data.usage) setUsage(prev => ({ inTok: prev.inTok + (data.usage.input_tokens||0), outTok: prev.outTok + (data.usage.output_tokens||0), calls: prev.calls + 1 }));
      if (voiceOutRef.current) {
        setSpeaking(true);
        speakWithFX(reply, () => { setSpeaking(false); if (continuousRef.current) setTimeout(() => { if (continuousRef.current) startListening(); }, 400); });
      } else {
        if (continuousRef.current) setTimeout(() => { if (continuousRef.current) startListening(); }, 400);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const sendMessage  = () => { const c = input.trim(); if (!c || loading) return; setInput(""); sendMessageWith(messagesRef.current, c); };
  const handleEdit   = (i, nc) => { const fi = messages.length - 1 - i; sendMessageWith(messages.slice(0, fi), nc); };
  const handleReplay = (c) => { if (speaking) return; setSpeaking(true); speakWithFX(c, () => setSpeaking(false)); };

  const resetAll = () => {
    stopSpeech(); stopListening(); setVoiceOut(true); voiceOutRef.current = true;
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 });
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
  };
  const newChat = () => {
    stopSpeech(); stopListening();
    try { const arc = localStorage.getItem(STORAGE_KEY); if (arc) localStorage.setItem(`${STORAGE_KEY}-${Date.now()}`, arc); localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 });
  };
  const loadPastChat = (msgs) => { setMessages(msgs); setShowPastChats(false); };
  const toggleVoice  = () => { if (voiceOut) { setVoiceOut(false); stopSpeech(); } else { setVoiceOut(true); } };
  const handleKey    = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const toggleMic    = () => { if (continuousRef.current) { stopListening(); } else { continuousRef.current = true; startListening(); } };

  const cost = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;
  const reversed = [...messages].reverse();

  return (
    <div className="ai-shell">
      <div className="ai-video-strip">
        <div className="ai-video-sticky">
          <video ref={videoRef} src={VIDEO_SRC} autoPlay loop muted playsInline className="ai-video-main" />
          <div
            ref={flashRef}
            style={{
              position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
              mixBlendMode: "screen",
              background: "radial-gradient(ellipse at center, rgba(80,255,80,0.55) 0%, rgba(40,200,40,0.30) 50%, transparent 80%)",
              boxShadow: "0 0 50px 16px rgba(60,220,60,0.45), 0 0 100px 32px rgba(60,220,60,0.18)",
              zIndex: 3,
            }}
          />
        </div>
      </div>

      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-status-dot" />
          <span className="ai-online-label">ONLINE</span>
          {totalTok > 0 && (
            <span className="ai-usage">
              <span className="ai-usage-tok">{totalTok.toLocaleString()} tok</span>
              <span className="ai-usage-sep">&middot;</span>
              <span className="ai-usage-cost">${cost.toFixed(4)}</span>
              <span className="ai-usage-sep">&middot;</span>
              <span className="ai-usage-calls">{usage.calls} msg{usage.calls !== 1 ? "s" : ""}</span>
            </span>
          )}
          {speaking  && <span className="ai-speaking-label">&#9654; SPEAKING</span>}
          {listening && <span className="ai-listening-label">&#9679; LISTENING</span>}
        </div>
        <div className="ai-header-right">
          <button className="ai-ctrl-btn" onClick={() => setShowPastChats(p => !p)}>HISTORY</button>
          <button className="ai-ctrl-btn" onClick={newChat}>+ NEW</button>
          <button className="ai-ctrl-btn" onClick={resetAll}>CLEAR</button>
        </div>
      </div>

      {showPastChats && <PastChatsPanel onLoad={loadPastChat} onClose={() => setShowPastChats(false)} />}

      <div className="ai-input-bar">
        <div className="ai-voice-btns">
          <button
            className={`ai-mic-btn${listening ? " listening" : continuousRef.current ? " continuous" : ""}`}
            onPointerDown={toggleMic}
          >
            {listening ? "\u25cf" : continuousRef.current ? "\u25ce" : "\u25cb"}
          </button>
          <button className={`ai-voice-out-btn${voiceOut ? " active" : ""}`} onClick={toggleVoice}>
            {voiceOut ? "\u25c9" : "\u25cb"}
          </button>
        </div>
        <textarea className="ai-textarea" value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
          placeholder={listening ? "Listening..." : speaking ? "RUSHMORE speaking..." : "Command RUSHMORE..."}
          rows={1} spellCheck={false} />
        <button className="ai-send-btn" onClick={sendMessage} disabled={loading || !input.trim()}>SEND</button>
      </div>

      <div className="ai-feed">
        {loading && (<div className="ai-msg ai-msg-rushmore"><div className="ai-msg-label">RUSHMORE</div><div className="ai-msg-bubble"><TypingDots /></div></div>)}
        {reversed.map((msg, i) => (<Message key={i} msg={msg} index={i} onEdit={handleEdit} onReplay={handleReplay} speaking={speaking} />))}
      </div>
    </div>
  );
}
