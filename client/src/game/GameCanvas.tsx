import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { type Tile } from '../types/level';
import { fetchSave, postSave } from '../api/client';

interface GameCanvasProps {
  tileData?: Tile[];
  levelId?: string;
  width?: number;
  height?: number;
  onComplete?: (elapsedMs: number) => void;
}

export default function GameCanvas({
  tileData = [],
  levelId,
  width = 800,
  height = 500,
  onComplete,
}: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

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
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, levelId]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
