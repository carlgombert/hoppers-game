import { useState, useEffect, useRef, useCallback } from 'react';
import { type Tile, type Level, type TileType, type EditorTool } from '../../types/level';
import TilePalette from './TilePalette';
import TileCanvas from './TileCanvas';
import GameCanvas from '../../game/GameCanvas';

const MAX_UNDO = 50;

function makeTileKey(x: number, y: number) {
  return `${x},${y}`;
}

function levelToTileMap(level: Level | null): Map<string, Tile> {
  if (!level) return new Map();
  return new Map(level.tile_data.map((t) => [makeTileKey(t.x, t.y), t]));
}

interface Props {
  level: Level | null; // null = creating a new level
  onSave: (level: Level) => void;
  onCancel: () => void;
}

export default function LevelEditor({ level, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(level?.title ?? '');
  const [description, setDescription] = useState(level?.description ?? '');
  const [tool, setTool] = useState<EditorTool>('land');
  const [tileMap, setTileMap] = useState<Map<string, Tile>>(() => levelToTileMap(level));
  const [undoStack, setUndoStack] = useState<Map<string, Tile>[]>([]);
  const [redoStack, setRedoStack] = useState<Map<string, Tile>[]>([]);
  const [pendingPortalId, setPendingPortalId] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  // Snapshot of tileMap captured at preview start
  const [previewTiles, setPreviewTiles] = useState<Tile[]>([]);

  // Snapshot taken at gesture start so each drag = one undo step
  const preGestureSnap = useRef<Map<string, Tile> | null>(null);

  // Reset when a different level is loaded
  // (handled by key prop in App — no effect needed here)

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y
  const handleUndo = useCallback(() => {
    setUndoStack((u) => {
      if (u.length === 0) return u;
      const snap = u[u.length - 1];
      setRedoStack((r) => [...r, tileMap]);
      setTileMap(snap);
      return u.slice(0, -1);
    });
  }, [tileMap]);

  const handleRedo = useCallback(() => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const snap = r[r.length - 1];
      setUndoStack((u) => [...u, tileMap]);
      setTileMap(snap);
      return r.slice(0, -1);
    });
  }, [tileMap]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndo, handleRedo]);

  function handleGestureStart() {
    preGestureSnap.current = new Map(tileMap);
  }

  function handleGestureEnd() {
    if (preGestureSnap.current) {
      const snap = preGestureSnap.current;
      setUndoStack((u) => [...u.slice(-(MAX_UNDO - 1)), snap]);
      setRedoStack([]);
      preGestureSnap.current = null;
    }
  }

  function handlePaint(x: number, y: number) {
    if (tool === 'eraser') {
      handleErase(x, y);
      return;
    }
    setTileMap((prev) => {
      const next = new Map(prev);
      let newTile: Tile;

      if (tool === 'portal') {
        if (pendingPortalId) {
          // Second portal — link pair and clear pending
          newTile = { type: 'portal', x, y, linkedPortalId: pendingPortalId };
          setPendingPortalId(null);
        } else {
          // First portal — generate new link ID
          const portalId = crypto.randomUUID();
          newTile = { type: 'portal', x, y, linkedPortalId: portalId };
          setPendingPortalId(portalId);
        }
      } else {
        newTile = { type: tool as TileType, x, y };
      }

      next.set(makeTileKey(x, y), newTile);
      return next;
    });
    setPublishError(null);
  }

  function handleErase(x: number, y: number) {
    setTileMap((prev) => {
      const next = new Map(prev);
      const existing = next.get(makeTileKey(x, y));
      // If erasing a portal, also remove its pair's pending state
      if (existing?.type === 'portal' && existing.linkedPortalId === pendingPortalId) {
        setPendingPortalId(null);
      }
      next.delete(makeTileKey(x, y));
      return next;
    });
  }

  function validateForPublish(): string | null {
    const tiles = Array.from(tileMap.values());
    const hasStart = tiles.some((t) => t.type === 'flag_start');
    const hasFinish = tiles.some((t) => t.type === 'flag_finish');
    if (!hasStart && !hasFinish) return 'Level needs a Start Flag and a Finish Flag to be published.';
    if (!hasStart) return 'Level needs a Start Flag to be published.';
    if (!hasFinish) return 'Level needs a Finish Flag to be published.';
    return null;
  }

  function buildLevel(published: boolean): Level {
    const now = new Date().toISOString();
    return {
      id: level?.id ?? crypto.randomUUID(),
      title: title.trim() || 'Untitled Level',
      description: description.trim(),
      tile_data: Array.from(tileMap.values()),
      published,
      created_at: level?.created_at ?? now,
      updated_at: now,
    };
  }

  function handleSaveDraft() {
    setPublishError(null);
    onSave(buildLevel(false));
  }

  function handlePreview() {
    setPreviewTiles(Array.from(tileMap.values()));
    setPreviewing(true);
  }

  function handleExitPreview() {
    setPreviewing(false);
  }

  function handlePublish() {
    const err = validateForPublish();
    if (err) {
      setPublishError(err);
      return;
    }
    setPublishError(null);
    onSave(buildLevel(true));
  }

  const tileCount = tileMap.size;
  const hasStart = Array.from(tileMap.values()).some((t) => t.type === 'flag_start');
  const hasFinish = Array.from(tileMap.values()).some((t) => t.type === 'flag_finish');

  return (
    <div className="xp-editor-layout">
      {/* ── Preview overlay ─────────────────────────────────────── */}
      {previewing && (
        <div className="xp-preview-overlay">
          <div className="xp-preview-toolbar">
            <span className="xp-preview-label">Preview Mode — changes are not saved</span>
            <button
              type="button"
              className="xp-btn danger"
              onClick={handleExitPreview}
            >
              Exit Preview
            </button>
          </div>
          <div className="xp-preview-canvas">
            <GameCanvas tileData={previewTiles} />
          </div>
        </div>
      )}
      {/* ── Toolbar ─────────────────────────────────────────────── */}
      <div className="xp-editor-toolbar">
        <input
          type="text"
          className="xp-editor-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Level title…"
          maxLength={60}
          aria-label="Level title"
        />

        <div className="xp-editor-toolbar-spacer" />

        <div className="xp-editor-toolbar-meta">
          <span className={`xp-editor-flag-badge ${hasStart ? 'ok' : 'missing'}`}>S</span>
          <span className={`xp-editor-flag-badge ${hasFinish ? 'ok' : 'missing'}`}>F</span>
          <span className="xp-editor-tile-count">{tileCount} tiles</span>
        </div>

        <button
          type="button"
          className="xp-btn ghost"
          onClick={handleUndo}
          disabled={undoStack.length === 0}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          ↩ Undo
        </button>
        <button
          type="button"
          className="xp-btn ghost"
          onClick={handleRedo}
          disabled={redoStack.length === 0}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          ↪ Redo
        </button>

        <button type="button" className="xp-btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="xp-btn ghost" onClick={handlePreview}>
          ▶ Preview
        </button>
        <button type="button" className="xp-btn" onClick={handleSaveDraft}>
          Save Draft
        </button>
        <button type="button" className="xp-btn primary" onClick={handlePublish}>
          Publish
        </button>
      </div>

      {/* Publish validation error */}
      {publishError && (
        <div className="xp-editor-error" role="alert">
          {publishError}
        </div>
      )}

      {/* ── Body: palette + canvas ──────────────────────────────── */}
      <div className="xp-editor-body">
        <div className="xp-editor-palette-rail">
          <TilePalette selected={tool} onSelect={setTool} pendingPortalId={pendingPortalId} />
        </div>

        <div className="xp-editor-canvas-area">
          <TileCanvas
            tiles={tileMap}
            tool={tool}
            onPaint={handlePaint}
            onErase={handleErase}
            onGestureStart={handleGestureStart}
            onGestureEnd={handleGestureEnd}
          />
        </div>

        {/* ── Right info strip ──────────────────────────────────── */}
        <div className="xp-editor-info-rail">
          <div className="xp-pane-heading">DESCRIPTION</div>
          <textarea
            className="xp-editor-desc-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description…"
            rows={4}
            maxLength={300}
          />

          <div className="xp-pane-heading" style={{ marginTop: 16 }}>LEGEND</div>
          <ul className="xp-editor-legend">
            <li><strong>Left-click / drag</strong> — place tile</li>
            <li><strong>Right-click / drag</strong> — erase</li>
            <li><strong>Delete / Backspace</strong> — erase hovered</li>
            <li><strong>Ctrl+Z</strong> — undo</li>
            <li><strong>Ctrl+Y</strong> — redo</li>
            <li><strong>Portal</strong> — click twice to link pair</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
