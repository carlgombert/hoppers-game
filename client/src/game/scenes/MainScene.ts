import * as Phaser from 'phaser';
import { type Socket } from 'socket.io-client';
import { type Tile, TILE_META } from '../../types/level';
import { DEMO_LEVEL_TILES } from '../demoLevel';

const TILE = 40;
const PLAYER_W_GROUNDED = 40;
const PLAYER_W_AIRBORNE = 28;
const PLAYER_H = 56;
const PLAYER_SPRITE_SIZE = 64;
const PLAYER_SPEED = 200;
const PLAYER_ACCEL = 900;
const PLAYER_DRAG = 800;
const JUMP_VELOCITY = -420;
const ICE_DRAG = 80;
const ICE_ACCEL = 400;
const MOVING_BOX_SPEED = 80;
const FALL_CRUMBLE_DELAY = 400;

export class MainScene extends Phaser.Scene {
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingBoxGroup!: Phaser.Physics.Arcade.Group;
  private hazardGroup!: Phaser.Physics.Arcade.StaticGroup;
  private checkpointGroup!: Phaser.Physics.Arcade.StaticGroup;
  private finishGroup!: Phaser.Physics.Arcade.StaticGroup;
  private portalGroup!: Phaser.Physics.Arcade.StaticGroup;
  private ladderGroup!: Phaser.Physics.Arcade.StaticGroup;
  private iceGroup!: Phaser.Physics.Arcade.StaticGroup;
  private fallingLandGroup!: Phaser.Physics.Arcade.StaticGroup;

  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  private spawnX = TILE * 2;
  private spawnY = TILE * 2 - PLAYER_H / 2;
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

  private fallingLandCrumbling = new Set<Phaser.Physics.Arcade.Image>();

  // ── Multiplayer ghost sprites ──────────────────────────────────────────────
  private socket: Socket | null = null;
  private partyCode: string | null = null;
  private ghostSprites = new Map<string, Phaser.GameObjects.Rectangle>();
  private moveEmitCounter = 0;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Load game-asset URLs passed from GameCanvas via game.registry
    const urls = this.registry.get('assetUrls') as Record<string, string> | null;
    if (urls) {
      // Load the selected character sprite under the key 'character'
      if (urls.character) this.load.image('character', urls.character);
      if (urls.land) this.load.image('tile_texture_land', urls.land);
      if (urls.grass) this.load.image('tile_texture_grass', urls.grass);
      if (urls.demon_grass) this.load.image('tile_texture_demon_grass', urls.demon_grass);
      if (urls.ladder) this.load.image('tile_texture_ladder', urls.ladder);
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
    const activeTiles = tileData.length > 0 ? tileData : DEMO_LEVEL_TILES;
    this.killPlaneY = this.computeKillPlaneY(activeTiles, height);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d1e3d, 0x0d1e3d, 1);
    bg.fillRect(0, 0, Math.max(width * 4, 2000), Math.max(height * 4, 2000));

    this.platforms       = this.physics.add.staticGroup();
    this.movingBoxGroup  = this.physics.add.group();
    this.hazardGroup     = this.physics.add.staticGroup();
    this.checkpointGroup = this.physics.add.staticGroup();
    this.finishGroup     = this.physics.add.staticGroup();
    this.portalGroup     = this.physics.add.staticGroup();
    this.ladderGroup     = this.physics.add.staticGroup();
    this.iceGroup        = this.physics.add.staticGroup();
    this.fallingLandGroup = this.physics.add.staticGroup();

    if (tileData.length > 0) {
      this.buildFromTileData(tileData);
      // If tile data was provided but no flag_start tile was found, show a visible error
      if (!this.flagStartFound) {
        this.showNoStartFlagError(width, height);
        return;
      }
    } else {
      // No tile data supplied — load the built-in demo level
      this.buildFromTileData(DEMO_LEVEL_TILES);
    }

    // Player texture: use the selected character sprite if loaded, otherwise generate a placeholder
    const playerTexKey = this.textures.exists('character') ? 'character' : 'player';
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

    this.player = this.physics.add.sprite(startX, startY, playerTexKey);
    // Keep character art square at native 64x64 so images are not squeezed.
    this.player.setDisplaySize(PLAYER_SPRITE_SIZE, PLAYER_SPRITE_SIZE);
    this.player.setCollideWorldBounds(false);
    this.player.setBounce(0);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    this.setPlayerColliderWidth(PLAYER_W_GROUNDED);
    playerBody.setMaxVelocityX(PLAYER_SPEED);
    playerBody.setMaxVelocityY(800); // prevent tunnelling through platform tiles

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.fallingLandGroup, this.onFallingLandContact, undefined, this);
    this.physics.add.collider(this.player, this.movingBoxGroup);
    this.physics.add.collider(this.movingBoxGroup, this.platforms); // needed for blocked.left/right reversal

    this.physics.add.overlap(this.player, this.hazardGroup, () => this.killPlayer(), undefined, this);
    this.physics.add.overlap(this.player, this.checkpointGroup, this.onCheckpoint, undefined, this);
    this.physics.add.overlap(this.player, this.finishGroup, this.onFinish, undefined, this);
    this.physics.add.overlap(this.player, this.portalGroup, this.onPortalOverlap, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.debugToggleKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);

    this.setColliderDebugVisible(true);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(width * 0.3, height * 0.3);

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
          const land = this.fallingLandGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
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
          const boxBody = box.body as Phaser.Physics.Arcade.Body;
          boxBody.setAllowGravity(false);
          boxBody.setVelocityX(MOVING_BOX_SPEED);
          break;
        }

        case 'water':
        case 'lava':
        case 'boombox':
        case 'laser': {
          this.add.image(px, py, textureKey).setOrigin(0, 0);
          const haz = this.hazardGroup.create(cx, cy, textureKey) as Phaser.Physics.Arcade.Image;
          haz.setDisplaySize(TILE, TILE);
          haz.setAlpha(0);
          haz.refreshBody();
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
      if (
        body.x + body.width > lb.x &&
        body.x < lb.x + lb.width &&
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

    this.movingBoxGroup.getChildren().forEach((child) => {
      const box = child as Phaser.Physics.Arcade.Image;
      const boxBody = box.body as Phaser.Physics.Arcade.Body;
      // Reverse direction on wall collision OR world-bounds edge — but flip only once per frame
      const hitWall = boxBody.blocked.left || boxBody.blocked.right;
      const { width } = this.scale;
      const hitBounds = box.x < TILE || box.x > width - TILE;
      if (hitWall || hitBounds) {
        boxBody.setVelocityX(-boxBody.velocity.x);
      }
    });

    const goLeft  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const goRight = this.cursors.right.isDown || this.wasd.right.isDown;
    const goUp    = this.cursors.up.isDown    || this.wasd.up.isDown;
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up)   ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
                    Phaser.Input.Keyboard.JustDown(this.wasd.up);

    const accel = this.isOnIce ? ICE_ACCEL : PLAYER_ACCEL;
    const drag  = this.isOnIce ? ICE_DRAG  : PLAYER_DRAG;

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

    if (goLeft)  this.player.setFlipX(false);
    if (goRight) this.player.setFlipX(true);

    if (this.player.y > this.killPlaneY) {
      this.killPlayer();
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

  private setPlayerColliderWidth(width: number) {
    if (!this.player || this.currentPlayerColliderW === width) return;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setSize(width, PLAYER_H, false);
    playerBody.setOffset((PLAYER_SPRITE_SIZE - width) / 2, PLAYER_SPRITE_SIZE - PLAYER_H);
    this.currentPlayerColliderW = width;
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
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

    this.time.delayedCall(800, () => {
      this.respawnPlayer();
    });
  }

  private respawnPlayer() {
    this.isDead = false;
    const rx = this.checkpointX ?? this.spawnX;
    const ry = this.checkpointY ?? this.spawnY;
    this.player.clearTint();
    this.player.setPosition(rx, ry);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(true);
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

  private onFinish() {
    if (this.finished) return;
    this.finished = true;

    const elapsed = performance.now() - this.startTime;
    this.player.setTint(0x50c860);
    this.player.setVelocity(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);

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

    this.time.delayedCall(600, () => {
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

    this.time.delayedCall(FALL_CRUMBLE_DELAY, () => {
      this.tweens.add({
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
          this.time.delayedCall(3000, () => {
            land.setActive(true);
            land.setVisible(true);
            land.setAlpha(1);
            land.setScale(1);
            (land.body as Phaser.Physics.Arcade.StaticBody).enable = true;
            (land.body as Phaser.Physics.Arcade.StaticBody).reset(
              land.getData('originalX') as number,
              land.getData('originalY') as number,
            );
            this.fallingLandCrumbling.delete(land);
          });
        },
      });
    });
  }

  // ── Multiplayer socket listeners ─────────────────────────────────────────

  private registerSocketListeners() {
    if (!this.socket) return;

    this.socket.on(
      'player:update',
      (payload: { id: string; x: number; y: number; state: string }) => {
        this.updateGhost(payload.id, payload.x, payload.y, payload.state);
      },
    );

    this.socket.on('player:left', (payload: { id: string }) => {
      this.removeGhost(payload.id);
    });
  }

  private updateGhost(id: string, x: number, y: number, state: string) {
    // Color and alpha per animation state
    const isDead = state === 'dead';
    const isJumping = state === 'jumping';
    const fillColor = isDead ? 0x888888 : isJumping ? 0xd4c8f0 : 0xb9add6;
    const alpha = isDead ? 0.25 : 0.55;

    let ghost = this.ghostSprites.get(id);
    if (!ghost) {
      // Create ghost rectangle — no physics body, so no collision with local player
      ghost = this.add.rectangle(x, y, PLAYER_W_GROUNDED, PLAYER_H, fillColor, alpha) as unknown as Phaser.GameObjects.Rectangle;
      (ghost as unknown as Phaser.GameObjects.Rectangle).setStrokeStyle(1, 0xd4c8f0, 0.7);
      (ghost as unknown as Phaser.GameObjects.Rectangle).setDepth(5);
      this.ghostSprites.set(id, ghost);
    }

    ghost.setPosition(x, y);
    (ghost as unknown as Phaser.GameObjects.Rectangle).setFillStyle(fillColor, alpha);
  }

  private removeGhost(id: string) {
    const ghost = this.ghostSprites.get(id);
    if (ghost) {
      ghost.destroy();
      this.ghostSprites.delete(id);
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
