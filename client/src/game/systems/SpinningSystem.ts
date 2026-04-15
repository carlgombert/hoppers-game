/**
 * SpinningSystem — initialises spinning block units, orbits members each frame,
 * and resolves SAT collisions with the player.
 */
import * as Phaser from 'phaser';
import { type Tile } from '../../types/level';
import { TILE } from '../constants';
import type { MainScene } from '../scenes/MainScene';
import { getStaticTileSprite, createGlueAttachment } from './MovingBoxSystem';

// ── Types ───────────────────────────────────────────────────────────────────

export interface SpinningUnit {
  center: Phaser.Physics.Arcade.Image;
  members: Array<{
    sprite: Phaser.Physics.Arcade.Image;
    radius: number;
    initAngle: number;
  }>;
  angle: number;
}

// ── Initialisation ──────────────────────────────────────────────────────────

export function initializeSpinningUnits(scene: MainScene): void {
  scene.spinningUnits.clear();
  const visited = new Set<string>();
  let spinningUnitId = 0;

  const tileData: Tile[] = scene.registry.get('tileData') ?? [];
  const tileMap = new Map<string, Tile>();
  tileData.forEach(t => tileMap.set(`${t.x},${t.y}`, t));

  const spinCenters = Array.from(scene.staticTilesByCell.values())
    .filter(s => s.getData('isSpinningCenter') === true);

  for (const seed of spinCenters) {
    const gx = seed.getData('gridX') as number;
    const gy = seed.getData('gridY') as number;
    const seedKey = `${gx},${gy}`;
    if (visited.has(seedKey)) continue;

    spinningUnitId++;
    const members: Array<{ sprite: Phaser.Physics.Arcade.Image; radius: number; initAngle: number }> = [];
    const queue = [seedKey];
    visited.add(seedKey);

    while (queue.length > 0) {
      const key = queue.shift()!;
      const box = getStaticTileSprite(scene, key);
      if (!box) continue;

      const bx = box.getData('gridX') as number;
      const by = box.getData('gridY') as number;

      // Calculate polar coords relative to the seed center
      const dx = (bx - gx) * TILE;
      const dy = (by - gy) * TILE;
      const radius = Math.sqrt(dx * dx + dy * dy);
      const initAngle = Math.atan2(dy, dx);

      // Migrate to dynamic group for movement
      if (box.getData('sourceGroup')) {
        const group = box.getData('sourceGroup') as Phaser.Physics.Arcade.Group;
        group.remove(box);
        scene.movingBoxGroup.add(box);
      }

      if (box.body instanceof Phaser.Physics.Arcade.StaticBody) {
        box.body.destroy();
        (box as any).body = null;
        scene.physics.add.existing(box, false);
      } else if (!box.body) {
        scene.physics.add.existing(box, false);
      }

      const body = box.body as Phaser.Physics.Arcade.Body;
      if (body) {
        body.allowGravity = false;
        body.setImmovable(true);
      }
      if (box.getData('ladder')) body.checkCollision.none = true;

      box.setData('isSpinningUnitMember', true);
      members.push({ sprite: box, radius, initAngle });

      // BFS Neighbors via glue
      const tile = tileMap.get(key);
      if (tile && tile.glue) {
        const sides: Array<{ s: 'up' | 'down' | 'left' | 'right', dx: number, dy: number }> = [
          { s: 'up', dx: 0, dy: -1 },
          { s: 'down', dx: 0, dy: 1 },
          { s: 'left', dx: -1, dy: 0 },
          { s: 'right', dx: 1, dy: 0 }
        ];
        for (const { s, dx, dy } of sides) {
          const neighboringKey = `${bx + dx},${by + dy}`;
          const glue = tile.glue;
          const neighborGlue = tileMap.get(neighboringKey)?.glue;
          const opposite: Record<string, 'up' | 'down' | 'left' | 'right'> = { up: 'down', down: 'up', left: 'right', right: 'left' };
          const isGlued = (glue && glue[s]) || (neighborGlue && neighborGlue[opposite[s]]);
          if (isGlued && !visited.has(neighboringKey)) {
            const neighborSprite = getStaticTileSprite(scene, neighboringKey);
            if (neighborSprite) {
              visited.add(neighboringKey);
              queue.push(neighboringKey);
            }
          }
        }
      }

      // Add visual attachments logic inherited from linear units
      if (tile && tile.glue) {
        (['up', 'down', 'left', 'right'] as const).forEach(side => {
          const isLadder = tile.type === 'ladder';
          const offsets = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
          const neighbor = tileMap.get(`${bx + offsets[side].x},${by + offsets[side].y}`);
          if (isLadder && neighbor?.type === 'ladder') return;
          if (tile.type === 'spinning_block') return;
          const opposite: Record<string, 'up' | 'down' | 'left' | 'right'> = { up: 'down', down: 'up', left: 'right', right: 'left' };
          if (tile.glue?.[side] || neighbor?.glue?.[opposite[side]]) {
            createGlueAttachment(scene, box, side);
          }
        });
      }
      
      // Store blueprint for hazards
      if (box.getData('hazardType') === 'boombox') {
        scene.gluedHazardBlueprints.set(`${bx},${gy}`, {
          unitId: spinningUnitId,
          relX: 0,
          relY: 0,
          isSpinning: true,
          radius,
          initAngle
        });
      }
    }

    scene.spinningUnits.set(spinningUnitId, { center: seed, members, angle: 0 });
  }
}

// ── Per-frame update ────────────────────────────────────────────────────────

export function updateSpinningUnits(scene: MainScene): void {
  const speed = 0.01; // default spin speed (radians per frame)

  scene.spinningUnits.forEach((unit) => {
    unit.angle += speed;
    const cx = unit.center.x;
    const cy = unit.center.y;

    for (const member of unit.members) {
      const box = member.sprite;
      const currentAngle = unit.angle + member.initAngle;

      const targetX = cx + member.radius * Math.cos(currentAngle);
      const targetY = cy + member.radius * Math.sin(currentAngle);

      // Update physics position
      box.x = targetX;
      box.y = targetY;
      box.rotation = unit.angle;

      // Sync hazard visual mirror
      const mirror = box.getData('visualMirror') as Phaser.GameObjects.Image;
      if (mirror) {
        mirror.x = box.x;
        mirror.y = box.y;
        mirror.rotation = box.rotation;
      }

      // Rotate and position all glue overlays attached to this box
      scene.children.each((child) => {
        if (child.getData('parent') === box) {
          const g = child as Phaser.GameObjects.Image;
          g.x = box.x;
          g.y = box.y;
          g.rotation = box.rotation + Phaser.Math.DegToRad(({ up: 90, right: 180, down: 270, left: 0 } as any)[g.getData('side')]);
        }
      });
    }
  });
}

// ── SAT Collision ───────────────────────────────────────────────────────────

export function handleSpinningCollision(scene: MainScene): void {
  if (scene.isDead || scene.finished) return;

  if (scene.satDebugGfx && scene.colliderDebugVisible) {
    scene.satDebugGfx.clear();
    scene.satDebugGfx.lineStyle(2, 0x00ff00, 0.8);
  }

  const playerBody = scene.player.body as Phaser.Physics.Arcade.Body;
  const playerVerts = getAABBVertices(playerBody);

  scene.spinningUnits.forEach((unit) => {
    for (const member of unit.members) {
      const box = member.sprite;
      if (!box.active) continue;

      // SKIP solid resolution for ladders (they are sensors)
      if (box.getData('ladder')) continue;

      const boxVerts = getRotatedVertices(box);

      // Draw debug outline for this SAT box
      if (scene.satDebugGfx && scene.colliderDebugVisible) {
        scene.satDebugGfx.strokePoints(boxVerts as unknown as Phaser.Math.Vector2[], true);
      }

      const mtv = checkSATCollision(playerVerts, boxVerts);

      if (mtv) {
        // If this member is a hazard, trigger death instead of resolving position
        if (box.getData('hazardType') === 'boombox') {
          scene.onHazardOverlap(scene.player as any, box as any);
          return;
        }

        // Resolve position
        scene.player.x += mtv.x;
        scene.player.y += mtv.y;

        // Resolve velocity and blocked state
        if (mtv.y < 0 && Math.abs(mtv.y) > Math.abs(mtv.x)) {
           playerBody.blocked.down = true;
           // Add tangential friction (carry the player with the rotation)
           const speed = 0.01; // match default speed
           const currentAngle = unit.angle + member.initAngle;
           // Tangential Velocity V = omega * r
           const vx = -speed * member.radius * Math.sin(currentAngle);
           // const vy = speed * member.radius * Math.cos(currentAngle);
           scene.player.x += vx; 
        }
        if (mtv.y > 0 && Math.abs(mtv.y) > Math.abs(mtv.x)) playerBody.blocked.up = true;
        if (mtv.x < 0 && Math.abs(mtv.x) > Math.abs(mtv.y)) playerBody.blocked.right = true;
        if (mtv.x > 0 && Math.abs(mtv.x) > Math.abs(mtv.y)) playerBody.blocked.left = true;
      }
    }
  });
}

// ── SAT helpers ─────────────────────────────────────────────────────────────

function getRotatedVertices(sprite: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Size): { x: number; y: number }[] {
  const { x, y, rotation } = sprite as any;
  const wH = TILE / 2; // Use TILE size for collider regardless of sprite display size
  const corners = [
    { x: -wH, y: -wH },
    { x: wH, y: -wH },
    { x: wH, y: wH },
    { x: -wH, y: wH }
  ];

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  return corners.map(c => ({
    x: x + (c.x * cos - c.y * sin),
    y: y + (c.x * sin + c.y * cos)
  }));
}

function getAABBVertices(body: Phaser.Physics.Arcade.Body): { x: number; y: number }[] {
  return [
    { x: body.x, y: body.y },
    { x: body.right, y: body.y },
    { x: body.right, y: body.bottom },
    { x: body.x, y: body.bottom }
  ];
}

function checkSATCollision(vertsA: { x: number; y: number }[], vertsB: { x: number; y: number }[]): { x: number; y: number } | null {
  const axes = [
    ...getNormals(vertsA),
    ...getNormals(vertsB)
  ];

  let minOverlap = Infinity;
  let mtvAxis = { x: 0, y: 0 };

  for (const axis of axes) {
    const projA = project(vertsA, axis);
    const projB = project(vertsB, axis);

    if (projA.max < projB.min || projB.max < projA.min) {
      return null; // Separation found
    }

    const overlap = Math.min(projA.max, projB.max) - Math.max(projA.min, projB.min);
    if (overlap < minOverlap) {
      minOverlap = overlap;
      mtvAxis = axis;
    }
  }

  // Directional orientation: ensure MTV points from B to A (shove A out)
  const centerA = { x: (vertsA[0].x + vertsA[2].x) / 2, y: (vertsA[0].y + vertsA[2].y) / 2 };
  const centerB = { x: (vertsB[0].x + vertsB[2].x) / 2, y: (vertsB[0].y + vertsB[2].y) / 2 };
  const dir = { x: centerA.x - centerB.x, y: centerA.y - centerB.y };
  if (dir.x * mtvAxis.x + dir.y * mtvAxis.y < 0) {
    mtvAxis.x *= -1;
    mtvAxis.y *= -1;
  }

  return { x: mtvAxis.x * minOverlap, y: mtvAxis.y * minOverlap };
}

function getNormals(verts: { x: number; y: number }[]): { x: number; y: number }[] {
  const normals = [];
  for (let i = 0; i < verts.length; i++) {
    const p1 = verts[i];
    const p2 = verts[(i + 1) % verts.length];
    const edge = { x: p2.x - p1.x, y: p2.y - p1.y };
    // Normal is perpendicular to edge
    const len = Math.sqrt(edge.x * edge.x + edge.y * edge.y);
    normals.push({ x: -edge.y / len, y: edge.x / len });
  }
  return normals;
}

function project(verts: { x: number; y: number }[], axis: { x: number; y: number }) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of verts) {
    const p = v.x * axis.x + v.y * axis.y;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return { min, max };
}
