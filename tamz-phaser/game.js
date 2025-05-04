var config = {
    type: Phaser.AUTO,
    width: Math.min(window.innerWidth, window.outerWidth),
    height: Math.min(window.innerHeight, window.outerHeight),
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    debug: true
};

var game = new Phaser.Game(config);

var backgroundLayer;
var collisionLayer;
var itemsLayer;

var map;
var coinsCollected = 0;
var bestCollected = 0;
var text;
var scoreText;
var player;
var items;
var bombs = [];
var bombGroup;
var gameOver = false;
var move_ctl = false;
var left, right, up, down;
var scoreDecrementTimer;
var lastCoinTime = 0;
var isCollision;
var music;
var soundEffects = {
    coin: null,
    bomb: null,
    wall: null
};
var soundEnabled = true;
var soundToggleButton;
var saveButton;
var loadButton;
var accelerometerControls = false;
var tiltControls = {
    x: 0,
    y: 0
};

function preload() {
    this.load.spritesheet('robot', 'assets/lego.png', { frameWidth: 37, frameHeight: 48 });
    this.load.spritesheet('items', 'assets/items.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('tiles', 'assets/map_tiles.png');
    this.load.tilemapTiledJSON('json_map', 'assets/json_map.json');
    this.load.image('bomb', 'assets/bomb.png');

    // Load sounds
    this.load.audio('backgroundMusic', 'assets/sounds/background.mp3');
    this.load.audio('coinSound', 'assets/sounds/coin.ogg');
    this.load.audio('bombSound', 'assets/sounds/bomb.ogg');
    this.load.audio('wallSound', 'assets/sounds/wall.ogg');
}

function create() {
    // Load best score from localStorage
    bestCollected = localStorage.getItem('bestScore') || 0;

    isCollision = 0;
    map = this.make.tilemap({ key: 'json_map' });
    var tiles = map.addTilesetImage('map_tiles', 'tiles');

    backgroundLayer = map.createDynamicLayer('background', tiles, 0, 0);
    collisionLayer = map.createDynamicLayer('collision', tiles, 0, 0).setVisible(false);
    collisionLayer.setCollisionByExclusion([-1]);

    // Create items group
    items = this.physics.add.group();
    createItems.call(this);

    player = this.physics.add.sprite(100, 450, 'robot');
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    // Set up collisions
    this.physics.add.collider(player, collisionLayer, hitWall, null, this);
    this.physics.add.overlap(player, items, collisionHandler, null, this);

    // Create bombs group
    bombGroup = this.physics.add.group();
    createBomb.call(this);

    // Set up bomb collisions
    this.physics.add.collider(bombGroup, collisionLayer, bombHitWall, null, this);
    this.physics.add.overlap(player, bombGroup, hitBomb, null, this);

    // Camera follow player
    this.cameras.main.startFollow(player);

    // Create UI text
    scoreText = this.add.text(16, 16, '', {
        fontSize: '24px',
        fontFamily: 'Arial',
        fill: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 }
    });
    scoreText.setScrollFactor(0);

    soundToggleButton = createButton(this, 20, 20, 'Sound: ON', toggleSound);
    saveButton = createButton(this, 20, 70, 'Save Game', saveGameState);
    loadButton = createButton(this, 20, 120, 'Load Game', loadGameState);

    // Initialize sounds
    music = this.sound.add('backgroundMusic', { loop: true });
    soundEffects.coin = this.sound.add('coinSound');
    soundEffects.bomb = this.sound.add('bombSound');
    soundEffects.wall = this.sound.add('wallSound');

    // Play music if sound is enabled
    if (soundEnabled) {
        music.play();
    }

    // Create animations
    this.anims.create({
        key: 'run',
        frames: this.anims.generateFrameNumbers('robot', { start: 0, end: 16 }),
        frameRate: 20,
        repeat: -1
    });

    // Set up controls
    cursors = this.input.keyboard.createCursorKeys();

    // Add keyboard controls for sound toggle (M key)
    this.input.keyboard.on('keydown-M', toggleSound);

    // Add accelerometer controls if available
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleOrientation, true);
        accelerometerControls = true;
    }

    this.input.on('pointerdown', function (pointer) {
        move_ctl = true;
        pointer_move(pointer);
    });
    this.input.on('pointerup', function (pointer) { move_ctl = false; reset_move() });
    this.input.on('pointermove', pointer_move);

    window.addEventListener('resize', function (event) {
        resize(Math.min(window.innerWidth, window.outerWidth), Math.min(window.innerHeight, window.outerHeight));
    }, false);

    resize(Math.min(window.innerWidth, window.outerWidth), Math.min(window.innerHeight, window.outerHeight));

    // Start score decrement timer
    lastCoinTime = this.time.now;
    scoreDecrementTimer = this.time.addEvent({
        delay: 10000, // 10 seconds
        callback: decrementScore,
        callbackScope: this,
        loop: true
    });

    updateText();
}

function createButton(scene, x, y, text, action) {
    const container = document.getElementById('ui-container');
    if (!container) return null;

    const button = document.createElement('button');
    button.textContent = text;
    button.style.position = 'absolute';
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.width = '150px';
    button.style.height = '40px';
    button.style.backgroundColor = '#333333';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '18px';
    button.style.fontFamily = 'Arial';
    button.style.zIndex = '1000';

    // Hover effects
    button.addEventListener('mouseover', () => {
        button.style.backgroundColor = '#555555';
    });
    button.addEventListener('mouseout', () => {
        button.style.backgroundColor = '#333333';
    });

    // Click handler
    button.addEventListener('click', () => {
        action.call(scene);
    });

    container.appendChild(button);
    return button;
}

function createItems() {
    // Clear existing items
    items.clear(true, true);

    // Create 10 coins at random positions
    for (let i = 0; i < 10; i++) {
        let x = Phaser.Math.Between(50, map.widthInPixels - 50);
        let y = Phaser.Math.Between(50, map.heightInPixels - 50);
        let item = items.create(x, y, 'items', Phaser.Math.Between(0, 118));
        item.setScale(0.5);
        item.setBounce(0.5);
        item.setCollideWorldBounds(true);
    }
}

function createBomb() {
    // Add a new bomb every 10 seconds
    this.time.delayedCall(10000, createBomb, [], this);

    // Don't add more than 3 bombs
    if (bombGroup.getLength() >= 3) return;

    let x = Phaser.Math.Between(50, map.widthInPixels - 50);
    let y = Phaser.Math.Between(50, map.heightInPixels - 50);
    let bomb = bombGroup.create(x, y, 'bomb');
    bomb.setScale(0.5);
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);

    // Set random velocity
    bomb.setVelocity(
        Phaser.Math.Between(-100, 100),
        Phaser.Math.Between(-100, 100)
    );
}

function bombHitWall(bomb, wall) {
    if (soundEnabled) soundEffects.wall.play();

    // Change direction when hitting walls
    if (Math.abs(bomb.body.velocity.x) < 50) {
        bomb.setVelocityX(bomb.body.velocity.x * 1.5);
    }
    if (Math.abs(bomb.body.velocity.y) < 50) {
        bomb.setVelocityY(bomb.body.velocity.y * 1.5);
    }
}

function hitBomb(player, bomb) {
    if (gameOver) return;

    if (soundEnabled) soundEffects.bomb.play();

    // Lose 5 points when hitting a bomb
    coinsCollected = Math.max(0, coinsCollected - 5);
    updateText();

    // Flash player red
    player.setTint(0xff0000);
    this.time.delayedCall(500, () => player.clearTint(), [], this);

    // Destroy the bomb
    bomb.disableBody(true, true);
}

function hitWall() {
    if (soundEnabled) soundEffects.wall.play();
}

function collisionHandler(player, item) {
    if (gameOver) return;

    // Play coin sound
    if (soundEnabled) soundEffects.coin.play();

    // Update score
    coinsCollected += 1;
    lastCoinTime = this.time.now;
    updateText();

    // Remove the item
    item.disableBody(true, true);

    // Create a new item if we're running low
    if (items.getLength() < 3) {
        createItems.call(this);
    }

    // Update best score if needed
    if (coinsCollected > bestCollected) {
        bestCollected = coinsCollected;
        localStorage.setItem('bestScore', bestCollected);
    }
}

function decrementScore() {
    if (this.time.now - lastCoinTime > 10000 && coinsCollected > 0) {
        coinsCollected = Math.max(0, coinsCollected - 1);
        updateText();
    }
}

function updateText() {
    scoreText.setText(`Score: ${coinsCollected}\nBest: ${bestCollected}`);
}

function toggleSound() {
    soundEnabled = !soundEnabled;

    // Update the button text
    if (soundToggleButton) {
        soundToggleButton.textContent = `Sound: ${soundEnabled ? 'ON' : 'OFF'}`;
    }

    // Handle background music
    if (soundEnabled) {
        if (!music.isPlaying) {
            music.play();
        }
        music.setVolume(1); // Set volume to full
    } else {
        music.setVolume(0); // Mute the music
    }

    // Update all sound effects
    for (const key in soundEffects) {
        if (soundEffects[key]) {
            soundEffects[key].setVolume(soundEnabled ? 1 : 0);
        }
    }
}

function saveGameState() {
    const gameState = {
        player: {
            x: player.x,
            y: player.y,
            velocity: {
                x: player.body.velocity.x,
                y: player.body.velocity.y
            }
        },
        coinsCollected: coinsCollected,
        items: items.getChildren().map(item => ({
            x: item.x,
            y: item.y,
            frame: item.frame.name
        })),
        bombs: bombGroup.getChildren().map(bomb => ({
            x: bomb.x,
            y: bomb.y,
            velocity: {
                x: bomb.body.velocity.x,
                y: bomb.body.velocity.y
            }
        })),
        time: this.time.now
    };

    localStorage.setItem('gameState', JSON.stringify(gameState));

    // Show saved message
    const savedText = this.add.text(player.x, player.y - 50, 'Game Saved!', {
        fontSize: '24px',
        fill: '#00ff00'
    });
    this.time.delayedCall(1000, () => savedText.destroy(), [], this);
}

function loadGameState() {
    const savedState = localStorage.getItem('gameState');
    if (!savedState) return;

    const gameState = JSON.parse(savedState);

    // Restore player
    player.setPosition(gameState.player.x, gameState.player.y);
    player.setVelocity(gameState.player.velocity.x, gameState.player.velocity.y);

    // Restore coins
    coinsCollected = gameState.coinsCollected;

    // Restore items
    items.clear(true, true);
    gameState.items.forEach(itemData => {
        let item = items.create(itemData.x, itemData.y, 'items', itemData.frame);
        item.setScale(0.5);
        item.setBounce(0.5);
        item.setCollideWorldBounds(true);
    });

    // Restore bombs
    bombGroup.clear(true, true);
    gameState.bombs.forEach(bombData => {
        let bomb = bombGroup.create(bombData.x, bombData.y, 'bomb');
        bomb.setScale(0.5);
        bomb.setBounce(1);
        bomb.setCollideWorldBounds(true);
        bomb.setVelocity(bombData.velocity.x, bombData.velocity.y);
    });

    // Update last coin time
    lastCoinTime = this.time.now - (this.time.now - gameState.time);

    updateText();

    // Show loaded message
    const loadedText = this.add.text(player.x, player.y - 50, 'Game Loaded!', {
        fontSize: '24px',
        fill: '#00ff00'
    });
    this.time.delayedCall(1000, () => loadedText.destroy(), [], this);
}

function handleOrientation(event) {
    if (!accelerometerControls) return;

    // Get tilt values
    tiltControls.x = event.gamma;  // -90 to 90 (left to right)
    tiltControls.y = event.beta;   // -180 to 180 (top to bottom)

    // Normalize values
    tiltControls.x = Phaser.Math.Clamp(tiltControls.x / 30, -1, 1);
    tiltControls.y = Phaser.Math.Clamp(tiltControls.y / 30, -1, 1);
}

function pointer_move(pointer) {
    var dx = dy = 0;
    var min_pointer = (player.body.width + player.body.height) / 4;

    if (move_ctl) {
        reset_move();
        dx = (pointer.x / map.scene.cameras.main.zoom - player.x);
        dy = (pointer.y / map.scene.cameras.main.zoom - player.y);

        if (Math.abs(dx) > min_pointer) {
            left = (dx < 0);
            right = !left;
        } else {
            left = right = false;
        }
        if (Math.abs(dy) > min_pointer) {
            up = (dy < 0);
            down = !up;
        } else {
            up = down = false;
        }
    }
}

function reset_move() {
    up = down = left = right = false;
}

function update() {
    if (gameOver) return;

    // Handle accelerometer controls if enabled
    if (accelerometerControls) {
        reset_move();

        if (tiltControls.x < -0.2) left = true;
        if (tiltControls.x > 0.2) right = true;
        if (tiltControls.y < -0.2) up = true;
        if (tiltControls.y > 0.2) down = true;
    }

    // Handle touch controls
    if (move_ctl) {
        pointer_move(game.input.activePointer);
    }

    // Horizontal movement
    if (cursors.left.isDown || left) {
        player.body.setVelocityX(-200);
        player.angle = 90;
        player.anims.play('run', true);
    } else if (cursors.right.isDown || right) {
        player.body.setVelocityX(200);
        player.angle = 270;
        player.anims.play('run', true);
    } else {
        player.body.setVelocityX(0);
    }

    // Vertical movement
    if (cursors.up.isDown || up) {
        player.body.setVelocityY(-200);
        player.angle = 180;
        player.anims.play('run', true);
    } else if (cursors.down.isDown || down) {
        player.body.setVelocityY(200);
        player.anims.play('run', true);
        player.angle = 0;
    } else {
        player.body.setVelocityY(0);
    }

    // Stop animation when not moving
    if (player.body.velocity.x === 0 && player.body.velocity.y === 0) {
        player.anims.stop();
    }

    // Make one bomb follow the player after 15 seconds
    if (this.time.now > 15000 && bombGroup.getLength() > 0) {
        const follower = bombGroup.getChildren()[0];
        const angle = Phaser.Math.Angle.Between(follower.x, follower.y, player.x, player.y);
        follower.setVelocity(
            Math.cos(angle) * 100,
            Math.sin(angle) * 100
        );
    }
}

function resize(width, height) {
    game.scale.resize(width, height);

    // Position buttons in the top-right corner
    if (soundToggleButton) {
        soundToggleButton.style.left = `${width - 170}px`;
        soundToggleButton.style.top = '20px';
    }
    if (saveButton) {
        saveButton.style.left = `${width - 170}px`;
        saveButton.style.top = '70px';
    }
    if (loadButton) {
        loadButton.style.left = `${width - 170}px`;
        loadButton.style.top = '120px';
    }
}

window.addEventListener('beforeunload', function() {
    const container = document.getElementById('ui-container');
    if (container) {
        container.innerHTML = '';
    }
});