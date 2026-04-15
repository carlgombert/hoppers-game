/**
 * UIOverlay — timer, HUD text, debug toggles, error screens,
 * checkpoint activation, and finish overlay.
 */
import * as Phaser from 'phaser';
import { PLAYER_SPRITE_SIZE } from '../constants';
import type { MainScene } from '../scenes/MainScene';

/**
 * Create the HUD instruction text.
 */
export function createHUD(scene: MainScene, width: number): void {
  scene.add
    .text(width / 2, 16, 'Arrow keys or WASD  |  Space to jump', {
      fontFamily: 'Tahoma, Arial',
      fontSize: '11px',
      color: '#7ab8f5',
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0);
}

/**
 * Create the timer text.
 */
export function createTimer(scene: MainScene, width: number): void {
  scene.timerText = scene.add
    .text(width - 12, 16, '0:00', {
      fontFamily: 'Tahoma, Arial',
      fontSize: '20px',
      color: '#e0e8ff',
    })
    .setOrigin(1, 0)
    .setScrollFactor(0)
    .setDepth(15);
}

/**
 * Update the timer text each frame.
 */
export function updateTimer(scene: MainScene): void {
  if (!scene.finished && scene.timerText) {
    const elapsed = performance.now() - scene.startTime;
    const totalSec = Math.floor(elapsed / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    scene.timerText.setText(`${min}:${sec.toString().padStart(2, '0')}`);
  }
}

/**
 * Show the "no start flag" error screen.
 */
export function showNoStartFlagError(scene: MainScene, width: number, height: number): void {
  // Halt the update loop so it never touches uninitialised fields
  scene.finished = true;
  scene.add
    .rectangle(0, 0, width, height, 0x1a0000, 0.85)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(20);
  scene.add
    .text(width / 2, height / 2 - 24, 'Level Error', {
      fontFamily: 'Tahoma, Arial', fontSize: '28px', fontStyle: 'bold', color: '#ff4444',
    })
    .setOrigin(0.5, 0.5)
    .setScrollFactor(0)
    .setDepth(21);
  scene.add
    .text(width / 2, height / 2 + 16, 'This level has no Start Flag.\nPlease edit the level and add a flag_start tile.', {
      fontFamily: 'Tahoma, Arial', fontSize: '14px', color: '#ffaaaa', align: 'center',
    })
    .setOrigin(0.5, 0)
    .setScrollFactor(0)
    .setDepth(21);
}

/**
 * Callback when the player reaches the finish flag.
 */
export function onFinish(scene: MainScene): void {
  if (scene.finished) return;
  scene.finished = true;

  const elapsed = performance.now() - scene.startTime;
  scene.player.setTint(0x50c860);
  scene.player.setVelocity(0, 0);
  const body = scene.player.body as Phaser.Physics.Arcade.Body;
  body.setAccelerationX(0);
  body.setMaxVelocityX(0);
  body.setAllowGravity(false);

  // Emit finish to party room
  if (scene.socket && scene.partyCode) {
    scene.socket.emit('player:finish', { code: scene.partyCode, time: elapsed });
  }

  const { width, height } = scene.scale;
  const overlay = scene.add
    .rectangle(0, 0, width, height, 0x000000, 0)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(10);

  scene.tweens.add({
    targets: overlay,
    fillAlpha: 0.7,
    duration: 600,
    ease: 'Power2',
    onComplete: () => {
      const onCompleteCb = scene.registry.get('onComplete') as
        | ((elapsed: number) => void)
        | undefined;
      if (onCompleteCb) onCompleteCb(elapsed);
    },
  });
}

/**
 * Callback when the player touches a checkpoint.
 */
export function onCheckpoint(
  scene: MainScene,
  _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  checkpoint: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  const cp = checkpoint as Phaser.Physics.Arcade.Image;
  const cx = cp.getData('spawnX') as number;
  const cy = cp.getData('spawnY') as number;

  if (cx === scene.checkpointX && cy === scene.checkpointY) return;

  scene.checkpointX = cx;
  scene.checkpointY = cy;

  scene.tweens.add({
    targets: cp,
    alpha: { from: 0.6, to: 0 },
    duration: 300,
    ease: 'Linear',
  });

  const onCheckpointCb = scene.registry.get('onCheckpoint') as
    | ((x: number, y: number) => void)
    | undefined;
  if (onCheckpointCb) onCheckpointCb(cx, cy);
}

/**
 * Set collider debug visibility.
 */
export function setColliderDebugVisible(scene: MainScene, visible: boolean): void {
  scene.colliderDebugVisible = visible;
  const world = scene.physics.world as Phaser.Physics.Arcade.World & {
    debugGraphic?: Phaser.GameObjects.Graphics;
  };

  world.drawDebug = visible;
  if (scene.satDebugGfx) scene.satDebugGfx.setVisible(visible);

  if (world.debugGraphic) {
    world.debugGraphic.visible = visible;
    if (visible) {
      world.debugGraphic.clear();
    }
  }
}

/**
 * Toggle collider debug visibility on key press.
 */
export function updateColliderDebugToggle(scene: MainScene): void {
  if (Phaser.Input.Keyboard.JustDown(scene.debugToggleKey)) {
    setColliderDebugVisible(scene, !scene.colliderDebugVisible);
  }
}
