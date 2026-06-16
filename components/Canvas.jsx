"use client";

import { useEffect, useRef, useState } from "react";

const CKEY = "rushmore-canvas-v3";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const BULLET = "\u2022";
const CC = "\u25b6";
const CO = "\u25bc";

const newLine = (type = "none") => ({ id: uid(), text: "", type, fontSize: 14, collapsed: false, children: [] });
const newBox = (x, y) => ({ id: uid(), x, y, w: 340, lines: [newLine()] });
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
function migrateLine(n) {
  if (!n || typeof n !== "object") return newLine();
  return { id: n.id || uid(), text: n.text || "", type: n.type || (n.bullet ? "bullet" : "none"), fontSize: n.fontSize || 14, collapsed: n.collapsed || false, src: n.src, children: Array.isArray(n.children) ? n.children.map(migrateLine) : [] };
}
function parseHtmlToLines(html) {
  if (typeof document === "undefined") return [];
  const div = document.createElement("div"); div.innerHTML = html;
  const lines = [];
  function getLiText(li) { let t = ""; for (const node of li.childNodes) { if (node.nodeType === 3) t += node.textContent; else if (!["ul","ol"].includes(node.tagName?.toLowerCase())) t += node.textContent; } return t.trim(); }
  function walkList(listEl, parent) { const type = listEl.tagName?.toLowerCase() === "ol" ? "number" : "bullet"; for (const li of listEl.children) { if (li.tagName?.toLowerCase() !== "li") continue; const line = newLine(type); line.text = getLiText(li); for (const child of li.children) { const t = child.tagName?.toLowerCase(); if (t === "ul" || t === "ol") walkList(child, line); } if (parent) parent.children.push(line); else lines.push(line); } }
  function walkEl(el) { const tag = el.tagName?.toLowerCase(); if (tag === "ul" || tag === "ol") { walkList(el, null); return; } if (tag === "p" || tag === "span") { const text = el.textContent?.trim(); if (text) { const l = newLine("none"); l.text = text; lines.push(l); } return; } for (const child of el.children) walkEl(child); }
  for (const child of div.children) walkEl(child);
  return lines;
}
function parsePlainToLines(text) {
  const rawLines = text.split("\n").filter(l => l.trim()); const nodes = []; let i = 0;
  while (i < rawLines.length) {
    const raw = rawLines[i]; const spaces = raw.match(/^([\t ]*)/)[1].length;
    if (spaces > 0) { i++; continue; }
    const content = raw.trimStart(); let type = "none", t = content;
    if (content.startsWith("* ") || content.startsWith("\u2022 ")) { type = "bullet"; t = content.slice(2); }
    else if (/^\d+\. /.test(content)) { type = "number"; t = content.replace(/^\d+\. /, ""); }
    const childLines = []; let j = i + 1;
    while (j < rawLines.length && rawLines[j].match(/^([\t ]*)/)[1].length > 0) { childLines.push(rawLines[j].slice(rawLines[j].match(/^(\t| {2})/)?.[0]?.length || 1)); j++; }
    const node = newLine(type); node.text = t;
    if (childLines.length) node.children = parsePlainToLines(childLines.join("\n"));
    nodes.push(node); i = j;
  }
  return nodes;
}

// Auto-resize a textarea to fit its content
function autoSize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

export default function Canvas() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState(null);
  const [selBox, setSelBox] = useState(null);
  const [selLines, setSelLines] = useState(new Set());
  const [lastSelLine, setLastSelLine] = useState(null);
  const [selBoxes, setSelBoxes] = useState(new Set());
  const [focusId, setFocusId] = useState(null);
  const [focusCaret, setFocusCaret] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [drag, setDrag] = useState(null);
  const [resize, setResize] = useState(null);
  const [lasso, setLasso] = useState(null);
  const [lineDrop, setLineDrop] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [dragPage, setDragPage] = useState(null);
  const [overPage, setOverPage] = useState(null);
  const cvRef = useRef(null);
  const inputs = useRef({});
  const dragLineRef = useRef(null);
  const boxRefs = useRef({});
  const selLinesRef = useRef(new Set());

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { selLinesRef.current = selLines; }, [selLines]);

  // Re-autosize all textareas whenever state changes
  useEffect(() => {
    Object.values(inputs.current).forEach(el => autoSize(el));
  }, [state]);

  useEffect(() => {
    if (!mounted) return;
    try {
      const raw = localStorage.getItem(CKEY) || localStorage.getItem("rushmore-canvas-v2") || localStorage.getItem("rushmore-canvas-v1");
      if (!raw) { setState(emptyState()); return; }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.pages)) { setState(emptyState()); return; }
      parsed.pages = parsed.pages.map(p => ({ ...p, boxes: Array.isArray(p.boxes) ? p.boxes.map(b => ({ ...b, lines: Array.isArray(b.lines) ? b.lines.map(migrateLine) : [newLine()] })) : [] }));
      if (!parsed.activeId || !parsed.pages.find(p => p.id === parsed.activeId)) parsed.activeId = parsed.pages[0]?.id || uid();
      setState(parsed);
    } catch { setState(emptyState()); }
  }, [mounted]);

  useEffect(() => { if (state) try { localStorage.setItem(CKEY, JSON.stringify(state)); } catch {} }, [state]);

  useEffect(() => {
    if (!focusId) return;
    const go = () => {
      const el = inputs.current[focusId]; if (!el) return;
      el.focus();
      if (focusCaret !== null) { try { el.setSelectionRange(focusCaret, focusCaret); } catch {} setFocusCaret(null); }
      setFocusId(null);
    };
    go(); const raf = requestAnimationFrame(go); return () => cancelAnimationFrame(raf);
  }, [focusId, focusCaret, state]);

  useEffect(() => {
    if (!drag && !resize) return;
    const move = (e) => {
      if (drag) { const nx = Math.max(0, drag.ox + e.clientX - drag.sx); const ny = Math.max(0, drag.oy + e.clientY - drag.sy); setState(s => { const ns = structuredClone(s); const pg = ns.pages.find(p => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find(b => b.id === drag.id); if (b) { b.x = nx; b.y = ny; } return ns; }); }
      if (resize) { const nw = Math.max(120, resize.ow + e.clientX - resize.sx); setState(s => { const ns = structuredClone(s); const pg = ns.pages.find(p => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find(b => b.id === resize.id); if (b) b.w = nw; return ns; }); }
    };
    const up = () => { setDrag(null); setResize(null); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, resize]);

  useEffect(() => {
    if (!lasso) return;
    const move = (e) => { const rect = cvRef.current?.getBoundingClientRect(); if (!rect) return; setLasso(l => l ? ({ ...l, ex: e.clientX - rect.left, ey: e.clientY - rect.top }) : null); };
    const up = (e) => {
      if (lasso && cvRef.current) {
        const rect = cvRef.current.getBoundingClientRect();
        const ex = e.clientX - rect.left, ey = e.clientY - rect.top;
        const minX = Math.min(lasso.sx, ex), maxX = Math.max(lasso.sx, ex);
        const minY = Math.min(lasso.sy, ey), maxY = Math.max(lasso.sy, ey);
        if (maxX - minX > 4 || maxY - minY > 4) {
          const pg = state?.pages.find(p => p.id === state.activeId) || state?.pages[0];
          const hit = new Set();
          pg?.boxes.forEach(b => { if (b.x >= minX && b.y >= minY && b.x <= maxX && b.y <= maxY) hit.add(b.id); });
          setSelBoxes(hit); if (hit.size === 1) setSelBox([...hit][0]);
        }
      }
      setLasso(null);
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [lasso, state]);

  if (!mounted) return <div className="cv-canvas" style={{ minHeight: 400 }} />;
  if (!state) return <div className="cv-canvas" style={{ minHeight: 400 }} />;

  const page = state.pages.find(p => p.id === state.activeId) || state.pages[0];
  const canvasW = Math.max(800, ...page.boxes.map(b => b.x + b.w + 80));
  const canvasH = Math.max(600, ...page.boxes.map(b => b.y + (boxRefs.current[b.id]?.offsetHeight || 100) + 80));

  const mut = (fn, rec = true) => setState(s => {
    if (rec) { setHistory(h => [...h.slice(-60), s]); setFuture([]); }
    const ns = structuredClone(s);
    const pg = ns.pages.find(p => p.id === ns.activeId) || ns.pages[0];
    fn(pg); return ns;
  });

  const undo = () => { if (!history.length) return; setFuture(f => [state, ...f]); setState(history[history.length - 1]); setHistory(h => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory(h => [...h, state]); setState(future[0]); setFuture(f => f.slice(1)); };

  const addPage = () => { const name = prompt("Page name:", "New page"); if (!name) return; const p = { id: uid(), name, boxes: [] }; setState(s => ({ ...s, pages: [...s.pages, p], activeId: p.id })); };
  const delPage = (id) => { if (!confirm("Delete page?")) return; setState(s => { const pages = s.pages.filter(p => p.id !== id); const safe = pages.length ? pages : [emptyState().pages[0]]; return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId }; }); };
  const renamePage = (id) => { const pg = state.pages.find(p => p.id === id); const name = prompt("Rename:", pg.name); if (name) setState(s => ({ ...s, pages: s.pages.map(p => p.id === id ? { ...p, name } : p) })); };
  const dropPage = (id) => { if (!dragPage || dragPage === id) return; setState(s => { const pages = [...s.pages]; const fi = pages.findIndex(p => p.id === dragPage); const ti = pages.findIndex(p => p.id === id); const [m] = pages.splice(fi, 1); pages.splice(ti, 0, m); return { ...s, pages }; }); setDragPage(null); setOverPage(null); };

  const addBox = (x, y) => { const b = newBox(x, y); mut(pg => pg.boxes.push(b)); setSelBox(b.id); setSelBoxes(new Set([b.id])); setFocusId(b.lines[0].id); setSelLines(new Set()); };
  const delBox = (id) => { mut(pg => { pg.boxes = pg.boxes.filter(b => b.id !== id); }); if (selBox === id) setSelBox(null); setSelBoxes(prev => { const s = new Set(prev); s.delete(id); return s; }); };
  const cleanEmptyBox = (id) => { const box = page.boxes.find(b => b.id === id); if (!box) return; if (box.lines.length === 1 && !box.lines[0].text && box.lines[0].type === "none" && !box.lines[0].children.length) delBox(id); };
  const setText = (bid, lid, text) => mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.text = text; }, false);

  const addAfter = (bid, lid, cp = 0) => {
    const n = newLine();
    mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h) return; n.type = h.node.type; const full = h.node.text; h.node.text = full.slice(0, cp); n.text = full.slice(cp); if (h.node.children.length && !h.node.collapsed) { n.type = h.node.children[0]?.type ?? n.type; h.node.children.unshift(n); } else h.list.splice(h.i + 1, 0, n); });
    setFocusId(n.id); setFocusCaret(0);
  };

  const deleteSelectedLines = (bid) => {
    const ids = new Set(selLinesRef.current); if (ids.size === 0) return false;
    mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; function rm(nodes) { return nodes.filter(n => { n.children = rm(n.children); return !ids.has(n.id); }); } b.lines = rm(b.lines); if (!b.lines.length) b.lines.push(newLine()); });
    setSelLines(new Set()); setLastSelLine(null); setFocusedId(null); return true;
  };

  const bsLine = (bid, lid, cur, cp) => {
    if (selLinesRef.current.size > 1) { deleteSelectedLines(bid); return true; }
    if (cp > 0) return false;
    const box = page.boxes.find(b => b.id === bid); if (!box) return false;
    if (cur === "") {
      const order = vids(box.lines); const ft = order[order.indexOf(lid) - 1] || null;
      const fth = ft ? loc(box.lines, ft) : null; const ftLen = fth ? fth.node.text.length : 0;
      mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; if (b.lines.length === 1 && !b.lines[0].children.length) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i, 1); if (!b.lines.length) b.lines.push(newLine()); });
      if (ft) { setFocusId(ft); setFocusCaret(ftLen); } return true;
    } else {
      const order = vids(box.lines); const pos = order.indexOf(lid); if (pos === 0) return false;
      const prev = order[pos - 1]; let pl = 0;
      mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const ph = loc(b.lines, prev); const ch = loc(b.lines, lid); if (!ph || !ch) return; pl = ph.node.text.length; ph.node.text += ch.node.text; ch.list.splice(ch.i, 1); if (!b.lines.length) b.lines.push(newLine()); });
      setFocusId(prev); setFocusCaret(pl); return true;
    }
  };

  const cycleType = (bid, lid, t) => { mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.type = h.node.type === t ? "none" : t; }); setFocusId(lid); };
  const indent = (bid, lid) => { mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h || h.i === 0) return; const prev = h.list[h.i - 1]; h.list.splice(h.i, 1); prev.collapsed = false; if (h.node.type === "none") h.node.type = prev.type; prev.children.push(h.node); }); setFocusId(lid); };
  const outdent = (bid, lid) => { mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const find = ns => { for (let i = 0; i < ns.length; i++) { const idx = ns[i].children.findIndex(c => c.id === lid); if (idx > -1) return { pl: ns, pi: i, idx }; const d = find(ns[i].children); if (d) return d; } return null; }; const h = find(b.lines); if (!h) return; const [node] = h.pl[h.pi].children.splice(h.idx, 1); h.pl.splice(h.pi + 1, 0, node); }); setFocusId(lid); };
  const toggle = (bid, lid) => { mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.collapsed = !h.node.collapsed; }, false); };

  const fsize = (bid, lid, d) => {
    const ids = selLinesRef.current;
    if (ids.size > 1) { const frozen = new Set(ids); mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; function ap(ns) { for (const n of ns) { if (frozen.has(n.id)) n.fontSize = Math.max(10, Math.min(48, (n.fontSize || 14) + d)); ap(n.children); } } ap(b.lines); }); return; }
    if (!lid) return;
    mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.node.fontSize = Math.max(10, Math.min(48, (h.node.fontSize || 14) + d)); });
    setFocusId(lid);
  };

  const pasteAt = async (bid, lid) => {
    try {
      const items = await navigator.clipboard.read().catch(() => null);
      if (items) {
        for (const item of items) {
          const imgType = item.types.find(t => t.startsWith("image/"));
          if (imgType) { const blob = await item.getType(imgType); const reader = new FileReader(); reader.onload = () => { const imgLine = { id: uid(), text: "", type: "image", src: reader.result, fontSize: 14, collapsed: false, children: [] }; mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (h) h.list.splice(h.i + 1, 0, imgLine); else b.lines.push(imgLine); }); }; reader.readAsDataURL(blob); return; }
          if (item.types.includes("text/html")) { const htmlBlob = await item.getType("text/html"); const parsed = parseHtmlToLines(await htmlBlob.text()); if (parsed.length) { mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i + 1, 0, ...parsed); }); setFocusId(parsed[0].id); return; } }
        }
      }
      const text = await navigator.clipboard.readText(); if (!text.trim()) return;
      const parsed = parsePlainToLines(text); if (!parsed.length) return;
      mut(pg => { const b = pg.boxes.find(b => b.id === bid); if (!b) return; const h = loc(b.lines, lid); if (!h) return; h.list.splice(h.i + 1, 0, ...parsed); });
      setFocusId(parsed[0].id);
    } catch {}
  };

  const onLineDragStart = (e, bid, lid) => { e.stopPropagation(); dragLineRef.current = { bid, lid }; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", lid); };
  const onLineDragEnd = () => { dragLineRef.current = null; setLineDrop(null); };
  const onLineDragOver = (e, lid) => {
    e.preventDefault(); e.stopPropagation();
    if (!dragLineRef.current || dragLineRef.current.lid === lid) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientY - rect.top) / rect.height;
    const zone = pct < 0.28 ? "before" : pct > 0.72 ? "after" : "child";
    setLineDrop(prev => (prev?.id === lid && prev?.zone === zone) ? prev : { id: lid, zone });
  };
  const onLineDrop = (e, bid, lid) => {
    e.preventDefault(); e.stopPropagation();
    const src = dragLineRef.current; if (!src || !lineDrop || src.lid === lid) return;
    const { zone } = lineDrop; const srcLid = src.lid;
    dragLineRef.current = null; setLineDrop(null);
    mut(pg => {
      const b = pg.boxes.find(b => b.id === bid); if (!b) return;
      const dh = loc(b.lines, srcLid); if (!dh) return;
      const dragged = structuredClone(dh.node);
      dh.list.splice(dh.i, 1);
      if (zone === "child") { const tgt = loc(b.lines, lid); if (!tgt) { b.lines.push(dragged); return; } tgt.node.collapsed = false; tgt.node.children.push(dragged); }
      else { const tgt = loc(b.lines, lid); if (!tgt) { b.lines.push(dragged); return; } tgt.list.splice(zone === "before" ? tgt.i : tgt.i + 1, 0, dragged); }
    });
  };

  const onLineClick = (e, bid, lid) => {
    e.stopPropagation();
    if (!e.shiftKey) { setSelLines(new Set([lid])); setLastSelLine(lid); return; }
    const box = page.boxes.find(b => b.id === bid); if (!box) return;
    const order = vids(box.lines);
    const from = lastSelLine ? order.indexOf(lastSelLine) : 0;
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
    if (e.ctrlKey && e.shiftKey && (e.key === "." || e.key === ">")) { e.preventDefault(); fsize(bid, lid, 2); return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "-" || e.key === "_")) { e.preventDefault(); fsize(bid, lid, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indent(bid, lid); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdent(bid, lid); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdent(bid, lid) : indent(bid, lid); return; }
    if (e.key === "Escape") { e.preventDefault(); setSelBox(null); setSelLines(new Set()); setSelBoxes(new Set()); e.target.blur(); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addAfter(bid, lid, e.target.selectionStart); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && selLinesRef.current.size > 1) { e.preventDefault(); deleteSelectedLines(bid); return; }
    if (e.key === "Backspace") { if (bsLine(bid, lid, e.target.value, e.target.selectionStart)) e.preventDefault(); return; }
    if (e.shiftKey && !e.ctrlKey && !e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const box = page.boxes.find(b => b.id === bid); if (!box) return;
      const order = vids(box.lines); const pos = order.indexOf(lid);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); setSelLines(prev => { const s = new Set(prev); s.has(next) ? s.delete(lid) : s.add(next); return s; }); setLastSelLine(next); } return;
    }
    if (!e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const box = page.boxes.find(b => b.id === bid); if (!box) return;
      const order = vids(box.lines); const pos = order.indexOf(lid);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); inputs.current[next]?.focus(); setSelLines(new Set([next])); setLastSelLine(next); }
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
          onDragOver={e => onLineDragOver(e, n.id)}
          onDragLeave={e => { e.stopPropagation(); setLineDrop(null); }}
          onDrop={e => onLineDrop(e, bid, n.id)}
          onClick={e => onLineClick(e, bid, n.id)}
        >
          <button className={"cv-caret" + (n.children.length ? " has-kids" : "") + (n.collapsed ? " collapsed" : "")} onClick={e => { e.stopPropagation(); toggle(bid, n.id); }} tabIndex={-1}>
            {n.children.length ? (n.collapsed ? CC : CO) : ""}
          </button>
          {n.type === "image" ? (
            <img src={n.src} alt="" style={{ maxWidth: "100%", borderRadius: 4, marginTop: 2, display: "block", cursor: "grab" }} draggable onDragStart={e => onLineDragStart(e, bid, n.id)} onDragEnd={onLineDragEnd} />
          ) : (
            <>
              {n.type === "bullet" && <span className={"cv-marker cv-bullet" + (hh ? " has-hidden" : "")} draggable onDragStart={e => onLineDragStart(e, bid, n.id)} onDragEnd={onLineDragEnd} title="Drag to move">{BULLET}</span>}
              {n.type === "number" && <span className={"cv-marker cv-num" + (hh ? " has-hidden" : "")} draggable onDragStart={e => onLineDragStart(e, bid, n.id)} onDragEnd={onLineDragEnd} title="Drag to move">{num}.</span>}
              {n.type === "none" && <span className="cv-marker cv-spacer cv-drag-handle" draggable onDragStart={e => onLineDragStart(e, bid, n.id)} onDragEnd={onLineDragEnd} title="Drag to move">&#8942;</span>}
              <textarea
                className="cv-input"
                ref={el => {
                  inputs.current[n.id] = el;
                  autoSize(el);
                }}
                style={{ fontSize: (n.fontSize || 14) + "px" }}
                value={n.text}
                placeholder="..."
                rows={1}
                onChange={e => { autoSize(e.target); setText(bid, n.id, e.target.value); }}
                onKeyDown={e => kd(e, bid, n.id)}
                onFocus={() => { setFocusedId(n.id); setSelBox(bid); setSelBoxes(new Set([bid])); setSelLines(prev => prev.size > 0 ? prev : new Set([n.id])); setLastSelLine(prev => prev || n.id); }}
                onBlur={() => { setTimeout(() => { if (document.activeElement === document.body || !cvRef.current?.contains(document.activeElement)) { cleanEmptyBox(bid); } }, 150); }}
              />
            </>
          )}
        </div>
        {!n.collapsed && n.children.length > 0 && <div className="cv-kids">{renderLines(bid, n.children)}</div>}
      </div>
    );
  });

  const lassoRect = lasso ? {
    left: Math.min(lasso.sx, lasso.ex || lasso.sx), top: Math.min(lasso.sy, lasso.ey || lasso.sy),
    width: Math.abs((lasso.ex || lasso.sx) - lasso.sx), height: Math.abs((lasso.ey || lasso.sy) - lasso.sy),
  } : null;

  return (
    <>
      <div className="notes-bar">
        {state.pages.map(p => (
          <button key={p.id}
            className={"page-tab" + (p.id === state.activeId ? " active" : "") + (overPage === p.id && dragPage !== p.id ? " page-drag-over" : "")}
            draggable
            onDragStart={() => setDragPage(p.id)}
            onDragEnd={() => { setDragPage(null); setOverPage(null); }}
            onDragOver={e => { e.preventDefault(); setOverPage(p.id); }}
            onDragLeave={() => setOverPage(null)}
            onDrop={() => dropPage(p.id)}
            onClick={() => { setState(s => ({ ...s, activeId: p.id })); setSelBox(null); setSelLines(new Set()); setSelBoxes(new Set()); }}
            onDoubleClick={() => renamePage(p.id)}
            title="Double-click to rename"
          >
            {p.name}
            <span className="x" onClick={e => { e.stopPropagation(); delPage(p.id); }}>x</span>
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <div className="notes-toolbar">
          <button className="notes-btn" onClick={undo} disabled={!history.length}>Undo</button>
          <button className="notes-btn" onClick={redo} disabled={!future.length}>Redo</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Bullet (Ctrl+.)" onMouseDown={e => { e.preventDefault(); focusedId && selBox && cycleType(selBox, focusedId, "bullet"); }}>{"\u2022"}</button>
          <button className="notes-btn" title="Number (Ctrl+/)" onMouseDown={e => { e.preventDefault(); focusedId && selBox && cycleType(selBox, focusedId, "number"); }}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Indent" onMouseDown={e => { e.preventDefault(); focusedId && selBox && indent(selBox, focusedId); }}>{"\u2192"}</button>
          <button className="notes-btn" title="Outdent" onMouseDown={e => { e.preventDefault(); focusedId && selBox && outdent(selBox, focusedId); }}>{"\u2190"}</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Smaller" onMouseDown={e => { e.preventDefault(); selBox && fsize(selBox, focusedId, -2); }}>A-</button>
          <button className="notes-btn" title="Larger" onMouseDown={e => { e.preventDefault(); selBox && fsize(selBox, focusedId, 2); }}>A+</button>
          <span className="notes-sep" />
          {selBox && selLines.size > 1 && <button className="notes-btn cv-del-btn" onClick={() => deleteSelectedLines(selBox)}>Del lines</button>}
          {selBox && selLines.size <= 1 && <button className="notes-btn cv-del-btn" onClick={() => delBox(selBox)}>Del box</button>}
        </div>
        <span className="notes-hint">Dbl-click canvas for box · drag &#8942; to move lines</span>
      </div>
      <div
        className="cv-canvas"
        ref={cvRef}
        style={{ width: canvasW, minHeight: canvasH }}
        onDoubleClick={e => { if (e.target !== cvRef.current) return; const r = cvRef.current.getBoundingClientRect(); addBox(e.clientX - r.left - 170, e.clientY - r.top - 14); }}
        onMouseDown={e => { if (e.target !== cvRef.current) return; const r = cvRef.current.getBoundingClientRect(); setLasso({ sx: e.clientX - r.left, sy: e.clientY - r.top, ex: e.clientX - r.left, ey: e.clientY - r.top }); setSelBox(null); setSelLines(new Set()); setSelBoxes(new Set()); }}
        onClick={e => { if (e.target === cvRef.current) { setSelBox(null); setSelLines(new Set()); setSelBoxes(new Set()); } }}
      >
        {lassoRect && lassoRect.width > 2 && (
          <div style={{ position: "absolute", border: "1px solid #ff8c3a", background: "rgba(255,140,58,0.06)", borderRadius: 4, pointerEvents: "none", left: lassoRect.left, top: lassoRect.top, width: lassoRect.width, height: lassoRect.height }} />
        )}
        {page.boxes.map(box => (
          <div
            key={box.id}
            ref={el => (boxRefs.current[box.id] = el)}
            className={"cv-box" + (selBox === box.id || selBoxes.has(box.id) ? " selected" : "")}
            style={{ left: box.x, top: box.y, width: box.w }}
            onClick={e => { e.stopPropagation(); setSelBox(box.id); setSelBoxes(new Set([box.id])); }}
          >
            <div className="cv-drag-bar" onMouseDown={e => { if (["TEXTAREA","BUTTON","SPAN","IMG"].includes(e.target.tagName)) return; e.preventDefault(); setDrag({ id: box.id, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y }); setSelBox(box.id); setSelBoxes(new Set([box.id])); }} title="Drag to move box" />
            <div className="cv-body">{renderLines(box.id, box.lines)}</div>
            <div className="cv-resize" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); setResize({ id: box.id, sx: e.clientX, ow: box.w }); }} title="Drag to resize" />
          </div>
        ))}
        {page.boxes.length === 0 && <div className="cv-empty">Double-click anywhere to create a text box</div>}
      </div>
    </>
  );
}
