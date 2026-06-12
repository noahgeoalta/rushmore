"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const CKEY = "rushmore-canvas-v1";
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const BULLET = String.fromCharCode(8226);
const COLLAPSE_CLOSED = String.fromCharCode(9654);
const COLLAPSE_OPEN = String.fromCharCode(9660);

const blankLine = (type = "none") => ({ id: uid(), text: "", type, fontSize: 14, collapsed: false, children: [] });

const blankBox = (x = 100, y = 100) => ({
  id: uid(),
  x, y,
  w: 320,
  lines: [blankLine("none")],
});

function defaultState() {
  const page = { id: uid(), name: "Main", boxes: [] };
  return { pages: [page], activeId: page.id };
}

function locate(nodes, id) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { list: nodes, index: i, node: nodes[i] };
    const hit = locate(nodes[i].children, id);
    if (hit) return hit;
  }
  return null;
}
function visibleIds(nodes, out = []) {
  for (const n of nodes) {
    out.push(n.id);
    if (!n.collapsed) visibleIds(n.children, out);
  }
  return out;
}
function getNumberInList(list, index) {
  let n = 0;
  for (let i = 0; i <= index; i++) if (list[i].type === "number") n++;
  return n;
}

export default function Canvas() {
  const [state, setState] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [selectedBoxId, setSelectedBoxId] = useState(null);
  const [focusLineId, setFocusLineId] = useState(null);
  const [focusCaret, setFocusCaret] = useState(null);
  const [focusedLineId, setFocusedLineId] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [resizeState, setResizeState] = useState(null);
  const [dragPageId, setDragPageId] = useState(null);
  const [overPageId, setOverPageId] = useState(null);
  const canvasRef = useRef(null);
  const inputs = useRef({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CKEY);
      setState(raw ? JSON.parse(raw) : defaultState());
    } catch { setState(defaultState()); }
  }, []);

  useEffect(() => {
    if (state) { try { localStorage.setItem(CKEY, JSON.stringify(state)); } catch {} }
  }, [state]);

  useLayoutEffect(() => {
    if (!focusLineId) return;
    const tryFocus = () => {
      const el = inputs.current[focusLineId];
      if (!el) return;
      el.focus();
      if (focusCaret !== null) { el.setSelectionRange(focusCaret, focusCaret); setFocusCaret(null); }
      setFocusLineId(null);
    };
    tryFocus();
    const raf = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(raf);
  }, [focusLineId, focusCaret, state]);

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
    const p = { id: uid(), name: name || "Untitled", boxes: [] };
    setState((s) => ({ ...s, pages: [...s.pages, p], activeId: p.id }));
  };
  const deletePage = (id) => {
    const pg = state.pages.find((p) => p.id === id);
    if (!confirm('Delete "' + pg.name + '"?')) return;
    setState((s) => {
      const pages = s.pages.filter((p) => p.id !== id);
      const safe = pages.length ? pages : [{ id: uid(), name: "Main", boxes: [] }];
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

  const addBox = (x, y) => {
    const box = blankBox(x, y);
    mutate((pg) => pg.boxes.push(box));
    setSelectedBoxId(box.id);
    setFocusLineId(box.lines[0].id);
  };

  const deleteBox = (boxId) => {
    mutate((pg) => { pg.boxes = pg.boxes.filter((b) => b.id !== boxId); });
    setSelectedBoxId(null);
    setFocusedLineId(null);
  };

  const setLineText = (boxId, lineId, text) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (h) h.node.text = text;
    }, false);
  };

  const addLineAfter = (boxId, lineId, caretPos = 0) => {
    const n = blankLine("none");
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (!h) return;
      n.type = h.node.type;
      const before = h.node.text.slice(0, caretPos);
      const after = h.node.text.slice(caretPos);
      h.node.text = before;
      n.text = after;
      if (h.node.children.length && !h.node.collapsed) {
        n.type = h.node.children[0]?.type ?? h.node.type;
        h.node.children.unshift(n);
      } else {
        h.list.splice(h.index + 1, 0, n);
      }
    });
    setFocusLineId(n.id);
    setFocusCaret(0);
  };

  const backspaceLine = (boxId, lineId, curText, caretPos) => {
    if (caretPos > 0) return false;
    const box = page.boxes.find((b) => b.id === boxId); if (!box) return false;
    if (curText === "") {
      const order = visibleIds(box.lines);
      const ft = order[order.indexOf(lineId) - 1] || null;
      const fth = ft ? locate(box.lines, ft) : null;
      const ftLen = fth ? fth.node.text.length : 0;
      mutate((pg) => {
        const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
        if (b.lines.length === 1 && b.lines[0].children.length === 0) return;
        const h = locate(b.lines, lineId); if (!h) return;
        h.list.splice(h.index, 1);
        if (!b.lines.length) b.lines.push(blankLine());
      });
      if (ft) { setFocusLineId(ft); setFocusCaret(ftLen); }
      return true;
    } else {
      const order = visibleIds(box.lines);
      const pos = order.indexOf(lineId);
      if (pos === 0) return false;
      const prevId = order[pos - 1];
      let prevLen = 0;
      mutate((pg) => {
        const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
        const prev = locate(b.lines, prevId);
        const curr = locate(b.lines, lineId);
        if (!prev || !curr) return;
        prevLen = prev.node.text.length;
        prev.node.text += curr.node.text;
        curr.list.splice(curr.index, 1);
        if (!b.lines.length) b.lines.push(blankLine());
      });
      setFocusLineId(prevId); setFocusCaret(prevLen);
      return true;
    }
  };

  const cycleLineType = (boxId, lineId, targetType) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (!h) return;
      h.node.type = h.node.type === targetType ? "none" : targetType;
    });
    setFocusLineId(lineId);
  };

  const indentLine = (boxId, lineId) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (!h || h.index === 0) return;
      const prev = h.list[h.index - 1];
      h.list.splice(h.index, 1);
      prev.collapsed = false;
      if (h.node.type === "none") h.node.type = prev.type;
      prev.children.push(h.node);
    });
    setFocusLineId(lineId);
  };

  const outdentLine = (boxId, lineId) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const find = (nodes) => {
        for (let i = 0; i < nodes.length; i++) {
          const idx = nodes[i].children.findIndex((c) => c.id === lineId);
          if (idx > -1) return { parentList: nodes, parentIndex: i, idx };
          const d = find(nodes[i].children); if (d) return d;
        }
        return null;
      };
      const h = find(b.lines); if (!h) return;
      const [node] = h.parentList[h.parentIndex].children.splice(h.idx, 1);
      h.parentList.splice(h.parentIndex + 1, 0, node);
    });
    setFocusLineId(lineId);
  };

  const toggleLine = (boxId, lineId) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (h) h.node.collapsed = !h.node.collapsed;
    }, false);
  };

  const changeFontSize = (boxId, lineId, delta) => {
    mutate((pg) => {
      const b = pg.boxes.find((b) => b.id === boxId); if (!b) return;
      const h = locate(b.lines, lineId); if (!h) return;
      h.node.fontSize = Math.max(10, Math.min(48, (h.node.fontSize || 14) + delta));
    });
    setFocusLineId(lineId);
  };

  const onLineKeyDown = (e, boxId, lineId) => {
    if (e.ctrlKey && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); return; }
    if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "Z"))) { e.preventDefault(); redo(); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === ".") { e.preventDefault(); cycleLineType(boxId, lineId, "bullet"); return; }
    if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "/") { e.preventDefault(); cycleLineType(boxId, lineId, "number"); return; }
    if (e.ctrlKey && e.shiftKey && e.key === ".") { e.preventDefault(); changeFontSize(boxId, lineId, 2); return; }
    if (e.ctrlKey && e.shiftKey && e.key === "-") { e.preventDefault(); changeFontSize(boxId, lineId, -2); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowRight") { e.preventDefault(); indentLine(boxId, lineId); return; }
    if (e.shiftKey && e.altKey && e.key === "ArrowLeft") { e.preventDefault(); outdentLine(boxId, lineId); return; }
    if (e.key === "Tab") { e.preventDefault(); e.shiftKey ? outdentLine(boxId, lineId) : indentLine(boxId, lineId); return; }
    if (e.key === "Escape") { e.preventDefault(); setSelectedBoxId(null); e.target.blur(); return; }
    if (!e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "Enter") { e.preventDefault(); addLineAfter(boxId, lineId, e.target.selectionStart); return; }
    if (e.key === "Backspace") { const h = backspaceLine(boxId, lineId, e.target.value, e.target.selectionStart); if (h) e.preventDefault(); return; }
    if (!e.altKey && !e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      const box = page.boxes.find((b) => b.id === boxId); if (!box) return;
      const order = visibleIds(box.lines);
      const pos = order.indexOf(lineId);
      const next = order[pos + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); inputs.current[next]?.focus(); }
    }
  };

  const onCanvasDoubleClick = (e) => {
    if (e.target !== canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    addBox(e.clientX - rect.left - 160, e.clientY - rect.top - 14);
  };

  const onCanvasClick = (e) => {
    if (e.target === canvasRef.current) setSelectedBoxId(null);
  };

  const onBoxMouseDown = (e, boxId) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "SPAN") return;
    e.preventDefault();
    const box = page.boxes.find((b) => b.id === boxId);
    setDragState({ boxId, startX: e.clientX, startY: e.clientY, origX: box.x, origY: box.y });
    setSelectedBoxId(boxId);
  };

  const onResizeMouseDown = (e, boxId) => {
    e.preventDefault(); e.stopPropagation();
    const box = page.boxes.find((b) => b.id === boxId);
    setResizeState({ boxId, startX: e.clientX, origW: box.w });
  };

  useEffect(() => {
    if (!dragState && !resizeState) return;
    const onMove = (e) => {
      if (dragState) {
        const nx = Math.max(0, dragState.origX + (e.clientX - dragState.startX));
        const ny = Math.max(0, dragState.origY + (e.clientY - dragState.startY));
        setState((s) => {
          const next = structuredClone(s);
          const pg = next.pages.find((p) => p.id === next.activeId) || next.pages[0];
          const b = pg.boxes.find((b) => b.id === dragState.boxId);
          if (b) { b.x = nx; b.y = ny; }
          return next;
        });
      }
      if (resizeState) {
        const nw = Math.max(160, resizeState.origW + (e.clientX - resizeState.startX));
        setState((s) => {
          const next = structuredClone(s);
          const pg = next.pages.find((p) => p.id === next.activeId) || next.pages[0];
          const b = pg.boxes.find((b) => b.id === resizeState.boxId);
          if (b) b.w = nw;
          return next;
        });
      }
    };
    const onUp = () => { setDragState(null); setResizeState(null); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragState, resizeState]);

  const renderLines = (boxId, lines) =>
    lines.map((n, idx) => {
      const num = n.type === "number" ? getNumberInList(lines, idx) : null;
      const hasHidden = n.collapsed && n.children.length;
      return (
        <div key={n.id}>
          <div className="cv-line-row">
            <button
              className={"cv-caret" + (n.children.length ? " has-kids" : "") + (n.collapsed ? " collapsed" : "")}
              onClick={(e) => { e.stopPropagation(); toggleLine(boxId, n.id); }}
              tabIndex={-1}
            >
              {n.children.length ? (n.collapsed ? COLLAPSE_CLOSED : COLLAPSE_OPEN) : ""}
            </button>
            {n.type === "bullet" && <span className={"cv-marker cv-bullet" + (hasHidden ? " has-hidden" : "")}>{BULLET}</span>}
            {n.type === "number" && <span className={"cv-marker cv-num" + (hasHidden ? " has-hidden" : "")}>{num}.</span>}
            {n.type === "none" && <span className="cv-marker cv-spacer" />}
            <input
              className="cv-input"
              ref={(el) => (inputs.current[n.id] = el)}
              style={{ fontSize: (n.fontSize || 14) + "px" }}
              value={n.text}
              placeholder="..."
              onChange={(e) => setLineText(boxId, n.id, e.target.value)}
              onKeyDown={(e) => onLineKeyDown(e, boxId, n.id)}
              onFocus={() => { setFocusedLineId(n.id); setSelectedBoxId(boxId); }}
            />
          </div>
          {!n.collapsed && n.children.length > 0 && (
            <div className="cv-kids">{renderLines(boxId, n.children)}</div>
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
            className={"page-tab" + (p.id === state.activeId ? " active" : "") + (overPageId === p.id && dragPageId !== p.id ? " page-drag-over" : "")}
            draggable
            onDragStart={() => setDragPageId(p.id)}
            onDragEnd={() => { setDragPageId(null); setOverPageId(null); }}
            onDragOver={(e) => { e.preventDefault(); setOverPageId(p.id); }}
            onDragLeave={() => setOverPageId(null)}
            onDrop={() => onPageDrop(p.id)}
            onClick={() => { setState((s) => ({ ...s, activeId: p.id })); setSelectedBoxId(null); }}
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
          <button className="notes-btn" onClick={() => focusedLineId && selectedBoxId && cycleLineType(selectedBoxId, focusedLineId, "bullet")}>Bullet</button>
          <button className="notes-btn" onClick={() => focusedLineId && selectedBoxId && cycleLineType(selectedBoxId, focusedLineId, "number")}>1.</button>
          <span className="notes-sep" />
          <button className="notes-btn" onClick={() => focusedLineId && selectedBoxId && changeFontSize(selectedBoxId, focusedLineId, -2)}>A-</button>
          <button className="notes-btn" onClick={() => focusedLineId && selectedBoxId && changeFontSize(selectedBoxId, focusedLineId, 2)}>A+</button>
          <span className="notes-sep" />
          {selectedBoxId && <button className="notes-btn cv-del-btn" onClick={() => deleteBox(selectedBoxId)}>Del box</button>}
        </div>
        <span className="notes-hint">Double-click canvas to create box  |  drag top bar to move  |  drag right edge to resize  |  Esc to deselect</span>
      </div>
      <div
        className="cv-canvas"
        ref={canvasRef}
        onDoubleClick={onCanvasDoubleClick}
        onClick={onCanvasClick}
      >
        {page.boxes.map((box) => {
          const isSelected = selectedBoxId === box.id;
          return (
            <div
              key={box.id}
              className={"cv-box" + (isSelected ? " selected" : "")}
              style={{ left: box.x, top: box.y, width: box.w }}
              onClick={(e) => { e.stopPropagation(); setSelectedBoxId(box.id); }}
            >
              <div className="cv-drag-bar" onMouseDown={(e) => onBoxMouseDown(e, box.id)} title="Drag to move" />
              <div className="cv-body">{renderLines(box.id, box.lines)}</div>
              <div className="cv-resize" onMouseDown={(e) => onResizeMouseDown(e, box.id)} title="Drag to resize" />
            </div>
          );
        })}
        {page.boxes.length === 0 && (
          <div className="cv-empty">Double-click anywhere to create a text box</div>
        )}
      </div>
    </>
  );
}
