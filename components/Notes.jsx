"use client";

import { useEffect, useRef, useState } from "react";

const KEY = "rushmore-notes-v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const blank = () => ({ id: uid(), text: "", collapsed: false, children: [] });

function seedTree() {
  return [
    {
      id: uid(),
      text: "Hours — June 2026",
      collapsed: false,
      children: [{ id: uid(), text: "Jun 11 — ", collapsed: false, children: [] }],
    },
    {
      id: uid(),
      text: "Next steps",
      collapsed: false,
      children: [
        {
          id: uid(),
          text: "Enter = new line · Tab = indent · Shift+Tab = outdent · Alt+↑/↓ = move · drag the bullet",
          collapsed: false,
          children: [],
        },
      ],
    },
  ];
}

function defaultState() {
  const main = { id: uid(), name: "Main", tree: seedTree() };
  return { pages: [main], activeId: main.id };
}

/* ---- tree helpers (mutate a cloned tree) ---- */
function locate(nodes, id, parentList = null) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { list: nodes, index: i, node: nodes[i] };
    const hit = locate(nodes[i].children, id, nodes);
    if (hit) return hit;
  }
  return null;
}

function contains(node, id) {
  return node.children.some((c) => c.id === id || contains(c, id));
}

function visibleIds(nodes, out = []) {
  for (const n of nodes) {
    out.push(n.id);
    if (!n.collapsed) visibleIds(n.children, out);
  }
  return out;
}

export default function Notes() {
  const [state, setState] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const inputs = useRef({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setState(raw ? JSON.parse(raw) : defaultState());
    } catch {
      setState(defaultState());
    }
  }, []);

  useEffect(() => {
    if (state) {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {}
    }
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

  /* ---- page ops ---- */
  const addPage = () => {
    const name = prompt("Page name:", "New page");
    if (name === null) return;
    const p = { id: uid(), name: name || "Untitled", tree: [blank()] };
    setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id }));
  };
  const deletePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    if (!confirm(`Delete page "${pg.name}"? This can't be undone.`)) return;
    setState((s) => {
      const pages = s.pages.filter((p) => p.id !== id);
      const safe = pages.length ? pages : [{ id: uid(), name: "Main", tree: [blank()] }];
      return {
        pages: safe,
        activeId: s.activeId === id ? safe[0].id : s.activeId,
      };
    });
  };
  const renamePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    const name = prompt("Rename page:", pg.name);
    if (name) {
      setState((s) => ({
        ...s,
        pages: s.pages.map((p) => (p.id === id ? { ...p, name } : p)),
      }));
    }
  };

  /* ---- node ops ---- */
  const setText = (id, text) =>
    mutate((pg) => {
      const hit = locate(pg.tree, id);
      if (hit) hit.node.text = text;
    });

  const addSibling = (id) => {
    const n = blank();
    mutate((pg) => {
      const hit = locate(pg.tree, id);
      if (!hit) return;
      if (hit.node.children.length && !hit.node.collapsed) {
        hit.node.children.unshift(n);
      } else {
        hit.list.splice(hit.index + 1, 0, n);
      }
    });
    setFocusId(n.id);
  };

  const indent = (id) =>
    mutate((pg) => {
      const hit = locate(pg.tree, id);
      if (!hit || hit.index === 0) return;
      const prev = hit.list[hit.index - 1];
      hit.list.splice(hit.index, 1);
      prev.collapsed = false;
      prev.children.push(hit.node);
    });

  const outdent = (id) =>
    mutate((pg) => {
      const find = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
          const idx = nodes[i].children.findIndex((c) => c.id === id);
          if (idx > -1) return { parentList: nodes, parentIndex: i, idx };
          const deep = find(nodes[i].children);
          if (deep) return deep;
        }
        return null;
      };
      const hit = find(pg.tree);
      if (!hit) return;
      const parent = hit.parentList[hit.parentIndex];
      const [node] = parent.children.splice(hit.idx, 1);
      hit.parentList.splice(hit.parentIndex + 1, 0, node);
    });

  const removeNode = (id) => {
    let focusTarget = null;
    mutate((pg) => {
      const order = visibleIds(pg.tree);
      const pos = order.indexOf(id);
      focusTarget = order[pos - 1] || order[pos + 1] || null;
      const hit = locate(pg.tree, id);
      if (!hit) return;
      hit.list.splice(hit.index, 1);
      if (!pg.tree.length) pg.tree.push(blank());
    });
    if (focusTarget) setFocusId(focusTarget);
  };

  const moveVert = (id, dir) =>
    mutate((pg) => {
      const hit = locate(pg.tree, id);
      if (!hit) return;
      const j = hit.index + dir;
      if (j < 0 || j >= hit.list.length) return;
      [hit.list[hit.index], hit.list[j]] = [hit.list[j], hit.list[hit.index]];
    });

  const toggle = (id) =>
    mutate((pg) => {
      const hit = locate(pg.tree, id);
      if (hit) hit.node.collapsed = !hit.node.collapsed;
    });

  const dropOn = (targetId) => {
    if (!dragId || dragId === targetId) return;
    mutate((pg) => {
      const dragHit = locate(pg.tree, dragId);
      if (!dragHit || contains(dragHit.node, targetId)) return;
      dragHit.list.splice(dragHit.index, 1);
      const tgt = locate(pg.tree, targetId);
      if (!tgt) {
        pg.tree.push(dragHit.node);
        return;
      }
      tgt.list.splice(tgt.index, 0, dragHit.node);
    });
    setDragId(null);
    setOverId(null);
  };

  const onKeyDown = (e, id) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSibling(id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.shiftKey ? outdent(id) : indent(id);
    } else if (e.key === "Backspace" && e.target.value === "") {
      e.preventDefault();
      removeNode(id);
    } else if (e.altKey && e.key === "ArrowUp") {
      e.preventDefault();
      moveVert(id, -1);
    } else if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      moveVert(id, 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const order = visibleIds(page.tree);
      const pos = order.indexOf(id);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) {
        e.preventDefault();
        inputs.current[next]?.focus();
      }
    }
  };

  const renderNodes = (nodes) =>
    nodes.map((n) => (
      <div key={n.id}>
        <div
          className={`ol-row ${overId === n.id ? "drag-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOverId(n.id);
          }}
          onDragLeave={() => setOverId((o) => (o === n.id ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            dropOn(n.id);
          }}
        >
          <button
            className={`ol-caret ${n.children.length ? "has-kids" : ""} ${n.collapsed ? "collapsed" : ""}`}
            onClick={() => toggle(n.id)}
            tabIndex={-1}
            aria-label={n.collapsed ? "Expand" : "Collapse"}
          >
            {n.collapsed ? "▸" : "▾"}
          </button>
          <span
            className={`ol-bullet ${n.collapsed && n.children.length ? "has-hidden" : ""}`}
            draggable
            onDragStart={() => setDragId(n.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            title="Drag to move"
          >
            •
          </span>
          <input
            className="ol-input"
            ref={(el) => (inputs.current[n.id] = el)}
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
    ));

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
              <span
                className="x"
                onClick={(e) => {
                  e.stopPropagation();
                  deletePage(p.id);
                }}
                title="Delete page"
              >
                ×
              </span>
            )}
          </button>
        ))}
        <button className="page-tab new" onClick={addPage}>
          + New page
        </button>
        <span className="notes-hint">
          Enter new line · Tab indent · Shift+Tab outdent · Alt+↑/↓ move · drag bullet
        </span>
      </div>
      <div
        className="outliner"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dropOn(null);
        }}
      >
        {renderNodes(page.tree)}
      </div>
    </>
  );
}
