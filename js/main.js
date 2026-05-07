import { AudioSystem } from './audio.js';
import { GameEngine3D } from './engine_3d.js';
import { saveScore, getTopScores, getPlayerProfile, renderRankingHTML, CHAR_ICONS, CHAR_NAMES } from './ranking.js';

// ── DOM Elements ──────────────────────────────────────────
const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const progressBar = document.getElementById('main-progress-bar');
const registerScreen = document.getElementById('register-screen');
const startScreen = document.getElementById('start-screen');
const endScreen = document.getElementById('end-screen');
const rankingScreen = document.getElementById('ranking-screen');
const uiContainer = document.getElementById('ui-container');
const gameContainer = document.getElementById('game-container');
const scoreDisplay = document.getElementById('scoreDisplay');
const finalScoreEl = document.getElementById('final-score');
const totalVozesEl = document.getElementById('total-vozes-display');

// ── Estado ────────────────────────────────────────────────
let playerName = localStorage.getItem('afrodiziaName') || '';
let playerInstagram = localStorage.getItem('afrodiziaInstagram') || '';
let totalVozes = parseInt(localStorage.getItem('afrodiziaTotalVozes')) || 0;
let unlockedChars = ['massau'];
let lastSelectedChar = localStorage.getItem('afrodiziaLastChar') || 'massau';
let engine = null;
let audioSys = null;
let isPlaying = false;
let animId = null;

// ═══════════════════════════════════════════════════════════
// SISTEMA DE CARREGAMENTO (PRE-LOADER)
// ═══════════════════════════════════════════════════════════

async function init() {
    try {
        // 1. CARREGAMENTO INSTANTÂNEO (Local)
        const localChars = localStorage.getItem('afrodiziaUnlockedChars');
        if (localChars) unlockedChars = JSON.parse(localChars);
        
        updateUI(); 

        updateLoading(10, "INICIALIZANDO ENGINE...");
        engine = new GameEngine3D(gameContainer, null);
        
        updateLoading(30, "CARREGANDO SONS...");
        audioSys = new AudioSystem('bg-music');
        
        audioSys.onEnded = () => {
            console.log("[Audio] Trilha sonora finalizada.");
            if (isPlaying) endGame(engine ? engine.score : 0);
        };
        
        updateLoading(50, "PREPARANDO LÍDERES...");
        await preloadAssets();
        
        // 2. SINCRONIZAÇÃO EM SEGUNDO PLANO
        if (playerInstagram) {
            updateLoading(70, "SINCRONIZANDO...");
            getPlayerProfile(playerInstagram).then(profile => {
                if (profile) {
                    totalVozes = Math.max(totalVozes, parseInt(profile.total_vozes || 0));
                    const serverChars = profile.unlocked_chars || ['massau'];
                    unlockedChars = Array.from(new Set([...unlockedChars, ...serverChars]));
                    
                    localStorage.setItem('afrodiziaTotalVozes', totalVozes);
                    localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
                    updateUI();
                }
            }).catch(e => console.warn("Modo Offline Ativo"));
        }

        updateLoading(100, "PRONTO!");
        setTimeout(showNextScreen, 500);

    } catch (err) {
        console.error("Erro na inicialização:", err);
        loadingStatus.innerText = "VERIFIQUE SUA CONEXÃO.";
    }
}

function updateLoading(percent, status) {
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (loadingStatus) loadingStatus.innerText = status;
}

async function preloadAssets() {
    const assets = [
        'assets/img/afrodizia.png',
        'assets/img/marcal_run_1.png',
        'assets/img/tony_run_1.png',
        'assets/img/priscilla_run_1.png',
        'assets/img/morgado_run_1.png'
    ];
    
    let loadedCount = 0;
    const promises = assets.map(src => {
        return new Promise((resolve) => {
            const img = new Image();
            img.src = src;
            img.onload = () => { loadedCount++; resolve(); };
            img.onerror = () => { console.warn(`Falha ao carregar asset: ${src}`); resolve(); };
        });
    });

    await Promise.all(promises);
    processAvatars(); // Processa chroma key após carregar
}

function showNextScreen() {
    loadingScreen.style.display = 'none';
    if (playerName) {
        startScreen.style.display = 'flex';
        updateUI();
    } else {
        registerScreen.style.display = 'flex';
    }
}

// ═══════════════════════════════════════════════════════════
// REGISTRO E UI
// ═══════════════════════════════════════════════════════════

async function submitRegister(skip = false) {
    const nameInput = document.getElementById('input-name');
    const instaInput = document.getElementById('input-instagram');
    const errorEl = document.getElementById('register-error');

    if (!skip) {
        const name = nameInput.value.trim();
        const insta = instaInput.value.trim().replace(/^@/, '').toLowerCase();
        
        if (!name || !insta) {
            errorEl.innerText = "Preencha todos os campos.";
            return;
        }

        playerName = name;
        playerInstagram = insta;
        localStorage.setItem('afrodiziaName', name);
        localStorage.setItem('afrodiziaInstagram', insta);
    } else {
        playerName = "Visitante";
        playerInstagram = "";
    }

    registerScreen.style.display = 'none';
    startScreen.style.display = 'flex';
    updateUI();
}

function updateUI() {
    if (totalVozesEl) totalVozesEl.innerText = totalVozes.toLocaleString('pt-BR');
    
    document.querySelectorAll('.char-btn').forEach(btn => {
        const charId = btn.dataset.char;
        const cost = parseInt(btn.dataset.cost || 0);
        
        // 1. Gerencia bloqueio
        if (unlockedChars.includes(charId)) {
            btn.classList.remove('locked');
        } else {
            btn.classList.add('locked');
        }

        // 2. Gerencia seleção visual
        if (charId === lastSelectedChar) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

// Lógica de Seleção / Compra
document.querySelector('.char-options')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.char-btn');
    if (!btn) return;

    const charId = btn.dataset.char;
    const cost = parseInt(btn.dataset.cost || 0);

    if (unlockedChars.includes(charId)) {
        // Selecionar
        lastSelectedChar = charId;
        localStorage.setItem('afrodiziaLastChar', charId);
        updateUI();
    } else if (totalVozes >= cost) {
        // Comprar
        totalVozes -= cost;
        unlockedChars.push(charId);
        lastSelectedChar = charId;
        localStorage.setItem('afrodiziaTotalVozes', totalVozes);
        localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
        localStorage.setItem('afrodiziaLastChar', charId);
        updateUI();
    }
});

// Event Listeners
document.getElementById('btn-register')?.addEventListener('click', () => submitRegister(false));
document.getElementById('btn-skip-register')?.addEventListener('click', () => submitRegister(true));
document.getElementById('btn-start')?.addEventListener('click', startGame);
document.getElementById('btn-restart')?.addEventListener('click', () => {
    endScreen.style.display = 'none';
    startScreen.style.display = 'flex';
    updateUI();
});

// Correção de Áudio ao sair/voltar da aba
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (audioSys && isPlaying) audioSys.audioElement.pause();
    } else {
        if (audioSys && isPlaying) audioSys.play(); // Play já faz o resume do contexto
    }
});

// ═══════════════════════════════════════════════════════════
// LOOP DO JOGO
// ═══════════════════════════════════════════════════════════

function startGame() {
    startScreen.style.display = 'none';
    uiContainer.style.display = 'block';
    
    if (audioSys) {
        audioSys.audioElement.currentTime = 0; // Começa do início
        audioSys.play();
    }
    
    const selBtn = document.querySelector('.char-btn.selected');
    const charId = selBtn ? selBtn.dataset.char : 'massau';
    
    engine.setPlayerCharacter(charId);
    engine.onScoreUpdate = (s) => { 
        scoreDisplay.innerText = s; 
        scoreDisplay.parentElement.classList.remove('score-pulse');
        void scoreDisplay.parentElement.offsetWidth; // Force reflow
        scoreDisplay.parentElement.classList.add('score-pulse');
    };
    engine.onGameOver = endGame;
    
    isPlaying = true;
    requestAnimationFrame(gameLoop);
}

function gameLoop(currentTime) {
    if (!isPlaying) return;
    engine.update(0.016); // ~60fps fixed step para estabilidade
    requestAnimationFrame(gameLoop);
}

async function endGame(score) {
    isPlaying = false;
    uiContainer.style.display = 'none';
    endScreen.style.display = 'flex';
    finalScoreEl.innerText = score.toLocaleString('pt-BR');
    
    totalVozes += score;
    localStorage.setItem('afrodiziaTotalVozes', totalVozes);

    const badgeEl = document.getElementById('result-rank-badge');
    if (playerInstagram && score > 0) {
        badgeEl.innerText = "SINCRONIZANDO...";
        const res = await saveScore({
            name: playerName,
            instagram: playerInstagram,
            character: engine.selectedChar,
            score: score,
            totalVozes: totalVozes,
            unlockedChars: unlockedChars
        });
        if (res) badgeEl.innerText = `POSIÇÃO NO RANKING: #${res.rank}`;
    }
    
    loadRanking(document.getElementById('ranking-list'), 5);
}

// Auxiliares (Avatar Chroma Key)
function processAvatars() {
    document.querySelectorAll('.char-avatar[data-src]').forEach(avatar => {
        const img = new Image();
        img.src = avatar.dataset.src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                if (data[i+1] > 100 && data[i+1] > data[i] * 1.5) data[i+3] = 0; // Green screen simples
            }
            ctx.putImageData(imgData, 0, 0);
            avatar.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        };
    });
}

async function loadRanking(container, limit) {
    if (!container) return;
    const scores = await getTopScores(limit);
    container.innerHTML = renderRankingHTML(scores, playerInstagram);
}

// Iniciar tudo
init();