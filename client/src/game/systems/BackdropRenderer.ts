/**
 * BackdropRenderer — creates and updates the parallax background and
 * decorative water band at the bottom of the world.
 */
import * as Phaser from 'phaser';
import {
  TILE,
  WATER_OVERLAY_FILL,
  WATER_OVERLAY_DEPTH,
  WATER_TEXTURE_DEPTH,
  WATER_TEXTURE_ALPHA,
  WATER_STILL_ANIM_KEY,
  WATER_BACKDROP_IDS,
} from '../constants';
import { DEFAULT_BACKDROP_ID, normalizeBackdropId } from '../backdrops';
import type { Tile } from '../../types/level';

export interface BackdropState {
  repeatingBackdrop: Phaser.GameObjects.TileSprite | null;
  repeatingBackdropTextureKey: string | null;
}

/**
 * Creates the backdrop (either a tiling texture or a gradient fill).
 * Returns state required for the parallax update loop.
 */
export function createBackdrop(
  scene: Phaser.Scene,
  width: number,
  height: number,
): BackdropState {
  const state: BackdropState = {
    repeatingBackdrop: null,
    repeatingBackdropTextureKey: null,
  };

  const backdropId = normalizeBackdropId(scene.registry.get('backdropId') as string | null | undefined);

  if (backdropId !== DEFAULT_BACKDROP_ID && scene.textures.exists(`backdrop_${backdropId}`)) {
    const baseKey = `backdrop_${backdropId}`;
    const mirroredKey = getOrCreateMirroredBackdropTexture(scene, baseKey);
    state.repeatingBackdropTextureKey = mirroredKey;
    state.repeatingBackdrop = scene.add
      .tileSprite(width / 2, height / 2, width, height, mirroredKey)
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(-10);
    return state;
  }

  const worldW = Math.max(width * 4, 2000);
  const worldH = Math.max(height * 2, 1000);
  const bg = scene.add.graphics();
  bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d1e3d, 0x0d1e3d, 1);
  bg.fillRect(0, 0, worldW, worldH);
  bg.setDepth(-10);

  return state;
}

/**
 * Creates a seamless mirrored-pair texture for horizontal tiling.
 */
function getOrCreateMirroredBackdropTexture(scene: Phaser.Scene, baseTextureKey: string): string {
  const mirroredKey = `${baseTextureKey}_mirrored_pair`;
  if (scene.textures.exists(mirroredKey)) {
    return mirroredKey;
  }

  const baseTexture = scene.textures.get(baseTextureKey);
  const src = baseTexture.getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement
    | OffscreenCanvas
    | null;

  const srcW = src ? (src as { width: number }).width : 0;
  const srcH = src ? (src as { height: number }).height : 0;

  if (!src || srcW <= 0 || srcH <= 0) {
    return baseTextureKey;
  }

  const canvasTexture = scene.textures.createCanvas(mirroredKey, srcW * 2, srcH);
  if (!canvasTexture) {
    return baseTextureKey;
  }
  const ctx = canvasTexture.context;

  ctx.clearRect(0, 0, srcW * 2, srcH);
  ctx.drawImage(src as CanvasImageSource, 0, 0, srcW, srcH);

  ctx.save();
  ctx.translate(srcW * 2, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src as CanvasImageSource, 0, 0, srcW, srcH);
  ctx.restore();

  canvasTexture.refresh();
  return mirroredKey;
}

/**
 * Adds a decorative water band at the bottom of the world for applicable backdrops.
 */
export function addBackdropWaterBand(scene: Phaser.Scene, tiles: Tile[]): void {
  const backdropId = normalizeBackdropId(scene.registry.get('backdropId') as string | null | undefined);
  if (!WATER_BACKDROP_IDS.has(backdropId)) return;
  if (tiles.length === 0) return;

  let maxY = 0;
  for (const tile of tiles) {
    if (tile.y > maxY) maxY = tile.y;
  }

  const world = scene.physics.world.bounds;
  const sidePadding = TILE * 24;
  const waterTop = (maxY + 1) * TILE;
  const waterBottom = world.bottom + TILE * 24;
  const waterHeight = Math.max(TILE * 4, waterBottom - waterTop);
  const waterX = world.x - sidePadding;
  const waterW = world.width + sidePadding * 2;

  if (scene.textures.exists('tile_texture_water_still')) {
    const cols = Math.ceil(waterW / TILE);
    const rows = Math.ceil(waterHeight / TILE);
    const startX = waterX + TILE / 2;
    const startY = waterTop + TILE / 2;

    scene.add
      .rectangle(waterX + waterW / 2, waterTop + waterHeight / 2, waterW, waterHeight, WATER_OVERLAY_FILL, 0.7)
      .setDepth(WATER_OVERLAY_DEPTH);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sprite = scene.add
          .sprite(startX + col * TILE, startY + row * TILE, 'tile_texture_water_still')
          .setDisplaySize(TILE, TILE)
          .setAlpha(WATER_TEXTURE_ALPHA)
          .setDepth(WATER_TEXTURE_DEPTH);

        if (scene.anims.exists(WATER_STILL_ANIM_KEY)) {
          sprite.play(WATER_STILL_ANIM_KEY);
        }
      }
    }
    return;
  }

  scene.add
    .rectangle(waterX + waterW / 2, waterTop + waterHeight / 2, waterW, waterHeight, 0x2f6fb3, 0.75)
    .setDepth(-7);

  scene.add
    .rectangle(waterX + waterW / 2, waterTop + 5, waterW, 10, 0x6aa4de, 0.5)
    .setDepth(-6);
}

/**
 * Parallax scroll update — call once per frame.
 */
export function updateBackdropParallax(state: BackdropState, cam: Phaser.Cameras.Scene2D.Camera): void {
  if (state.repeatingBackdrop) {
    state.repeatingBackdrop.tilePositionX = cam.scrollX * 0.2;
    state.repeatingBackdrop.tilePositionY = cam.scrollY * 0.05;
  }
}

/**
 * Clean up mirrored backdrop texture on shutdown.
 */
export function cleanupBackdrop(scene: Phaser.Scene, state: BackdropState): void {
  if (state.repeatingBackdropTextureKey && scene.textures.exists(state.repeatingBackdropTextureKey)) {
    scene.textures.remove(state.repeatingBackdropTextureKey);
    state.repeatingBackdropTextureKey = null;
  }
}
