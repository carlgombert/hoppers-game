/**
 * PhysicsSetup — world bounds computation and physics group/collider creation.
 */
import * as Phaser from 'phaser';
import { type Tile } from '../../types/level';
import { TILE } from '../constants';

/**
 * Compute the Y-coordinate of the kill plane below the lowest tile.
 */
export function computeKillPlaneY(tiles: Tile[], fallbackHeight: number): number {
  if (tiles.length === 0) return fallbackHeight + 200;
  let maxY = 0;
  for (const tile of tiles) {
    if (tile.y > maxY) maxY = tile.y;
  }
  return (maxY + 1) * TILE + 240;
}

/**
 * Compute the world bounds rectangle from tile positions.
 */
export function computeWorldBounds(
  tiles: Tile[],
  fallbackWidth: number,
  fallbackHeight: number,
): { x: number; y: number; width: number; height: number } {
  if (tiles.length === 0) {
    return { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight };
  }

  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  for (const tile of tiles) {
    if (tile.x < minX) minX = tile.x;
    if (tile.y < minY) minY = tile.y;
    if (tile.x > maxX) maxX = tile.x;
    if (tile.y > maxY) maxY = tile.y;
  }

  const paddingTiles = 1;
  const x = (minX - paddingTiles) * TILE;
  const y = (minY - paddingTiles) * TILE;
  const width = (maxX - minX + 1 + paddingTiles * 2) * TILE;
  const height = (maxY - minY + 1 + paddingTiles * 2) * TILE;

  return {
    x,
    y,
    width: Math.max(width, fallbackWidth),
    height: Math.max(height, fallbackHeight),
  };
}
