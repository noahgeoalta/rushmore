"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "rushmore-notes-v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const blank = () => ({ id: uid(), text: "", collapsed: false, fontSize: 14, children: [] });

function seedTree() {
  return [
    {
      id: uid(), text: "Hours — June 2026", collapsed: false, fontSize: 14,
      children: [{ id: uid(), text: "Jun 11 — ", collapsed: false, fontSize: 14, children: [] }],
    },
    {
      id: uid(), text: "Next steps", collapsed: false, fontSize: 14,
      children: [
        { id: uid(), text: "Shift+Alt+← outdent · Shift+Alt+→ indent · Ctrl+. new bullet · Ctrl+Shift+. bigger · Ctrl+Shift+- smaller · drag row to move/nest", collapsed: false, fontSize: 14, children: [] },
      ],
    },
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

let _dragId = null;

export default function Notes() {
  const [state, setState] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
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
      inputs.current[focusId].focus();
      setFocusId(null);
    }
  }, [focusId, state]);

  if (!state) return null;

  const page = state.pages.find((p) => p.id === state.activeId) || state.pages[0];

  const mutate = (fn) => {
    setState((s) => {
      const next = structuredClone(s);
      const pg = next.pages.find((p) => p.id === next.activeId) || next.pages[0];
      fn(pg);
      return next;
    });
  };

  const addPage = () => {
    const name = prompt("Page name:", "New page");
    if (name === null) return;
    const p = { id: uid(), name: name || "Untitled", tree: [blank()] };
    setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id }));
  };
  const deletePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    if (!confirm(`Delete "${pg.name}"?`)) return;
    setState((s) => {
      const pages = s.pages.filter((p) => p.id !== id);
      const safe = pages.length ? pages : [{ id: uid(), name: "Main", tree: [blank()] }];
      return { pages: safe, activeId: s.activeId === id ? safe[0].id : s.activeId };
    });
  };
  const renamePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    const name = prompt("Rename:", pg.name);
    if (name) setState((s) => ({ ...s, pages: s.pages.map((p) => p.id === id ? { ...p, name } : p) }));
  };

  const setText = (id, text) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.text = text; });

  const addSibling = (id) => {
    const n = blank();
    mutate((pg) => {
      const h = locate(pg.tree, id);
      if (!h) return;
      if (h.node.children.length && !h.node.collapsed) h.node.children.unshift(n);
      else h.list.splice(h.index + 1, 0, n);
    });
    setFocusId(n.id);
  };

  const indent = (id) => mutate((pg) => {
    const h = locate(pg.tree, id);
    if (!h || h.index === 0) return;
    const prev = h.list[h.index - 1];
    h.list.splice(h.index, 1);
    prev.collapsed = false;
    prev.children.push(h.node);
  });

  const outdent = (id) => mutate((pg) => {
    const find = (nodes) => {
      for (let i = 0; i < nodes.length; i++) {
        const idx = nodes[i].children.findIndex((c) => c.id === id);
        if (idx > -1) return { parentList: nodes, parentIndex: i, idx };
        const d = find(nodes[i].children);
        if (d) return d;
      }
      return null;
    };
    const h = find(pg.tree);
    if (!h) return;
    const parent = h.parentList[h.parentIndex];
    const [node] = parent.children.splice(h.idx, 1);
    h.parentList.splice(h.parentIndex + 1, 0, node);
  });

  const removeNode = (id) => {
    let focusTarget = null;
    mutate((pg) => {
      const order = visibleIds(pg.tree);
      const pos = order.indexOf(id);
      focusTarget = order[pos - 1] || order[pos + 1] || null;
      const h = locate(pg.tree, id);
      if (!h) return;
      h.list.splice(h.index, 1);
      if (!pg.tree.length) pg.tree.push(blank());
    });
    if (focusTarget) setFocusId(focusTarget);
  };

  const moveVert = (id, dir) => mutate((pg) => {
    const h = locate(pg.tree, id);
    if (!h) return;
    const j = h.index + dir;
    if (j < 0 || j >= h.list.length) return;
    [h.list[h.index], h.list[j]] = [h.list[j], h.list[h.index]];
  });

  const toggle = (id) => mutate((pg) => { const h = locate(pg.tree, id); if (h) h.node.collapsed = !h.node.collapsed; });

  const changeFontSize = (id, delta) => mutate((pg) => {
    const h = locate(pg.tree, id);
    if (!h) return;
    h.node.fontSize = Math.max(10, Math.min(32, (h.node.fontSize || 14) + delta));
  });

  const onDragStart = (id) => { _dragId = id; };
  const onDragEnd = () => { _dragId = null; setDropTarget(null); };

  const onDragOver = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!_dragId || _dragId === id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientY - rect.top) / rect.height;
    const zone = pct < 0.3 ? "before" : pct > 0.7 ? "after" : "child";
    setDropTarget({ id, zone });
  };

  const onDrop = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    if (!_dragId || _dragId === id || !dropTarget) return;
    const { zone } = dropTarget;
    mutate((pg) => {
      const dragH = locate(pg.tree, _dragId);
      if (!dragH) return;
      if (zone === "child" && contains(dragH.node, id)) return;
      const dragged = structuredClone(dragH.node);
      dragH.list.splice(dragH.index, 1);
      if (zone === "child") {
        const tgt = locate(pg.tree, id);
        if (!tgt) { pg.tree.push(dragged); return; }
        tgt.node.collapsed = false;
        tgt.node.children.push(dragged);
      } else {
        const tgt = locate(pg.tree, id);
        if (!tgt) { pg.tree.push(dragged); return; }
        tgt.list.splice(zone === "before" ? tgt.index : tgt.index + 1, 0, dragged);
      }
    });
    _dragId = null;
    setDropTarget(null);
  };

  const onKeyDown = (e, id) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ".") { e.preventDefault(); addSibling(id); return; }
    if (e.ctrlKey && e.shiftKey && e.key === ".") { e.preventDefault(); changeFontSize(id, 2); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "-") { e.preventDefault(); changeFontSize(id, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indent(id); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdent(id); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addSibling(id); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdent(id) : indent(id); return; }
    if (e.key === "Backspace" && e.target.value === "") { e.preventDefault(); removeNode(id); return; }
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
            className={["ol-row", dt === "before" ? "drop-before" : "", dt === "after" ? "drop-after" : "", dt === "child" ? "drop-child" : ""].filter(Boolean).join(" ")}
            draggable
            onDragStart={() => onDragStart(n.id)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, n.id)}
            onDragLeave={(e) => { e.stopPropagation(); setDropTarget(null); }}
            onDrop={(e) => onDrop(e, n.id)}
          >
            <button
              className={`ol-caret ${n.children.length ? "has-kids" : ""} ${n.collapsed ? "collapsed" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggle(n.id); }}
              tabIndex={-1}
            >
              {n.children.length ? (n.collapsed ? "▶" : "▼") : ""}
            </button>
            <span className={`ol-bullet ${n.collapsed && n.children.length ? "has-hidden" : ""}`}>•</span>
            <input
              className="ol-input"
              ref={(el) => (inputs.current[n.id] = el)}
              style={{ fontSize: `${n.fontSize || 14}px` }}
              value={n.text}
              placeholder="…"
              onChange={(e) => setText(n.id, e.target.value)}
              onKeyDown={(e) => onKeyDown(e, n.id)}
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
            className={`page-tab ${p.id === state.activeId ? "active" : ""}`}
            onClick={() => setState((s) => ({ ...s, activeId: p.id }))}
            onDoubleClick={() => renamePage(p.id)}
            title="Double-click to rename"
          >
            {p.name}
            {state.pages.length > 1 && (
              <span className="x" onClick={(e) => { e.stopPropagation(); deletePage(p.id); }}>×</span>
            )}
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>+ New page</button>
        <span className="notes-hint">Shift+Alt+←/→ indent · Ctrl+. bullet · Ctrl+Shift+./- font · drag row</span>
      </div>
      <div className="outliner">{renderNodes(page.tree)}</div>
    </>
  );
}
