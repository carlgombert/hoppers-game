/**
 * MovingBoxSystem — initialises moving-box units from glue-linked tile clusters
 * and updates their movement / reversal each frame.
 */
import * as Phaser from 'phaser';
import { type Tile } from '../../types/level';
import {
  TILE,
  MOVING_BOX_SPEED,
  MOVING_BOX_STUCK_FRAMES,
  MOVING_BOX_PROGRESS_EPSILON,
  MOVING_BOX_REVERSE_COOLDOWN_FRAMES,
  MOVING_BOX_UNSTICK_NUDGE,
} from '../constants';
import type { MovingDirection } from '../types';
import type { MainScene } from '../scenes/MainScene';

// ── Direction helpers ────────────────────────────────────────────────────────

export function velocityForDirection(direction: MovingDirection): { x: number; y: number } {
  if (direction === 'left') return { x: -MOVING_BOX_SPEED, y: 0 };
  if (direction === 'right') return { x: MOVING_BOX_SPEED, y: 0 };
  if (direction === 'up') return { x: 0, y: -MOVING_BOX_SPEED };
  return { x: 0, y: MOVING_BOX_SPEED };
}

export function oppositeDirection(direction: MovingDirection): MovingDirection {
  if (direction === 'left') return 'right';
  if (direction === 'right') return 'left';
  if (direction === 'up') return 'down';
  return 'up';
}

function getUnitProgressCoord(
  boxes: Phaser.Physics.Arcade.Image[],
  direction: MovingDirection,
): number {
  const sum = boxes.reduce(
    (acc, box) => acc + (direction === 'left' || direction === 'right' ? box.x : box.y),
    0,
  );
  return sum / boxes.length;
}

// ── Glue attachment visual ──────────────────────────────────────────────────

export function createGlueAttachment(
  scene: MainScene,
  parent: Phaser.Physics.Arcade.Image,
  side: 'up' | 'down' | 'left' | 'right',
): void {
  const rotationMap = { up: 90, right: 180, down: 270, left: 0 };
  const glue = scene.add.image(parent.x, parent.y, 'glue')
    .setDisplaySize(TILE, TILE)
    .setOrigin(0.5, 0.5)
    .setRotation(Phaser.Math.DegToRad(rotationMap[side]));

  glue.setData('parent', parent);
  glue.setData('side', side);
  glue.setDepth(parent.depth + 0.1);
  const attachments = parent.getData('glueAttachments') || [];
  attachments.push(glue);
  parent.setData('glueAttachments', attachments);
}

// ── Static tile lookup ──────────────────────────────────────────────────────

export function getStaticTileSprite(scene: MainScene, key: string): Phaser.Physics.Arcade.Image | null {
  return scene.staticTilesByCell.get(key)
    || scene.movingBoxesByCell.get(key)
    || null;
}

// ── Initialisation ──────────────────────────────────────────────────────────

export function initializeMovingBoxUnits(scene: MainScene): void {
  scene.movingBoxUnits.clear();
  scene.movingBoxUnitDirection.clear();
  scene.movingBoxUnitLastProgressCoord.clear();
  scene.movingBoxUnitStuckFrames.clear();
  scene.movingBoxUnitReverseCooldown.clear();

  const visited = new Map<string, number>(); // cellKey -> unitId
  let unitId = 0;

  // First, find all moving_box tiles as seeds
  const tileData: Tile[] = scene.registry.get('tileData') ?? [];
  const tileMap = new Map<string, Tile>();
  tileData.forEach(t => tileMap.set(`${t.x},${t.y}`, t));

  const movingBoxTiles = tileData.filter(t => t.type === 'moving_box');

  for (const seed of movingBoxTiles) {
    const seedKey = `${seed.x},${seed.y}`;
    if (visited.has(seedKey)) continue;

    unitId += 1;
    const unitBoxes: Phaser.Physics.Arcade.Image[] = [];
    const queue = [seedKey];
    visited.set(seedKey, unitId);

    const seedDirection = (seed.moveDirection ?? 'right') as MovingDirection;

    while (queue.length > 0) {
      const key = queue.shift()!;
      const box = getStaticTileSprite(scene, key);

      if (box) {
        unitBoxes.push(box);
        box.setData('movingUnitId', unitId);

        // Migrate to movingBoxGroup to enable unified dynamic movement
        if (box.getData('sourceGroup')) {
          const group = box.getData('sourceGroup') as Phaser.Physics.Arcade.Group;
          group.remove(box);
          scene.movingBoxGroup.add(box);
        }

        // Ensure we have a dynamic body for movement and collision detection
        if (box.body instanceof Phaser.Physics.Arcade.StaticBody) {
          box.body.destroy();
          (box as any).body = null;
          scene.physics.add.existing(box, false);
        }

        const body = box.body as Phaser.Physics.Arcade.Body;
        if (body) {
          body.allowGravity = false;
          body.setImmovable(true);
          // Ladders should not be solid blocks, otherwise player can't 'overlap' them to climb
          if (box.getData('ladder')) {
            body.checkCollision.none = true;
          }
        }
      }

      const [sx, sy] = key.split(',').map(Number);
      const neighbors = [
        { key: `${sx + 1},${sy}`, sideFacingNeighbor: 'right' as const, neighborSideFacingMe: 'left' as const },
        { key: `${sx - 1},${sy}`, sideFacingNeighbor: 'left' as const, neighborSideFacingMe: 'right' as const },
        { key: `${sx},${sy + 1}`, sideFacingNeighbor: 'down' as const, neighborSideFacingMe: 'up' as const },
        { key: `${sx},${sy - 1}`, sideFacingNeighbor: 'up' as const, neighborSideFacingMe: 'down' as const },
      ];

      const currentTile = tileMap.get(key);

      for (const n of neighbors) {
        if (visited.has(n.key)) continue;

        const neighborTile = tileMap.get(n.key);
        if (!neighborTile) continue;

        // Glue logic: Sticked if current tile has glue on neighbor side OR neighbor has glue on current tile side
        const isGlued = (currentTile?.glue?.[n.sideFacingNeighbor]) || (neighborTile?.glue?.[n.neighborSideFacingMe]);

        if (isGlued) {
          visited.set(n.key, unitId);
          queue.push(n.key);
        }
      }
    }

    scene.movingBoxUnits.set(unitId, unitBoxes);
    scene.movingBoxUnitDirection.set(unitId, seedDirection);
    const progressCoord = getUnitProgressCoord(unitBoxes, seedDirection);
    scene.movingBoxUnitLastProgressCoord.set(unitId, progressCoord);
    scene.movingBoxUnitStuckFrames.set(unitId, 0);
    scene.movingBoxUnitReverseCooldown.set(unitId, 0);
    const velocity = velocityForDirection(seedDirection);

    for (const box of unitBoxes) {
      const body = box.body as Phaser.Physics.Arcade.Body;
      if (body) body.setVelocity(velocity.x, velocity.y);

      // Track relative blueprints for hazards/ladders so they respawn glued correctly
      const gridX = box.getData('gridX');
      const gridY = box.getData('gridY');

      if (gridX !== undefined && gridY !== undefined) {
        const ref = unitBoxes[0];
        const isLethal = box.getData('hazardType') === 'boombox';
        const isLadder = box.getData('ladder') === true;
        if (isLethal || isLadder) {
          scene.gluedHazardBlueprints.set(`${gridX},${gridY}`, {
            unitId,
            relX: box.x - ref.x,
            relY: box.y - ref.y,
          });
        }
      }

      // Add visual glue attachments
      if (gridX === undefined || gridY === undefined) continue;

      const tile = tileMap.get(`${gridX},${gridY}`);
      if (tile && tile.glue) {
        (['up', 'down', 'left', 'right'] as const).forEach(side => {
          const isLadder = tile.type === 'ladder';
          const offsets = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
          const nx = gridX + offsets[side].x;
          const ny = gridY + offsets[side].y;
          const neighbor = tileMap.get(`${nx},${ny}`);

          // Don't render glue if it's between two ladders
          if (isLadder && neighbor?.type === 'ladder') return;

          if (tile.glue?.[side]) {
            createGlueAttachment(scene, box, side);
          } else {
            // Also check if neighbor is glued to US
            const opp = { up: 'down', down: 'up', left: 'right', right: 'left' } as const;
            if (neighbor?.glue?.[opp[side]]) {
              createGlueAttachment(scene, box, side);
            }
          }
        });
      }
    }
  }
}

// ── Per-frame update ────────────────────────────────────────────────────────

export function updateMovingBoxUnits(scene: MainScene): void {
  const worldBounds = scene.physics.world.bounds;

  for (const [unitId, boxes] of scene.movingBoxUnits) {
    if (boxes.length === 0) continue;

    let direction = scene.movingBoxUnitDirection.get(unitId) ?? 'right';
    let shouldReverse = false;
    let cooldown = scene.movingBoxUnitReverseCooldown.get(unitId) ?? 0;
    if (cooldown > 0) {
      cooldown -= 1;
    }

    for (const box of boxes) {
      if (!box.active) continue;
      const body = box.body as Phaser.Physics.Arcade.Body;
      if (!body || !body.enable) continue;

      const hitWall = direction === 'left'
        ? body.blocked.left
        : direction === 'right'
          ? body.blocked.right
          : direction === 'up'
            ? body.blocked.up
            : body.blocked.down;
      const hitBounds = direction === 'left'
        ? (box.x - TILE / 2) <= (worldBounds.x + 1)
        : direction === 'right'
          ? (box.x + TILE / 2) >= (worldBounds.right - 1)
          : direction === 'up'
            ? (box.y - TILE / 2) <= (worldBounds.y + 1)
            : (box.y + TILE / 2) >= (worldBounds.bottom - 1);
      if (hitWall || hitBounds) {
        shouldReverse = true;
        break;
      }

      // Sync glue attachments
      const attachments = box.getData('glueAttachments') as Phaser.GameObjects.Image[];
      if (attachments) {
        attachments.forEach(g => {
          g.x = box.x;
          g.y = box.y;
        });
      }

      // Sync visual mirror (for hazards/boomboxes)
      const mirror = box.getData('visualMirror') as Phaser.GameObjects.Image;
      if (mirror) {
        mirror.x = box.x - TILE / 2;
        mirror.y = box.y - TILE / 2;
      }
    }

    const progressCoord = getUnitProgressCoord(boxes, direction);
    const previousCoord = scene.movingBoxUnitLastProgressCoord.get(unitId) ?? progressCoord;
    const movedDistance = Math.abs(progressCoord - previousCoord);

    let stuckFrames = scene.movingBoxUnitStuckFrames.get(unitId) ?? 0;
    if (movedDistance < MOVING_BOX_PROGRESS_EPSILON) {
      stuckFrames += 1;
    } else {
      stuckFrames = 0;
    }

    if (stuckFrames >= MOVING_BOX_STUCK_FRAMES) {
      shouldReverse = true;
      stuckFrames = 0;
    }

    if (shouldReverse && cooldown <= 0) {
      direction = oppositeDirection(direction);
      cooldown = MOVING_BOX_REVERSE_COOLDOWN_FRAMES;

      // Nudge unit after reversal to break persistent contact with blockers.
      const nudge = velocityForDirection(direction);
      for (const box of boxes) {
        box.x += Math.sign(nudge.x) * MOVING_BOX_UNSTICK_NUDGE;
        box.y += Math.sign(nudge.y) * MOVING_BOX_UNSTICK_NUDGE;
      }
    }

    scene.movingBoxUnitDirection.set(unitId, direction);
    scene.movingBoxUnitLastProgressCoord.set(unitId, progressCoord);
    scene.movingBoxUnitStuckFrames.set(unitId, stuckFrames);
    scene.movingBoxUnitReverseCooldown.set(unitId, cooldown);
    // Clean up inactive/destroyed boxes periodically to prevent memory leaks in the unit array
    if (scene.time.now % 100 < 20) {
      scene.movingBoxUnits.set(unitId, boxes.filter(b => b.active));
    }

    const velocity = velocityForDirection(direction);

    for (const box of boxes) {
      if (!box.active) continue;
      const body = box.body as Phaser.Physics.Arcade.Body;
      if (!body || !body.enable) continue;
      body.setVelocity(velocity.x, velocity.y);
    }
  }
}
