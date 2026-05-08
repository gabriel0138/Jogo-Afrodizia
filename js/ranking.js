// ==========================================
// 🏆 RANKING SYSTEM — AFRODIZIA (VERCEL READY)
// ==========================================

// Substitua pela URL da sua API no Vercel após o deploy
const API_URL = 'ranking.php'; 

export const CHAR_ICONS = {
    massau:   '🎤',
    tony:     '🎷',
    priscilla:'⚡',
    morgado:  '🎸',
    sub:      '🎵'
};

export const CHAR_NAMES = {
    massau:   'Massau',
    tony:     'Tony',
    priscilla:'Priscilla',
    morgado:  'Morgado',
    sub:      'Sub'
};

/** 
 * SAVE: Envia o score e sincroniza o progresso com a Locaweb
 */
export async function saveScore(entry) {
    const payload = {
        name:      entry.name.substring(0, 25),
        instagram: entry.instagram.replace(/[^a-zA-Z0-9._]/g, '').substring(0, 30),
        character: entry.character,
        score:     Math.min(Math.max(0, parseInt(entry.score) || 0), 999999),
        totalVozes: parseInt(entry.totalVozes) || 0,
        unlockedChars: entry.unlockedChars || ['massau'], // CRUCIAL: Salva o progresso
        timestamp: Date.now(),
    };

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (res.ok) {
            console.log('[Ranking] Sincronizado com Locaweb!');
            const data = await res.json();
            return { 
                rank: data.rank || '??',
                totalVozes: data.totalVozes || payload.totalVozes,
                unlockedChars: data.unlockedChars || payload.unlockedChars
            };
        }
    } catch (err) {
        console.warn('[Ranking] Modo offline ativado.', err);
        _saveLocal(payload);
    }

    // Fallback local
    const all = getLocalScores();
    const sorted = all.sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(e => e.instagram === payload.instagram && e.score === payload.score) + 1;
    return { rank: rank || '-', totalVozes: payload.totalVozes, unlockedChars: payload.unlockedChars };
}

/**
 * GET_PROFILE: Busca os dados de um jogador específico para sincronizar
 */
export async function getPlayerProfile(instagram) {
    if (!instagram) return null;
    try {
        const res = await fetch(`${API_URL}?instagram=${instagram}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (err) {
        console.warn('[Ranking] Erro ao buscar perfil remoto.', err);
    }
    return null;
}

/** 
 * GET: Busca os Top N scores da API ou local
 */
export async function getTopScores(limit = 10) {
    try {
        const res = await fetch(`${API_URL}?limit=${limit}`);
        if (res.ok) {
            return await res.json();
        }
    } catch (err) {
        console.warn('[Ranking] Erro ao buscar ranking remoto, lendo local.', err);
    }
    
    return getLocalScores().sort((a, b) => b.score - a.score).slice(0, limit);
}

/** ----------------------------------------
 * HELPER: Persiste no localStorage
 * ---------------------------------------- */
function _saveLocal(entry) {
    const scores = getLocalScores();
    // Mantém apenas o melhor score por instagram
    const existingIdx = scores.findIndex(s => s.instagram === entry.instagram);
    if (existingIdx >= 0) {
        if (entry.score > scores[existingIdx].score) scores[existingIdx] = entry;
    } else {
        scores.push(entry);
    }
    // Guarda apenas top 100
    scores.sort((a, b) => b.score - a.score);
    localStorage.setItem('afrodiziaScores', JSON.stringify(scores.slice(0, 100)));
}

export function getLocalScores() {
    try {
        return JSON.parse(localStorage.getItem('afrodiziaScores') || '[]');
    } catch { return []; }
}

/** ----------------------------------------
 * RENDER: Gera o HTML do ranking
 * @param {Array} scores
 * @param {string} currentInstagram - Para destacar o jogador atual
 * @returns {string} HTML
 * ---------------------------------------- */
export function renderRankingHTML(scores, currentInstagram = '') {
    if (!scores || scores.length === 0) {
        return `<div class="ranking-empty">Seja o primeiro a entrar no ranking! 🔥</div>`;
    }

    const medals = ['🥇', '🥈', '🥉'];

    return scores.map((entry, i) => {
        const pos = i + 1;
        const medal = medals[i] || `<span class="rank-num">${pos}</span>`;
        const icon = CHAR_ICONS[entry.character] || '🎵';
        const charName = CHAR_NAMES[entry.character] || entry.character;
        const isCurrent = entry.instagram.toLowerCase() === currentInstagram.toLowerCase();
        const scoreFormatted = entry.score.toLocaleString('pt-BR');

        return `
        <div class="ranking-row ${isCurrent ? 'ranking-row--current' : ''}">
            <span class="rank-pos">${medal}</span>
            <div class="rank-info">
                <span class="rank-name">${escapeHtml(entry.name)}</span>
                <span class="rank-insta">@${escapeHtml(entry.instagram)}</span>
            </div>
            <div class="rank-char">
                <span class="rank-char-icon">${icon}</span>
                <span class="rank-char-name">${charName}</span>
            </div>
            <span class="rank-score">${scoreFormatted}</span>
        </div>`;
    }).join('');

    // NOVO: Adiciona a posição do jogador atual se ele NÃO estiver no Top (para visualização de contexto)
    if (currentInstagram) {
        const isPlayerInTop = scores.some(e => e.instagram.toLowerCase() === currentInstagram.toLowerCase());
        if (!isPlayerInTop) {
            // Buscamos o score local para mostrar o "VOCÊ" (contexto de ranking pessoal)
            const localScores = getLocalScores();
            const playerEntry = localScores.find(e => e.instagram.toLowerCase() === currentInstagram.toLowerCase());
            
            if (playerEntry) {
                const icon = CHAR_ICONS[playerEntry.character] || '🎵';
                const charName = CHAR_NAMES[playerEntry.character] || playerEntry.character;
                const scoreFormatted = playerEntry.score.toLocaleString('pt-BR');

                html += `
                <div class="ranking-divider" style="text-align:center; color:#444; margin: 10px 0;">...</div>
                <div class="ranking-row ranking-row--current">
                    <span class="rank-pos">#</span>
                    <div class="rank-info">
                        <span class="rank-name">${escapeHtml(playerEntry.name)} (VOCÊ)</span>
                        <span class="rank-insta">@${escapeHtml(playerEntry.instagram)}</span>
                    </div>
                    <div class="rank-char">
                        <span class="rank-char-icon">${icon}</span>
                        <span class="rank-char-name">${charName}</span>
                    </div>
                    <span class="rank-score">${scoreFormatted}</span>
                </div>`;
            }
        }
    }

    return html;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
