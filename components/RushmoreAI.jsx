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

// Large hall impulse response
function makeImpulse(ctx, duration = 3.0, decay = 2.5) {
  const rate   = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf    = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // Slightly different L/R for width
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay) * (c === 0 ? 1 : 0.95);
    }
  }
  return buf;
}

// Simple chorus: delayed + pitch-modulated copy of signal
function makeChorusBuf(ctx, delayMs = 25, depth = 0.003) {
  // We approximate chorus with a static delay + slight detune
  // Real chorus needs an LFO; we use two static offset copies for the ethereal layer
  return delayMs / 1000;
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

async function speakWithFX(text, onDone) {
  if (typeof window === "undefined") return;

  // Stop anything playing
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

      // ── Shared FX nodes ──

      // High-pass: cut everything below 180Hz — Templars are NOT bassy
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass";
      hiPass.frequency.value = 180;
      hiPass.Q.value = 0.7;

      // Air shelf: boost 8kHz+ for that bright crystalline quality
      const airShelf = ctx.createBiquadFilter();
      airShelf.type = "highshelf";
      airShelf.frequency.value = 8000;
      airShelf.gain.value = 4; // +4dB air

      // Presence peak: forward, clear, cuts through reverb
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = 3200;
      presence.Q.value = 1.0;
      presence.gain.value = 3;

      // Large hall reverb
      const convolver = ctx.createConvolver();
      convolver.buffer = makeImpulse(ctx, 3.0, 2.5);

      // Short echo 1 — 40ms, the near ghost-layer
      const echo1 = ctx.createDelay(0.5);
      echo1.delayTime.value = 0.04;
      const echo1Gain = ctx.createGain();
      echo1Gain.gain.value = 0.35;

      // Short echo 2 — 130ms, the further ghost
      const echo2 = ctx.createDelay(0.5);
      echo2.delayTime.value = 0.13;
      const echo2Gain = ctx.createGain();
      echo2Gain.gain.value = 0.20;

      // Chorus layer A — slightly detuned copy at 20ms
      const chorusA = ctx.createDelay(0.1);
      chorusA.delayTime.value = 0.020;
      const chorusAGain = ctx.createGain();
      chorusAGain.gain.value = 0.18;

      // Chorus layer B — slightly detuned copy at 35ms (opposite phase offset = width)
      const chorusB = ctx.createDelay(0.1);
      chorusB.delayTime.value = 0.035;
      const chorusBGain = ctx.createGain();
      chorusBGain.gain.value = 0.14;

      // Wet/dry
      const dryGain = ctx.createGain();  dryGain.gain.value  = 1.0;
      const reverbGain = ctx.createGain(); reverbGain.gain.value = 0.30;

      // Master — keep headroom
      const master = ctx.createGain(); master.gain.value = 0.85;

      // ── Source 1: main voice (no pitch shift) ──
      const src1 = ctx.createBufferSource();
      src1.buffer = decoded;
      src1.playbackRate.value = 1.0; // NO pitch shift
      currentSource = src1;

      // ── Source 2: chorus copy A, very slightly faster (tiny pitch up) ──
      const src2 = ctx.createBufferSource();
      src2.buffer = decoded;
      src2.playbackRate.value = 1.008; // ~14 cents up
      currentSource2 = src2;

      // ── Source 3: chorus copy B, very slightly slower (tiny pitch down) ──
      const src3 = ctx.createBufferSource();
      src3.buffer = decoded;
      src3.playbackRate.value = 0.993; // ~12 cents down
      currentSource3 = src3;

      // ── Main chain ──
      // src1 → hiPass → presence → airShelf → dry + echo1 + echo2 + reverb
      src1.connect(hiPass);
      hiPass.connect(presence);
      presence.connect(airShelf);

      airShelf.connect(dryGain);   // dry
      dryGain.connect(master);

      airShelf.connect(echo1);     // 40ms echo
      echo1.connect(echo1Gain);
      echo1Gain.connect(master);

      airShelf.connect(echo2);     // 130ms echo
      echo2.connect(echo2Gain);
      echo2Gain.connect(master);

      airShelf.connect(convolver); // hall reverb
      convolver.connect(reverbGain);
      reverbGain.connect(master);

      // ── Chorus copies go through same EQ then into master at lower volume ──
      const chorusEQ = ctx.createBiquadFilter();
      chorusEQ.type = "highpass";
      chorusEQ.frequency.value = 300; // chorus layers are thinner

      src2.connect(chorusEQ);
      chorusEQ.connect(chorusAGain);
      chorusAGain.connect(master);

      src3.connect(chorusEQ);
      chorusEQ.connect(chorusBGain);
      chorusBGain.connect(master);

      master.connect(ctx.destination);

      let ended = false;
      src1.onended = () => {
        if (!ended) { ended = true; currentSource = currentSource2 = currentSource3 = null; onDone?.(); }
      };

      // Start all three in sync
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
