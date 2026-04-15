/**
 * TileBuilder — builds the level from tile data, creates textures,
 * and expands runtime fluids.
 */
import * as Phaser from 'phaser';
import { type Tile, TILE_META } from '../../types/level';
import {
  TILE,
  WATER_FRAME_SIZE,
  WATER_OVERLAY_FILL,
  WATER_OVERLAY_DEPTH,
  WATER_TEXTURE_DEPTH,
  WATER_TEXTURE_ALPHA,
  WATER_FLOW_ANIM_KEY,
  WATER_STILL_ANIM_KEY,
  LAVA_FLOW_ANIM_KEY,
  LAVA_STILL_ANIM_KEY,
  WATER_RUNTIME_ROWS,
  HAZARD_TEXTURE_DEPTH,
} from '../constants';
import type { MovingDirection } from '../types';
import type { MainScene } from '../scenes/MainScene';

/**
 * Create reusable water/lava animations once per scene when spritesheets are available.
 */
export function createFluidAnimations(scene: Phaser.Scene): void {
  createWaterAnimation(scene, 'tile_texture_water_flow', WATER_FLOW_ANIM_KEY, 10);
  createWaterAnimation(scene, 'tile_texture_water_still', WATER_STILL_ANIM_KEY, 6);
  createWaterAnimation(scene, 'tile_texture_lava_flow', LAVA_FLOW_ANIM_KEY, 4);
  createWaterAnimation(scene, 'tile_texture_lava_still', LAVA_STILL_ANIM_KEY, 3);
}

function createWaterAnimation(scene: Phaser.Scene, textureKey: string, animKey: string, frameRate: number) {
  if (!scene.textures.exists(textureKey) || scene.anims.exists(animKey)) {
    return;
  }

  const texture = scene.textures.get(textureKey);
  const frameKeys = Object.keys(texture.frames).filter((k) => k !== '__BASE');
  const frameCount = frameKeys.length;
  if (frameCount <= 0) return;

  scene.anims.create({
    key: animKey,
    frames: scene.anims.generateFrameNumbers(textureKey, { start: 0, end: frameCount - 1 }),
    frameRate,
    repeat: -1,
  });
}

/**
 * Expand authored water/lava tiles downward to fill columns.
 */
export function expandRuntimeFluids(tiles: Tile[]): Tile[] {
  const byCell = new Map<string, Tile>();

  for (const tile of tiles) {
    byCell.set(`${tile.x},${tile.y}`, {
      ...tile,
      waterVariant: (tile.type === 'water' || tile.type === 'lava')
        ? (tile.waterVariant === 'flow' ? 'flow' : 'still')
        : undefined,
    });
  }

  const fluidSources = Array.from(byCell.values()).filter(
    (t) => (t.type === 'water' || t.type === 'lava') && t.waterVariant !== 'flow',
  );

  for (const src of fluidSources) {
    const belowY = src.y + 1;
    if (belowY >= WATER_RUNTIME_ROWS) continue;
    if (byCell.has(`${src.x},${belowY}`)) continue;

    for (let y = belowY; y < WATER_RUNTIME_ROWS; y++) {
      const key = `${src.x},${y}`;
      if (byCell.has(key)) break;
      byCell.set(key, {
        type: src.type,
        x: src.x,
        y,
        waterVariant: 'flow',
      });
    }
  }

  return Array.from(byCell.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

/**
 * Build physics sprites for every tile in the level.
 */
export function buildFromTileData(scene: MainScene, tiles: Tile[]): void {
  const generatedTextures = new Set<string>();
  const tileMap: Record<string, Tile> = {};
  tiles.forEach(t => { tileMap[`${t.x},${t.y}`] = t; });

  // First pass: collect portal positions indexed by linkedPortalId
  for (const tile of tiles) {
    if (tile.type === 'portal' && tile.linkedPortalId) {
      const pos = { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 };
      const list = scene.portalPositions.get(tile.linkedPortalId) ?? [];
      list.push(pos);
      scene.portalPositions.set(tile.linkedPortalId, list);
    }

    if (tile.type === 'water' && tile.waterVariant !== 'flow') {
      const surfaceY = tile.y * TILE;
      const current = scene.waterSurfaceByColumn.get(tile.x);
      if (current === undefined || surfaceY < current) {
        scene.waterSurfaceByColumn.set(tile.x, surfaceY);
      }
    }
  }

  for (const tile of tiles) {
    // Gracefully skip unknown tile types with a console warning
    if (!(tile.type in TILE_META)) {
      console.warn(`[MainScene] Unknown tile type "${tile.type}" at (${tile.x}, ${tile.y}) — skipped.`);
      continue;
    }

    const meta = TILE_META[tile.type];
    const px = tile.x * TILE;
    const py = tile.y * TILE;

    // Use a pre-loaded PNG texture for this tile type if available
    const pngKey = `tile_texture_${tile.type}`;
    const textureKey = scene.textures.exists(pngKey) ? pngKey : `tile_type_${tile.type}`;

    if (textureKey === `tile_type_${tile.type}` && !generatedTextures.has(textureKey)) {
      const gfx = scene.make.graphics({ x: 0, y: 0 });
      drawTileGfx(gfx, tile.type, meta.color, meta.gloss);
      gfx.generateTexture(textureKey, TILE, TILE);
      gfx.destroy();
      generatedTextures.add(textureKey);
    }

    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    switch (tile.type) {
      case 'land':
      case 'grass':
      case 'demon_grass': {
        const img = scene.platforms.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        img.setDisplaySize(TILE, TILE);
        img.setData('gridX', tile.x);
        img.setData('gridY', tile.y);
        img.refreshBody();
        img.setData('sourceGroup', scene.platforms);
        scene.staticTilesByCell.set(`${tile.x},${tile.y}`, img);
        break;
      }

      case 'ladder': {
        const ladderSensor = scene.ladderGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        ladderSensor.setDisplaySize(TILE, TILE);
        ladderSensor.setData('gridX', tile.x);
        ladderSensor.setData('gridY', tile.y);
        ladderSensor.setData('ladder', true);
        ladderSensor.refreshBody();
        ladderSensor.body?.setSize(TILE, TILE); // Explicit size for reliable mounting
        ladderSensor.setData('sourceGroup', scene.ladderGroup);
        scene.staticTilesByCell.set(`${tile.x},${tile.y}`, ladderSensor);
        break;
      }

      case 'ice': {
        const img = scene.platforms.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        img.setDisplaySize(TILE, TILE);
        img.setData('gridX', tile.x);
        img.setData('gridY', tile.y);
        img.refreshBody();
        img.setData('sourceGroup', scene.platforms);
        const iceSensor = scene.iceGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        iceSensor.setDisplaySize(TILE, TILE);
        iceSensor.setAlpha(0);
        iceSensor.refreshBody();
        scene.staticTilesByCell.set(`${tile.x},${tile.y}`, img);
        break;
      }

      case 'falling_land': {
        const texKey = scene.textures.exists('tile_texture_falling_land') ? 'tile_texture_falling_land' : textureKey;
        const land = scene.fallingLandGroup.create(cx, cy, texKey) as Phaser.Physics.Arcade.Image;
        land.setDisplaySize(TILE, TILE);
        land.setData('gridX', tile.x);
        land.setData('gridY', tile.y);
        land.setData('originalX', cx);
        land.setData('originalY', cy);
        land.refreshBody();
        land.setData('sourceGroup', scene.fallingLandGroup);
        scene.staticTilesByCell.set(`${tile.x},${tile.y}`, land);
        break;
      }

      case 'moving_box': {
        const box = scene.movingBoxGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        box.setDisplaySize(TILE, TILE);
        box.setImmovable(true);
        box.setData('gridX', tile.x);
        box.setData('gridY', tile.y);
        box.setData('moveDirection', (tile.moveDirection ?? 'right') as MovingDirection);
        scene.movingBoxesByCell.set(`${tile.x},${tile.y}`, box);
        const boxBody = box.body as Phaser.Physics.Arcade.Body;
        boxBody.setAllowGravity(false);
        boxBody.setVelocityX(0);
        break;
      }

      case 'spinning_block': {
        const spinTextureKey = scene.textures.exists('tile_texture_spinning_block')
          ? 'tile_texture_spinning_block'
          : textureKey;
        const block = scene.add.image(cx, cy, spinTextureKey) as Phaser.Physics.Arcade.Image;
        scene.physics.add.existing(block, true);
        block.setDisplaySize(TILE * 1.5, TILE * 1.5); // Visual upsize
        block.setDepth(20); // Make it pop
        block.setData('gridX', tile.x);
        block.setData('gridY', tile.y);
        block.setData('isSpinningCenter', true);

        // Force the collider to stay at the standard tile size
        const body = block.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(TILE, TILE);
        body.updateFromGameObject();

        scene.staticTilesByCell.set(`${tile.x},${tile.y}`, block);
        break;
      }

      case 'lava': {
        const variant = tile.waterVariant === 'flow' ? 'flow' : 'still';
        const lavaTextureKey = variant === 'flow'
          ? 'tile_texture_lava_flow'
          : 'tile_texture_lava_still';
        const lavaAnimKey = variant === 'flow' ? LAVA_FLOW_ANIM_KEY : LAVA_STILL_ANIM_KEY;

        const visibleLava = scene.add
          .sprite(px, py, lavaTextureKey)
          .setOrigin(0, 0)
          .setDepth(WATER_TEXTURE_DEPTH)
          .setDisplaySize(TILE, TILE)
          .setAlpha(1);

        if (scene.anims.exists(lavaAnimKey)) {
          visibleLava.play(lavaAnimKey);
        }

        const lava = scene.lavaGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        lava.setDisplaySize(TILE, TILE);
        lava.setData('gridX', tile.x);
        lava.setAlpha(0);
        lava.refreshBody();
        break;
      }

      case 'laser': {
        const nx = tile.x;
        const ny = tile.y;

        // Omni-sniff: Check all 4 directions for laser neighbors
        const hasLeft  = tileMap[`${nx - 1},${ny}`]?.type === 'laser';
        const hasRight = tileMap[`${nx + 1},${ny}`]?.type === 'laser';
        const hasUp    = tileMap[`${nx},${ny - 1}`]?.type === 'laser';
        const hasDown  = tileMap[`${nx},${ny + 1}`]?.type === 'laser';

        // Infer dominant axis (autodetect if metadata is missing or incorrect)
        let inferredDir = (tile.direction || 'h') as 'h' | 'v';
        if ((hasUp || hasDown) && !hasLeft && !hasRight) {
          inferredDir = 'v';
        } else if ((hasLeft || hasRight) && !hasUp && !hasDown) {
          inferredDir = 'h';
        }

        // Segments detection based on our inferred axis
        const hasPrev = inferredDir === 'h' ? hasLeft : hasUp;
        const hasNext = inferredDir === 'h' ? hasRight : hasDown;
        
        // Selection logic
        let laserKey = 'laser_single';
        let laserAngle = 0;

        if (hasPrev && hasNext) {
          laserKey = 'laser_mid';
        } else if (!hasPrev && hasNext) {
          laserKey = 'laser_side';
          laserAngle = 0;
        } else if (hasPrev && !hasNext) {
          laserKey = 'laser_side';
          laserAngle = 180;
        }

        // Apply global direction alignment (textures are horizontal by default)
        if (inferredDir === 'v') {
          laserAngle += 90;
        }

        const visibleHazard = scene.add
          .image(cx, cy, laserKey)
          .setRotation(Phaser.Math.DegToRad(laserAngle))
          .setDisplaySize(TILE, TILE)
          .setOrigin(0.5, 0.5)
          .setDepth(HAZARD_TEXTURE_DEPTH);

        const haz = scene.hazardGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        haz.setDisplaySize(TILE, TILE);
        haz.setData('hazardType', tile.type);
        haz.setData('tileX', tile.x);
        haz.setData('tileY', tile.y);
        haz.setData('visibleHazard', visibleHazard);
        haz.setAlpha(0);
        haz.refreshBody();

        // Shrink collider to 50% and center it AFTER refreshBody
        const body = haz.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(TILE / 2, TILE / 2);
        body.setOffset(TILE / 4, TILE / 4);
        break;
      }

      case 'boombox': {
        scene.boomboxSpawnCells.add(`${tile.x},${tile.y}`);
        const haz = scene.spawnBoomboxHazard(tile.x, tile.y);
        if (haz) {
          haz.sensor.setData('gridX', tile.x);
          haz.sensor.setData('gridY', tile.y);
          haz.sensor.setData('sourceGroup', scene.hazardGroup);
          haz.sensor.setData('visualMirror', haz.visible);
          scene.staticTilesByCell.set(`${tile.x},${tile.y}`, haz.sensor);
        }
        break;
      }

      case 'water': {
        const variant = tile.waterVariant === 'flow' ? 'flow' : 'still';
        const waterTextureKey = variant === 'flow'
          ? 'tile_texture_water_flow'
          : 'tile_texture_water_still';
        const waterAnimKey = variant === 'flow' ? WATER_FLOW_ANIM_KEY : WATER_STILL_ANIM_KEY;
        const lethalWater = variant === 'still';

        scene.add
          .rectangle(px + TILE / 2, py + TILE / 2, TILE, TILE, WATER_OVERLAY_FILL, 0.7)
          .setDepth(WATER_OVERLAY_DEPTH);

        const visibleWater = scene.add
          .sprite(px, py, waterTextureKey)
          .setOrigin(0, 0)
          .setDepth(WATER_TEXTURE_DEPTH)
          .setDisplaySize(TILE, TILE)
          .setAlpha(WATER_TEXTURE_ALPHA);

        if (scene.anims.exists(waterAnimKey)) {
          visibleWater.play(waterAnimKey);
        }

        const water = scene.waterGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        water.setDisplaySize(TILE, TILE);
        water.setData('gridX', tile.x);
        water.setData('lethal', lethalWater);
        water.setAlpha(0);
        water.refreshBody();
        break;
      }

      case 'portal': {
        scene.add.image(px, py, textureKey).setOrigin(0, 0);
        const portal = scene.portalGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        portal.setDisplaySize(TILE, TILE);
        portal.setData('linkedPortalId', tile.linkedPortalId ?? '');
        portal.setData('portalX', cx);
        portal.setData('portalY', cy);
        portal.setAlpha(0);
        portal.refreshBody();
        break;
      }

      case 'flag_checkpoint': {
        scene.add.image(px, py, textureKey).setOrigin(0, 0);
        scene.add.text(cx, cy, 'C', {
          fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
        }).setOrigin(0.5, 0.5);
        const cp = scene.checkpointGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        cp.setDisplaySize(TILE, TILE);
        cp.setData('spawnX', cx);
        cp.setData('spawnY', cy - TILE / 2 - PLAYER_H / 2);
        cp.setAlpha(0);
        cp.refreshBody();
        break;
      }

      case 'flag_finish': {
        scene.add.image(px, py, textureKey).setOrigin(0, 0);
        scene.add.text(cx, cy, 'F', {
          fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
        }).setOrigin(0.5, 0.5);
        const fin = scene.finishGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
        fin.setDisplaySize(TILE, TILE);
        fin.setAlpha(0);
        fin.refreshBody();
        break;
      }

      case 'flag_start': {
        scene.flagStartFound = true;
        scene.add.image(px, py, textureKey).setOrigin(0, 0);
        scene.add.text(cx, cy, 'S', {
          fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
        }).setOrigin(0.5, 0.5);
        scene.spawnX = cx;
        scene.spawnY = py - PLAYER_H / 2;
        break;
      }

      default:
        break;
    }
  }
}

// Import PLAYER_H for flag_start / flag_checkpoint placement
import { PLAYER_H } from '../constants';

function drawTileGfx(
  gfx: Phaser.GameObjects.Graphics,
  type: string,
  color: string,
  gloss: string,
) {
  const c = Phaser.Display.Color.HexStringToColor(color).color;
  const g = Phaser.Display.Color.HexStringToColor(gloss).color;

  gfx.fillStyle(c, 1);
  gfx.fillRect(0, 0, TILE, TILE);
  gfx.fillStyle(g, 0.35);
  gfx.fillRect(0, 0, TILE, 4);
  gfx.fillStyle(0x000000, 0.25);
  gfx.fillRect(0, TILE - 3, TILE, 3);
  gfx.lineStyle(1, 0x000000, 0.3);
  gfx.strokeRect(0, 0, TILE, TILE);

  if (type === 'water' || type === 'lava') {
    gfx.lineStyle(1, 0xffffff, 0.12);
    for (let i = -TILE; i < TILE * 2; i += 8) {
      gfx.lineBetween(i, 0, i + TILE, TILE);
    }
  }
  if (type === 'portal') {
    gfx.lineStyle(2, 0xffffff, 0.5);
    gfx.strokeCircle(TILE / 2, TILE / 2, TILE / 2 - 4);
  }
  if (type === 'laser') {
    gfx.lineStyle(2, 0xff4466, 0.8);
    gfx.lineBetween(0, TILE / 2, TILE, TILE / 2);
  }
}
