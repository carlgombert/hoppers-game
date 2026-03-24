import { useEffect, useRef } from 'react';
import * as Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';
import { type Tile } from '../types/level';

interface GameCanvasProps {
  tileData?: Tile[];
  width?: number;
  height?: number;
}

export default function GameCanvas({ tileData = [], width = 800, height = 500 }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!containerRef.current || gameRef.current) return;

    gameRef.current = new Phaser.Game({
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

    // Pass tile data to the scene via the game registry before the scene runs
    gameRef.current.registry.set('tileData', tileData);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
