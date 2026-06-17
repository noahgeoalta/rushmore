"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const PANEL = img("images/Rushmore/Rushmore Panel.png");
const LOGO  = img("images/Rushmore/Rushmore Logo.png");

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

// ── Audio FX ────────────────────────────────────────────────────────────

// Semitones to playback rate
const st = (n) => Math.pow(2, n / 12);

// Impulse response generator
function makeImpulse(ctx, duration, decay) {
  const rate   = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf    = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1)
        * Math.pow(1 - i / length, decay)
        * (c === 0 ? 1 : 0.94);
    }
  }
  return buf;
}

let audioCtx = null;
function getCtx() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Track all active sources so stopSpeech kills everything
let activeSources = [];

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

      // ── Sources ──
      // Main voice: -1.5 semitones
      const srcMain = makeSource(ctx, decoded, -1.5);

      // Chorus A: -1.5 + 14 cents up → pan left
      const srcChoA = makeSource(ctx, decoded, -1.5 + 14/100);

      // Chorus B: -1.5 + 12 cents down → pan right
      const srcChoB = makeSource(ctx, decoded, -1.5 - 12/100);

      // Undertone: -1.75 semitones (-1.5 - 0.25), blended quietly beneath
      const srcUnder = makeSource(ctx, decoded, -1.75);

      // ── Shared EQ chain (main + undertone go through this) ──
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass"; hiPass.frequency.value = 200; hiPass.Q.value = 0.8;

      const midNotch = ctx.createBiquadFilter();
      midNotch.type = "peaking"; midNotch.frequency.value = 420;
      midNotch.Q.value = 1.5; midNotch.gain.value = -5;

      const presence = ctx.createBiquadFilter();
      presence.type = "peaking"; presence.frequency.value = 3200;
      presence.Q.value = 1.0; presence.gain.value = 4;

      const airShelf = ctx.createBiquadFilter();
      airShelf.type = "highshelf"; airShelf.frequency.value = 8000; airShelf.gain.value = 5;

      const brilliance = ctx.createBiquadFilter();
      brilliance.type = "peaking"; brilliance.frequency.value = 12000;
      brilliance.Q.value = 0.8; brilliance.gain.value = 3;

      // EQ chain: hiPass → midNotch → presence → airShelf → brilliance
      hiPass.connect(midNotch); midNotch.connect(presence);
      presence.connect(airShelf); airShelf.connect(brilliance);

      // ── Echo cascade ── (4 taps, each feeding the next for natural decay)
      const makeEcho = (dt, gain) => {
        const d = ctx.createDelay(1.0); d.delayTime.value = dt;
        const g = ctx.createGain();    g.gain.value = gain;
        return { d, g };
      };
      const e1 = makeEcho(0.040, 0.34); // 40ms
      const e2 = makeEcho(0.090, 0.22); // 90ms
      const e3 = makeEcho(0.170, 0.13); // 170ms
      const e4 = makeEcho(0.280, 0.07); // 280ms — distant tail

      // Each echo feeds the next for cascading decay
      brilliance.connect(e1.d); e1.d.connect(e1.g);
      e1.g.connect(e2.d);       e2.d.connect(e2.g);
      e2.g.connect(e3.d);       e3.d.connect(e3.g);
      e3.g.connect(e4.d);       e4.d.connect(e4.g);

      // ── Reverb: two rooms — short plate + longer hall ──
      const plate = ctx.createConvolver();
      plate.buffer = makeImpulse(ctx, 0.6, 5.0); // tight plate

      const hall = ctx.createConvolver();
      hall.buffer = makeImpulse(ctx, 1.4, 3.5);  // medium hall

      const plateGain = ctx.createGain(); plateGain.gain.value = 0.14;
      const hallGain  = ctx.createGain(); hallGain.gain.value  = 0.18;

      brilliance.connect(plate); plate.connect(plateGain);
      brilliance.connect(hall);  hall.connect(hallGain);

      // ── Stereo panning for chorus ──
      const panL = ctx.createStereoPanner(); panL.pan.value = -0.45;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.45;

      const choHiPass = ctx.createBiquadFilter();
      choHiPass.type = "highpass"; choHiPass.frequency.value = 300;

      const choAGain = ctx.createGain(); choAGain.gain.value = 0.18;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.14;

      // Undertone through a low-pass so it's felt not heard
      const underLow = ctx.createBiquadFilter();
      underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.22;

      // ── Master ──
      const master = ctx.createGain(); master.gain.value = 0.80;

      // ── Routing ──
      // Main voice → EQ chain
      srcMain.connect(hiPass);

      // Dry
      const dryGain = ctx.createGain(); dryGain.gain.value = 1.0;
      brilliance.connect(dryGain); dryGain.connect(master);

      // Echoes
      e1.g.connect(master); e2.g.connect(master);
      e3.g.connect(master); e4.g.connect(master);

      // Reverbs
      plateGain.connect(master); hallGain.connect(master);

      // Chorus A → L
      srcChoA.connect(choHiPass); choHiPass.connect(choAGain);
      choAGain.connect(panL); panL.connect(master);

      // Chorus B → R
      srcChoB.connect(choHiPass); choHiPass.connect(choBGain);
      choBGain.connect(panR); panR.connect(master);

      // Undertone → low-passed, quiet, centered
      srcUnder.connect(underLow); underLow.connect(underGain);
      underGain.connect(master);

      master.connect(ctx.destination);

      let ended = false;
      srcMain.onended = () => {
        if (!ended) { ended = true; activeSources = []; onDone?.(); }
      };

      const t = ctx.currentTime + 0.01;
      srcMain.start(t); srcChoA.start(t); srcChoB.start(t); srcUnder.start(t);
      return;
    }
  } catch (_) {}

  // ── Browser TTS fallback ──
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
  window.speechSynthesis?.cancel();
}

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
      <div className="ai-panel-banner">
        <img src={PANEL} alt="RUSHMORE" />
        <div className="ai-panel-overlay"><img src={LOGO} alt="" className="ai-panel-logo" /></div>
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
