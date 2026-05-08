// ==========================================
// 🏆 RANKING SYSTEM — AFRODIZIA (HYBRID)
// ==========================================

const API_URL = 'ranking.php'; 
const VERCEL_URL = '/api/ranking';

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

export async function saveScore(entry) {
    const payload = {
        name:      entry.name.substring(0, 25),
        instagram: entry.instagram.replace(/[^a-zA-Z0-9._]/g, '').substring(0, 30),
        character: entry.character,
        score:     Math.min(Math.max(0, parseInt(entry.score) || 0), 999999),
        totalVozes: parseInt(entry.totalVozes) || 0,
        unlockedChars: entry.unlockedChars || ['massau'],
        timestamp: Date.now(),
    };

    try {
        let response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok || response.status === 404) {
            response = await fetch(VERCEL_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        if (response.ok) {
            const data = await response.json();
            return { rank: data.rank || '??', totalVozes: payload.totalVozes, unlockedChars: payload.unlockedChars };
        }
    } catch (err) {
        console.warn('[Ranking] Usando cache local.', err);
    }

    _saveLocal(payload);
    const all = getLocalScores();
    const sorted = all.sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex(e => e.instagram === payload.instagram) + 1;
    return { rank: rank || '-', totalVozes: payload.totalVozes, unlockedChars: payload.unlockedChars };
}

export async function getTopScores(limit = 20) {
    try {
        let response = await fetch(`${API_URL}?limit=${limit}`);
        
        if (!response.ok || response.status === 404) {
            response = await fetch(`${VERCEL_URL}?limit=${limit}`);
        }

        if (response.ok) return await response.json();
    } catch (err) {
        console.warn('[Ranking] Offline.');
    }
    return getLocalScores().sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getPlayerProfile(instagram) {
    try {
        let response = await fetch(`${API_URL}?instagram=${instagram}`);
        if (!response.ok || response.status === 404) {
            response = await fetch(`${VERCEL_URL}?instagram=${instagram}`);
        }
        if (response.ok) return await response.json();
    } catch (err) { }
    return null;
}

function _saveLocal(entry) {
    let scores = getLocalScores();
    const idx = scores.findIndex(s => s.instagram === entry.instagram);
    if (idx > -1) {
        scores[idx].score = Math.max(scores[idx].score, entry.score);
        scores[idx].totalVozes = entry.totalVozes;
        scores[idx].unlockedChars = entry.unlockedChars;
    } else {
        scores.push(entry);
    }
    localStorage.setItem('afrodizia_ranking', JSON.stringify(scores.slice(0, 50)));
}

export function getLocalScores() {
    try {
        return JSON.parse(localStorage.getItem('afrodizia_ranking')) || [];
    } catch (e) { return []; }
}

export function renderRankingHTML(scores, currentInstagram = '') {
    if (!scores || scores.length === 0) {
        return `<div class="ranking-empty">Seja o primeiro a entrar no ranking! 🔥</div>`;
    }

    let html = scores.map((entry, i) => {
        const isCurrent = currentInstagram && entry.instagram && entry.instagram.toLowerCase() === currentInstagram.toLowerCase();
        const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : i + 1));
        const icon = CHAR_ICONS[entry.character] || '🎤';
        const charName = CHAR_NAMES[entry.character] || entry.character;
        const scoreFormatted = (entry.score || entry.best_score || 0).toLocaleString('pt-BR');

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

    if (currentInstagram) {
        const isPlayerInTop = scores.some(e => e.instagram.toLowerCase() === currentInstagram.toLowerCase());
        if (!isPlayerInTop) {
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
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
