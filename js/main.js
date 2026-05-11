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

// ── UI Components ─────────────────────────────────────────
const profileIndicator = document.createElement('div');
profileIndicator.id = 'profile-indicator';
profileIndicator.style.cssText = "position:absolute; top:12px; right:12px; font-size:0.7rem; color:var(--primary); font-weight:700; background:rgba(0,0,0,0.6); padding:4px 10px; border-radius:50px; border:1px solid rgba(255,204,0,0.3); z-index:100; cursor:pointer; transition: all 0.3s ease;";
profileIndicator.onclick = () => { if(confirm("Deseja trocar de conta?")) logout(); };
document.body.appendChild(profileIndicator);

function setSyncStatus(active) {
    if (active) {
        profileIndicator.style.boxShadow = "0 0 15px var(--primary)";
        profileIndicator.style.borderColor = "var(--primary)";
    } else {
        profileIndicator.style.boxShadow = "none";
        profileIndicator.style.borderColor = "rgba(255,204,0,0.3)";
    }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

// ═══════════════════════════════════════════════════════════
// SISTEMA DE CARREGAMENTO & INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

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
            img.onerror = () => { console.warn(`Asset fail: ${src}`); resolve(); };
        });
    });

    await Promise.all(promises);
    processAvatars();
}

async function init() {
    try {
        // 1. Restaurar Estado Local
        const localChars = localStorage.getItem('afrodiziaUnlockedChars');
        if (localChars) unlockedChars = JSON.parse(localChars);
        
        updateLoading(10, "INICIALIZANDO AUDIO...");
        audioSys = new AudioSystem('bg-music');
        
        updateLoading(20, "INICIALIZANDO ENGINE...");
        engine = new GameEngine3D(gameContainer, audioSys);
        
        updateLoading(50, "PREPARANDO LÍDERES...");
        await preloadAssets();
        
        updateLoading(100, "PRONTO!");
        
        // Finaliza o loading e decide qual tela mostrar
        setTimeout(() => {
            if (loadingScreen) loadingScreen.style.display = 'none';
            
            if (!playerInstagram) {
                if (registerScreen) registerScreen.style.display = 'flex';
                profileIndicator.style.display = 'none';
            } else {
                if (startScreen) startScreen.style.display = 'flex';
                profileIndicator.innerText = `@${playerInstagram}`;
                profileIndicator.style.display = 'block';
                updateUI();
                syncOnStart();
            }
        }, 500);

    } catch (err) {
        console.error("Erro na inicialização:", err);
        if (loadingStatus) loadingStatus.innerText = "ERRO DE CONEXÃO. RECARREGUE.";
    }
}

async function syncOnStart() {
    if (!playerInstagram) return;
    try {
        setSyncStatus(true);
        const profile = await getPlayerProfile(playerInstagram);
        if (profile) {
            playerName = profile.name || playerName;
            totalVozes = Math.max(totalVozes, parseInt(profile.totalVozes || profile.total_vozes || 0));
            
            let serverChars = profile.unlocked_chars || profile.unlockedChars || ['massau'];
            if (typeof serverChars === 'string') {
                try { serverChars = JSON.parse(serverChars); } catch(e) {}
            }
            unlockedChars = Array.from(new Set([...unlockedChars, ...serverChars]));
            
            localStorage.setItem('afrodiziaName', playerName);
            localStorage.setItem('afrodiziaTotalVozes', totalVozes);
            localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
            
            profileIndicator.innerText = `@${playerInstagram}`;
            updateUI();
        }
    } catch(e) {
        console.warn("[Sync] Falha na sincronização inicial");
    } finally {
        setSyncStatus(false);
    }
}

async function submitRegister(skip = false) {
    const nameInput = document.getElementById('input-name');
    const instaInput = document.getElementById('input-instagram');
    const errorEl = document.getElementById('register-error');

    if (skip) {
        if (errorEl) errorEl.innerText = "LOGIN NECESSÁRIO PARA JOGAR.";
        return;
    }

    const name = nameInput.value.trim();
    const insta = instaInput.value.trim().replace(/^@/, '').toLowerCase();
    
    if (!name || !insta) {
        if (errorEl) errorEl.innerText = "PREENCHA OS CAMPOS.";
        return;
    }

    if (errorEl) {
        errorEl.style.color = "var(--primary)";
        errorEl.innerText = "BUSCANDO PERFIL...";
    }

    playerName = name;
    playerInstagram = insta.replace(/\s/g, '').replace(/^@/, '');
    localStorage.setItem('afrodiziaName', name);
    localStorage.setItem('afrodiziaInstagram', playerInstagram);
    
    try {
        setSyncStatus(true);
        const profile = await getPlayerProfile(playerInstagram);
        if (profile) {
            totalVozes = Math.max(totalVozes, parseInt(profile.totalVozes || 0));
            playerName = profile.name || playerName;
            let serverChars = profile.unlocked_chars || ['massau'];
            if (typeof serverChars === 'string') {
                try { serverChars = JSON.parse(serverChars); } catch(e) {}
            }
            unlockedChars = Array.from(new Set([...unlockedChars, ...serverChars]));
            
            localStorage.setItem('afrodiziaName', playerName);
            localStorage.setItem('afrodiziaTotalVozes', totalVozes);
            localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
            
            if (errorEl) {
                errorEl.style.color = "#00ff88";
                errorEl.innerText = `PERFIL @${playerInstagram} SINCRONIZADO!`;
            }
            setTimeout(() => proceed(), 1000);
            return;
        }
    } catch(e) {
        console.error("Erro no login:", e);
    } finally {
        setSyncStatus(false);
    }

    proceed();

    function proceed() {
        if (registerScreen) registerScreen.style.display = 'none';
        if (startScreen) startScreen.style.display = 'flex';
        profileIndicator.innerText = `@${playerInstagram}`;
        profileIndicator.style.display = 'block';
        updateUI();
    }
}

function updateUI() {
    if (totalVozesEl) totalVozesEl.innerText = totalVozes.toLocaleString('pt-BR');
    
    const carousel = document.getElementById('char-carousel');
    const prevBtn = document.getElementById('carousel-prev');
    const nextBtn = document.getElementById('carousel-next');

    if (carousel && prevBtn && nextBtn) {
        prevBtn.onclick = () => carousel.scrollBy({ left: -150, behavior: 'smooth' });
        nextBtn.onclick = () => carousel.scrollBy({ left: 150, behavior: 'smooth' });
    }

    document.querySelectorAll('.char-btn').forEach(btn => {
        const charId = btn.dataset.char;
        const lock = btn.querySelector('.lock-overlay');
        
        if (unlockedChars.includes(charId)) {
            btn.classList.remove('locked');
            if (lock) lock.style.display = 'none';
        } else {
            btn.classList.add('locked');
            if (lock) lock.style.display = 'flex';
        }

        if (charId === lastSelectedChar) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

document.querySelector('.char-options')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.char-btn');
    if (!btn) return;

    const charId = btn.dataset.char;
    const cost = parseInt(btn.dataset.cost || 0);
    const descEl = document.getElementById('char-description');

    if (unlockedChars.includes(charId)) {
        lastSelectedChar = charId;
        localStorage.setItem('afrodiziaLastChar', charId);
        if (audioSys) audioSys.playWhoosh();
        if (descEl) descEl.innerText = "Líder Selecionado: " + CHAR_NAMES[charId];
        updateUI();
    } else if (totalVozes >= cost) {
        totalVozes -= cost;
        unlockedChars.push(charId);
        lastSelectedChar = charId;
        localStorage.setItem('afrodiziaTotalVozes', totalVozes);
        localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
        localStorage.setItem('afrodiziaLastChar', charId);
        if (audioSys) audioSys.playJump();
        syncStateToServer();
        updateUI();
    } else {
        if (descEl) descEl.innerText = `Necessário ${cost} vozes para desbloquear ${CHAR_NAMES[charId]}.`;
        btn.classList.add('shake');
        setTimeout(() => btn.classList.remove('shake'), 400);
    }
});

// Event Listeners
document.getElementById('btn-register')?.addEventListener('click', () => submitRegister(false));
document.getElementById('btn-start')?.addEventListener('click', startGame);
document.getElementById('btn-restart')?.addEventListener('click', () => {
    endScreen.style.display = 'none';
    startScreen.style.display = 'flex';
    updateUI();
});

document.getElementById('btn-open-ranking')?.addEventListener('click', () => {
    rankingScreen.style.display = 'flex';
    loadRanking(document.getElementById('ranking-full-list'), 50);
});
document.getElementById('btn-open-ranking-end')?.addEventListener('click', () => {
    rankingScreen.style.display = 'flex';
    loadRanking(document.getElementById('ranking-full-list'), 50);
});
document.getElementById('btn-close-ranking')?.addEventListener('click', () => {
    rankingScreen.style.display = 'none';
});
document.getElementById('btn-certificate')?.addEventListener('click', () => {
    window.open(`certificate.html?name=${encodeURIComponent(playerName)}&score=${finalScoreEl.innerText}`, '_blank');
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (audioSys && isPlaying) audioSys.audioElement.pause();
    } else {
        if (audioSys && isPlaying) audioSys.play();
    }
});

function startGame() {
    startScreen.style.display = 'none';
    uiContainer.style.display = 'block';
    
    if (audioSys) {
        audioSys.audioElement.currentTime = 0;
        audioSys.play();
    }
    
    const selBtn = document.querySelector('.char-btn.selected');
    const charId = selBtn ? selBtn.dataset.char : 'massau';
    
    engine.setPlayerCharacter(charId);
    engine.onScoreUpdate = (s, combo) => { 
        scoreDisplay.innerText = s.toLocaleString(); 
        
        let comboEl = document.getElementById('combo-display');
        if (combo && combo > 1) {
            if (!comboEl) {
                comboEl = document.createElement('div');
                comboEl.id = 'combo-display';
                comboEl.style.cssText = "position:absolute; top:40px; left:0; color:var(--primary); font-size:0.8rem; font-weight:900; text-shadow:0 0 10px rgba(255,204,0,0.5); transition: opacity 0.3s ease;";
                scoreDisplay.parentElement.appendChild(comboEl);
            }
            comboEl.innerText = `${combo}X COMBO`;
            comboEl.style.opacity = '1';
        } else if (comboEl) {
            comboEl.style.opacity = '0';
        }

        scoreDisplay.parentElement.classList.remove('score-pulse');
        void scoreDisplay.parentElement.offsetWidth;
        scoreDisplay.parentElement.classList.add('score-pulse');
    };
    engine.onGameOver = endGame;
    engine.startCinematic();
    
    isPlaying = true;
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

let lastTime = 0;
function gameLoop(currentTime) {
    if (!isPlaying) return;
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    engine.update(Math.min(dt, 0.1)); 
    requestAnimationFrame(gameLoop);
}

async function syncStateToServer() {
    if (!playerInstagram) return;
    await saveScore({
        name: playerName,
        instagram: playerInstagram,
        character: lastSelectedChar,
        score: 0, 
        totalVozes: totalVozes,
        unlockedChars: unlockedChars
    });
}

async function endGame(score) {
    isPlaying = false;
    engine.resetPowerups();
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
                const r = data[i], g = data[i+1], b = data[i+2];
                const isGreen = (g > 80 && g > r * 1.2 && g > b * 1.2);
                const isBlue  = (b > 80 && b > r * 1.1 && b > g * 1.1);
                if (isGreen || isBlue) data[i+3] = 0;
            }
            ctx.putImageData(imgData, 0, 0);
            avatar.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        };
    });
}

async function loadRanking(container, limit) {
    if (!container) return;
    const scores = await getTopScores(limit, playerInstagram);
    container.innerHTML = renderRankingHTML(scores, playerInstagram);
}

// Iniciar
init();