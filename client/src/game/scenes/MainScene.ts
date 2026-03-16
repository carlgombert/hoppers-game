import * as Phaser from 'phaser';

const TILE = 32;

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };
  private platforms!: Phaser.Physics.Arcade.StaticGroup;

  constructor() {
    super({ key: 'MainScene' });
  }

  preload() {
    // Procedurally generate placeholder graphics so we don't need real assets yet
    // They'll be replaced by sprite sheets in Phase 3
  }

  create() {
    const { width, height } = this.scale;

    // ── Background sky gradient ──────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a1628, 0x0a1628, 0x0d1e3d, 0x0d1e3d, 1);
    bg.fillRect(0, 0, width, height);

    // ── Stars (decorative) ───────────────────────────────────
    const stars = this.add.graphics();
    stars.fillStyle(0xffffff, 0.6);
    for (let i = 0; i < 60; i++) {
      const sx = Phaser.Math.Between(0, width);
      const sy = Phaser.Math.Between(0, height * 0.7);
      const r  = Math.random() < 0.2 ? 1.5 : 0.8;
      stars.fillCircle(sx, sy, r);
    }

    // ── Platforms ────────────────────────────────────────────
    this.platforms = this.physics.add.staticGroup();
    this.buildPlatform(0, height - TILE, Math.ceil(width / TILE)); // ground
    this.buildPlatform(3, height / this.scale.height * 14, 5);     // lower ledge
    this.buildPlatform(10, height / this.scale.height * 10, 4);    // mid ledge
    this.buildPlatform(6, height / this.scale.height * 6, 3);      // upper ledge

    // ── Player ───────────────────────────────────────────────
    const playerGfx = this.make.graphics({ x: 0, y: 0 });
    playerGfx.fillStyle(0x4db8ff, 1);
    playerGfx.fillRoundedRect(0, 0, 24, 32, 4);
    playerGfx.fillStyle(0x7ab8f5, 1);
    playerGfx.fillCircle(12, 8, 7); // head
    playerGfx.generateTexture('player', 24, 32);
    playerGfx.destroy();

    this.player = this.physics.add.sprite(TILE * 2, height - TILE * 3, 'player');
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

  private buildPlatform(col: number, y: number, count: number) {
    const gfx = this.make.graphics({ x: 0, y: 0 });
    const key = `tile_${col}_${Math.round(y)}_${count}`;

    // Land tile: classic XP blue-panel look
    gfx.fillStyle(0x4a7fc8, 1);
    gfx.fillRect(0, 0, TILE * count, TILE);
    gfx.lineStyle(1, 0x5b8fd4, 1);
    gfx.strokeRect(0, 0, TILE * count, TILE);
    // Top bevel
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

    // Clamp speed
    if (Math.abs(body.velocity.x) > speed) {
      body.setVelocityX(Math.sign(body.velocity.x) * speed);
    }

    if (jump && onGround) {
      body.setVelocityY(-420);
    }

    // Flip sprite direction
    if (goLeft)  this.player.setFlipX(true);
    if (goRight) this.player.setFlipX(false);
  }
}
