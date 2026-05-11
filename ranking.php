<?php
/**
 * 💎 AFRODIZIA ENGINE - BACKEND V3.1 (ULTRA-ROBUST)
 * Sistema de Sincronização e Ranking Global
 */

// --- CONFIGURAÇÕES DE CONEXÃO (DEFINITIVAS LOCAWEB) ---
$db_config = [
    'host' => 'afrodizia.mysql.dbaas.com.br',
    'db'   => 'afrodizia',
    'user' => 'afrodizia', 
    'pass' => 'OneLoveAfro26@', 
];

$MAX_POSSIBLE_SCORE = 999999; 

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit; }

function logError($msg) {
    error_log("[Afrodizia DB] " . $msg);
}

try {
    $dsn = "mysql:host={$db_config['host']};dbname={$db_config['db']};charset=utf8mb4";
    $pdo = new PDO($dsn, $db_config['user'], $db_config['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
} catch (PDOException $e) {
    logError("Falha na conexão: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(["error" => "Sem conexão com o banco", "debug" => $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];

// 📥 GET: Buscar Ranking ou Sincronizar Perfil
if ($method === 'GET') {
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 20;
    $insta = isset($_GET['instagram']) ? strtolower(trim($_GET['instagram'])) : null;
    
    try {
        // 1. Buscar Ranking Top
        $stmt = $pdo->prepare("SELECT name, instagram, last_char as `character`, best_score as score, total_vozes as totalVozes FROM afrodizia_players ORDER BY best_score DESC LIMIT :limit");
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->execute();
        $top = $stmt->fetchAll();
        
        // 2. Buscar Dados do Jogador (Sync)
        $playerInfo = null;
        if ($insta && $insta !== 'null' && $insta !== 'undefined') {
            $stmt = $pdo->prepare("
                SELECT name, instagram, last_char as `character`, best_score as score, total_vozes as totalVozes, unlocked_chars,
                (SELECT COUNT(*) + 1 FROM afrodizia_players WHERE best_score > p.best_score) as rank
                FROM afrodizia_players p WHERE instagram = ? LIMIT 1
            ");
            $stmt->execute([$insta]);
            $playerInfo = $stmt->fetch();
            
            if ($playerInfo) {
                // Decodifica personagens para JSON real para o JS
                $playerInfo['unlocked_chars'] = json_decode($playerInfo['unlocked_chars']) ?? ['massau'];
            }
        }
        
        echo json_encode([
            'success' => true,
            'top' => $top,
            'player' => $playerInfo
        ]);
    } catch (Exception $e) {
        logError("Erro no GET: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Erro ao carregar dados"]);
    }
    exit;
}

// 📤 POST: Salvar Progresso (Score, Vozes, Personagens)
if ($method === 'POST') {
    $rawBody = file_get_contents('php://input');
    $data = json_decode($rawBody, true);
    
    if (!$data || !isset($data['instagram'])) {
        http_response_code(400);
        echo json_encode(["success" => false, "error" => "Dados inválidos"]);
        exit;
    }

    $insta = strtolower(trim($data['instagram']));
    $name  = htmlspecialchars(strip_tags($data['name']));
    $score = (int)($data['score'] ?? 0);
    $total = (int)($data['totalVozes'] ?? 0);
    $char  = $data['character'] ?? 'massau';
    $clientChars = $data['unlockedChars'] ?? ['massau'];

    if ($score > $MAX_POSSIBLE_SCORE) $score = $MAX_POSSIBLE_SCORE / 2;

    try {
        $pdo->beginTransaction();

        // 1. Buscar progresso atual para fusão de dados (Merge)
        $stmt = $pdo->prepare("SELECT unlocked_chars, total_vozes, best_score FROM afrodizia_players WHERE instagram = ?");
        $stmt->execute([$insta]);
        $existing = $stmt->fetch();

        if ($existing) {
            // Fusão de Personagens (União de arrays)
            $serverChars = json_decode($existing['unlocked_chars']) ?? ['massau'];
            $mergedChars = array_unique(array_merge($serverChars, $clientChars));
            
            // Fusão de Vozes (Sempre mantém o maior valor acumulado)
            $finalTotal = max((int)$existing['total_vozes'], $total);
            $finalScore = max((int)$existing['best_score'], $score);

            $sql = "UPDATE afrodizia_players SET 
                    name = IF(:name != '', :name, name),
                    best_score = :score,
                    total_vozes = :total,
                    unlocked_chars = :chars,
                    last_char = :last_char,
                    total_runs = total_runs + 1,
                    last_seen = NOW()
                    WHERE instagram = :insta";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':name' => $name, ':score' => $finalScore, ':total' => $finalTotal, 
                ':chars' => json_encode($mergedChars), ':last_char' => $char, ':insta' => $insta
            ]);
            $currentChars = $mergedChars;
            $currentTotal = $finalTotal;
        } else {
            // Novo Jogador
            $sql = "INSERT INTO afrodizia_players (instagram, name, best_score, total_vozes, unlocked_chars, last_char, total_runs, last_seen) 
                    VALUES (:insta, :name, :score, :total, :chars, :last_char, 1, NOW())";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                ':insta' => $insta, ':name' => $name, ':score' => $score, ':total' => $total, 
                ':chars' => json_encode($clientChars), ':last_char' => $char
            ]);
            $currentChars = $clientChars;
            $currentTotal = $total;
        }

        // 2. Cálculo de Rank Atualizado
        $stmtRank = $pdo->prepare("SELECT COUNT(*) + 1 as rank FROM afrodizia_players WHERE best_score > (SELECT best_score FROM afrodizia_players WHERE instagram = ?)");
        $stmtRank->execute([$insta]);
        $rankData = $stmtRank->fetch();
        $rank = $rankData ? $rankData['rank'] : '?';

        $pdo->commit();

        echo json_encode([
            "success" => true, 
            "rank" => $rank, 
            "totalVozes" => $currentTotal,
            "unlockedChars" => $currentChars
        ]);

    } catch (Exception $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        logError("Erro no POST: " . $e->getMessage());
        http_response_code(500);
        echo json_encode(["success" => false, "error" => "Erro ao salvar no banco", "debug" => $e->getMessage()]);
    }
    exit;
}
?>

