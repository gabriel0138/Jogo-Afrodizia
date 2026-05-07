const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.svg': 'image/svg+xml',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
};

// Mock simples de banco de dados para teste LOCAL
let localDb = { ranking: [], players: {} };
const DB_FILE = './local_ranking_db.json';
if (fs.existsSync(DB_FILE)) {
    try { localDb = JSON.parse(fs.readFileSync(DB_FILE)); } catch(e) {}
}

const server = http.createServer((req, res) => {
    // Roteamento da API de Ranking para teste LOCAL
    if (req.url.startsWith('/api/ranking')) {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        
        if (req.method === 'GET') {
            const url = new URL(req.url, `http://localhost:${PORT}`);
            const instagram = url.searchParams.get('instagram');
            
            if (instagram) {
                return res.end(JSON.stringify(localDb.players[instagram.toLowerCase()] || null));
            }
            
            const limit = parseInt(url.searchParams.get('limit')) || 10;
            const top = Object.values(localDb.players)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
            return res.end(JSON.stringify(top));
        }

        if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                const data = JSON.parse(body);
                const insta = data.instagram.toLowerCase();
                
                // Atualiza ou cria jogador
                const existing = localDb.players[insta] || { score: 0, totalVozes: 0 };
                localDb.players[insta] = {
                    ...data,
                    instagram: insta,
                    score: Math.max(data.score, existing.score),
                    totalVozes: data.totalVozes || existing.totalVozes
                };
                
                fs.writeFileSync(DB_FILE, JSON.stringify(localDb));
                res.end(JSON.stringify({ success: true, rank: 1, totalVozes: localDb.players[insta].totalVozes }));
            });
            return;
        }
    }

    // Servidor de arquivos estáticos
    let filePath = '.' + req.url;
    if (filePath === './') filePath = './index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server Error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n🚀 Servidor Afrodizia rodando em: http://localhost:${PORT}`);
    console.log(`API de Ranking Local ativada para testes.\n`);
});
