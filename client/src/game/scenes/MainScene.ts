import * as Phaser from 'phaser';
import { type Tile, TILE_META } from '../../types/level';

const TILE = 32;

// Tile types that are solid platforms the player stands on
const SOLID_TYPES = new Set([
  'land', 'grass', 'demon_grass', 'ice', 'falling_land', 'ladder', 'moving_box',
]);

// Tile types that are visual-only hazards (kill behaviour added Phase 3)
const HAZARD_TYPES = new Set(['water', 'lava', 'boombox', 'laser']);

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private spawnX = TILE * 2;
  private spawnY = 0; // set dynamically

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Procedural textures — no external assets needed for Phase 2
  }

  create() {
    const { width, height } = this.scale;
    this.spawnY = height - TILE * 3;

    const tileData: Tile[] = this.registry.get('tileData') ?? [];

    // ── Background ───────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d1e3d, 0x0d1e3d, 1);
    bg.fillRect(0, 0, width * 4, height * 4); // large enough for scrolling levels

    // ── Platform group ───────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();

    if (tileData.length > 0) {
      this.buildFromTileData(tileData);
    } else {
      this.buildDefaultLevel(width, height);
    }

    // ── Player ───────────────────────────────────────────────
    const playerGfx = this.make.graphics({ x: 0, y: 0 });
    playerGfx.fillStyle(0x4db8ff, 1);
    playerGfx.fillRoundedRect(0, 0, 24, 32, 4);
    playerGfx.fillStyle(0x7ab8f5, 1);
    playerGfx.fillCircle(12, 8, 7);
    playerGfx.generateTexture('player', 24, 32);
    playerGfx.destroy();

    this.player = this.physics.add.sprite(this.spawnX, this.spawnY, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.05);
    (this.player.body as Phaser.Physics.Arcade.Body).setMaxVelocityX(250);

    this.physics.add.collider(this.player, this.platforms);

    // ── Input ────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // ── Camera ───────────────────────────────────────────────
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
    this.cameras.main.setDeadzone(width * 0.3, height * 0.3);

    // ── UI hint ──────────────────────────────────────────────
    this.add
      .text(width / 2, 16, 'Arrow keys or WASD · Space to jump', {
        fontFamily: 'Tahoma, Arial',
        fontSize: '11px',
        color: '#7ab8f5',
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);
  }

  private buildFromTileData(tiles: Tile[]) {
    // Generate one texture per tile type (reuse across all instances of same type)
    const generatedTextures = new Set<string>();

    for (const tile of tiles) {
      const meta = TILE_META[tile.type];
      const px = tile.x * TILE;
      const py = tile.y * TILE;
      const textureKey = `tile_type_${tile.type}`;

      // Generate texture only once per type
      if (!generatedTextures.has(textureKey)) {
        const gfx = this.make.graphics({ x: 0, y: 0 });
        this.drawTileGfx(gfx, tile.type, meta.color, meta.gloss);
        gfx.generateTexture(textureKey, TILE, TILE);
        gfx.destroy();
        generatedTextures.add(textureKey);
      }

      // Flag symbols (text overlay)
      let label = '';
      if (tile.type === 'flag_start')      label = 'S';
      else if (tile.type === 'flag_finish') label = 'F';
      else if (tile.type === 'flag_checkpoint') label = 'C';

      if (SOLID_TYPES.has(tile.type)) {
        // Static physics platform — platforms.create handles its own display object
        const body = this.platforms.create(px + TILE / 2, py + TILE / 2, textureKey) as Phaser.Physics.Arcade.Image;
        body.setDisplaySize(TILE, TILE);
        body.refreshBody();
      } else if (HAZARD_TYPES.has(tile.type)) {
        // Visual-only hazard (kill behaviour wired in Phase 3)
        this.add.image(px, py, textureKey).setOrigin(0, 0);
      } else {
        // Flags and special tiles: decorative only
        this.add.image(px, py, textureKey).setOrigin(0, 0);
        if (label) {
          this.add.text(px + TILE / 2, py + TILE / 2, label, {
            fontFamily: 'Tahoma, Arial',
            fontSize: '14px',
            fontStyle: 'bold',
            color: '#ffffff',
          }).setOrigin(0.5, 0.5);
        }
      }

      // Store spawn point from start flag
      if (tile.type === 'flag_start') {
        this.spawnX = px + TILE / 2;
        this.spawnY = py - TILE;
      }
    }
  }

  private drawTileGfx(gfx: Phaser.GameObjects.Graphics, type: string, color: string, gloss: string) {
    const c = Phaser.Display.Color.HexStringToColor(color).color;
    const g = Phaser.Display.Color.HexStringToColor(gloss).color;

    gfx.fillStyle(c, 1);
    gfx.fillRect(0, 0, TILE, TILE);

    // Top bevel
    gfx.fillStyle(g, 0.35);
    gfx.fillRect(0, 0, TILE, 4);

    // Bottom shadow
    gfx.fillStyle(0x000000, 0.25);
    gfx.fillRect(0, TILE - 3, TILE, 3);

    // Border
    gfx.lineStyle(1, 0x000000, 0.3);
    gfx.strokeRect(0, 0, TILE, TILE);

    // Hazard stripe (diagonals for water/lava)
    if (type === 'water' || type === 'lava') {
      gfx.lineStyle(1, 0xffffff, 0.12);
      for (let i = -TILE; i < TILE * 2; i += 8) {
        gfx.lineBetween(i, 0, i + TILE, TILE);
      }
    }

    // Portal ring
    if (type === 'portal') {
      gfx.lineStyle(2, 0xffffff, 0.5);
      gfx.strokeCircle(TILE / 2, TILE / 2, TILE / 2 - 4);
    }
  }

  private buildDefaultLevel(width: number, height: number) {
    // Fallback when no tile data is provided (demo level)
    this.buildPlatform(0, height - TILE, Math.ceil(width / TILE));
    this.buildPlatform(3, height / this.scale.height * 14, 5);
    this.buildPlatform(10, height / this.scale.height * 10, 4);
    this.buildPlatform(6, height / this.scale.height * 6, 3);
    this.spawnY = height - TILE * 3;
  }

  private buildPlatform(col: number, y: number, count: number) {
    const key = `tile_${col}_${Math.round(y)}_${count}`;
    const gfx = this.make.graphics({ x: 0, y: 0 });
    gfx.fillStyle(0x4a7fc8, 1);
    gfx.fillRect(0, 0, TILE * count, TILE);
    gfx.lineStyle(1, 0x5b8fd4, 1);
    gfx.strokeRect(0, 0, TILE * count, TILE);
    gfx.lineStyle(1, 0x8ab4e4, 0.7);
    gfx.lineBetween(1, 1, TILE * count - 1, 1);
    gfx.generateTexture(key, TILE * count, TILE);
    gfx.destroy();

    const tile = this.platforms.create(col * TILE, y, key) as Phaser.Physics.Arcade.Image;
    tile.setOrigin(0, 0);
    tile.refreshBody();
  }

  update() {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    const goLeft  = this.cursors.left.isDown  || this.wasd.left.isDown;
    const goRight = this.cursors.right.isDown || this.wasd.right.isDown;
    const jump    = Phaser.Input.Keyboard.JustDown(this.cursors.up)   ||
                    Phaser.Input.Keyboard.JustDown(this.cursors.space) ||
                    Phaser.Input.Keyboard.JustDown(this.wasd.up);

    const speed = 200;
    const accel = 900;
    const drag   = 800;

    if (goLeft) {
      body.setAccelerationX(-accel);
    } else if (goRight) {
      body.setAccelerationX(accel);
    } else {
      body.setAccelerationX(0);
      body.setDragX(drag);
    }

    if (Math.abs(body.velocity.x) > speed) {
      body.setVelocityX(Math.sign(body.velocity.x) * speed);
    }

    if (jump && onGround) {
      body.setVelocityY(-420);
    }

    if (goLeft)  this.player.setFlipX(true);
    if (goRight) this.player.setFlipX(false);
  }
}
