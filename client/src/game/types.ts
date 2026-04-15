/**
 * Shared game-specific types used across multiple system modules.
 */

export type MovingDirection = 'left' | 'right' | 'up' | 'down';

/** URL map passed through the Phaser registry from GameCanvas. */
export interface AssetUrls {
  land?: string;
  grass?: string;
  demon_grass?: string;
  ladder?: string;
  moving_box?: string;
  boombox?: string;
  falling_land?: string;
  explosion?: string;
  water_flow?: string;
  water_still?: string;
  lava_flow?: string;
  lava_still?: string;
  laser_single?: string;
  laser_mid?: string;
  laser_side?: string;
  characters?: Record<string, { still: string; ladder?: string[]; jump?: string; run?: string[] }>;
  character?: string;
  glue?: string;
}
