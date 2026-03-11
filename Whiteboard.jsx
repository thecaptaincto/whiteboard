import { useState, useRef, useEffect, useCallback, useReducer } from "react";

// ─── GOOGLE FONTS ───────────────────────────────────────────────────────────
const FontLoader = () => {
  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);
  return null;
};

// ─── CONSTANTS ──────────────────────────────────────────────────────────────
const TOOLS = {
  SELECT: "select", PEN: "pen", HIGHLIGHTER: "highlighter",
  ERASER: "eraser", LINE: "line", ARROW: "arrow",
  RECT: "rect", CIRCLE: "circle", TEXT: "text", NOTE: "note",
};

const COLORS = ["#f8f8f2","#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43","#00d2d3","#1a1a2e","#e8e8e8"];
const BG_PATTERNS = { none: "none", grid: "grid", dots: "dots", lines: "lines" };

const initialState = {
  elements: [],
  selectedIds: [],
  history: [[]],
  historyIndex: 0,
  pan: { x: 0, y: 0 },
  zoom: 1,
  tool: TOOLS.SELECT,
  color: "#4d96ff",
  strokeWidth: 3,
  opacity: 1,
  bgPattern: "grid",
  darkMode: true,
  showAI: false,
  workspace: "My Workspace",
  boardTitle: "Untitled Board",
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_TOOL": return { ...state, tool: action.tool, selectedIds: [] };
    case "SET_COLOR": return { ...state, color: action.color };
    case "SET_STROKE_WIDTH": return { ...state, strokeWidth: action.width };
    case "SET_OPACITY": return { ...state, opacity: action.opacity };
    case "SET_BG": return { ...state, bgPattern: action.pattern };
    case "TOGGLE_DARK": return { ...state, darkMode: !state.darkMode };
    case "TOGGLE_AI": return { ...state, showAI: !state.showAI };
    case "SET_PAN": return { ...state, pan: action.pan };
    case "SET_ZOOM": return { ...state, zoom: Math.min(4, Math.max(0.1, action.zoom)) };
    case "SET_SELECTED": return { ...state, selectedIds: action.ids };
    case "SET_BOARD_TITLE": return { ...state, boardTitle: action.title };
    case "ADD_ELEMENT": {
      const newElements = [...state.elements, action.element];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(newElements);
      return { ...state, elements: newElements, history: newHistory, historyIndex: newHistory.length - 1 };
    }
    case "UPDATE_ELEMENT": {
      const newElements = state.elements.map(el => el.id === action.id ? { ...el, ...action.updates } : el);
      return { ...state, elements: newElements };
    }
    case "COMMIT_UPDATE": {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push([...state.elements]);
      return { ...state, history: newHistory, historyIndex: newHistory.length - 1 };
    }
    case "DELETE_SELECTED": {
      const newElements = state.elements.filter(el => !state.selectedIds.includes(el.id));
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(newElements);
      return { ...state, elements: newElements, selectedIds: [], history: newHistory, historyIndex: newHistory.length - 1 };
    }
    case "DUPLICATE_SELECTED": {
      const dupes = state.elements
        .filter(el => state.selectedIds.includes(el.id))
        .map(el => ({ ...el, id: Date.now() + Math.random(), x: (el.x||0) + 20, y: (el.y||0) + 20 }));
      const newElements = [...state.elements, ...dupes];
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push(newElements);
      return { ...state, elements: newElements, selectedIds: dupes.map(d => d.id), history: newHistory, historyIndex: newHistory.length - 1 };
    }
    case "UNDO": {
      if (state.historyIndex === 0) return state;
      const idx = state.historyIndex - 1;
      return { ...state, elements: state.history[idx], historyIndex: idx, selectedIds: [] };
    }
    case "REDO": {
      if (state.historyIndex >= state.history.length - 1) return state;
      const idx = state.historyIndex + 1;
      return { ...state, elements: state.history[idx], historyIndex: idx, selectedIds: [] };
    }
    case "CLEAR_BOARD": {
      const newHistory = state.history.slice(0, state.historyIndex + 1);
      newHistory.push([]);
      return { ...state, elements: [], selectedIds: [], history: newHistory, historyIndex: newHistory.length - 1 };
    }
    default: return state;
  }
}

// ─── UTILS ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).substr(2, 9);
const screenToCanvas = (x, y, pan, zoom) => ({ x: (x - pan.x) / zoom, y: (y - pan.y) / zoom });

// ─── CANVAS RENDERER ────────────────────────────────────────────────────────
function renderElement(ctx, el, selected) {
  if (el.deleted) return;
  ctx.save();
  ctx.globalAlpha = el.opacity ?? 1;
  ctx.strokeStyle = el.color || "#4d96ff";
  ctx.fillStyle = el.color || "#4d96ff";
  ctx.lineWidth = el.strokeWidth || 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (el.type === "pen" || el.type === "highlighter") {
    if (!el.points || el.points.length < 2) { ctx.restore(); return; }
    if (el.type === "highlighter") {
      ctx.globalAlpha = (el.opacity ?? 1) * 0.35;
      ctx.lineWidth = (el.strokeWidth || 2) * 5;
    }
    ctx.beginPath();
    ctx.moveTo(el.points[0].x, el.points[0].y);
    for (let i = 1; i < el.points.length; i++) ctx.lineTo(el.points[i].x, el.points[i].y);
    ctx.stroke();
  } else if (el.type === "line" || el.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(el.x, el.y);
    ctx.lineTo(el.x2, el.y2);
    ctx.stroke();
    if (el.type === "arrow") {
      const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x);
      const len = Math.max(10, (el.strokeWidth || 2) * 4);
      ctx.globalAlpha = el.opacity ?? 1;
      ctx.beginPath();
      ctx.moveTo(el.x2, el.y2);
      ctx.lineTo(el.x2 - len * Math.cos(angle - 0.4), el.y2 - len * Math.sin(angle - 0.4));
      ctx.lineTo(el.x2 - len * Math.cos(angle + 0.4), el.y2 - len * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
  } else if (el.type === "rect") {
    ctx.strokeRect(el.x, el.y, el.w, el.h);
    ctx.globalAlpha = (el.opacity ?? 1) * 0.07;
    ctx.fillRect(el.x, el.y, el.w, el.h);
  } else if (el.type === "circle") {
    const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.abs(el.w / 2), Math.abs(el.h / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = (el.opacity ?? 1) * 0.07;
    ctx.fill();
  }

  // Selection bounding box
  if (selected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#4d96ff";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    const pad = 8;
    if ((el.type === "pen" || el.type === "highlighter") && el.points && el.points.length > 0) {
      const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      ctx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
    } else if (el.x !== undefined) {
      const x1 = Math.min(el.x, el.x2 ?? el.x + (el.w ?? 0));
      const y1 = Math.min(el.y, el.y2 ?? el.y + (el.h ?? 0));
      const w = Math.abs((el.x2 ?? el.x + (el.w ?? 0)) - el.x);
      const h = Math.abs((el.y2 ?? el.y + (el.h ?? 0)) - el.y);
      ctx.strokeRect(x1 - pad, y1 - pad, w + pad * 2, h + pad * 2);
    }
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawBackground(ctx, width, height, pan, zoom, pattern, darkMode) {
  ctx.fillStyle = darkMode ? "#0d0d14" : "#f5f5f0";
  ctx.fillRect(0, 0, width, height);
  if (pattern === "none") return;

  const gridSize = 40 * zoom;
  const offsetX = ((pan.x % gridSize) + gridSize) % gridSize;
  const offsetY = ((pan.y % gridSize) + gridSize) % gridSize;

  if (pattern === "grid") {
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    for (let x = offsetX - gridSize; x < width + gridSize; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = offsetY - gridSize; y < height + gridSize; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  } else if (pattern === "dots") {
    ctx.fillStyle = darkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.18)";
    for (let x = offsetX - gridSize; x < width + gridSize; x += gridSize) {
      for (let y = offsetY - gridSize; y < height + gridSize; y += gridSize) {
        ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  } else if (pattern === "lines") {
    ctx.strokeStyle = darkMode ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
    ctx.lineWidth = 1;
    for (let y = offsetY - gridSize; y < height + gridSize; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
  }
}

// ─── WHITEBOARD CANVAS ────────────────────────────────────────────────────────
function WhiteboardCanvas({ state, dispatch }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const currentEl = useRef(null);
  const lastPos = useRef(null);
  const isPanning = useRef(false);
  const panStart = useRef(null);
  const panOrigin = useRef(null);
  const lastTouchDist = useRef(null);
  const [editingText, setEditingText] = useState(null);
  const rafRef = useRef(null);
  const needsRedraw = useRef(true);

  // Canvas sizing
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    canvas.style.width = canvas.offsetWidth + "px";
    canvas.style.height = canvas.offsetHeight + "px";
    needsRedraw.current = true;
  }, []);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height;

    drawBackground(ctx, w, h, { x: state.pan.x * dpr, y: state.pan.y * dpr }, state.zoom, state.bgPattern, state.darkMode);

    ctx.save();
    ctx.translate(state.pan.x * dpr, state.pan.y * dpr);
    ctx.scale(state.zoom * dpr, state.zoom * dpr);

    state.elements.forEach(el => {
      if (el.type === "text" || el.type === "note") return;
      renderElement(ctx, el, state.selectedIds.includes(el.id));
    });

    if (currentEl.current) {
      renderElement(ctx, currentEl.current, false);
    }

    ctx.restore();
  }, [state]);

  useEffect(() => {
    render();
  }, [render]);

  // Coordinate transform
  const getCanvasPos = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return screenToCanvas(clientX - rect.left, clientY - rect.top, state.pan, state.zoom);
  }, [state.pan, state.zoom]);

  // Hit test
  const hitTest = useCallback((pos) => {
    for (let i = state.elements.length - 1; i >= 0; i--) {
      const el = state.elements[i];
      if (el.deleted || el.type === "text" || el.type === "note") continue;
      const pad = 10;
      if (el.type === "pen" || el.type === "highlighter") {
        if (!el.points || el.points.length === 0) continue;
        const xs = el.points.map(p => p.x), ys = el.points.map(p => p.y);
        if (pos.x >= Math.min(...xs) - pad && pos.x <= Math.max(...xs) + pad &&
            pos.y >= Math.min(...ys) - pad && pos.y <= Math.max(...ys) + pad) return el;
      } else {
        const x1 = Math.min(el.x, el.x2 ?? el.x + (el.w ?? 0));
        const x2 = Math.max(el.x, el.x2 ?? el.x + (el.w ?? 0));
        const y1 = Math.min(el.y, el.y2 ?? el.y + (el.h ?? 0));
        const y2 = Math.max(el.y, el.y2 ?? el.y + (el.h ?? 0));
        if (pos.x >= x1 - pad && pos.x <= x2 + pad && pos.y >= y1 - pad && pos.y <= y2 + pad) return el;
      }
    }
    return null;
  }, [state.elements]);

  // Pointer events
  const handlePointerDown = useCallback((clientX, clientY, button, altKey) => {
    if (button === 1 || altKey) {
      isPanning.current = true;
      panStart.current = { x: clientX, y: clientY };
      panOrigin.current = { ...state.pan };
      return;
    }
    const pos = getCanvasPos(clientX, clientY);

    if (state.tool === TOOLS.SELECT) {
      const hit = hitTest(pos);
      if (hit) {
        dispatch({ type: "SET_SELECTED", ids: [hit.id] });
        lastPos.current = pos;
        drawing.current = true;
        currentEl.current = hit;
      } else {
        dispatch({ type: "SET_SELECTED", ids: [] });
      }
      return;
    }
    if (state.tool === TOOLS.TEXT) {
      setEditingText({ x: pos.x, y: pos.y, text: "", id: uid() });
      return;
    }
    if (state.tool === TOOLS.NOTE) {
      dispatch({ type: "ADD_ELEMENT", element: { id: uid(), type: "note", x: pos.x, y: pos.y, w: 180, h: 140, text: "Double-click to edit...", color: "#ffd93d", opacity: 1 } });
      return;
    }

    drawing.current = true;
    const base = { id: uid(), color: state.color, strokeWidth: state.strokeWidth, opacity: state.opacity };

    if (state.tool === TOOLS.PEN || state.tool === TOOLS.HIGHLIGHTER || state.tool === TOOLS.ERASER) {
      currentEl.current = { ...base, type: state.tool, points: [pos] };
    } else if (state.tool === TOOLS.LINE || state.tool === TOOLS.ARROW) {
      currentEl.current = { ...base, type: state.tool, x: pos.x, y: pos.y, x2: pos.x, y2: pos.y };
    } else if (state.tool === TOOLS.RECT || state.tool === TOOLS.CIRCLE) {
      currentEl.current = { ...base, type: state.tool, x: pos.x, y: pos.y, w: 0, h: 0 };
    }
  }, [state, getCanvasPos, hitTest, dispatch]);

  const handlePointerMove = useCallback((clientX, clientY) => {
    if (isPanning.current && panStart.current) {
      dispatch({ type: "SET_PAN", pan: { x: panOrigin.current.x + clientX - panStart.current.x, y: panOrigin.current.y + clientY - panStart.current.y } });
      return;
    }
    if (!drawing.current || !currentEl.current) return;
    const pos = getCanvasPos(clientX, clientY);

    if (state.tool === TOOLS.SELECT && lastPos.current) {
      const dx = pos.x - lastPos.current.x, dy = pos.y - lastPos.current.y;
      lastPos.current = pos;
      const el = currentEl.current;
      const updates = { x: (el.x || 0) + dx, y: (el.y || 0) + dy };
      if (el.x2 != null) { updates.x2 = el.x2 + dx; updates.y2 = el.y2 + dy; }
      if (el.points) updates.points = el.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      dispatch({ type: "UPDATE_ELEMENT", id: el.id, updates });
      currentEl.current = { ...el, ...updates };
      return;
    }

    if (state.tool === TOOLS.PEN || state.tool === TOOLS.HIGHLIGHTER || state.tool === TOOLS.ERASER) {
      currentEl.current = { ...currentEl.current, points: [...currentEl.current.points, pos] };
    } else if (state.tool === TOOLS.LINE || state.tool === TOOLS.ARROW) {
      currentEl.current = { ...currentEl.current, x2: pos.x, y2: pos.y };
    } else if (state.tool === TOOLS.RECT || state.tool === TOOLS.CIRCLE) {
      currentEl.current = { ...currentEl.current, w: pos.x - currentEl.current.x, h: pos.y - currentEl.current.y };
    }
    render();
  }, [state, getCanvasPos, dispatch, render]);

  const handlePointerUp = useCallback(() => {
    if (isPanning.current) { isPanning.current = false; panStart.current = null; return; }
    if (!drawing.current) return;
    drawing.current = false;

    if (state.tool === TOOLS.SELECT) {
      dispatch({ type: "COMMIT_UPDATE" });
    } else if (currentEl.current) {
      if (state.tool === TOOLS.ERASER) {
        const erased = currentEl.current.points || [];
        const toRemove = state.elements.filter(el => {
          if (el.type !== "pen" && el.type !== "highlighter") return false;
          if (!el.points) return false;
          return erased.some(ep => el.points.some(p => Math.hypot(p.x - ep.x, p.y - ep.y) < 15));
        }).map(el => el.id);
        if (toRemove.length > 0) {
          toRemove.forEach(id => dispatch({ type: "UPDATE_ELEMENT", id, updates: { deleted: true } }));
          dispatch({ type: "COMMIT_UPDATE" });
        }
      } else {
        dispatch({ type: "ADD_ELEMENT", element: currentEl.current });
      }
    }
    currentEl.current = null;
    lastPos.current = null;
  }, [state, dispatch]);

  const onMouseDown = useCallback(e => { handlePointerDown(e.clientX, e.clientY, e.button, e.altKey); }, [handlePointerDown]);
  const onMouseMove = useCallback(e => { handlePointerMove(e.clientX, e.clientY); }, [handlePointerMove]);
  const onMouseUp = useCallback(() => { handlePointerUp(); }, [handlePointerUp]);

  const onWheel = useCallback(e => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY > 0 ? 0.92 : 1.09;
      dispatch({ type: "SET_ZOOM", zoom: state.zoom * factor });
    } else {
      dispatch({ type: "SET_PAN", pan: { x: state.pan.x - e.deltaX, y: state.pan.y - e.deltaY } });
    }
  }, [state.zoom, state.pan, dispatch]);

  const onTouchStart = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastTouchDist.current = Math.hypot(dx, dy);
      isPanning.current = true;
      panStart.current = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      panOrigin.current = { ...state.pan };
    } else {
      handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, 0, false);
    }
  }, [handlePointerDown, state.pan]);

  const onTouchMove = useCallback(e => {
    e.preventDefault();
    if (e.touches.length === 2 && lastTouchDist.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      dispatch({ type: "SET_ZOOM", zoom: state.zoom * (dist / lastTouchDist.current) });
      lastTouchDist.current = dist;
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      dispatch({ type: "SET_PAN", pan: { x: panOrigin.current.x + mx - panStart.current.x, y: panOrigin.current.y + my - panStart.current.y } });
    } else {
      handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  }, [handlePointerMove, state.zoom, dispatch]);

  const onTouchEnd = useCallback(e => {
    lastTouchDist.current = null;
    handlePointerUp();
  }, [handlePointerUp]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = e => {
      if (editingText) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z" && !e.shiftKey) { e.preventDefault(); dispatch({ type: "UNDO" }); }
      if (meta && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); dispatch({ type: "REDO" }); }
      if ((e.key === "Delete" || e.key === "Backspace") && state.selectedIds.length > 0 && !editingText) dispatch({ type: "DELETE_SELECTED" });
      if (meta && e.key === "d") { e.preventDefault(); dispatch({ type: "DUPLICATE_SELECTED" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, state.selectedIds, editingText]);

  const submitText = useCallback(() => {
    if (editingText?.text?.trim()) {
      dispatch({ type: "ADD_ELEMENT", element: { id: editingText.id, type: "text", x: editingText.x, y: editingText.y, text: editingText.text, color: state.color, fontSize: 16, opacity: state.opacity } });
    }
    setEditingText(null);
  }, [editingText, dispatch, state.color, state.opacity]);

  const dm = state.darkMode;
  const cursorMap = { select: "default", pen: "crosshair", highlighter: "crosshair", eraser: "cell", line: "crosshair", arrow: "crosshair", rect: "crosshair", circle: "crosshair", text: "text", note: "default" };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%", cursor: cursorMap[state.tool] || "default", touchAction: "none" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      />

      {/* DOM overlay for text & notes */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {state.elements.filter(el => (el.type === "text" || el.type === "note") && !el.deleted).map(el => (
          <TextNoteElement key={el.id} el={el} pan={state.pan} zoom={state.zoom} darkMode={dm} selected={state.selectedIds.includes(el.id)} dispatch={dispatch} />
        ))}
        {editingText && (
          <div style={{ position: "absolute", left: editingText.x * state.zoom + state.pan.x, top: editingText.y * state.zoom + state.pan.y, pointerEvents: "all", zIndex: 100 }}>
            <textarea
              autoFocus
              value={editingText.text}
              onChange={e => setEditingText(t => ({ ...t, text: e.target.value }))}
              onBlur={submitText}
              onKeyDown={e => { if (e.key === "Escape") setEditingText(null); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitText(); } }}
              style={{ background: dm ? "rgba(13,13,20,0.8)" : "rgba(255,255,255,0.9)", border: "1.5px dashed #4d96ff", outline: "none", color: state.color, fontSize: 16 * state.zoom, minWidth: 120, minHeight: 40, resize: "both", fontFamily: "Syne, sans-serif", padding: "6px 8px", borderRadius: 4, backdropFilter: "blur(4px)" }}
            />
          </div>
        )}
      </div>

      {/* Zoom badge */}
      <div style={{ position: "absolute", bottom: 16, right: 16, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: dm ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)", background: dm ? "rgba(13,13,20,0.6)" : "rgba(255,255,255,0.6)", padding: "3px 8px", borderRadius: 10, userSelect: "none", backdropFilter: "blur(4px)" }}>
        {Math.round(state.zoom * 100)}%
      </div>

      {/* Tool hint */}
      <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: dm ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)", userSelect: "none", whiteSpace: "nowrap" }}>
        {state.tool === TOOLS.SELECT ? "Click to select · Alt+drag to pan · Scroll to zoom" :
         state.tool === TOOLS.TEXT ? "Click to place text · Enter to confirm" :
         state.tool === TOOLS.NOTE ? "Click to place sticky note" :
         "Draw on canvas · Alt+drag to pan"}
      </div>
    </div>
  );
}

// ─── TEXT / NOTE DOM ELEMENT ─────────────────────────────────────────────────
function TextNoteElement({ el, pan, zoom, darkMode, selected, dispatch }) {
  const [editing, setEditing] = useState(false);
  const dragRef = useRef(null);

  const x = el.x * zoom + pan.x;
  const y = el.y * zoom + pan.y;

  const handleMouseDown = e => {
    e.stopPropagation();
    dispatch({ type: "SET_SELECTED", ids: [el.id] });
    const start = { mx: e.clientX, my: e.clientY, ex: el.x, ey: el.y };

    const onMove = ev => {
      const dx = (ev.clientX - start.mx) / zoom;
      const dy = (ev.clientY - start.my) / zoom;
      dispatch({ type: "UPDATE_ELEMENT", id: el.id, updates: { x: start.ex + dx, y: start.ey + dy } });
    };
    const onUp = () => {
      dispatch({ type: "COMMIT_UPDATE" });
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  if (el.type === "note") {
    return (
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={() => setEditing(true)}
        style={{
          position: "absolute", left: x, top: y,
          width: (el.w || 180) * zoom, minHeight: (el.h || 140) * zoom,
          background: el.color || "#ffd93d",
          borderRadius: 4, padding: "12px 14px",
          boxShadow: selected ? "0 0 0 2.5px #4d96ff, 4px 8px 24px rgba(0,0,0,0.3)" : "4px 8px 24px rgba(0,0,0,0.22)",
          cursor: "grab", pointerEvents: "all", zIndex: selected ? 50 : 10,
          fontFamily: "Syne, sans-serif", fontSize: Math.max(10, 13 * zoom),
          color: "#1a1a2e", userSelect: "none",
          transform: `rotate(${el.rotate || 0}deg)`,
          transition: "box-shadow 0.15s",
        }}
      >
        <div style={{ fontSize: 8, opacity: 0.45, marginBottom: 5, fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.12em" }}>STICKY NOTE</div>
        {editing ? (
          <textarea
            autoFocus
            defaultValue={el.text}
            onBlur={e => { dispatch({ type: "UPDATE_ELEMENT", id: el.id, updates: { text: e.target.value } }); dispatch({ type: "COMMIT_UPDATE" }); setEditing(false); }}
            style={{ background: "transparent", border: "none", outline: "none", width: "100%", minHeight: 80, resize: "none", fontFamily: "Syne, sans-serif", fontSize: "inherit", color: "#1a1a2e", lineHeight: 1.5 }}
          />
        ) : (
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{el.text}</div>
        )}
      </div>
    );
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      onDoubleClick={() => setEditing(true)}
      style={{
        position: "absolute", left: x, top: y,
        color: el.color || (darkMode ? "#f8f8f2" : "#1a1a2e"),
        fontSize: (el.fontSize || 16) * zoom,
        fontFamily: "Syne, sans-serif", fontWeight: 600,
        cursor: "grab", pointerEvents: "all", zIndex: selected ? 50 : 10,
        userSelect: "none", whiteSpace: "pre",
        outline: selected ? "1.5px dashed #4d96ff" : "none",
        padding: "2px 4px", borderRadius: 2,
      }}
    >
      {editing ? (
        <input
          autoFocus
          defaultValue={el.text}
          onBlur={e => { dispatch({ type: "UPDATE_ELEMENT", id: el.id, updates: { text: e.target.value } }); dispatch({ type: "COMMIT_UPDATE" }); setEditing(false); }}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          style={{ background: "transparent", border: "none", outline: "none", color: "inherit", fontSize: "inherit", fontFamily: "inherit", fontWeight: "inherit", minWidth: 60 }}
        />
      ) : el.text}
    </div>
  );
}

// ─── AI PANEL ────────────────────────────────────────────────────────────────
function AIPanel({ state, dispatch, onClose }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey! I'm your AI study assistant ✦\n\nI can help you:\n• Summarize your board content\n• Explain concepts\n• Generate flashcards & quizzes\n• Convert notes into structured outlines\n\nWhat would you like to explore?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const getBoardContext = () => {
    const textContent = state.elements.filter(el => (el.type === "text" || el.type === "note") && !el.deleted).map(el => el.text).join("\n");
    const shapes = state.elements.filter(el => el.type !== "text" && el.type !== "note" && !el.deleted).length;
    return `Board title: "${state.boardTitle}". Text and notes: ${textContent || "none"}. Drawing elements: ${shapes}.`;
  };

  const send = async (text) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: `You are a helpful AI study assistant embedded in StudyCanvas, a digital whiteboard. Context: ${getBoardContext()}. Be concise, encouraging, and structured. For flashcards use Q: / A: format. For quizzes use numbered questions. Use markdown-style formatting when helpful.`,
          messages: updated.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await response.json();
      const reply = data.content?.[0]?.text || "Sorry, I couldn't process that request.";
      setMessages(m => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "⚠️ Connection failed. Make sure you have API access." }]);
    }
    setLoading(false);
  };

  const quickActions = [
    { label: "Summarize board", action: "Summarize the content on my board in a clear, structured way." },
    { label: "Flashcards", action: "Generate 5 study flashcards based on the content on my board." },
    { label: "Quiz me", action: "Create a 5-question quiz based on my board content." },
    { label: "Explain concepts", action: "Identify and explain the key concepts visible on my board." },
  ];

  const dm = state.darkMode;
  const panelBg = dm ? "#0f0f1c" : "#fafaf7";
  const border = dm ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.09)";
  const textColor = dm ? "#e0e0e8" : "#1a1a2e";
  const mutedColor = dm ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const inputBg = dm ? "#0d0d14" : "#f0f0eb";
  const userBg = dm ? "#1e1e30" : "#e8e8e0";
  const aiBg = dm ? "rgba(77,150,255,0.1)" : "rgba(77,150,255,0.08)";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: panelBg, color: textColor, fontFamily: "Syne, sans-serif" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4d96ff", boxShadow: "0 0 8px #4d96ff" }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>AI STUDY ASSISTANT</span>
          </div>
          <div style={{ fontSize: 9, color: mutedColor, fontFamily: "JetBrains Mono, monospace", marginTop: 3, letterSpacing: "0.05em" }}>POWERED BY CLAUDE</div>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: mutedColor, cursor: "pointer", fontSize: 16, width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: m.role === "assistant" ? "#4d96ff" : (dm ? "#2a2a3e" : "#d8d8d0"), flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, marginTop: 2 }}>
              {m.role === "assistant" ? "✦" : "U"}
            </div>
            <div style={{ flex: 1, background: m.role === "assistant" ? aiBg : userBg, borderRadius: m.role === "assistant" ? "3px 12px 12px 12px" : "12px 3px 12px 12px", padding: "9px 12px", fontSize: 12.5, lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#4d96ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>✦</div>
            <div style={{ background: aiBg, borderRadius: "3px 12px 12px 12px", padding: "10px 14px", fontSize: 12 }}>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {[0, 0.15, 0.3].map((d, i) => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#4d96ff", display: "inline-block", animation: `pulse 1.2s ${d}s infinite` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick actions */}
      <div style={{ padding: "8px 14px", borderTop: `1px solid ${border}`, display: "flex", gap: 5, flexWrap: "wrap", flexShrink: 0 }}>
        {quickActions.map(qa => (
          <button key={qa.label} onClick={() => send(qa.action)} style={{ background: dm ? "rgba(77,150,255,0.09)" : "rgba(77,150,255,0.1)", border: "1px solid rgba(77,150,255,0.28)", color: "#4d96ff", borderRadius: 20, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: "Syne, sans-serif", fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
            {qa.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "10px 14px", borderTop: `1px solid ${border}`, display: "flex", gap: 8, flexShrink: 0 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
          placeholder="Ask about your board... (Enter to send)"
          rows={2}
          style={{ flex: 1, background: inputBg, border: `1px solid ${border}`, borderRadius: 8, padding: "8px 10px", color: textColor, fontSize: 12, fontFamily: "Syne, sans-serif", outline: "none", resize: "none", lineHeight: 1.4 }}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? (dm ? "#1e1e30" : "#e0e0d8") : "#4d96ff", border: "none", borderRadius: 8, width: 38, height: 52, cursor: loading || !input.trim() ? "default" : "pointer", color: loading || !input.trim() ? mutedColor : "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.15s" }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── LEFT TOOLBAR ─────────────────────────────────────────────────────────────
function Toolbar({ state, dispatch }) {
  const dm = state.darkMode;
  const bg = dm ? "#0f0f1c" : "#fafaf7";
  const border = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textColor = dm ? "#d0d0e0" : "#1a1a2e";

  const groups = [
    [
      { id: TOOLS.SELECT, icon: "⊹", label: "Select (V)" },
    ],
    [
      { id: TOOLS.PEN, icon: "✏", label: "Pen (P)" },
      { id: TOOLS.HIGHLIGHTER, icon: "▮", label: "Highlighter (H)" },
      { id: TOOLS.ERASER, icon: "◻", label: "Eraser (E)" },
    ],
    [
      { id: TOOLS.LINE, icon: "╱", label: "Line (L)" },
      { id: TOOLS.ARROW, icon: "→", label: "Arrow (A)" },
      { id: TOOLS.RECT, icon: "□", label: "Rectangle (R)" },
      { id: TOOLS.CIRCLE, icon: "○", label: "Circle (C)" },
    ],
    [
      { id: TOOLS.TEXT, icon: "T", label: "Text (T)" },
      { id: TOOLS.NOTE, icon: "⊡", label: "Sticky Note (N)" },
    ],
  ];

  const btnStyle = active => ({
    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
    borderRadius: 8, cursor: "pointer", border: "none",
    background: active ? "rgba(77,150,255,0.18)" : "transparent",
    color: active ? "#4d96ff" : textColor,
    fontSize: 16, transition: "all 0.12s",
    boxShadow: active ? "0 0 0 1.5px rgba(77,150,255,0.5) inset" : "none",
  });

  return (
    <div style={{ width: 54, background: bg, borderRight: `1px solid ${border}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 2, overflowY: "auto", flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(135deg, #4d96ff, #c77dff)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 15, fontWeight: 800, fontFamily: "Syne, sans-serif", marginBottom: 10, boxShadow: "0 2px 12px rgba(77,150,255,0.4)" }}>S</div>

      {groups.map((group, gi) => (
        <div key={gi} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingBottom: 8, marginBottom: 6, borderBottom: gi < groups.length - 1 ? `1px solid ${border}` : "none" }}>
          {group.map(tool => (
            <button key={tool.id} title={tool.label} onClick={() => dispatch({ type: "SET_TOOL", tool: tool.id })} style={btnStyle(state.tool === tool.id)}>
              {tool.icon}
            </button>
          ))}
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <button title="Undo (Ctrl+Z)" onClick={() => dispatch({ type: "UNDO" })} style={btnStyle(false)}>↩</button>
      <button title="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: "REDO" })} style={btnStyle(false)}>↪</button>
      <div style={{ width: 30, height: 1, background: border, margin: "4px 0" }} />
      <button title={dm ? "Light mode" : "Dark mode"} onClick={() => dispatch({ type: "TOGGLE_DARK" })} style={btnStyle(false)}>
        {dm ? "☀" : "☾"}
      </button>
    </div>
  );
}

// ─── RIGHT PROPERTIES PANEL ───────────────────────────────────────────────────
function PropertiesPanel({ state, dispatch }) {
  const dm = state.darkMode;
  const bg = dm ? "#0f0f1c" : "#fafaf7";
  const border = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textColor = dm ? "#d0d0e0" : "#1a1a2e";
  const mutedColor = dm ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";
  const labelStyle = { fontSize: 9, letterSpacing: "0.12em", color: mutedColor, fontFamily: "JetBrains Mono, monospace", marginBottom: 7, display: "block", fontWeight: 500 };
  const section = { marginBottom: 18, paddingBottom: 18, borderBottom: `1px solid ${border}` };

  const noteColors = ["#ffd93d", "#ff6b6b", "#6bcb77", "#4d96ff", "#c77dff", "#ff9f43"];

  return (
    <div style={{ width: 216, background: bg, borderLeft: `1px solid ${border}`, padding: "14px", color: textColor, fontFamily: "Syne, sans-serif", overflowY: "auto", flexShrink: 0 }}>

      {/* Color palette */}
      <div style={section}>
        <span style={labelStyle}>COLOR</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {COLORS.map(c => (
            <button key={c} onClick={() => dispatch({ type: "SET_COLOR", color: c })} style={{ width: 22, height: 22, borderRadius: 5, background: c, border: state.color === c ? "2.5px solid #4d96ff" : "1.5px solid transparent", cursor: "pointer", outline: "none", transition: "transform 0.1s", transform: state.color === c ? "scale(1.15)" : "scale(1)" }} />
          ))}
        </div>
        <input type="color" value={state.color} onChange={e => dispatch({ type: "SET_COLOR", color: e.target.value })} style={{ width: "100%", height: 26, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", cursor: "pointer", padding: 2 }} />
      </div>

      {/* Stroke width */}
      <div style={section}>
        <span style={labelStyle}>STROKE — {state.strokeWidth}px</span>
        <input type="range" min={1} max={24} value={state.strokeWidth} onChange={e => dispatch({ type: "SET_STROKE_WIDTH", width: Number(e.target.value) })} style={{ width: "100%", accentColor: "#4d96ff" }} />
        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
          {[1, 3, 6, 12].map(w => (
            <button key={w} onClick={() => dispatch({ type: "SET_STROKE_WIDTH", width: w })} style={{ flex: 1, height: 24, borderRadius: 4, border: `1px solid ${state.strokeWidth === w ? "#4d96ff" : border}`, background: state.strokeWidth === w ? "rgba(77,150,255,0.15)" : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: w * 2, height: w * 2, maxWidth: 16, maxHeight: 16, borderRadius: "50%", background: "#4d96ff" }} />
            </button>
          ))}
        </div>
      </div>

      {/* Opacity */}
      <div style={section}>
        <span style={labelStyle}>OPACITY — {Math.round(state.opacity * 100)}%</span>
        <input type="range" min={0.1} max={1} step={0.05} value={state.opacity} onChange={e => dispatch({ type: "SET_OPACITY", opacity: Number(e.target.value) })} style={{ width: "100%", accentColor: "#4d96ff" }} />
      </div>

      {/* Background */}
      <div style={section}>
        <span style={labelStyle}>BACKGROUND</span>
        <div style={{ display: "flex", gap: 5 }}>
          {[["none", "—"], ["grid", "⊞"], ["dots", "⠿"], ["lines", "≡"]].map(([k, icon]) => (
            <button key={k} onClick={() => dispatch({ type: "SET_BG", pattern: k })} style={{ flex: 1, height: 32, borderRadius: 5, border: state.bgPattern === k ? "2px solid #4d96ff" : `1px solid ${border}`, background: state.bgPattern === k ? "rgba(77,150,255,0.12)" : "transparent", cursor: "pointer", color: state.bgPattern === k ? "#4d96ff" : textColor, fontSize: 14 }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Note colors */}
      <div style={section}>
        <span style={labelStyle}>NOTE COLOR</span>
        <div style={{ display: "flex", gap: 5 }}>
          {noteColors.map(c => (
            <button key={c} onClick={() => dispatch({ type: "SET_COLOR", color: c })} style={{ flex: 1, height: 20, borderRadius: 3, background: c, border: state.color === c ? "2px solid #fff" : "1px solid transparent", cursor: "pointer" }} />
          ))}
        </div>
      </div>

      {/* Zoom */}
      <div style={section}>
        <span style={labelStyle}>ZOOM</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom / 1.25 })} style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: textColor, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>{Math.round(state.zoom * 100)}%</div>
          <button onClick={() => dispatch({ type: "SET_ZOOM", zoom: state.zoom * 1.25 })} style={{ width: 28, height: 28, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: textColor, cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
        </div>
        <button onClick={() => { dispatch({ type: "SET_ZOOM", zoom: 1 }); dispatch({ type: "SET_PAN", pan: { x: 0, y: 0 } }); }} style={{ marginTop: 7, width: "100%", height: 26, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: mutedColor, cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
          RESET VIEW
        </button>
      </div>

      {/* Selection */}
      {state.selectedIds.length > 0 && (
        <div style={{ ...section, borderColor: "rgba(77,150,255,0.25)", background: "rgba(77,150,255,0.06)", borderRadius: 8, padding: "10px 10px", marginLeft: -4, marginRight: -4 }}>
          <span style={{ ...labelStyle, color: "#4d96ff" }}>SELECTED ({state.selectedIds.length})</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <button onClick={() => dispatch({ type: "DUPLICATE_SELECTED" })} style={{ height: 28, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: textColor, cursor: "pointer", fontSize: 12, fontFamily: "Syne, sans-serif" }}>⊕ Duplicate</button>
            <button onClick={() => dispatch({ type: "DELETE_SELECTED" })} style={{ height: 28, borderRadius: 5, border: "1px solid rgba(255,107,107,0.35)", background: "rgba(255,107,107,0.07)", color: "#ff6b6b", cursor: "pointer", fontSize: 12, fontFamily: "Syne, sans-serif" }}>⊗ Delete</button>
          </div>
        </div>
      )}

      {/* Board */}
      <div>
        <span style={labelStyle}>BOARD ACTIONS</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <button onClick={() => { if (window.confirm("Clear the entire board? This cannot be undone immediately.")) dispatch({ type: "CLEAR_BOARD" }); }} style={{ height: 26, borderRadius: 5, border: `1px solid ${border}`, background: "transparent", color: mutedColor, cursor: "pointer", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>
            CLEAR BOARD
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── TOP BAR ──────────────────────────────────────────────────────────────────
function TopBar({ state, dispatch }) {
  const dm = state.darkMode;
  const bg = dm ? "#07070f" : "#ffffff";
  const border = dm ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)";
  const textColor = dm ? "#d0d0e0" : "#1a1a2e";
  const mutedColor = dm ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.32)";

  const [editingTitle, setEditingTitle] = useState(false);

  const exportPNG = () => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `${state.boardTitle}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ title: state.boardTitle, elements: state.elements }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.download = `${state.boardTitle}.json`;
    a.href = URL.createObjectURL(blob);
    a.click();
  };

  const btn = (active) => ({
    height: 28, borderRadius: 6, padding: "0 11px",
    border: active ? "1px solid rgba(77,150,255,0.5)" : `1px solid ${border}`,
    background: active ? "rgba(77,150,255,0.14)" : "transparent",
    color: active ? "#4d96ff" : textColor,
    cursor: "pointer", fontSize: 11.5, fontFamily: "Syne, sans-serif", fontWeight: 600,
    whiteSpace: "nowrap", transition: "all 0.13s",
  });

  const elemCount = state.elements.filter(e => !e.deleted).length;

  return (
    <div style={{ height: 46, background: bg, borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", padding: "0 14px", gap: 8, flexShrink: 0 }}>
      {/* Workspace breadcrumb */}
      <span style={{ fontSize: 11, color: mutedColor, fontFamily: "JetBrains Mono, monospace", whiteSpace: "nowrap" }}>{state.workspace}</span>
      <span style={{ color: mutedColor, fontSize: 14, opacity: 0.5 }}>/</span>

      {/* Board title */}
      {editingTitle ? (
        <input
          autoFocus
          defaultValue={state.boardTitle}
          onBlur={e => { dispatch({ type: "SET_BOARD_TITLE", title: e.target.value || "Untitled Board" }); setEditingTitle(false); }}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setEditingTitle(false); }}
          style={{ fontSize: 13, fontWeight: 700, fontFamily: "Syne, sans-serif", background: "transparent", border: "none", borderBottom: "2px solid #4d96ff", outline: "none", color: textColor, minWidth: 140 }}
        />
      ) : (
        <span onClick={() => setEditingTitle(true)} style={{ fontSize: 13, fontWeight: 700, fontFamily: "Syne, sans-serif", color: textColor, cursor: "text", borderBottom: "2px solid transparent", paddingBottom: 1 }}>
          {state.boardTitle}
        </span>
      )}

      <div style={{ flex: 1 }} />

      {/* Element count */}
      <span style={{ fontSize: 10, color: mutedColor, fontFamily: "JetBrains Mono, monospace", marginRight: 4 }}>
        {elemCount} elem{elemCount !== 1 ? "s" : ""}
      </span>

      {/* Actions */}
      <button onClick={() => dispatch({ type: "UNDO" })} title="Undo (Ctrl+Z)" style={btn(false)}>↩</button>
      <button onClick={() => dispatch({ type: "REDO" })} title="Redo" style={btn(false)}>↪</button>
      <div style={{ width: 1, height: 20, background: border }} />
      <button onClick={exportPNG} style={btn(false)}>PNG</button>
      <button onClick={exportJSON} style={btn(false)}>JSON</button>
      <div style={{ width: 1, height: 20, background: border }} />
      <button onClick={() => dispatch({ type: "TOGGLE_AI" })} style={btn(state.showAI)}>
        ✦ AI
      </button>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function StudyCanvas() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <>
      <FontLoader />
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(77,150,255,0.25); border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.8)} }
        input[type=range] { -webkit-appearance:none; appearance:none; height:4px; border-radius:2px; background:rgba(77,150,255,0.18); cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:14px; height:14px; border-radius:50%; background:#4d96ff; cursor:pointer; box-shadow:0 1px 4px rgba(77,150,255,0.5); }
        button:hover { filter: brightness(1.1); }
      `}</style>

      <div style={{ width: "100vw", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Syne, sans-serif" }}>
        <TopBar state={state} dispatch={dispatch} />

        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <Toolbar state={state} dispatch={dispatch} />

          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            <WhiteboardCanvas state={state} dispatch={dispatch} />
          </div>

          <PropertiesPanel state={state} dispatch={dispatch} />

          {state.showAI && (
            <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${state.darkMode ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)"}`, display: "flex", flexDirection: "column" }}>
              <AIPanel state={state} dispatch={dispatch} onClose={() => dispatch({ type: "TOGGLE_AI" })} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}