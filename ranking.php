<?php
/**
 * 💎 AFRODIZIA ENGINE - BACKEND OPTIMIZED (LOCAWEB EDITION)
 * Versão: 2.0 - Performance & Security Focus
 */

// --- CONFIGURAÇÕES DE CONEXÃO ---
// DICA: Na Locaweb, verifique o host exato no painel (MySQL)
$db_config = [
    'host' => 'localhost', // Tente 'localhost' ou 'mysql.afrodizia1.hospedagemdesites.ws'
    'db'   => 'afrodizia1', // Nome do banco criado no painel
    'user' => 'afrodizia1', // Usuário do banco
    'pass' => 'OneLoveAfro26@', // Senha fornecida
];

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

try {
    $dsn = "mysql:host={$db_config['host']};dbname={$db_config['db']};charset=utf8mb4";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], $options);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(["error" => "Falha na conexão", "debug" => "Verifique host/user/pass"]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// 📥 GET: Ranking ou Perfil
if ($method === 'GET') {
    if (isset($_GET['instagram'])) {
        $stmt = $pdo->prepare("SELECT * FROM afrodizia_players WHERE instagram = ? LIMIT 1");
        $stmt->execute([strtolower(trim($_GET['instagram']))]);
        $player = $stmt->fetch();
        
        if ($player) {
            $player['unlocked_chars'] = json_decode($player['unlocked_chars'] ?? '["massau"]');
        }
        echo json_encode($player ?: null);
    } else {
        $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
        $stmt = $pdo->prepare("SELECT name, instagram, last_char as `character`, best_score as score, total_vozes as totalVozes FROM afrodizia_players ORDER BY best_score DESC LIMIT ?");
        $stmt->execute([$limit]);
        echo json_encode($stmt->fetchAll());
    }
}

// 📤 POST: Salvar Score e Sincronizar
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    
    if (!$data || !isset($data['instagram'])) {
        http_response_code(400);
        echo json_encode(["error" => "Payload inválido"]);
        exit;
    }

    $insta = strtolower(trim($data['instagram']));
    $name  = htmlspecialchars(strip_tags($data['name']));
    $score = (int)($data['score'] ?? 0);
    $total = (int)($data['totalVozes'] ?? 0);
    $char  = $data['character'] ?? 'massau';
    $charsJson = json_encode($data['unlockedChars'] ?? ['massau']);

    // UPSERT: Insere ou Atualiza se já existir o Instagram
    $sql = "INSERT INTO afrodizia_players (instagram, name, best_score, total_vozes, unlocked_chars, last_char, total_runs) 
            VALUES (:insta, :name, :score, :total, :chars, :last_char, 1)
            ON DUPLICATE KEY UPDATE 
            name = IF(:name2 != '', :name2, name),
            best_score = GREATEST(best_score, :score2),
            total_vozes = GREATEST(total_vozes, :total2),
            unlocked_chars = :chars2,
            last_char = :last_char2,
            total_runs = total_runs + 1";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':insta' => $insta, ':name' => $name, ':score' => $score, ':total' => $total, ':chars' => $charsJson, ':last_char' => $char,
        ':name2' => $name, ':score2' => $score, ':total2' => $total, ':chars2' => $charsJson, ':last_char2' => $char
    ]);

    // Rank Atual do Jogador
    $stmtRank = $pdo->prepare("SELECT COUNT(*) + 1 as rank FROM afrodizia_players WHERE best_score > (SELECT best_score FROM afrodizia_players WHERE instagram = ?)");
    $stmtRank->execute([$insta]);
    $rank = $stmtRank->fetch()['rank'] ?? '-';

    echo json_encode([
        "success" => true, 
        "rank" => $rank, 
        "totalVozes" => $total,
        "unlockedChars" => json_decode($charsJson)
    ]);
}
?>
