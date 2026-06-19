"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const VIDEO_SRC = "/api/video";
const STORAGE_KEY = "rushmore-chat-v1";

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

// Semitones → playback rate multiplier
const st = (n) => Math.pow(2, n / 12);

// ── Speed + pitch compensation ──────────────────────────────────────────────
// SLOW = 0.8 × 0.8 = 0.64 (two successive 20% slowdowns).
// Total pitch drop from slowing: log2(0.64)×12 ≈ −7.274 semitones.
// PITCH_COMP keeps perceived pitch where it was before any slowdown was applied.
const SLOW       = 0.64;
const PITCH_COMP = 3.864;  // compensates the first 0.8× pass (unchanged)

// Semitone offsets — PITCH_COMP was already baked in last pass, kept as-is
const BASE    = -2.39  + PITCH_COMP;
const CHO_A   = BASE   + 14/100;
const CHO_B   = BASE   - 12/100;
const UNDER   = BASE   - 0.25;
const PIT_DN1 = BASE   - 0.5;
const PIT_DN2 = BASE   - 1.0;

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

function makeNoiseGate(ctx, thresholdDb = -45) {
  const gate = ctx.createScriptProcessor(256, 2, 2);
  const threshold = Math.pow(10, thresholdDb / 20);
  gate.onaudioprocess = (e) => {
    for (let ch = 0; ch < e.inputBuffer.numberOfChannels; ch++) {
      const inp = e.inputBuffer.getChannelData(ch);
      const out = e.outputBuffer.getChannelData(ch);
      let sum = 0;
      for (let i = 0; i < inp.length; i++) sum += inp[i] * inp[i];
      const open = Math.sqrt(sum / inp.length) > threshold;
      for (let i = 0; i < inp.length; i++) out[i] = open ? inp[i] : 0;
    }
  };
  return gate;
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

      const srcMain  = makeSource(ctx, decoded, BASE);
      const srcChoA  = makeSource(ctx, decoded, CHO_A);
      const srcChoB  = makeSource(ctx, decoded, CHO_B);
      const srcUnder = makeSource(ctx, decoded, UNDER);
      const srcDn1   = makeSource(ctx, decoded, PIT_DN1);
      const srcDn2   = makeSource(ctx, decoded, PIT_DN2);

      const hiPass    = ctx.createBiquadFilter(); hiPass.type = "highpass";    hiPass.frequency.value = 200;   hiPass.Q.value = 0.7;
      const lowShelf  = ctx.createBiquadFilter(); lowShelf.type = "lowshelf";  lowShelf.frequency.value = 250; lowShelf.gain.value = -3;
      const midLo     = ctx.createBiquadFilter(); midLo.type = "peaking";      midLo.frequency.value = 600;   midLo.Q.value = 1.2; midLo.gain.value = -7;
      const midHi     = ctx.createBiquadFilter(); midHi.type = "peaking";      midHi.frequency.value = 1800;  midHi.Q.value = 1.0; midHi.gain.value = -4;
      const presence  = ctx.createBiquadFilter(); presence.type = "peaking";   presence.frequency.value = 3500; presence.Q.value = 1.0; presence.gain.value = 5;
      const airShelf  = ctx.createBiquadFilter(); airShelf.type = "highshelf"; airShelf.frequency.value = 8000; airShelf.gain.value = 7;
      const brilliance = ctx.createBiquadFilter(); brilliance.type = "peaking"; brilliance.frequency.value = 14000; brilliance.Q.value = 0.8; brilliance.gain.value = 4;
      hiPass.connect(lowShelf); lowShelf.connect(midLo); midLo.connect(midHi); midHi.connect(presence); presence.connect(airShelf); airShelf.connect(brilliance);

      const sat = ctx.createWaveShaper(); sat.curve = makeSatCurve(12); sat.oversample = "2x";
      brilliance.connect(sat);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 2.5;
      comp.attack.value = 0.005; comp.release.value = 0.120;
      const compGain = ctx.createGain(); compGain.gain.value = 1.0;
      sat.connect(comp); comp.connect(compGain);

      const gate = makeNoiseGate(ctx, -45);
      const gateOut = ctx.createGain(); gateOut.gain.value = 1.0;
      compGain.connect(gate); gate.connect(gateOut);

      const analyser = ctx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.45; analyserNode = analyser;

      const plate = ctx.createConvolver(); plate.buffer = makeImpulse(ctx, 0.35, 6.0);
      const plateGain = ctx.createGain(); plateGain.gain.value = 0.14;
      gateOut.connect(plate); plate.connect(plateGain);

      const hallPre = ctx.createDelay(0.5); hallPre.delayTime.value = 0.015;
      const hall = ctx.createConvolver(); hall.buffer = makeImpulse(ctx, 0.6, 4.0);
      const hallGain = ctx.createGain(); hallGain.gain.value = 0.10;
      gateOut.connect(hallPre); hallPre.connect(hall); hall.connect(hallGain);

      // ── Original parallel echo layers (from gateOut) ─────────────────────
      const makeEcho = (dt, gain, maxDt) => {
        const d = ctx.createDelay(maxDt || dt + 0.005); d.delayTime.value = dt;
        const g = ctx.createGain(); g.gain.value = gain;
        gateOut.connect(d); d.connect(g); return g;
      };
      const e1  = makeEcho(0.012, 0.28);
      const e2  = makeEcho(0.025, 0.20);
      const e3  = makeEcho(0.042, 0.14);
      const e4  = makeEcho(0.065, 0.09);
      const e5  = makeEcho(0.095, 0.06);
      const e6  = makeEcho(0.140, 0.045, 0.5);
      const e7  = makeEcho(0.200, 0.032, 0.5);
      const e8  = makeEcho(0.260, 0.025, 0.5);
      const e9  = makeEcho(0.300, 0.020, 0.5);
      const e10 = makeEcho(0.380, 0.014, 0.5);
      const e11 = makeEcho(0.500, 0.009, 0.5);
      const e12 = makeEcho(0.650, 0.005, 0.5);
      const e13 = makeEcho(0.820, 0.002, 0.5);

      // ── Cascading echo chain A (layers 1–6, from previous pass) ──────────
      const cDelay1 = ctx.createDelay(1.0); cDelay1.delayTime.value = 0.055;
      const cGain1  = ctx.createGain();  cGain1.gain.value  = 0.38;
      gateOut.connect(cDelay1); cDelay1.connect(cGain1);

      const cDelay2 = ctx.createDelay(1.0); cDelay2.delayTime.value = 0.080;
      const cGain2  = ctx.createGain();  cGain2.gain.value  = 0.30;
      cGain1.connect(cDelay2); cDelay2.connect(cGain2);

      const cDelay3 = ctx.createDelay(1.0); cDelay3.delayTime.value = 0.110;
      const cGain3  = ctx.createGain();  cGain3.gain.value  = 0.23;
      cGain2.connect(cDelay3); cDelay3.connect(cGain3);

      const cDelay4 = ctx.createDelay(1.0); cDelay4.delayTime.value = 0.150;
      const cGain4  = ctx.createGain();  cGain4.gain.value  = 0.17;
      cGain3.connect(cDelay4); cDelay4.connect(cGain4);

      const cDelay5 = ctx.createDelay(1.0); cDelay5.delayTime.value = 0.200;
      const cGain5  = ctx.createGain();  cGain5.gain.value  = 0.12;
      cGain4.connect(cDelay5); cDelay5.connect(cGain5);

      const cDelay6 = ctx.createDelay(1.0); cDelay6.delayTime.value = 0.260;
      const cGain6  = ctx.createGain();  cGain6.gain.value  = 0.07;
      cGain5.connect(cDelay6); cDelay6.connect(cGain6);

      // ── Cascading echo chain B (6 new layers, chaining off cGain6) ───────
      // These feed on the already-cascaded signal, producing echo-of-echo-of-echo.
      const cDelay7 = ctx.createDelay(1.0); cDelay7.delayTime.value = 0.320;
      const cGain7  = ctx.createGain();  cGain7.gain.value  = 0.05;
      cGain6.connect(cDelay7); cDelay7.connect(cGain7);

      const cDelay8 = ctx.createDelay(1.0); cDelay8.delayTime.value = 0.390;
      const cGain8  = ctx.createGain();  cGain8.gain.value  = 0.038;
      cGain7.connect(cDelay8); cDelay8.connect(cGain8);

      const cDelay9 = ctx.createDelay(1.0); cDelay9.delayTime.value = 0.470;
      const cGain9  = ctx.createGain();  cGain9.gain.value  = 0.028;
      cGain8.connect(cDelay9); cDelay9.connect(cGain9);

      const cDelay10 = ctx.createDelay(1.0); cDelay10.delayTime.value = 0.560;
      const cGain10  = ctx.createGain();  cGain10.gain.value  = 0.020;
      cGain9.connect(cDelay10); cDelay10.connect(cGain10);

      const cDelay11 = ctx.createDelay(1.0); cDelay11.delayTime.value = 0.660;
      const cGain11  = ctx.createGain();  cGain11.gain.value  = 0.013;
      cGain10.connect(cDelay11); cDelay11.connect(cGain11);

      const cDelay12 = ctx.createDelay(1.0); cDelay12.delayTime.value = 0.770;
      const cGain12  = ctx.createGain();  cGain12.gain.value  = 0.007;
      cGain11.connect(cDelay12); cDelay12.connect(cGain12);

      const panL = ctx.createStereoPanner(); panL.pan.value = -0.35;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.35;
      const choHiPass = ctx.createBiquadFilter(); choHiPass.type = "highpass"; choHiPass.frequency.value = 300;
      const choAGain = ctx.createGain(); choAGain.gain.value = 0.10;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.08;

      const underLow = ctx.createBiquadFilter(); underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.06;

      const dn1Low  = ctx.createBiquadFilter(); dn1Low.type = "lowpass"; dn1Low.frequency.value = 5000;
      const dn1Gain = ctx.createGain(); dn1Gain.gain.value = 0.18;
      const dn2Low  = ctx.createBiquadFilter(); dn2Low.type = "lowpass"; dn2Low.frequency.value = 3500;
      const dn2Gain = ctx.createGain(); dn2Gain.gain.value = 0.10;

      const master = ctx.createGain(); master.gain.value = 0.40;

      srcMain.connect(hiPass);
      gateOut.connect(analyser); analyser.connect(master);
      const dryGain = ctx.createGain(); dryGain.gain.value = 0.65;
      gateOut.connect(dryGain); dryGain.connect(master);
      [e1,e2,e3,e4,e5,e6,e7,e8,e9,e10,e11,e12,e13].forEach(e => e.connect(master));
      [cGain1,cGain2,cGain3,cGain4,cGain5,cGain6,
       cGain7,cGain8,cGain9,cGain10,cGain11,cGain12].forEach(g => g.connect(master));
      plateGain.connect(master); hallGain.connect(master);
      srcChoA.connect(choHiPass); choHiPass.connect(choAGain); choAGain.connect(panL); panL.connect(master);
      srcChoB.connect(choHiPass); choHiPass.connect(choBGain); choBGain.connect(panR); panR.connect(master);
      srcUnder.connect(underLow); underLow.connect(underGain); underGain.connect(master);
      srcDn1.connect(dn1Low); dn1Low.connect(dn1Gain); dn1Gain.connect(master);
      srcDn2.connect(dn2Low); dn2Low.connect(dn2Gain); dn2Gain.connect(master);
      master.connect(ctx.destination);

      let ended = false;
      srcMain.onended = () => { if (!ended) { ended = true; analyserNode = null; activeSources = []; onDone?.(); } };
      const t = ctx.currentTime + 0.01;
      srcMain.start(t); srcChoA.start(t); srcChoB.start(t); srcUnder.start(t);
      srcDn1.start(t); srcDn2.start(t);
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

// ── Green TV flash — pulses over the video only, matching voice ────────────
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
      const active = Math.max(0, rms - 0.06);
      if (active <= 0) { flashRef.current.style.opacity = "0"; return; }
      flashRef.current.style.opacity = Math.min(1, active * 3.5).toFixed(3);
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
          <video
            ref={videoRef}
            src={VIDEO_SRC}
            autoPlay loop muted playsInline
            className="ai-video-main"
          />
          <div
            ref={flashRef}
            style={{
              position:      "absolute",
              inset:         0,
              pointerEvents: "none",
              opacity:       0,
              mixBlendMode:  "screen",
              background:    "radial-gradient(ellipse at center, rgba(80,255,80,0.55) 0%, rgba(40,200,40,0.30) 50%, transparent 80%)",
              boxShadow:     "0 0 50px 16px rgba(60,220,60,0.45), 0 0 100px 32px rgba(60,220,60,0.18)",
              zIndex:        3,
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
