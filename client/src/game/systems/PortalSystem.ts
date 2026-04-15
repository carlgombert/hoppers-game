/**
 * PortalSystem — teleportation logic and cooldown management.
 */
import * as Phaser from 'phaser';
import { TILE, PORTAL_COOLDOWN_MS } from '../constants';
import type { MainScene } from '../scenes/MainScene';

/**
 * Callback when the player overlaps a portal tile.
 */
export function onPortalOverlap(
  scene: MainScene,
  _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  portalObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  if (scene.portalCooldown) return;

  const portal = portalObj as Phaser.Physics.Arcade.Image;

  const linkedId = portal.getData('linkedPortalId') as string;
  if (!linkedId) return;

  const positions = scene.portalPositions.get(linkedId);
  // Require at least two portals with this ID to form a pair
  if (!positions || positions.length < 2) return;

  // Find the OTHER portal position (not the one the player is currently on)
  const myX = portal.getData('portalX') as number;
  const myY = portal.getData('portalY') as number;
  const dest = positions.find((p) => p.x !== myX || p.y !== myY);
  if (!dest) return; // both portals are at the same position — no-op

  scene.portalCooldown = true;
  scene.player.setPosition(dest.x, dest.y - TILE / 2);
  scene.player.setVelocity(0, 0);

  scene.time.delayedCall(PORTAL_COOLDOWN_MS, () => {
    scene.portalCooldown = false;
  });
}
