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

// Shorter, tighter hall impulse
function makeImpulse(ctx, duration = 1.0, decay = 4.0) {
  const rate   = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf    = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay) * (c === 0 ? 1 : 0.95);
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

let currentSource  = null;
let currentSource2 = null;
let currentSource3 = null;

// -1.5 semitones = 2^(-1.5/12)
const PITCH_BASE = Math.pow(2, -1.5 / 12); // ~0.9159

async function speakWithFX(text, onDone) {
  if (typeof window === "undefined") return;
  try { currentSource?.stop();  } catch (_) {}
  try { currentSource2?.stop(); } catch (_) {}
  try { currentSource3?.stop(); } catch (_) {}
  currentSource = currentSource2 = currentSource3 = null;
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

      // ── EQ ──
      // High-pass: kill boom below 200Hz
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass";
      hiPass.frequency.value = 200;
      hiPass.Q.value = 0.8;

      // Low-mid notch: scoop out ~400Hz muddiness
      const midNotch = ctx.createBiquadFilter();
      midNotch.type = "peaking";
      midNotch.frequency.value = 420;
      midNotch.Q.value = 1.5;
      midNotch.gain.value = -5;

      // Presence: forward clarity
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3200;
      presence.Q.value = 1.0;
      presence.gain.value = 4;

      // Air: crystalline high end
      const airShelf = ctx.createBiquadFilter();
      airShelf.type = "highshelf";
      airShelf.frequency.value = 8000;
      airShelf.gain.value = 5;

      // Brilliance sparkle at 12kHz
      const brilliance = ctx.createBiquadFilter();
      brilliance.type = "peaking";
      brilliance.frequency.value = 12000;
      brilliance.Q.value = 0.8;
      brilliance.gain.value = 3;

      // ── Reverb ── short + tight (1.0s, fast decay)
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 1.0, 4.0);

      // ── Echoes ──
      // Near echo: 40ms — the tight ghost
      const echo1 = ctx.createDelay(0.5);
      echo1.delayTime.value = 0.04;
      const echo1Gain = ctx.createGain();
      echo1Gain.gain.value = 0.32;

      // Mid echo: 95ms — second ghost, replaced the too-long 130ms
      const echo2 = ctx.createDelay(0.5);
      echo2.delayTime.value = 0.095;
      const echo2Gain = ctx.createGain();
      echo2Gain.gain.value = 0.16;

      // ── Stereo width — pan chorus copies L/R ──
      const panL = ctx.createStereoPanner();
      panL.pan.value = -0.4;
      const panR = ctx.createStereoPanner();
      panR.pan.value = 0.4;

      // ── Gains ──
      const dryGain   = ctx.createGain(); dryGain.gain.value   = 1.0;
      const reverbGain = ctx.createGain(); reverbGain.gain.value = 0.18; // tighter reverb mix
      const chorusAGain = ctx.createGain(); chorusAGain.gain.value = 0.18;
      const chorusBGain = ctx.createGain(); chorusBGain.gain.value = 0.14;
      const master = ctx.createGain(); master.gain.value = 0.82;

      // ── 3 sources: base + chorus detuned copies ──
      // Base: -1.5 semitones
      const src1 = ctx.createBufferSource();
      src1.buffer = decoded;
      src1.playbackRate.value = PITCH_BASE;
      currentSource = src1;

      // Chorus A: -1.5 semitones + 14 cents up
      const src2 = ctx.createBufferSource();
      src2.buffer = decoded;
      src2.playbackRate.value = PITCH_BASE * 1.008;
      currentSource2 = src2;

      // Chorus B: -1.5 semitones + 12 cents down
      const src3 = ctx.createBufferSource();
      src3.buffer = decoded;
      src3.playbackRate.value = PITCH_BASE * 0.993;
      currentSource3 = src3;

      // ── Routing ──
      // Main EQ chain
      const eqChain = (src) => {
        src.connect(hiPass);
      };
      hiPass.connect(midNotch);
      midNotch.connect(presence);
      presence.connect(airShelf);
      airShelf.connect(brilliance);

      // Main voice through full EQ
      src1.connect(hiPass);

      // Dry
      brilliance.connect(dryGain);
      dryGain.connect(master);

      // Echoes
      brilliance.connect(echo1);
      echo1.connect(echo1Gain);
      echo1Gain.connect(master);

      brilliance.connect(echo2);
      echo2.connect(echo2Gain);
      echo2Gain.connect(master);

      // Reverb
      brilliance.connect(convolver);
      convolver.connect(reverbGain);
      reverbGain.connect(master);

      // Chorus A → pan left
      const chorusHiPass = ctx.createBiquadFilter();
      chorusHiPass.type = "highpass";
      chorusHiPass.frequency.value = 300;
      src2.connect(chorusHiPass);
      chorusHiPass.connect(chorusAGain);
      chorusAGain.connect(panL);
      panL.connect(master);

      // Chorus B → pan right
      const chorusHiPass2 = ctx.createBiquadFilter();
      chorusHiPass2.type = "highpass";
      chorusHiPass2.frequency.value = 300;
      src3.connect(chorusHiPass2);
      chorusHiPass2.connect(chorusBGain);
      chorusBGain.connect(panR);
      panR.connect(master);

      master.connect(ctx.destination);

      let ended = false;
      src1.onended = () => {
        if (!ended) { ended = true; currentSource = currentSource2 = currentSource3 = null; onDone?.(); }
      };

      const t = ctx.currentTime + 0.01;
      src1.start(t);
      src2.start(t);
      src3.start(t);
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
  utt.onend  = () => onDone?.();
  utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  try { currentSource?.stop();  } catch (_) {}
  try { currentSource2?.stop(); } catch (_) {}
  try { currentSource3?.stop(); } catch (_) {}
  currentSource = currentSource2 = currentSource3 = null;
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

  const cost     = calcCost(usage.inTok, usage.outTok);
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
