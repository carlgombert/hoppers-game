import * as Phaser from 'phaser';
import { type Socket } from 'socket.io-client';
import { type Tile, TILE_META } from '../../types/level';
import { DEMO_LEVEL_TILES } from '../demoLevel';
import { DEFAULT_BACKDROP_ID, normalizeBackdropId } from '../backdrops';

const TILE = 40;
const PLAYER_W_GROUNDED = 40;
const PLAYER_W_AIRBORNE = 28;
const PLAYER_H = 56;
const PLAYER_SPRITE_SIZE = 64;
const LADDER_SPRITE_SIZE = 68;
const PLAYER_SPEED = 200;
const PLAYER_ACCEL = 900;
const PLAYER_DRAG = 800;
const JUMP_VELOCITY = -420;
const ICE_DRAG = 80;
const ICE_ACCEL = 400;
const MOVING_BOX_SPEED = 80;
const FALL_CRUMBLE_DELAY = 400;
const WATER_OVERLAY_FILL = 0x2f6fb3;
const WATER_OVERLAY_DEPTH = 5.5;
const WATER_TEXTURE_DEPTH = 5.6;
const WATER_TEXTURE_ALPHA = 0.45;
const WATER_FRAME_SIZE = 16;
const WATER_FLOW_ANIM_KEY = 'water_flow';
const WATER_STILL_ANIM_KEY = 'water_still';
const LAVA_FLOW_ANIM_KEY = 'lava_flow';
const LAVA_STILL_ANIM_KEY = 'lava_still';
const CLIMB_ANIM_KEY = 'climb';
const RUN_ANIM_KEY = 'run';
const WATER_RUNTIME_ROWS = 24;
const WATER_BACKDROP_IDS = new Set(['mountains', 'city']);
const PORTAL_COOLDOWN_MS = 3000;
const MOVING_BOX_STUCK_FRAMES = 12;
const MOVING_BOX_PROGRESS_EPSILON = 0.2;
const MOVING_BOX_REVERSE_COOLDOWN_FRAMES = 8;
const MOVING_BOX_UNSTICK_NUDGE = 2;
const CHARACTER_RENDER_Y_OFFSET = 3;
const NICK_RENDER_Y_OFFSET = 4;
const CHARACTER_SPRITE_DEPTH = 20;
const CHARACTER_NAMEPLATE_DEPTH = 21;

type MovingDirection = 'left' | 'right' | 'up' | 'down';

function getCharacterRenderYOffset(characterKey: string | null | undefined): number {
  return characterKey === 'nick' ? NICK_RENDER_Y_OFFSET : CHARACTER_RENDER_Y_OFFSET;
}

export class MainScene extends Phaser.Scene {
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingBoxGroup!: Phaser.Physics.Arcade.Group;
  private hazardGroup!: Phaser.Physics.Arcade.StaticGroup;
  private waterGroup!: Phaser.Physics.Arcade.StaticGroup;
  private lavaGroup!: Phaser.Physics.Arcade.StaticGroup;
  private checkpointGroup!: Phaser.Physics.Arcade.StaticGroup;
  private finishGroup!: Phaser.Physics.Arcade.StaticGroup;
  private portalGroup!: Phaser.Physics.Arcade.StaticGroup;
  private ladderGroup!: Phaser.Physics.Arcade.StaticGroup;
  private iceGroup!: Phaser.Physics.Arcade.StaticGroup;
  private fallingLandGroup!: Phaser.Physics.Arcade.StaticGroup;

  private player!: Phaser.Physics.Arcade.Sprite;
  private playerNameplate: Phaser.GameObjects.Text | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  private spawnX = TILE * 2;
  private spawnY = TILE * 2; // Anchor to the tile floor
  private checkpointX: number | null = null;
  private checkpointY: number | null = null;
  private isDead = false;
  private onLadder = false;
  private isOnIce = false;

  private portalPositions = new Map<string, Array<{ x: number; y: number }>>();
  private portalCooldown = false;
  private colliderDebugVisible = true;
  private debugToggleKey!: Phaser.Input.Keyboard.Key;

  // Use performance.now() for the start baseline so the timer is independent
  // of Phaser's internal scene clock (which may not be 0 at create() time).
  private startTime = 0;
  private timerText: Phaser.GameObjects.Text | null = null;
  private finished = false;

  private flagStartFound = false;
  private killPlaneY = 0;
  private currentPlayerColliderW = PLAYER_W_GROUNDED;
  private selectedCharacterKey = 'sora';

  private fallingLandCrumbling = new Set<Phaser.Physics.Arcade.Image>();
  private waterSurfaceByColumn = new Map<number, number>();
  private movingBoxesByCell = new Map<string, Phaser.Physics.Arcade.Image>();
  private movingBoxUnits = new Map<number, Phaser.Physics.Arcade.Image[]>();
  private movingBoxUnitDirection = new Map<number, MovingDirection>();
  private movingBoxUnitLastProgressCoord = new Map<number, number>();
  private movingBoxUnitStuckFrames = new Map<number, number>();
  private movingBoxUnitReverseCooldown = new Map<number, number>();
  private boomboxSpawnCells = new Set<string>();
  private boomboxHazardsByCell = new Map<
    string,
    { sensor: Phaser.Physics.Arcade.Image; visible: Phaser.GameObjects.Image }
  >();

  // ── Multiplayer ghost sprites ──────────────────────────────────────────────
  private socket: Socket | null = null;
  private partyCode: string | null = null;
  private ghostSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private ghostNameplates = new Map<string, Phaser.GameObjects.Text>();
  private moveEmitCounter = 0;
  private repeatingBackdrop: Phaser.GameObjects.TileSprite | null = null;
  private repeatingBackdropTextureKey: string | null = null;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load game-asset URLs passed from GameCanvas via game.registry
    const urls = this.registry.get('assetUrls') as {
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
      characters?: Record<string, { still: string; ladder?: string[]; jump?: string; run?: string[] }>;
      character?: string;
    } | null;
    const backdropUrls = this.registry.get('backdropAssetUrls') as Record<string, string> | null;
    if (urls) {
      // Load each available character skin so remote players can use their own sprite.
      if (urls.characters) {
        Object.entries(urls.characters).forEach(([key, config]) => {
          this.load.image(`character_${key}_still`, config.still);
          if (config.ladder) {
            config.ladder.forEach((url, i) => {
              this.load.image(`character_${key}_ladder_${i + 1}`, url);
            });
          }
          if (config.jump) {
            this.load.image(`character_${key}_jump`, config.jump);
          }
          if (config.run) {
            config.run.forEach((url, i) => {
              this.load.image(`character_${key}_run_${i + 1}`, url);
            });
          }
        });
      }
      if (urls.character) this.load.image('character', urls.character);
      if (urls.land) this.load.image('tile_texture_land', urls.land);
      if (urls.grass) this.load.image('tile_texture_grass', urls.grass);
      if (urls.demon_grass) this.load.image('tile_texture_demon_grass', urls.demon_grass);
      if (urls.ladder) this.load.image('tile_texture_ladder', urls.ladder);
      if (urls.moving_box) this.load.image('tile_texture_moving_box', urls.moving_box);
      if (urls.boombox) this.load.image('tile_texture_boombox', urls.boombox);
      if (urls.falling_land) this.load.image('tile_texture_falling_land', urls.falling_land);
      if (urls.explosion) this.load.image('tile_texture_explosion', urls.explosion);
      if (urls.water_flow) {
        this.load.spritesheet('tile_texture_water_flow', urls.water_flow, {
          frameWidth: WATER_FRAME_SIZE,
          frameHeight: WATER_FRAME_SIZE,
        });
      }
      if (urls.water_still) {
        this.load.spritesheet('tile_texture_water_still', urls.water_still, {
          frameWidth: WATER_FRAME_SIZE,
          frameHeight: WATER_FRAME_SIZE,
        });
      }
      if (urls.lava_flow) {
        this.load.spritesheet('tile_texture_lava_flow', urls.lava_flow, {
          frameWidth: WATER_FRAME_SIZE,
          frameHeight: WATER_FRAME_SIZE,
        });
      }
      if (urls.lava_still) {
        this.load.spritesheet('tile_texture_lava_still', urls.lava_still, {
          frameWidth: WATER_FRAME_SIZE,
          frameHeight: WATER_FRAME_SIZE,
        });
      }
    }
    if (backdropUrls) {
      Object.entries(backdropUrls).forEach(([id, url]) => {
        this.load.image(`backdrop_${id}`, url);
      });
    }
  }

  create() {
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
    this.portalPositions.clear();
    this.startTime = performance.now();

    // Multiplayer setup
    this.ghostSprites.clear();
    this.moveEmitCounter = 0;
    this.socket = this.registry.get('socket') as Socket | null ?? null;
    this.partyCode = this.registry.get('partyCode') as string | null ?? null;

    if (this.socket && this.partyCode) {
      this.registerSocketListeners();
    }

    const { width, height } = this.scale;
    const tileData: Tile[] = this.registry.get('tileData') ?? [];
    const savedCheckpoint: { x: number; y: number } | null = this.registry.get('savedCheckpoint') ?? null;
    const authoredTiles = tileData.length > 0 ? tileData : DEMO_LEVEL_TILES;
    const activeTiles = this.expandRuntimeFluids(authoredTiles);
    this.killPlaneY = this.computeKillPlaneY(activeTiles, height);
    const worldBounds = this.computeWorldBounds(activeTiles, width, height);
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

    this.createBackdrop(width, height);

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

    // Create reusable water animations once per scene when spritesheets are available.
    this.createWaterAnimation('tile_texture_water_flow', WATER_FLOW_ANIM_KEY, 10);
    this.createWaterAnimation('tile_texture_water_still', WATER_STILL_ANIM_KEY, 6);
    this.createWaterAnimation('tile_texture_lava_flow', LAVA_FLOW_ANIM_KEY, 4);
    this.createWaterAnimation('tile_texture_lava_still', LAVA_STILL_ANIM_KEY, 3);

    if (tileData.length > 0) {
      this.buildFromTileData(activeTiles);
      // If tile data was provided but no flag_start tile was found, show a visible error
      if (!this.flagStartFound) {
        this.showNoStartFlagError(width, height);
        return;
      }
    } else {
      // No tile data supplied — load the built-in demo level
      this.buildFromTileData(activeTiles);
    }

    this.addBackdropWaterBand(activeTiles);

    this.initializeMovingBoxUnits();

    this.selectedCharacterKey = (this.registry.get('characterKey') as string | null) ?? 'sora';
    const preferredPlayerTexture = `character_${this.selectedCharacterKey}_still`;
    const playerTexKey = this.textures.exists(preferredPlayerTexture)
      ? preferredPlayerTexture
      : this.textures.exists('character')
        ? 'character'
        : 'player';

    if (playerTexKey === 'player' && !this.textures.exists('player')) {
      const gfx = this.make.graphics({ x: 0, y: 0 });
      gfx.fillStyle(0x4db8ff, 1);
      gfx.fillRoundedRect(0, 0, PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE, 8);
      gfx.fillStyle(0x7ab8f5, 1);
      gfx.fillCircle(PLAYER_SPRITE_SIZE / 2, 14, 10);
      gfx.generateTexture('player', PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
      gfx.destroy();
    }

    if (!this.textures.exists('ghost')) {
      const gg = this.make.graphics({ x: 0, y: 0 });
      gg.fillStyle(0xb9add6, 1);
      gg.fillRoundedRect(0, 0, PLAYER_W_GROUNDED, PLAYER_H, 4);
      gg.fillStyle(0xd4c8f0, 1);
      gg.fillCircle(PLAYER_W_GROUNDED / 2, 8, 7);
      gg.generateTexture('ghost', PLAYER_W_GROUNDED, PLAYER_H);
      gg.destroy();
    }

    const startX = savedCheckpoint?.x ?? this.spawnX;
    const startY = savedCheckpoint?.y ?? this.spawnY;
    if (savedCheckpoint) {
      this.checkpointX = savedCheckpoint.x;
      this.checkpointY = savedCheckpoint.y;
    }

    this.player = this.physics.add.sprite(
      startX,
      startY,
      playerTexKey,
    );
    // Anchor at the bottom center to prevent scaling from affecting ground contact
    this.player.setOrigin(0.5, 1.0);
    this.player.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    this.player.setDepth(CHARACTER_SPRITE_DEPTH);

    // Create climbing animation for current character
    const urls = this.registry.get('assetUrls') as {
      characters?: Record<string, { still: string; ladder?: string[]; jump?: string; run?: string[] }>;
    } | null;
    const charConfig = urls?.characters?.[this.selectedCharacterKey];
    if (charConfig?.ladder) {
      const frames = charConfig.ladder.map((_: string, i: number) => ({
        key: `character_${this.selectedCharacterKey}_ladder_${i + 1}`,
      }));
      this.anims.create({
        key: CLIMB_ANIM_KEY,
        frames,
        frameRate: 6,
        repeat: -1,
      });
    }

    if (charConfig?.run) {
      const frames = charConfig.run.map((_: string, i: number) => ({
        key: `character_${this.selectedCharacterKey}_run_${i + 1}`,
      }));
      this.anims.create({
        key: RUN_ANIM_KEY,
        frames,
        frameRate: 10,
        repeat: -1,
      });
    }
    this.player.setBounce(0);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.setPlayerColliderWidth(PLAYER_W_GROUNDED);
    playerBody.setOffset((PLAYER_SPRITE_SIZE - PLAYER_W_GROUNDED) / 2, PLAYER_SPRITE_SIZE - PLAYER_H);
    playerBody.setMaxVelocityX(PLAYER_SPEED);
    playerBody.setMaxVelocityY(800); // prevent tunnelling through platform tiles

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.fallingLandGroup, this.onFallingLandContact, undefined, this);
    this.physics.add.collider(this.player, this.movingBoxGroup);
    this.physics.add.collider(this.movingBoxGroup, this.platforms); // needed for blocked.left/right reversal

    this.physics.add.overlap(this.player, this.hazardGroup, this.onHazardOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.waterGroup, this.onWaterOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.lavaGroup, this.onLavaOverlap, undefined, this);
    this.physics.add.overlap(this.player, this.checkpointGroup, this.onCheckpoint, undefined, this);
    this.physics.add.overlap(this.player, this.finishGroup, this.onFinish, undefined, this);
    this.physics.add.overlap(this.player, this.portalGroup, this.onPortalOverlap, undefined, this);

    if (this.socket && this.partyCode) {
      const localDisplayName = (this.registry.get('localDisplayName') as string | null) ?? 'You';
      this.playerNameplate = this.add
        .text(this.player.x, this.player.y - PLAYER_SPRITE_SIZE / 2 - 8, localDisplayName, {
          fontFamily: 'Tahoma, Arial',
          fontSize: '10px',
          color: '#f3f7ff',
          backgroundColor: '#1b5c2e',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(CHARACTER_NAMEPLATE_DEPTH);
    } else {
      this.playerNameplate = null;
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.debugToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.setColliderDebugVisible(true);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(width * 0.3, height * 0.3);
    this.cameras.main.setBounds(
      worldBounds.x,
      worldBounds.y,
      worldBounds.width,
      worldBounds.height,
    );

    this.add
      .text(width / 2, 16, 'Arrow keys or WASD  |  Space to jump', {
        fontFamily: 'Tahoma, Arial',
        fontSize: '11px',
        color: '#7ab8f5',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    this.timerText = this.add
      .text(width - 12, 16, '0:00', {
        fontFamily: 'Tahoma, Arial',
        fontSize: '20px',
        color: '#e0e8ff',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(15);
  }

  private createWaterAnimation(textureKey: string, animKey: string, frameRate: number) {
    if (!this.textures.exists(textureKey) || this.anims.exists(animKey)) {
      return;
    }

    const texture = this.textures.get(textureKey);
    const frameKeys = Object.keys(texture.frames).filter((k) => k !== '__BASE');
    const frameCount = frameKeys.length;
    if (frameCount <= 0) return;

    this.anims.create({
      key: animKey,
      frames: this.anims.generateFrameNumbers(textureKey, { start: 0, end: frameCount - 1 }),
      frameRate,
      repeat: -1,
    });
  }

  private buildFromTileData(tiles: Tile[]) {
    const generatedTextures = new Set<string>();

    // First pass: collect portal positions indexed by linkedPortalId (array per ID for bidirectional pairs)
    for (const tile of tiles) {
      if (tile.type === 'portal' && tile.linkedPortalId) {
        const pos = { x: tile.x * TILE + TILE / 2, y: tile.y * TILE + TILE / 2 };
        const list = this.portalPositions.get(tile.linkedPortalId) ?? [];
        list.push(pos);
        this.portalPositions.set(tile.linkedPortalId, list);
      }

      if (tile.type === 'water' && tile.waterVariant !== 'flow') {
        const surfaceY = tile.y * TILE;
        const current = this.waterSurfaceByColumn.get(tile.x);
        if (current === undefined || surfaceY < current) {
          this.waterSurfaceByColumn.set(tile.x, surfaceY);
        }
      }
    }

    for (const tile of tiles) {
      // Gracefully skip unknown tile types with a console warning
      if (!(tile.type in TILE_META)) {
        console.warn(`[MainScene] Unknown tile type "${tile.type}" at (${tile.x}, ${tile.y}) — skipped.`);
        continue;
      }

      const meta = TILE_META[tile.type];
      const px = tile.x * TILE;
      const py = tile.y * TILE;

      // Use a pre-loaded PNG texture for this tile type if available
      const pngKey = `tile_texture_${tile.type}`;
      const textureKey = this.textures.exists(pngKey) ? pngKey : `tile_type_${tile.type}`;

      if (textureKey === `tile_type_${tile.type}` && !generatedTextures.has(textureKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 });
        this.drawTileGfx(gfx, tile.type, meta.color, meta.gloss);
        gfx.generateTexture(textureKey, TILE, TILE);
        gfx.destroy();
        generatedTextures.add(textureKey);
      }

      const cx = px + TILE / 2;
      const cy = py + TILE / 2;

      switch (tile.type) {
        case 'land':
        case 'grass':
        case 'demon_grass': {
          const img = this.platforms.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          img.setDisplaySize(TILE, TILE);
          img.refreshBody();
          break;
        }

        case 'ladder': {
          // Ladders are pass-through (not solid). Detection via ladderGroup for gravity suspension + climbing.
          const ladderSensor = this.ladderGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          ladderSensor.setDisplaySize(TILE, TILE);
          ladderSensor.refreshBody();
          break;
        }

        case 'ice': {
          const img = this.platforms.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          img.setDisplaySize(TILE, TILE);
          img.refreshBody();
          const iceSensor = this.iceGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          iceSensor.setDisplaySize(TILE, TILE);
          iceSensor.setAlpha(0);
          iceSensor.refreshBody();
          break;
        }

        case 'falling_land': {
          // Use the dedicated falling_land texture if available
          const texKey = this.textures.exists('tile_texture_falling_land') ? 'tile_texture_falling_land' : textureKey;
          const land = this.fallingLandGroup.create(cx, cy, texKey) as Phaser.Physics.Arcade.Image;
          land.setDisplaySize(TILE, TILE);
          land.setData('originalX', cx);
          land.setData('originalY', cy);
          land.refreshBody();
          break;
        }

        case 'moving_box': {
          const box = this.movingBoxGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          box.setDisplaySize(TILE, TILE);
          box.setImmovable(true);
          box.setData('gridX', tile.x);
          box.setData('gridY', tile.y);
          box.setData('moveDirection', (tile.moveDirection ?? 'right') as MovingDirection);
          this.movingBoxesByCell.set(`${tile.x},${tile.y}`, box);
          const boxBody = box.body as Phaser.Physics.Arcade.Body;
          boxBody.setAllowGravity(false);
          boxBody.setVelocityX(0);
          break;
        }

        case 'lava': {
          const px = tile.x * TILE;
          const py = tile.y * TILE;
          const isFlow = tile.waterVariant === 'flow';

          const visibleLava = this.add
            .sprite(px, py, 'tile_texture_lava_flow')
            .setOrigin(0, 0)
            .setDepth(WATER_TEXTURE_DEPTH)
            .setDisplaySize(TILE, TILE)
            .setAlpha(1);

          if (isFlow && this.anims.exists(LAVA_FLOW_ANIM_KEY)) {
            visibleLava.play(LAVA_FLOW_ANIM_KEY);
          }

          const lava = this.lavaGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          lava.setDisplaySize(TILE, TILE);
          lava.setData('gridX', tile.x);
          lava.setAlpha(0);
          lava.refreshBody();
          break;
        }

        case 'laser': {
          const visibleHazard = this.add.image(px, py, textureKey).setOrigin(0, 0);
          const haz = this.hazardGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          haz.setDisplaySize(TILE, TILE);
          haz.setData('hazardType', tile.type);
          haz.setData('tileX', tile.x);
          haz.setData('tileY', tile.y);
          haz.setData('visibleHazard', visibleHazard);
          haz.setAlpha(0);
          haz.refreshBody();
          break;
        }

        case 'boombox': {
          this.boomboxSpawnCells.add(`${tile.x},${tile.y}`);
          this.spawnBoomboxHazard(tile.x, tile.y);
          break;
        }

        case 'water': {
          const variant = tile.waterVariant === 'flow' ? 'flow' : 'still';
          const waterTextureKey = variant === 'flow'
            ? 'tile_texture_water_flow'
            : 'tile_texture_water_still';
          const waterAnimKey = variant === 'flow' ? WATER_FLOW_ANIM_KEY : WATER_STILL_ANIM_KEY;
          const lethalWater = variant === 'still';

          this.add
            .rectangle(px + TILE / 2, py + TILE / 2, TILE, TILE, WATER_OVERLAY_FILL, 0.7)
            .setDepth(WATER_OVERLAY_DEPTH);

          const visibleWater = this.add
            .sprite(px, py, waterTextureKey)
            .setOrigin(0, 0)
            .setDepth(WATER_TEXTURE_DEPTH)
            .setDisplaySize(TILE, TILE)
            .setAlpha(WATER_TEXTURE_ALPHA);

          if (this.anims.exists(waterAnimKey)) {
            visibleWater.play(waterAnimKey);
          }

          const water = this.waterGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          water.setDisplaySize(TILE, TILE);
          water.setData('gridX', tile.x);
          water.setData('lethal', lethalWater);
          water.setAlpha(0);
          water.refreshBody();
          break;
        }

        case 'portal': {
          this.add.image(px, py, textureKey).setOrigin(0, 0);
          const portal = this.portalGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          portal.setDisplaySize(TILE, TILE);
          portal.setData('linkedPortalId', tile.linkedPortalId ?? '');
          portal.setData('portalX', cx);
          portal.setData('portalY', cy);
          portal.setAlpha(0);
          portal.refreshBody();
          break;
        }

        case 'flag_checkpoint': {
          this.add.image(px, py, textureKey).setOrigin(0, 0);
          this.add.text(cx, cy, 'C', {
            fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
          }).setOrigin(0.5, 0.5);
          const cp = this.checkpointGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          cp.setDisplaySize(TILE, TILE);
          cp.setData('spawnX', cx);
          cp.setData('spawnY', cy - TILE / 2 - PLAYER_H / 2);
          cp.setAlpha(0);
          cp.refreshBody();
          break;
        }

        case 'flag_finish': {
          this.add.image(px, py, textureKey).setOrigin(0, 0);
          this.add.text(cx, cy, 'F', {
            fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
          }).setOrigin(0.5, 0.5);
          const fin = this.finishGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          fin.setDisplaySize(TILE, TILE);
          fin.setAlpha(0);
          fin.refreshBody();
          break;
        }

        case 'flag_start': {
          this.flagStartFound = true;
          this.add.image(px, py, textureKey).setOrigin(0, 0);
          this.add.text(cx, cy, 'S', {
            fontFamily: 'Tahoma, Arial', fontSize: '14px', fontStyle: 'bold', color: '#fff',
          }).setOrigin(0.5, 0.5);
          this.spawnX = cx;
          this.spawnY = py - PLAYER_H / 2;
          break;
        }

        default:
          break;
      }
    }
  }

  private createBackdrop(width: number, height: number) {
    this.repeatingBackdrop = null;
    this.repeatingBackdropTextureKey = null;
    const backdropId = normalizeBackdropId(this.registry.get('backdropId') as string | null | undefined);

    if (backdropId !== DEFAULT_BACKDROP_ID && this.textures.exists(`backdrop_${backdropId}`)) {
      const baseKey = `backdrop_${backdropId}`;
      const mirroredKey = this.getOrCreateMirroredBackdropTexture(baseKey);
      this.repeatingBackdropTextureKey = mirroredKey;
      this.repeatingBackdrop = this.add
        .tileSprite(width / 2, height / 2, width, height, mirroredKey)
        .setOrigin(0.5, 0.5)
        .setScrollFactor(0)
        .setDepth(-10);
      return;
    }

    const worldW = Math.max(width * 4, 2000);
    const worldH = Math.max(height * 2, 1000);
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d1e3d, 0x0d1e3d, 1);
    bg.fillRect(0, 0, worldW, worldH);
    bg.setDepth(-10);
  }

  private getOrCreateMirroredBackdropTexture(baseTextureKey: string): string {
    const mirroredKey = `${baseTextureKey}_mirrored_pair`;
    if (this.textures.exists(mirroredKey)) {
      return mirroredKey;
    }

    const baseTexture = this.textures.get(baseTextureKey);
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

    const canvasTexture = this.textures.createCanvas(mirroredKey, srcW * 2, srcH);
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

  private showNoStartFlagError(width: number, height: number) {
    // Halt the update loop so it never touches uninitialised fields
    this.finished = true;
    this.add
      .rectangle(0, 0, width, height, 0x1a0000, 0.85)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(20);
    this.add
      .text(width / 2, height / 2 - 24, 'Level Error', {
        fontFamily: 'Tahoma, Arial', fontSize: '28px', fontStyle: 'bold', color: '#ff4444',
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(21);
    this.add
      .text(width / 2, height / 2 + 16, 'This level has no Start Flag.\nPlease edit the level and add a flag_start tile.', {
        fontFamily: 'Tahoma, Arial', fontSize: '14px', color: '#ffaaaa', align: 'center',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(21);
  }

  private drawTileGfx(
    gfx: Phaser.GameObjects.Graphics,
    type: string,
    color: string,
    gloss: string,
  ) {
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    const g = Phaser.Display.Color.HexStringToColor(gloss).color;

    gfx.fillStyle(c, 1);
    gfx.fillRect(0, 0, TILE, TILE);
    gfx.fillStyle(g, 0.35);
    gfx.fillRect(0, 0, TILE, 4);
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillRect(0, TILE - 3, TILE, 3);
    gfx.lineStyle(1, 0x000000, 0.3);
    gfx.strokeRect(0, 0, TILE, TILE);

    if (type === 'water' || type === 'lava') {
      gfx.lineStyle(1, 0xffffff, 0.12);
      for (let i = -TILE; i < TILE * 2; i += 8) {
        gfx.lineBetween(i, 0, i + TILE, TILE);
      }
    }
    if (type === 'portal') {
      gfx.lineStyle(2, 0xffffff, 0.5);
      gfx.strokeCircle(TILE / 2, TILE / 2, TILE / 2 - 4);
    }
    if (type === 'laser') {
      gfx.lineStyle(2, 0xff4466, 0.8);
      gfx.lineBetween(0, TILE / 2, TILE, TILE / 2);
    }
  }

  update() {
    if (this.repeatingBackdrop) {
      const cam = this.cameras.main;
      this.repeatingBackdrop.tilePositionX = cam.scrollX * 0.2;
      this.repeatingBackdrop.tilePositionY = cam.scrollY * 0.05;
    }

    this.updateColliderDebugToggle();

    // Update timer every frame while the level is in progress (runs even during death)
    if (!this.finished && this.timerText) {
      const elapsed = performance.now() - this.startTime;
      const totalSec = Math.floor(elapsed / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      this.timerText.setText(`${min}:${sec.toString().padStart(2, '0')}`);
    }

    if (this.isDead || this.finished) return;

    // Emit position to party at ~20 fps (every 3 frames at 60fps)
    if (this.socket && this.partyCode) {
      this.moveEmitCounter++;
      if (this.moveEmitCounter >= 3) {
        this.moveEmitCounter = 0;
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        const onGround = body.blocked.down;
        let moveState = 'idle';
        if (this.isDead) {
          moveState = 'dead';
        } else if (!onGround) {
          moveState = 'jumping';
        } else if (Math.abs(body.velocity.x) > 10) {
          moveState = 'running';
        }
        this.socket.emit('player:move', {
          code: this.partyCode,
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
          state: moveState,
        });
      }
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    this.isOnIce = false;
    if (onGround) {
      this.iceGroup.getChildren().forEach((child) => {
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
          this.isOnIce = true;
        }
      });
    }

    this.onLadder = false;
    this.ladderGroup.getChildren().forEach((child) => {
      const ladderImg = child as Phaser.Physics.Arcade.Image;
      const lb = ladderImg.body as Phaser.Physics.Arcade.StaticBody;
      const playerCenterX = body.x + body.width / 2;
      if (
        playerCenterX > lb.x &&
        playerCenterX < lb.x + lb.width &&
        body.y + body.height > lb.y &&
        body.y < lb.y + lb.height
      ) {
        this.onLadder = true;
      }
    });

    // Keep normal width on ground/ladder and narrow only while truly airborne.
    // Expand to grounded width only when there is clear horizontal space.
    const shouldBeAirborneWidth = !onGround && !this.onLadder;
    if (shouldBeAirborneWidth) {
      this.setPlayerColliderWidth(PLAYER_W_AIRBORNE);
    } else if (this.currentPlayerColliderW !== PLAYER_W_GROUNDED && this.canUseGroundedColliderWidth()) {
      this.setPlayerColliderWidth(PLAYER_W_GROUNDED);
    }

    this.updateMovingBoxUnits();

    const goLeft = this.cursors.left.isDown || this.wasd.left.isDown;
    const goRight = this.cursors.right.isDown || this.wasd.right.isDown;
    const goUp = this.cursors.up.isDown || this.wasd.up.isDown;
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
      Phaser.Input.Keyboard.JustDown(this.wasd.up);

    const accel = this.isOnIce ? ICE_ACCEL : PLAYER_ACCEL;
    const drag = this.isOnIce ? ICE_DRAG : PLAYER_DRAG;

    if (this.onLadder) {
      body.setAllowGravity(false);
      body.setAccelerationX(0);
      body.setDragX(drag);

      if (goUp) {
        body.setVelocityY(-180);
      } else if (this.cursors.down.isDown) {
        body.setVelocityY(180);
      } else {
        body.setVelocityY(0);
      }

      if (this.anims.exists(CLIMB_ANIM_KEY)) {
        let ladderWidth = LADDER_SPRITE_SIZE;
        let ladderHeight = LADDER_SPRITE_SIZE;
        if (this.selectedCharacterKey === 'sora') {
          ladderWidth = 70;
          ladderHeight = 70;
        }
        this.player.setDisplaySize(ladderWidth, ladderHeight);
        if (body.velocity.y !== 0) {
          this.player.play(CLIMB_ANIM_KEY, true);
        } else {
          // Ensure we are in a ladder frame even if not moving
          if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== CLIMB_ANIM_KEY) {
            this.player.play(CLIMB_ANIM_KEY);
          }
          this.player.stop();
        }
      }

      if (goLeft) {
        body.setVelocityX(-PLAYER_SPEED);
      } else if (goRight) {
        body.setVelocityX(PLAYER_SPEED);
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

    if (goLeft) this.player.setFlipX(false);
    if (goRight) this.player.setFlipX(true);

    if (!this.onLadder) {
      if (this.player.anims.isPlaying && this.player.anims.currentAnim?.key === CLIMB_ANIM_KEY) {
        this.player.stop();
      }

      let targetTex = `character_${this.selectedCharacterKey}_still`;
      let playingRun = false;
      let displaySize = PLAYER_SPRITE_SIZE;

      if (!onGround) {
        const jumpTex = `character_${this.selectedCharacterKey}_jump`;
        if (this.textures.exists(jumpTex)) {
          targetTex = jumpTex;
          if (this.selectedCharacterKey === 'sora') {
            displaySize = 66;
          }
        }
      } else if (Math.abs(body.velocity.x) > 10) {
        if (this.anims.exists(RUN_ANIM_KEY)) {
          this.player.play(RUN_ANIM_KEY, true);
          playingRun = true;
        }
      }

      if (!playingRun) {
        if (this.player.anims.isPlaying && this.player.anims.currentAnim?.key === RUN_ANIM_KEY) {
          this.player.stop();
        }
        if (this.player.texture.key !== targetTex) {
          this.player.setTexture(targetTex);
        }
      }

      this.player.setDisplaySize(displaySize, displaySize);

      // Since we changed the scale of the sprite, we must manually re-anchor the collider offset
      // Phaser's Arcade Physics scales the offset by the sprite's scale automatically, 
      // but we need the collider feet to stay perfectly aligned with the sprite's bottom origin.
      const xOff = (PLAYER_SPRITE_SIZE - this.currentPlayerColliderW) / 2;
      const yOff = PLAYER_SPRITE_SIZE - PLAYER_H;
      body.setOffset(xOff, yOff);
    }

    if (this.player.y > this.killPlaneY) {
      this.killPlayer();
    }

    if (this.playerNameplate) {
      this.playerNameplate.setPosition(
        this.player.x,
        this.player.y - PLAYER_SPRITE_SIZE - 4,
      );
    }
  }

  private computeKillPlaneY(tiles: Tile[], fallbackHeight: number): number {
    if (tiles.length === 0) return fallbackHeight + 200;
    let maxY = 0;
    for (const tile of tiles) {
      if (tile.y > maxY) maxY = tile.y;
    }
    return (maxY + 1) * TILE + 240;
  }

  private computeWorldBounds(tiles: Tile[], fallbackWidth: number, fallbackHeight: number) {
    if (tiles.length === 0) {
      return { x: 0, y: 0, width: fallbackWidth, height: fallbackHeight };
    }

    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;

    for (const tile of tiles) {
      if (tile.x < minX) minX = tile.x;
      if (tile.y < minY) minY = tile.y;
      if (tile.x > maxX) maxX = tile.x;
      if (tile.y > maxY) maxY = tile.y;
    }

    const paddingTiles = 1;
    const x = (minX - paddingTiles) * TILE;
    const y = (minY - paddingTiles) * TILE;
    const width = (maxX - minX + 1 + paddingTiles * 2) * TILE;
    const height = (maxY - minY + 1 + paddingTiles * 2) * TILE;

    return {
      x,
      y,
      width: Math.max(width, fallbackWidth),
      height: Math.max(height, fallbackHeight),
    };
  }

  private addBackdropWaterBand(tiles: Tile[]) {
    const backdropId = normalizeBackdropId(this.registry.get('backdropId') as string | null | undefined);
    if (!WATER_BACKDROP_IDS.has(backdropId)) return;
    if (tiles.length === 0) return;

    let maxY = 0;
    for (const tile of tiles) {
      if (tile.y > maxY) maxY = tile.y;
    }

    const world = this.physics.world.bounds;
    const sidePadding = TILE * 24;
    const waterTop = (maxY + 1) * TILE;
    const waterBottom = world.bottom + TILE * 24;
    const waterHeight = Math.max(TILE * 4, waterBottom - waterTop);
    const waterX = world.x - sidePadding;
    const waterW = world.width + sidePadding * 2;

    if (this.textures.exists('tile_texture_water_still')) {
      const cols = Math.ceil(waterW / TILE);
      const rows = Math.ceil(waterHeight / TILE);
      const startX = waterX + TILE / 2;
      const startY = waterTop + TILE / 2;

      this.add
        .rectangle(waterX + waterW / 2, waterTop + waterHeight / 2, waterW, waterHeight, WATER_OVERLAY_FILL, 0.7)
        .setDepth(WATER_OVERLAY_DEPTH);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sprite = this.add
            .sprite(startX + col * TILE, startY + row * TILE, 'tile_texture_water_still')
            .setDisplaySize(TILE, TILE)
            .setAlpha(WATER_TEXTURE_ALPHA)
            .setDepth(WATER_TEXTURE_DEPTH);

          if (this.anims.exists(WATER_STILL_ANIM_KEY)) {
            sprite.play(WATER_STILL_ANIM_KEY);
          }
        }
      }
      return;
    }

    this.add
      .rectangle(waterX + waterW / 2, waterTop + waterHeight / 2, waterW, waterHeight, 0x2f6fb3, 0.75)
      .setDepth(-7);

    this.add
      .rectangle(waterX + waterW / 2, waterTop + 5, waterW, 10, 0x6aa4de, 0.5)
      .setDepth(-6);
  }

  private setPlayerColliderWidth(w: number) {
    if (this.currentPlayerColliderW === w) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    // When origin is (0.5, 1.0), the body x-offset must be adjusted to center it horizontally,
    // and the y-offset must be set to keep it at the botom of the sprite box.
    const xOffset = (PLAYER_SPRITE_SIZE - w) / 2;
    const yOffset = PLAYER_SPRITE_SIZE - PLAYER_H;
    body.setSize(w, PLAYER_H, false);
    body.setOffset(xOffset, yOffset);
    this.currentPlayerColliderW = w;
  }

  private canUseGroundedColliderWidth(): boolean {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const left = this.player.x - PLAYER_W_GROUNDED / 2;
    const right = this.player.x + PLAYER_W_GROUNDED / 2;
    const top = body.y;
    const bottom = body.y + body.height;

    const intersects = (otherX: number, otherY: number, otherW: number, otherH: number) => {
      const overlapX = Math.min(right, otherX + otherW) - Math.max(left, otherX);
      const overlapY = Math.min(bottom, otherY + otherH) - Math.max(top, otherY);
      // Ignore edge-touching contacts and tiny float jitter.
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

    return !collidesStaticGroup(this.platforms)
      && !collidesStaticGroup(this.fallingLandGroup)
      && !collidesDynamicGroup(this.movingBoxGroup);
  }

  private killPlayer() {
    if (this.isDead || this.finished) return;
    this.isDead = true;

    this.player.setTint(0xff4444);
    this.player.setVelocity(0, 0);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAccelerationX(0);
    body.setMaxVelocityX(0);
    body.setAllowGravity(false);

    this.time.delayedCall(800, () => {
      this.respawnPlayer();
    });
  }

  private respawnPlayer() {
    this.restoreRespawnHazards();
    this.restoreAllFallingLand();
    this.isDead = false;
    const rx = this.checkpointX ?? this.spawnX;
    const ry = this.checkpointY ?? this.spawnY;
    this.player.clearTint();
    this.player.setPosition(rx, ry);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setAccelerationX(0);
    body.setMaxVelocityX(PLAYER_SPEED);
    this.player.setVelocity(0, 0);
  }

  private onCheckpoint(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    checkpoint: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    const cp = checkpoint as Phaser.Physics.Arcade.Image;
    const cx = cp.getData('spawnX') as number;
    const cy = cp.getData('spawnY') as number;

    if (cx === this.checkpointX && cy === this.checkpointY) return;

    this.checkpointX = cx;
    this.checkpointY = cy;

    this.tweens.add({
      targets: cp,
      alpha: { from: 0.6, to: 0 },
      duration: 300,
      ease: 'Linear',
    });

    const onCheckpointCb = this.registry.get('onCheckpoint') as
      | ((x: number, y: number) => void)
      | undefined;
    if (onCheckpointCb) onCheckpointCb(cx, cy);
  }

  private onWaterOverlap(
    playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    waterObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    if (this.isDead || this.finished) return;

    const player = playerObj as Phaser.Physics.Arcade.Sprite;
    const body = player.body as Phaser.Physics.Arcade.Body;
    const playerBottom = body.y + body.height;

    const water = waterObj as Phaser.Physics.Arcade.Image;
    const lethal = water.getData('lethal') as boolean | undefined;
    if (!lethal) return;
    const gridX = water.getData('gridX') as number | undefined;
    const surfaceY = gridX !== undefined
      ? this.waterSurfaceByColumn.get(gridX)
      : undefined;

    // Kill only after the player sinks at least two full tile blocks below the surface.
    const depthPx = playerBottom - (surfaceY ?? water.y - TILE / 2);
    if (depthPx >= TILE * 2) {
      this.killPlayer();
    }
  }

  private onLavaOverlap(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    _lavaObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    if (this.isDead || this.finished) return;
    this.killPlayer();
  }

  private onHazardOverlap(
    _playerObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    hazardObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    if (this.isDead || this.finished) return;

    const hazard = hazardObj as Phaser.Physics.Arcade.Image;
    const hazardType = (hazard.getData('hazardType') as string | undefined) ?? '';

    if (hazardType === 'boombox') {
      const explosionTexture = this.textures.exists('tile_texture_explosion')
        ? 'tile_texture_explosion'
        : null;
      const tileX = (hazard.getData('tileX') as number | undefined) ?? Math.round((hazard.x - TILE / 2) / TILE);
      const tileY = (hazard.getData('tileY') as number | undefined) ?? Math.round((hazard.y - TILE / 2) / TILE);
      const explosionX = tileX * TILE + TILE / 2;
      const explosionY = tileY * TILE + TILE / 2;

      const cellKey = `${tileX},${tileY}`;
      const tracked = this.boomboxHazardsByCell.get(cellKey);
      if (tracked) {
        tracked.visible.destroy();
        tracked.sensor.destroy();
        this.boomboxHazardsByCell.delete(cellKey);
      } else {
        const visibleHazard = hazard.getData('visibleHazard') as Phaser.GameObjects.Image | undefined;
        visibleHazard?.destroy();
        hazard.destroy();
      }

      if (explosionTexture) {
        const explosion = this.add
          .image(explosionX, explosionY, explosionTexture)
          .setDepth(25)
          .setDisplaySize(TILE * 1.3, TILE * 1.3)
          .setAlpha(1);
        this.tweens.add({
          targets: explosion,
          scaleX: 1.8,
          scaleY: 1.8,
          alpha: 0,
          duration: 320,
          ease: 'Cubic.Out',
          onComplete: () => explosion.destroy(),
        });
      }
    }

    this.killPlayer();
  }

  private spawnBoomboxHazard(tileX: number, tileY: number) {
    const cellKey = `${tileX},${tileY}`;
    if (this.boomboxHazardsByCell.has(cellKey)) return;

    const textureKey = this.textures.exists('tile_texture_boombox')
      ? 'tile_texture_boombox'
      : 'tile_type_boombox';
    const px = tileX * TILE;
    const py = tileY * TILE;
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;

    const visibleHazard = this.add.image(px, py, textureKey).setOrigin(0, 0);
    visibleHazard.setDisplaySize(TILE, TILE);

    const sensor = this.hazardGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
    sensor.setDisplaySize(TILE, TILE);
    sensor.setData('hazardType', 'boombox');
    sensor.setData('tileX', tileX);
    sensor.setData('tileY', tileY);
    sensor.setData('visibleHazard', visibleHazard);
    sensor.setAlpha(0);
    sensor.refreshBody();

    this.boomboxHazardsByCell.set(cellKey, { sensor, visible: visibleHazard });
  }

  private restoreRespawnHazards() {
    for (const cellKey of this.boomboxSpawnCells) {
      if (this.boomboxHazardsByCell.has(cellKey)) continue;
      const [sx, sy] = cellKey.split(',');
      const tileX = Number.parseInt(sx, 10);
      const tileY = Number.parseInt(sy, 10);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) continue;
      this.spawnBoomboxHazard(tileX, tileY);
    }
  }

  private restoreAllFallingLand() {
    this.fallingLandGroup.getChildren().forEach((child) => {
      const land = child as Phaser.Physics.Arcade.Image;
      if (this.fallingLandCrumbling.has(land) || !land.active) {
        this.resetFallingLand(land);
      }
    });
  }

  private expandRuntimeFluids(tiles: Tile[]): Tile[] {
    const byCell = new Map<string, Tile>();

    for (const tile of tiles) {
      byCell.set(`${tile.x},${tile.y}`, {
        ...tile,
        waterVariant: (tile.type === 'water' || tile.type === 'lava')
          ? (tile.waterVariant === 'flow' ? 'flow' : 'still')
          : undefined,
      });
    }

    const fluidSources = Array.from(byCell.values()).filter(
      (t) => (t.type === 'water' || t.type === 'lava') && t.waterVariant !== 'flow',
    );

    for (const src of fluidSources) {
      const belowY = src.y + 1;
      if (belowY >= WATER_RUNTIME_ROWS) continue;
      if (byCell.has(`${src.x},${belowY}`)) continue;

      for (let y = belowY; y < WATER_RUNTIME_ROWS; y++) {
        const key = `${src.x},${y}`;
        if (byCell.has(key)) break;
        byCell.set(key, {
          type: src.type,
          x: src.x,
          y,
          waterVariant: 'flow',
        });
      }
    }

    return Array.from(byCell.values()).sort((a, b) => (a.y - b.y) || (a.x - b.x));
  }

  private onFinish() {
    if (this.finished) return;
    this.finished = true;

    const elapsed = performance.now() - this.startTime;
    this.player.setTint(0x50c860);
    this.player.setVelocity(0, 0);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAccelerationX(0);
    body.setMaxVelocityX(0);
    body.setAllowGravity(false);

    // Emit finish to party room
    if (this.socket && this.partyCode) {
      this.socket.emit('player:finish', { code: this.partyCode, time: elapsed });
    }

    const { width, height } = this.scale;
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(10);

    this.tweens.add({
      targets: overlay,
      fillAlpha: 0.7,
      duration: 600,
      ease: 'Power2',
      onComplete: () => {
        const onCompleteCb = this.registry.get('onComplete') as
          | ((elapsed: number) => void)
          | undefined;
        if (onCompleteCb) onCompleteCb(elapsed);
      },
    });
  }

  private onPortalOverlap(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    portalObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    if (this.portalCooldown) return;

    const portal = portalObj as Phaser.Physics.Arcade.Image;

    const linkedId = portal.getData('linkedPortalId') as string;
    if (!linkedId) return;

    const positions = this.portalPositions.get(linkedId);
    // Require at least two portals with this ID to form a pair
    if (!positions || positions.length < 2) return;

    // Find the OTHER portal position (not the one the player is currently on)
    const myX = portal.getData('portalX') as number;
    const myY = portal.getData('portalY') as number;
    const dest = positions.find((p) => p.x !== myX || p.y !== myY);
    if (!dest) return; // both portals are at the same position — no-op

    this.portalCooldown = true;
    this.player.setPosition(dest.x, dest.y - TILE / 2);
    this.player.setVelocity(0, 0);

    this.time.delayedCall(PORTAL_COOLDOWN_MS, () => {
      this.portalCooldown = false;
    });
  }

  private onFallingLandContact(
    _player: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
    landObj: Phaser.Types.Physics.Arcade.GameObjectWithBody | Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | Phaser.Tilemaps.Tile,
  ) {
    const land = landObj as Phaser.Physics.Arcade.Image;
    if (this.fallingLandCrumbling.has(land)) return;
    this.fallingLandCrumbling.add(land);

    const crumbleTimer = this.time.delayedCall(FALL_CRUMBLE_DELAY, () => {
      const scaleTween = this.tweens.add({
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
          const respawnTimer = this.time.delayedCall(3000, () => {
            this.resetFallingLand(land);
          });
          land.setData('respawnTimer', respawnTimer);
        },
      });
      land.setData('scaleTween', scaleTween);
    });
    land.setData('crumbleTimer', crumbleTimer);
  }

  private resetFallingLand(land: Phaser.Physics.Arcade.Image) {
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

    this.fallingLandCrumbling.delete(land);
  }

  private initializeMovingBoxUnits() {
    this.movingBoxUnits.clear();
    this.movingBoxUnitDirection.clear();
    this.movingBoxUnitLastProgressCoord.clear();
    this.movingBoxUnitStuckFrames.clear();
    this.movingBoxUnitReverseCooldown.clear();

    const visited = new Set<string>();
    let unitId = 0;

    for (const [startKey] of this.movingBoxesByCell) {
      if (visited.has(startKey)) continue;

      unitId += 1;
      const queue = [startKey];
      visited.add(startKey);
      const unitBoxes: Phaser.Physics.Arcade.Image[] = [];
      const seedDirection =
        (this.movingBoxesByCell.get(startKey)?.getData('moveDirection') as MovingDirection | undefined)
        ?? 'right';

      while (queue.length > 0) {
        const key = queue.shift()!;
        const box = this.movingBoxesByCell.get(key);
        if (box) {
          unitBoxes.push(box);
          box.setData('movingUnitId', unitId);
        }

        const [sx, sy] = key.split(',').map((v) => Number(v));
        const neighbors = [
          `${sx + 1},${sy}`,
          `${sx - 1},${sy}`,
          `${sx},${sy + 1}`,
          `${sx},${sy - 1}`,
        ];

        for (const neighborKey of neighbors) {
          const neighbor = this.movingBoxesByCell.get(neighborKey);
          if (!neighbor || visited.has(neighborKey)) continue;
          const neighborDirection = (neighbor.getData('moveDirection') as MovingDirection | undefined) ?? 'right';
          if (neighborDirection !== seedDirection) continue;
          visited.add(neighborKey);
          queue.push(neighborKey);
        }
      }

      this.movingBoxUnits.set(unitId, unitBoxes);
      this.movingBoxUnitDirection.set(unitId, seedDirection);
      const progressCoord = this.getUnitProgressCoord(unitBoxes, seedDirection);
      this.movingBoxUnitLastProgressCoord.set(unitId, progressCoord);
      this.movingBoxUnitStuckFrames.set(unitId, 0);
      this.movingBoxUnitReverseCooldown.set(unitId, 0);
      const velocity = this.velocityForDirection(seedDirection);
      for (const box of unitBoxes) {
        const body = box.body as Phaser.Physics.Arcade.Body;
        body.setVelocity(velocity.x, velocity.y);
      }
    }
  }

  private updateMovingBoxUnits() {
    const worldBounds = this.physics.world.bounds;

    for (const [unitId, boxes] of this.movingBoxUnits) {
      if (boxes.length === 0) continue;

      let direction = this.movingBoxUnitDirection.get(unitId) ?? 'right';
      let shouldReverse = false;
      let cooldown = this.movingBoxUnitReverseCooldown.get(unitId) ?? 0;
      if (cooldown > 0) {
        cooldown -= 1;
      }

      for (const box of boxes) {
        const body = box.body as Phaser.Physics.Arcade.Body;
        if (!body || !body.enable) continue;

        const hitWall = direction === 'left'
          ? body.blocked.left
          : direction === 'right'
            ? body.blocked.right
            : direction === 'up'
              ? body.blocked.up
              : body.blocked.down;
        const hitBounds = direction === 'left'
          ? (box.x - TILE / 2) <= (worldBounds.x + 1)
          : direction === 'right'
            ? (box.x + TILE / 2) >= (worldBounds.right - 1)
            : direction === 'up'
              ? (box.y - TILE / 2) <= (worldBounds.y + 1)
              : (box.y + TILE / 2) >= (worldBounds.bottom - 1);
        if (hitWall || hitBounds) {
          shouldReverse = true;
          break;
        }
      }

      const progressCoord = this.getUnitProgressCoord(boxes, direction);
      const previousCoord = this.movingBoxUnitLastProgressCoord.get(unitId) ?? progressCoord;
      const movedDistance = Math.abs(progressCoord - previousCoord);

      let stuckFrames = this.movingBoxUnitStuckFrames.get(unitId) ?? 0;
      if (movedDistance < MOVING_BOX_PROGRESS_EPSILON) {
        stuckFrames += 1;
      } else {
        stuckFrames = 0;
      }

      if (stuckFrames >= MOVING_BOX_STUCK_FRAMES) {
        shouldReverse = true;
        stuckFrames = 0;
      }

      if (shouldReverse && cooldown <= 0) {
        direction = this.oppositeDirection(direction);
        cooldown = MOVING_BOX_REVERSE_COOLDOWN_FRAMES;

        // Nudge unit after reversal to break persistent contact with blockers.
        const nudge = this.velocityForDirection(direction);
        for (const box of boxes) {
          box.x += Math.sign(nudge.x) * MOVING_BOX_UNSTICK_NUDGE;
          box.y += Math.sign(nudge.y) * MOVING_BOX_UNSTICK_NUDGE;
        }
      }

      this.movingBoxUnitDirection.set(unitId, direction);
      this.movingBoxUnitLastProgressCoord.set(unitId, progressCoord);
      this.movingBoxUnitStuckFrames.set(unitId, stuckFrames);
      this.movingBoxUnitReverseCooldown.set(unitId, cooldown);
      const velocity = this.velocityForDirection(direction);

      for (const box of boxes) {
        const body = box.body as Phaser.Physics.Arcade.Body;
        if (!body || !body.enable) continue;
        body.setVelocity(velocity.x, velocity.y);
      }
    }
  }

  private velocityForDirection(direction: MovingDirection): { x: number; y: number } {
    if (direction === 'left') return { x: -MOVING_BOX_SPEED, y: 0 };
    if (direction === 'right') return { x: MOVING_BOX_SPEED, y: 0 };
    if (direction === 'up') return { x: 0, y: -MOVING_BOX_SPEED };
    return { x: 0, y: MOVING_BOX_SPEED };
  }

  private oppositeDirection(direction: MovingDirection): MovingDirection {
    if (direction === 'left') return 'right';
    if (direction === 'right') return 'left';
    if (direction === 'up') return 'down';
    return 'up';
  }

  private getUnitProgressCoord(
    boxes: Phaser.Physics.Arcade.Image[],
    direction: MovingDirection,
  ): number {
    const sum = boxes.reduce(
      (acc, box) => acc + (direction === 'left' || direction === 'right' ? box.x : box.y),
      0,
    );
    return sum / boxes.length;
  }

  // ── Multiplayer socket listeners ─────────────────────────────────────────

  private registerSocketListeners() {
    if (!this.socket) return;

    this.socket.on(
      'player:update',
      (payload: { id: string; x: number; y: number; state: string; characterKey?: string; displayName?: string }) => {
        this.updateGhost(payload.id, payload.x, payload.y, payload.state, payload.characterKey, payload.displayName);
      },
    );

    this.socket.on('player:left', (payload: { id: string }) => {
      this.removeGhost(payload.id);
    });
  }

  private updateGhost(
    id: string,
    x: number,
    y: number,
    state: string,
    characterKey?: string,
    displayName?: string,
  ) {
    // Tint reflects state while preserving full sprite visibility.
    const isDead = state === 'dead';
    const isJumping = state === 'jumping';
    const alpha = 1;
    const tint = isDead ? 0x888888 : isJumping ? 0xd4c8f0 : 0xffffff;

    let ghost = this.ghostSprites.get(id);
    if (!ghost) {
      const candidateTexture = characterKey ? `character_${characterKey}_still` : '';
      const textureKey = this.textures.exists(candidateTexture)
        ? candidateTexture
        : this.textures.exists('character_sora')
          ? 'character_sora'
          : this.textures.exists('character')
            ? 'character'
            : 'ghost';

      // Create ghost sprite without a physics body so it doesn't collide with local player.
      ghost = this.add.sprite(x, y + getCharacterRenderYOffset(characterKey), textureKey);
      ghost.setOrigin(0.5, 1.0);
      ghost.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
      ghost.setDepth(CHARACTER_SPRITE_DEPTH);
      this.ghostSprites.set(id, ghost);

      const nameplate = this.add
        .text(x, y - PLAYER_SPRITE_SIZE - 4, displayName?.trim() || 'Player', {
          fontFamily: 'Tahoma, Arial',
          fontSize: '10px',
          color: '#f3f7ff',
          backgroundColor: '#22304a',
          padding: { left: 4, right: 4, top: 1, bottom: 1 },
        })
        .setOrigin(0.5, 1)
        .setDepth(CHARACTER_NAMEPLATE_DEPTH);
      this.ghostNameplates.set(id, nameplate);
    }

    ghost.setPosition(x, y + getCharacterRenderYOffset(characterKey));
    if (state === 'running') {
      ghost.setFlipX(true);
    }
    ghost.setTint(tint);
    ghost.setAlpha(alpha);

    const nameplate = this.ghostNameplates.get(id);
    if (nameplate) {
      if (displayName && displayName.trim().length > 0 && nameplate.text !== displayName) {
        nameplate.setText(displayName);
      }
      nameplate.setPosition(x, y - PLAYER_SPRITE_SIZE - 4);
    }
  }

  private removeGhost(id: string) {
    const ghost = this.ghostSprites.get(id);
    if (ghost) {
      ghost.destroy();
      this.ghostSprites.delete(id);
    }
    const nameplate = this.ghostNameplates.get(id);
    if (nameplate) {
      nameplate.destroy();
      this.ghostNameplates.delete(id);
    }
  }

  private setColliderDebugVisible(visible: boolean) {
    this.colliderDebugVisible = visible;
    const world = this.physics.world as Phaser.Physics.Arcade.World & {
      debugGraphic?: Phaser.GameObjects.Graphics;
    };

    world.drawDebug = visible;
    if (world.debugGraphic) {
      world.debugGraphic.visible = visible;
      if (visible) {
        world.debugGraphic.clear();
      }
    }
  }

  private toggleColliderDebug() {
    this.setColliderDebugVisible(!this.colliderDebugVisible);
  }

  shutdown() {
    // Clean up all ghost sprites and labels when scene is destroyed
    this.ghostSprites.forEach((g) => g.destroy());
    this.ghostSprites.clear();
    this.ghostNameplates.forEach((t) => t.destroy());
    this.ghostNameplates.clear();
    if (this.playerNameplate) {
      this.playerNameplate.destroy();
      this.playerNameplate = null;
    }
    if (this.repeatingBackdropTextureKey && this.textures.exists(this.repeatingBackdropTextureKey)) {
      this.textures.remove(this.repeatingBackdropTextureKey);
      this.repeatingBackdropTextureKey = null;
    }
    // Remove socket listeners added by this scene
    if (this.socket) {
      this.socket.off('player:update');
      this.socket.off('player:left');
    }
  }

  updateColliderDebugToggle() {
    if (Phaser.Input.Keyboard.JustDown(this.debugToggleKey)) {
      this.toggleColliderDebug();
    }
  }
}
