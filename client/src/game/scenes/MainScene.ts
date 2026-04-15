/**
 * MainScene — Thin orchestrator that delegates to system modules.
 *
 * All game state lives here as public properties so system functions
 * can read and mutate it. The scene lifecycle methods (preload, create,
 * update, shutdown) simply call into the appropriate system modules.
 */
import * as Phaser from 'phaser';
import { type Socket } from 'socket.io-client';
import { type Tile } from '../../types/level';
import { TILE, PLAYER_W_GROUNDED } from '../constants';
import { DEMO_LEVEL_TILES } from '../demoLevel';
import type { MovingDirection } from '../types';
import type { SpinningUnit } from '../systems/SpinningSystem';
import type { BackdropState } from '../systems/BackdropRenderer';

// ── System imports ─────────────────────────────────────────────────────────
import * as AssetLoader from '../systems/AssetLoader';
import * as TileBuilder from '../systems/TileBuilder';
import * as PlayerController from '../systems/PlayerController';
import * as PhysicsSetup from '../systems/PhysicsSetup';
import * as MovingBoxSystem from '../systems/MovingBoxSystem';
import * as SpinningSystem from '../systems/SpinningSystem';
import * as HazardSystem from '../systems/HazardSystem';
import * as PortalSystem from '../systems/PortalSystem';
import * as FallingLandSystem from '../systems/FallingLandSystem';
import * as MultiplayerSystem from '../systems/MultiplayerSystem';
import * as BackdropRenderer from '../systems/BackdropRenderer';
import * as UIOverlay from '../systems/UIOverlay';

export class MainScene extends Phaser.Scene {
  // ── Physics groups ─────────────────────────────────────────────────────────
  platforms!: Phaser.Physics.Arcade.StaticGroup;
  movingBoxGroup!: Phaser.Physics.Arcade.Group;
  hazardGroup!: Phaser.Physics.Arcade.StaticGroup;
  waterGroup!: Phaser.Physics.Arcade.StaticGroup;
  lavaGroup!: Phaser.Physics.Arcade.StaticGroup;
  checkpointGroup!: Phaser.Physics.Arcade.StaticGroup;
  finishGroup!: Phaser.Physics.Arcade.StaticGroup;
  portalGroup!: Phaser.Physics.Arcade.StaticGroup;
  ladderGroup!: Phaser.Physics.Arcade.StaticGroup;
  iceGroup!: Phaser.Physics.Arcade.StaticGroup;
  fallingLandGroup!: Phaser.Physics.Arcade.StaticGroup;
  staticTilesByCell = new Map<string, Phaser.Physics.Arcade.Image>();

  // ── Player ─────────────────────────────────────────────────────────────────
  player!: Phaser.Physics.Arcade.Sprite;
  playerNameplate: Phaser.GameObjects.Text | null = null;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  spawnX = TILE * 2;
  spawnY = TILE * 2;
  checkpointX: number | null = null;
  checkpointY: number | null = null;
  isDead = false;
  onLadder = false;
  isOnIce = false;
  finished = false;
  flagStartFound = false;
  killPlaneY = 0;
  currentPlayerColliderW = PLAYER_W_GROUNDED;
  selectedCharacterKey = 'sora';
  climbingUnitVelocity = { x: 0, y: 0 };

  // ── Portal state ───────────────────────────────────────────────────────────
  portalPositions = new Map<string, Array<{ x: number; y: number }>>();
  portalCooldown = false;

  // ── Timer / UI ─────────────────────────────────────────────────────────────
  startTime = 0;
  timerText: Phaser.GameObjects.Text | null = null;
  colliderDebugVisible = true;
  debugToggleKey!: Phaser.Input.Keyboard.Key;
  satDebugGfx: Phaser.GameObjects.Graphics | null = null;

  // ── Falling land ───────────────────────────────────────────────────────────
  fallingLandCrumbling = new Set<Phaser.Physics.Arcade.Image>();

  // ── Water ──────────────────────────────────────────────────────────────────
  waterSurfaceByColumn = new Map<number, number>();

  // ── Moving boxes ───────────────────────────────────────────────────────────
  movingBoxesByCell = new Map<string, Phaser.Physics.Arcade.Image>();
  movingBoxUnits = new Map<number, Phaser.Physics.Arcade.Image[]>();
  movingBoxUnitDirection = new Map<number, MovingDirection>();
  movingBoxUnitLastProgressCoord = new Map<number, number>();
  movingBoxUnitStuckFrames = new Map<number, number>();
  movingBoxUnitReverseCooldown = new Map<number, number>();

  // ── Boombox / hazards ──────────────────────────────────────────────────────
  boomboxSpawnCells = new Set<string>();
  boomboxHazardsByCell = new Map<
    string,
    { sensor: Phaser.Physics.Arcade.Image; visible: Phaser.GameObjects.Image }
  >();
  gluedHazardBlueprints = new Map<string, {
    unitId: number;
    relX: number;
    relY: number;
    isSpinning?: boolean;
    radius?: number;
    initAngle?: number;
  }>();

  // ── Spinning units ─────────────────────────────────────────────────────────
  spinningUnits = new Map<number, SpinningUnit>();

  // ── Multiplayer ────────────────────────────────────────────────────────────
  socket: Socket | null = null;
  partyCode: string | null = null;
  ghostSprites = new Map<string, Phaser.GameObjects.Sprite>();
  ghostNameplates = new Map<string, Phaser.GameObjects.Text>();
  moveEmitCounter = 0;

  // ── Backdrop ───────────────────────────────────────────────────────────────
  private backdropState: BackdropState = {
    repeatingBackdrop: null,
    repeatingBackdropTextureKey: null,
  };

  constructor() {
    super({ key: 'MainScene' });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  preload() {
    AssetLoader.preloadAssets(this);
  }

  create() {
    // ── Reset state ──────────────────────────────────────────────────────────
    this.isDead = false;
    this.finished = false;
    this.portalCooldown = false;
    this.onLadder = false;
    this.isOnIce = false;
    this.flagStartFound = false;
    this.fallingLandCrumbling.clear();
    this.waterSurfaceByColumn.clear();
    this.movingBoxesByCell.clear();
    this.movingBoxUnits.clear();
    this.movingBoxUnitDirection.clear();
    this.movingBoxUnitLastProgressCoord.clear();
    this.movingBoxUnitStuckFrames.clear();
    this.movingBoxUnitReverseCooldown.clear();
    this.boomboxSpawnCells.clear();
    this.boomboxHazardsByCell.clear();
    this.gluedHazardBlueprints.clear();
    this.spinningUnits.clear();
    this.portalPositions.clear();
    this.startTime = performance.now();

    // ── Multiplayer setup ────────────────────────────────────────────────────
    this.ghostSprites.clear();
    this.moveEmitCounter = 0;
    this.socket = this.registry.get('socket') as Socket | null ?? null;
    this.partyCode = this.registry.get('partyCode') as string | null ?? null;

    if (this.socket && this.partyCode) {
      MultiplayerSystem.registerSocketListeners(this);
    }

    // ── World setup ──────────────────────────────────────────────────────────
    const { width, height } = this.scale;
    const tileData: Tile[] = this.registry.get('tileData') ?? [];
    const authoredTiles = tileData.length > 0 ? tileData : DEMO_LEVEL_TILES;
    const activeTiles = TileBuilder.expandRuntimeFluids(authoredTiles);
    this.killPlaneY = PhysicsSetup.computeKillPlaneY(activeTiles, height);
    const worldBounds = PhysicsSetup.computeWorldBounds(activeTiles, width, height);
    this.physics.world.setBounds(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
      true,
      true,
      true,
      true,
    );

    // ── Backdrop ─────────────────────────────────────────────────────────────
    this.backdropState = BackdropRenderer.createBackdrop(this, width, height);

    // ── Physics groups ───────────────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    this.movingBoxGroup = this.physics.add.group();
    this.hazardGroup = this.physics.add.staticGroup();
    this.waterGroup = this.physics.add.staticGroup();
    this.lavaGroup = this.physics.add.staticGroup();
    this.checkpointGroup = this.physics.add.staticGroup();
    this.finishGroup = this.physics.add.staticGroup();
    this.portalGroup = this.physics.add.staticGroup();
    this.ladderGroup = this.physics.add.staticGroup();
    this.iceGroup = this.physics.add.staticGroup();
    this.fallingLandGroup = this.physics.add.staticGroup();

    // ── Fluid animations ─────────────────────────────────────────────────────
    TileBuilder.createFluidAnimations(this);

    // ── Build tiles ──────────────────────────────────────────────────────────
    TileBuilder.buildFromTileData(this, activeTiles);

    if (tileData.length > 0 && !this.flagStartFound) {
      UIOverlay.showNoStartFlagError(this, width, height);
      return;
    }

    // ── Debug graphics ───────────────────────────────────────────────────────
    this.satDebugGfx = this.add.graphics();
    this.satDebugGfx.setDepth(100);

    // ── Backdrop water band ──────────────────────────────────────────────────
    BackdropRenderer.addBackdropWaterBand(this, activeTiles);

    // ── Moving & spinning units ──────────────────────────────────────────────
    MovingBoxSystem.initializeMovingBoxUnits(this);
    SpinningSystem.initializeSpinningUnits(this);

    // ── Player ───────────────────────────────────────────────────────────────
    PlayerController.createPlayer(this);
    PlayerController.createInput(this);

    // ── Colliders & overlaps ─────────────────────────────────────────────────
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.fallingLandGroup,
      (_p, l) => FallingLandSystem.onFallingLandContact(this, _p, l), undefined, this);
    this.physics.add.collider(
      this.player,
      this.movingBoxGroup,
      (_p, b) => HazardSystem.onMovingBoxContact(this, _p, b),
      (_p, b) => !(b as Phaser.Physics.Arcade.Image).getData('isSpinningUnitMember'),
      this,
    );
    this.physics.add.collider(this.movingBoxGroup, this.platforms);

    this.physics.add.overlap(this.player, this.hazardGroup,
      (_p, h) => HazardSystem.onHazardOverlap(this, _p, h), undefined, this);
    this.physics.add.overlap(this.player, this.waterGroup,
      (_p, w) => HazardSystem.onWaterOverlap(this, _p, w), undefined, this);
    this.physics.add.overlap(this.player, this.lavaGroup,
      (_p, l) => HazardSystem.onLavaOverlap(this, _p, l), undefined, this);
    this.physics.add.overlap(this.player, this.checkpointGroup,
      (_p, c) => UIOverlay.onCheckpoint(this, _p, c), undefined, this);
    this.physics.add.overlap(this.player, this.finishGroup,
      () => UIOverlay.onFinish(this), undefined, this);
    this.physics.add.overlap(this.player, this.portalGroup,
      (_p, po) => PortalSystem.onPortalOverlap(this, _p, po), undefined, this);

    // ── Debug key ────────────────────────────────────────────────────────────
    this.debugToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    UIOverlay.setColliderDebugVisible(this, true);

    // ── Camera ───────────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(width * 0.3, height * 0.3);
    this.cameras.main.setBounds(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
    );

    // ── HUD ──────────────────────────────────────────────────────────────────
    UIOverlay.createHUD(this, width);
    UIOverlay.createTimer(this, width);
  }

  update() {
    BackdropRenderer.updateBackdropParallax(this.backdropState, this.cameras.main);
    UIOverlay.updateColliderDebugToggle(this);
    UIOverlay.updateTimer(this);

    MovingBoxSystem.updateMovingBoxUnits(this);
    SpinningSystem.updateSpinningUnits(this);
    SpinningSystem.handleSpinningCollision(this);

    // Ghost interpolation runs every frame so remote players move smoothly
    // even while the local player is dead or has finished.
    MultiplayerSystem.updateGhostInterpolation(this);

    if (this.isDead || this.finished) return;

    MultiplayerSystem.emitPlayerPosition(this);
    PlayerController.updatePlayerInput(this);
  }

  shutdown() {
    MultiplayerSystem.cleanupGhosts(this);
    MultiplayerSystem.unregisterSocketListeners(this);
    BackdropRenderer.cleanupBackdrop(this, this.backdropState);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Delegate methods (called by system modules that need cross-system calls)
  // ═══════════════════════════════════════════════════════════════════════════

  spawnBoomboxHazard(tileX: number, tileY: number) {
    return HazardSystem.spawnBoomboxHazard(this, tileX, tileY);
  }

  restoreRespawnHazards() {
    HazardSystem.restoreRespawnHazards(this);
  }

  restoreAllFallingLand() {
    FallingLandSystem.restoreAllFallingLand(this);
  }

  onHazardOverlap(
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    hazardObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    HazardSystem.onHazardOverlap(this, playerObj, hazardObj);
  }
}
