import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      const limit = parseInt(req.query.limit) || 20;
      const instagram = req.query.instagram ? req.query.instagram.toLowerCase().trim() : null;

      // 1. Buscar Ranking Top (do Sorted Set)
      // ZREVRANGE devolve os membros do maior para o menor
      const topInstas = await kv.zrevrange('afrodizia_ranking', 0, limit - 1, { withScores: true });
      
      const top = [];
      for (let i = 0; i < topInstas.length; i += 2) {
        const insta = topInstas[i];
        const score = topInstas[i + 1];
        const profile = await kv.hgetall(`afrodizia_player:${insta}`);
        top.push({
          instagram: insta,
          name: profile?.name || insta,
          character: profile?.lastChar || 'massau',
          score: score,
          totalVozes: profile?.totalVozes || 0
        });
      }

      // 2. Buscar Dados do Jogador (Sync)
      let playerInfo = null;
      if (instagram && instagram !== 'null' && instagram !== 'undefined') {
        const profile = await kv.hgetall(`afrodizia_player:${instagram}`);
        if (profile) {
          const score = await kv.zscore('afrodizia_ranking', instagram);
          const rank = await kv.zrevrank('afrodizia_ranking', instagram);
          
          playerInfo = {
            instagram,
            name: profile.name,
            character: profile.lastChar || 'massau',
            score: score || 0,
            totalVozes: profile.totalVozes || 0,
            unlocked_chars: profile.unlockedChars || ['massau'],
            rank: rank !== null ? rank + 1 : '?'
          };
        }
      }

      return res.status(200).json({
        success: true,
        top,
        player: playerInfo
      });
    }

    if (method === 'POST') {
      const data = req.body;
      if (!data || !data.instagram) {
        return res.status(400).json({ success: false, error: 'Dados inválidos' });
      }

      const insta = data.instagram.toLowerCase().trim();
      const name = data.name || insta;
      const score = Math.min(Math.max(0, parseInt(data.score) || 0), 999999);
      const totalVozes = parseInt(data.totalVozes) || 0;
      const char = data.character || 'massau';
      const clientChars = data.unlockedChars || ['massau'];

      // 1. Buscar progresso atual
      const existingProfile = await kv.hgetall(`afrodizia_player:${insta}`);
      
      let finalChars = clientChars;
      let finalVozes = totalVozes;
      let finalScore = score;

      if (existingProfile) {
        const serverChars = existingProfile.unlockedChars || ['massau'];
        finalChars = [...new Set([...serverChars, ...clientChars])];
        finalVozes = Math.max(parseInt(existingProfile.totalVozes) || 0, totalVozes);
        
        const existingScore = await kv.zscore('afrodizia_ranking', insta);
        finalScore = Math.max(existingScore || 0, score);
      }

      // 2. Salvar Profile e Ranking
      await kv.hset(`afrodizia_player:${insta}`, {
        name,
        totalVozes: finalVozes,
        unlockedChars: finalChars,
        lastChar: char,
        lastSeen: Date.now()
      });

      await kv.zadd('afrodizia_ranking', { score: finalScore, member: insta });

      // 3. Obter Rank
      const rank = await kv.zrevrank('afrodizia_ranking', insta);

      return res.status(200).json({
        success: true,
        rank: rank !== null ? rank + 1 : '?',
        totalVozes: finalVozes,
        unlockedChars: finalChars
      });
    }

    return res.status(405).json({ error: 'Método não permitido' });
  } catch (error) {
    console.error('Error in API:', error);
    return res.status(500).json({ success: false, error: 'Internal Server Error', debug: error.message });
  }
}
