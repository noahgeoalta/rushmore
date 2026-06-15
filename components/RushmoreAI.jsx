"use client";

import { useState, useRef, useEffect } from "react";

// ── System prompt with full project context ──────────────────────────────────
const SYSTEM_PROMPT = `You are RUSHMORE — a personal command intelligence built for Noah Garcia. You are not a generic assistant. You are sharp, direct, and deeply familiar with every project Noah is running. You have the personality of Q from Star Trek: brilliant, slightly theatrical, always several steps ahead, but ultimately loyal and useful. You don't waste words. You don't over-explain unless asked. You act.

Noah runs the following ventures and projects:

## WORK (noah@geoalta.com)

### GeoAlta
- Core company. Environmental sensing and data solutions.
- GitHub: GeoAltaSolutions/GeoAlta-QuestLog
- Board: github.com/GeoAltaSolutions/GeoAlta-QuestLog/projects
- SharePoint: GeoAlta Team Site
- Claude projects: GeoAlta Priv, GeoAlta Website, Meeting Organizer, QuestLog Project Creator

### GeoComforter
- GeoAlta's indoor air quality product line.
- GitHub: GeoAltaSolutions/GeoComforter-QuestLog (Dev Board + Biz Board)
- SharePoint: Comforter Development SP + Business Growth SP
- Claude projects: Riipen Overlord, GeoComforter QuestLog
- Active Riipen partnership with Red River College (Project RRC):
  - Team 2: Smoke/PM2.5
  - Team 3: CO2
  - Team 4: Temp/Humidity
  - Team 5: Radon

### ChronoSlate
- Time tracking / scheduling product.
- GitHub: GeoAltaSolutions/ChronoSlate-QuestLog (Dev Board + Biz Board)
- SharePoint: ChronoSlate SP
- Claude project: ChronoSlate QuestLog

### NMGCO (New Mexico Gas Company)
- Client project.
- GitHub: GeoAltaSolutions/NMGCO-QuestLog
- Board: github.com/orgs/GeoAltaSolutions/projects/21
- SharePoint: NMGCO SP
- Claude project: NMGCO QuestLog

## PERSONAL (noahjgarciak@gmail.com)

### The Order
- Personal development / life operating system project.
- GitHub: noahgeoalta/The-Order (The Order Board)
- Claude projects: Doctrine and Order, Helforge

### TheGame
- Game development project.
- GitHub: noahgeoalta/TheGame (TheGame Board)
- Claude projects: TheGame Development, Gaming

### Other personal
- Claude project: Life
- Tools: Gmail, NoahTube (YouTube Studio), RBC banking, ChatGPT, Copilot

## RUSHMORE itself
- This system. GitHub: noahgeoalta/rushmore
- Live at: rushmore-phi.vercel.app
- Built with Next.js, deployed on Vercel.

## HOW YOU OPERATE
- When Noah asks about a project, you know it. Don't ask him to remind you.
- When he says "the boards" he means GitHub project boards.
- When he says "QuestLog" he means the GitHub issue-based task system used across ventures.
- When he asks you to do something you can't yet do (like directly push to GitHub or read emails), be honest — tell him what's not wired up yet and what is.
- Currently wired: conversation, project knowledge, voice input.
- Not yet wired: GitHub API actions, Microsoft Graph (email/calendar/Teams), file operations.
- Keep responses tight. Use short paragraphs or bullets. Never pad.
- If Noah gives a voice command, treat it exactly like a typed message.
- Sign off important responses with a subtle RUSHMORE flair if the moment calls for it.`;

// ── Voice synthesis ──────────────────────────────────────────────────────────
function speak(text) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  // Strip markdown for speech
  const clean = text.replace(/[#*`_~\[\]()]/g, "").replace(/\n+/g, " ").trim();
  const utt = new SpeechSynthesisUtterance(clean);
  // Pick the best available voice — prefer a deep male British/neutral voice
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    /daniel|george|arthur|oliver|aaron|fred/i.test(v.name)
  ) || voices.find(v => v.lang === "en-GB" && v.name.toLowerCase().includes("male"))
    || voices.find(v => v.lang === "en-GB")
    || voices.find(v => v.lang.startsWith("en"));
  if (preferred) utt.voice = preferred;
  utt.rate = 0.92;
  utt.pitch = 0.85;
  utt.volume = 1;
  window.speechSynthesis.speak(utt);
}

// ── Typing indicator ─────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="ai-typing">
      <span /><span /><span />
    </div>
  );
}

// ── Single message bubble ─────────────────────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────────
export default function RushmoreAI() {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "RUSHMORE online. All systems nominal.\n\nI have full context on GeoAlta, GeoComforter, ChronoSlate, NMGCO, The Order, and TheGame. GitHub actions and Microsoft Graph are not yet wired — everything else, ask away."
  }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [ttsOn, setTtsOn] = useState(false);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Send message ────────────────────────────────────────────────────────────
  const send = async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg = { role: "user", content };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        }),
      });

      const data = await res.json();
      const reply = data.content?.[0]?.text || "[No response]";
      const assistantMsg = { role: "assistant", content: reply };
      setMessages(prev => [...prev, assistantMsg]);
      if (ttsOn) speak(reply);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  // ── Voice input ─────────────────────────────────────────────────────────────
  const toggleVoice = () => {
    if (!voiceOn) {
      setVoiceOn(true);
      startListening();
    } else {
      setVoiceOn(false);
      stopListening();
    }
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser. Try Chrome."); return; }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onstart = () => setListening(true);
    rec.onend = () => { setListening(false); setVoiceOn(false); };
    rec.onerror = () => { setListening(false); setVoiceOn(false); };
    rec.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      send(transcript);
    };
    recognitionRef.current = rec;
    rec.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="ai-shell">
      {/* Header strip */}
      <div className="ai-header">
        <div className="ai-header-left">
          <span className="ai-status-dot" />
          <span className="ai-header-title">RUSHMORE <span>INTELLIGENCE</span></span>
        </div>
        <div className="ai-header-right">
          <button
            className={`ai-ctrl-btn ${ttsOn ? "active" : ""}`}
            onClick={() => { setTtsOn(t => !t); if (ttsOn) window.speechSynthesis?.cancel(); }}
            title="Toggle voice output"
          >
            {ttsOn ? "◉ VOICE OUT" : "○ VOICE OUT"}
          </button>
          <button
            className="ai-ctrl-btn"
            onClick={() => setMessages([{
              role: "assistant",
              content: "RUSHMORE online. All systems nominal.\n\nI have full context on GeoAlta, GeoComforter, ChronoSlate, NMGCO, The Order, and TheGame. GitHub actions and Microsoft Graph are not yet wired — everything else, ask away."
            }])}
            title="Clear conversation"
          >
            CLEAR
          </button>
        </div>
      </div>

      {/* Message feed */}
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

      {/* Input bar */}
      <div className="ai-input-bar">
        <button
          className={`ai-mic-btn ${listening ? "listening" : voiceOn ? "active" : ""}`}
          onClick={toggleVoice}
          title="Voice input"
        >
          {listening ? "●" : "🎙"}
        </button>
        <textarea
          ref={inputRef}
          className="ai-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? "Listening..." : "Command RUSHMORE..."}
          rows={1}
          spellCheck={false}
        />
        <button
          className="ai-send-btn"
          onClick={() => send()}
          disabled={loading || !input.trim()}
        >
          SEND
        </button>
      </div>
    </div>
  );
}
