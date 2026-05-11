// ==========================================
// 🏆 RANKING SYSTEM — AFRODIZIA (PHP/MYSQL)
// ==========================================

// --- CONFIGURAÇÃO DO ENDPOINT DINÂMICO ---
const IS_PRODUCTION = window.location.hostname === 'afrodizia.com.br';
const API_URL = IS_PRODUCTION 
    ? 'http://afrodizia.com.br/ranking.php' 
    : (window.location.hostname === 'localhost' || window.location.hostname.includes('vercel.app') 
        ? '/api/ranking' 
        : 'http://afrodizia.com.br/ranking.php');

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

async function _fetchAPI(params = {}, method = 'GET', body = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s para conexões muito lentas

    const retry = async (retries = 2) => {
        try {
            const url = new URL(API_URL);
            if (method === 'GET') {
                Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
            }

            const options = {
                method,
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                cache: 'no-store'
            };
            if (body) options.body = JSON.stringify(body);

            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (error) {
            if (retries > 0 && error.name !== 'AbortError') {
                console.warn(`[Network] Tentando reconectar... (${retries})`);
                await new Promise(r => setTimeout(r, 2000)); // Espera 2s antes de tentar de novo
                return retry(retries - 1);
            }
            return null;
        }
    };

    return retry();
}


export async function saveScore(entry) {
    const payload = {
        name:      entry.name.substring(0, 25),
        instagram: entry.instagram.toLowerCase().replace(/\s/g, '').replace(/^@/, ''), 
        character: entry.character,
        score:     Math.min(Math.max(0, parseInt(entry.score) || 0), 999999),
        totalVozes: parseInt(entry.totalVozes) || 0,
        unlockedChars: entry.unlockedChars || ['massau'],
        timestamp: Date.now(),
    };

    console.log('[Ranking] Sincronizando score com MySQL...', payload.instagram);

    const data = await _fetchAPI({}, 'POST', payload);
    if (data && data.success) {
        console.log('[Ranking] Sincronizado!', data);
        return { 
            rank: data.rank || '??', 
            totalVozes: data.totalVozes || payload.totalVozes, 
            unlockedChars: data.unlockedChars || payload.unlockedChars 
        };
    }

    _saveLocal(payload);
    const all = getLocalScores();
    const sorted = all.sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(e => e.instagram === payload.instagram) + 1;
    return { rank: rank || '-', totalVozes: payload.totalVozes, unlockedChars: payload.unlockedChars };
}

let _rankingCache = { data: null, time: 0 };

export async function getTopScores(limit = 20, instagram = '') {
    // Otimização: Cache local de 60 segundos para evitar flood no servidor
    const now = Date.now();
    if (_rankingCache.data && (now - _rankingCache.time < 60000) && limit <= 20) {
        console.log('[Ranking] Usando cache local');
        return _rankingCache.data;
    }

    const data = await _fetchAPI({ limit, instagram });
    if (data) {
        _rankingCache = { data, time: now };
        return data;
    }

    console.warn('[Ranking] Usando dados locais (Offline)');
    return { 
        top: getLocalScores().sort((a, b) => b.score - a.score).slice(0, limit), 
        player: null 
    };
}


export async function getPlayerProfile(instagram) {
    const data = await _fetchAPI({ instagram });
    return data ? data.player : null;
}



function _saveLocal(entry) {
    let scores = getLocalScores();
    const idx = scores.findIndex(s => s.instagram === entry.instagram);
    if (idx > -1) {
        // Só atualiza se o score for maior, mas sempre atualiza vozes e chars
        scores[idx].score = Math.max(scores[idx].score, entry.score);
        scores[idx].totalVozes = entry.totalVozes;
        scores[idx].unlockedChars = entry.unlockedChars;
        scores[idx].name = entry.name;
    } else {
        scores.push(entry);
    }
    localStorage.setItem('afrodizia_ranking', JSON.stringify(scores.slice(0, 50)));
}

export function getLocalScores() {
    try {
        const local = localStorage.getItem('afrodizia_ranking');
        return local ? JSON.parse(local) : [];
    } catch (e) { return []; }
}

export function renderRankingHTML(data, currentInstagram = '') {
    // Garante que scores seja um array
    const scores = data && data.top ? data.top : (Array.isArray(data) ? data : []);
    const playerInfo = data && data.player ? data.player : null;

    if (!scores || scores.length === 0) {
        return `<div class="ranking-empty">Seja o primeiro a entrar no Ranking Mundial! 🏆</div>`;
    }


    let html = scores.map((entry, i) => {
        const entryInsta = (entry.instagram || '').toLowerCase();
        const isCurrent = currentInstagram && entryInsta === currentInstagram.toLowerCase();
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : i + 1));
        const icon = CHAR_ICONS[entry.character] || CHAR_ICONS[entry.lastChar] || CHAR_ICONS[entry.last_char] || '🎤';
        const charName = CHAR_NAMES[entry.character] || CHAR_NAMES[entry.lastChar] || CHAR_NAMES[entry.last_char] || 'Líder';
        const scoreValue = entry.best_score !== undefined ? entry.best_score : (entry.score || 0);
        const scoreFormatted = scoreValue.toLocaleString('pt-BR');

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

    // Se o jogador não está no Top exibido, mostra sua posição individual
    const isPlayerInTop = scores.some(e => (e.instagram || '').toLowerCase() === (currentInstagram || '').toLowerCase());
    
    if (currentInstagram && !isPlayerInTop && playerInfo) {
        const icon = CHAR_ICONS[playerInfo.character] || CHAR_ICONS[playerInfo.lastChar] || CHAR_ICONS[playerInfo.last_char] || '🎵';
        const charName = CHAR_NAMES[playerInfo.character] || CHAR_NAMES[playerInfo.lastChar] || CHAR_NAMES[playerInfo.last_char] || 'Você';
        const scoreValue = playerInfo.best_score !== undefined ? playerInfo.best_score : (playerInfo.score || 0);
        const scoreFormatted = scoreValue.toLocaleString('pt-BR');
        const rankValue = playerInfo.rank || '?';

        html += `
        <div class="ranking-divider" style="text-align:center; color:#666; margin: 15px 0; font-size: 0.8rem;">--- SUA POSIÇÃO ---</div>
        <div class="ranking-row ranking-row--current">
            <span class="rank-pos">#${rankValue}</span>
            <div class="rank-info">
                <span class="rank-name">${escapeHtml(playerInfo.name)}</span>
                <span class="rank-insta">@${escapeHtml(playerInfo.instagram)}</span>
            </div>
            <div class="rank-char">
                <span class="rank-char-icon">${icon}</span>
                <span class="rank-char-name">${charName}</span>
            </div>
            <span class="rank-score">${scoreFormatted}</span>
        </div>`;
    }

    return html;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

