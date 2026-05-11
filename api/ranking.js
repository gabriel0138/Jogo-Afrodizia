import { createClient } from 'redis';

const redis = createClient({
  url: process.env.REDIS_URL || process.env.KV_URL
});

redis.on('error', err => console.error('Redis Client Error', err));

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
    if (!redis.isOpen) {
      await redis.connect();
    }

    if (method === 'GET') {
      const limit = parseInt(req.query.limit) || 20;
      const instagram = req.query.instagram ? req.query.instagram.toLowerCase().trim() : null;

      // 1. Buscar Ranking Top (do Sorted Set)
      const topData = await redis.zRangeWithScores('afrodizia_ranking', 0, limit - 1, { REV: true });
      
      // 2. Buscar Perfis em Pipeline
      const multi = redis.multi();
      for (const item of topData) {
        multi.hGetAll(`afrodizia_player:${item.value}`);
      }
      const profiles = await multi.exec();

      const top = [];
      for (let i = 0; i < topData.length; i++) {
        const insta = topData[i].value;
        const score = topData[i].score;
        const profile = profiles[i];
        
        let chars = profile?.unlockedChars || '["massau"]';
        try { if (typeof chars === 'string') chars = JSON.parse(chars); } catch(e) {}
        
        top.push({
          instagram: insta,
          name: profile?.name || insta,
          character: profile?.lastChar || 'massau',
          score: score,
          totalVozes: parseInt(profile?.totalVozes) || 0,
          unlockedChars: chars
        });
      }

      // 3. Buscar Dados do Jogador Atual
      let playerInfo = null;
      if (instagram && instagram !== 'null' && instagram !== 'undefined') {
        const profileP = redis.hGetAll(`afrodizia_player:${instagram}`);
        const scoreP = redis.zScore('afrodizia_ranking', instagram);
        const rankP = redis.zRevRank('afrodizia_ranking', instagram);
        
        const [profile, score, rank] = await Promise.all([profileP, scoreP, rankP]);
        
        if (profile && Object.keys(profile).length > 0) {
          let pChars = profile.unlockedChars || '["massau"]';
          try { if (typeof pChars === 'string') pChars = JSON.parse(pChars); } catch(e) {}

          playerInfo = {
            instagram,
            name: profile.name,
            character: profile.lastChar || 'massau',
            score: score || 0,
            totalVozes: parseInt(profile.totalVozes) || 0,
            unlocked_chars: pChars,
            unlockedChars: pChars,
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
      let clientChars = data.unlockedChars || ['massau'];

      // 1. Buscar progresso atual para merge
      const existingProfile = await redis.hGetAll(`afrodizia_player:${insta}`);
      const existingScoreStr = await redis.zScore('afrodizia_ranking', insta);
      const existingScore = existingScoreStr ? parseInt(existingScoreStr) : 0;
      
      let exChars = existingProfile?.unlockedChars || '[]';
      try { if (typeof exChars === 'string') exChars = JSON.parse(exChars); } catch(e) {}
      
      const finalChars = Array.from(new Set([...exChars, ...clientChars]));
      const finalVozes = Math.max(parseInt(existingProfile?.totalVozes) || 0, totalVozes);
      const finalScore = Math.max(existingScore, score);

      // 2. Salvar Profile e Ranking
      const multi = redis.multi();
      multi.hSet(`afrodizia_player:${insta}`, 'name', name || existingProfile?.name || insta);
      multi.hSet(`afrodizia_player:${insta}`, 'totalVozes', finalVozes.toString());
      multi.hSet(`afrodizia_player:${insta}`, 'unlockedChars', JSON.stringify(finalChars));
      multi.hSet(`afrodizia_player:${insta}`, 'lastChar', char);
      multi.hSet(`afrodizia_player:${insta}`, 'lastSeen', Date.now().toString());
      
      multi.zAdd('afrodizia_ranking', { score: finalScore, value: insta });
      await multi.exec();

      // 3. Obter Rank atualizado
      const rank = await redis.zRevRank('afrodizia_ranking', insta);

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
