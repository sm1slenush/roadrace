// Базовые пропорции для логики игры (виртуальная ширина дороги)
const VIRTUAL_WIDTH = 400;
const VIRTUAL_HEIGHT = 600;
const ROAD_WIDTH_RATIO = 0.75; // Дорога занимает 75% от ширины экрана
const LANE_COUNT = 3;

let gameInstance = null;
let isGameOver = false;
let score = 0;
let gameSpeed = 300;

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    preload() {
        // Графика игрока (красная машина)
        const playerGraphics = this.make.graphics();
        playerGraphics.fillStyle(0xff0044); 
        playerGraphics.fillRect(0, 0, 40, 70);
        playerGraphics.fillStyle(0x333333); 
        playerGraphics.fillRect(5, 15, 30, 15);
        playerGraphics.fillStyle(0xffff00); 
        playerGraphics.fillRect(5, 5, 8, 5);
        playerGraphics.fillRect(27, 5, 8, 5);
        playerGraphics.generateTexture('playerTex', 40, 70);

        // Графика врага (синяя машина)
        const enemyGraphics = this.make.graphics();
        enemyGraphics.fillStyle(0x0044ff); 
        enemyGraphics.fillRect(0, 0, 40, 70);
        enemyGraphics.fillStyle(0x333333); 
        enemyGraphics.fillRect(5, 45, 30, 15);
        enemyGraphics.fillStyle(0xcc0000); 
        enemyGraphics.fillRect(5, 60, 8, 5);
        enemyGraphics.fillRect(27, 60, 8, 5);
        enemyGraphics.generateTexture('enemyTex', 40, 70);

        // Графика разметки
        const lineGraphics = this.make.graphics();
        lineGraphics.fillStyle(0xffffff);
        lineGraphics.fillRect(0, 0, 10, 40);
        lineGraphics.generateTexture('lineTex', 10, 40);
    }

    create() {
        isGameOver = false;
        score = 0;
        gameSpeed = 300;
        updateUI();
        
        const gameOverScreen = document.getElementById('game-over-screen');
        if (gameOverScreen) gameOverScreen.style.display = 'none';

        // === АДАПТАЦИЯ ПОД РАЗМЕР ЭКРАНА ===
        const gameWidth = this.scale.width;
        const gameHeight = this.scale.height;
        
        // Рассчитываем ширину дороги в зависимости от текущего экрана
        const roadWidth = Math.min(gameWidth * 0.9, 800); // Максимум 800px, или 90% экрана
        const laneWidth = roadWidth / LANE_COUNT;
        const roadX = (gameWidth - roadWidth) / 2;

        // Рисуем фон дороги
        this.roadBase = this.add.graphics();
        this.roadBase.fillStyle(0x555555);
        this.roadBase.fillRect(roadX, 0, roadWidth, gameHeight);
        this.roadBase.lineStyle(4, 0xffffff);
        this.roadBase.strokeRect(roadX, 0, roadWidth, gameHeight);
        this.roadBase.setDepth(0);

        // Сохраняем параметры дороги для использования в update/spawn
        this.roadData = { x: roadX, width: roadWidth, laneWidth: laneWidth };

        // Группа разметки
        this.roadLines = this.physics.add.group();
        this.roadLines.setDepth(1); 

        // Спавним начальную разметку
        for (let i = -1; i < 10; i++) {
            this.spawnRoadLine(i * 100);
        }

        // Создаем игрока по центру дороги внизу
        this.player = this.physics.add.sprite(gameWidth / 2, gameHeight - 150, 'playerTex');
        this.player.setCollideWorldBounds(true);
        
        // Ограничиваем движение игрока только дорогой
        this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(roadX, 0, roadWidth, gameHeight));
        this.player.setDepth(10);

        // Группа врагов
        this.enemies = this.physics.add.group();
        this.enemies.setDepth(10);

        // Управление
        this.cursors = this.input.keyboard.createCursorKeys();
        // Добавляем управление A/D и стрелками
        this.keys = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.LEFT,
            right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            d: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.physics.add.collider(this.player, this.enemies, this.hitEnemy, null, this);

        // Таймер спавна врагов
        this.enemyTimer = this.time.addEvent({
            delay: 1000,
            callback: this.spawnEnemy,
            callbackScope: this,
            loop: true
        });
        
        // Обработка изменения размера окна (если пользователь крутит браузер)
        this.scale.on('resize', this.handleResize, this);
    }

    handleResize(gameSize) {
        // Перерисовываем дорогу при изменении размера окна
        const gameWidth = gameSize.width;
        const gameHeight = gameSize.height;
        const roadWidth = Math.min(gameWidth * 0.9, 800);
        const roadX = (gameWidth - roadWidth) / 2;
        
        this.roadBase.clear();
        this.roadBase.fillStyle(0x555555);
        this.roadBase.fillRect(roadX, 0, roadWidth, gameHeight);
        this.roadBase.lineStyle(4, 0xffffff);
        this.roadBase.strokeRect(roadX, 0, roadWidth, gameHeight);

        this.roadData = { x: roadX, width: roadWidth, laneWidth: roadWidth / LANE_COUNT };
        
        // Обновляем границы игрока
        this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(roadX, 0, roadWidth, gameHeight));
        // Центрируем игрока, если он оказался за пределами новой дороги
        if (this.player.x < roadX || this.player.x > roadX + roadWidth) {
            this.player.x = gameWidth / 2;
        }
        this.player.y = gameHeight - 150;
    }

    spawnRoadLine(yPos) {
        if (!this.roadData) return;
        const { x: roadX, laneWidth } = this.roadData;
        
        const line1X = roadX + laneWidth;
        const line2X = roadX + laneWidth * 2;

        let l1 = this.roadLines.create(line1X - 5, yPos, 'lineTex');
        let l2 = this.roadLines.create(line2X - 5, yPos, 'lineTex');
        
        // Отключаем физику для разметки, чтобы не сталкивалась
        if (l1) l1.body.enable = false;
        if (l2) l2.body.enable = false;
    }

    spawnEnemy() {
        if (isGameOver || !this.roadData) return;
        
        const { x: roadX, laneWidth } = this.roadData;
        const lane = Phaser.Math.Between(0, LANE_COUNT - 1);
        const laneX = roadX + (lane * laneWidth) + (laneWidth / 2);

        const enemy = this.enemies.create(laneX, -100, 'enemyTex');
        if (enemy) {
            enemy.setVelocityY(gameSpeed);
            enemy.speedOffset = Phaser.Math.Between(-20, 20);
        }
    }

    update(time, delta) {
        if (isGameOver) return;

        const deltaTimeInSeconds = delta / 1000;
        const moveSpeed = 600; // Чуть быстрее для больших экранов

        // Управление
        if (this.cursors.left.isDown || this.keys.a.isDown) {
            this.player.x -= moveSpeed * deltaTimeInSeconds;
        } else if (this.cursors.right.isDown || this.keys.d.isDown) {
            this.player.x += moveSpeed * deltaTimeInSeconds;
        }

        // Движение разметки
        this.roadLines.children.iterate((line) => {
            if (line) {
                line.y += gameSpeed * deltaTimeInSeconds;
                if (line.y > this.scale.height + 50) {
                    line.y = -50;
                }
            }
        });

        // Движение врагов
        this.enemies.children.iterate((enemy) => {
            if (enemy) {
                enemy.setVelocityY(gameSpeed + enemy.speedOffset);
                
                if (enemy.y > this.scale.height + 100) {
                    enemy.destroy();
                    score += 10;
                    
                    if (score % 100 === 0) {
                        gameSpeed += 50;
                        this.enemyTimer.delay = Math.max(500, 1500 - (score / 2));
                    }
                    updateUI();
                }
            }
        });
    }

    hitEnemy(player, enemy) {
        this.physics.pause();
        isGameOver = true;
        player.setTint(0xff0000);
        
        const finalScoreEl = document.getElementById('finalScoreEl');
        const gameOverScreen = document.getElementById('game-over-screen');
        
        if (finalScoreEl) finalScoreEl.innerText = score;
        if (gameOverScreen) gameOverScreen.style.display = 'flex';
    }
}

const config = {
    type: Phaser.AUTO,
    // Устанавливаем начальный размер, но Scale Manager растянет его
    width: 800, 
    height: 600,
    parent: document.body, // Привязываем к body
    backgroundColor: '#222',
    scale: {
        mode: Phaser.Scale.FIT, // Самое важное: подстраивает игру под размер экрана
        autoCenter: Phaser.Scale.CENTER_BOTH, // Центрирует, если остаются поля
        width: '100%',
        height: '100%'
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: MainScene
};

function startGame() {
    if (gameInstance) {
        gameInstance.destroy(true);
    }
    gameInstance = new Phaser.Game(config);
}

function updateUI() {
    const scoreEl = document.getElementById('scoreEl');
    const speedEl = document.getElementById('speedEl');
    if (scoreEl) scoreEl.innerText = score;
    if (speedEl) speedEl.innerText = (gameSpeed / 300).toFixed(1) + 'x';
}

window.restartGame = function() {
    startGame();
};

// Запуск при загрузке
startGame();