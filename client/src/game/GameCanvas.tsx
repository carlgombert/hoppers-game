import { useEffect, useRef, useState } from 'react';
import * as Phaser from 'phaser';
import { type Socket } from 'socket.io-client';
import { MainScene } from './scenes/MainScene';
import { type Tile } from '../types/level';
import { fetchSave, postSave } from '../api/client';
import SvgIcon from '../components/SvgIcon';

// ── Game-asset URLs (resolved by Vite at build time) ──────────────────────────
import soraUrl from '../assets/game-assets/characters/Sora.png?url';
import landTexUrl from '../assets/game-assets/textures/land.png?url';
import grassTexUrl from '../assets/game-assets/textures/grass.png?url';
import demonGrassTexUrl from '../assets/game-assets/textures/demon-grass.png?url';

const GAME_ASSET_URLS = {
  sora: soraUrl,
  land: landTexUrl,
  grass: grassTexUrl,
  demon_grass: demonGrassTexUrl,
} as const;

interface GameCanvasProps {
  tileData?: Tile[];
  levelId?: string;
  width?: number;
  height?: number;
  onComplete?: (elapsedMs: number) => void;
  /** Socket.io socket for multiplayer — omit for solo play */
  socket?: Socket;
  /** 6-char party code for multiplayer — omit for solo play */
  partyCode?: string;
  /** Called when ANY player in the party finishes (multiplayer only) */
  onPartyFinished?: (socketId: string, time: number) => void;
}

export default function GameCanvas({
  tileData = [],
  levelId,
  width = 800,
  height = 500,
  onComplete,
  socket,
  partyCode,
  onPartyFinished,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // ── Touch controls state ─────────────────────────────────────────────────
  const [showTouch, setShowTouch] = useState(false);
  const touchRef = useRef({ left: false, right: false, jump: false });

  // Detect touch devices on mount
  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (hasTouch) setShowTouch(true);
  }, []);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    let mounted = true;

    async function initGame() {
      if (!containerRef.current || !mounted) return;

      // Try to load a saved checkpoint for this level
      let savedCheckpoint: { x: number; y: number } | null = null;
      if (levelId) {
        try {
          const save = await fetchSave(levelId);
          // Only resume at a position if both x and y are present (a real checkpoint, not a completion save)
          if (save?.checkpoint_state?.x !== undefined && save.checkpoint_state.y !== undefined) {
            savedCheckpoint = {
              x: save.checkpoint_state.x,
              y: save.checkpoint_state.y,
            };
          }
        } catch {
          // no save found — start from beginning
        }
      }

      if (!mounted || !containerRef.current) return;

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        width,
        height,
        parent: containerRef.current,
        backgroundColor: '#0a1628',
        physics: {
          default: 'arcade',
          arcade: {
            gravity: { x: 0, y: 600 },
            debug: false,
          },
        },
        scene: [MainScene],
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
      });

      gameRef.current = game;

      // Pass data to scene via registry
      game.registry.set('tileData', tileData);
      game.registry.set('savedCheckpoint', savedCheckpoint);

      // Pass pre-resolved asset URLs so MainScene.preload() can load them
      game.registry.set('assetUrls', GAME_ASSET_URLS);

      // Multiplayer registry values
      game.registry.set('socket', socket ?? null);
      game.registry.set('partyCode', partyCode ?? null);

      // party:finished — any player finished (multiplayer only)
      if (socket && partyCode && onPartyFinished) {
        const handler = (payload: { id: string; time: number }) => {
          if (mounted) onPartyFinished(payload.id, payload.time);
        };
        socket.on('party:finished', handler);
        // Store cleanup ref on game so it can be removed on unmount
        game.registry.set('_partyFinishedHandler', handler);
        game.registry.set('_partySocket', socket);
      }

      // Save callback — called by scene when player hits a checkpoint
      game.registry.set('onCheckpoint', async (cx: number, cy: number) => {
        if (levelId) {
          try {
            await postSave(levelId, { x: cx, y: cy });
          } catch {
            // best-effort save — ignore errors
          }
        }
      });

      // Completion callback — called by scene when player reaches the finish flag
      game.registry.set('onComplete', (elapsedMs: number) => {
        // POST elapsed time to server (best-effort)
        if (levelId) {
          postSave(levelId, { completed: true, elapsed_ms: elapsedMs }).catch(() => {});
        }
        if (mounted && onComplete) onComplete(elapsedMs);
      });
    }

    initGame();

    return () => {
      mounted = false;
      // Remove party:finished socket listener if registered
      if (gameRef.current) {
        const sock = gameRef.current.registry.get('_partySocket') as Socket | null;
        const handler = gameRef.current.registry.get('_partyFinishedHandler') as
          | ((payload: { id: string; time: number }) => void)
          | null;
        if (sock && handler) {
          sock.off('party:finished', handler);
        }
      }
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, levelId, socket, partyCode]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', overflow: 'hidden' }}
      />

      {/* ── Mobile touch controls overlay ────────────────────────────────── */}
      {showTouch && (
        <div className="touch-controls">
          {/* D-pad */}
          <div className="touch-dpad">
            <button
              type="button"
              className="touch-btn touch-btn--left"
              onPointerDown={() => { touchRef.current.left = true; dispatchKey('ArrowLeft', 'keydown'); }}
              onPointerUp={() => { touchRef.current.left = false; dispatchKey('ArrowLeft', 'keyup'); }}
              onPointerLeave={() => { touchRef.current.left = false; dispatchKey('ArrowLeft', 'keyup'); }}
              aria-label="Move left"
            >
              <SvgIcon name="left" size={22} />
            </button>
            <button
              type="button"
              className="touch-btn touch-btn--right"
              onPointerDown={() => { touchRef.current.right = true; dispatchKey('ArrowRight', 'keydown'); }}
              onPointerUp={() => { touchRef.current.right = false; dispatchKey('ArrowRight', 'keyup'); }}
              onPointerLeave={() => { touchRef.current.right = false; dispatchKey('ArrowRight', 'keyup'); }}
              aria-label="Move right"
            >
              <SvgIcon name="right" size={22} />
            </button>
          </div>

          {/* Jump button */}
          <button
            type="button"
            className="touch-btn touch-btn--jump"
            onPointerDown={() => { dispatchKey('ArrowUp', 'keydown'); }}
            onPointerUp={() => { dispatchKey('ArrowUp', 'keyup'); }}
            onPointerLeave={() => { dispatchKey('ArrowUp', 'keyup'); }}
            aria-label="Jump"
          >
            <SvgIcon name="up" size={24} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Dispatch a synthetic keyboard event to the window so Phaser picks it up. */
function dispatchKey(key: string, type: 'keydown' | 'keyup') {
  window.dispatchEvent(new KeyboardEvent(type, { key, code: key, bubbles: true }));
}
