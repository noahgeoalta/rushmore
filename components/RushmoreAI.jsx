"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const VIDEO_SRC = img("images/Rushmore/RushMORE (1).mp4");

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

// ── Audio FX ─────────────────────────────────────────────────────────────
// Radio/intercom character:
//   - Hard HPF at 300 Hz  (cut low-end rumble + body)
//   - Hard LPF at 5500 Hz (cut air + sibilance, simulate cheap driver)
//   - Mid-range bell boost 1800 Hz (nasally intercom presence)
//   - Mid-range bell boost 2800 Hz (telephone clarity)
//   - Light waveshaper saturation (grit/buzz texture)
//   - Compressor (dynamic control like a limiter)
//   - Short room reverb only (no lush hall)

let audioCtx      = null;
let analyserNode  = null;
let activeSources = [];

function getCtx() {
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function makeSource(ctx, decoded) {
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  activeSources.push(src);
  return src;
}

// Waveshaper curve for light tape saturation
function makeSatCurve(amount = 60) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function makeRoomImpulse(ctx, duration = 0.4, decay = 6.0) {
  const rate   = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const buf    = ctx.createBuffer(2, length, rate);
  for (let c = 0; c < 2; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return buf;
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
      const src      = makeSource(ctx, decoded);

      // ── EQ chain: radio bandwidth ──
      // Hard high-pass at 300 Hz — cut everything below (body, warmth, chest)
      const hpf = ctx.createBiquadFilter();
      hpf.type = "highpass"; hpf.frequency.value = 300; hpf.Q.value = 1.4;

      // Hard low-pass at 5500 Hz — cut air, sibilance, high harmonics
      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass"; lpf.frequency.value = 5500; lpf.Q.value = 1.2;

      // Bell boost at 1800 Hz — nasally intercom character
      const mid1 = ctx.createBiquadFilter();
      mid1.type = "peaking"; mid1.frequency.value = 1800; mid1.Q.value = 1.4; mid1.gain.value = 6;

      // Bell boost at 2800 Hz — telephone/walkie-talkie intelligibility
      const mid2 = ctx.createBiquadFilter();
      mid2.type = "peaking"; mid2.frequency.value = 2800; mid2.Q.value = 1.2; mid2.gain.value = 5;

      // Slight cut at 500 Hz to hollow out the mid-low mud
      const mud = ctx.createBiquadFilter();
      mud.type = "peaking"; mud.frequency.value = 500; mud.Q.value = 1.0; mud.gain.value = -5;

      hpf.connect(lpf); lpf.connect(mud); mud.connect(mid1); mid1.connect(mid2);

      // ── Light waveshaper saturation ──
      const sat = ctx.createWaveShaper();
      sat.curve = makeSatCurve(50);
      sat.oversample = "2x";
      mid2.connect(sat);

      // ── Compressor / limiter ──
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 4;
      comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.08;
      const compGain = ctx.createGain(); compGain.gain.value = 1.2;
      sat.connect(comp); comp.connect(compGain);

      // ── Analyser for bloom glow ──
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.55;
      analyserNode = analyser;
      compGain.connect(analyser);

      // ── Very short room reverb only (no lush hall) ──
      const room = ctx.createConvolver(); room.buffer = makeRoomImpulse(ctx, 0.35, 7);
      const roomGain = ctx.createGain(); roomGain.gain.value = 0.18;
      compGain.connect(room); room.connect(roomGain);

      // ── Short echo (single repeat, phone-booth style) ──
      const echo = ctx.createDelay(0.5); echo.delayTime.value = 0.06;
      const echoGain = ctx.createGain(); echoGain.gain.value = 0.15;
      compGain.connect(echo); echo.connect(echoGain);

      // ── Master ──
      const master = ctx.createGain(); master.gain.value = 0.85;
      analyser.connect(master);
      roomGain.connect(master);
      echoGain.connect(master);
      master.connect(ctx.destination);

      let ended = false;
      src.onended = () => { if (!ended) { ended = true; analyserNode = null; activeSources = []; onDone?.(); } };
      src.connect(hpf);
      src.start(ctx.currentTime + 0.01);
      return;
    }
  } catch (_) {}
  // Fallback: browser TTS
  const utt = new SpeechSynthesisUtterance(clean);
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => /google uk english male/i.test(v.name))
    || voices.find(v => /microsoft george/i.test(v.name))
    || voices.find(v => /daniel/i.test(v.name))
    || voices.find(v => v.lang === "en-GB")
    || voices.find(v => v.lang.startsWith("en"));
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

// ── Video darkening + bloom glow ─────────────────────────────────────────
// darkRef  = the dark overlay div (on top of video, below bloom)
// bloomRef = the colour glow div (on top of dark overlay)
// When idle (not speaking): dark overlay is heavy (~0.65 opacity black)
// When speaking: dark overlay fades out, bloom pulses bright
function useVideoFX(darkRef, bloomRef) {
  const rafRef  = useRef(null);
  const dataArr = useRef(null);
  // Current darkness level — animated smoothly
  const darknessRef = useRef(0.65); // 0 = clear, 1 = black

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const dark  = darkRef.current;
      const bloom = bloomRef.current;
      if (!dark || !bloom) return;

      const t = Date.now() / 1400;

      if (!analyserNode) {
        // ── Idle: dark + faint slow-breathing green ──
        // Ease darkness UP toward 0.65
        darknessRef.current = Math.min(0.65, darknessRef.current + 0.015);
        dark.style.opacity = darknessRef.current.toFixed(3);

        // Faint idle breath
        const a = (0.06 + 0.04 * Math.sin(t)).toFixed(3);
        bloom.style.background =
          `radial-gradient(ellipse 70% 70% at 50% 50%, rgba(30,200,30,${a}) 0%, transparent 70%)`;
        return;
      }

      // ── Speaking: analyse audio ──
      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount)
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArr.current);
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255;

      // Ease darkness DOWN as voice gets louder
      const targetDark = Math.max(0.0, 0.30 - rms * 0.30);
      darknessRef.current += (targetDark - darknessRef.current) * 0.12;
      dark.style.opacity = darknessRef.current.toFixed(3);

      // Bloom pulses with the voice
      const r  = Math.round(30  + rms * 200);
      const g  = Math.round(200 + rms * 55);
      const b  = Math.round(10  + rms * 20);
      const a1 = Math.min(0.90, 0.20 + rms * 0.70).toFixed(2);
      const a2 = Math.min(0.45, 0.07 + rms * 0.38).toFixed(2);
      const a3 = Math.min(0.15, 0.02 + rms * 0.13).toFixed(2);
      bloom.style.background =
        `radial-gradient(ellipse 85% 85% at 50% 50%, rgba(${r},${g},${b},${a1}) 0%, rgba(${r},${g},${b},${a2}) 45%, rgba(${r},${g},${b},${a3}) 65%, transparent 82%)`;
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [darkRef, bloomRef]);
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
  const [voiceOut,   setVoiceOut]   = useState(false);  // TTS output toggle
  const [listening,  setListening]  = useState(false);
  const [speaking,   setSpeaking]   = useState(false);
  const [usage,      setUsage]      = useState({ inTok: 0, outTok: 0, calls: 0 });
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const voiceOutRef    = useRef(false);
  const darkRef        = useRef(null);
  const bloomRef       = useRef(null);

  useVideoFX(darkRef, bloomRef);

  useEffect(() => { voiceOutRef.current = voiceOut; }, [voiceOut]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // ── Mobile-safe speech recognition ──
  // Uses a fresh instance each time (avoids Safari stale-ref bug).
  // Requests permission explicitly on iOS via getUserMedia before starting.
  const startListening = useCallback(async () => {
    // Ensure mic permission on mobile (especially iOS Safari)
    if (navigator.mediaDevices?.getUserMedia) {
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { return; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }
    // Stop any existing instance
    try { recognitionRef.current?.stop(); } catch (_) {}
    const rec = new SR();
    rec.continuous     = false;
    rec.interimResults = false;
    rec.lang           = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = (e) => { console.warn("SR error", e.error); setListening(false); };
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript;
      if (transcript) sendMessage(transcript);
    };
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn("SR start failed", e); }
  }, []); // eslint-disable-line

  const stopListening = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) {}
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
      if (voiceOutRef.current) {
        setSpeaking(true);
        speakWithFX(reply, () => setSpeaking(false));
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const resetAll = () => {
    stopSpeech(); stopListening();
    setVoiceOut(false); voiceOutRef.current = false;
    setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 });
  };

  const toggleMic   = () => { if (listening) { stopListening(); } else { startListening(); } };
  const toggleVoice = () => { if (voiceOut) { setVoiceOut(false); stopSpeech(); } else { setVoiceOut(true); } };
  const handleKey   = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const cost      = calcCost(usage.inTok, usage.outTok);
  const totalTok  = usage.inTok + usage.outTok;

  return (
    <div className="ai-shell">

      {/* Full-width strip — video centred at max 900px */}
      <div className="ai-video-strip">
        <div className="ai-video-sticky">
          <video src={VIDEO_SRC} autoPlay loop muted playsInline className="ai-video-main" />
          {/* Dark overlay — heavy when idle, clears when speaking */}
          <div className="ai-video-dark" ref={darkRef} />
          {/* Bloom overlay — colour glow ON TOP of dark layer */}
          <div className="ai-video-bloom" ref={bloomRef} />
        </div>
      </div>

      {/* Status bar */}
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
          {speaking && <span className="ai-speaking-label">&#9654; SPEAKING</span>}
          {listening && <span className="ai-listening-label">&#9679; LISTENING</span>}
        </div>
        <div className="ai-header-right">
          <button className="ai-ctrl-btn" onClick={resetAll}>CLEAR</button>
        </div>
      </div>

      {/* Chat feed */}
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

      {/* Input bar — mic + voice out on left, textarea, send */}
      <div className="ai-input-bar">
        <div className="ai-voice-btns">
          <button
            className={`ai-mic-btn${listening ? " listening" : ""}`}
            onClick={toggleMic}
            title={listening ? "Stop listening" : "Tap to speak"}
          >
            {listening ? "\u25cf" : "\uD83C\uDFA4"}
          </button>
          <button
            className={`ai-voice-out-btn${voiceOut ? " active" : ""}`}
            onClick={toggleVoice}
            title={voiceOut ? "Voice out on" : "Voice out off"}
          >
            {voiceOut ? "\uD83D\uDD0A" : "\uD83D\uDD07"}
          </button>
        </div>
        <textarea
          className="ai-textarea"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder={listening ? "Listening..." : speaking ? "RUSHMORE speaking..." : "Command RUSHMORE..."}
          rows={1}
          spellCheck={false}
        />
        <button className="ai-send-btn" onClick={() => sendMessage()} disabled={loading || !input.trim()}>SEND</button>
      </div>
    </div>
  );
}
