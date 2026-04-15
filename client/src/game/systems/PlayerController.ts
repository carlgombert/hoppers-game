/**
 * PlayerController — player sprite creation, input handling, movement,
 * animation state machine, death and respawn.
 */
import * as Phaser from 'phaser';
import {
  TILE,
  PLAYER_W_GROUNDED,
  PLAYER_W_AIRBORNE,
  PLAYER_H,
  PLAYER_SPRITE_SIZE,
  LADDER_SPRITE_SIZE,
  PLAYER_SPEED,
  PLAYER_ACCEL,
  PLAYER_DRAG,
  JUMP_VELOCITY,
  ICE_DRAG,
  ICE_ACCEL,
  CLIMB_ANIM_KEY,
  RUN_ANIM_KEY,
  CHARACTER_SPRITE_DEPTH,
  CHARACTER_NAMEPLATE_DEPTH,
  NICK_RENDER_Y_OFFSET,
  CHARACTER_RENDER_Y_OFFSET,
} from '../constants';
import type { AssetUrls } from '../types';
import type { MainScene } from '../scenes/MainScene';

export function getCharacterRenderYOffset(characterKey: string | null | undefined): number {
  return characterKey === 'nick' ? NICK_RENDER_Y_OFFSET : CHARACTER_RENDER_Y_OFFSET;
}

/**
 * Create the main player sprite, collider, and animations.
 */
export function createPlayer(scene: MainScene): void {
  const savedCheckpoint: { x: number; y: number } | null = scene.registry.get('savedCheckpoint') ?? null;

  scene.selectedCharacterKey = (scene.registry.get('characterKey') as string | null) ?? 'sora';
  const preferredPlayerTexture = `character_${scene.selectedCharacterKey}_still`;
  const playerTexKey = scene.textures.exists(preferredPlayerTexture)
    ? preferredPlayerTexture
    : scene.textures.exists('character')
      ? 'character'
      : 'player';

  if (playerTexKey === 'player' && !scene.textures.exists('player')) {
    const gfx = scene.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(0x4db8ff, 1);
    gfx.fillRoundedRect(0, 0, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, 8);
    gfx.fillStyle(0x7ab8f5, 1);
    gfx.fillCircle(PLAYER_SPRITE_SIZE / 2, 14, 10);
    gfx.generateTexture('player', PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    gfx.destroy();
  }

  if (!scene.textures.exists('ghost')) {
    const gg = scene.make.graphics({ x: 0, y: 0 });
    gg.fillStyle(0xb9add6, 1);
    gg.fillRoundedRect(0, 0, PLAYER_W_GROUNDED, PLAYER_H, 4);
    gg.fillStyle(0xd4c8f0, 1);
    gg.fillCircle(PLAYER_W_GROUNDED / 2, 8, 7);
    gg.generateTexture('ghost', PLAYER_W_GROUNDED, PLAYER_H);
    gg.destroy();
  }

  const startX = savedCheckpoint?.x ?? scene.spawnX;
  const startY = savedCheckpoint?.y ?? scene.spawnY;
  if (savedCheckpoint) {
    scene.checkpointX = savedCheckpoint.x;
    scene.checkpointY = savedCheckpoint.y;
  }

  scene.player = scene.physics.add.sprite(startX, startY, playerTexKey);
  // Anchor at the bottom center to prevent scaling from affecting ground contact
  scene.player.setOrigin(0.5, 1.0);
  scene.player.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
  scene.player.setDepth(CHARACTER_SPRITE_DEPTH);

  // Create climbing animation for current character
  const urls = scene.registry.get('assetUrls') as AssetUrls | null;
  const charConfig = urls?.characters?.[scene.selectedCharacterKey];
  if (charConfig?.ladder) {
    const frames = charConfig.ladder.map((_: string, i: number) => ({
      key: `character_${scene.selectedCharacterKey}_ladder_${i + 1}`,
    }));
    scene.anims.create({
      key: CLIMB_ANIM_KEY,
      frames,
      frameRate: 6,
      repeat: -1,
    });
  }

  if (charConfig?.run) {
    const frames = charConfig.run.map((_: string, i: number) => ({
      key: `character_${scene.selectedCharacterKey}_run_${i + 1}`,
    }));
    scene.anims.create({
      key: RUN_ANIM_KEY,
      frames,
      frameRate: 10,
      repeat: -1,
    });
  }

  scene.player.setBounce(0);
  const playerBody = scene.player.body as Phaser.Physics.Arcade.Body;
  setPlayerColliderWidth(scene, PLAYER_W_GROUNDED);
  playerBody.setOffset((PLAYER_SPRITE_SIZE - PLAYER_W_GROUNDED) / 2, PLAYER_SPRITE_SIZE - PLAYER_H);
  playerBody.setMaxVelocityX(PLAYER_SPEED);
  playerBody.setMaxVelocityY(800); // prevent tunnelling through platform tiles

  // Create nameplate for multiplayer
  if (scene.socket && scene.partyCode) {
    const localDisplayName = (scene.registry.get('localDisplayName') as string | null) ?? 'You';
    scene.playerNameplate = scene.add
      .text(scene.player.x, scene.player.y - PLAYER_SPRITE_SIZE / 2 - 8, localDisplayName, {
        fontFamily: 'Tahoma, Arial',
        fontSize: '10px',
        color: '#f3f7ff',
        backgroundColor: '#1b5c2e',
        padding: { left: 4, right: 4, top: 1, bottom: 1 },
      })
      .setOrigin(0.5, 1)
      .setDepth(CHARACTER_NAMEPLATE_DEPTH);
  } else {
    scene.playerNameplate = null;
  }
}

/**
 * Set up input keys.
 */
export function createInput(scene: MainScene): void {
  scene.cursors = scene.input.keyboard!.createCursorKeys();
  scene.wasd = {
    up: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    left: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
    right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
  };
}

/**
 * Per-frame player input and movement update.
 */
export function updatePlayerInput(scene: MainScene): void {
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  const onGround = body.blocked.down;

  scene.isOnIce = false;
  if (onGround) {
    scene.iceGroup.getChildren().forEach((child) => {
      const iceImg = child as Phaser.Physics.Arcade.Image;
      const iceBody = iceImg.body as Phaser.Physics.Arcade.StaticBody;
      const playerLeft = body.x;
      const playerRight = body.x + body.width;
      const iceLeft = iceBody.x;
      const iceRight = iceBody.x + iceBody.width;
      const iceTop = iceBody.y;
      const playerBottom = body.y + body.height;
      if (
        playerRight > iceLeft &&
        playerLeft < iceRight &&
        Math.abs(playerBottom - iceTop) < 4
      ) {
        scene.isOnIce = true;
      }
    });
  }

  scene.onLadder = false;
  scene.climbingUnitVelocity = { x: 0, y: 0 };

  const checkLadderOverlap = (child: Phaser.GameObjects.GameObject) => {
    const ladderImg = child as Phaser.Physics.Arcade.Image;
    const lb = ladderImg.body as Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody;
    if (!lb) return false;

    const playerCenterX = body.x + body.width / 2;
    const isOverlapping = (
      playerCenterX > lb.x &&
      playerCenterX < lb.right &&
      body.y + body.height > lb.y &&
      body.y < lb.bottom
    );

    if (isOverlapping) {
      scene.onLadder = true;
      if (lb instanceof Phaser.Physics.Arcade.Body) {
        scene.climbingUnitVelocity = { x: lb.velocity.x, y: lb.velocity.y };
      }
      return true;
    }
    return false;
  };

  scene.ladderGroup.getChildren().some(checkLadderOverlap);

  if (!scene.onLadder) {
    scene.movingBoxGroup.getChildren().some((child) => {
      const box = child as Phaser.Physics.Arcade.Image;
      if (box.getData('ladder')) {
        return checkLadderOverlap(box);
      }
      return false;
    });
  }

  // Keep normal width on ground/ladder and narrow only while truly airborne.
  const shouldBeAirborneWidth = !onGround && !scene.onLadder;
  if (shouldBeAirborneWidth) {
    setPlayerColliderWidth(scene, PLAYER_W_AIRBORNE);
  } else if (scene.currentPlayerColliderW !== PLAYER_W_GROUNDED && canUseGroundedColliderWidth(scene)) {
    setPlayerColliderWidth(scene, PLAYER_W_GROUNDED);
  }

  const goLeft = scene.cursors.left.isDown || scene.wasd.left.isDown;
  const goRight = scene.cursors.right.isDown || scene.wasd.right.isDown;
  const goUp = scene.cursors.up.isDown || scene.wasd.up.isDown;
  const jump = Phaser.Input.Keyboard.JustDown(scene.cursors.up) ||
    Phaser.Input.Keyboard.JustDown(scene.cursors.space) ||
    Phaser.Input.Keyboard.JustDown(scene.wasd.up);

  const accel = scene.isOnIce ? ICE_ACCEL : PLAYER_ACCEL;
  const drag = scene.isOnIce ? ICE_DRAG : PLAYER_DRAG;

  if (scene.onLadder) {
    body.setAllowGravity(false);
    body.setAccelerationX(0);
    body.setDragX(drag);

    if (goUp) {
      body.setVelocityY(-180 + scene.climbingUnitVelocity.y);
    } else if (scene.cursors.down.isDown) {
      body.setVelocityY(180 + scene.climbingUnitVelocity.y);
    } else {
      body.setVelocityY(scene.climbingUnitVelocity.y);
    }

    if (scene.anims.exists(CLIMB_ANIM_KEY)) {
      let ladderWidth = LADDER_SPRITE_SIZE;
      let ladderHeight = LADDER_SPRITE_SIZE;
      if (scene.selectedCharacterKey === 'sora') {
        ladderWidth = 70;
        ladderHeight = 70;
      }
      scene.player.setDisplaySize(ladderWidth, ladderHeight);
      if (body.velocity.y !== 0) {
        scene.player.play(CLIMB_ANIM_KEY, true);
      } else {
        // Ensure we are in a ladder frame even if not moving
        if (!scene.player.anims.isPlaying || scene.player.anims.currentAnim?.key !== CLIMB_ANIM_KEY) {
          scene.player.play(CLIMB_ANIM_KEY);
        }
        scene.player.stop();
      }
    }

    if (goLeft) {
      body.setVelocityX(-PLAYER_SPEED + scene.climbingUnitVelocity.x);
    } else if (goRight) {
      body.setVelocityX(PLAYER_SPEED + scene.climbingUnitVelocity.x);
    } else {
      body.setVelocityX(scene.climbingUnitVelocity.x);
    }
  } else {
    body.setAllowGravity(true);

    if (goLeft) {
      body.setAccelerationX(-accel);
    } else if (goRight) {
      body.setAccelerationX(accel);
    } else {
      body.setAccelerationX(0);
      body.setDragX(drag);
    }

    if (Math.abs(body.velocity.x) > PLAYER_SPEED) {
      body.setVelocityX(Math.sign(body.velocity.x) * PLAYER_SPEED);
    }

    if (jump && onGround) {
      body.setVelocityY(JUMP_VELOCITY);
    }
  }

  if (goLeft) scene.player.setFlipX(false);
  if (goRight) scene.player.setFlipX(true);

  if (!scene.onLadder) {
    if (scene.player.anims.isPlaying && scene.player.anims.currentAnim?.key === CLIMB_ANIM_KEY) {
      scene.player.stop();
    }

    let targetTex = `character_${scene.selectedCharacterKey}_still`;
    let playingRun = false;
    let displaySize = PLAYER_SPRITE_SIZE;

    if (!onGround) {
      const jumpTex = `character_${scene.selectedCharacterKey}_jump`;
      if (scene.textures.exists(jumpTex)) {
        targetTex = jumpTex;
        if (scene.selectedCharacterKey === 'sora') {
          displaySize = 66;
        }
      }
    } else if (Math.abs(body.velocity.x) > 10) {
      if (scene.anims.exists(RUN_ANIM_KEY)) {
        scene.player.play(RUN_ANIM_KEY, true);
        playingRun = true;
      }
    }

    if (!playingRun) {
      if (scene.player.anims.isPlaying && scene.player.anims.currentAnim?.key === RUN_ANIM_KEY) {
        scene.player.stop();
      }
      if (scene.player.texture.key !== targetTex) {
        scene.player.setTexture(targetTex);
      }
    }

    scene.player.setDisplaySize(displaySize, displaySize);

    // Re-anchor collider offset after display size change
    const xOff = (PLAYER_SPRITE_SIZE - scene.currentPlayerColliderW) / 2;
    const yOff = PLAYER_SPRITE_SIZE - PLAYER_H;
    body.setOffset(xOff, yOff);
  }

  if (scene.player.y > scene.killPlaneY) {
    killPlayer(scene);
  }

  if (scene.playerNameplate) {
    scene.playerNameplate.setPosition(
      scene.player.x,
      scene.player.y - PLAYER_SPRITE_SIZE - 4,
    );
  }
}

/**
 * Set the player's physics collider width.
 */
export function setPlayerColliderWidth(scene: MainScene, w: number): void {
  if (scene.currentPlayerColliderW === w) return;
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  const xOffset = (PLAYER_SPRITE_SIZE - w) / 2;
  const yOffset = PLAYER_SPRITE_SIZE - PLAYER_H;
  body.setSize(w, PLAYER_H, false);
  body.setOffset(xOffset, yOffset);
  scene.currentPlayerColliderW = w;
}

/**
 * Check whether expanding back to grounded collider width is safe (no overlaps).
 */
function canUseGroundedColliderWidth(scene: MainScene): boolean {
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  const left = scene.player.x - PLAYER_W_GROUNDED / 2;
  const right = scene.player.x + PLAYER_W_GROUNDED / 2;
  const top = body.y;
  const bottom = body.y + body.height;

  const intersects = (otherX: number, otherY: number, otherW: number, otherH: number) => {
    const overlapX = Math.min(right, otherX + otherW) - Math.max(left, otherX);
    const overlapY = Math.min(bottom, otherY + otherH) - Math.max(top, otherY);
    return overlapX > 1 && overlapY > 1;
  };

  const collidesStaticGroup = (group: Phaser.Physics.Arcade.StaticGroup) => {
    for (const child of group.getChildren()) {
      const img = child as Phaser.Physics.Arcade.Image;
      const staticBody = img.body as Phaser.Physics.Arcade.StaticBody | undefined;
      if (!img.active || !img.visible || !staticBody || staticBody.enable === false) continue;
      if (intersects(staticBody.x, staticBody.y, staticBody.width, staticBody.height)) {
        return true;
      }
    }
    return false;
  };

  const collidesDynamicGroup = (group: Phaser.Physics.Arcade.Group) => {
    for (const child of group.getChildren()) {
      const img = child as Phaser.Physics.Arcade.Image;
      const dynBody = img.body as Phaser.Physics.Arcade.Body | undefined;
      if (!img.active || !img.visible || !dynBody || !dynBody.enable) continue;
      if (intersects(dynBody.x, dynBody.y, dynBody.width, dynBody.height)) {
        return true;
      }
    }
    return false;
  };

  return !collidesStaticGroup(scene.platforms)
    && !collidesStaticGroup(scene.fallingLandGroup)
    && !collidesDynamicGroup(scene.movingBoxGroup);
}

/**
 * Kill the player and trigger respawn after a delay.
 */
export function killPlayer(scene: MainScene): void {
  if (scene.isDead || scene.finished) return;
  scene.isDead = true;

  scene.player.setTint(0xff4444);
  scene.player.setVelocity(0, 0);
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  body.setAccelerationX(0);
  body.setMaxVelocityX(0);
  body.setAllowGravity(false);

  scene.time.delayedCall(800, () => {
    respawnPlayer(scene);
  });
}

/**
 * Respawn the player at the last checkpoint or spawn point.
 */
export function respawnPlayer(scene: MainScene): void {
  scene.restoreRespawnHazards();
  scene.restoreAllFallingLand();
  scene.isDead = false;
  const rx = scene.checkpointX ?? scene.spawnX;
  const ry = scene.checkpointY ?? scene.spawnY;
  scene.player.clearTint();
  scene.player.setPosition(rx, ry);
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  body.setAllowGravity(true);
  body.setAccelerationX(0);
  body.setMaxVelocityX(PLAYER_SPEED);
  scene.player.setVelocity(0, 0);
}
