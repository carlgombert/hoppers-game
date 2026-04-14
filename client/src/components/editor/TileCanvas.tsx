import { useRef, useEffect, useCallback, useState } from 'react';
import { type Tile, type EditorTool, TILE_META } from '../../types/level';

const CELL = 20; // display pixel size per grid cell in the editor
export const EDITOR_COLS = 40;
export const EDITOR_ROWS = 24;

interface Props {
  tiles: Map<string, Tile>;
  tool: EditorTool;
  onPaint: (x: number, y: number) => void;
  onErase: (x: number, y: number) => void;
  onGlue: (x: number, y: number, side: 'up' | 'down' | 'left' | 'right') => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}

export default function TileCanvas({
  tiles,
  tool,
  onPaint,
  onErase,
  onGlue,
  onGestureStart,
  onGestureEnd,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ col: number; row: number } | null>(null);
  const isPainting = useRef(false);
  const isErasing = useRef(false);
  // Keep latest hover in a ref so keyboard handler can access it without stale closure
  const hoverRef = useRef<{ col: number; row: number } | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = '#12151f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Placed tiles
    tiles.forEach((tile) => {
      const meta = TILE_META[tile.type];
      const px = tile.x * CELL;
      const py = tile.y * CELL;

      ctx.fillStyle = meta.color;
      ctx.fillRect(px + 1, py + 1, CELL - 1, CELL - 1);

      // Top bevel highlight
      ctx.fillStyle = meta.gloss + '50';
      ctx.fillRect(px + 1, py + 1, CELL - 1, 3);

      // Bottom shadow compression
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(px + 1, py + CELL - 3, CELL - 1, 2);

      // Flag markers: small inner symbol
      if (tile.type === 'flag_start' || tile.type === 'flag_checkpoint' || tile.type === 'flag_finish') {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = `bold ${CELL - 6}px Tahoma, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const symbol = tile.type === 'flag_start' ? 'S' : tile.type === 'flag_finish' ? 'F' : 'C';
        ctx.fillText(symbol, px + CELL / 2, py + CELL / 2 + 1);
      }

      // Portal link indicator
      if (tile.type === 'portal') {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px + CELL / 2, py + CELL / 2, (CELL / 2) - 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (tile.type === 'moving_box') {
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `bold ${CELL - 7}px Tahoma, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const dir = tile.moveDirection ?? 'right';
        const symbol = dir === 'left' ? '<' : dir === 'right' ? '>' : dir === 'up' ? '^' : 'v';
        ctx.fillText(symbol, px + CELL / 2, py + CELL / 2 + 1);
      }

      if (tile.type === 'spinning_block') {
        ctx.fillStyle = 'rgba(255,255,255,0.78)';
        ctx.font = `bold ${CELL - 4}px Tahoma, Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('↻', px + CELL / 2, py + CELL / 2 + 1);
      }

      // Glue rendering
      if (tile.glue) {
        ctx.fillStyle = '#f0c040';
        const thickness = 3;
        if (tile.glue.up) ctx.fillRect(px, py, CELL, thickness);
        if (tile.glue.down) ctx.fillRect(px, py + CELL - thickness, CELL, thickness);
        if (tile.glue.left) ctx.fillRect(px, py, thickness, CELL);
        if (tile.glue.right) ctx.fillRect(px + CELL - thickness, py, thickness, CELL);
      }
    });

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let c = 0; c <= EDITOR_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, canvas.height);
      ctx.stroke();
    }
    for (let r = 0; r <= EDITOR_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL);
      ctx.lineTo(canvas.width, r * CELL);
      ctx.stroke();
    }

    // Hover highlight
    if (hover) {
      const { col, row } = hover;
      if (tool === 'eraser') {
        ctx.fillStyle = 'rgba(200,60,60,0.22)';
      } else if (tool === 'glue') {
        ctx.fillStyle = 'rgba(240,192,64,0.3)';
      } else {
        const meta = TILE_META[tool as TileType];
        ctx.fillStyle = meta.color + '40';
      }
      ctx.fillRect(col * CELL + 1, row * CELL + 1, CELL - 1, CELL - 1);

      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(col * CELL + 0.5, row * CELL + 0.5, CELL, CELL);
    }
  }, [tiles, hover, tool]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Delete / Backspace erase the hovered cell via keyboard
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const cell = hoverRef.current;
      if (!cell) return;
      e.preventDefault();
      onGestureStart();
      onErase(cell.col, cell.row);
      onGestureEnd();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onGestureStart, onErase, onGestureEnd]);

  function getCellFromEvent(e: React.MouseEvent): { col: number; row: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL);
    const row = Math.floor((e.clientY - rect.top) / CELL);
    if (col < 0 || col >= EDITOR_COLS || row < 0 || row >= EDITOR_ROWS) return null;
    return { col, row };
  }

  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const cell = getCellFromEvent(e);
    if (!cell) return;

    if (tool === 'glue') {
      const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
      const localX = e.clientX - rect.left - cell.col * CELL;
      const localY = e.clientY - rect.top - cell.row * CELL;

      const dists = [
        { side: 'up' as const, d: localY },
        { side: 'down' as const, d: CELL - localY },
        { side: 'left' as const, d: localX },
        { side: 'right' as const, d: CELL - localX },
      ];
      dists.sort((a, b) => a.d - b.d);
      onGestureStart();
      onGlue(cell.col, cell.row, dists[0].side);
      onGestureEnd();
      return;
    }

    onGestureStart();
    isPainting.current = true;
    isErasing.current = e.button === 2 || tool === 'eraser';
    if (isErasing.current) {
      onErase(cell.col, cell.row);
    } else {
      onPaint(cell.col, cell.row);
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    const cell = getCellFromEvent(e);
    hoverRef.current = cell;
    setHover(cell);
    if (!isPainting.current || !cell) return;
    if (isErasing.current) {
      onErase(cell.col, cell.row);
    } else {
      onPaint(cell.col, cell.row);
    }
  }

  function handleMouseUp() {
    if (isPainting.current) onGestureEnd();
    isPainting.current = false;
    isErasing.current = false;
  }

  function handleMouseLeave() {
    hoverRef.current = null;
    setHover(null);
    if (isPainting.current) onGestureEnd();
    isPainting.current = false;
    isErasing.current = false;
  }

  return (
    <canvas
      ref={canvasRef}
      width={EDITOR_COLS * CELL}
      height={EDITOR_ROWS * CELL}
      className="xp-tile-canvas"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
