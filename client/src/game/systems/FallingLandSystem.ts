/**
 * FallingLandSystem — crumble timer, respawn, and full restore logic.
 */
import * as Phaser from 'phaser';
import { TILE, FALL_CRUMBLE_DELAY } from '../constants';
import type { MainScene } from '../scenes/MainScene';

/**
 * Callback when the player lands on a falling_land tile.
 */
export function onFallingLandContact(
  scene: MainScene,
  _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  landObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
): void {
  const land = landObj as Phaser.Physics.Arcade.Image;
  if (scene.fallingLandCrumbling.has(land)) return;
  scene.fallingLandCrumbling.add(land);

  const crumbleTimer = scene.time.delayedCall(FALL_CRUMBLE_DELAY, () => {
    const scaleTween = scene.tweens.add({
      targets: land,
      alpha: 0,
      scaleX: 0.5,
      scaleY: 0.5,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        land.setActive(false);
        land.setVisible(false);
        (land.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        const respawnTimer = scene.time.delayedCall(3000, () => {
          resetFallingLand(scene, land);
        });
        land.setData('respawnTimer', respawnTimer);
      },
    });
    land.setData('scaleTween', scaleTween);
  });
  land.setData('crumbleTimer', crumbleTimer);
}

/**
 * Reset a single falling land tile to its original state.
 */
export function resetFallingLand(scene: MainScene, land: Phaser.Physics.Arcade.Image): void {
  // Clean up any pending lifecycle events for this specific tile
  const crumbleTimer = land.getData('crumbleTimer') as Phaser.Time.TimerEvent | undefined;
  if (crumbleTimer) crumbleTimer.remove();

  const scaleTween = land.getData('scaleTween') as Phaser.Tweens.Tween | undefined;
  if (scaleTween) scaleTween.stop();

  const respawnTimer = land.getData('respawnTimer') as Phaser.Time.TimerEvent | undefined;
  if (respawnTimer) respawnTimer.remove();

  land.setData('crumbleTimer', null);
  land.setData('scaleTween', null);
  land.setData('respawnTimer', null);

  // Restore visual and physical state
  land.setActive(true);
  land.setVisible(true);
  land.setAlpha(1);
  land.setDisplaySize(TILE, TILE);

  const body = land.body as Phaser.Physics.Arcade.StaticBody;
  body.enable = true;
  body.reset(
    land.getData('originalX') as number,
    land.getData('originalY') as number,
  );
  // Explicitly refresh the static body to match the restored scale and position
  land.refreshBody();

  scene.fallingLandCrumbling.delete(land);
}

/**
 * Restore all falling land tiles (called on respawn).
 */
export function restoreAllFallingLand(scene: MainScene): void {
  scene.fallingLandGroup.getChildren().forEach((child) => {
    const land = child as Phaser.Physics.Arcade.Image;
    if (scene.fallingLandCrumbling.has(land) || !land.active) {
      resetFallingLand(scene, land);
    }
  });
}
