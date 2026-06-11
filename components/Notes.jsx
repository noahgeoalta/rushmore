"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "rushmore-notes-v2";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const blankNode = (bullet = false) => ({ id: uid(), text: "", bullet, collapsed: false, fontSize: 14, children: [] });

function seedTree() {
  return [
    { id: uid(), text: "Hours \u2014 June 2026", bullet: false, collapsed: false, fontSize: 18, children: [
      { id: uid(), text: "Jun 11 \u2014 ", bullet: true, collapsed: false, fontSize: 14, children: [] },
    ]},
    { id: uid(), text: "Next steps", bullet: false, collapsed: false, fontSize: 18, children: [
      { id: uid(), text: "Enter = plain line  \u00b7  Ctrl+. = toggle bullet  \u00b7  indented line inherits bullet", bullet: true, collapsed: false, fontSize: 14, children: [] },
    ]},
  ];
}

function defaultState() {
  const main = { id: uid(), name: "Main", tree: seedTree() };
  return { pages: [main], activeId: main.id };
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
  const prefix = node.bullet ? "* " : "";
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
    const isBullet = content.startsWith("* ");
    const text = isBullet ? content.slice(2) : content;
    const childLines = [];
    let j = i + 1;
    while (j < lines.length && lines[j].match(/^( *)/)[1].length > 0) {
      childLines.push(lines[j].slice(2));
      j++;
    }
    nodes.push({ id: uid(), text, bullet: isBullet, collapsed: false, fontSize: 14, children: parseLines(childLines) });
    i = j;
  }
  return nodes;
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
      setState(raw ? JSON.parse(raw) : defaultState());
    } catch { setState(defaultState()); }
  }, []);

  useEffect(() => {
    if (state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
  }, [state]);

  useEffect(() => {
    if (focusId && inputs.current[focusId]) {
      const el = inputs.current[focusId];
      el.focus();
      if (focusCaret !== null) {
        el.setSelectionRange(focusCaret, focusCaret);
        setFocusCaret(null);
      }
      setFocusId(null);
    }
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

  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [state, ...f]);
    setState(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, state]);
    setState(future[0]);
    setFuture((f) => f.slice(1));
  };

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
  const onPageDragStart = (id) => setDragPageId(id);
  const onPageDrop = (targetId) => {
    if (!dragPageId || dragPageId === targetId) return;
    setState((s) => {
      const pages = [...s.pages];
      const fromIdx = pages.findIndex((p) => p.id === dragPageId);
      const toIdx = pages.findIndex((p) => p.id === targetId);
      const [moved] = pages.splice(fromIdx, 1);
      pages.splice(toIdx, 0, moved);
      return { ...s, pages };
    });
    setDragPageId(null); setOverPageId(null);
  };

  const setText = (id, text) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.text = text; }, false);

  const addLine = (id) => {
    const n = blankNode(false);
    mutate((pg) => {
      const h = locate(pg.tree, id);
      if (!h) return;
      n.bullet = h.node.bullet;
      if (h.node.children.length && !h.node.collapsed) {
        n.bullet = h.node.children[0]?.bullet ?? h.node.bullet;
        h.node.children.unshift(n);
      } else {
        h.list.splice(h.index + 1, 0, n);
      }
    });
    setFocusId(n.id);
  };

  const toggleBullet = (id) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.bullet = !h.node.bullet; });

  const indent = (id) => mutate((pg) => {
    const h = locate(pg.tree, id);
    if (!h || h.index === 0) return;
    const prev = h.list[h.index - 1];
    h.list.splice(h.index, 1);
    prev.collapsed = false;
    h.node.bullet = h.node.bullet || prev.bullet;
    prev.children.push(h.node);
  });

  const outdent = (id) => mutate((pg) => {
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

  const backspaceNode = (id, curText, caretPos) => {
    if (caretPos > 0) return false;
    if (curText === "") {
      let ft = null;
      mutate((pg) => {
        const order = visibleIds(pg.tree);
        const pos = order.indexOf(id);
        ft = order[pos - 1] || null;
        const h = locate(pg.tree, id); if (!h) return;
        h.list.splice(h.index, 1);
        if (!pg.tree.length) pg.tree.push(blankNode());
      });
      if (ft) setFocusId(ft);
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
      setFocusId(prevId);
      setFocusCaret(prevLen);
      return true;
    }
  };

  const moveVert = (id, dir) => mutate((pg) => {
    const h = locate(pg.tree, id); if (!h) return;
    const j = h.index + dir;
    if (j < 0 || j >= h.list.length) return;
    [h.list[h.index], h.list[j]] = [h.list[j], h.list[h.index]];
  });

  const toggle = (id) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.collapsed = !h.node.collapsed; }, false);

  const changeFontSize = (id, delta) => mutate((pg) => {
    const h = locate(pg.tree, id); if (!h) return;
    h.node.fontSize = Math.max(10, Math.min(48, (h.node.fontSize || 14) + delta));
  });

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
        const tgt = locate(pg.tree, id);
        if (!tgt) { pg.tree.push(dragged); return; }
        tgt.node.collapsed = false; tgt.node.children.push(dragged);
      } else {
        const tgt = locate(pg.tree, id);
        if (!tgt) { pg.tree.push(dragged); return; }
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
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ".") { e.preventDefault(); toggleBullet(id); return; }
    if (e.ctrlKey && e.shiftKey && e.key === ".") { e.preventDefault(); changeFontSize(id, 2); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "-") { e.preventDefault(); changeFontSize(id, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indent(id); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdent(id); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdent(id) : indent(id); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addLine(id); return; }
    if (e.key === "Backspace") {
      const handled = backspaceNode(id, e.target.value, e.target.selectionStart);
      if (handled) e.preventDefault();
      return;
    }
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
    nodes.map((n) => {
      const dt = dropTarget?.id === n.id ? dropTarget.zone : null;
      return (
        <div key={n.id}>
          <div
            className={["ol-row", dt==="before"?"drop-before":"", dt==="after"?"drop-after":"", dt==="child"?"drop-child":""].filter(Boolean).join(" ")}
            draggable
            onDragStart={() => onDragStart(n.id)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, n.id)}
            onDragLeave={(e) => { e.stopPropagation(); setDropTarget(null); }}
            onDrop={(e) => onDrop(e, n.id)}
          >
            <button
              className={"ol-caret" + (n.children.length ? " has-kids" : "") + (n.collapsed ? " collapsed" : "")}
              onClick={(e) => { e.stopPropagation(); toggle(n.id); }}
              tabIndex={-1}
            >
              {n.children.length ? (n.collapsed ? "\u25b6" : "\u25bc") : ""}
            </button>
            {n.bullet
              ? <span className={"ol-bullet" + (n.collapsed && n.children.length ? " has-hidden" : "")}>\u2022</span>
              : <span className="ol-bullet-spacer" />
            }
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
          {!n.collapsed && n.children.length > 0 && (
            <div className="ol-kids">{renderNodes(n.children)}</div>
          )}
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
            onDragStart={() => onPageDragStart(p.id)}
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
          <button className="notes-btn" title="Font smaller (Ctrl+Shift+-)" onClick={() => focusedId && changeFontSize(focusedId, -2)}>A-</button>
          <button className="notes-btn" title="Font larger (Ctrl+Shift+.)" onClick={() => focusedId && changeFontSize(focusedId, 2)}>A+</button>
          <span className="notes-sep" />
          <button className="notes-btn" title="Toggle bullet (Ctrl+.)" onClick={() => focusedId && toggleBullet(focusedId)}>Bullet</button>
        </div>
        <span className="notes-hint">Shift+Alt+left/right indent  |  drag row  |  Ctrl+C/V copies structure</span>
      </div>
      <div className="outliner">{renderNodes(page.tree)}</div>
    </>
  );
}
