"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const LOGO      = img("images/Rushmore/Rushmore Logo.png");
const VIDEO_SRC = img("images/Rushmore/RushMORE (1).mp4");

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

// ── Audio FX ────────────────────────────────────────────────────────────
const st = (n) => Math.pow(2, n / 12);
const BASE  = -2.0;
const CHO_A = BASE + 14 / 100;
const CHO_B = BASE - 12 / 100;
const UNDER = -2.25;

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

      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass"; hiPass.frequency.value = 120; hiPass.Q.value = 0.7;
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf"; lowShelf.frequency.value = 250; lowShelf.gain.value = 5;
      const midLo = ctx.createBiquadFilter();
      midLo.type = "peaking"; midLo.frequency.value = 600; midLo.Q.value = 1.2; midLo.gain.value = -7;
      const midHi = ctx.createBiquadFilter();
      midHi.type = "peaking"; midHi.frequency.value = 1800; midHi.Q.value = 1.0; midHi.gain.value = -4;
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking"; presence.frequency.value = 3500; presence.Q.value = 1.0; presence.gain.value = 5;
      const airShelf = ctx.createBiquadFilter();
      airShelf.type = "highshelf"; airShelf.frequency.value = 8000; airShelf.gain.value = 7;
      const brilliance = ctx.createBiquadFilter();
      brilliance.type = "peaking"; brilliance.frequency.value = 14000; brilliance.Q.value = 0.8; brilliance.gain.value = 4;
      hiPass.connect(lowShelf); lowShelf.connect(midLo); midLo.connect(midHi);
      midHi.connect(presence); presence.connect(airShelf); airShelf.connect(brilliance);

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 8;
      comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.120;
      const compGain = ctx.createGain(); compGain.gain.value = 1.0;
      brilliance.connect(comp); comp.connect(compGain);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass"; bandpass.frequency.value = 2200; bandpass.Q.value = 0.4;
      const bpGain = ctx.createGain(); bpGain.gain.value = 0.25;
      compGain.connect(bandpass); bandpass.connect(bpGain);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
      analyserNode = analyser;

      const makeEcho = (dt, gain) => {
        const d = ctx.createDelay(1.5); d.delayTime.value = dt;
        const g = ctx.createGain(); g.gain.value = gain;
        compGain.connect(d); d.connect(g); return g;
      };
      const e1=makeEcho(0.060,0.38); const e2=makeEcho(0.110,0.28); const e3=makeEcho(0.175,0.20);
      const e4=makeEcho(0.260,0.13); const e5=makeEcho(0.370,0.08); const e6=makeEcho(0.500,0.05);
      const e7=makeEcho(0.660,0.03); const e8=makeEcho(0.850,0.02); const e9=makeEcho(1.100,0.01);

      const plate = ctx.createConvolver(); plate.buffer = makeImpulse(ctx, 1.2, 4.0);
      const plateGain = ctx.createGain(); plateGain.gain.value = 0.55;
      compGain.connect(plate); plate.connect(plateGain);

      const hallPre = ctx.createDelay(0.5); hallPre.delayTime.value = 0.025;
      const hall = ctx.createConvolver(); hall.buffer = makeImpulse(ctx, 2.2, 2.8);
      const hallGain = ctx.createGain(); hallGain.gain.value = 0.50;
      compGain.connect(hallPre); hallPre.connect(hall); hall.connect(hallGain);

      const chamberPre = ctx.createDelay(0.5); chamberPre.delayTime.value = 0.055;
      const chamber = ctx.createConvolver(); chamber.buffer = makeImpulse(ctx, 3.5, 2.0);
      const chamberGain = ctx.createGain(); chamberGain.gain.value = 0.30;
      compGain.connect(chamberPre); chamberPre.connect(chamber); chamber.connect(chamberGain);

      const panL = ctx.createStereoPanner(); panL.pan.value = -0.45;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.45;
      const choHiPass = ctx.createBiquadFilter(); choHiPass.type = "highpass"; choHiPass.frequency.value = 300;
      const choAGain = ctx.createGain(); choAGain.gain.value = 0.16;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.12;

      const underLow = ctx.createBiquadFilter(); underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.18;

      const master = ctx.createGain(); master.gain.value = 0.50;

      srcMain.connect(hiPass);
      compGain.connect(analyser); analyser.connect(master);

      const dryGain = ctx.createGain(); dryGain.gain.value = 0.20;
      compGain.connect(dryGain); dryGain.connect(master);

      bpGain.connect(master);
      [e1,e2,e3,e4,e5,e6,e7,e8,e9].forEach(e => e.connect(master));
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

// ── Aura glow ───────────────────────────────────────────────────────────
// Targets the WRAPPER div, not the video element.
// Uses box-shadow (renders outside, never clipped by video) + CSS custom
// property --glow-rgba so the ::after gradient bloom also reacts.
function useAuraGlow(wrapperRef) {
  const rafRef  = useRef(null);
  const dataArr = useRef(null);

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const el = wrapperRef.current;
      if (!el) return;

      if (!analyserNode) {
        // Idle — faint green pulse
        const idleA = (0.10 + 0.05 * Math.sin(Date.now() / 1200)).toFixed(3);
        el.style.boxShadow =
          `0 0 18px 4px  rgba(30,180,30,${idleA}),` +
          `0 0 60px 16px rgba(30,180,30,${(idleA * 0.4).toFixed(3)})`;
        el.style.setProperty("--glow-rgba", `rgba(30,180,30,${idleA})`);
        return;
      }

      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount)
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArr.current);
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255;

      const r  = Math.round(40  + rms * 215);
      const g  = Math.round(180 + rms * 75);
      const b  = Math.round(20  + rms * 30);
      const a1 = Math.min(0.95, 0.25 + rms * 0.70).toFixed(2);
      const a2 = Math.min(0.50, 0.08 + rms * 0.42).toFixed(2);
      const a3 = Math.min(0.20, 0.03 + rms * 0.17).toFixed(2);

      // Three-layer box-shadow: tight rim → mid bloom → wide ambient
      el.style.boxShadow =
        `0 0 ${Math.round(10 + rms * 40)}px  ${Math.round(2  + rms * 8)}px  rgba(${r},${g},${b},${a1}),` +
        `0 0 ${Math.round(40 + rms * 120)}px ${Math.round(10 + rms * 30)}px rgba(${r},${g},${b},${a2}),` +
        `0 0 ${Math.round(80 + rms * 220)}px ${Math.round(20 + rms * 60)}px rgba(${r},${g},${b},${a3})`;

      // CSS var drives the ::after gradient bloom inside globals.css
      el.style.setProperty("--glow-rgba", `rgba(${r},${g},${b},${Math.min(0.45, rms * 0.55).toFixed(2)})`);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [wrapperRef]);
}

function TypingDots() { return <div className="ai-typing"><span /><span /><span /></div>; }

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`ai-msg ${isUser ? "ai-msg-user" : "ai-msg-rushmore"}`}>
      {!isUser && <div className="ai-msg-label">RUSHMORE</div>}
      <div className="ai-msg-bubble">
        {msg.content.split("\n").map((line, i) => (
          <p key={i} style={{ margin: line === "" ? "6px 0 0" : "0" }}>{line}</p>
        ))}
      </div>
    </div>
  );
}

const BOOT_MSG = {
  role: "assistant",
  content: "RUSHMORE online. All systems nominal.\n\nI have full context on GeoAlta, GeoComforter, ChronoSlate, NMGCO, The Order, and TheGame. GitHub actions and Microsoft Graph are not yet wired \u2014 everything else, ask away."
};

export default function RushmoreAI() {
  const [messages,   setMessages]   = useState([BOOT_MSG]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [ttsOn,      setTtsOn]      = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [listening,  setListening]  = useState(false);
  const [speaking,   setSpeaking]   = useState(false);
  const [usage,      setUsage]      = useState({ inTok: 0, outTok: 0, calls: 0 });
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const continuousRef  = useRef(false);
  const wrapperRef     = useRef(null);   // glow target — the container, not the video

  useAuraGlow(wrapperRef);

  useEffect(() => { continuousRef.current = continuous; }, [continuous]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(_) {} }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (e) => sendMessage(e.results[0][0].transcript);
    recognitionRef.current = rec;
    rec.start();
  }, []); // eslint-disable-line

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch(_) {}
    setListening(false);
  }, []);

  const sendMessage = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg = { role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data  = await res.json();
      const reply = data.content?.[0]?.text || data.error?.message || "[No response]";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
      if (data.usage) {
        setUsage(prev => ({
          inTok:  prev.inTok  + (data.usage.input_tokens  || 0),
          outTok: prev.outTok + (data.usage.output_tokens || 0),
          calls:  prev.calls  + 1,
        }));
      }
      if (ttsOn || continuousRef.current) {
        setSpeaking(true);
        speakWithFX(reply, () => {
          setSpeaking(false);
          if (continuousRef.current) setTimeout(() => { if (continuousRef.current) startListening(); }, 600);
        });
      } else if (continuousRef.current) {
        setTimeout(() => { if (continuousRef.current) startListening(); }, 300);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const resetAll = () => { stopSpeech(); stopListening(); setContinuous(false); setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); };
  const toggleContinuous = () => {
    if (continuous) { setContinuous(false); continuousRef.current = false; stopListening(); stopSpeech(); }
    else { setContinuous(true); continuousRef.current = true; setTtsOn(true); startListening(); }
  };
  const toggleOneShotMic = () => { if (listening) { stopListening(); return; } startListening(); };
  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const cost = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;

  return (
    <div className="ai-shell">

      {/*
        Wrapper div gets the box-shadow glow via JS.
        overflow:hidden crops the video's black bars.
        position:relative + z-index so the ::after gradient bloom
        sits BEHIND the video but INSIDE the wrapper bounds.
      */}
      <div className="ai-video-sticky" ref={wrapperRef}>
        {/* Gradient bloom layer — rendered behind video via z-index */}
        <div className="ai-video-bloom" />
        <video
          src={VIDEO_SRC}
          autoPlay loop muted playsInline
          className="ai-video-main"
        />
      </div>

      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-status-dot" />
          <span className="ai-online-label">ONLINE</span>
          {totalTok > 0 && (
            <span className="ai-usage">
              <span className="ai-usage-tok">{totalTok.toLocaleString()} tok</span>
              <span className="ai-usage-sep">\u00b7</span>
              <span className="ai-usage-cost">${cost.toFixed(4)}</span>
              <span className="ai-usage-sep">\u00b7</span>
              <span className="ai-usage-calls">{usage.calls} msg{usage.calls !== 1 ? "s" : ""}</span>
            </span>
          )}
          {speaking && <span className="ai-speaking-label">\u25b6 SPEAKING</span>}
        </div>
        <div className="ai-header-right">
          <button className={`ai-ctrl-btn${continuous ? " active" : ""}`} onClick={toggleContinuous}>
            {continuous ? (listening ? "\u25cf LISTENING" : speaking ? "\u25b6 SPEAKING" : "\u25cc WAITING") : "\u25cb CONTINUOUS"}
          </button>
          <button className={`ai-ctrl-btn${ttsOn && !continuous ? " active" : ""}`}
            onClick={() => { if (continuous) return; setTtsOn(t => !t); if (ttsOn) stopSpeech(); }}
            style={{ opacity: continuous ? 0.35 : 1 }}>
            {ttsOn ? "\u25c9 VOICE OUT" : "\u25cb VOICE OUT"}
          </button>
          <button className="ai-ctrl-btn" onClick={resetAll}>CLEAR</button>
        </div>
      </div>

      <div className="ai-feed">
        {messages.map((msg, i) => <Message key={i} msg={msg} />)}
        {loading && (
          <div className="ai-msg ai-msg-rushmore">
            <div className="ai-msg-label">RUSHMORE</div>
            <div className="ai-msg-bubble"><TypingDots /></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="ai-input-bar">
        <button className={`ai-mic-btn${listening ? " listening" : ""}${continuous ? " continuous" : ""}`}
          onClick={continuous ? toggleContinuous : toggleOneShotMic}>
          {continuous ? (listening ? "\u25cf" : speaking ? "\u25b6" : "\u25cc") : (listening ? "\u25cf" : "\uD83C\uDFA4")}
        </button>
        <textarea className="ai-textarea" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={continuous ? (listening ? "Listening..." : speaking ? "RUSHMORE speaking..." : "Waiting for your voice...") : (listening ? "Listening..." : "Command RUSHMORE...")}
          rows={1} spellCheck={false} />
        <button className="ai-send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}>SEND</button>
      </div>
    </div>
  );
}
