"use client";
import { useState } from "react";

export default function CommandBar() {
  const [cmd, setCmd] = useState("");
  const [voiceActive, setVoiceActive] = useState(false);

  return (
    <div className="cmd-bar">
      <div className="cmd-bar-inner">
        <div className="cmd-bar-label">INPUT command:</div>
        <input
          className="cmd-bar-input"
          type="text"
          value={cmd}
          onChange={e => setCmd(e.target.value)}
          placeholder="..."
          spellCheck={false}
        />
        <button
          className={"cmd-bar-btn voice" + (voiceActive ? " active" : "")}
          onClick={() => setVoiceActive(v => !v)}
        >
          {voiceActive ? "● VOICE" : "VOICE MODE"}
        </button>
        <button className="cmd-bar-btn review">REVIEW</button>
        <div className="cmd-bar-usage">
          <span className="cmd-bar-usage-label">USAGE %:</span>
          <span className="cmd-bar-usage-val">—</span>
        </div>
      </div>
    </div>
  );
}
