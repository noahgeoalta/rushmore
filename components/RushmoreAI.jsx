"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const img = (p) => `/api/img?path=${encodeURIComponent(p)}`;
const VIDEO_SRC = img("images/Rushmore/RushMORE (1).mp4");

const PRICE_IN  = 3.00;
const PRICE_OUT = 15.00;
function calcCost(inTok, outTok) {
  return (inTok / 1_000_000) * PRICE_IN + (outTok / 1_000_000) * PRICE_OUT;
}

const st = (n) => Math.pow(2, n / 12);
const BASE  = -2.0;
const CHO_A = BASE + 14 / 100;
const CHO_B = BASE - 12 / 100;
const UNDER = BASE - 0.25;

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

function makeSatCurve(amount = 12) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
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

      // ── EQ ──
      const hiPass = ctx.createBiquadFilter();
      hiPass.type = "highpass"; hiPass.frequency.value = 200; hiPass.Q.value = 0.7;
      const lowShelf = ctx.createBiquadFilter();
      lowShelf.type = "lowshelf"; lowShelf.frequency.value = 250; lowShelf.gain.value = -3;
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

      // ── Saturation ──
      const sat = ctx.createWaveShaper();
      sat.curve = makeSatCurve(12);
      sat.oversample = "2x";
      brilliance.connect(sat);

      // ── Compressor ──
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8;
      comp.ratio.value = 2.5; comp.attack.value = 0.005; comp.release.value = 0.120;
      const compGain = ctx.createGain(); compGain.gain.value = 1.0;
      sat.connect(comp); comp.connect(compGain);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass"; bandpass.frequency.value = 2200; bandpass.Q.value = 0.4;
      const bpGain = ctx.createGain(); bpGain.gain.value = 0.25;
      compGain.connect(bandpass); bandpass.connect(bpGain);

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.6;
      analyserNode = analyser;

      // ── Reverb ──
      const plate = ctx.createConvolver(); plate.buffer = makeImpulse(ctx, 0.6, 4.0);
      const plateGain = ctx.createGain(); plateGain.gain.value = 0.75;
      compGain.connect(plate); plate.connect(plateGain);

      const hallPre = ctx.createDelay(0.5); hallPre.delayTime.value = 0.025;
      const hall = ctx.createConvolver(); hall.buffer = makeImpulse(ctx, 1.0, 2.8);
      const hallGain = ctx.createGain(); hallGain.gain.value = 0.70;
      compGain.connect(hallPre); hallPre.connect(hall); hall.connect(hallGain);

      const chamberPre = ctx.createDelay(0.5); chamberPre.delayTime.value = 0.055;
      const chamber = ctx.createConvolver(); chamber.buffer = makeImpulse(ctx, 1.4, 2.0);
      const chamberGain = ctx.createGain(); chamberGain.gain.value = 0.45;
      compGain.connect(chamberPre); chamberPre.connect(chamber); chamber.connect(chamberGain);

      // ── Echo taps (original 4 unchanged, + 2 new taps added) ──
      const makeTrailEcho = (dt, gain, maxDt = 0.8) => {
        const d = ctx.createDelay(maxDt); d.delayTime.value = dt;
        const g = ctx.createGain(); g.gain.value = gain;
        compGain.connect(d); d.connect(g); return g;
      };
      const t1 = makeTrailEcho(0.080, 0.30);
      const t2 = makeTrailEcho(0.160, 0.18);
      const t3 = makeTrailEcho(0.280, 0.09);
      const t4 = makeTrailEcho(0.420, 0.04);
      // NEW: two extra taps for a slightly longer robot tail
      const t5 = makeTrailEcho(0.560, 0.02);
      const t6 = makeTrailEcho(0.700, 0.01);

      const panL = ctx.createStereoPanner(); panL.pan.value = -0.45;
      const panR = ctx.createStereoPanner(); panR.pan.value =  0.45;
      const choHiPass = ctx.createBiquadFilter(); choHiPass.type = "highpass"; choHiPass.frequency.value = 300;
      const choAGain = ctx.createGain(); choAGain.gain.value = 0.16;
      const choBGain = ctx.createGain(); choBGain.gain.value = 0.12;

      const underLow = ctx.createBiquadFilter(); underLow.type = "lowpass"; underLow.frequency.value = 4000;
      const underGain = ctx.createGain(); underGain.gain.value = 0.08;

      const master = ctx.createGain(); master.gain.value = 0.35;

      srcMain.connect(hiPass);
      compGain.connect(analyser); analyser.connect(master);
      const dryGain = ctx.createGain(); dryGain.gain.value = 0.20;
      compGain.connect(dryGain); dryGain.connect(master);
      bpGain.connect(master);
      [t1, t2, t3, t4, t5, t6].forEach(e => e.connect(master));
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

function useVideoFX(darkRef, bloomRef) {
  const rafRef      = useRef(null);
  const dataArr     = useRef(null);
  const darknessRef = useRef(0.43);

  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const dark  = darkRef.current;
      const bloom = bloomRef.current;
      if (!dark || !bloom) return;
      const t = Date.now() / 1400;

      if (!analyserNode) {
        darknessRef.current = Math.min(0.43, darknessRef.current + 0.015);
        dark.style.opacity = darknessRef.current.toFixed(3);
        // CHANGED: idle bloom much dimmer (was 0.06/0.04) so speaking glow pops
        const a = (0.02 + 0.015 * Math.sin(t)).toFixed(3);
        bloom.style.background =
          `radial-gradient(ellipse 70% 70% at 50% 50%, rgba(30,200,30,${a}) 0%, transparent 70%)`;
        return;
      }

      if (!dataArr.current || dataArr.current.length !== analyserNode.frequencyBinCount)
        dataArr.current = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(dataArr.current);
      let sum = 0;
      for (let i = 0; i < dataArr.current.length; i++) sum += dataArr.current[i] ** 2;
      const rms = Math.sqrt(sum / dataArr.current.length) / 255;

      const targetDark = Math.max(0.0, 0.20 - rms * 0.20);
      darknessRef.current += (targetDark - darknessRef.current) * 0.12;
      dark.style.opacity = darknessRef.current.toFixed(3);

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
  const [messages,  setMessages]  = useState([BOOT_MSG]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [voiceOut,  setVoiceOut]  = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const [usage,     setUsage]     = useState({ inTok: 0, outTok: 0, calls: 0 });
  const bottomRef      = useRef(null);
  const recognitionRef = useRef(null);
  const voiceOutRef    = useRef(true);
  const continuousRef  = useRef(false);
  const darkRef        = useRef(null);
  const bloomRef       = useRef(null);

  useVideoFX(darkRef, bloomRef);

  useEffect(() => { voiceOutRef.current = voiceOut; }, [voiceOut]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const startListening = useCallback(async () => {
    if (navigator.mediaDevices?.getUserMedia) {
      try { await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (_) { return; }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }
    try { recognitionRef.current?.stop(); } catch (_) {}
    const rec = new SR();
    rec.continuous = false; rec.interimResults = false; rec.lang = "en-US";
    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = (e) => { console.warn("SR error", e.error); setListening(false); };
    rec.onresult = (e) => { const t = e.results[0]?.[0]?.transcript; if (t) sendMessage(t); };
    recognitionRef.current = rec;
    try { rec.start(); } catch (e) { console.warn("SR start failed", e); }
  }, []); // eslint-disable-line

  const stopListening = useCallback(() => {
    continuousRef.current = false;
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
        speakWithFX(reply, () => {
          setSpeaking(false);
          if (continuousRef.current) {
            setTimeout(() => { if (continuousRef.current) startListening(); }, 400);
          }
        });
      } else {
        if (continuousRef.current) {
          setTimeout(() => { if (continuousRef.current) startListening(); }, 400);
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const resetAll    = () => { stopSpeech(); stopListening(); setVoiceOut(true); voiceOutRef.current = true; setMessages([BOOT_MSG]); setUsage({ inTok: 0, outTok: 0, calls: 0 }); };
  const toggleVoice = () => { if (voiceOut) { setVoiceOut(false); stopSpeech(); } else { setVoiceOut(true); } };
  const handleKey   = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };
  const toggleMic   = () => {
    if (continuousRef.current) { stopListening(); }
    else { continuousRef.current = true; startListening(); }
  };

  const cost     = calcCost(usage.inTok, usage.outTok);
  const totalTok = usage.inTok + usage.outTok;

  return (
    <div className="ai-shell">
      <div className="ai-video-strip">
        <div className="ai-video-sticky">
          <video src={VIDEO_SRC} autoPlay loop muted playsInline className="ai-video-main" />
          <div className="ai-video-dark"  ref={darkRef}  />
          <div className="ai-video-bloom" ref={bloomRef} />
        </div>
      </div>

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
          {speaking  && <span className="ai-speaking-label">&#9654; SPEAKING</span>}
          {listening && <span className="ai-listening-label">&#9679; LISTENING</span>}
        </div>
        <div className="ai-header-right">
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
        <div className="ai-voice-btns">
          <button
            className={`ai-mic-btn${continuousRef.current || listening ? " listening" : ""}`}
            onClick={toggleMic}
            title={continuousRef.current ? "Continuous on — tap to stop" : "Tap to talk (continuous)"}
          >
            {listening ? "\u25cf" : "MIC"}
          </button>
          <button
            className={`ai-voice-out-btn${voiceOut ? " active" : ""}`}
            onClick={toggleVoice}
            title={voiceOut ? "Voice output on — click to mute" : "Voice output off — click to enable"}
          >
            {voiceOut ? "VOX ON" : "VOX OFF"}
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
