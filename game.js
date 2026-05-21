// street-racer.js
// Полноценная гоночная игра с исправленной разметкой

const LANE_COUNT = 3;
let gameInstance = null;
let isGameOverFlag = false;
let currentScore = 0;
let currentGameSpeed = 320;
let touchLeftActive = false;
let touchRightActive = false;

// Константы для разметки – исправляем проблему слипания!
const LINE_STRIP_HEIGHT = 70;
const LINE_GAP = 50;
const CYCLE_DIST = LINE_STRIP_HEIGHT + LINE_GAP; // 120px идеальный цикл

class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }
    
    preload() {
        // Текстура игрока (красная машина)
        const playerGfx = this.make.graphics();
        playerGfx.fillStyle(0xff2255);
        playerGfx.fillRect(0, 0, 40, 70);
        playerGfx.fillStyle(0x222222);
        playerGfx.fillRect(5, 18, 30, 14);
        playerGfx.fillStyle(0xffee88);
        playerGfx.fillRect(6, 6, 8, 6);
        playerGfx.fillRect(26, 6, 8, 6);
        playerGfx.fillStyle(0xaaaaaa);
        playerGfx.fillRect(2, 62, 6, 6);
        playerGfx.fillRect(32, 62, 6, 6);
        playerGfx.generateTexture('playerCar', 40, 70);
        
        // Текстура врага (синяя машина)
        const enemyGfx = this.make.graphics();
        enemyGfx.fillStyle(0x2288ff);
        enemyGfx.fillRect(0, 0, 40, 70);
        enemyGfx.fillStyle(0x111111);
        enemyGfx.fillRect(5, 44, 30, 14);
        enemyGfx.fillStyle(0xcc0000);
        enemyGfx.fillRect(6, 58, 7, 6);
        enemyGfx.fillRect(27, 58, 7, 6);
        enemyGfx.fillStyle(0x888888);
        enemyGfx.fillRect(2, 66, 6, 4);
        enemyGfx.fillRect(32, 66, 6, 4);
        enemyGfx.generateTexture('enemyCar', 40, 70);
        
        // Текстура линии разметки
        const lineGfx = this.make.graphics();
        lineGfx.fillStyle(0xffffff, 1);
        lineGfx.fillRect(0, 0, 8, LINE_STRIP_HEIGHT);
        lineGfx.fillStyle(0xe0e0ff, 0.6);
        lineGfx.fillRect(1, 0, 6, LINE_STRIP_HEIGHT);
        lineGfx.generateTexture('roadMarking', 8, LINE_STRIP_HEIGHT);
    }
    
    create() {
        isGameOverFlag = false;
        currentScore = 0;
        currentGameSpeed = 320;
        this.updateUI();
        
        document.getElementById('game-over-screen').style.display = 'none';
        
        const gameWidth = this.scale.width;
        const gameHeight = this.scale.height;
        
        const roadWidth = Math.min(gameWidth * 0.82, 520);
        const laneWidth = roadWidth / LANE_COUNT;
        const roadX = (gameWidth - roadWidth) / 2;
        
        this.roadParams = {
            x: roadX,
            width: roadWidth,
            laneWidth: laneWidth,
            leftEdge: roadX,
            rightEdge: roadX + roadWidth
        };
        
        // Асфальт
        this.roadBg = this.add.graphics();
        this.roadBg.fillStyle(0x1e1e2a);
        this.roadBg.fillRect(roadX, 0, roadWidth, gameHeight);
        this.roadBg.setDepth(0);
        
        // Асфальтовая текстура
        this.roadTexture = this.add.graphics();
        this.roadTexture.fillStyle(0x2c2c3a, 0.4);
        for(let i = 0; i < 180; i++) {
            let rx = roadX + Math.random() * roadWidth;
            let ry = Math.random() * gameHeight;
            this.roadTexture.fillRect(rx, ry, 2, 2);
        }
        this.roadTexture.setDepth(0);
        
        // Бордюры
        this.leftBound = this.add.graphics();
        this.leftBound.lineStyle(6, 0xffdd77, 1);
        this.leftBound.beginPath();
        this.leftBound.moveTo(roadX, 0);
        this.leftBound.lineTo(roadX, gameHeight);
        this.leftBound.strokePath();
        this.leftBound.setDepth(1);
        
        this.rightBound = this.add.graphics();
        this.rightBound.lineStyle(6, 0xffdd77, 1);
        this.rightBound.beginPath();
        this.rightBound.moveTo(roadX + roadWidth, 0);
        this.rightBound.lineTo(roadX + roadWidth, gameHeight);
        this.rightBound.strokePath();
        this.rightBound.setDepth(1);
        
        // Группа для линий разметки
        this.roadLinesGroup = this.add.group();
        
        const startYOffset = -LINE_STRIP_HEIGHT;
        const maxLinesNeeded = Math.ceil(gameHeight / CYCLE_DIST) + 4;
        for(let i = 0; i <= maxLinesNeeded; i++) {
            let yPos = startYOffset + (i * CYCLE_DIST);
            this.createLinePair(yPos);
        }
        
        // Игрок
        const playerStartX = gameWidth / 2;
        this.player = this.physics.add.sprite(playerStartX, gameHeight - 110, 'playerCar');
        this.player.setCollideWorldBounds(true);
        this.player.setDepth(12);
        this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(roadX, 0, roadWidth, gameHeight));
        
        // Враги
        this.enemies = this.physics.add.group();
        this.enemies.setDepth(12);
        
        // Управление
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keyMap = this.input.keyboard.addKeys({
            left: Phaser.Input.Keyboard.KeyCodes.LEFT,
            right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            a: Phaser.Input.Keyboard.KeyCodes.A,
            d: Phaser.Input.Keyboard.KeyCodes.D
        });
        
        // Коллизия
        this.physics.add.collider(this.player, this.enemies, this.onCrash, null, this);
        
        // Спавн врагов
        this.spawnTimer = this.time.addEvent({
            delay: 880,
            callback: this.spawnOpponent,
            callbackScope: this,
            loop: true
        });
        
        this.scale.on('resize', this.handleWindowResize, this);
    }
    
    createLinePair(yPos) {
        if(!this.roadParams) return;
        const { x: roadX, laneWidth } = this.roadParams;
        const line1X = roadX + laneWidth;
        const line2X = roadX + laneWidth * 2;
        
        const mark1 = this.roadLinesGroup.create(line1X - 4, yPos, 'roadMarking');
        const mark2 = this.roadLinesGroup.create(line2X - 4, yPos, 'roadMarking');
        
        if(mark1) { mark1.setDepth(2); this.physics.world.enableBody(mark1); mark1.body.enable = false; }
        if(mark2) { mark2.setDepth(2); this.physics.world.enableBody(mark2); mark2.body.enable = false; }
    }
    
    updateRoadMarkings(deltaTime) {
        if(!this.roadLinesGroup || isGameOverFlag) return;
        const deltaMove = currentGameSpeed * deltaTime;
        
        this.roadLinesGroup.children.iterate(marking => {
            if(!marking) return;
            marking.y += deltaMove;
            if(marking.y > this.scale.height + LINE_STRIP_HEIGHT) {
                let highestY = this.scale.height;
                this.roadLinesGroup.children.iterate(other => {
                    if(other && other.y < highestY) highestY = other.y;
                });
                let newY = highestY - CYCLE_DIST;
                marking.y = newY - LINE_STRIP_HEIGHT;
            }
        });
    }
    
    spawnOpponent() {
        if(isGameOverFlag || !this.roadParams) return;
        const { x: roadX, laneWidth } = this.roadParams;
        const randomLane = Phaser.Math.Between(0, LANE_COUNT - 1);
        const carX = roadX + (randomLane * laneWidth) + (laneWidth / 2);
        const enemy = this.enemies.create(carX, -85, 'enemyCar');
        if(enemy) {
            let speedVariant = Phaser.Math.Between(-18, 18);
            enemy.setVelocityY(currentGameSpeed + speedVariant);
            enemy.customSpeedBonus = speedVariant;
        }
    }
    
    onCrash(player, enemy) {
        if(isGameOverFlag) return;
        this.physics.pause();
        isGameOverFlag = true;
        player.setTint(0xff6666);
        player.setAngle(15);
        
        document.getElementById('finalScoreEl').innerText = currentScore;
        document.getElementById('game-over-screen').style.display = 'flex';
    }
    
    updateUI() {
        const scoreSpan = document.getElementById('scoreEl');
        const speedSpan = document.getElementById('speedEl');
        if(scoreSpan) scoreSpan.innerText = currentScore;
        if(speedSpan) speedSpan.innerText = (currentGameSpeed / 300).toFixed(1) + 'x';
    }
    
    handleWindowResize(gameSize) {
        if(isGameOverFlag) return;
        const w = gameSize.width;
        const h = gameSize.height;
        const newRoadWidth = Math.min(w * 0.82, 520);
        const newRoadX = (w - newRoadWidth) / 2;
        const newLaneWidth = newRoadWidth / LANE_COUNT;
        
        this.roadParams = {
            x: newRoadX,
            width: newRoadWidth,
            laneWidth: newLaneWidth,
            leftEdge: newRoadX,
            rightEdge: newRoadX + newRoadWidth
        };
        
        this.roadBg.clear();
        this.roadBg.fillStyle(0x1e1e2a);
        this.roadBg.fillRect(newRoadX, 0, newRoadWidth, h);
        
        this.leftBound.clear();
        this.leftBound.lineStyle(6, 0xffdd77, 1);
        this.leftBound.beginPath();
        this.leftBound.moveTo(newRoadX, 0);
        this.leftBound.lineTo(newRoadX, h);
        this.leftBound.strokePath();
        
        this.rightBound.clear();
        this.rightBound.lineStyle(6, 0xffdd77, 1);
        this.rightBound.beginPath();
        this.rightBound.moveTo(newRoadX + newRoadWidth, 0);
        this.rightBound.lineTo(newRoadX + newRoadWidth, h);
        this.rightBound.strokePath();
        
        this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(newRoadX, 0, newRoadWidth, h));
        if(this.player.x < newRoadX) this.player.x = newRoadX + 20;
        if(this.player.x > newRoadX + newRoadWidth) this.player.x = newRoadX + newRoadWidth - 20;
        
        this.roadLinesGroup.children.iterate(mark => {
            if(!mark) return;
            const idx = this.roadLinesGroup.getChildren().indexOf(mark);
            const linePos = (idx % 2 === 0) ? newRoadX + newLaneWidth : newRoadX + newLaneWidth * 2;
            mark.x = linePos - 4;
        });
    }
    
    updateScoreAndDifficulty() {
        if(this.spawnTimer && !isGameOverFlag) {
            let newDelay = Math.max(520, 880 - Math.floor(currentScore / 8));
            if(this.spawnTimer.delay !== newDelay) {
                this.spawnTimer.remove(false);
                this.spawnTimer = this.time.addEvent({
                    delay: newDelay,
                    callback: this.spawnOpponent,
                    callbackScope: this,
                    loop: true
                });
            }
        }
    }
    
    update(time, delta) {
        if(isGameOverFlag) return;
        
        const dtSec = Math.min(0.033, delta / 1000);
        const playerMoveSpeed = 620;
        let horizontal = 0;
        
        if(this.cursors.left?.isDown || this.keyMap.left?.isDown || this.keyMap.a?.isDown) horizontal = -1;
        else if(this.cursors.right?.isDown || this.keyMap.right?.isDown || this.keyMap.d?.isDown) horizontal = 1;
        
        if(touchLeftActive) horizontal = -1;
        if(touchRightActive) horizontal = 1;
        
        this.player.x += horizontal * playerMoveSpeed * dtSec;
        
        const roadLeft = this.roadParams.leftEdge;
        const roadRight = this.roadParams.rightEdge;
        if(this.player.x - 20 < roadLeft) this.player.x = roadLeft + 20;
        if(this.player.x + 20 > roadRight) this.player.x = roadRight - 20;
        
        this.updateRoadMarkings(dtSec);
        
        let scoreGained = 0;
        this.enemies.children.iterate(enemy => {
            if(!enemy) return;
            if(enemy.y > this.scale.height + 120) {
                enemy.destroy();
                scoreGained += 10;
            }
        });
        
        if(scoreGained > 0) {
            currentScore += scoreGained;
            let targetSpeed = 320 + Math.floor(currentScore / 7) * 6;
            if(targetSpeed > 760) targetSpeed = 760;
            if(currentGameSpeed < targetSpeed) {
                currentGameSpeed = Math.min(targetSpeed, currentGameSpeed + 2);
            }
            this.updateScoreAndDifficulty();
            this.updateUI();
        }
        
        this.enemies.children.iterate(enemy => {
            if(enemy && !isGameOverFlag) {
                let baseSpeed = currentGameSpeed + (enemy.customSpeedBonus || 0);
                if(baseSpeed < 200) baseSpeed = 260;
                enemy.setVelocityY(baseSpeed);
            }
        });
    }
}

// Конфигурация игры
const gameConfig = {
    type: Phaser.AUTO,
    parent: document.body,
    backgroundColor: '#0a0c12',
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: '100%',
        height: '100%'
    },
    physics: {
        default: 'arcade',
        arcade: { debug: false, gravity: { y: 0 } }
    },
    scene: MainScene
};

// Инициализация и управление
function initGame() {
    if(gameInstance) {
        gameInstance.destroy(true);
    }
    gameInstance = new Phaser.Game(gameConfig);
    touchLeftActive = false;
    touchRightActive = false;
}

// Подключение к DOM (вызывать после загрузки страницы)
document.addEventListener('DOMContentLoaded', () => {
    initGame();
    
    const leftButton = document.getElementById('leftBtn');
    const rightButton = document.getElementById('rightBtn');
    const restartBtn = document.getElementById('restartBtn');
    
    if(leftButton) {
        const activateLeft = (e) => { if(e) e.preventDefault(); touchLeftActive = true; touchRightActive = false; };
        const deactivateLeft = (e) => { if(e) e.preventDefault(); touchLeftActive = false; };
        leftButton.addEventListener('touchstart', activateLeft, {passive: false});
        leftButton.addEventListener('touchend', deactivateLeft);
        leftButton.addEventListener('touchcancel', deactivateLeft);
        leftButton.addEventListener('mousedown', activateLeft);
        leftButton.addEventListener('mouseup', deactivateLeft);
        leftButton.addEventListener('mouseleave', deactivateLeft);
    }
    
    if(rightButton) {
        const activateRight = (e) => { if(e) e.preventDefault(); touchRightActive = true; touchLeftActive = false; };
        const deactivateRight = (e) => { if(e) e.preventDefault(); touchRightActive = false; };
        rightButton.addEventListener('touchstart', activateRight, {passive: false});
        rightButton.addEventListener('touchend', deactivateRight);
        rightButton.addEventListener('touchcancel', deactivateRight);
        rightButton.addEventListener('mousedown', activateRight);
        rightButton.addEventListener('mouseup', deactivateRight);
        rightButton.addEventListener('mouseleave', deactivateRight);
    }
    
    if(restartBtn) restartBtn.addEventListener('click', () => initGame());
});
