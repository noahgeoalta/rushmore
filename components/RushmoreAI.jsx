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

// ── Audio FX chain ────────────────────────────────────────────────────────────
// Builds an impulse response for a large chamber reverb
function makeImpulse(ctx, duration = 2.5, decay = 3.0) {
  const rate    = ctx.sampleRate;
  const length  = rate * duration;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = impulse.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

let audioCtx = null;
function getCtx() {
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

let currentSource = null;
let currentAudioEl = null;

async function speakWithFX(text, onDone) {
  if (typeof window === "undefined") return;

  // Stop anything playing
  try { currentSource?.stop(); } catch (_) {}
  currentSource = null;
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
  window.speechSynthesis?.cancel();

  const clean = text.replace(/[#*`_~\[\]()>]/g, "").replace(/\n+/g, " ").trim();

  // ── Try ElevenLabs + Web Audio FX ──
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

      // Source
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      currentSource = source;

      // 1. Pitch shift down — playback rate < 1 lowers pitch
      //    0.82 ≈ down ~3 semitones, noticeably deeper without sounding broken
      source.playbackRate.value = 0.82;

      // 2. Low-shelf boost — adds body/weight to the voice
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type      = "lowshelf";
      lowShelf.frequency.value = 300;
      lowShelf.gain.value      = 6;  // +6dB below 300Hz

      // 3. High-shelf cut — removes brightness, makes it darker/grittier
      const highShelf = ctx.createBiquadFilter();
      highShelf.type      = "highshelf";
      highShelf.frequency.value = 3500;
      highShelf.gain.value      = -8; // -8dB above 3.5kHz

      // 4. Mild waveshaper distortion — adds grit/edge
      const waveshaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      const amount = 18; // subtle — just enough crunch
      for (let i = 0; i < 256; i++) {
        const x = (i * 2) / 256 - 1;
        curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
      }
      waveshaper.curve   = curve;
      waveshaper.oversample = "4x";

      // 5. Convolver reverb — large chamber echo
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 2.0, 3.5);

      // 6. Wet/dry mix — 25% reverb, 75% dry
      const dryGain = ctx.createGain();  dryGain.gain.value  = 0.75;
      const wetGain = ctx.createGain();  wetGain.gain.value  = 0.25;
      const master  = ctx.createGain();  master.gain.value   = 1.1;

      // Chain: source → lowShelf → highShelf → waveshaper → [dry + wet]
      source.connect(lowShelf);
      lowShelf.connect(highShelf);
      highShelf.connect(waveshaper);
      waveshaper.connect(dryGain);
      waveshaper.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(master);
      wetGain.connect(master);
      master.connect(ctx.destination);

      source.onended = () => { currentSource = null; onDone?.(); };
      source.start(0);
      return;
    }
    // 503 = not configured, fall through
  } catch (_) {}

  // ── Browser TTS fallback ──
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(v => /google uk english male/i.test(v.name)) ||
    voices.find(v => /microsoft george/i.test(v.name)) ||
    voices.find(v => /microsoft david/i.test(v.name)) ||
    voices.find(v => /daniel/i.test(v.name)) ||
    voices.find(v => v.lang === "en-GB") ||
    voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.88; utt.pitch = 0.75; utt.volume = 1;
  utt.onend  = () => onDone?.();
  utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  try { currentSource?.stop(); } catch (_) {}
  currentSource = null;
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
  window.speechSynthesis?.cancel();
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
          if (continuousRef.current) {
            setTimeout(() => { if (continuousRef.current) startListening(); }, 600);
          }
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
    if (continuous) {
      setContinuous(false); continuousRef.current = false;
      stopListening(); stopSpeech();
    } else {
      setContinuous(true); continuousRef.current = true;
      setTtsOn(true); startListening();
    }
  };

  const toggleOneShotMic = () => {
    if (listening) { stopListening(); return; }
    startListening();
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const cost     = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;

  return (
    <div className="ai-shell">
      <div className="ai-panel-banner">
        <img src={PANEL} alt="RUSHMORE" />
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
          <button
            className={`ai-ctrl-btn${continuous ? " active" : ""}`}
            onClick={toggleContinuous}
            title={continuous ? "Turn off continuous voice mode" : "Turn on continuous voice mode"}
          >
            {continuous
              ? (listening ? "\u25cf LISTENING" : speaking ? "\u25b6 SPEAKING" : "\u25cc WAITING")
              : "\u25cb CONTINUOUS"}
          </button>
          <button
            className={`ai-ctrl-btn${ttsOn && !continuous ? " active" : ""}`}
            onClick={() => { if (continuous) return; setTtsOn(t => !t); if (ttsOn) stopSpeech(); }}
            style={{ opacity: continuous ? 0.35 : 1 }}
          >
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
        <button
          className={`ai-mic-btn${listening ? " listening" : ""}${continuous ? " continuous" : ""}`}
          onClick={continuous ? toggleContinuous : toggleOneShotMic}
        >
          {continuous ? (listening ? "\u25cf" : speaking ? "\u25b6" : "\u25cc") : (listening ? "\u25cf" : "\uD83C\uDFA4")}
        </button>
        <textarea
          className="ai-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={
            continuous
              ? (listening ? "Listening..." : speaking ? "RUSHMORE speaking..." : "Waiting for your voice...")
              : (listening ? "Listening..." : "Command RUSHMORE...")
          }
          rows={1}
          spellCheck={false}
        />
        <button className="ai-send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}>SEND</button>
      </div>
    </div>
  );
}
