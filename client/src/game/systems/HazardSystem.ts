/**
 * HazardSystem — boombox spawn/restore, hazard overlaps, water and lava kill logic.
 */
import * as Phaser from 'phaser';
import { TILE } from '../constants';
import { killPlayer } from './PlayerController';
import { velocityForDirection } from './MovingBoxSystem';
import type { MainScene } from '../scenes/MainScene';

/**
 * Spawn a boombox hazard at a grid position.
 */
export function spawnBoomboxHazard(scene: MainScene, tileX: number, tileY: number): { sensor: Phaser.Physics.Arcade.Image; visible: Phaser.GameObjects.Image } | null {
  const cellKey = `${tileX},${tileY}`;
  if (scene.boomboxHazardsByCell.has(cellKey)) return null;

  const textureKey = scene.textures.exists('tile_texture_boombox')
    ? 'tile_texture_boombox'
    : 'tile_type_boombox';

  // Check if this was a glued hazard and reposition it to its unit
  const blueprint = scene.gluedHazardBlueprints.get(cellKey);
  let px = tileX * TILE;
  let py = tileY * TILE;

  if (blueprint) {
    const unit = scene.movingBoxUnits.get(blueprint.unitId);
    const ref = unit?.find(b => b.active);
    if (ref) {
      if (blueprint.isSpinning) {
        // Calculate current position based on spinning unit center
        const spinningUnit = scene.spinningUnits.get(blueprint.unitId);
        if (spinningUnit) {
          const cx = spinningUnit.center.x;
          const cy = spinningUnit.center.y;
          const currentAngle = spinningUnit.angle + (blueprint.initAngle ?? 0);
          px = cx + (blueprint.radius ?? 0) * Math.cos(currentAngle) - TILE / 2;
          py = cy + (blueprint.radius ?? 0) * Math.sin(currentAngle) - TILE / 2;
        }
      } else {
        px = ref.x + blueprint.relX - TILE / 2;
        py = ref.y + blueprint.relY - TILE / 2;
      }
    }
  }

  const px_centered = px + TILE / 2;
  const py_centered = py + TILE / 2;

  const sensor = scene.physics.add.image(px_centered, py_centered, textureKey);
  const visibleHazard = scene.add.image(px_centered, py_centered, textureKey).setOrigin(0.5, 0.5);
  visibleHazard.setDisplaySize(TILE, TILE);

  sensor.setDisplaySize(TILE, TILE);
  sensor.setData('hazardType', 'boombox');
  sensor.setData('tileX', tileX);
  sensor.setData('tileY', tileY);
  sensor.setData('visibleHazard', visibleHazard);

  // Re-migrate and Re-insert into unit if it was part of a unit
  if (blueprint) {
    scene.movingBoxGroup.add(sensor);
  }
  
  // If this is a spinning unit hazard, re-inject it into the spinning unit members
  if (blueprint?.isSpinning) {
    const spinningUnit = scene.spinningUnits.get(blueprint.unitId);
    if (spinningUnit) {
      spinningUnit.members.push({ 
        sprite: sensor, 
        radius: blueprint.radius || 0, 
        initAngle: blueprint.initAngle || 0 
      });
      sensor.setData('isSpinningUnitMember', true);
    }
  }

  scene.physics.add.existing(sensor, false);
  const body = sensor.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(false);
  body.setImmovable(true);
  body.setSize(TILE, TILE);

  if (blueprint && !blueprint.isSpinning) {
    const dir = scene.movingBoxUnitDirection.get(blueprint.unitId);
    if (dir) {
      const vel = velocityForDirection(dir);
      body.setVelocity(vel.x, vel.y);
    }

    sensor.setData('gridX', tileX);
    sensor.setData('gridY', tileY);
    sensor.setData('sourceGroup', scene.hazardGroup);
    sensor.setData('visualMirror', visibleHazard);
    scene.staticTilesByCell.set(`${tileX},${tileY}`, sensor);

    const boxes = scene.movingBoxUnits.get(blueprint.unitId);
    if (boxes) {
      boxes.push(sensor);
    }
  }

  sensor.setAlpha(0);
  sensor.refreshBody();

  const entry = { sensor, visible: visibleHazard };
  scene.boomboxHazardsByCell.set(cellKey, entry);
  return entry;
}

/**
 * Restore all destroyed boombox hazards at their original spawn cells.
 */
export function restoreRespawnHazards(scene: MainScene): void {
  for (const cellKey of scene.boomboxSpawnCells) {
    if (scene.boomboxHazardsByCell.has(cellKey)) continue;
    const [sx, sy] = cellKey.split(',');
    const tileX = Number.parseInt(sx, 10);
    const tileY = Number.parseInt(sy, 10);
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
    spawnBoomboxHazard(scene, tileX, tileY);
  }
}

/**
 * Callback when the player overlaps a hazard (laser or boombox).
 */
export function onHazardOverlap(
  scene: MainScene,
  _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  hazardObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  if (scene.isDead || scene.finished) return;

  const hazard = hazardObj as Phaser.Physics.Arcade.Image;
  const hazardType = (hazard.getData('hazardType') as string | undefined) ?? '';

  if (hazardType === 'boombox') {
    const explosionTexture = scene.textures.exists('tile_texture_explosion')
      ? 'tile_texture_explosion'
      : null;
    const tileX = (hazard.getData('tileX') as number | undefined) ?? Math.round((hazard.x - TILE / 2) / TILE);
    const tileY = (hazard.getData('tileY') as number | undefined) ?? Math.round((hazard.y - TILE / 2) / TILE);
    const explosionX = tileX * TILE + TILE / 2;
    const explosionY = tileY * TILE + TILE / 2;

    const cellKey = `${tileX},${tileY}`;
    const tracked = scene.boomboxHazardsByCell.get(cellKey);
    if (tracked) {
      tracked.visible.destroy();
      tracked.sensor.destroy();
      scene.boomboxHazardsByCell.delete(cellKey);
    } else {
      const visibleHazard = hazard.getData('visibleHazard') as Phaser.GameObjects.Image | undefined;
      visibleHazard?.destroy();
      hazard.destroy();
    }

    if (explosionTexture) {
      const explosion = scene.add
        .image(explosionX, explosionY, explosionTexture)
        .setDepth(25)
        .setDisplaySize(TILE * 1.3, TILE * 1.3)
        .setAlpha(1);
      scene.tweens.add({
        targets: explosion,
        scaleX: 1.8,
        scaleY: 1.8,
        alpha: 0,
        duration: 320,
        ease: 'Cubic.Out',
        onComplete: () => explosion.destroy(),
      });
    }
  }

  killPlayer(scene);
}

/**
 * Callback when the player overlaps water.
 */
export function onWaterOverlap(
  scene: MainScene,
  playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  waterObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  if (scene.isDead || scene.finished) return;

  const player = playerObj as Phaser.Physics.Arcade.Sprite;
  const body = player.body as Phaser.Physics.Arcade.Body;
  const playerBottom = body.y + body.height;

  const water = waterObj as Phaser.Physics.Arcade.Image;
  const lethal = water.getData('lethal') as boolean | undefined;
  if (!lethal) return;
  const gridX = water.getData('gridX') as number | undefined;
  const surfaceY = gridX !== undefined
    ? scene.waterSurfaceByColumn.get(gridX)
    : undefined;

  // Kill only after the player sinks at least two full tile blocks below the surface.
  const depthPx = playerBottom - (surfaceY ?? water.y - TILE / 2);
  if (depthPx >= TILE * 2) {
    killPlayer(scene);
  }
}

/**
 * Callback when the player overlaps lava.
 */
export function onLavaOverlap(
  scene: MainScene,
  _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  _lavaObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  if (scene.isDead || scene.finished) return;
  killPlayer(scene);
}

/**
 * Callback when the player contacts a moving box (checks for boombox hazard).
 */
export function onMovingBoxContact(
  scene: MainScene,
  _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  boxObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  if (scene.isDead || scene.finished) return;
  const box = boxObj as Phaser.Physics.Arcade.Image;
  const hazardType = box.getData('hazardType');

  if (hazardType === 'boombox') {
    onHazardOverlap(scene, _playerObj, boxObj);
  }
}
