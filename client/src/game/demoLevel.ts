import { type Tile } from '../types/level';

/**
 * A built-in demo level that showcases every tile type.
 *
 * Grid coordinates — each unit = 40 px.  y increases downward.
 *
 * Layout overview (floor at y=18):
 *   Start → Ladder → Grass → Ice (slide!) → Moving-box dodge → Checkpoint →
 *   Portal shortcut → Upper platform → Checkpoint → Falling land →
 *   Demon-grass sprint → Finish
 *
 * Floor hazards (boombox/laser at y=17, lava/water at y=18) punish falls
 * and encourage players to stay on the upper route.
 */
export const DEMO_LEVEL_TILES: Tile[] = [

  // ── FLAG: player spawn ───────────────────────────────────────────────────
  { type: 'flag_start', x: 1, y: 17 },

  // ── FLOOR SECTION 1 (starting area) ─────────────────────────────────────
  { type: 'land', x: 0, y: 18 },
  { type: 'land', x: 1, y: 18 },
  { type: 'land', x: 2, y: 18 },
  { type: 'land', x: 3, y: 18 },
  { type: 'land', x: 4, y: 18 },
  { type: 'land', x: 5, y: 18 },

  // ── LAVA GAP ─────────────────────────────────────────────────────────────
  { type: 'lava', x: 6, y: 18 },
  { type: 'lava', x: 7, y: 18 },

  // ── FLOOR SECTION 2 ──────────────────────────────────────────────────────
  { type: 'land', x: 8, y: 18 },
  { type: 'land', x: 9, y: 18 },
  { type: 'land', x: 10, y: 18 },
  { type: 'land', x: 11, y: 18 },
  { type: 'land', x: 12, y: 18 },
  { type: 'land', x: 13, y: 18 },

  // ── WATER GAP ─────────────────────────────────────────────────────────────
  { type: 'water', x: 14, y: 18 },
  { type: 'water', x: 15, y: 18 },

  // ── FLOOR SECTION 3 ──────────────────────────────────────────────────────
  { type: 'land', x: 16, y: 18 },
  { type: 'land', x: 17, y: 18 },
  { type: 'land', x: 18, y: 18 },
  { type: 'land', x: 19, y: 18 },
  { type: 'land', x: 20, y: 18 },
  { type: 'land', x: 21, y: 18 },

  // ── BOOMBOX WALL (player must jump over it) ───────────────────────────────
  { type: 'boombox', x: 22, y: 17 },
  { type: 'land',    x: 22, y: 18 },

  // ── FLOOR SECTION 4 ──────────────────────────────────────────────────────
  { type: 'land', x: 23, y: 18 },
  { type: 'land', x: 24, y: 18 },
  { type: 'land', x: 25, y: 18 },
  { type: 'land', x: 26, y: 18 },
  { type: 'land', x: 27, y: 18 },

  // ── LASER WALL (player must jump over it) ────────────────────────────────
  { type: 'laser', x: 28, y: 17 },
  { type: 'land',  x: 28, y: 18 },

  // ── FLOOR SECTION 5 ──────────────────────────────────────────────────────
  { type: 'land', x: 29, y: 18 },
  { type: 'land', x: 30, y: 18 },
  { type: 'land', x: 31, y: 18 },
  { type: 'land', x: 32, y: 18 },
  { type: 'land', x: 33, y: 18 },
  { type: 'land', x: 34, y: 18 },
  { type: 'land', x: 35, y: 18 },
  { type: 'land', x: 36, y: 18 },
  { type: 'land', x: 37, y: 18 },
  { type: 'land', x: 38, y: 18 },
  { type: 'land', x: 39, y: 18 },

  // ── LADDER (climbs from floor up to grass platform) ──────────────────────
  { type: 'ladder', x: 4, y: 14 },
  { type: 'ladder', x: 4, y: 15 },
  { type: 'ladder', x: 4, y: 16 },
  { type: 'ladder', x: 4, y: 17 },

  // ── GRASS PLATFORM ───────────────────────────────────────────────────────
  { type: 'grass', x: 4,  y: 13 },
  { type: 'grass', x: 5,  y: 13 },
  { type: 'grass', x: 6,  y: 13 },
  { type: 'grass', x: 7,  y: 13 },
  { type: 'grass', x: 8,  y: 13 },
  { type: 'grass', x: 9,  y: 13 },
  { type: 'grass', x: 10, y: 13 },
  { type: 'grass', x: 11, y: 13 },

  // ── MOVING BOX (patrols on grass; player must time jumps) ────────────────
  { type: 'moving_box', x: 8, y: 12 },

  // ── CHECKPOINT 1 ─────────────────────────────────────────────────────────
  { type: 'flag_checkpoint', x: 11, y: 12 },

  // ── ICE PLATFORM (slides the player right!) ──────────────────────────────
  { type: 'ice', x: 12, y: 13 },
  { type: 'ice', x: 13, y: 13 },
  { type: 'ice', x: 14, y: 13 },
  { type: 'ice', x: 15, y: 13 },

  // ── LAND CONTINUATION (brakes the ice slide) ─────────────────────────────
  { type: 'land', x: 16, y: 13 },
  { type: 'land', x: 17, y: 13 },
  { type: 'land', x: 18, y: 13 },
  { type: 'land', x: 19, y: 13 },
  { type: 'land', x: 20, y: 13 },

  // ── PORTAL A (walk into it to teleport to upper platform) ────────────────
  // Placed at y=12 so it is at the player's centre-height when on y=13 floor.
  { type: 'portal', x: 20, y: 12, linkedPortalId: 'gate1' },

  // ── UPPER PLATFORM (portal destination) ──────────────────────────────────
  { type: 'land', x: 23, y: 11 },
  { type: 'land', x: 24, y: 11 },
  { type: 'land', x: 25, y: 11 },
  { type: 'land', x: 26, y: 11 },
  { type: 'land', x: 27, y: 11 },
  { type: 'land', x: 28, y: 11 },
  { type: 'land', x: 29, y: 11 },
  { type: 'land', x: 30, y: 11 },
  { type: 'land', x: 31, y: 11 },
  { type: 'land', x: 32, y: 11 },

  // ── PORTAL B (arrival point; at y=10 so it triggers when on y=11 floor) ──
  { type: 'portal', x: 25, y: 10, linkedPortalId: 'gate1' },

  // ── CHECKPOINT 2 ─────────────────────────────────────────────────────────
  { type: 'flag_checkpoint', x: 29, y: 10 },

  // ── FALLING LAND (crumbles underfoot — jump to demon-grass quickly!) ──────
  { type: 'falling_land', x: 33, y: 11 },
  { type: 'falling_land', x: 34, y: 11 },
  { type: 'falling_land', x: 35, y: 11 },

  // ── DEMON-GRASS PLATFORM (highest level, final sprint) ───────────────────
  { type: 'demon_grass', x: 33, y: 8 },
  { type: 'demon_grass', x: 34, y: 8 },
  { type: 'demon_grass', x: 35, y: 8 },
  { type: 'demon_grass', x: 36, y: 8 },
  { type: 'demon_grass', x: 37, y: 8 },
  { type: 'demon_grass', x: 38, y: 8 },
  { type: 'demon_grass', x: 39, y: 8 },

  // ── CHECKPOINT 3 (final safety net) ──────────────────────────────────────
  { type: 'flag_checkpoint', x: 36, y: 7 },

  // ── FINISH FLAG ───────────────────────────────────────────────────────────
  { type: 'flag_finish', x: 39, y: 7 },
];
