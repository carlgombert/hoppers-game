/**
 * Shared numeric and string constants used across all game systems.
 * Centralised here so every module references the same values.
 */

// ── Grid ───────────────────────────────────────────────────────────────────────
export const TILE = 40;

// ── Player dimensions & physics ────────────────────────────────────────────────
export const PLAYER_W_GROUNDED = 40;
export const PLAYER_W_AIRBORNE = 28;
export const PLAYER_H = 56;
export const PLAYER_SPRITE_SIZE = 64;
export const LADDER_SPRITE_SIZE = 68;
export const PLAYER_SPEED = 200;
export const PLAYER_ACCEL = 900;
export const PLAYER_DRAG = 800;
export const JUMP_VELOCITY = -420;
export const ICE_DRAG = 80;
export const ICE_ACCEL = 400;

// ── Moving boxes ───────────────────────────────────────────────────────────────
export const MOVING_BOX_SPEED = 80;
export const MOVING_BOX_STUCK_FRAMES = 12;
export const MOVING_BOX_PROGRESS_EPSILON = 0.2;
export const MOVING_BOX_REVERSE_COOLDOWN_FRAMES = 8;
export const MOVING_BOX_UNSTICK_NUDGE = 2;

// ── Falling land ───────────────────────────────────────────────────────────────
export const FALL_CRUMBLE_DELAY = 400;

// ── Water / lava visuals ───────────────────────────────────────────────────────
export const WATER_OVERLAY_FILL = 0x2f6fb3;
export const WATER_OVERLAY_DEPTH = 5.5;
export const WATER_TEXTURE_DEPTH = 5.6;
export const WATER_TEXTURE_ALPHA = 0.45;
export const WATER_FRAME_SIZE = 16;
export const WATER_RUNTIME_ROWS = 24;
export const WATER_BACKDROP_IDS = new Set(['mountains', 'city']);

// ── Animation keys ─────────────────────────────────────────────────────────────
export const WATER_FLOW_ANIM_KEY = 'water_flow';
export const WATER_STILL_ANIM_KEY = 'water_still';
export const LAVA_FLOW_ANIM_KEY = 'lava_flow';
export const LAVA_STILL_ANIM_KEY = 'lava_still';
export const CLIMB_ANIM_KEY = 'climb';
export const RUN_ANIM_KEY = 'run';

// ── Portals ────────────────────────────────────────────────────────────────────
export const PORTAL_COOLDOWN_MS = 3000;

// ── Character rendering ────────────────────────────────────────────────────────
export const CHARACTER_RENDER_Y_OFFSET = 3;
export const NICK_RENDER_Y_OFFSET = 4;
export const CHARACTER_SPRITE_DEPTH = 20;
export const CHARACTER_NAMEPLATE_DEPTH = 21;

// ── Hazards / textures ─────────────────────────────────────────────────────────
export const HAZARD_TEXTURE_DEPTH = 7;
