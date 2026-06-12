"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const KEY = "rushmore-notes-v3";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// type: "none" | "bullet" | "number"
const blankNode = (type = "none") => ({ id: uid(), text: "", type, collapsed: false, fontSize: 14, children: [] });

const BULLET_CHAR = String.fromCharCode(8226);
const COLLAPSE_CLOSED = String.fromCharCode(9654);
const COLLAPSE_OPEN = String.fromCharCode(9660);

function seedTree() {
  return [
    { id: uid(), text: "Hours \u2014 June 2026", type: "none", collapsed: false, fontSize: 18, children: [
      { id: uid(), text: "Jun 11 \u2014 ", type: "bullet", collapsed: false, fontSize: 14, children: [] },
    ]},
    { id: uid(), text: "Next steps", type: "none", collapsed: false, fontSize: 18, children: [
      { id: uid(), text: "Enter = plain  \u00b7  Ctrl+. = bullet  \u00b7  Ctrl+/ = numbered  \u00b7  inherits on indent", type: "bullet", collapsed: false, fontSize: 14, children: [] },
    ]},
  ];
}

function defaultState() {
  const main = { id: uid(), name: "Main", tree: seedTree() };
  return { pages: [main], activeId: main.id };
}

function migrateNode(n) {
  if (typeof n.bullet === "boolean") { n.type = n.bullet ? "bullet" : "none"; delete n.bullet; }
  if (!n.type) n.type = "none";
  if (!n.fontSize) n.fontSize = 14;
  if (!n.children) n.children = [];
  n.children = n.children.map(migrateNode);
  return n;
}
function migrateState(s) {
  if (!s || !s.pages) return defaultState();
  s.pages = s.pages.map((p) => ({ ...p, tree: (p.tree || []).map(migrateNode) }));
  return s;
}

function locate(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { list: nodes, index: i, node: nodes[i] };
    const hit = locate(nodes[i].children, id);
    if (hit) return hit;
  }
  return null;
}
function contains(node, id) {
  return node.id === id || node.children.some((c) => contains(c, id));
}
function visibleIds(nodes, out = []) {
  for (const n of nodes) {
    out.push(n.id);
    if (!n.collapsed) visibleIds(n.children, out);
  }
  return out;
}

function serializeNode(node, depth = 0) {
  const indent = "  ".repeat(depth);
  const prefix = node.type === "bullet" ? "* " : node.type === "number" ? "1. " : "";
  const lines = [indent + prefix + node.text];
  for (const c of node.children) lines.push(...serializeNode(c, depth + 1));
  return lines;
}

function parseLines(lines) {
  const nodes = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const spaces = raw.match(/^( *)/)[1].length;
    if (spaces > 0) { i++; continue; }
    const content = raw.trimStart();
    let type = "none", text = content;
    if (content.startsWith("* ")) { type = "bullet"; text = content.slice(2); }
    else if (/^\d+\. /.test(content)) { type = "number"; text = content.replace(/^\d+\. /, ""); }
    const childLines = [];
    let j = i + 1;
    while (j < lines.length && lines[j].match(/^( *)/)[1].length > 0) { childLines.push(lines[j].slice(2)); j++; }
    nodes.push({ id: uid(), text, type, collapsed: false, fontSize: 14, children: parseLines(childLines) });
    i = j;
  }
  return nodes;
}

function getNumberInList(list, index) {
  let n = 0;
  for (let i = 0; i <= index; i++) { if (list[i].type === "number") n++; }
  return n;
}

let _dragId = null;

export default function Notes() {
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [focusId, setFocusId] = useState(null);
  const [focusCaret, setFocusCaret] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [dragPageId, setDragPageId] = useState(null);
  const [overPageId, setOverPageId] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const inputs = useRef({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const oldRaw = !raw ? localStorage.getItem("rushmore-notes-v2") : null;
      const parsed = raw ? JSON.parse(raw) : (oldRaw ? JSON.parse(oldRaw) : null);
      setState(parsed ? migrateState(parsed) : defaultState());
    } catch { setState(defaultState()); }
  }, []);

  useEffect(() => {
    if (state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  }, [state]);

  useLayoutEffect(() => {
    if (!focusId) return;
    const tryFocus = () => {
      const el = inputs.current[focusId];
      if (!el) return;
      el.focus();
      if (focusCaret !== null) { el.setSelectionRange(focusCaret, focusCaret); setFocusCaret(null); }
      setFocusId(null);
    };
    tryFocus();
    const raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [focusId, focusCaret, state]);

  if (!state) return null;
  const page = state.pages.find((p) => p.id === state.activeId) || state.pages[0];

  const mutate = (fn, record = true) => {
    setState((s) => {
      if (record) { setHistory((h) => [...h.slice(-60), s]); setFuture([]); }
      const next = structuredClone(s);
      const pg = next.pages.find((p) => p.id === next.activeId) || next.pages[0];
      fn(pg);
      return next;
    });
  };

  const undo = () => { if (!history.length) return; setFuture((f) => [state, ...f]); setState(history[history.length - 1]); setHistory((h) => h.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setHistory((h) => [...h, state]); setState(future[0]); setFuture((f) => f.slice(1)); };

  const addPage = () => {
    const name = prompt("Page name:", "New page");
    if (name === null) return;
    const p = { id: uid(), name: name || "Untitled", tree: [blankNode()] };
    setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id }));
  };
  const deletePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    if (!confirm('Delete "' + pg.name + '"?')) return;
    setState((s) => {
      const pages = s.pages.filter((p) => p.id !== id);
      const safe = pages.length ? pages : [{ id: uid(), name: "Main", tree: [blankNode()] }];
      return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId };
    });
  };
  const renamePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    const name = prompt("Rename:", pg.name);
    if (name) setState((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, name } : p) }));
  };
  const onPageDrop = (targetId) => {
    if (!dragPageId || dragPageId === targetId) return;
    setState((s) => {
      const pages = [...s.pages];
      const from = pages.findIndex((p) => p.id === dragPageId);
      const to = pages.findIndex((p) => p.id === targetId);
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return { ...s, pages };
    });
    setDragPageId(null); setOverPageId(null);
  };

  const setText = (id, text) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.text = text; }, false);

  const addLine = (id) => {
    const n = blankNode("none");
    mutate((pg) => {
      const h = locate(pg.tree, id); if (!h) return;
      n.type = h.node.type;
      if (h.node.children.length && !h.node.collapsed) {
        n.type = h.node.children[0]?.type ?? h.node.type;
        h.node.children.unshift(n);
      } else {
        h.list.splice(h.index + 1, 0, n);
      }
    });
    setFocusId(n.id);
  };

  const cycleType = (id, targetType) => {
    mutate((pg) => { const h = locate(pg.tree, id); if (!h) return; h.node.type = h.node.type === targetType ? "none" : targetType; });
    setFocusId(id);
  };

  const indent = (id) => {
    mutate((pg) => {
      const h = locate(pg.tree, id); if (!h || h.index === 0) return;
      const prev = h.list[h.index - 1];
      h.list.splice(h.index, 1);
      prev.collapsed = false;
      if (h.node.type === "none") h.node.type = prev.type;
      prev.children.push(h.node);
    });
    setFocusId(id);
  };

  const outdent = (id) => {
    mutate((pg) => {
      const find = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
          const idx = nodes[i].children.findIndex((c) => c.id === id);
          if (idx > -1) return { parentList: nodes, parentIndex: i, idx };
          const d = find(nodes[i].children); if (d) return d;
        }
        return null;
      };
      const h = find(pg.tree); if (!h) return;
      const [node] = h.parentList[h.parentIndex].children.splice(h.idx, 1);
      h.parentList.splice(h.parentIndex + 1, 0, node);
    });
    setFocusId(id);
  };

  const backspaceNode = (id, curText, caretPos) => {
    if (caretPos > 0) return false;
    if (curText === "") {
      // Capture target BEFORE mutate so setState closure doesn't stale it
      const order = visibleIds(page.tree);
      const ft = order[order.indexOf(id) - 1] || null;
      const fth = ft ? locate(page.tree, ft) : null;
      const ftLen = fth ? fth.node.text.length : 0;
      mutate((pg) => {
        const h = locate(pg.tree, id); if (!h) return;
        h.list.splice(h.index, 1);
        if (!pg.tree.length) pg.tree.push(blankNode());
      });
      if (ft) { setFocusId(ft); setFocusCaret(ftLen); }
      return true;
    } else {
      const order = visibleIds(page.tree);
      const pos = order.indexOf(id);
      if (pos === 0) return false;
      const prevId = order[pos - 1];
      let prevLen = 0;
      mutate((pg) => {
        const prev = locate(pg.tree, prevId);
        const curr = locate(pg.tree, id);
        if (!prev || !curr) return;
        prevLen = prev.node.text.length;
        prev.node.text += curr.node.text;
        curr.list.splice(curr.index, 1);
        if (!pg.tree.length) pg.tree.push(blankNode());
      });
      setFocusId(prevId); setFocusCaret(prevLen);
      return true;
    }
  };

  const moveVert = (id, dir) => {
    mutate((pg) => {
      const h = locate(pg.tree, id); if (!h) return;
      const j = h.index + dir;
      if (j < 0 || j >= h.list.length) return;
      [h.list[h.index], h.list[j]] = [h.list[j], h.list[h.index]];
    });
    setFocusId(id);
  };

  const toggle = (id) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.collapsed = !h.node.collapsed; }, false);

  const changeFontSize = (id, delta) => {
    mutate((pg) => { const h = locate(pg.tree, id); if (!h) return; h.node.fontSize = Math.max(10, Math.min(48, (h.node.fontSize || 14) + delta)); });
    setFocusId(id);
  };

  const copyNode = (id) => {
    const h = locate(page.tree, id); if (!h) return;
    navigator.clipboard.writeText(serializeNode(h.node, 0).join("\n")).catch(() => {});
  };
  const pasteAtNode = async (id) => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      const newNodes = parseLines(text.split("\n").filter((l) => l.trim()));
      if (!newNodes.length) return;
      mutate((pg) => { const h = locate(pg.tree, id); if (!h) return; h.list.splice(h.index + 1, 0, ...newNodes); });
      setFocusId(newNodes[0].id);
    } catch {}
  };

  const onDragStart = (id) => { _dragId = id; };
  const onDragEnd = () => { _dragId = null; setDropTarget(null); };
  const onDragOver = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    if (!_dragId || _dragId === id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientY - rect.top) / rect.height;
    setDropTarget({ id, zone: pct < 0.3 ? "before" : pct > 0.7 ? "after" : "child" });
  };
  const onDrop = (e, id) => {
    e.preventDefault(); e.stopPropagation();
    if (!_dragId || _dragId === id || !dropTarget) return;
    const { zone } = dropTarget;
    mutate((pg) => {
      const dragH = locate(pg.tree, _dragId); if (!dragH) return;
      if (zone === "child" && contains(dragH.node, id)) return;
      const dragged = structuredClone(dragH.node);
      dragH.list.splice(dragH.index, 1);
      if (zone === "child") {
        const tgt = locate(pg.tree, id); if (!tgt) { pg.tree.push(dragged); return; }
        tgt.node.collapsed = false; tgt.node.children.push(dragged);
      } else {
        const tgt = locate(pg.tree, id); if (!tgt) { pg.tree.push(dragged); return; }
        tgt.list.splice(zone === "before" ? tgt.index : tgt.index + 1, 0, dragged);
      }
    });
    _dragId = null; setDropTarget(null);
  };

  const onKeyDown = (e, id) => {
    if (e.ctrlKey && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "c" && e.target.selectionStart === e.target.selectionEnd) { e.preventDefault(); copyNode(id); return; }
    if (e.ctrlKey && !e.shiftKey && e.key === "v") { e.preventDefault(); pasteAtNode(id); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ".") { e.preventDefault(); cycleType(id, "bullet"); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "/") { e.preventDefault(); cycleType(id, "number"); return; }
    if (e.ctrlKey && e.shiftKey && e.key === ".") { e.preventDefault(); changeFontSize(id, 2); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "-") { e.preventDefault(); changeFontSize(id, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indent(id); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdent(id); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdent(id) : indent(id); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addLine(id); return; }
    if (e.key === "Backspace") { const h = backspaceNode(id, e.target.value, e.target.selectionStart); if (h) e.preventDefault(); return; }
    if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); moveVert(id, -1); return; }
    if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); moveVert(id, 1); return; }
    if (!e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const order = visibleIds(page.tree);
      const pos = order.indexOf(id);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); inputs.current[next]?.focus(); }
    }
  };

  const renderNodes = (nodes) =>
    nodes.map((n, idx) => {
      const dt = dropTarget?.id === n.id ? dropTarget.zone : null;
      const num = n.type === "number" ? getNumberInList(nodes, idx) : null;
      const hasHidden = n.collapsed && n.children.length;
      return (
        <div key={n.id}>
          <div
            className={["ol-row", dt==="before"?"drop-before":"", dt==="after"?"drop-after":"", dt==="child"?"drop-child":""].filter(Boolean).join(" ")}
            onDragOver={(e) => onDragOver(e, n.id)}
            onDragLeave={(e) => { e.stopPropagation(); setDropTarget(null); }}
            onDrop={(e) => onDrop(e, n.id)}
          >
            <button
              className={"ol-caret" + (n.children.length ? " has-kids" : "") + (n.collapsed ? " collapsed" : "")}
              onClick={(e) => { e.stopPropagation(); toggle(n.id); }}
              tabIndex={-1}
            >
              {n.children.length ? (n.collapsed ? COLLAPSE_CLOSED : COLLAPSE_OPEN) : ""}
            </button>
            {n.type === "bullet" && (
              <span className={"ol-marker ol-bullet drag-handle" + (hasHidden ? " has-hidden" : "")} draggable onDragStart={(e) => { e.stopPropagation(); onDragStart(n.id); }} onDragEnd={onDragEnd} title="Drag to move">{BULLET_CHAR}</span>
            )}
            {n.type === "number" && (
              <span className={"ol-marker ol-number drag-handle" + (hasHidden ? " has-hidden" : "")} draggable onDragStart={(e) => { e.stopPropagation(); onDragStart(n.id); }} onDragEnd={onDragEnd} title="Drag to move">{num}.</span>
            )}
            {n.type === "none" && (
              <span className="ol-marker ol-spacer drag-handle" draggable onDragStart={(e) => { e.stopPropagation(); onDragStart(n.id); }} onDragEnd={onDragEnd} title="Drag to move" />
            )}
            <input
              className="ol-input"
              ref={(el) => (inputs.current[n.id] = el)}
              style={{ fontSize: (n.fontSize || 14) + "px" }}
              value={n.text}
              placeholder="..."
              onChange={(e) => setText(n.id, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, n.id)}
              onFocus={() => setFocusedId(n.id)}
            />
          </div>
          {!n.collapsed && n.children.length > 0 && <div className="ol-kids">{renderNodes(n.children)}</div>}
        </div>
      );
    });

  return (
    <>
      <div className="notes-bar">
        {state.pages.map((p) => (
          <button
            key={p.id}
            className={"page-tab" + (p.id===state.activeId?" active":"") + (overPageId===p.id&&dragPageId!==p.id?" page-drag-over":"")}
            draggable
            onDragStart={() => setDragPageId(p.id)}
            onDragEnd={() => { setDragPageId(null); setOverPageId(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverPageId(p.id); }}
            onDragLeave={() => setOverPageId(null)}
            onDrop={() => onPageDrop(p.id)}
            onClick={() => setState((s) => ({ ...s, activeId: p.id }))}
            onDoubleClick={() => renamePage(p.id)}
            title="Double-click to rename, drag to reorder"
          >
            {p.name}
            <span className="x" title="Delete page" onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}>x</span>
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <div className="notes-toolbar">
          <button className="notes-btn" title="Undo (Ctrl+Z)" onClick={undo} disabled={!history.length}>Undo</button>
          <button className="notes-btn" title="Redo (Ctrl+Y)" onClick={redo} disabled={!future.length}>Redo</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Toggle bullet (Ctrl+.)" onClick={() => focusedId && cycleType(focusedId, "bullet")}>Bullet</button>
          <button className="notes-btn" title="Toggle numbered (Ctrl+/)" onClick={() => focusedId && cycleType(focusedId, "number")}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Font smaller (Ctrl+Shift+-)" onClick={() => focusedId && changeFontSize(focusedId, -2)}>A-</button>
          <button className="notes-btn" title="Font larger (Ctrl+Shift+.)" onClick={() => focusedId && changeFontSize(focusedId, 2)}>A+</button>
        </div>
        <span className="notes-hint">Ctrl+. bullet  |  Ctrl+/ number  |  Shift+Alt+left/right indent  |  drag marker</span>
      </div>
      <div className="outliner">{renderNodes(page.tree)}</div>
    </>
  );
}
