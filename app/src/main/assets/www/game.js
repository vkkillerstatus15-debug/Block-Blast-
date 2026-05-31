/**
 * Block Blast Puzzle Game Controller
 * 
 * Features:
 * - 8x8 Grid board
 * - Adaptive layout with responsive touch & drag events
 * - Real-time canvas particle effects for row/column blasts
 * - Web Audio API synthesizer for sound effects (no external MP3 dependance)
 * - Game Over auto-detection (finds if any remaining blocks fit)
 * - Combo engine for simultaneous cleared lines
 * - LocalStorage high-score system
 */

// --- CONFIG & CONSTANTS ---
const BOARD_SIZE = 8;

// All beautiful tetris/block puzzle shapes mapping categorized by difficulty
const EASY_SHAPES = [
    { matrix: [[1]], color: 'cyan' },                     // 1. Single dot
    { matrix: [[1, 1]], color: 'orange' },                // 2. 1x2 Horizontal Domino
    { matrix: [[1], [1]], color: 'orange' },              // 3. 1x2 Vertical Domino
    { matrix: [[1, 1], [1, 1]], color: 'green' },         // 4. 2x2 Square Block
    { matrix: [[1, 1, 1]], color: 'purple' },             // 5. 1x3 Horizontal Bar
    { matrix: [[1], [1], [1]], color: 'purple' },         // 6. 1x3 Vertical Bar
    { matrix: [[1, 1], [1, 0]], color: 'yellow' },         // 9. Tiny L-Shape Corner (2x2)
    { matrix: [[1, 1], [0, 1]], color: 'yellow' }          // 9. Tiny Corner Flipped
];

const MEDIUM_SHAPES = [
    ...EASY_SHAPES,
    { matrix: [[1, 1, 1, 1]], color: 'cyan' },                       // 7. 1x4 Long Horizontal Bar
    { matrix: [[1], [1], [1], [1]], color: 'cyan' },                 // 8. 1x4 Long Vertical Bar
    { matrix: [[1, 0], [1, 0], [1, 1]], color: 'pink' },             // 10. Normal L-Shape (3x2)
    { matrix: [[1, 1], [0, 1], [0, 1]], color: 'pink' },             // 10. L-Shape Flipped
    { matrix: [[1, 1, 1], [0, 1, 0]], color: 'purple' },             // 11. T-Shape (2x3)
    { matrix: [[0, 1, 0], [1, 1, 1]], color: 'purple' },             // 11. T-Shape Flipped
    { matrix: [[1, 1, 0], [0, 1, 1]], color: 'blue' },               // 12. Z-Shape
    { matrix: [[0, 1, 1], [1, 1, 0]], color: 'royal' }               // 13. S-Shape
];

// Challenge pieces specifically for Hard Mode
const HARD_SHAPES = [
    ...MEDIUM_SHAPES,
    { matrix: [[1, 1, 1, 1, 1]], color: 'pink' },                     // Mega 1x5 Horizontal Bar
    { matrix: [[1], [1], [1], [1], [1]], color: 'pink' },             // Mega 1x5 Vertical Bar
    { matrix: [[1, 1, 1], [1, 1, 1], [1, 1, 1]], color: 'orange' },   // Giant 3x3 Block
    { matrix: [[1, 1, 1], [1, 0, 1], [1, 1, 1]], color: 'royal' },    // Hollow 3x3 U-Shape (Ring)
    { matrix: [[0, 1, 0], [1, 1, 1], [0, 1, 0]], color: 'green' },     // Plus Sign (Cross shape)
    { matrix: [[1, 0, 0], [1, 0, 0], [1, 1, 1]], color: 'blue' },      // Large L-Shape (3x3)
    { matrix: [[1, 1, 1], [0, 0, 1], [0, 0, 1]], color: 'blue' },      // Large L-Shape Flipped (3x3)
    { matrix: [[1, 1, 1], [1, 0, 0], [1, 0, 0]], color: 'yellow' }     // Large Corner 3x3
];

let currentDifficulty = 'medium'; // Defaults to standard MEDIUM gameplay

function getShapesLibrary() {
    if (currentDifficulty === 'easy') return EASY_SHAPES;
    if (currentDifficulty === 'hard') return HARD_SHAPES;
    return MEDIUM_SHAPES;
}

function getDifficultyMultiplier() {
    if (currentDifficulty === 'easy') return 1.0;
    if (currentDifficulty === 'hard') return 3.0;
    return 1.5; // Medium Mode gives a solid 1.5x score bonus
}

// --- APP STATE ---
let boardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
let activeTrayShapes = [null, null, null]; // Slotted shapes state
let score = 0;
let highScore = 0;
let isMusicOn = localStorage.getItem('block_blast_music') !== 'false';
let isSfxOn = localStorage.getItem('block_blast_sfx') !== 'false';
let isPaused = false;
let isGameOver = false;
let streakCount = 0; // Combo streak for continuous clearances

// Power-up Inventory state
let powerUpInventory = {
    bomb: 0,
    line: 0,
    color: 0
};
let activePowerUp = null; // 'bomb', 'line', 'color', or null

// --- CANVAS PARTICLES SYSTEM ---
const canvas = document.getElementById('particle-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

// Sizing the canvas matching window bounds
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

class Particle {
    constructor(x, y, colorCode) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12 - 3; // Slanted upwards
        this.size = Math.random() * 8 + 4;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.025;
        this.gravity = 0.2;
        this.color = colorCode;
    }

    update() {
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
        this.size *= 0.96;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// Spawns sparkles at center coordinates of a board cell
function spawnCellBlast(gridRow, gridCol, colorName) {
    const cellEl = document.querySelector(`[data-row="${gridRow}"][data-col="${gridCol}"]`);
    if (!cellEl) return;
    
    const rect = cellEl.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Convert colorName keyword to styled hex representing gradients
    const hexColors = {
        cyan: '#00f2fe',
        orange: '#ff9f43',
        green: '#00ff87',
        purple: '#b15cff',
        yellow: '#ffea00',
        pink: '#ff4081',
        blue: '#38ef7d',
        royal: '#02aab0',
        bomb: '#ff4d4d'
    };
    let c = hexColors[colorName] || '#ffffff';
    if (colorName === 'rainbow') {
        const rainbowSparks = ['#ff007f', '#00f2fe', '#00ff87', '#ffea00', '#bf55ec'];
        c = rainbowSparks[Math.floor(Math.random() * rainbowSparks.length)];
    }
    
    // For bombs, spawn even more particles for a dramatic explosion!
    const count = colorName === 'bomb' ? 30 : 12;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(centerX, centerY, c));
    }
}

// Sparkle animation pipeline
function animateParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.update();
        if (p.alpha <= 0) {
            particles.splice(i, 1);
        } else {
            p.draw();
        }
    }
    requestAnimationFrame(animateParticles);
}
requestAnimationFrame(animateParticles);


// --- SYNTHESIZED WEB AUDIO ENGINE ---
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    if (isMusicOn) {
        startMusic();
    }
}

// Ambient Background Music Generator using Web Audio API
let bgmSequence = null;
let bgmStep = 0;
const bgmChords = [
    [130.81, 164.81, 196.00, 246.94], // Cmaj7
    [146.83, 174.61, 220.00, 261.63], // Dm7
    [164.81, 196.00, 246.94, 293.66], // Em7
    [174.61, 220.00, 261.63, 329.63]  // Fmaj7
];

function playBgmBeat() {
    if (!isMusicOn || !audioCtx) return;
    try {
        if (audioCtx.state === 'suspended') return;
        
        const chordIndex = Math.floor(bgmStep / 4) % bgmChords.length;
        const currentChord = bgmChords[chordIndex];
        
        // Root drone on step 0 of chord
        if (bgmStep % 4 === 0) {
            const rootFreq = currentChord[0];
            const oscPad = audioCtx.createOscillator();
            const gainPad = audioCtx.createGain();
            
            oscPad.type = 'sine';
            oscPad.frequency.setValueAtTime(rootFreq, audioCtx.currentTime);
            
            oscPad.connect(gainPad);
            gainPad.connect(audioCtx.destination);
            
            gainPad.gain.setValueAtTime(0.006, audioCtx.currentTime);
            gainPad.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 4.5);
            
            oscPad.start(audioCtx.currentTime);
            oscPad.stop(audioCtx.currentTime + 4.5);
        }
        
        // Random melody note from chord
        const noteIndex = (bgmStep % 2 === 0) ? (bgmStep % 3) : Math.floor(Math.random() * currentChord.length);
        const melodyFreq = currentChord[noteIndex] * 2; // Arpeggiated an octave up
        
        const oscMel = audioCtx.createOscillator();
        const gainMel = audioCtx.createGain();
        
        oscMel.type = 'sine';
        oscMel.frequency.setValueAtTime(melodyFreq, audioCtx.currentTime);
        
        oscMel.connect(gainMel);
        gainMel.connect(audioCtx.destination);
        
        gainMel.gain.setValueAtTime(0.008, audioCtx.currentTime);
        gainMel.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.8);
        
        oscMel.start(audioCtx.currentTime);
        oscMel.stop(audioCtx.currentTime + 1.8);
        
        bgmStep++;
    } catch (e) {
        console.error("BGM error:", e);
    }
}

function startMusic() {
    if (bgmSequence) return;
    initAudio();
    bgmSequence = setInterval(playBgmBeat, 1500);
}

function stopMusic() {
    if (bgmSequence) {
        clearInterval(bgmSequence);
        bgmSequence = null;
    }
}

function playTone(freq, type, duration, delay = 0, vol = 0.1) {
    if (!isSfxOn || !audioCtx) return;
    
    try {
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);
        
        gainNode.gain.setValueAtTime(vol, audioCtx.currentTime + delay);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + duration);
        
        osc.start(audioCtx.currentTime + delay);
        osc.stop(audioCtx.currentTime + delay + duration);
    } catch (e) {
        console.error("Audio synthesis error:", e);
    }
}

// Lift shape feedback tone
function playDragStartSound() {
    initAudio();
    playTone(320, 'sine', 0.12, 0, 0.12);
    playTone(450, 'sine', 0.15, 0.04, 0.08);
}

// Clean shape placement synth pop
function playDropSound() {
    initAudio();
    playTone(520, 'triangle', 0.1, 0, 0.15);
    playTone(260, 'sine', 0.2, 0.02, 0.2);
}

// Satisfying arpeggio strings for clearing rows/cols
function playClearSound(linesCleared, combo) {
    initAudio();
    const baseFreq = 440 + (combo * 80);
    const chords = [1, 1.25, 1.5, 2]; // Major Chord ratios
    
    chords.forEach((ratio, index) => {
        const freq = baseFreq * ratio;
        playTone(freq, 'sine', 0.25 + (linesCleared * 0.05), index * 0.06, 0.1 + (combo * 0.03));
    });
}

// Melancholy descending arpeggio for Game Over
function playGameOverSound() {
    initAudio();
    const freqs = [330, 293, 261, 220, 165];
    freqs.forEach((f, i) => {
        playTone(f, 'sine', 0.4, i * 0.12, 0.15);
    });
}

// Bounce failure sound
function playErrorSound() {
    initAudio();
    playTone(180, 'sine', 0.2, 0, 0.15);
    playTone(150, 'sine', 0.2, 0.05, 0.15);
}


// --- INITIALIZE GAME BOARD AND STORAGE ---
const boardEl = document.getElementById('board');
const trayEl = document.getElementById('tray');

function createBoardUI() {
    boardEl.innerHTML = '';
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = r;
            cell.dataset.col = c;
            boardEl.appendChild(cell);
        }
    }
}

// Updates physical Board visual cells from state array
function drawBoard() {
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const cellVal = boardState[r][c];
            const cellEl = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
            if (cellEl) {
                // Clear any existing block designations
                cellEl.className = 'cell';
                if (cellVal) {
                    if (cellVal === 'bomb') {
                        cellEl.classList.add('block-bomb');
                        cellEl.innerHTML = '<span class="cell-icon">💣</span>';
                    } else if (cellVal === 'rainbow') {
                        cellEl.classList.add('block-rainbow');
                        cellEl.innerHTML = '<span class="cell-icon">🌈</span>';
                    } else {
                        cellEl.classList.add(`block-${cellVal}`);
                        cellEl.innerHTML = '';
                    }
                } else {
                    cellEl.innerHTML = '';
                }
            }
        }
    }
}


// --- POWER-UP AND TARGETING MODULES ---

function loadPowerUps() {
    powerUpInventory.bomb = parseInt(localStorage.getItem('block_blast_pu_bomb') || '1', 10); // Give 1 bomb initially!
    powerUpInventory.line = parseInt(localStorage.getItem('block_blast_pu_line') || '2', 10); // Give 2 sweepers initially!
    powerUpInventory.color = parseInt(localStorage.getItem('block_blast_pu_color') || '1', 10); // Give 1 color cleanser initially!
    updatePowerUpUI();
}

function savePowerUps() {
    localStorage.setItem('block_blast_pu_bomb', powerUpInventory.bomb);
    localStorage.setItem('block_blast_pu_line', powerUpInventory.line);
    localStorage.setItem('block_blast_pu_color', powerUpInventory.color);
    updatePowerUpUI();
}

function updatePowerUpUI() {
    // Update count labels
    const bombCountEl = document.getElementById('pu-bomb-count');
    const lineCountEl = document.getElementById('pu-line-count');
    const colorCountEl = document.getElementById('pu-color-count');
    
    if (bombCountEl) bombCountEl.textContent = powerUpInventory.bomb;
    if (lineCountEl) lineCountEl.textContent = powerUpInventory.line;
    if (colorCountEl) colorCountEl.textContent = powerUpInventory.color;
    
    // Set style options
    ['bomb', 'line', 'color'].forEach(type => {
        const btn = document.getElementById(`pu-${type}`);
        if (btn) {
            if (powerUpInventory[type] <= 0) {
                btn.classList.add('disabled');
            } else {
                btn.classList.remove('disabled');
            }
            
            if (activePowerUp === type) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });

    const banner = document.getElementById('target-banner');
    const board = document.getElementById('board');
    if (activePowerUp && banner && board) {
        banner.classList.add('show');
        if (activePowerUp === 'bomb') {
            banner.textContent = "Target Mode: Tap any cell to detonate 3x3 blast!";
        } else if (activePowerUp === 'line') {
            banner.textContent = "Target Mode: Tap cell to wipe its Row & Column!";
        } else if (activePowerUp === 'color') {
            banner.textContent = "Target Mode: Tap a block to wipe all of its same color!";
        }
        board.classList.add('targeting-active');
    } else {
        if (banner) banner.classList.remove('show');
        if (board) board.classList.remove('targeting-active');
    }
}

function addPowerUp(type, amount = 1) {
    powerUpInventory[type] += amount;
    savePowerUps();
    
    // Play a nice high reward chirp
    initAudio();
    playTone(784, 'sine', 0.1, 0, 0.1);
    playTone(1046.5, 'sine', 0.15, 0.04, 0.08);
}

function togglePowerUp(type) {
    if (isGameOver) return;
    if (powerUpInventory[type] <= 0) {
        // Play dull buzzer error
        initAudio();
        playTone(150, 'sawtooth', 0.15, 0, 0.1);
        
        // Flash a notification popup
        const bonusText = type === 'bomb' ? 'Earn Bomb from 3+ Combo Streaks!' : (type === 'line' ? 'Earn Sweeper from 2+ Line Clears!' : 'Earn Chroma from 4x Mega Clear!');
        showFloatingInfoBanner(bonusText);
        return;
    }
    
    initAudio();
    if (activePowerUp === type) {
        // Deactivate
        activePowerUp = null;
        playTone(440, 'sine', 0.08, 0, 0.08);
    } else {
        // Activate
        activePowerUp = type;
        playTone(587.33, 'sine', 0.08, 0, 0.08);
        playTone(880, 'sine', 0.1, 0.04, 0.08);
    }
    updatePowerUpUI();
}

function showFloatingInfoBanner(text) {
    const popup = document.getElementById('score-popup');
    if (popup) {
        popup.textContent = text;
        popup.className = 'floating-popup gold-pop';
        setTimeout(() => {
            popup.className = 'floating-popup';
        }, 1800);
    }
}

// Powerups targeting setups on cell click delegation
function onCellClicked(r, c) {
    if (!activePowerUp || isGameOver) return;
    
    const type = activePowerUp;
    
    if (type === 'bomb') {
        // Consume powerup
        powerUpInventory.bomb--;
        activePowerUp = null;
        savePowerUps();
        
        // Detonate 3x3
        let cellsCleared = 0;
        let coordsToClear = [];
        
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                    if (boardState[nr][nc] !== null) {
                        coordsToClear.push({r: nr, c: nc, color: boardState[nr][nc]});
                        cellsCleared++;
                    }
                }
            }
        }
        
        // Action clearing
        coordsToClear.forEach(coord => {
            spawnCellBlast(coord.r, coord.c, coord.color);
            const cellEl = document.querySelector(`[data-row="${coord.r}"][data-col="${coord.c}"]`);
            if (cellEl) cellEl.classList.add('clearing');
        });
        
        // Play explosive crash sound
        playExplodeSound();
        triggerHaptic(3);
        
        // Add points
        updateScore(cellsCleared * 15);
        
        setTimeout(() => {
            coordsToClear.forEach(coord => {
                boardState[coord.r][coord.c] = null;
            });
            drawBoard();
            checkForClears();
            endTurnRoutine();
        }, 220);
        
    } else if (type === 'line') {
        // Consume powerup
        powerUpInventory.line--;
        activePowerUp = null;
        savePowerUps();
        
        // Clear row r and col c
        let cellsCleared = 0;
        let coordsToClear = [];
        
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (boardState[r][col] !== null) {
                coordsToClear.push({ r, c: col, color: boardState[r][col] });
                cellsCleared++;
            }
        }
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (boardState[row][c] !== null && row !== r) {
                coordsToClear.push({ r: row, c, color: boardState[row][c] });
                cellsCleared++;
            }
        }
        
        coordsToClear.forEach(coord => {
            spawnCellBlast(coord.r, coord.c, coord.color);
            const cellEl = document.querySelector(`[data-row="${coord.r}"][data-col="${coord.c}"]`);
            if (cellEl) cellEl.classList.add('clearing');
        });
        
        // Play nice sweep slide
        playSweepSound();
        triggerHaptic(4);
        
        updateScore(cellsCleared * 15);
        
        setTimeout(() => {
            coordsToClear.forEach(coord => {
                boardState[coord.r][coord.c] = null;
            });
            drawBoard();
            checkForClears();
            endTurnRoutine();
        }, 220);
        
    } else if (type === 'color') {
        const clickedColor = boardState[r][c];
        if (!clickedColor) {
            // Friendly tip
            showFloatingInfoBanner("Tap a solid block to wipe out its color!");
            return; // Don't consume power-up yet, keep targeting active!
        }
        
        // Consume powerup
        powerUpInventory.color--;
        activePowerUp = null;
        savePowerUps();
        
        // Gather matches
        let cellsCleared = 0;
        let coordsToClear = [];
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (boardState[row][col] === clickedColor) {
                    coordsToClear.push({ r: row, c: col, color: clickedColor });
                    cellsCleared++;
                }
            }
        }
        
        coordsToClear.forEach(coord => {
            spawnCellBlast(coord.r, coord.c, coord.color);
            const cellEl = document.querySelector(`[data-row="${coord.r}"][data-col="${coord.c}"]`);
            if (cellEl) cellEl.classList.add('clearing');
        });
        
        // Play magical slide up
        playChromaSound();
        triggerHaptic(4);
        
        updateScore(cellsCleared * 15);
        
        setTimeout(() => {
            coordsToClear.forEach(coord => {
                boardState[coord.r][coord.c] = null;
            });
            drawBoard();
            checkForClears();
            endTurnRoutine();
        }, 220);
    }
}

// Sound effects generators
function playExplodeSound() {
    if (!isSfxOn || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const noiseGain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(40, audioCtx.currentTime + 0.45);
        
        osc.connect(noiseGain);
        noiseGain.connect(audioCtx.destination);
        
        noiseGain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.45);
    } catch(e) {}
}

function playSweepSound() {
    if (!isSfxOn || !audioCtx) return;
    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.4);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 0.4);
    } catch(e) {}
}

function playChromaSound() {
    if (!isSfxOn || !audioCtx) return;
    try {
        const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, i) => {
            playTone(freq, 'sine', 0.2, i * 0.05, 0.04);
        });
    } catch(e) {}
}


// --- HIGH SCORE PERSISTENCE ---
function loadScores() {
    const key = `block_blast_high_${currentDifficulty}`;
    const savedBest = localStorage.getItem(key);
    if (savedBest) {
        highScore = parseInt(savedBest, 10);
    } else {
        // Fallback or back compatibility for standard difficulty
        if (currentDifficulty === 'medium') {
            const oldBest = localStorage.getItem('block_blast_high');
            highScore = oldBest ? parseInt(oldBest, 10) : 0;
        } else {
            highScore = 0;
        }
    }
    document.getElementById('high-score-val').textContent = highScore;
}

function updateScore(pointsAdded) {
    if (pointsAdded <= 0) return;
    
    // Scale points by difficulty multiplier
    const scaledPoints = Math.round(pointsAdded * getDifficultyMultiplier());
    score += scaledPoints;
    document.getElementById('score-val').textContent = score;
    
    // Flash a mini float score notification popup
    const popup = document.getElementById('score-popup');
    popup.textContent = `+${scaledPoints}`;
    popup.className = 'floating-popup fire';
    
    // Clear and reset floating class
    setTimeout(() => {
        popup.className = 'floating-popup';
    }, 700);

    if (score > highScore) {
        highScore = score;
        const key = `block_blast_high_${currentDifficulty}`;
        localStorage.setItem(key, highScore);
        document.getElementById('high-score-val').textContent = highScore;
    }
}


// --- DRAG-AND-DROP DRIVER MECHANICS ---
let dragElementState = null;

function renderTraySlots() {
    for (let i = 0; i < 3; i++) {
        const slotEl = document.getElementById(`slot-${i}`);
        slotEl.innerHTML = '';
        
        const shape = activeTrayShapes[i];
        if (!shape) continue;

        const wrapper = document.createElement('div');
        wrapper.className = 'shape-wrapper in-tray';
        wrapper.id = `tray-shape-${i}`;
        wrapper.dataset.index = i;
        
        // Build rows and columns dimensions natively
        const rows = shape.matrix.length;
        const cols = shape.matrix[0].length;
        wrapper.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
        wrapper.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
        wrapper.style.gap = '2px';
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const blockCell = document.createElement('div');
                if (shape.matrix[r][c] === 1) {
                    blockCell.className = `shape-block block-${shape.color}`;
                } else if (shape.matrix[r][c] === 2) {
                    blockCell.className = `shape-block block-bomb`;
                    blockCell.innerHTML = '<span class="cell-icon">💣</span>';
                } else if (shape.matrix[r][c] === 3) {
                    blockCell.className = `shape-block block-rainbow`;
                    blockCell.innerHTML = '<span class="cell-icon">🌈</span>';
                } else {
                    blockCell.className = 'shape-block empty';
                }
                wrapper.appendChild(blockCell);
            }
        }

        // Attach double dragging listener
        wrapper.addEventListener('mousedown', (e) => onDragStart(e, i, wrapper));
        wrapper.addEventListener('touchstart', (e) => onDragStart(e, i, wrapper), { passive: false });

        slotEl.appendChild(wrapper);
    }
}

// Generate three randomized pieces
function fillTray() {
    let emptySlotsCount = activeTrayShapes.filter(s => s === null).length;
    if (emptySlotsCount === 3) {
        const currentLibrary = getShapesLibrary();
        for (let i = 0; i < 3; i++) {
            const random = Math.floor(Math.random() * currentLibrary.length);
            let shape = JSON.parse(JSON.stringify(currentLibrary[random]));
            
            // 15% chance to inject a special block (bomb=2 or rainbow=3) into one of the solid cells of the shape!
            if (Math.random() < 0.15) {
                let solidCells = [];
                for (let r = 0; r < shape.matrix.length; r++) {
                    for (let c = 0; c < shape.matrix[r].length; c++) {
                        if (shape.matrix[r][c] === 1) {
                            solidCells.push({ r, c });
                        }
                    }
                }
                if (solidCells.length > 0) {
                    const targetCell = solidCells[Math.floor(Math.random() * solidCells.length)];
                    // 60% chance for Bomb (value 2), 40% chance for Rainbow (value 3)
                    shape.matrix[targetCell.r][targetCell.c] = (Math.random() < 0.6) ? 2 : 3;
                }
            }
            
            activeTrayShapes[i] = shape;
        }
        renderTraySlots();
    }
}


// --- GRID CELL DETECTION AND HIGHLIGHTS ---

// Calculates overlapping list of coordinates on Board based on finger position
function checkOverlap(dragState, hoverCoords) {
    const { row: targetRow, col: targetCol } = hoverCoords;
    const shape = dragState.shape;
    const rows = shape.matrix.length;
    const cols = shape.matrix[0].length;
    
    let occupiedCoords = [];
    let isValidPlacement = true;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cellType = shape.matrix[r][c];
            if (cellType > 0) {
                const boardGroupRow = targetRow + r;
                const boardGroupCol = targetCol + c;
                
                // Out of borders boundaries
                if (boardGroupRow < 0 || boardGroupRow >= BOARD_SIZE || boardGroupCol < 0 || boardGroupCol >= BOARD_SIZE) {
                    isValidPlacement = false;
                } else if (boardState[boardGroupRow][boardGroupCol] !== null) {
                    // Cell is already taken
                    isValidPlacement = false;
                    occupiedCoords.push({ r: boardGroupRow, c: boardGroupCol, isConflict: true, type: cellType });
                } else {
                    occupiedCoords.push({ r: boardGroupRow, c: boardGroupCol, isConflict: false, type: cellType });
                }
            }
        }
    }
    
    return {
        valid: isValidPlacement,
        coords: occupiedCoords
    };
}

// Clear all hover visual overlays from the board
function clearAllBoardHighlights() {
    document.querySelectorAll('.cell').forEach(cell => {
        cell.classList.remove('highlight-valid', 'highlight-invalid');
    });
}

// Adds class selectors to highlighting prospective drop coordinates
function highlightBoardGrid(gridOverlaps) {
    clearAllBoardHighlights();
    const cssClass = gridOverlaps.valid ? 'highlight-valid' : 'highlight-invalid';
    
    gridOverlaps.coords.forEach(coord => {
        const cellEl = document.querySelector(`[data-row="${coord.r}"][data-col="${coord.c}"]`);
        if (cellEl) {
            cellEl.classList.add(cssClass);
        }
    });
}


// --- LOGICAL RECOVERY COORD ALIGNMENTS ---

// Maps standard pixel coordinates on screen to index keys of grid
function fetchCellCoordsUnderPixel(clientX, clientY, shapeRows, shapeCols) {
    const cells = document.querySelectorAll('.cell');
    let closestCell = null;
    let minDistance = 99999;
    
    // Compensate coordinates for block size offset when locking onto top-left anchor cell
    // Standard cell sizing inside CSS rules, matching scale
    const cellElSample = document.querySelector('.cell');
    const cellSizePX = cellElSample ? cellElSample.getBoundingClientRect().width : 42;
    
    // Anchor target is near the top-left section of the sliding block
    const targetX = clientX;
    const targetY = clientY;
    
    cells.forEach(cell => {
        const rect = cell.getBoundingClientRect();
        const cellCenterX = rect.left + rect.width / 2;
        const cellCenterY = rect.top + rect.height / 2;
        
        const dist = Math.hypot(cellCenterX - targetX, cellCenterY - targetY);
        if (dist < minDistance && dist < cellSizePX * 1.5) {
            minDistance = dist;
            closestCell = cell;
        }
    });
    
    if (closestCell) {
        const rIndex = parseInt(closestCell.dataset.row, 10);
        const cIndex = parseInt(closestCell.dataset.col, 10);
        return { row: rIndex, col: cIndex };
    }
    
    return null;
}


// --- DRAG EVENT LIFECYCLE HANDLERS ---
function onDragStart(event, trayIndex, wrapperElement) {
    if (isGameOver || isPaused) return;
    
    initAudio();
    
    event.preventDefault(); // Disables mobile native gestures
    
    const shape = activeTrayShapes[trayIndex];
    if (!shape) return;

    // Get input touch/mouse positions
    const isTouch = event.type.startsWith('touch');
    const touchPointer = isTouch ? event.touches[0] : event;
    const startX = touchPointer.clientX;
    const startY = touchPointer.clientY;

    const wrapperRect = wrapperElement.getBoundingClientRect();
    
    // Touch offset helps lift the blocks 70px above the holding touch finger!
    // This allows perfect visibility of underlying board on mobile!
    const touchYOffsetCompensation = isTouch ? -70 : 0;
    
    // Save state context
    dragElementState = {
        trayIndex: trayIndex,
        shape: shape,
        el: wrapperElement,
        initialX: wrapperRect.left,
        initialY: wrapperRect.top,
        offsetX: startX - wrapperRect.left,
        // Slide slightly higher so item is completely visible above thumb
        offsetY: startY - wrapperRect.top - touchYOffsetCompensation,
        isTouch: isTouch,
        touchYOffsetCompensation: touchYOffsetCompensation
    };

    // Style elements for dragging
    wrapperElement.classList.remove('in-tray');
    wrapperElement.classList.add('drag-active');
    
    // Move element immediately
    const posX = startX - dragElementState.offsetX;
    const posY = startY - dragElementState.offsetY;
    
    wrapperElement.style.left = `${posX}px`;
    wrapperElement.style.top = `${posY}px`;
    
    playDragStartSound();

    // Attach document-level handlers to track the dragging across screen smoothly
    if (isTouch) {
        document.addEventListener('touchmove', onDragMove, { passive: false });
        document.addEventListener('touchend', onDragEnd);
    } else {
        document.addEventListener('mousemove', onDragMove);
        document.addEventListener('mouseup', onDragEnd);
    }
}

function onDragMove(event) {
    if (!dragElementState) return;
    
    event.preventDefault(); // Lock screen bouncy scrolling on iOS WebViews
    
    const pointer = (dragElementState.isTouch && event.touches && event.touches[0]) ? event.touches[0] : event;
    const clientX = pointer.clientX;
    const clientY = pointer.clientY;
    
    const posX = clientX - dragElementState.offsetX;
    const posY = clientY - dragElementState.offsetY;
    
    dragElementState.el.style.left = `${posX}px`;
    dragElementState.el.style.top = `${posY}px`;

    // Calculate highlighting logic
    // Using top-left anchor point for mapping overlapping matrix coordinates
    const anchorX = clientX - dragElementState.offsetX + 20; 
    const anchorY = clientY - dragElementState.offsetY + 20;
    
    const targetCellCoords = fetchCellCoordsUnderPixel(anchorX, anchorY, dragElementState.shape.matrix.length, dragElementState.shape.matrix[0].length);
    
    if (targetCellCoords) {
        const overlaps = checkOverlap(dragElementState, targetCellCoords);
        highlightBoardGrid(overlaps);
    } else {
        clearAllBoardHighlights();
    }
}

function onDragEnd(event) {
    if (!dragElementState) return;

    // Clean tracking events
    if (dragElementState.isTouch) {
        document.removeEventListener('touchmove', onDragMove);
        document.removeEventListener('touchend', onDragEnd);
    } else {
        document.removeEventListener('mousemove', onDragMove);
        document.removeEventListener('mouseup', onDragEnd);
    }
    
    const el = dragElementState.el;
    const trayIndex = dragElementState.trayIndex;
    
    // Retrieve coordinates based on ending client pointer positions
    let clientX, clientY;
    if (dragElementState.isTouch) {
        // Fetch touch variables from changedTouches representing ending trigger
        const changedTouch = (event.changedTouches && event.changedTouches[0]) ? event.changedTouches[0] : 
                             ((event.touches && event.touches[0]) ? event.touches[0] : null);
        if (changedTouch) {
            clientX = changedTouch.clientX;
            clientY = changedTouch.clientY;
        } else {
            // Fallback to drag start coordinates if touch positions disappear
            clientX = dragElementState.initialX + dragElementState.offsetX;
            clientY = dragElementState.initialY + dragElementState.offsetY;
        }
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }
    
    const anchorX = clientX - dragElementState.offsetX + 20;
    const anchorY = clientY - dragElementState.offsetY + 20;
    
    const targetCellCoords = fetchCellCoordsUnderPixel(anchorX, anchorY, dragElementState.shape.matrix.length, dragElementState.shape.matrix[0].length);
    let successfullyPlaced = false;

    if (targetCellCoords) {
        const overlaps = checkOverlap(dragElementState, targetCellCoords);
        if (overlaps.valid) {
            // Commit drop to board state
            commitDropToBoard(trayIndex, overlaps.coords, dragElementState.shape.color);
            successfullyPlaced = true;
        }
    }
    
    // Clean prospective board cells visually
    clearAllBoardHighlights();

    if (!successfullyPlaced) {
        // Play bounce sweep and fly back with standard transitional CSS rules
        playErrorSound();
        bounceBackToTraySlot(el, trayIndex);
    }
    
    dragElementState = null;
}

// Bounces drag block back to its original slot
function bounceBackToTraySlot(el, slotIndex) {
    el.classList.remove('drag-active');
    el.classList.add('in-tray');
    
    // Reset absolute positions style properties and restore slot structure
    el.style.position = 'relative';
    el.style.left = 'auto';
    el.style.top = 'auto';
    
    renderTraySlots();
}


// --- COMMIT DROPPED BLOCK & TRIGGER BLASTS ---
function commitDropToBoard(slotIndex, appliedCoords, shapeColor) {
    // 1. Fill board matrix
    appliedCoords.forEach(coord => {
        if (coord.type === 2) {
            boardState[coord.r][coord.c] = 'bomb';
        } else if (coord.type === 3) {
            boardState[coord.r][coord.c] = 'rainbow';
        } else {
            boardState[coord.r][coord.c] = shapeColor;
        }
    });
    
    // 2. Play drop feedback pop
    playDropSound();
    triggerHaptic(1);
    
    // 3. Increment score for placing block (1 point per block element placed)
    updateScore(appliedCoords.length);
    
    // 4. Set state of used shape to null and clear DOM node
    activeTrayShapes[slotIndex] = null;
    const slotEl = document.getElementById(`slot-${slotIndex}`);
    slotEl.innerHTML = '';
    
    // 5. Update UI
    drawBoard();
    
    // 6. Check for filled rows/columns (Line Blasting!)
    checkForClears();
}

// Finds and processes any special blocks (bombs or rainbows) cleared in lines
function processSpecialClears(rowsToClear, colsToClear) {
    let bombSeeds = [];
    let rainbowSeeds = [];
    
    // Find all bombs or rainbows in the cleared rows/cols
    rowsToClear.forEach(r => {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const val = boardState[r][c];
            if (val === 'bomb') {
                bombSeeds.push({r, c});
            } else if (val === 'rainbow') {
                rainbowSeeds.push({r, c});
            }
        }
    });
    
    colsToClear.forEach(c => {
        for (let r = 0; r < BOARD_SIZE; r++) {
            const val = boardState[r][c];
            if (val === 'bomb') {
                const alreadyAdded = bombSeeds.some(b => b.r === r && b.c === c);
                if (!alreadyAdded) bombSeeds.push({r, c});
            } else if (val === 'rainbow') {
                const alreadyAdded = rainbowSeeds.some(rb => rb.r === r && rb.c === c);
                if (!alreadyAdded) rainbowSeeds.push({r, c});
            }
        }
    });
    
    let specialCellsToClear = []; // Pairs of {r, c, type}
    
    // Process bomb explosions (3x3 cleared area)
    bombSeeds.forEach(bomb => {
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const nr = bomb.r + dr;
                const nc = bomb.c + dc;
                if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                    if (boardState[nr][nc] !== null) {
                        const isPrimaryClear = rowsToClear.includes(nr) || colsToClear.includes(nc);
                        const alreadyAdded = specialCellsToClear.some(cell => cell.r === nr && cell.c === nc);
                        if (!isPrimaryClear && !alreadyAdded) {
                            specialCellsToClear.push({ r: nr, c: nc, type: 'bomb_blast', originalValue: boardState[nr][nc] });
                        }
                    }
                }
            }
        }
    });
    
    // Process rainbow sweeps (clears all cells of the single most frequent non-null color currently on the board)
    rainbowSeeds.forEach(rainbow => {
        let colorCounts = {};
        for (let r = 0; r < BOARD_SIZE; r++) {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const val = boardState[r][c];
                if (val && val !== 'bomb' && val !== 'rainbow') {
                    colorCounts[val] = (colorCounts[val] || 0) + 1;
                }
            }
        }
        
        let mostFrequentColor = null;
        let maxCount = 0;
        for (const [color, count] of Object.entries(colorCounts)) {
            if (count > maxCount) {
                maxCount = count;
                mostFrequentColor = color;
            }
        }
        
        if (mostFrequentColor) {
            for (let r = 0; r < BOARD_SIZE; r++) {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    if (boardState[r][c] === mostFrequentColor) {
                        const isPrimaryClear = rowsToClear.includes(r) || colsToClear.includes(c);
                        const alreadyAdded = specialCellsToClear.some(cell => cell.r === r && cell.c === c);
                        if (!isPrimaryClear && !alreadyAdded) {
                            specialCellsToClear.push({ r, c, type: 'rainbow_sweep', originalValue: mostFrequentColor });
                        }
                    }
                }
            }
        }
    });
    
    return specialCellsToClear;
}

// Scans grid and clears completely filled rows or columns simultaneously
function checkForClears() {
    let rowsToClear = [];
    let colsToClear = [];
    
    // Identify completed rows
    for (let r = 0; r < BOARD_SIZE; r++) {
        let isRowFilled = true;
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] === null) {
                isRowFilled = false;
                break;
            }
        }
        if (isRowFilled) {
            rowsToClear.push(r);
        }
    }
    
    // Identify completed columns
    for (let c = 0; c < BOARD_SIZE; c++) {
        let isColFilled = true;
        for (let r = 0; r < BOARD_SIZE; r++) {
            if (boardState[r][c] === null) {
                isColFilled = false;
                break;
            }
        }
        if (isColFilled) {
            colsToClear.push(c);
        }
    }
    
    const linesCount = rowsToClear.length + colsToClear.length;
    
    if (linesCount > 0) {
        // Continuous clearance combo booster index
        streakCount++;
        
        // Find and process special block actions (bombs and rainbows)
        const specialCellsToClear = processSpecialClears(rowsToClear, colsToClear);
        
        // Block blasting logic with gorgeous delays
        // First play clearing chime matching level of combos
        playClearSound(linesCount, streakCount);
        if (specialCellsToClear.length > 0) {
            triggerHaptic(3);
        } else if (linesCount > 1) {
            triggerHaptic(3);
        } else {
            triggerHaptic(2);
        }
        
        // Spawn canvas blast particles on ALL cleared cells before erasing state
        rowsToClear.forEach(r => {
            for (let c = 0; c < BOARD_SIZE; c++) {
                spawnCellBlast(r, c, boardState[r][c]);
            }
        });
        colsToClear.forEach(c => {
            for (let r = 0; r < BOARD_SIZE; r++) {
                // Protect from double sparking on corner crossings
                if (!rowsToClear.includes(r)) {
                    spawnCellBlast(r, c, boardState[r][c]);
                }
            }
        });
        
        // Spawn particles for cells exploded/swept by special blocks
        specialCellsToClear.forEach(cell => {
            spawnCellBlast(cell.r, cell.c, cell.originalValue);
        });
        
        // Highlight cells as "clearing" to trigger the CSS scaling pulse before erasing state
        rowsToClear.forEach(r => {
            for (let c = 0; c < BOARD_SIZE; c++) {
                const cellEl = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                if (cellEl) cellEl.classList.add('clearing');
            }
        });
        colsToClear.forEach(c => {
            for (let r = 0; r < BOARD_SIZE; r++) {
                const cellEl = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
                if (cellEl) cellEl.classList.add('clearing');
            }
        });
        
        // Highlight special cells as clearing too!
        specialCellsToClear.forEach(cell => {
            const cellEl = document.querySelector(`[data-row="${cell.r}"][data-col="${cell.c}"]`);
            if (cellEl) cellEl.classList.add('clearing');
        });
        
        // Compute Score bonuses: Clear lines (10 points per cell cleared). 
        // Multiplied by lines cleared and combo streak!
        const baseClearPts = linesCount * BOARD_SIZE * 10;
        const specialPts = specialCellsToClear.length * 15; // 15 premium points per block cleared by bombs/rainbows
        const comboBonusPts = (linesCount > 1 ? linesCount * 50 : 0) + (streakCount > 1 ? (streakCount - 1) * 100 : 0);
        
        updateScore(baseClearPts + specialPts + comboBonusPts);
        
        // Reward power-up items based on clear stats!
        if (linesCount >= 2) {
            addPowerUp('line');
        }
        if (streakCount >= 3) {
            addPowerUp('bomb');
        }
        if (linesCount >= 4) {
            addPowerUp('color');
        }
        
        // Show combo announcement banner UI
        triggerComboAlertBanner(linesCount, streakCount);
        
        // Delay visual reset to allow animations to show off nicely
        setTimeout(() => {
            // Nullify cells in state
            rowsToClear.forEach(r => {
                for (let c = 0; c < BOARD_SIZE; c++) {
                    boardState[r][c] = null;
                }
            });
            colsToClear.forEach(c => {
                for (let r = 0; r < BOARD_SIZE; r++) {
                    boardState[r][c] = null;
                }
            });
            
            // Nullify special-cleared cells
            specialCellsToClear.forEach(cell => {
                boardState[cell.r][cell.c] = null;
            });
            
            drawBoard();
            endTurnRoutine();
        }, 220); // Syncs with keyframe duration
        
    } else {
        // No lines cleared, reset streak multiplier
        streakCount = 0;
        endTurnRoutine();
    }
}

function triggerComboAlertBanner(linesCount, streak) {
    const banner = document.getElementById('combo-banner');
    
    // Calculate actual difficulty-adjusted points added
    const multiplier = getDifficultyMultiplier();
    const baseClearPts = linesCount * BOARD_SIZE * 10;
    const comboBonusPts = (linesCount > 1 ? linesCount * 50 : 0) + (streak > 1 ? (streak - 1) * 100 : 0);
    const totalDiffPoints = Math.round((baseClearPts + comboBonusPts) * multiplier);
    
    let msg = "LINE BLAST!";
    if (linesCount === 2) msg = `DOUBLE BLAST! +${totalDiffPoints}`;
    else if (linesCount === 3) msg = `TRIPLE BLAST! +${totalDiffPoints}`;
    else if (linesCount >= 4) msg = `MEGA BLAST OVERLOAD! +${totalDiffPoints}`;
    else msg = `LINE CLEAR! +${totalDiffPoints}`;
    
    if (streak > 1) {
        msg += ` | COMBO x${streak}`;
    }
    
    banner.textContent = msg;
    banner.parentElement.classList.add('show');
    
    setTimeout(() => {
        banner.parentElement.classList.remove('show');
    }, 1800);
}

function endTurnRoutine() {
    // 1. If tray is completely cleaned out of blocks, refill it!
    fillTray();
    
    // 2. Perform Game Over calculations to check remaining tray items fit
    checkGameOver();
}


// --- GAME OVER ALIGNMENT SYSTEM ---
function checkGameOver() {
    // Collect active remaining tray blocks
    let activeBlocksInTray = [];
    activeTrayShapes.forEach((shape, index) => {
        if (shape !== null) {
            activeBlocksInTray.push({ shape, index });
        }
    });
    
    // If tray has blocks, search if *any* could fit in any coordinate grid
    if (activeBlocksInTray.length > 0) {
        let isFitPossible = false;
        
        for (let i = 0; i < activeBlocksInTray.length; i++) {
            const { shape } = activeBlocksInTray[i];
            
            if (canShapeFitAnywhereOnBoard(shape)) {
                isFitPossible = true;
                break;
            }
        }
        
        if (!isFitPossible) {
            triggerGameOver();
        }
    }
}

// Scans every cell of board to see if shape satisfies boundaries
function canShapeFitAnywhereOnBoard(shape) {
    const sRows = shape.matrix.length;
    const sCols = shape.matrix[0].length;
    
    // Scan coordinates
    for (let r = 0; r <= BOARD_SIZE - sRows; r++) {
        for (let c = 0; c <= BOARD_SIZE - sCols; c++) {
            let spaceFound = true;
            
            // Scan internally relative matrix cells
            for (let sr = 0; sr < sRows; sr++) {
                for (let sc = 0; sc < sCols; sc++) {
                    if (shape.matrix[sr][sc] > 0) {
                        const cellStateVal = boardState[r + sr][c + sc];
                        if (cellStateVal !== null) {
                            spaceFound = false;
                            break;
                        }
                    }
                }
                if (!spaceFound) break;
            }
            
            if (spaceFound) {
                return true; // We found at least one viable fitment!
            }
        }
    }
    
    return false;
}

function triggerGameOver() {
    isGameOver = true;
    playGameOverSound();
    
    document.getElementById('final-score').textContent = score;
    document.getElementById('final-best').textContent = highScore;
    document.getElementById('game-over-overlay').classList.add('active');
}


// --- RESTART & FLOW CONTROLS ---
function startNewGame() {
    isGameOver = false;
    isPaused = false;
    score = 0;
    streakCount = 0;
    
    document.getElementById('score-val').textContent = "0";
    document.getElementById('game-over-overlay').classList.remove('active');
    document.getElementById('pause-overlay').classList.remove('active');
    document.getElementById('start-overlay').classList.remove('active');
    
    // Wipe board clean
    boardState = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
    drawBoard();
    
    // Refresher active tray shapes
    activeTrayShapes = [null, null, null];
    fillTray();
}


// --- UI EVENT LISTENERS SETUP ---

// Start Screen Button
document.getElementById('btn-start-play').addEventListener('click', () => {
    initAudio();
    document.getElementById('start-overlay').classList.remove('active');
    startNewGame();
});

// Pause state interactions
document.getElementById('btn-pause').addEventListener('click', () => {
    if (isGameOver) return;
    initAudio();
    isPaused = true;
    document.getElementById('pause-overlay').classList.add('active');
});

document.getElementById('btn-resume').addEventListener('click', () => {
    initAudio();
    isPaused = false;
    document.getElementById('pause-overlay').classList.remove('active');
});

// Restart buttons
let restartConfirmTimeout = null;
const restartBtn = document.getElementById('btn-restart');
restartBtn.addEventListener('click', () => {
    initAudio();
    if (restartBtn.classList.contains('confirming')) {
        clearTimeout(restartConfirmTimeout);
        restartBtn.classList.remove('confirming');
        restartBtn.style.background = '';
        restartBtn.style.color = '';
        restartBtn.setAttribute('title', 'Restart Game');
        startNewGame();
    } else {
        restartBtn.classList.add('confirming');
        restartBtn.style.background = '#ff477e';
        restartBtn.style.color = '#ffffff';
        restartBtn.setAttribute('title', 'Tap again to confirm restart');
        
        playTone(300, 'sine', 0.15, 0, 0.12);
        
        restartConfirmTimeout = setTimeout(() => {
            restartBtn.classList.remove('confirming');
            restartBtn.style.background = '';
            restartBtn.style.color = '';
            restartBtn.setAttribute('title', 'Restart Game');
        }, 3000);
    }
});

document.getElementById('btn-game-over-restart').addEventListener('click', () => {
    startNewGame();
});

function updateMusicState() {
    localStorage.setItem('block_blast_music', isMusicOn);
    
    // Sync all music toggle buttons in overlays
    document.querySelectorAll('.audio-toggle-btn[data-toggle="music"]').forEach(btn => {
        if (isMusicOn) {
            btn.classList.add('active');
            btn.querySelector('.audio-toggle-label').textContent = 'MUSIC: ON';
        } else {
            btn.classList.remove('active');
            btn.querySelector('.audio-toggle-label').textContent = 'MUSIC: OFF';
        }
    });
    
    // Sync header button
    const musicBtn = document.getElementById('btn-music');
    const path = document.querySelector('#music-icon path');
    if (musicBtn && path) {
        if (isMusicOn) {
            musicBtn.classList.remove('muted');
            path.setAttribute('d', 'M12,3V12.26C11.5,12.09 11,12 10.5,12C8,12 6,14 6,16.5C6,19 8,21 10.5,21C13,21 15,19 15,16.5V6H19V3H12Z');
            startMusic();
        } else {
            musicBtn.classList.add('muted');
            path.setAttribute('d', 'M4.27,3L3,4.27L12,13.27V13.55C11.53,13.21 11.04,13 10.5,13C8,13 6,15 6,17.5C6,20 8,22 10.5,22C13,22 15,20 15,17.5V16.27L19.73,21L21,19.73L4.27,3M12,3V8.27L14.73,11H19V8H15V3H12Z');
            stopMusic();
        }
    }
}

function updateSfxState() {
    localStorage.setItem('block_blast_sfx', isSfxOn);
    
    // Sync all SFX blocks in overlays
    document.querySelectorAll('.audio-toggle-btn[data-toggle="sfx"]').forEach(btn => {
        if (isSfxOn) {
            btn.classList.add('active');
            btn.querySelector('.audio-toggle-label').textContent = 'SOUNDS: ON';
        } else {
            btn.classList.remove('active');
            btn.querySelector('.audio-toggle-label').textContent = 'SOUNDS: OFF';
        }
    });
    
    // Sync header button
    const soundBtn = document.getElementById('btn-sound');
    const path = document.querySelector('#sound-icon path');
    if (soundBtn && path) {
        if (isSfxOn) {
            soundBtn.classList.remove('muted');
            path.setAttribute('d', 'M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.85 14,18.71V20.77C18.03,19.86 21,16.28 21,12C21,7.72 18.03,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.77 16.5,12M3,9V15H7L12,20V4L7,9H3Z');
        } else {
            soundBtn.classList.add('muted');
            path.setAttribute('d', 'M3.27,1.44L2,2.72L5.28,6H3V18H7L12,23V12.72L18.78,19.5C17.5,20.44 15.87,21.1 14,21.36V23.41C16.42,23.12 18.61,22.06 20.21,20.43L21.28,21.5L22.56,20.22L3.27,1.44M12,4L9.91,6.09L12,8.18V4M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.48,12.43 16.5,12.22 16.5,12M19,12C19,13.29 18.66,14.5 18.07,15.56L19.57,17.06C20.47,15.57 21,13.85 21,12C21,7.72 18.03,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12Z');
        }
    }
}

// Sound toggler setups
document.getElementById('btn-music').addEventListener('click', () => {
    isMusicOn = !isMusicOn;
    updateMusicState();
    if (isMusicOn) {
        playTone(523.25, 'sine', 0.1, 0, 0.05);
    }
});

document.getElementById('btn-sound').addEventListener('click', () => {
    isSfxOn = !isSfxOn;
    updateSfxState();
    if (isSfxOn) {
        initAudio();
        playTone(587.33, 'sine', 0.1, 0, 0.08);
    }
});

// Sync both sliders/toggles across overlay modals
document.querySelectorAll('.audio-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        const type = btn.getAttribute('data-toggle');
        if (type === 'music') {
            isMusicOn = !isMusicOn;
            updateMusicState();
            if (isMusicOn) {
                playTone(523.25, 'sine', 0.08, 0, 0.05);
            }
        } else if (type === 'sfx') {
            isSfxOn = !isSfxOn;
            updateSfxState();
            if (isSfxOn) {
                playTone(587.33, 'sine', 0.08, 0, 0.08);
            }
        }
    });
});


function setDifficulty(diff) {
    if (diff !== 'easy' && diff !== 'medium' && diff !== 'hard') return;
    
    currentDifficulty = diff;
    
    // Update active state classes on all buttons across all selectors
    document.querySelectorAll('.difficulty-btn').forEach(btn => {
        if (btn.getAttribute('data-diff') === diff) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update header difficulty badge
    const badge = document.getElementById('header-difficulty-badge');
    badge.className = `difficulty-badge ${diff}`;
    if (diff === 'easy') {
        badge.textContent = 'EASY Mode (1.0x)';
    } else if (diff === 'medium') {
        badge.textContent = 'MEDIUM Mode (1.5x)';
    } else if (diff === 'hard') {
        badge.textContent = 'HARD Mode (3.0x)';
    }
    
    // Load and refresh scores for the newly selected difficulty
    loadScores();
}

// Bind event listeners for the difficulty selector buttons
document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        initAudio();
        const selectedDiff = btn.getAttribute('data-diff');
        
        // Check if button resides in Pause Overlay
        const isPauseOverlay = btn.closest('#pause-overlay') !== null;
        
        if (isPauseOverlay) {
            if (confirm("Changing difficulty requires starting a new game. Proceed?")) {
                setDifficulty(selectedDiff);
                startNewGame();
            }
        } else {
            setDifficulty(selectedDiff);
            // Play a nice validation confirmation sound tone
            const toneFreq = selectedDiff === 'easy' ? 440 : (selectedDiff === 'medium' ? 554.37 : 659.25);
            playTone(toneFreq, 'sine', 0.1, 0, 0.08);
        }
    });
});


// --- APP ENTRY POINT ---
createBoardUI();
setDifficulty('medium'); // Set up initial badge & active buttons to match default
updateMusicState();      // Sync and bootstrap current music preferences
updateSfxState();        // Sync and bootstrap current sound effects (SFX) preferences
// Draw base grid of empty elements
drawBoard();
// Refill slots initially so they display behind start overlay nicely
fillTray();

// Initialize Power-ups inventories & UI
loadPowerUps();

// Bind powerup selection events
const puBombBtn = document.getElementById('pu-bomb');
const puLineBtn = document.getElementById('pu-line');
const puColorBtn = document.getElementById('pu-color');

if (puBombBtn) puBombBtn.addEventListener('click', () => togglePowerUp('bomb'));
if (puLineBtn) puLineBtn.addEventListener('click', () => togglePowerUp('line'));
if (puColorBtn) puColorBtn.addEventListener('click', () => togglePowerUp('color'));

// Bind targeting cell interaction events directly on the board
if (boardEl) {
    boardEl.addEventListener('click', (e) => {
        const cell = e.target.closest('.cell');
        if (!cell) return;
        const r = parseInt(cell.dataset.row, 10);
        const c = parseInt(cell.dataset.col, 10);
        
        if (activePowerUp) {
            onCellClicked(r, c);
        }
    });

    boardEl.addEventListener('mouseover', (e) => {
        if (!activePowerUp) return;
        const cell = e.target.closest('.cell');
        if (cell) {
            // Clear old highlighting overlays first
            document.querySelectorAll('.cell.targeting-hover').forEach(el => el.classList.remove('targeting-hover'));
            
            const r = parseInt(cell.dataset.row, 10);
            const c = parseInt(cell.dataset.col, 10);
            
            if (activePowerUp === 'bomb') {
                // Hover 3x3 region
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const nr = r + dr;
                        const nc = c + dc;
                        if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                            const targetCell = document.querySelector(`[data-row="${nr}"][data-col="${nc}"]`);
                            if (targetCell) targetCell.classList.add('targeting-hover');
                        }
                    }
                }
            } else if (activePowerUp === 'line') {
                // Hover row + col lines
                for (let col = 0; col < BOARD_SIZE; col++) {
                    const targetCell = document.querySelector(`[data-row="${r}"][data-col="${col}"]`);
                    if (targetCell) targetCell.classList.add('targeting-hover');
                }
                for (let row = 0; row < BOARD_SIZE; row++) {
                    const targetCell = document.querySelector(`[data-row="${row}"][data-col="${c}"]`);
                    if (targetCell) targetCell.classList.add('targeting-hover');
                }
            } else if (activePowerUp === 'color') {
                // Hover matching color blocks across grid
                const colorCode = boardState[r][c];
                if (colorCode) {
                    for (let row = 0; row < BOARD_SIZE; row++) {
                        for (let col = 0; col < BOARD_SIZE; col++) {
                            if (boardState[row][col] === colorCode) {
                                const targetCell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                                if (targetCell) targetCell.classList.add('targeting-hover');
                            }
                        }
                    }
                } else {
                    cell.classList.add('targeting-hover');
                }
            }
        }
    });

    boardEl.addEventListener('mouseout', () => {
        document.querySelectorAll('.cell.targeting-hover').forEach(el => el.classList.remove('targeting-hover'));
    });
}

// --- HAPTIC & BACK INTEGRATION BRIDGE ---
function triggerHaptic(type) {
    if (window.AndroidBridge && window.AndroidBridge.vibrate) {
        try {
            window.AndroidBridge.vibrate(type);
        } catch (e) {
            console.error("Haptic feedback error:", e);
        }
    } else if (navigator.vibrate) {
        try {
            if (type === 1) navigator.vibrate(25);
            else if (type === 2) navigator.vibrate(60);
            else if (type === 3) navigator.vibrate(120);
            else if (type === 4) navigator.vibrate([40, 30, 40, 30, 60]);
        } catch (e) {}
    }
}

window.handleAndroidBack = function() {
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay && startOverlay.classList.contains('active')) {
        if (window.AndroidBridge && window.AndroidBridge.exitApp) {
            window.AndroidBridge.exitApp();
        }
        return;
    }

    const gameOverOverlay = document.getElementById('game-over-overlay');
    if (gameOverOverlay && gameOverOverlay.classList.contains('active')) {
        gameOverOverlay.classList.remove('active');
        if (startOverlay) startOverlay.classList.add('active');
        return;
    }

    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay && pauseOverlay.classList.contains('active')) {
        isPaused = false;
        pauseOverlay.classList.remove('active');
        return;
    }

    if (activePowerUp) {
        activePowerUp = null;
        updatePowerUpUI();
        return;
    }

    if (!isGameOver && !isPaused) {
        isPaused = true;
        if (pauseOverlay) pauseOverlay.classList.add('active');
    } else {
        if (window.AndroidBridge && window.AndroidBridge.exitApp) {
            window.AndroidBridge.exitApp();
        }
    }
};
