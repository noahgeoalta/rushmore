"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const CKEY = "rushmore-canvas-v4";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const newLine = (type = "none", text = "", indent = 0, fontSize = 14) => ({
  id: uid(), type, text, indent, fontSize, collapsed: false,
});
const newBox = (x, y) => ({ id: uid(), x, y, w: 360, lines: [newLine()] });
const emptyPage = () => ({ id: uid(), name: "Main", boxes: [] });
const emptyState = () => { const p = emptyPage(); return { pages: [p], activeId: p.id }; };

function migrateLine(n) {
  if (!n) return [newLine()];
  const lines = [];
  function walk(node, depth) {
    lines.push(newLine(node.type || (node.bullet ? "bullet" : "none"), node.text || "", depth, node.fontSize || 14));
    if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, depth + 1));
  }
  walk(n, 0);
  return lines;
}

function migrateState(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.pages)) return emptyState();
    s.pages = s.pages.map((p) => ({
      ...p,
      boxes: Array.isArray(p.boxes) ? p.boxes.map((b) => ({
        ...b,
        lines: Array.isArray(b.lines)
          ? b.lines.flatMap((l) => Array.isArray(l.children) ? migrateLine(l) : [newLine(l.type || "none", l.text || "", l.indent || 0, l.fontSize || 14)])
          : [newLine()],
      })) : [],
    }));
    if (!s.activeId || !s.pages.find((p) => p.id === s.activeId)) s.activeId = s.pages[0]?.id;
    return s;
  } catch { return emptyState(); }
}

function domToLines(editorEl) {
  const lines = [];
  for (const row of editorEl.querySelectorAll(".cv-row")) {
    lines.push({
      id: row.dataset.lid || uid(),
      type: row.dataset.type || "none",
      text: row.querySelector(".cv-text")?.textContent || "",
      indent: parseInt(row.dataset.indent || "0", 10),
      fontSize: parseInt(row.dataset.fs || "14", 10),
      collapsed: row.dataset.collapsed === "true",
    });
  }
  return lines.length ? lines : [newLine()];
}

function htmlToLines(html) {
  if (typeof document === "undefined") return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const out = [];
  function getLiText(li) {
    let t = "";
    for (const node of li.childNodes) {
      if (node.nodeType === 3) t += node.textContent;
      else if (!["ul","ol"].includes(node.tagName?.toLowerCase())) t += node.textContent;
    }
    return t.trim();
  }
  function walkList(el, indent, type) {
    for (const li of el.children) {
      if (li.tagName?.toLowerCase() !== "li") continue;
      out.push(newLine(type, getLiText(li), indent));
      for (const child of li.children) {
        const t = child.tagName?.toLowerCase();
        if (t === "ul") walkList(child, indent + 1, "bullet");
        else if (t === "ol") walkList(child, indent + 1, "number");
      }
    }
  }
  function walkEl(el, indent = 0) {
    const tag = el.tagName?.toLowerCase();
    if (tag === "ul") { walkList(el, indent, "bullet"); return; }
    if (tag === "ol") { walkList(el, indent, "number"); return; }
    if (tag === "p" || tag === "div" || tag === "li") { const text = el.textContent?.trim(); if (text) out.push(newLine("none", text, indent)); return; }
    for (const child of el.children) walkEl(child, indent);
  }
  for (const child of div.children) walkEl(child);
  return out;
}

export default function Canvas() {
  const [state, setState] = useState(null);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [lasso, setLasso] = useState(null);
  const [selBoxId, setSelBoxId] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [dragPage, setDragPage] = useState(null);
  const [overPage, setOverPage] = useState(null);
  const cvRef = useRef(null);
  const boxRefs = useRef({});
  const editorRefs = useRef({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CKEY) || localStorage.getItem("rushmore-canvas-v3") || localStorage.getItem("rushmore-canvas-v2") || localStorage.getItem("rushmore-canvas-v1");
      setState(raw ? migrateState(raw) : emptyState());
    } catch { setState(emptyState()); }
  }, []);

  useEffect(() => { if (state) try { localStorage.setItem(CKEY, JSON.stringify(state)); } catch {} }, [state]);

  useEffect(() => {
    if (!drag && !resize) return;
    const move = (e) => {
      if (drag) { const nx = Math.max(0, drag.ox + e.clientX - drag.sx); const ny = Math.max(0, drag.oy + e.clientY - drag.sy); setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === drag.id); if (b) { b.x = nx; b.y = ny; } return ns; }); }
      if (resize) { const nw = Math.max(160, resize.ow + e.clientX - resize.sx); setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === resize.id); if (b) b.w = nw; return ns; }); }
    };
    const up = () => { setDrag(null); setResize(null); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, resize]);

  useEffect(() => {
    if (!lasso) return;
    const move = (e) => { const r = cvRef.current?.getBoundingClientRect(); if (!r) return; setLasso((l) => l ? { ...l, ex: e.clientX - r.left, ey: e.clientY - r.top } : null); };
    const up = (e) => {
      if (lasso && cvRef.current) {
        const r = cvRef.current.getBoundingClientRect();
        const ex = e.clientX - r.left, ey = e.clientY - r.top;
        const minX = Math.min(lasso.sx, ex), maxX = Math.max(lasso.sx, ex), minY = Math.min(lasso.sy, ey), maxY = Math.max(lasso.sy, ey);
        if (maxX - minX > 4 || maxY - minY > 4) {
          const pg = state?.pages.find((p) => p.id === state.activeId) || state?.pages[0];
          const hit = pg?.boxes.find((b) => { const bh = boxRefs.current[b.id]?.offsetHeight || 80; return b.x < maxX && b.x + b.w > minX && b.y < maxY && b.y + bh > minY; });
          if (hit) { setSelBoxId(hit.id); editorRefs.current[hit.id]?.focus(); }
        }
      }
      setLasso(null);
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [lasso, state]);

  if (!state) return null;
  const page = state.pages.find((p) => p.id === state.activeId) || state.pages[0];
  const canvasW = Math.max(800, ...page.boxes.map((b) => b.x + b.w + 80));
  const canvasH = Math.max(600, ...page.boxes.map((b) => b.y + (boxRefs.current[b.id]?.offsetHeight || 100) + 80));

  const mut = (fn, rec = true) => setState((s) => {
    if (rec) { setHistory((h) => [...h.slice(-60), s]); setFuture([]); }
    const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; fn(pg); return ns;
  });

  const undo = () => { if (!history.length) return; setFuture((f) => [state, ...f]); setState(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, state]); setState(future[0]); setFuture((f) => f.slice(1)); };

  const addPage = () => { const name = prompt("Page name:", "New page"); if (!name) return; const p = emptyPage(); p.name = name; setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id })); };
  const delPage = (id) => { if (!confirm("Delete page?")) return; setState((s) => { const pages = s.pages.filter((p) => p.id !== id); const safe = pages.length ? pages : [emptyPage()]; return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId }; }); };
  const renamePage = (id) => { const pg = state.pages.find((p) => p.id === id); const name = prompt("Rename:", pg.name); if (name) setState((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, name } : p) })); };
  const dropPage = (id) => { if (!dragPage || dragPage === id) return; setState((s) => { const pages = [...s.pages]; const fi = pages.findIndex((p) => p.id === dragPage); const ti = pages.findIndex((p) => p.id === id); const [m] = pages.splice(fi, 1); pages.splice(ti, 0, m); return { ...s, pages }; }); setDragPage(null); setOverPage(null); };

  const addBox = (x, y) => { const b = newBox(x, y); mut((pg) => pg.boxes.push(b)); setSelBoxId(b.id); setTimeout(() => editorRefs.current[b.id]?.focus(), 50); };
  const delBox = (id) => { mut((pg) => { pg.boxes = pg.boxes.filter((b) => b.id !== id); }); setSelBoxId(null); };
  const cleanEmptyBox = (id) => { const box = page.boxes.find((b) => b.id === id); if (!box) return; if (box.lines.length === 1 && !box.lines[0].text && box.lines[0].type === "none" && box.lines[0].indent === 0) delBox(id); };

  const syncEditor = (boxId, editorEl) => { const lines = domToLines(editorEl); mut((pg) => { const b = pg.boxes.find((b) => b.id === boxId); if (b) b.lines = lines; }, false); };

  function getCaretRow(editorEl) {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== editorEl) { if (node.classList?.contains("cv-row")) return node; node = node.parentElement; }
    return null;
  }
  function updateRowIndent(row) { row.style.paddingLeft = (parseInt(row.dataset.indent || "0", 10) * 20) + "px"; }
  function renderRowMarker(row) {
    const type = row.dataset.type || "none";
    let marker = row.querySelector(".cv-row-marker");
    if (!marker) { marker = document.createElement("span"); marker.className = "cv-row-marker"; row.prepend(marker); }
    if (type === "bullet") { marker.textContent = "\u2022"; marker.style.display = "inline-block"; }
    else if (type === "number") {
      const indent = parseInt(row.dataset.indent || "0", 10); let n = 0; let prev = row;
      while ((prev = prev.previousElementSibling)) { if (prev.dataset.type === "number" && parseInt(prev.dataset.indent || "0") === indent) n++; else if (parseInt(prev.dataset.indent || "0") < indent) break; }
      marker.textContent = (n + 1) + "."; marker.style.display = "inline-block";
    } else { marker.style.display = "none"; }
  }
  function buildRow(line) {
    const row = document.createElement("div"); row.className = "cv-row";
    row.dataset.lid = line.id || uid(); row.dataset.type = line.type || "none";
    row.dataset.indent = line.indent || 0; row.dataset.fs = line.fontSize || 14;
    row.dataset.collapsed = line.collapsed || false;
    row.style.paddingLeft = ((line.indent || 0) * 20) + "px";
    const marker = document.createElement("span"); marker.className = "cv-row-marker";
    if (line.type === "bullet") marker.textContent = "\u2022";
    else if (line.type === "number") marker.textContent = "1.";
    else marker.style.display = "none";
    row.appendChild(marker);
    if (line.type === "image" && line.src) {
      const img = document.createElement("img"); img.src = line.src; img.className = "cv-row-img"; row.appendChild(img);
    } else {
      const text = document.createElement("span"); text.className = "cv-text";
      text.style.fontSize = (line.fontSize || 14) + "px"; text.textContent = line.text || "";
      row.appendChild(text);
    }
    return row;
  }
  function buildEditorDom(lines) { const f = document.createDocumentFragment(); lines.forEach((l) => f.appendChild(buildRow(l))); return f; }

  const editorRefCallback = useCallback((el, boxId, lines) => {
    if (!el) return;
    editorRefs.current[boxId] = el;
    const existing = [...el.querySelectorAll(".cv-row")].map((r) => r.dataset.lid);
    const expected = lines.map((l) => l.id);
    if (existing.join(",") !== expected.join(",")) { el.innerHTML = ""; el.appendChild(buildEditorDom(lines)); }
    else {
      const rows = [...el.querySelectorAll(".cv-row")];
      lines.forEach((line, i) => {
        const row = rows[i]; if (!row) return;
        const textEl = row.querySelector(".cv-text");
        if (textEl && document.activeElement !== textEl && document.activeElement !== row && textEl.textContent !== line.text) textEl.textContent = line.text;
        if (row.dataset.type !== line.type) { row.dataset.type = line.type; renderRowMarker(row); }
        if (parseInt(row.dataset.indent) !== line.indent) { row.dataset.indent = line.indent; updateRowIndent(row); }
        const fs = String(line.fontSize || 14);
        if (row.dataset.fs !== fs) { row.dataset.fs = fs; if (textEl) textEl.style.fontSize = fs + "px"; }
      });
    }
  }, []);

  const onEditorKeyDown = (e, boxId) => {
    if (e.ctrlKey && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }
    if (e.key === "Escape") { e.preventDefault(); setSelBoxId(null); e.currentTarget.blur(); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const row = getCaretRow(e.currentTarget); if (!row) return;
      const indent = parseInt(row.dataset.indent || "0", 10);
      if (e.shiftKey) { if (indent > 0) row.dataset.indent = indent - 1; } else { row.dataset.indent = indent + 1; }
      updateRowIndent(row); syncEditor(boxId, e.currentTarget); return;
    }
    if (e.ctrlKey && !e.shiftKey && e.key === ".") { e.preventDefault(); const row = getCaretRow(e.currentTarget); if (row) { row.dataset.type = row.dataset.type === "bullet" ? "none" : "bullet"; renderRowMarker(row); syncEditor(boxId, e.currentTarget); } return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "/") { e.preventDefault(); const row = getCaretRow(e.currentTarget); if (row) { row.dataset.type = row.dataset.type === "number" ? "none" : "number"; renderRowMarker(row); syncEditor(boxId, e.currentTarget); } return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "." || e.key === ">")) { e.preventDefault(); const row = getCaretRow(e.currentTarget); if (row) { const fs = Math.min(48, parseInt(row.dataset.fs || "14", 10) + 2); row.dataset.fs = fs; const t = row.querySelector(".cv-text"); if (t) t.style.fontSize = fs + "px"; syncEditor(boxId, e.currentTarget); } return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "-" || e.key === "_")) { e.preventDefault(); const row = getCaretRow(e.currentTarget); if (row) { const fs = Math.max(10, parseInt(row.dataset.fs || "14", 10) - 2); row.dataset.fs = fs; const t = row.querySelector(".cv-text"); if (t) t.style.fontSize = fs + "px"; syncEditor(boxId, e.currentTarget); } return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "v") { e.preventDefault(); handlePaste(e.currentTarget, boxId); return; }
  };

  const handlePaste = async (editorEl, boxId) => {
    try {
      const items = await navigator.clipboard.read().catch(() => null);
      if (items) {
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) { const blob = await item.getType(imgType); const reader = new FileReader(); reader.onload = () => { const row = getCaretRow(editorEl) || editorEl.querySelector(".cv-row:last-child"); if (row) { const ir = buildRow({ ...newLine("image"), src: reader.result }); row.after(ir); syncEditor(boxId, editorEl); } }; reader.readAsDataURL(blob); return; }
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html"); const parsed = htmlToLines(await htmlBlob.text());
            if (parsed.length) { const row = getCaretRow(editorEl); let ins = row || editorEl.querySelector(".cv-row:last-child"); for (const line of parsed) { const nr = buildRow(line); if (ins) { ins.after(nr); ins = nr; } else editorEl.appendChild(nr); } syncEditor(boxId, editorEl); return; }
          }
        }
      }
      const text = await navigator.clipboard.readText(); if (!text.trim()) return;
      const rows = text.split("\n").filter((l) => l.trim()); const row = getCaretRow(editorEl);
      let ins = row || editorEl.querySelector(".cv-row:last-child");
      for (const t of rows) { const nr = buildRow(newLine("none", t.trim())); if (ins) { ins.after(nr); ins = nr; } else editorEl.appendChild(nr); }
      syncEditor(boxId, editorEl);
    } catch {}
  };

  const lassoRect = lasso ? { left: Math.min(lasso.sx, lasso.ex || lasso.sx), top: Math.min(lasso.sy, lasso.ey || lasso.sy), width: Math.abs((lasso.ex || lasso.sx) - lasso.sx), height: Math.abs((lasso.ey || lasso.sy) - lasso.sy) } : null;

  return (
    <>
      <div className="notes-bar">
        {state.pages.map((p) => (
          <button key={p.id} className={"page-tab" + (p.id === state.activeId ? " active" : "") + (overPage === p.id && dragPage !== p.id ? " page-drag-over" : "")} draggable onDragStart={() => setDragPage(p.id)} onDragEnd={() => { setDragPage(null); setOverPage(null); }} onDragOver={(e) => { e.preventDefault(); setOverPage(p.id); }} onDragLeave={() => setOverPage(null)} onDrop={() => dropPage(p.id)} onClick={() => { setState((s) => ({ ...s, activeId: p.id })); setSelBoxId(null); }} onDoubleClick={() => renamePage(p.id)} title="Double-click to rename">
            {p.name}<span className="x" onClick={(e) => { e.stopPropagation(); delPage(p.id); }}>x</span>
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <div className="notes-toolbar">
          <button className="notes-btn" onClick={undo} disabled={!history.length}>Undo</button>
          <button className="notes-btn" onClick={redo} disabled={!future.length}>Redo</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Bullet (Ctrl+.)" onClick={() => { const ed = selBoxId && editorRefs.current[selBoxId]; if (!ed) return; const row = getCaretRow(ed); if (row) { row.dataset.type = row.dataset.type === "bullet" ? "none" : "bullet"; renderRowMarker(row); syncEditor(selBoxId, ed); } }}>•</button>
          <button className="notes-btn" title="Number (Ctrl+/)" onClick={() => { const ed = selBoxId && editorRefs.current[selBoxId]; if (!ed) return; const row = getCaretRow(ed); if (row) { row.dataset.type = row.dataset.type === "number" ? "none" : "number"; renderRowMarker(row); syncEditor(selBoxId, ed); } }}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Smaller" onClick={() => { const ed = selBoxId && editorRefs.current[selBoxId]; if (!ed) return; const row = getCaretRow(ed); if (row) { const fs = Math.max(10, parseInt(row.dataset.fs || "14") - 2); row.dataset.fs = fs; const t = row.querySelector(".cv-text"); if (t) t.style.fontSize = fs + "px"; syncEditor(selBoxId, ed); } }}>A-</button>
          <button className="notes-btn" title="Larger" onClick={() => { const ed = selBoxId && editorRefs.current[selBoxId]; if (!ed) return; const row = getCaretRow(ed); if (row) { const fs = Math.min(48, parseInt(row.dataset.fs || "14") + 2); row.dataset.fs = fs; const t = row.querySelector(".cv-text"); if (t) t.style.fontSize = fs + "px"; syncEditor(selBoxId, ed); } }}>A+</button>
          <span className="notes-sep" />
          {selBoxId && <button className="notes-btn cv-del-btn" onClick={() => delBox(selBoxId)}>Del box</button>}
        </div>
        <span className="notes-hint">Dbl-click canvas for box  |  drag top bar to move  |  click-drag to select text  |  Ctrl+V paste  |  Tab/Shift+Tab indent</span>
      </div>
      <div className="cv-canvas" ref={cvRef} style={{ width: canvasW, minHeight: canvasH }}
        onDoubleClick={(e) => { if (e.target !== cvRef.current) return; const r = cvRef.current.getBoundingClientRect(); addBox(e.clientX - r.left - 180, e.clientY - r.top - 14); }}
        onMouseDown={(e) => { if (e.target !== cvRef.current) return; setSelBoxId(null); const r = cvRef.current.getBoundingClientRect(); setLasso({ sx: e.clientX - r.left, sy: e.clientY - r.top, ex: e.clientX - r.left, ey: e.clientY - r.top }); }}
        onClick={(e) => { if (e.target === cvRef.current) setSelBoxId(null); }}
      >
        {lassoRect && lassoRect.width > 4 && <div style={{ position: "absolute", border: "1px solid #ff8c3a", background: "rgba(255,140,58,0.05)", borderRadius: 4, pointerEvents: "none", left: lassoRect.left, top: lassoRect.top, width: lassoRect.width, height: lassoRect.height }} />}
        {page.boxes.map((box) => (
          <div key={box.id} ref={(el) => (boxRefs.current[box.id] = el)}
            className={"cv-box" + (selBoxId === box.id ? " selected" : "")}
            style={{ left: box.x, top: box.y, width: box.w }}
            onClick={(e) => { e.stopPropagation(); setSelBoxId(box.id); }}
          >
            <div className="cv-drag-bar" onMouseDown={(e) => { if (e.target.closest(".cv-editor")) return; e.preventDefault(); setDrag({ id: box.id, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y }); setSelBoxId(box.id); }} title="Drag to move" />
            <div className="cv-editor"
              ref={(el) => editorRefCallback(el, box.id, box.lines)}
              contentEditable suppressContentEditableWarning spellCheck={false}
              onFocus={() => setSelBoxId(box.id)}
              onBlur={() => setTimeout(() => { if (!editorRefs.current[box.id]?.contains(document.activeElement)) cleanEmptyBox(box.id); }, 200)}
              onInput={(e) => syncEditor(box.id, e.currentTarget)}
              onKeyDown={(e) => onEditorKeyDown(e, box.id)}
              onPaste={(e) => { e.preventDefault(); }}
            />
            <div className="cv-resize" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResize({ id: box.id, sx: e.clientX, ow: box.w }); }} title="Drag to resize" />
          </div>
        ))}
        {page.boxes.length === 0 && <div className="cv-empty">Double-click anywhere to create a text box</div>}
      </div>
    </>
  );
}
