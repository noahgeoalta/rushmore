"use client";

import { useEffect, useRef, useState } from "react";

const CKEY = "rushmore-canvas-v2";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const BULLET = "\u2022";
const CC = "\u25b6";
const CO = "\u25bc";

const newLine = (type = "none") => ({ id: uid(), text: "", type, fontSize: 14, collapsed: false, children: [] });
const newBox = (x, y) => ({ id: uid(), x, y, w: 320, kind: "text", lines: [newLine()] });
const newImgBox = (x, y, src) => ({ id: uid(), x, y, w: 320, kind: "image", src });
const emptyState = () => { const p = { id: uid(), name: "Main", boxes: [] }; return { pages: [p], activeId: p.id }; };

function loc(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { list: nodes, i, node: nodes[i] };
    const h = loc(nodes[i].children, id);
    if (h) return h;
  }
  return null;
}
function vids(nodes, out = []) {
  for (const n of nodes) { out.push(n.id); if (!n.collapsed) vids(n.children, out); }
  return out;
}
function numInList(list, idx) {
  let n = 0;
  for (let i = 0; i <= idx; i++) if (list[i].type === "number") n++;
  return n;
}

function parseHtmlToLines(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  const lines = [];
  function walk(el) {
    const tag = el.tagName?.toLowerCase();
    if (tag === "li") {
      const text = el.childNodes[0]?.textContent?.trim() || "";
      const line = newLine("bullet");
      line.text = text;
      for (const child of el.children) {
        if (child.tagName?.toLowerCase() === "ul" || child.tagName?.toLowerCase() === "ol") {
          const type = child.tagName.toLowerCase() === "ol" ? "number" : "bullet";
          for (const li of child.children) {
            const sub = newLine(type);
            sub.text = li.childNodes[0]?.textContent?.trim() || "";
            for (const c2 of li.children) {
              if (c2.tagName?.toLowerCase() === "ul" || c2.tagName?.toLowerCase() === "ol") {
                const t2 = c2.tagName.toLowerCase() === "ol" ? "number" : "bullet";
                for (const li2 of c2.children) { const s2 = newLine(t2); s2.text = li2.textContent?.trim() || ""; sub.children.push(s2); }
              }
            }
            line.children.push(sub);
          }
        }
      }
      lines.push(line);
    } else if (tag === "p" || tag === "div") {
      const text = el.textContent?.trim();
      if (text) { const l = newLine("none"); l.text = text; lines.push(l); }
    } else {
      for (const child of el.children) walk(child);
    }
  }
  for (const child of div.children) walk(child);
  return lines;
}

function parsePlainToLines(text) {
  const rawLines = text.split("\n").filter((l) => l.trim());
  const nodes = [];
  let i = 0;
  while (i < rawLines.length) {
    const raw = rawLines[i];
    const spaces = raw.match(/^([\t ]*)/)[1].length;
    if (spaces > 0) { i++; continue; }
    const content = raw.trimStart();
    let type = "none", t = content;
    if (content.startsWith("* ") || content.startsWith("\u2022 ")) { type = "bullet"; t = content.slice(2); }
    else if (/^\d+\. /.test(content)) { type = "number"; t = content.replace(/^\d+\. /, ""); }
    const childLines = [];
    let j = i + 1;
    while (j < rawLines.length && rawLines[j].match(/^([\t ]*)/)[1].length > 0) { childLines.push(rawLines[j].slice(rawLines[j].match(/^(\t| {2})/)?.[0]?.length || 1)); j++; }
    const node = newLine(type); node.text = t;
    if (childLines.length) node.children = parsePlainToLines(childLines.join("\n"));
    nodes.push(node); i = j;
  }
  return nodes;
}

let _dragLineId = null;

export default function Canvas() {
  const [state, setState] = useState(null);
  const [selBox, setSelBox] = useState(null);
  const [selLines, setSelLines] = useState(new Set());
  const [lastSel, setLastSel] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [focusCaret, setFocusCaret] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [lineDrop, setLineDrop] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [dragPage, setDragPage] = useState(null);
  const [overPage, setOverPage] = useState(null);
  const cvRef = useRef(null);
  const inputs = useRef({});

  useEffect(() => {
    try { const raw = localStorage.getItem(CKEY); setState(raw ? JSON.parse(raw) : emptyState()); }
    catch { setState(emptyState()); }
  }, []);

  useEffect(() => {
    if (state) try { localStorage.setItem(CKEY, JSON.stringify(state)); } catch {}
  }, [state]);

  useEffect(() => {
    if (!focusId) return;
    let raf;
    const go = () => {
      const el = inputs.current[focusId]; if (!el) return;
      el.focus();
      if (focusCaret !== null) { el.setSelectionRange(focusCaret, focusCaret); setFocusCaret(null); }
      setFocusId(null);
    };
    go();
    raf = typeof window !== "undefined" ? window.requestAnimationFrame(go) : null;
    return () => { if (raf) window.cancelAnimationFrame(raf); };
  }, [focusId, focusCaret, state]);

  useEffect(() => {
    if (!drag && !resize) return;
    const move = (e) => {
      if (drag) {
        const nx = Math.max(0, drag.ox + e.clientX - drag.sx);
        const ny = Math.max(0, drag.oy + e.clientY - drag.sy);
        setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === drag.id); if (b) { b.x = nx; b.y = ny; } return ns; });
      }
      if (resize) {
        const nw = Math.max(120, resize.ow + e.clientX - resize.sx);
        setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === resize.id); if (b) b.w = nw; return ns; });
      }
    };
    const up = () => { setDrag(null); setResize(null); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, resize]);

  if (!state) return null;
  const page = state.pages.find((p) => p.id === state.activeId) || state.pages[0];

  const mut = (fn, rec = true) => setState((s) => {
    if (rec) { setHistory((h) => [...h.slice(-60), s]); setFuture([]); }
    const ns = structuredClone(s);
    const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0];
    fn(pg); return ns;
  });

  const undo = () => { if (!history.length) return; setFuture((f) => [state, ...f]); setState(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, state]); setState(future[0]); setFuture((f) => f.slice(1)); };

  const addPage = () => { const name = prompt("Page name:", "New page"); if (!name) return; const p = { id: uid(), name, boxes: [] }; setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id })); };
  const delPage = (id) => { if (!confirm("Delete page?")) return; setState((s) => { const pages = s.pages.filter((p) => p.id !== id); const safe = pages.length ? pages : [{ id: uid(), name: "Main", boxes: [] }]; return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId }; }); };
  const renamePage = (id) => { const pg = state.pages.find((p) => p.id === id); const name = prompt("Rename:", pg.name); if (name) setState((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, name } : p) })); };
  const dropPage = (id) => { if (!dragPage || dragPage === id) return; setState((s) => { const pages = [...s.pages]; const fi = pages.findIndex((p) => p.id === dragPage); const ti = pages.findIndex((p) => p.id === id); const [m] = pages.splice(fi, 1); pages.splice(ti, 0, m); return { ...s, pages }; }); setDragPage(null); setOverPage(null); };

  const addBox = (x, y) => { const b = newBox(x, y); mut((pg) => pg.boxes.push(b)); setSelBox(b.id); setFocusId(b.lines[0].id); setSelLines(new Set()); };
  const delBox = (id) => { mut((pg) => { pg.boxes = pg.boxes.filter((b) => b.id !== id); }); setSelBox(null); };

  const setText = (bid, lid, text) => mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.text = text; }, false);

  const addAfter = (bid, lid, cp = 0) => {
    const n = newLine();
    mut((pg) => {
      const b = pg.boxes.find((b) => b.id === bid); if (!b) return;
      const h = loc(b.lines, lid); if (!h) return;
      n.type = h.node.type;
      h.node.text = h.node.text.slice(0, cp); n.text = h.node.text.slice ? "" : "";
      const bef = h.node.text; const aft = (h.node._origText || h.node.text).slice(cp);
      h.node.text = bef; n.text = aft;
      if (h.node.children.length && !h.node.collapsed) { n.type = h.node.children[0]?.type ?? n.type; h.node.children.unshift(n); }
      else h.list.splice(h.i + 1, 0, n);
    });
    setFocusId(n.id); setFocusCaret(0); setSelLines(new Set());
  };

  const deleteSelected = (bid) => {
    if (selLines.size === 0) return;
    const ids = [...selLines];
    mut((pg) => {
      const b = pg.boxes.find((b) => b.id === bid); if (!b) return;
      const rm = (nodes) => nodes.filter((n) => { n.children = rm(n.children); return !ids.includes(n.id); });
      b.lines = rm(b.lines);
      if (!b.lines.length) b.lines.push(newLine());
    });
    setSelLines(new Set()); setLastSel(null);
  };

  const bsLine = (bid, lid, cur, cp) => {
    if (selLines.size > 1) { deleteSelected(bid); return true; }
    if (cp > 0) return false;
    const box = page.boxes.find((b) => b.id === bid); if (!box) return false;
    if (cur === "") {
      const order = vids(box.lines); const ft = order[order.indexOf(lid) - 1] || null;
      const fth = ft ? loc(box.lines, ft) : null; const ftLen = fth ? fth.node.text.length : 0;
      mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; if (b.lines.length === 1 && !b.lines[0].children.length) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i, 1); if (!b.lines.length) b.lines.push(newLine()); });
      if (ft) { setFocusId(ft); setFocusCaret(ftLen); } return true;
    } else {
      const order = vids(box.lines); const pos = order.indexOf(lid); if (pos === 0) return false;
      const prev = order[pos - 1]; let pl = 0;
      mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const ph = loc(b.lines, prev); const ch = loc(b.lines, lid); if (!ph || !ch) return; pl = ph.node.text.length; ph.node.text += ch.node.text; ch.list.splice(ch.i, 1); if (!b.lines.length) b.lines.push(newLine()); });
      setFocusId(prev); setFocusCaret(pl); return true;
    }
  };

  const cycleType = (bid, lid, t) => { mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.type = h.node.type === t ? "none" : t; }); setFocusId(lid); };
  const indent = (bid, lid) => { mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h || h.i === 0) return; const prev = h.list[h.i - 1]; h.list.splice(h.i, 1); prev.collapsed = false; if (h.node.type === "none") h.node.type = prev.type; prev.children.push(h.node); }); setFocusId(lid); };
  const outdent = (bid, lid) => { mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const find = (ns) => { for (let i = 0; i < ns.length; i++) { const idx = ns[i].children.findIndex((c) => c.id === lid); if (idx > -1) return { pl: ns, pi: i, idx }; const d = find(ns[i].children); if (d) return d; } return null; }; const h = find(b.lines); if (!h) return; const [node] = h.pl[h.pi].children.splice(h.idx, 1); h.pl.splice(h.pi + 1, 0, node); }); setFocusId(lid); };
  const toggle = (bid, lid) => { mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.collapsed = !h.node.collapsed; }, false); };

  const fsize = (bid, lid, d) => {
    if (selLines.size > 1) {
      mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const ap = (ns) => { for (const n of ns) { if (selLines.has(n.id)) n.fontSize = Math.max(10, Math.min(48, (n.fontSize || 14) + d)); ap(n.children); } }; ap(b.lines); });
      return;
    }
    if (!lid) return;
    mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.fontSize = Math.max(10, Math.min(48, (h.node.fontSize || 14) + d)); });
    setFocusId(lid);
  };

  const pasteAt = async (bid, lid) => {
    try {
      const items = await navigator.clipboard.read().catch(() => null);
      if (items) {
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const reader = new FileReader();
            reader.onload = () => { const box = page.boxes.find((b) => b.id === bid); const ib = newImgBox((box?.x || 0) + 24, (box?.y || 0) + 24, reader.result); mut((pg) => pg.boxes.push(ib)); };
            reader.readAsDataURL(blob); return;
          }
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html");
            const html = await htmlBlob.text();
            const parsed = parseHtmlToLines(html);
            if (parsed.length) { mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i + 1, 0, ...parsed); }); setFocusId(parsed[0].id); return; }
          }
        }
      }
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      const parsed = parsePlainToLines(text);
      if (!parsed.length) return;
      mut((pg) => { const b = pg.boxes.find((b) => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i + 1, 0, ...parsed); });
      setFocusId(parsed[0].id);
    } catch {}
  };

  const onLineDragStart = (bid, lid) => { _dragLineId = lid; };
  const onLineDragEnd = () => { _dragLineId = null; setLineDrop(null); };
  const onLineDragOver = (e, lid) => {
    e.preventDefault(); e.stopPropagation();
    if (!_dragLineId || _dragLineId === lid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientY - rect.top) / rect.height;
    setLineDrop({ id: lid, zone: pct < 0.35 ? "before" : pct > 0.65 ? "after" : "child" });
  };
  const onLineDrop = (e, bid, lid) => {
    e.preventDefault(); e.stopPropagation();
    if (!_dragLineId || !lineDrop || _dragLineId === lid) return;
    const { zone } = lineDrop;
    mut((pg) => {
      const b = pg.boxes.find((b) => b.id === bid); if (!b) return;
      const dh = loc(b.lines, _dragLineId); if (!dh) return;
      const dragged = structuredClone(dh.node); dh.list.splice(dh.i, 1);
      if (zone === "child") { const tgt = loc(b.lines, lid); if (!tgt) { b.lines.push(dragged); return; } tgt.node.collapsed = false; tgt.node.children.push(dragged); }
      else { const tgt = loc(b.lines, lid); if (!tgt) { b.lines.push(dragged); return; } tgt.list.splice(zone === "before" ? tgt.i : tgt.i + 1, 0, dragged); }
    });
    _dragLineId = null; setLineDrop(null);
  };

  const onLineClick = (e, bid, lid) => {
    if (!e.shiftKey) { setSelLines(new Set([lid])); setLastSel(lid); return; }
    const box = page.boxes.find((b) => b.id === bid); if (!box) return;
    const order = vids(box.lines);
    const from = lastSel ? order.indexOf(lastSel) : 0;
    const to = order.indexOf(lid);
    const [a, b2] = from <= to ? [from, to] : [to, from];
    setSelLines(new Set(order.slice(a, b2 + 1)));
  };

  const kd = (e, bid, lid) => {
    if (e.ctrlKey && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "v") { e.preventDefault(); pasteAt(bid, lid); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ".") { e.preventDefault(); cycleType(bid, lid, "bullet"); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "/") { e.preventDefault(); cycleType(bid, lid, "number"); return; }
    if (e.ctrlKey && e.shiftKey && e.key === ".") { e.preventDefault(); fsize(bid, lid, 2); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "-") { e.preventDefault(); fsize(bid, lid, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indent(bid, lid); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdent(bid, lid); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdent(bid, lid) : indent(bid, lid); return; }
    if (e.key === "Escape") { e.preventDefault(); setSelBox(null); setSelLines(new Set()); e.target.blur(); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addAfter(bid, lid, e.target.selectionStart); return; }
    if (e.key === "Delete" && selLines.size > 1) { e.preventDefault(); deleteSelected(bid); return; }
    if (e.key === "Backspace") { if (bsLine(bid, lid, e.target.value, e.target.selectionStart)) e.preventDefault(); return; }
    if (e.shiftKey && !e.ctrlKey && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const box = page.boxes.find((b) => b.id === bid); if (!box) return;
      const order = vids(box.lines); const pos = order.indexOf(lid);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); setSelLines((prev) => { const s = new Set(prev); s.has(next) ? s.delete(lid) : s.add(next); return s; }); setLastSel(next); } return;
    }
    if (!e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const box = page.boxes.find((b) => b.id === bid); if (!box) return;
      const order = vids(box.lines); const pos = order.indexOf(lid);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); inputs.current[next]?.focus(); }
    }
  };

  const renderLines = (bid, lines) => lines.map((n, idx) => {
    const num = n.type === "number" ? numInList(lines, idx) : null;
    const hh = n.collapsed && n.children.length;
    const dt = lineDrop?.id === n.id ? lineDrop.zone : null;
    const isSel = selLines.has(n.id);
    return (
      <div key={n.id}>
        <div
          className={"cv-line-row" + (isSel ? " cv-sel" : "") + (dt === "before" ? " cv-drop-before" : dt === "after" ? " cv-drop-after" : dt === "child" ? " cv-drop-child" : "")}
          onDragOver={(e) => onLineDragOver(e, n.id)}
          onDragLeave={(e) => { e.stopPropagation(); setLineDrop(null); }}
          onDrop={(e) => onLineDrop(e, bid, n.id)}
          onClick={(e) => onLineClick(e, bid, n.id)}
        >
          <button className={"cv-caret" + (n.children.length ? " has-kids" : "") + (n.collapsed ? " collapsed" : "")} onClick={(e) => { e.stopPropagation(); toggle(bid, n.id); }} tabIndex={-1}>
            {n.children.length ? (n.collapsed ? CC : CO) : ""}
          </button>
          {n.type === "bullet" && <span className={"cv-marker cv-bullet" + (hh ? " has-hidden" : "")} draggable onDragStart={() => onLineDragStart(bid, n.id)} onDragEnd={onLineDragEnd}>{BULLET}</span>}
          {n.type === "number" && <span className={"cv-marker cv-num" + (hh ? " has-hidden" : "")} draggable onDragStart={() => onLineDragStart(bid, n.id)} onDragEnd={onLineDragEnd}>{num}.</span>}
          {n.type === "none" && <span className="cv-marker cv-spacer" draggable onDragStart={() => onLineDragStart(bid, n.id)} onDragEnd={onLineDragEnd} />}
          <input className="cv-input" ref={(el) => (inputs.current[n.id] = el)} style={{ fontSize: (n.fontSize || 14) + "px" }} value={n.text} placeholder="..." onChange={(e) => setText(bid, n.id, e.target.value)} onKeyDown={(e) => kd(e, bid, n.id)} onFocus={() => { setFocusedId(n.id); setSelBox(bid); if (!selLines.has(n.id)) { setSelLines(new Set([n.id])); setLastSel(n.id); } }} />
        </div>
        {!n.collapsed && n.children.length > 0 && <div className="cv-kids">{renderLines(bid, n.children)}</div>}
      </div>
    );
  });

  return (
    <>
      <div className="notes-bar">
        {state.pages.map((p) => (
          <button key={p.id} className={"page-tab" + (p.id === state.activeId ? " active" : "") + (overPage === p.id && dragPage !== p.id ? " page-drag-over" : "")} draggable onDragStart={() => setDragPage(p.id)} onDragEnd={() => { setDragPage(null); setOverPage(null); }} onDragOver={(e) => { e.preventDefault(); setOverPage(p.id); }} onDragLeave={() => setOverPage(null)} onDrop={() => dropPage(p.id)} onClick={() => { setState((s) => ({ ...s, activeId: p.id })); setSelBox(null); setSelLines(new Set()); }} onDoubleClick={() => renamePage(p.id)} title="Double-click to rename">
            {p.name}
            <span className="x" onClick={(e) => { e.stopPropagation(); delPage(p.id); }}>x</span>
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <div className="notes-toolbar">
          <button className="notes-btn" onClick={undo} disabled={!history.length}>Undo</button>
          <button className="notes-btn" onClick={redo} disabled={!future.length}>Redo</button>
          <span className="notes-sep" />
          <button className="notes-btn" onClick={() => focusedId && selBox && cycleType(selBox, focusedId, "bullet")}>Bullet</button>
          <button className="notes-btn" onClick={() => focusedId && selBox && cycleType(selBox, focusedId, "number")}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" onClick={() => selBox && fsize(selBox, focusedId, -2)}>A-</button>
          <button className="notes-btn" onClick={() => selBox && fsize(selBox, focusedId, 2)}>A+</button>
          <span className="notes-sep" />
          {selBox && <button className="notes-btn cv-del-btn" onClick={() => selLines.size > 1 ? deleteSelected(selBox) : delBox(selBox)}>{selLines.size > 1 ? "Del lines" : "Del box"}</button>}
        </div>
        <span className="notes-hint">Double-click canvas for box  |  Shift+click/arrow multi-select  |  drag marker to move row  |  Ctrl+V pastes HTML/image</span>
      </div>
      <div className="cv-canvas" ref={cvRef}
        onDoubleClick={(e) => { if (e.target !== cvRef.current) return; const r = cvRef.current.getBoundingClientRect(); addBox(e.clientX - r.left - 160, e.clientY - r.top - 14); }}
        onClick={(e) => { if (e.target === cvRef.current) { setSelBox(null); setSelLines(new Set()); } }}
      >
        {page.boxes.map((box) => {
          const sel = selBox === box.id;
          if (box.kind === "image") return (
            <div key={box.id} className={"cv-box" + (sel ? " selected" : "")} style={{ left: box.x, top: box.y, width: box.w }} onClick={(e) => { e.stopPropagation(); setSelBox(box.id); }}>
              <div className="cv-drag-bar" onMouseDown={(e) => { e.preventDefault(); setDrag({ id: box.id, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y }); setSelBox(box.id); }} />
              <img src={box.src} alt="" style={{ width: "100%", display: "block", borderRadius: 4 }} />
              <div className="cv-resize" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResize({ id: box.id, sx: e.clientX, ow: box.w }); }} />
            </div>
          );
          return (
            <div key={box.id} className={"cv-box" + (sel ? " selected" : "")} style={{ left: box.x, top: box.y, width: box.w }} onClick={(e) => { e.stopPropagation(); setSelBox(box.id); }}>
              <div className="cv-drag-bar" onMouseDown={(e) => { if (["INPUT","BUTTON","SPAN"].includes(e.target.tagName)) return; e.preventDefault(); setDrag({ id: box.id, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y }); setSelBox(box.id); }} title="Drag to move" />
              <div className="cv-body">{renderLines(box.id, box.lines)}</div>
              <div className="cv-resize" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResize({ id: box.id, sx: e.clientX, ow: box.w }); }} title="Drag to resize" />
            </div>
          );
        })}
        {page.boxes.length === 0 && <div className="cv-empty">Double-click anywhere to create a text box</div>}
      </div>
    </>
  );
}
