/**
 * MultiplayerSystem — ghost sprite management, socket listeners,
 * player position broadcasting, and smooth interpolation.
 *
 * Key improvements over the original implementation:
 *  • Smooth lerp interpolation for ghost movement (no teleporting)
 *  • Full animation state mirroring (run, jump, climb, idle, dead)
 *  • Correct character skin per remote player
 *  • Facing direction transmitted so ghosts flip correctly
 *  • Climbing state transmitted for ladder animations
 */
import * as Phaser from 'phaser';
import { type Socket } from 'socket.io-client';
import {
  PLAYER_SPRITE_SIZE,
  CHARACTER_SPRITE_DEPTH,
  CHARACTER_NAMEPLATE_DEPTH,
  CLIMB_ANIM_KEY,
  RUN_ANIM_KEY,
} from '../constants';
import { getCharacterRenderYOffset } from './PlayerController';
import type { MainScene } from '../scenes/MainScene';

// ── Interpolation config ────────────────────────────────────────────────────
/** How aggressively ghosts lerp towards their target (0–1, higher = faster). */
const GHOST_LERP_FACTOR = 0.25;

/** Below this distance (px), snap instead of lerping to avoid quiver. */
const GHOST_SNAP_THRESHOLD = 1;

/** Per-ghost interpolation state stored externally from the Phaser sprite. */
interface GhostState {
  targetX: number;
  targetY: number;
  state: string;
  characterKey: string;
  facingLeft: boolean;
}

/** Map of socket-id → interpolation state for each ghost. */
const ghostStates = new Map<string, GhostState>();

// ── Animation key helpers (per-character) ───────────────────────────────────
function ghostClimbAnimKey(charKey: string) { return `ghost_climb_${charKey}`; }
function ghostRunAnimKey(charKey: string) { return `ghost_run_${charKey}`; }

/**
 * Create per-character ghost animations (run + climb) if textures exist.
 * Called once per character key the first time we encounter it.
 */
function ensureGhostAnims(scene: MainScene, charKey: string): void {
  const climbKey = ghostClimbAnimKey(charKey);
  if (!scene.anims.exists(climbKey)) {
    const ladderFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 1; i <= 4; i++) {
      const tex = `character_${charKey}_ladder_${i}`;
      if (scene.textures.exists(tex)) ladderFrames.push({ key: tex });
    }
    if (ladderFrames.length > 0) {
      scene.anims.create({ key: climbKey, frames: ladderFrames, frameRate: 6, repeat: -1 });
    }
  }

  const runKey = ghostRunAnimKey(charKey);
  if (!scene.anims.exists(runKey)) {
    const runFrames: Phaser.Types.Animations.AnimationFrame[] = [];
    for (let i = 1; i <= 6; i++) {
      const tex = `character_${charKey}_run_${i}`;
      if (scene.textures.exists(tex)) runFrames.push({ key: tex });
    }
    if (runFrames.length > 0) {
      scene.anims.create({ key: runKey, frames: runFrames, frameRate: 10, repeat: -1 });
    }
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Register socket.io listeners for multiplayer ghost updates.
 */
export function registerSocketListeners(scene: MainScene): void {
  if (!scene.socket) return;

  scene.socket.on(
    'player:update',
    (payload: {
      id: string;
      x: number;
      y: number;
      state: string;
      characterKey?: string;
      displayName?: string;
      username?: string;
      facingLeft?: boolean;
    }) => {
      const name = payload.displayName || payload.username;
      updateGhost(
        scene,
        payload.id,
        payload.x,
        payload.y,
        payload.state,
        payload.characterKey,
        name,
        payload.facingLeft ?? false,
      );
    },
  );

  scene.socket.on('player:left', (payload: { id: string }) => {
    removeGhost(scene, payload.id);
  });
}

/**
 * Unregister socket listeners (called on shutdown).
 */
export function unregisterSocketListeners(scene: MainScene): void {
  if (scene.socket) {
    scene.socket.off('player:update');
    scene.socket.off('player:left');
  }
}

/**
 * Emit local player position to the party at ~20 fps.
 * Now includes facing direction and climbing state.
 */
export function emitPlayerPosition(scene: MainScene): void {
  if (!scene.socket || !scene.partyCode) return;

  scene.moveEmitCounter++;
  if (scene.moveEmitCounter >= 3) {
    scene.moveEmitCounter = 0;
    const body = scene.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    let moveState = 'idle';
    if (scene.isDead) {
      moveState = 'dead';
    } else if (scene.onLadder) {
      moveState = 'climbing';
    } else if (!onGround) {
      moveState = 'jumping';
    } else if (Math.abs(body.velocity.x) > 10) {
      moveState = 'running';
    }

    scene.socket.emit('player:move', {
      code: scene.partyCode,
      x: Math.round(scene.player.x),
      y: Math.round(scene.player.y),
      state: moveState,
      facingLeft: scene.player.flipX === false,
    });
  }
}

/**
 * Per-frame interpolation update for all ghost sprites.
 * Call this from MainScene.update() every frame.
 */
export function updateGhostInterpolation(scene: MainScene): void {
  for (const [id, gs] of ghostStates) {
    const ghost = scene.ghostSprites.get(id);
    if (!ghost) { ghostStates.delete(id); continue; }

    const yOffset = getCharacterRenderYOffset(gs.characterKey);
    const targetRenderY = gs.targetY + yOffset;

    const dx = gs.targetX - ghost.x;
    const dy = targetRenderY - ghost.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < GHOST_SNAP_THRESHOLD) {
      ghost.setPosition(gs.targetX, targetRenderY);
    } else {
      ghost.x += dx * GHOST_LERP_FACTOR;
      ghost.y += dy * GHOST_LERP_FACTOR;
    }

    // Update nameplate position
    const nameplate = scene.ghostNameplates.get(id);
    if (nameplate) {
      nameplate.setPosition(ghost.x, ghost.y - PLAYER_SPRITE_SIZE - 4);
    }
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

/**
 * Create or update a ghost sprite for a remote player.
 */
function updateGhost(
  scene: MainScene,
  id: string,
  x: number,
  y: number,
  state: string,
  characterKey?: string,
  displayName?: string,
  facingLeft?: boolean,
) {
  const charKey = characterKey || 'sora';
  const isDead = state === 'dead';

  // ── Ensure ghost sprite exists ──────────────────────────────────────────
  let ghost = scene.ghostSprites.get(id);
  if (!ghost) {
    // Resolve the best available texture for this character
    const stillTex = `character_${charKey}_still`;
    const textureKey = scene.textures.exists(stillTex)
      ? stillTex
      : scene.textures.exists('character_sora_still')
        ? 'character_sora_still'
        : scene.textures.exists('character')
          ? 'character'
          : 'ghost';

    ghost = scene.add.sprite(
      x,
      y + getCharacterRenderYOffset(charKey),
      textureKey,
    );
    ghost.setOrigin(0.5, 1.0);
    ghost.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    ghost.setDepth(CHARACTER_SPRITE_DEPTH);
    scene.ghostSprites.set(id, ghost);

    // Create nameplate
    const nameplate = scene.add
      .text(x, y - PLAYER_SPRITE_SIZE - 4, displayName?.trim() || 'Player', {
        fontFamily: 'Tahoma, Arial',
        fontSize: '10px',
        color: '#f3f7ff',
        backgroundColor: '#22304a',
        padding: { left: 4, right: 4, top: 1, bottom: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(CHARACTER_NAMEPLATE_DEPTH);
    scene.ghostNameplates.set(id, nameplate);

    // Ensure animations are created for this character
    ensureGhostAnims(scene, charKey);
  }

  // ── Store interpolation target ──────────────────────────────────────────
  ghostStates.set(id, {
    targetX: x,
    targetY: y,
    state,
    characterKey: charKey,
    facingLeft: facingLeft ?? false,
  });

  // ── Facing direction ───────────────────────────────────────────────────
  ghost.setFlipX(!facingLeft);

  // ── Death tint ─────────────────────────────────────────────────────────
  if (isDead) {
    ghost.setTint(0xff4444);
    ghost.setAlpha(0.6);
    if (ghost.anims.isPlaying) ghost.stop();
    const stillTex = `character_${charKey}_still`;
    if (scene.textures.exists(stillTex) && ghost.texture.key !== stillTex) {
      ghost.setTexture(stillTex);
    }
    ghost.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    return;
  }

  ghost.clearTint();
  ghost.setAlpha(1);

  // ── Animation state machine ────────────────────────────────────────────
  ensureGhostAnims(scene, charKey);

  if (state === 'climbing') {
    const climbKey = ghostClimbAnimKey(charKey);
    if (scene.anims.exists(climbKey)) {
      if (!ghost.anims.isPlaying || ghost.anims.currentAnim?.key !== climbKey) {
        ghost.play(climbKey, true);
      }
      ghost.setDisplaySize(charKey === 'sora' ? 70 : 68, charKey === 'sora' ? 70 : 68);
    }
  } else if (state === 'running') {
    const runKey = ghostRunAnimKey(charKey);
    if (scene.anims.exists(runKey)) {
      if (!ghost.anims.isPlaying || ghost.anims.currentAnim?.key !== runKey) {
        ghost.play(runKey, true);
      }
    } else {
      // Fallback: show still texture
      const stillTex = `character_${charKey}_still`;
      if (scene.textures.exists(stillTex) && ghost.texture.key !== stillTex) {
        ghost.setTexture(stillTex);
      }
    }
    ghost.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
  } else if (state === 'jumping') {
    if (ghost.anims.isPlaying) ghost.stop();
    const jumpTex = `character_${charKey}_jump`;
    const targetTex = scene.textures.exists(jumpTex) ? jumpTex : `character_${charKey}_still`;
    if (scene.textures.exists(targetTex) && ghost.texture.key !== targetTex) {
      ghost.setTexture(targetTex);
    }
    ghost.setDisplaySize(charKey === 'sora' ? 66 : PLAYER_SPRITE_SIZE, charKey === 'sora' ? 66 : PLAYER_SPRITE_SIZE);
  } else {
    // idle
    if (ghost.anims.isPlaying) ghost.stop();
    const stillTex = `character_${charKey}_still`;
    if (scene.textures.exists(stillTex) && ghost.texture.key !== stillTex) {
      ghost.setTexture(stillTex);
    }
    ghost.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
  }

  // ── Nameplate text update ─────────────────────────────────────────────
  const nameplate = scene.ghostNameplates.get(id);
  if (nameplate && displayName && displayName.trim().length > 0 && nameplate.text !== displayName) {
    nameplate.setText(displayName);
  }
}

/**
 * Remove a ghost sprite when a remote player disconnects.
 */
function removeGhost(scene: MainScene, id: string) {
  const ghost = scene.ghostSprites.get(id);
  if (ghost) {
    ghost.destroy();
    scene.ghostSprites.delete(id);
  }
  const nameplate = scene.ghostNameplates.get(id);
  if (nameplate) {
    nameplate.destroy();
    scene.ghostNameplates.delete(id);
  }
  ghostStates.delete(id);
}

/**
 * Destroy all ghost sprites and nameplates (called on shutdown).
 */
export function cleanupGhosts(scene: MainScene): void {
  scene.ghostSprites.forEach((g) => g.destroy());
  scene.ghostSprites.clear();
  scene.ghostNameplates.forEach((t) => t.destroy());
  scene.ghostNameplates.clear();
  ghostStates.clear();
  if (scene.playerNameplate) {
    scene.playerNameplate.destroy();
    scene.playerNameplate = null;
  }
}
