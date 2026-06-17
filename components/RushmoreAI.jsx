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
// +10% pitch = +1.66 semitones on top of -2.39 = -0.73
const BASE  = -0.73;
const CHO_A = BASE + 14 / 100;
const CHO_B = BASE - 12 / 100;
const UNDER = BASE - 0.25;

function makeImpulse(ctx, duration, decay) {
  const rate   = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf    = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay) * (c === 0 ? 1 : 0.94);
    }
  }
  return buf;
}

function makeSatCurve(amount = 12) {
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
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function makeSource(ctx, decoded, semitones) {
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.playbackRate.value = st(semitones);
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

      const srcMain  = makeSource(ctx, decoded, BASE);
      const srcChoA  = makeSource(ctx, decoded, CHO_A);
      const srcChoB  = makeSource(ctx, decoded, CHO_B);
      const srcUnder = makeSource(ctx, decoded, UNDER);

      const hiPass    = ctx.createBiquadFilter(); hiPass.type = "highpass";  hiPass.frequency.value = 200; hiPass.Q.value = 0.7;
      const lowShelf  = ctx.createBiquadFilter(); lowShelf.type = "lowshelf"; lowShelf.frequency.value = 250; lowShelf.gain.value = -3;
      const midLo     = ctx.createBiquadFilter(); midLo.type = "peaking";    midLo.frequency.value = 600;  midLo.Q.value = 1.2; midLo.gain.value = -7;
      const midHi     = ctx.createBiquadFilter(); midHi.type = "peaking";    midHi.frequency.value = 1800; midHi.Q.value = 1.0; midHi.gain.value = -4;
      const presence  = ctx.createBiquadFilter(); presence.type = "peaking"; presence.frequency.value = 3500; presence.Q.value = 1.0; presence.gain.value = 5;
      const airShelf  = ctx.createBiquadFilter(); airShelf.type = "highshelf"; airShelf.frequency.value = 8000; airShelf.gain.value = 7;
      const brilliance = ctx.createBiquadFilter(); brilliance.type = "peaking"; brilliance.frequency.value = 14000; brilliance.Q.value = 0.8; brilliance.gain.value = 4;
      hiPass.connect(lowShelf); lowShelf.connect(midLo); midLo.connect(midHi); midHi.connect(presence); presence.connect(airShelf); airShelf.connect(brilliance);

      const sat = ctx.createWaveShaper(); sat.curve = makeSatCurve(12); sat.oversample = "2x"; brilliance.connect(sat);

      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2.5; comp.attack.value = 0.005; comp.release.value = 0.120;
      const compGain = ctx.createGain(); compGain.gain.value = 1.0; sat.connect(comp); comp.connect(compGain);

      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.55; analyserNode = analyser;

      const plate = ctx.createConvolver(); plate.buffer = makeImpulse(ctx, 0.4, 5.0);
      const plateGain = ctx.createGain(); plateGain.gain.value = 0.35;
      compGain.connect(plate); plate.connect(plateGain);

      const hallPre = ctx.createDelay(0.5); hallPre.delayTime.value = 0.020;
      const hall = ctx.createConvolver(); hall.buffer = makeImpulse(ctx, 0.8, 3.5);
      const hallGain = ctx.createGain(); hallGain.gain.value = 0.30;
      compGain.connect(hallPre); hallPre.connect(hall); hall.connect(hallGain);

      const chamberPre = ctx.createDelay(0.5); chamberPre.delayTime.value = 0.040;
      const chamber = ctx.createConvolver(); chamber.buffer = makeImpulse(ctx, 1.2, 3.0);
      const chamberGain = ctx.createGain(); chamberGain.gain.value = 0.18;
      compGain.connect(chamberPre); chamberPre.connect(chamber); chamber.connect(chamberGain);

      const makeEcho = (dt, gain, maxDt) => {
        const d = ctx.createDelay(maxDt || dt + 0.01); d.delayTime.value = dt;
        const g = ctx.createGain(); g.gain.value = gain;
        compGain.connect(d); d.connect(g); return g;
      };
      const r1 = makeEcho(0.020, 0.45); const r2 = makeEcho(0.040, 0.35);
      const r3 = makeEcho(0.065, 0.25); const r4 = makeEcho(0.095, 0.16);
      const t1 = makeEcho(0.080, 0.30, 0.5); const t2 = makeEcho(0.160, 0.18, 0.5);
      const t3 = makeEcho(0.280, 0.09, 0.5); const t4 = makeEcho(0.420, 0.04, 0.5);
      const t5 = makeEcho(0.560, 0.02, 0.5); const t6 = makeEcho(0.700, 0.01, 0.5);

      const panL = ctx.createStereoPanner(); panL.pan.value = -0.50;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.50;
      const choHiPass = ctx.createBiquadFilter(); choHiPass.type = "highpass"; choHiPass.frequency.value = 300;
      const choAGain = ctx.createGain(); choAGain.gain.value = 0.28;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.22;
      const underLow = ctx.createBiquadFilter(); underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.08;

      const master = ctx.createGain(); master.gain.value = 0.35;

      srcMain.connect(hiPass);
      compGain.connect(analyser); analyser.connect(master);
      const dryGain = ctx.createGain(); dryGain.gain.value = 0.20; compGain.connect(dryGain); dryGain.connect(master);
      [r1,r2,r3,r4].forEach(e => e.connect(master));
      [t1,t2,t3,t4,t5,t6].forEach(e => e.connect(master));
      plateGain.connect(master); hallGain.connect(master); chamberGain.connect(master);
      srcChoA.connect(choHiPass); choHiPass.connect(choAGain); choAGain.connect(panL); panL.connect(master);
      srcChoB.connect(choHiPass); choHiPass.connect(choBGain); choBGain.connect(panR); panR.connect(master);
      srcUnder.connect(underLow); underLow.connect(underGain); underGain.connect(master);
      master.connect(ctx.destination);

      let ended = false;
      srcMain.onended = () => { if (!ended) { ended = true; analyserNode = null; activeSources = []; onDone?.(); } };
      const t = ctx.currentTime + 0.01;
      srcMain.start(t); srcChoA.start(t); srcChoB.start(t); srcUnder.start(t);
      return;
    }
  } catch (_) {}
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /google uk english male/i.test(v.name)) || voices.find(v => /microsoft george/i.test(v.name)) || voices.find(v => /daniel/i.test(v.name)) || voices.find(v => v.lang === "en-GB") || voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.92; utt.pitch = 1.0; utt.volume = 1;
  utt.onend = () => onDone?.(); utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
  activeSources = []; analyserNode = null;
  window.speechSynthesis?.cancel();
}

function useVideoFX(darkRef, bloomRef, videoRef, containerRef) {
  const rafRef      = useRef(null);
  const dataArr     = useRef(null);
  // Idle darkness = 0.30 → video at 70% visibility
  const darknessRef = useRef(0.30);

  useEffect(() => {
    function positionBloom() {
      const video = videoRef.current;
      const bloom = bloomRef.current;
      const dark  = darkRef.current;
      const container = containerRef.current;
      if (!video || !bloom || !container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      const vw = video.videoWidth  || 16;
      const vh = video.videoHeight || 9;
      const videoAR = vw / vh;
      const containerAR = cw / ch;
      let left, top, width, height;
      if (videoAR > containerAR) {
        width = cw; height = cw / videoAR; left = 0; top = (ch - height) / 2;
      } else {
        height = ch; width = ch * videoAR; top = 0; left = (cw - width) / 2;
      }
      const baseStyle = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;pointer-events:none;`;
      bloom.style.cssText = baseStyle + `z-index:2;`;
      dark.style.cssText  = baseStyle + `z-index:1;background:#000;opacity:${darknessRef.current.toFixed(3)};`;
    }
    const video = videoRef.current;
    if (video) { video.addEventListener("loadedmetadata", positionBloom); video.addEventListener("resize", positionBloom); }
    window.addEventListener("resize", positionBloom);
    positionBloom();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const bloom = bloomRef.current;
      const dark  = darkRef.current;
      if (!bloom || !dark) return;

      if (!analyserNode) {
        // Idle: settle to 0.30 darkness (70% visible), faint steady glow
        darknessRef.current += (0.30 - darknessRef.current) * 0.05;
        dark.style.opacity = darknessRef.current.toFixed(3);
        // Idle bloom: dim constant green, no pulse distraction
        bloom.style.background = `radial-gradient(ellipse 90% 85% at 50% 50%, rgba(30,200,30,0.07) 0%, transparent 65%)`;
        return;
      }

      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount)
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArr.current);

      // Raw RMS — no curve, stays near 0 in silence between syllables
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255;

      // Sharp flash: no lerp on darkness, snap directly — computer-like instant response
      // Idle floor 0.30 → peaks pull to 0.0 (full reveal)
      const targetDark = 0.30 * (1 - rms);
      // Fast snap: high lerp factor = sharp attack like a strobe
      darknessRef.current += (targetDark - darknessRef.current) * 0.55;
      dark.style.opacity = Math.max(0, darknessRef.current).toFixed(3);

      // Bloom: floor of 0.12 so there's always a faint green at rest while speaking,
      // peaks shoot up to full — the 0→100 swing happens on each syllable
      const floor = 0.12;
      const r  = Math.round(20  + rms * 220);
      const g  = Math.round(200 + rms * 55);
      const b  = Math.round(20  + rms * 10);
      const a1 = (floor + rms * (0.88 - floor)).toFixed(2); // 0.12 → 0.88
      const a2 = (floor * 0.6 + rms * 0.55).toFixed(2);    // subtle mid layer
      const a3 = (rms * 0.22).toFixed(2);                   // outer edge, only on peaks

      bloom.style.background =
        `radial-gradient(ellipse 90% 85% at 50% 50%, ` +
        `rgba(${r},${g},${b},${a1}) 0%, ` +
        `rgba(${r},${g},${b},${a2}) 40%, ` +
        `rgba(${r},${g},${b},${a3}) 65%, ` +
        `transparent 80%)`;
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", positionBloom);
      if (video) { video.removeEventListener("loadedmetadata", positionBloom); video.removeEventListener("resize", positionBloom); }
    };
  }, [darkRef, bloomRef, videoRef, containerRef]);
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
  const darkRef        = useRef(null);
  const bloomRef       = useRef(null);
  const videoRef       = useRef(null);
  const containerRef   = useRef(null);

  useVideoFX(darkRef, bloomRef, videoRef, containerRef);

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
        <div className="ai-video-sticky" ref={containerRef}>
          <video ref={videoRef} src={VIDEO_SRC} autoPlay loop muted playsInline className="ai-video-main" />
          <div className="ai-video-dark"  ref={darkRef}  />
          <div className="ai-video-bloom" ref={bloomRef} />
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
