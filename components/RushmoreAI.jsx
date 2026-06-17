"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const PANEL = img("images/Rushmore/Rushmore Panel.png");
const LOGO  = img("images/Rushmore/Rushmore Logo.png");
const VIDEO_SRC = img("images/Rushmore/Rushmorevideo.mp4");

// Face bounding box as % of 1784x1481 panel image
// TL(530,66) TR(1192,69) BL(573,507) BR(1170,513)
const FACE = {
  left:   530  / 1784 * 100,  // 29.71%
  top:    66   / 1481 * 100,  // 4.46%
  width:  662  / 1784 * 100,  // 37.11%
  height: 447  / 1481 * 100,  // 30.18%
  // trapezoid: bottom is ~40px wider and shifted right ~43px vs top
  // we encode this as a clip-path polygon (% of the element)
  // top-left, top-right, bottom-right, bottom-left
  // relative offsets from the bounding box:
  // TL offset from box-left: 0px -> 0%
  // TR offset: 662px -> 100%
  // BR: (1170-530)=640px from left -> 640/662=96.7%, bottom
  // BL: (573-530)=43px from left -> 43/662=6.5%, bottom
  clipPath: "polygon(0% 0%, 100% 0%, 96.7% 100%, 6.5% 100%)",
};

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

// ── Audio FX ────────────────────────────────────────────────────────────
const st = (n) => Math.pow(2, n / 12);

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

let audioCtx    = null;
let analyserNode = null; // shared analyser so the RAF loop can read it
let activeSources = [];

function getCtx() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
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

      const srcMain  = makeSource(ctx, decoded, -1.5);
      const srcChoA  = makeSource(ctx, decoded, -1.5 + 14/100);
      const srcChoB  = makeSource(ctx, decoded, -1.5 - 12/100);
      const srcUnder = makeSource(ctx, decoded, -1.75);

      // EQ
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass"; hiPass.frequency.value = 200; hiPass.Q.value = 0.8;
      const midNotch = ctx.createBiquadFilter();
      midNotch.type = "peaking"; midNotch.frequency.value = 420; midNotch.Q.value = 1.5; midNotch.gain.value = -5;
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking"; presence.frequency.value = 3200; presence.Q.value = 1.0; presence.gain.value = 4;
      const airShelf = ctx.createBiquadFilter();
      airShelf.type = "highshelf"; airShelf.frequency.value = 8000; airShelf.gain.value = 5;
      const brilliance = ctx.createBiquadFilter();
      brilliance.type = "peaking"; brilliance.frequency.value = 12000; brilliance.Q.value = 0.8; brilliance.gain.value = 3;
      hiPass.connect(midNotch); midNotch.connect(presence); presence.connect(airShelf); airShelf.connect(brilliance);

      // Analyser for glow
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      analyserNode = analyser;

      // Tight echoes
      const makeEcho = (dt, gain) => {
        const d = ctx.createDelay(0.5); d.delayTime.value = dt;
        const g = ctx.createGain();    g.gain.value = gain;
        brilliance.connect(d); d.connect(g);
        return g;
      };
      const e1out = makeEcho(0.018, 0.55);
      const e2out = makeEcho(0.036, 0.40);
      const e3out = makeEcho(0.060, 0.25);
      const e4out = makeEcho(0.095, 0.14);

      // Plate reverb
      const plate = ctx.createConvolver();
      plate.buffer = makeImpulse(ctx, 0.8, 4.5);
      const plateGain = ctx.createGain(); plateGain.gain.value = 0.15;
      brilliance.connect(plate); plate.connect(plateGain);

      // Chorus
      const panL = ctx.createStereoPanner(); panL.pan.value = -0.45;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.45;
      const choHiPass = ctx.createBiquadFilter();
      choHiPass.type = "highpass"; choHiPass.frequency.value = 300;
      const choAGain = ctx.createGain(); choAGain.gain.value = 0.18;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.14;

      // Undertone
      const underLow  = ctx.createBiquadFilter();
      underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.22;

      // Master
      const master = ctx.createGain(); master.gain.value = 0.80;

      // Routing: main → EQ → analyser → dry+echoes+reverb → master
      srcMain.connect(hiPass);
      brilliance.connect(analyser); // tap for glow
      const dryGain = ctx.createGain(); dryGain.gain.value = 1.0;
      brilliance.connect(dryGain); dryGain.connect(master);
      e1out.connect(master); e2out.connect(master); e3out.connect(master); e4out.connect(master);
      plateGain.connect(master);
      analyser.connect(master); // analyser is pass-through

      srcChoA.connect(choHiPass); choHiPass.connect(choAGain); choAGain.connect(panL); panL.connect(master);
      srcChoB.connect(choHiPass); choHiPass.connect(choBGain); choBGain.connect(panR); panR.connect(master);
      srcUnder.connect(underLow); underLow.connect(underGain); underGain.connect(master);
      master.connect(ctx.destination);

      let ended = false;
      srcMain.onended = () => {
        if (!ended) { ended = true; analyserNode = null; activeSources = []; onDone?.(); }
      };

      const t = ctx.currentTime + 0.01;
      srcMain.start(t); srcChoA.start(t); srcChoB.start(t); srcUnder.start(t);
      return;
    }
  } catch (_) {}

  // Browser TTS fallback
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(v => /google uk english male/i.test(v.name)) ||
    voices.find(v => /microsoft george/i.test(v.name)) ||
    voices.find(v => /daniel/i.test(v.name)) ||
    voices.find(v => v.lang === "en-GB") ||
    voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.92; utt.pitch = 1.0; utt.volume = 1;
  utt.onend = () => onDone?.(); utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  activeSources.forEach(s => { try { s.stop(); } catch (_) {} });
  activeSources = [];
  analyserNode = null;
  window.speechSynthesis?.cancel();
}

// ── Voice-reactive glow hook ──
function useVoiceGlow(videoRef) {
  const rafRef = useRef(null);
  const dataArr = useRef(null);

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!analyserNode || !videoRef.current) return;

      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount) {
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      }
      analyserNode.getByteFrequencyData(dataArr.current);

      // RMS amplitude
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255; // 0..1

      // Map to glow intensity
      const glow   = Math.round(rms * 60);        // px spread 0-60
      const bright = 1 + rms * 0.8;               // brightness 1.0-1.8
      const r = Math.round(80  + rms * 175);      // red channel
      const g = Math.round(20  + rms * 60);       // green channel
      const b = Math.round(200 + rms * 55);       // blue/purple channel

      videoRef.current.style.filter =
        `brightness(${bright.toFixed(2)}) drop-shadow(0 0 ${glow}px rgba(${r},${g},${b},0.9))`;
      videoRef.current.style.boxShadow =
        `0 0 ${glow * 2}px ${glow}px rgba(${r},${g},${b},0.4)`;
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [videoRef]);
}

// ── Components ────────────────────────────────────────────────────────────────
function TypingDots() {
  return <div className="ai-typing"><span /><span /><span /></div>;
}

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

// ── Main component ────────────────────────────────────────────────────────────
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
  const videoRef       = useRef(null);

  useVoiceGlow(videoRef);

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
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    stopSpeech(); stopListening(); setContinuous(false);
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 });
  };

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
      {/* Panel + overlaid video */}
      <div className="ai-panel-banner">
        <img src={PANEL} alt="RUSHMORE" className="ai-panel-img" />

        {/* Video overlay — positioned over the face area using % coords */}
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          loop
          muted
          playsInline
          className="ai-face-video"
          style={{
            left:      `${FACE.left}%`,
            top:       `${FACE.top}%`,
            width:     `${FACE.width}%`,
            height:    `${FACE.height}%`,
            clipPath:  FACE.clipPath,
          }}
        />

        <div className="ai-panel-overlay">
          <img src={LOGO} alt="" className="ai-panel-logo" />
        </div>
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
