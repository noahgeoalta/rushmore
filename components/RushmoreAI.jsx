"use client";

import { useState, useRef, useEffect } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const PANEL = img("images/Rushmore/Rushmore Panel.png");
const LOGO  = img("images/Rushmore/Rushmore Logo.png");

function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[#*`_~\[\]()]/g, "").replace(/\n+/g, " ").trim();
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find(v => /daniel|george|arthur|oliver|aaron|fred/i.test(v.name)) ||
    voices.find(v => v.lang === "en-GB") ||
    voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.92; utt.pitch = 0.85; utt.volume = 1;
  window.speechSynthesis.speak(utt);
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
  content: "RUSHMORE online. All systems nominal.\n\nI have full context on GeoAlta, GeoComforter, ChronoSlate, NMGCO, The Order, and TheGame. GitHub actions and Microsoft Graph are not yet wired — everything else, ask away."
};

export default function RushmoreAI() {
  const [messages, setMessages] = useState([BOOT_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text) => {
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
      if (ttsOn) speak(reply);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const toggleVoice = () => {
    if (listening) { recognitionRef.current?.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported. Use Chrome."); return; }
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e) => send(e.results[0][0].transcript);
    recognitionRef.current = rec;
    rec.start();
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="ai-shell">
      {/* Hero panel — logo + image only, no text overlay */}
      <div className="ai-panel-banner">
        <img src={PANEL} alt="RUSHMORE" />
        <div className="ai-panel-overlay">
          <img src={LOGO} alt="" className="ai-panel-logo" />
        </div>
      </div>

      {/* Status bar */}
      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-status-dot" />
          <span className="ai-online-label">ONLINE</span>
        </div>
        <div className="ai-header-right">
          <button className={`ai-ctrl-btn ${ttsOn ? "active" : ""}`} onClick={() => { setTtsOn(t => !t); if (ttsOn) window.speechSynthesis?.cancel(); }}>
            {ttsOn ? "◉ VOICE OUT" : "○ VOICE OUT"}
          </button>
          <button className="ai-ctrl-btn" onClick={() => setMessages([BOOT_MSG])}>CLEAR</button>
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
        <button className={`ai-mic-btn ${listening ? "listening" : ""}`} onClick={toggleVoice} title={listening ? "Stop" : "Voice input"}>
          {listening ? "●" : "🎙"}
        </button>
        <textarea
          className="ai-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? "Listening..." : "Command RUSHMORE..."}
          rows={1}
          spellCheck={false}
        />
        <button className="ai-send-btn" onClick={() => send()} disabled={loading || !input.trim()}>SEND</button>
      </div>
    </div>
  );
}
