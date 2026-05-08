
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(process.cwd(), 'local_ranking_db.json');

export default function handler(req, res) {
    // Carregar DB local
    let db = [];
    if (fs.existsSync(DB_PATH)) {
        try {
            db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        } catch (e) { db = []; }
    }

    if (req.method === 'GET') {
        const limit = parseInt(req.query.limit) || 20;
        const sorted = [...db].sort((a, b) => (b.best_score || b.score) - (a.best_score || a.score)).slice(0, limit);
        return res.status(200).json(sorted);
    }

    if (req.method === 'POST') {
        const data = req.body;
        if (!data.instagram) return res.status(400).json({ error: 'Instagram requerido' });

        const index = db.findIndex(p => p.instagram === data.instagram);
        const score = parseInt(data.score) || 0;
        
        if (index > -1) {
            db[index].name = data.name || db[index].name;
            db[index].best_score = Math.max(db[index].best_score || 0, score);
            db[index].score = db[index].best_score; // Compatibilidade
            db[index].total_vozes = (db[index].total_vozes || 0) + score;
            db[index].totalVozes = db[index].total_vozes;
            db[index].unlocked_chars = data.unlockedChars || db[index].unlocked_chars;
            db[index].last_char = data.character || db[index].last_char;
        } else {
            db.push({
                instagram: data.instagram,
                name: data.name,
                best_score: score,
                score: score,
                total_vozes: score,
                totalVozes: score,
                unlocked_chars: data.unlockedChars || ['massau'],
                last_char: data.character
            });
        }

        // Salvar (Nota: Em Vercel Serverless, isso é temporário por requisição, o ideal é usar KV ou SQL)
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

        // Calcular Rank
        const sorted = [...db].sort((a, b) => b.best_score - a.best_score);
        const rank = sorted.findIndex(p => p.instagram === data.instagram) + 1;

        return res.status(200).json({ success: true, rank });
    }
}
