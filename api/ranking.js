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
      const topData = await kv.zrevrange('afrodizia_ranking', 0, limit - 1, { withScores: true });
      
      // 2. Buscar Perfis em Pipeline para performance
      const pipeline = kv.pipeline();
      for (let i = 0; i < topData.length; i += 2) {
        pipeline.hgetall(`afrodizia_player:${topData[i]}`);
      }
      const profiles = await pipeline.exec();

      const top = [];
      for (let i = 0, pIdx = 0; i < topData.length; i += 2, pIdx++) {
        const insta = topData[i];
        const score = topData[i + 1];
        const profile = profiles[pIdx];
        top.push({
          instagram: insta,
          name: profile?.name || insta,
          character: profile?.lastChar || 'massau',
          score: score,
          totalVozes: profile?.totalVozes || 0
        });
      }

      // 3. Buscar Dados do Jogador Atual
      let playerInfo = null;
      if (instagram && instagram !== 'null' && instagram !== 'undefined') {
        const [profile, score, rank] = await Promise.all([
          kv.hgetall(`afrodizia_player:${instagram}`),
          kv.zscore('afrodizia_ranking', instagram),
          kv.zrevrank('afrodizia_ranking', instagram)
        ]);
        
        if (profile) {
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

      // 1. Buscar progresso atual para merge
      const [existingProfile, existingScore] = await Promise.all([
        kv.hgetall(`afrodizia_player:${insta}`),
        kv.zscore('afrodizia_ranking', insta)
      ]);
      
      const finalChars = Array.from(new Set([...(existingProfile?.unlockedChars || []), ...clientChars]));
      const finalVozes = Math.max(parseInt(existingProfile?.totalVozes) || 0, totalVozes);
      const finalScore = Math.max(existingScore || 0, score);

      // 2. Salvar Profile e Ranking em Pipeline
      await kv.pipeline()
        .hset(`afrodizia_player:${insta}`, {
          name: name || existingProfile?.name || insta,
          totalVozes: finalVozes,
          unlockedChars: finalChars,
          lastChar: char,
          lastSeen: Date.now()
        })
        .zadd('afrodizia_ranking', { score: finalScore, member: insta })
        .exec();

      // 3. Obter Rank atualizado
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
