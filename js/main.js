import { AudioSystem } from './audio.js';
import { GameEngine3D } from './engine_3d.js';
import { saveScore, getTopScores, getPlayerProfile, renderRankingHTML, CHAR_ICONS, CHAR_NAMES } from './ranking.js';

// ── DOM Elements ──────────────────────────────────────────
const registerScreen = document.getElementById('register-screen');
const startScreen    = document.getElementById('start-screen');
const endScreen      = document.getElementById('end-screen');
const rankingScreen  = document.getElementById('ranking-screen');
const uiContainer    = document.getElementById('ui-container');
const gameContainer  = document.getElementById('game-container');
const scoreDisplay   = document.getElementById('scoreDisplay');
const finalScoreEl   = document.getElementById('final-score');
const totalVozesEl   = document.getElementById('total-vozes-display');
const btnStart       = document.getElementById('btn-start');
const btnRestart     = document.getElementById('btn-restart');
const btnRegister     = document.getElementById('btn-register');
const btnSkipRegister = document.getElementById('btn-skip-register');
const inputName       = document.getElementById('input-name');
const inputInstagram  = document.getElementById('input-instagram');
const registerError   = document.getElementById('register-error');

// ── Ranking Elements ──────────────────────────────────────
const btnOpenRanking    = document.getElementById('btn-open-ranking');
const btnOpenRankingEnd = document.getElementById('btn-open-ranking-end');
const btnCloseRanking   = document.getElementById('btn-close-ranking');
const rankingList       = document.getElementById('ranking-list');
const rankingFullList   = document.getElementById('ranking-full-list');

// ── Estado do Jogador ─────────────────────────────────────
let playerName      = sessionStorage.getItem('afrodiziaName') || '';
let playerInstagram = sessionStorage.getItem('afrodiziaInstagram') || '';
let totalVozes      = parseInt(localStorage.getItem('afrodiziaTotalVozes')) || 0;
let unlockedChars   = ['massau'];

try {
    const saved = localStorage.getItem('afrodiziaUnlockedChars');
    if (saved) {
        unlockedChars = JSON.parse(saved);
        if (!unlockedChars.includes('massau')) unlockedChars.unshift('massau');
    }
} catch(e) { console.warn("Erro ao carregar personagens", e); }

// ── Estado do Jogo ────────────────────────────────────────
let engine    = null;
let audioSys  = null;
let isPlaying = false;
let animId    = null;
let lastTime  = 0;
let firstRun  = true;

const charSkills = {
    massau:   "MEGAFONE PLUS: 10 segundos de invencibilidade e pontos em dobro.",
    tony:     "A VOZ DO POVO: Ganha +8% de bonus na coleta por aliado na multidao.",
    priscilla:"MAQUINA DE COMBATE: Jaqueta magnetica que atrai Vozes proximas.",
    morgado:  "RIFF DE RESGATE: A cada 8 segundos, emite um acorde potente que atrai aliados.",
    sub:      "NOTAS FANTASMA: Fica intangivel periodicamente, atravessando obstaculos."
};

// ═══════════════════════════════════════════════════════════
// REGISTRO
// ═══════════════════════════════════════════════════════════

async function submitRegister(skip = false) {
    registerError.innerText = '';
    
    if (!skip) {
        const name  = inputName.value.trim();
        const insta = inputInstagram.value.trim().replace(/^@/, '').toLowerCase();
        if (!name) { registerError.innerText = 'Insira seu nome.'; return; }
        if (!insta) { registerError.innerText = 'Insira seu @Instagram.'; return; }
        
        btnRegister.disabled = true;
        btnRegister.innerText = 'Sincronizando...';

        // Sincroniza com o servidor se já existir conta
        const profile = await getPlayerProfile(insta);
        if (profile) {
            playerName = profile.name || name;
            playerInstagram = insta;
            totalVozes = profile.totalVozes || 0;
            localStorage.setItem('afrodiziaTotalVozes', totalVozes);
            console.log(`[Sync] Perfil recuperado: ${totalVozes} vozes.`);
        } else {
            playerName = name;
            playerInstagram = insta;
        }

        sessionStorage.setItem('afrodiziaName', playerName);
        sessionStorage.setItem('afrodiziaInstagram', playerInstagram);
        btnRegister.disabled = false;
        btnRegister.innerText = 'ENTRAR NA MARCHA →';
    } else {
        playerName = 'Anonimo';
        playerInstagram = '';
    }
    
    registerScreen.style.display = 'none';
    startScreen.style.display    = 'flex';
    updateUI();
}

btnRegister?.addEventListener('click', () => submitRegister(false));
btnSkipRegister?.addEventListener('click', () => submitRegister(true));

if (playerName) {
    registerScreen.style.display = 'none';
    startScreen.style.display    = 'flex';
}

// ═══════════════════════════════════════════════════════════
// UI DO MENU
// ═══════════════════════════════════════════════════════════

function updateUI() {
    const vozesSafe = parseInt(totalVozes) || 0;
    if (totalVozesEl) totalVozesEl.innerText = vozesSafe.toLocaleString('pt-BR');
    
    document.querySelectorAll('.char-btn').forEach(btn => {
        const charId = btn.dataset.char;
        const cost   = parseInt(btn.dataset.cost);
        const lbl    = btn.querySelector('.char-cost');

        if (unlockedChars.includes(charId)) {
            btn.classList.remove('locked');
            if (lbl) { lbl.innerText = 'DISPONÍVEL'; lbl.style.color = '#00ffcc'; }
        } else {
            btn.classList.add('locked');
            if (lbl) lbl.innerText = `🔒 ${cost}`;
        }
    });
}

/**
 * Inicializa a seleção de personagens com delegação de eventos.
 * Resolve bugs de múltiplos cliques e melhora a responsividade.
 */
function initCharacterSelection() {
    const container = document.querySelector('.char-options');
    if (!container) return;

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.char-btn');
        if (!btn) return;

        const charId = btn.dataset.char;
        const cost   = parseInt(btn.dataset.cost);
        const descEl = document.getElementById('char-description');

        // Sempre atualiza a descrição da habilidade
        if (descEl) {
            descEl.classList.remove('pulse-once');
            void descEl.offsetWidth; // Force reflow
            descEl.innerHTML = `⚡ ${charSkills[charId] || "???"}`;
            descEl.classList.add('pulse-once');
        }

        if (unlockedChars.includes(charId)) {
            // Selecionar personagem já desbloqueado
            document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            
            // Som de feedback se existir
            if (audioSys && audioSys.playTap) audioSys.playTap();
            
            console.log(`Personagem selecionado: ${charId}`);
        } else {
            // Tentar desbloquear
            if (totalVozes >= cost) {
                totalVozes -= cost;
                unlockedChars.push(charId);
                
                localStorage.setItem('afrodiziaTotalVozes', totalVozes);
                localStorage.setItem('afrodiziaUnlockedChars', JSON.stringify(unlockedChars));
                
                updateUI();
                
                // Seleciona automaticamente após a compra
                document.querySelectorAll('.char-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                
                if (audioSys && audioSys.playUnlock) audioSys.playUnlock();
            } else {
                // Feedback de saldo insuficiente
                const lbl = btn.querySelector('.char-cost');
                if (lbl) {
                    const originalText = lbl.innerText;
                    lbl.innerText = 'SALDO INSUFICIENTE';
                    lbl.style.color = '#ff4444';
                    setTimeout(() => {
                        lbl.innerText = originalText;
                        lbl.style.color = '';
                    }, 1500);
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════════════
// JOGO
// ═══════════════════════════════════════════════════════════

function startGame() {
    startScreen.style.display = 'none';
    endScreen.style.display   = 'none';
    uiContainer.style.display = 'block';
    if (!audioSys) audioSys = new AudioSystem('bg-music');
    audioSys.play();

    if (!engine) {
        engine = new GameEngine3D(gameContainer, audioSys);
    } else {
        engine.audio = audioSys;
    }
    
    const selBtn = document.querySelector('.char-btn.selected');
    if (selBtn) engine.setPlayerCharacter(selBtn.dataset.char);

    engine.onScoreUpdate = (s) => { scoreDisplay.innerText = s; };
    engine.onGameOver = (score) => endGame(score);

    isPlaying = true;

    // Inicia a cinemática se for a primeira vez
    if (firstRun && engine && engine.isReady) {
        engine.startCinematic();
        firstRun = false;
    }

    lastTime = performance.now();
    animId = requestAnimationFrame(gameLoop);

    // DEBUG: Atalho para encerrar fase (Tecla 'K')
    const debugHandler = (e) => {
        if (isPlaying && e.key.toLowerCase() === 'k') {
            console.log("Debug: Encerrando fase via atalho...");
            endGame(engine ? engine.score : 0);
            window.removeEventListener('keydown', debugHandler);
        }
    };
    window.addEventListener('keydown', debugHandler);
}

function gameLoop(currentTime) {
    if (!isPlaying) return;
    const dt = Math.min(0.1, (currentTime - lastTime) / 1000);
    lastTime = currentTime;
    if (engine) engine.update(dt);
    animId = requestAnimationFrame(gameLoop);
}

async function endGame(score) {
    isPlaying = false;
    if (animId) cancelAnimationFrame(animId);
    uiContainer.style.display = 'none';
    endScreen.style.display   = 'flex';

    const charId = (engine && engine.selectedChar) ? engine.selectedChar : 'massau';
    const charIcon = CHAR_ICONS[charId] || '🎵';

    const scoreSafe = parseInt(score) || 0;
    if (finalScoreEl) finalScoreEl.innerText = scoreSafe.toLocaleString('pt-BR');
    
    const charIconEl = document.getElementById('result-char-icon');
    if (charIconEl) charIconEl.innerText = charIcon;
    
    const playerNameEl = document.getElementById('result-player-name');
    if (playerNameEl) playerNameEl.innerText = playerName || 'Jogador';
    
    const playerInstaEl = document.getElementById('result-player-insta');
    if (playerInstaEl) playerInstaEl.innerText = playerInstagram ? `@${playerInstagram}` : '';

    totalVozes += scoreSafe;
    localStorage.setItem('afrodiziaTotalVozes', totalVozes);
    updateUI();

    const badgeEl = document.getElementById('result-rank-badge');
    if (playerInstagram && scoreSafe > 0) {
        if (badgeEl) badgeEl.innerText = 'Salvando no Ranking...';
        const result = await saveScore({ 
            name: playerName, 
            instagram: playerInstagram, 
            character: charId, 
            score: scoreSafe,
            totalVozes: totalVozes
        });
        
        if (result) {
            if (badgeEl) badgeEl.innerText = `Voce ficou em #${result.rank} no ranking mundial!`;
            if (result.totalVozes) {
                totalVozes = result.totalVozes;
                localStorage.setItem('afrodiziaTotalVozes', totalVozes);
                updateUI();
            }
        }
    }
    loadRanking(rankingList, 8);
}

btnStart?.addEventListener('click', startGame);

btnRestart?.addEventListener('click', () => {
    // Retorna a tela principal para trocar de personagem ou ver ranking
    endScreen.style.display = 'none';
    startScreen.style.display = 'flex';
    updateUI();
});

// ═══════════════════════════════════════════════════════════
// RANKING & CHROMA KEY & CERTIFICADO
// ═══════════════════════════════════════════════════════════

async function loadRanking(container, limit = 20) {
    container.innerHTML = 'Carregando...';
    const scores = await getTopScores(limit);
    container.innerHTML = renderRankingHTML(scores, playerInstagram);
}

function processAvatars() {
    document.querySelectorAll('.char-avatar[data-src]').forEach(avatar => {
        const src = avatar.dataset.src;
        const chroma = avatar.dataset.chroma;
        const img = new Image();
        img.src = src;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width; canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i], g = data[i+1], b = data[i+2];
                if (chroma === 'green' && g > r * 1.2 && g > b * 1.2) data[i+3] = 0;
                else if (chroma === 'blue' && b > r * 1.2 && b > g * 1.2) data[i+3] = 0;
            }
            ctx.putImageData(imgData, 0, 0);
            avatar.style.backgroundImage = `url('${canvas.toDataURL()}')`;
        };
    });
}

function downloadCertificate() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920; canvas.height = 1080;
    const w = 1920, h = 1080;
    const charId = engine ? engine.selectedChar : 'massau';
    const score = document.getElementById('final-score').innerText || '0';

    ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffcc00'; ctx.lineWidth = 20; ctx.strokeRect(40, 40, w-80, h-80);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ffcc00';
    ctx.font = '900 80px sans-serif'; ctx.fillText('CERTIFICADO EMBAIXADOR ANTI-RACISTA', w/2, 250);
    ctx.fillStyle = '#fff'; ctx.font = '400 50px sans-serif';
    ctx.fillText(playerName.toUpperCase(), w/2, 450);
    ctx.fillText(`Marchou com ${CHAR_NAMES[charId]} e reuniu ${score} vozes.`, w/2, 600);
    
    const link = document.createElement('a');
    link.download = `Certificado_Afrodizia.png`;
    link.href = canvas.toDataURL();
    link.click();
}

document.getElementById('btn-certificate')?.addEventListener('click', downloadCertificate);

processAvatars();
initCharacterSelection();
updateUI();

// Inicializa a engine
engine = new GameEngine3D(gameContainer, null);