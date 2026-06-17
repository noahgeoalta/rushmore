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

// ── TTS ──────────────────────────────────────────────────────────────────────
// Try ElevenLabs first; fall back to browser TTS if not configured or on error.
let currentAudio = null;

async function speak(text, onDone) {
  if (typeof window === "undefined") return;

  // Stop anything currently playing
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis?.cancel();

  const clean = text.replace(/[#*`_~\[\]()>]/g, "").replace(/\n+/g, " ").trim();

  // ── Try ElevenLabs ──
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; onDone?.(); };
      audio.onerror = () => { URL.revokeObjectURL(url); currentAudio = null; onDone?.(); };
      await audio.play();
      return;
    }
    // 503 = not configured, fall through to browser TTS
  } catch (_) {
    // network error, fall through
  }

  // ── Browser TTS fallback ──
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  // Prefer deep/British male voices that approximate the gravelly Richter tone
  const preferred =
    voices.find(v => /google uk english male/i.test(v.name)) ||
    voices.find(v => /microsoft george/i.test(v.name)) ||
    voices.find(v => /microsoft david/i.test(v.name)) ||
    voices.find(v => /daniel/i.test(v.name)) ||
    voices.find(v => v.lang === "en-GB" && v.name.toLowerCase().includes("male")) ||
    voices.find(v => v.lang === "en-GB") ||
    voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate   = 0.88;  // slightly slower = more gravitas
  utt.pitch  = 0.75;  // lower pitch = closer to Richter
  utt.volume = 1;
  utt.onend  = () => onDone?.();
  utt.onerror = () => onDone?.();
  window.speechSynthesis.speak(utt);
}

function stopSpeech() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis?.cancel();
}

// ── Components ───────────────────────────────────────────────────────────────
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
  const [messages,  setMessages]  = useState([BOOT_MSG]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [ttsOn,     setTtsOn]     = useState(false);
  // continuous = mic auto-restarts after each response
  const [continuous, setContinuous] = useState(false);
  const [listening,  setListening]  = useState(false);
  const [speaking,   setSpeaking]   = useState(false);
  const [usage,     setUsage]     = useState({ inTok: 0, outTok: 0, calls: 0 });
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const continuousRef  = useRef(false); // stable ref so callbacks read current value

  // Keep ref in sync
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Start a single mic session
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(_) {} }

    const rec = new SR();
    rec.continuous      = false;
    rec.interimResults  = false;
    rec.lang            = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      sendMessage(transcript);
    };
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
      const data = await res.json();
      const reply = data.content?.[0]?.text || data.error?.message || "[No response]";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);

      if (data.usage) {
        setUsage(prev => ({
          inTok:  prev.inTok  + (data.usage.input_tokens  || 0),
          outTok: prev.outTok + (data.usage.output_tokens || 0),
          calls:  prev.calls  + 1,
        }));
      }

      // Speak the reply, then restart mic if continuous mode is on
      if (ttsOn || continuousRef.current) {
        setSpeaking(true);
        speak(reply, () => {
          setSpeaking(false);
          if (continuousRef.current) {
            // Small pause before re-listening so it doesn't pick up its own echo
            setTimeout(() => { if (continuousRef.current) startListening(); }, 600);
          }
        });
      } else if (continuousRef.current) {
        // TTS off but continuous on — just restart mic immediately
        setTimeout(() => { if (continuousRef.current) startListening(); }, 300);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    stopSpeech();
    stopListening();
    setContinuous(false);
    setMessages([BOOT_MSG]);
    setUsage({ inTok: 0, outTok: 0, calls: 0 });
  };

  // Toggle continuous mode
  const toggleContinuous = () => {
    if (continuous) {
      // Turn off
      setContinuous(false);
      continuousRef.current = false;
      stopListening();
      stopSpeech();
    } else {
      // Turn on — start listening immediately
      setContinuous(true);
      continuousRef.current = true;
      setTtsOn(true); // continuous mode implies voice output
      startListening();
    }
  };

  // Manual one-shot mic press (when not in continuous mode)
  const toggleOneShotMic = () => {
    if (listening) { stopListening(); return; }
    startListening();
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const cost      = calcCost(usage.inTok, usage.outTok);
  const totalTok  = usage.inTok + usage.outTok;

  // Mic button label/state
  const micLabel   = listening ? "\u25cf" : "\uD83C\uDFA4";
  const micTitle   = continuous
    ? (listening ? "Listening... (click to stop continuous mode)" : speaking ? "Speaking..." : "Waiting...")
    : (listening ? "Stop" : "Voice input");

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
          {/* Continuous mode toggle — the main voice button */}
          <button
            className={`ai-ctrl-btn${continuous ? " active" : ""}`}
            onClick={toggleContinuous}
            title={continuous ? "Turn off continuous voice mode" : "Turn on continuous voice mode — mic stays on"}
          >
            {continuous
              ? (listening ? "\u25cf LISTENING" : speaking ? "\u25b6 SPEAKING" : "\u25cc WAITING")
              : "\u25cb CONTINUOUS"}
          </button>
          {/* One-shot TTS toggle (voice output only, no auto-listen) */}
          <button
            className={`ai-ctrl-btn${ttsOn && !continuous ? " active" : ""}`}
            onClick={() => { if (continuous) return; setTtsOn(t => !t); if (ttsOn) stopSpeech(); }}
            title="Toggle voice output only"
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
        {/* One-shot mic (only useful when not in continuous mode) */}
        <button
          className={`ai-mic-btn${listening ? " listening" : ""}${continuous ? " continuous" : ""}`}
          onClick={continuous ? toggleContinuous : toggleOneShotMic}
          title={micTitle}
        >
          {continuous ? (listening ? "\u25cf" : speaking ? "\u25b6" : "\u25cc") : micLabel}
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
