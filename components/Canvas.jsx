"use client";

import { useEffect, useRef, useState } from "react";

const CKEY = "rushmore-canvas-v4";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const newLine = (type = "none", text = "", indent = 0, fontSize = 14) => ({
  id: uid(), type, text, indent, fontSize, collapsed: false,
});
const newBox = (x, y) => ({ id: uid(), x, y, w: 360, lines: [newLine()] });
const emptyPage = () => ({ id: uid(), name: "Main", boxes: [] });
const emptyState = () => { const p = emptyPage(); return { pages: [p], activeId: p.id }; };

/* ───────────────────────── DOM helpers (module-level, no hooks) ───────────────────────── */

function placeCaret(textEl, pos = 0) {
  if (!textEl || typeof window === "undefined") return;
  const sel = window.getSelection(); if (!sel) return;
  const r = document.createRange();
  const node = textEl.firstChild;
  try {
    if (node && node.nodeType === 3) r.setStart(node, Math.min(pos, node.textContent.length));
    else r.setStart(textEl, 0);
    r.collapse(true);
    sel.removeAllRanges(); sel.addRange(r);
  } catch {}
}

function caretOffsetIn(textEl) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !textEl) return 0;
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(textEl);
  try { pre.setEnd(range.startContainer, range.startOffset); } catch { return 0; }
  return pre.toString().length;
}

function buildRow(line) {
  const row = document.createElement("div");
  row.className = "cv-row";
  row.dataset.lid = line.id || uid();
  row.dataset.type = line.type || "none";
  row.dataset.indent = String(line.indent || 0);
  row.dataset.fs = String(line.fontSize || 14);
  row.dataset.collapsed = line.collapsed ? "true" : "false";
  row.style.paddingLeft = ((line.indent || 0) * 22) + "px";

  const colBtn = document.createElement("button");
  colBtn.className = "cv-collapse-btn";
  colBtn.setAttribute("contenteditable", "false");
  colBtn.tabIndex = -1;
  colBtn.type = "button";
  colBtn.style.visibility = "hidden";
  colBtn.textContent = line.collapsed ? "\u25b6" : "\u25bc";
  row.appendChild(colBtn);

  const marker = document.createElement("span");
  marker.className = "cv-row-marker";
  marker.setAttribute("contenteditable", "false");
  if (line.type === "bullet") marker.textContent = "\u2022";
  else if (line.type === "number") marker.textContent = "1.";
  else marker.style.visibility = "hidden";
  row.appendChild(marker);

  if (line.type === "image" && line.src) {
    const img = document.createElement("img");
    img.src = line.src;
    img.className = "cv-row-img";
    img.setAttribute("contenteditable", "false");
    row.appendChild(img);
    const t = document.createElement("span");
    t.className = "cv-text"; t.textContent = "";
    row.appendChild(t);
  } else {
    const text = document.createElement("span");
    text.className = "cv-text";
    text.style.fontSize = (line.fontSize || 14) + "px";
    text.textContent = line.text || "";
    row.appendChild(text);
  }
  return row;
}

function syncMarker(row) {
  const marker = row.querySelector(".cv-row-marker");
  if (!marker) return;
  const type = row.dataset.type;
  if (type === "bullet") { marker.textContent = "\u2022"; marker.style.visibility = ""; }
  else if (type === "number") {
    let n = 1; let prev = row.previousElementSibling;
    while (prev) {
      const pIndent = prev.dataset.indent || "0";
      if (parseInt(pIndent) < parseInt(row.dataset.indent || "0")) break;
      if (prev.dataset.type === "number" && pIndent === (row.dataset.indent || "0")) n++;
      prev = prev.previousElementSibling;
    }
    marker.textContent = n + "."; marker.style.visibility = "";
  } else { marker.style.visibility = "hidden"; }
}

// Update collapse buttons, hide collapsed children, and renumber numbered rows.
function refreshRows(editorEl) {
  const rows = [...editorEl.querySelectorAll(".cv-row")];
  rows.forEach((row, i) => {
    const myIndent = parseInt(row.dataset.indent || "0");
    const next = rows[i + 1];
    const hasChildren = next && parseInt(next.dataset.indent || "0") > myIndent;
    const btn = row.querySelector(".cv-collapse-btn");
    if (btn) {
      btn.style.visibility = hasChildren ? "visible" : "hidden";
      btn.textContent = row.dataset.collapsed === "true" ? "\u25b6" : "\u25bc";
    }
  });
  rows.forEach((row, i) => {
    const myIndent = parseInt(row.dataset.indent || "0");
    if (myIndent === 0) { row.style.display = ""; }
    else {
      let hidden = false;
      for (let j = i - 1; j >= 0; j--) {
        const pIndent = parseInt(rows[j].dataset.indent || "0");
        if (pIndent < myIndent) { if (rows[j].dataset.collapsed === "true") hidden = true; break; }
      }
      row.style.display = hidden ? "none" : "";
    }
    if (row.dataset.type === "number") syncMarker(row);
  });
}

function domToLines(editorEl) {
  const lines = [];
  for (const row of editorEl.querySelectorAll(".cv-row")) {
    const img = row.querySelector(".cv-row-img");
    lines.push({
      id: row.dataset.lid || uid(),
      type: row.dataset.type || "none",
      text: row.querySelector(".cv-text")?.textContent || "",
      indent: parseInt(row.dataset.indent || "0", 10),
      fontSize: parseInt(row.dataset.fs || "14", 10),
      collapsed: row.dataset.collapsed === "true",
      ...(img ? { src: img.src } : {}),
    });
  }
  return lines.length ? lines : [newLine()];
}

function htmlToLines(html) {
  if (typeof document === "undefined") return [];
  const div = document.createElement("div");
  div.innerHTML = html;
  const out = [];
  const getLiText = (li) => {
    let t = "";
    for (const n of li.childNodes) {
      if (n.nodeType === 3) t += n.textContent;
      else if (!["ul", "ol"].includes(n.tagName?.toLowerCase())) t += n.textContent;
    }
    return t.trim();
  };
  const walkList = (el, indent, type) => {
    for (const li of el.children) {
      if (li.tagName?.toLowerCase() !== "li") continue;
      out.push(newLine(type, getLiText(li), indent));
      for (const c of li.children) {
        const t = c.tagName?.toLowerCase();
        if (t === "ul") walkList(c, indent + 1, "bullet");
        else if (t === "ol") walkList(c, indent + 1, "number");
      }
    }
  };
  const walkEl = (el, indent = 0) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === "ul") return walkList(el, indent, "bullet");
    if (tag === "ol") return walkList(el, indent, "number");
    if (tag === "p" || tag === "div" || tag === "li") {
      const text = el.textContent?.trim();
      if (text) out.push(newLine("none", text, indent));
      return;
    }
    for (const c of el.children) walkEl(c, indent);
  };
  for (const c of div.children) walkEl(c);
  return out;
}

function migrateState(raw) {
  try {
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.pages)) return emptyState();
    s.pages = s.pages.map((p) => ({
      ...p,
      boxes: Array.isArray(p.boxes) ? p.boxes.map((b) => ({
        ...b,
        lines: Array.isArray(b.lines) ? b.lines.flatMap((l) => {
          if (Array.isArray(l.children)) {
            const flat = [];
            const walk = (node, depth) => {
              flat.push(newLine(node.type || "none", node.text || "", depth, node.fontSize || 14));
              if (Array.isArray(node.children)) node.children.forEach((c) => walk(c, depth + 1));
            };
            walk(l, 0);
            return flat;
          }
          return [{ ...newLine(l.type || "none", l.text || "", l.indent || 0, l.fontSize || 14), src: l.src }];
        }) : [newLine()],
      })) : [],
    }));
    if (!s.activeId || !s.pages.find((p) => p.id === s.activeId)) s.activeId = s.pages[0]?.id;
    return s;
  } catch { return emptyState(); }
}

/* ───────────────────────────────────── Component ───────────────────────────────────── */

export default function Canvas() {
  const [state, setState] = useState(null);
  const [mounted, setMounted] = useState(false);
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
  const pendingFocus = useRef(null);
  const histRef = useRef(0);

  /* Load + mount */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CKEY)
        || localStorage.getItem("rushmore-canvas-v3")
        || localStorage.getItem("rushmore-canvas-v2")
        || localStorage.getItem("rushmore-canvas-v1");
      setState(raw ? migrateState(raw) : emptyState());
    } catch { setState(emptyState()); }
  }, []);
  useEffect(() => { setMounted(true); }, []);

  /* Save */
  useEffect(() => {
    if (state) try { localStorage.setItem(CKEY, JSON.stringify(state)); } catch {}
  }, [state]);

  /* State → DOM sync. Runs after commit; never touches the focused editor's text. */
  useEffect(() => {
    if (!state || !mounted) return;
    const pg = state.pages.find((p) => p.id === state.activeId) || state.pages[0];
    pg?.boxes.forEach((box) => {
      const el = editorRefs.current[box.id];
      if (!el) return;
      const existing = [...el.querySelectorAll(".cv-row")].map((r) => r.dataset.lid).join(",");
      const expected = box.lines.map((l) => l.id).join(",");
      if (existing !== expected) {
        el.innerHTML = "";
        const frag = document.createDocumentFragment();
        box.lines.forEach((line) => frag.appendChild(buildRow(line)));
        el.appendChild(frag);
        refreshRows(el);
      } else {
        const rows = [...el.querySelectorAll(".cv-row")];
        const active = document.activeElement;
        const editorFocused = el.contains(active);
        box.lines.forEach((line, i) => {
          const row = rows[i]; if (!row) return;
          const textEl = row.querySelector(".cv-text");
          if (textEl && !editorFocused && textEl.textContent !== line.text) textEl.textContent = line.text;
          if (row.dataset.type !== line.type) { row.dataset.type = line.type; syncMarker(row); }
          const ind = String(line.indent || 0);
          if (row.dataset.indent !== ind) { row.dataset.indent = ind; row.style.paddingLeft = (line.indent * 22) + "px"; }
          const fs = String(line.fontSize || 14);
          if (row.dataset.fs !== fs) { row.dataset.fs = fs; if (textEl) textEl.style.fontSize = fs + "px"; }
          const col = line.collapsed ? "true" : "false";
          if (row.dataset.collapsed !== col) row.dataset.collapsed = col;
        });
        refreshRows(el);
      }
    });
    if (pendingFocus.current) {
      const el = editorRefs.current[pendingFocus.current];
      const t = el?.querySelector(".cv-text");
      if (el && t) { el.focus(); placeCaret(t, 0); }
      pendingFocus.current = null;
    }
  }, [state, mounted]);

  /* Box drag / resize */
  useEffect(() => {
    if (!drag && !resize) return;
    const move = (e) => {
      if (drag) {
        const nx = Math.max(0, drag.ox + e.clientX - drag.sx);
        const ny = Math.max(0, drag.oy + e.clientY - drag.sy);
        setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === drag.id); if (b) { b.x = nx; b.y = ny; } return ns; });
      }
      if (resize) {
        const nw = Math.max(160, resize.ow + e.clientX - resize.sx);
        setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === resize.id); if (b) b.w = nw; return ns; });
      }
    };
    const up = () => { setDrag(null); setResize(null); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, resize]);

  /* Lasso box-select */
  useEffect(() => {
    if (!lasso) return;
    const move = (e) => { const r = cvRef.current?.getBoundingClientRect(); if (!r) return; setLasso((l) => l ? { ...l, ex: e.clientX - r.left, ey: e.clientY - r.top } : null); };
    const up = (e) => {
      if (lasso && cvRef.current) {
        const r = cvRef.current.getBoundingClientRect();
        const ex = e.clientX - r.left, ey = e.clientY - r.top;
        const minX = Math.min(lasso.sx, ex), maxX = Math.max(lasso.sx, ex);
        const minY = Math.min(lasso.sy, ey), maxY = Math.max(lasso.sy, ey);
        if (maxX - minX > 4 || maxY - minY > 4) {
          const pg = state?.pages.find((p) => p.id === state.activeId) || state?.pages[0];
          const hit = pg?.boxes.find((b) => { const bh = boxRefs.current[b.id]?.offsetHeight || 80; return b.x < maxX && b.x + b.w > minX && b.y < maxY && b.y + bh > minY; });
          if (hit) { setSelBoxId(hit.id); setTimeout(() => editorRefs.current[hit.id]?.focus(), 10); }
        }
      }
      setLasso(null);
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [lasso, state]);

  /* SSR / first-paint gate — matches server output, avoids hydration mismatch */
  if (!state || !mounted) return <div className="cv-canvas" style={{ minHeight: 400 }} />;

  const page = state.pages.find((p) => p.id === state.activeId) || state.pages[0];
  const canvasW = Math.max(800, ...page.boxes.map((b) => b.x + b.w + 80));
  const canvasH = Math.max(600, ...page.boxes.map((b) => b.y + (boxRefs.current[b.id]?.offsetHeight || 100) + 80));

  const recordHistory = (immediate) => {
    const now = Date.now();
    if (immediate || now - histRef.current > 700) {
      histRef.current = now;
      setHistory((h) => [...h.slice(-80), state]);
      setFuture([]);
    }
  };
  const commitLines = (boxId, editorEl) => {
    const lines = domToLines(editorEl);
    setState((s) => { const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; const b = pg.boxes.find((b) => b.id === boxId); if (b) b.lines = lines; return ns; });
  };
  const mut = (fn, rec = true) => setState((s) => {
    if (rec) { setHistory((h) => [...h.slice(-80), s]); setFuture([]); }
    const ns = structuredClone(s); const pg = ns.pages.find((p) => p.id === ns.activeId) || ns.pages[0]; fn(pg); return ns;
  });

  const undo = () => { if (!history.length) return; setFuture((f) => [state, ...f]); setState(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, state]); setState(future[0]); setFuture((f) => f.slice(1)); };

  const addPage = () => { const name = prompt("Page name:", "New page"); if (!name) return; const p = emptyPage(); p.name = name; setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id })); };
  const delPage = (id) => { if (!confirm("Delete page?")) return; setState((s) => { const pages = s.pages.filter((p) => p.id !== id); const safe = pages.length ? pages : [emptyPage()]; return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId }; }); };
  const renamePage = (id) => { const pg = state.pages.find((p) => p.id === id); const name = prompt("Rename:", pg.name); if (name) setState((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, name } : p) })); };
  const dropPage = (id) => { if (!dragPage || dragPage === id) return; setState((s) => { const pages = [...s.pages]; const fi = pages.findIndex((p) => p.id === dragPage); const ti = pages.findIndex((p) => p.id === id); const [m] = pages.splice(fi, 1); pages.splice(ti, 0, m); return { ...s, pages }; }); setDragPage(null); setOverPage(null); };

  const addBox = (x, y) => {
    const b = newBox(x, y);
    pendingFocus.current = b.id;
    mut((pg) => pg.boxes.push(b));
    setSelBoxId(b.id);
  };
  const delBox = (id) => { mut((pg) => { pg.boxes = pg.boxes.filter((b) => b.id !== id); }); setSelBoxId(null); };
  const cleanEmptyBox = (id) => {
    const box = page.boxes.find((b) => b.id === id); if (!box) return;
    if (box.lines.length === 1 && !box.lines[0].text && box.lines[0].type === "none" && !box.lines[0].indent) delBox(id);
  };

  const getCaretRow = (editorEl) => {
    const sel = window.getSelection(); if (!sel || !sel.rangeCount) return null;
    let node = sel.getRangeAt(0).startContainer;
    while (node && node !== editorEl) { if (node.classList?.contains("cv-row")) return node; node = node.parentElement; }
    return null;
  };

  const setRowType = (editorEl, row, t) => { row.dataset.type = row.dataset.type === t ? "none" : t; syncMarker(row); refreshRows(editorEl); };
  const setRowFont = (editorEl, row, delta) => {
    const fs = Math.max(10, Math.min(48, parseInt(row.dataset.fs || "14") + delta));
    row.dataset.fs = String(fs);
    const t = row.querySelector(".cv-text"); if (t) t.style.fontSize = fs + "px";
  };

  const toolbarAction = (action) => {
    const ed = selBoxId && editorRefs.current[selBoxId]; if (!ed) return;
    const row = getCaretRow(ed); if (!row) { ed.focus(); return; }
    recordHistory(true);
    if (action === "bullet") setRowType(ed, row, "bullet");
    else if (action === "number") setRowType(ed, row, "number");
    else if (action === "bigger") setRowFont(ed, row, 2);
    else if (action === "smaller") setRowFont(ed, row, -2);
    commitLines(selBoxId, ed);
  };

  const onEditorKeyDown = (e, boxId) => {
    const editorEl = e.currentTarget;

    if (e.ctrlKey && !e.shiftKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && (e.key === "z" || e.key === "Z")))) { e.preventDefault(); redo(); return; }
    if (e.key === "Escape") { e.preventDefault(); setSelBoxId(null); editorEl.blur(); return; }
    if (e.ctrlKey && !e.shiftKey && (e.key === "v" || e.key === "V")) { e.preventDefault(); handlePaste(editorEl, boxId); return; }

    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") {
      e.preventDefault();
      const row = getCaretRow(editorEl); if (!row) return;
      recordHistory(true);
      const textEl = row.querySelector(".cv-text");
      const caret = caretOffsetIn(textEl);
      const full = textEl?.textContent || "";
      const before = full.slice(0, caret);
      const after = full.slice(caret);
      if (textEl) textEl.textContent = before;
      const curType = row.dataset.type || "none";
      if (!before.trim() && (curType === "bullet" || curType === "number")) {
        row.dataset.type = "none"; syncMarker(row); refreshRows(editorEl);
        commitLines(boxId, editorEl); return;
      }
      const nr = buildRow({ id: uid(), type: curType, text: after, indent: parseInt(row.dataset.indent || "0"), fontSize: parseInt(row.dataset.fs || "14") });
      row.after(nr);
      placeCaret(nr.querySelector(".cv-text"), 0);
      refreshRows(editorEl);
      commitLines(boxId, editorEl);
      return;
    }

    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Backspace") {
      const row = getCaretRow(editorEl); if (!row) return;
      const textEl = row.querySelector(".cv-text");
      if (caretOffsetIn(textEl) > 0) return;
      const prev = row.previousElementSibling; if (!prev) return;
      e.preventDefault();
      recordHistory(true);
      const prevText = prev.querySelector(".cv-text");
      const prevLen = prevText?.textContent?.length || 0;
      if (prevText && textEl) prevText.textContent += textEl.textContent;
      row.remove();
      placeCaret(prevText, prevLen);
      refreshRows(editorEl);
      commitLines(boxId, editorEl);
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      const row = getCaretRow(editorEl); if (!row) return;
      recordHistory(true);
      const indent = parseInt(row.dataset.indent || "0", 10);
      row.dataset.indent = String(e.shiftKey ? Math.max(0, indent - 1) : indent + 1);
      row.style.paddingLeft = (parseInt(row.dataset.indent) * 22) + "px";
      refreshRows(editorEl);
      commitLines(boxId, editorEl);
      return;
    }

    if (e.ctrlKey && !e.shiftKey && e.key === ".") { e.preventDefault(); const row = getCaretRow(editorEl); if (row) { recordHistory(true); setRowType(editorEl, row, "bullet"); commitLines(boxId, editorEl); } return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "/") { e.preventDefault(); const row = getCaretRow(editorEl); if (row) { recordHistory(true); setRowType(editorEl, row, "number"); commitLines(boxId, editorEl); } return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "." || e.key === ">")) { e.preventDefault(); const row = getCaretRow(editorEl); if (row) { recordHistory(true); setRowFont(editorEl, row, 2); commitLines(boxId, editorEl); } return; }
    if (e.ctrlKey && e.shiftKey && (e.key === "-" || e.key === "_")) { e.preventDefault(); const row = getCaretRow(editorEl); if (row) { recordHistory(true); setRowFont(editorEl, row, -2); commitLines(boxId, editorEl); } return; }
  };

  const handlePaste = async (editorEl, boxId) => {
    try {
      const items = await navigator.clipboard.read().catch(() => null);
      if (items) {
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith("image/"));
          if (imgType) {
            const blob = await item.getType(imgType);
            const reader = new FileReader();
            reader.onload = () => {
              recordHistory(true);
              const nr = buildRow({ id: uid(), type: "image", text: "", indent: 0, fontSize: 14, src: reader.result });
              const cur = getCaretRow(editorEl) || editorEl.lastElementChild;
              if (cur) cur.after(nr); else editorEl.appendChild(nr);
              refreshRows(editorEl);
              commitLines(boxId, editorEl);
            };
            reader.readAsDataURL(blob); return;
          }
          if (item.types.includes("text/html")) {
            const htmlBlob = await item.getType("text/html");
            const parsed = htmlToLines(await htmlBlob.text());
            if (parsed.length) {
              recordHistory(true);
              let ins = getCaretRow(editorEl) || editorEl.lastElementChild;
              for (const line of parsed) { const nr = buildRow(line); if (ins) { ins.after(nr); ins = nr; } else editorEl.appendChild(nr); }
              refreshRows(editorEl);
              commitLines(boxId, editorEl); return;
            }
          }
        }
      }
      const text = await navigator.clipboard.readText(); if (!text.trim()) return;
      recordHistory(true);
      let ins = getCaretRow(editorEl) || editorEl.lastElementChild;
      const parts = text.split("\n").filter((l) => l.trim());
      parts.forEach((t, i) => {
        if (i === 0 && ins) {
          const textEl = ins.querySelector(".cv-text");
          if (textEl && !textEl.textContent.trim()) { textEl.textContent = t.trim(); return; }
        }
        const nr = buildRow(newLine("none", t.trim()));
        if (ins) { ins.after(nr); ins = nr; } else editorEl.appendChild(nr);
      });
      refreshRows(editorEl);
      commitLines(boxId, editorEl);
    } catch {}
  };

  const onEditorClick = (e, boxId) => {
    if (e.target.classList?.contains("cv-collapse-btn")) {
      e.preventDefault();
      const row = e.target.closest(".cv-row");
      if (row) {
        recordHistory(true);
        row.dataset.collapsed = row.dataset.collapsed === "true" ? "false" : "true";
        refreshRows(e.currentTarget);
        commitLines(boxId, e.currentTarget);
      }
    }
  };

  const lassoRect = lasso ? {
    left: Math.min(lasso.sx, lasso.ex || lasso.sx), top: Math.min(lasso.sy, lasso.ey || lasso.sy),
    width: Math.abs((lasso.ex || lasso.sx) - lasso.sx), height: Math.abs((lasso.ey || lasso.sy) - lasso.sy),
  } : null;

  return (
    <>
      <div className="notes-bar">
        {state.pages.map((p) => (
          <button key={p.id}
            className={"page-tab" + (p.id === state.activeId ? " active" : "") + (overPage === p.id && dragPage !== p.id ? " page-drag-over" : "")}
            draggable onDragStart={() => setDragPage(p.id)} onDragEnd={() => { setDragPage(null); setOverPage(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverPage(p.id); }} onDragLeave={() => setOverPage(null)}
            onDrop={() => dropPage(p.id)}
            onClick={() => { setState((s) => ({ ...s, activeId: p.id })); setSelBoxId(null); }}
            onDoubleClick={() => renamePage(p.id)} title="Double-click to rename">
            {p.name}<span className="x" onClick={(e) => { e.stopPropagation(); delPage(p.id); }}>x</span>
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <div className="notes-toolbar">
          <button className="notes-btn" onClick={undo} disabled={!history.length}>Undo</button>
          <button className="notes-btn" onClick={redo} disabled={!future.length}>Redo</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Bullet (Ctrl+.)" onMouseDown={(e) => e.preventDefault()} onClick={() => toolbarAction("bullet")}>{"\u2022"}</button>
          <button className="notes-btn" title="Number (Ctrl+/)" onMouseDown={(e) => e.preventDefault()} onClick={() => toolbarAction("number")}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Smaller (Ctrl+Shift+-)" onMouseDown={(e) => e.preventDefault()} onClick={() => toolbarAction("smaller")}>A-</button>
          <button className="notes-btn" title="Larger (Ctrl+Shift+.)" onMouseDown={(e) => e.preventDefault()} onClick={() => toolbarAction("bigger")}>A+</button>
          <span className="notes-sep" />
          {selBoxId && <button className="notes-btn cv-del-btn" onClick={() => delBox(selBoxId)}>Del box</button>}
        </div>
        <span className="notes-hint">Dbl-click canvas for a box  |  drag the top bar to move  |  click-drag to select text  |  Tab indent  |  Ctrl+. / Ctrl+/  |  Ctrl+V paste</span>
      </div>

      <div className="cv-canvas" ref={cvRef}
        style={{ width: canvasW, minHeight: canvasH }}
        onDoubleClick={(e) => { if (e.target !== cvRef.current) return; const r = cvRef.current.getBoundingClientRect(); addBox(e.clientX - r.left - 180, e.clientY - r.top - 14); }}
        onMouseDown={(e) => { if (e.target !== cvRef.current) return; setSelBoxId(null); const r = cvRef.current.getBoundingClientRect(); setLasso({ sx: e.clientX - r.left, sy: e.clientY - r.top, ex: e.clientX - r.left, ey: e.clientY - r.top }); }}
        onClick={(e) => { if (e.target === cvRef.current) setSelBoxId(null); }}
      >
        {lassoRect && lassoRect.width > 4 && (
          <div style={{ position: "absolute", border: "1px solid #ff8c3a", background: "rgba(255,140,58,0.05)", borderRadius: 4, pointerEvents: "none", left: lassoRect.left, top: lassoRect.top, width: lassoRect.width, height: lassoRect.height }} />
        )}

        {page.boxes.map((box) => (
          <div key={box.id} ref={(el) => { boxRefs.current[box.id] = el; }}
            className={"cv-box" + (selBoxId === box.id ? " selected" : "")}
            style={{ left: box.x, top: box.y, width: box.w }}
            onClick={(e) => { e.stopPropagation(); setSelBoxId(box.id); }}
          >
            <div className="cv-drag-bar"
              onMouseDown={(e) => { if (e.target.closest(".cv-editor")) return; e.preventDefault(); setDrag({ id: box.id, sx: e.clientX, sy: e.clientY, ox: box.x, oy: box.y }); setSelBoxId(box.id); }}
              title="Drag to move"
            />
            <div
              className="cv-editor"
              ref={(el) => { if (el) editorRefs.current[box.id] = el; }}
              contentEditable
              suppressContentEditableWarning
              spellCheck={false}
              onFocus={() => setSelBoxId(box.id)}
              onBlur={() => setTimeout(() => { if (!editorRefs.current[box.id]?.contains(document.activeElement)) cleanEmptyBox(box.id); }, 200)}
              onInput={(e) => { recordHistory(false); commitLines(box.id, e.currentTarget); }}
              onClick={(e) => onEditorClick(e, box.id)}
              onKeyDown={(e) => onEditorKeyDown(e, box.id)}
              onPaste={(e) => e.preventDefault()}
            />
            <div className="cv-resize"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setResize({ id: box.id, sx: e.clientX, ow: box.w }); }}
              title="Drag to resize"
            />
          </div>
        ))}
        {page.boxes.length === 0 && <div className="cv-empty">Double-click anywhere to create a text box</div>}
      </div>
    </>
  );
}
