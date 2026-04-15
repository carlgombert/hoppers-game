/**
 * AssetLoader — handles all Phaser asset preloading for the game scene.
 */
import * as Phaser from 'phaser';
import { WATER_FRAME_SIZE } from '../constants';
import type { AssetUrls } from '../types';

/**
 * Load all game assets (characters, tile textures, spritesheets, backdrops)
 * from URLs stored in the Phaser registry.
 */
export function preloadAssets(scene: Phaser.Scene): void {
  const urls = scene.registry.get('assetUrls') as AssetUrls | null;
  const backdropUrls = scene.registry.get('backdropAssetUrls') as Record<string, string> | null;

  if (urls) {
    // Load each available character skin so remote players can use their own sprite.
    if (urls.characters) {
      Object.entries(urls.characters).forEach(([key, config]) => {
        scene.load.image(`character_${key}_still`, config.still);
        if (config.ladder) {
          config.ladder.forEach((url, i) => {
            scene.load.image(`character_${key}_ladder_${i + 1}`, url);
          });
        }
        if (config.jump) {
          scene.load.image(`character_${key}_jump`, config.jump);
        }
        if (config.run) {
          config.run.forEach((url, i) => {
            scene.load.image(`character_${key}_run_${i + 1}`, url);
          });
        }
      });
    }
    if (urls.character) scene.load.image('character', urls.character);
    if (urls.land) scene.load.image('tile_texture_land', urls.land);
    if (urls.grass) scene.load.image('tile_texture_grass', urls.grass);
    if (urls.demon_grass) scene.load.image('tile_texture_demon_grass', urls.demon_grass);
    if (urls.ladder) scene.load.image('tile_texture_ladder', urls.ladder);
    if (urls.moving_box) scene.load.image('tile_texture_moving_box', urls.moving_box);
    scene.load.image('tile_texture_spinning_block', '/spinning_block.png');
    if (urls.boombox) scene.load.image('tile_texture_boombox', urls.boombox);
    if (urls.falling_land) scene.load.image('tile_texture_falling_land', urls.falling_land);
    if (urls.explosion) scene.load.image('tile_texture_explosion', urls.explosion);
    if (urls.glue) scene.load.image('glue', urls.glue);
    if (urls.water_flow) {
      scene.load.spritesheet('tile_texture_water_flow', urls.water_flow, {
        frameWidth: WATER_FRAME_SIZE,
        frameHeight: WATER_FRAME_SIZE,
      });
    }
    if (urls.water_still) {
      scene.load.spritesheet('tile_texture_water_still', urls.water_still, {
        frameWidth: WATER_FRAME_SIZE,
        frameHeight: WATER_FRAME_SIZE,
      });
    }
    if (urls.lava_flow) {
      scene.load.spritesheet('tile_texture_lava_flow', urls.lava_flow, {
        frameWidth: WATER_FRAME_SIZE,
        frameHeight: WATER_FRAME_SIZE,
      });
    }
    if (urls.lava_still) {
      scene.load.spritesheet('tile_texture_lava_still', urls.lava_still, {
        frameWidth: WATER_FRAME_SIZE,
        frameHeight: WATER_FRAME_SIZE,
      });
    }
    if (urls.laser_single) scene.load.image('laser_single', urls.laser_single);
    if (urls.laser_mid) scene.load.image('laser_mid', urls.laser_mid);
    if (urls.laser_side) scene.load.image('laser_side', urls.laser_side);
  }
  if (backdropUrls) {
    Object.entries(backdropUrls).forEach(([id, url]) => {
      scene.load.image(`backdrop_${id}`, url);
    });
  }
}
