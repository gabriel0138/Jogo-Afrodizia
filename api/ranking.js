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
            const limit = parseInt(req.query.limit) || 10;
            
            // Busca os top N do Sorted Set
            // ZREVRANGE retorna os membros (instagrams) do maior para o menor
            const topInstagrams = await kv.zrevrange(RANKING_KEY, 0, limit - 1);
            
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
            const { name, instagram, character, score, timestamp } = req.body;

            if (!instagram || score === undefined) {
                return res.status(400).json({ error: 'Instagram e Score são obrigatórios' });
            }

            const cleanInsta = instagram.toLowerCase().trim();

            // 1. Verifica se o score novo é maior que o antigo no KV (ou apenas sobrescreve se preferir)
            // O ZADD com a opção default atualiza o score se o membro já existe.
            await kv.zadd(RANKING_KEY, { score: score, member: cleanInsta });

            // 2. Salva os detalhes do jogador (para mostrar nome e ícone no ranking)
            const playerData = {
                name,
                instagram: cleanInsta,
                character,
                score,
                timestamp: timestamp || Date.now()
            };
            
            // Só salva os detalhes se for o novo recorde (opcional, aqui vamos salvar sempre o último)
            await kv.hset(PLAYER_DATA_KEY, { [cleanInsta]: JSON.stringify(playerData) });

            // 3. Calcula a posição atual (Rank)
            const rank = await kv.zrevrank(RANKING_KEY, cleanInsta);

            return res.status(200).json({ 
                success: true, 
                rank: rank !== null ? rank + 1 : '??' 
            });
        }

        return res.status(405).json({ error: 'Método não permitido' });
    } catch (error) {
        console.error('Erro na API de Ranking:', error);
        return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
    }
}
