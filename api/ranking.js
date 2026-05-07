import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    // Habilitar CORS se necessário
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const RANKING_KEY = 'afrodizia_ranking';
    const PLAYER_DATA_KEY = 'afrodizia_players';

    try {
        if (req.method === 'GET') {
            const { instagram, limit } = req.query;

            // Busca perfil individual se o instagram for passado
            if (instagram) {
                const data = await kv.hget(PLAYER_DATA_KEY, instagram.toLowerCase().trim());
                return res.status(200).json(data ? (typeof data === 'string' ? JSON.parse(data) : data) : null);
            }

            const limitNum = parseInt(limit) || 10;
            
            // Busca os top N do Sorted Set
            const topInstagrams = await kv.zrevrange(RANKING_KEY, 0, limitNum - 1);
            
            if (topInstagrams.length === 0) {
                return res.status(200).json([]);
            }

            // Busca os detalhes dos jogadores no Hash
            const playersData = await kv.hmget(PLAYER_DATA_KEY, ...topInstagrams);
            
            // Formata a resposta
            const result = playersData
                .filter(data => data !== null)
                .map(data => typeof data === 'string' ? JSON.parse(data) : data)
                .sort((a, b) => b.score - a.score);

            return res.status(200).json(result);
        }

        if (req.method === 'POST') {
            const { name, instagram, character, score, totalVozes, timestamp } = req.body;

            if (!instagram || score === undefined) {
                return res.status(400).json({ error: 'Instagram e Score são obrigatórios' });
            }

            const cleanInsta = instagram.toLowerCase().trim();

            // 1. Atualiza o recorde no Ranking (Sorted Set)
            const currentBest = await kv.zscore(RANKING_KEY, cleanInsta) || 0;
            if (score > currentBest) {
                await kv.zadd(RANKING_KEY, { score: score, member: cleanInsta });
            }

            // 2. Salva/Atualiza os detalhes do jogador (incluindo total acumulado)
            const existingData = await kv.hget(PLAYER_DATA_KEY, cleanInsta) || {};
            const playerData = {
                name: name || existingData.name,
                instagram: cleanInsta,
                character: character || existingData.character,
                score: Math.max(score, existingData.score || 0),
                totalVozes: totalVozes !== undefined ? totalVozes : (existingData.totalVozes || 0),
                timestamp: timestamp || Date.now()
            };
            
            await kv.hset(PLAYER_DATA_KEY, { [cleanInsta]: JSON.stringify(playerData) });

            // 3. Calcula a posição atual (Rank)
            const rank = await kv.zrevrank(RANKING_KEY, cleanInsta);

            return res.status(200).json({ 
                success: true, 
                rank: rank !== null ? rank + 1 : '??',
                totalVozes: playerData.totalVozes
            });
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (error) {
        console.error('Erro na API de Ranking:', error);
        return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
}
