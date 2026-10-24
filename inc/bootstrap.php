<?php
// ════════════════════════════════════════════════════════════
//  BOOTSTRAP — configuración, carpeta privada, base de datos y helpers
//  Este directorio (inc/) no es accesible desde la web (.htaccess).
// ════════════════════════════════════════════════════════════

declare(strict_types=1);

const ROOT = __DIR__ . '/..';
const SITIO_NOMBRE = 'Maquinarias Miguel';

// ── CARPETA PRIVADA ──
// Preferimos una carpeta FUERA de public_html (hermana): ../mm-privado
// Si no se puede crear, se usa ./privado (bloqueada por .htaccess).
function dir_privado(): string {
  static $dir = null;
  if ($dir) return $dir;

  $env = getenv('MM_PRIVADO');
  $candidatos = array_filter([$env ?: null, dirname(realpath(ROOT)) . '/mm-privado', realpath(ROOT) . '/privado']);
  foreach ($candidatos as $c) {
    if (is_file("$c/config.php")) return $dir = $c;
  }
  foreach ($candidatos as $c) {
    if ((is_dir($c) || @mkdir($c, 0700, true)) && is_writable($c)) return $dir = $c;
  }
  throw new RuntimeException('No se pudo crear la carpeta privada de datos.');
}

// ── CONFIGURACIÓN ──
// Se genera automáticamente la primera vez, con claves aleatorias.
function config(?string $clave = null) {
  $cfg = &$GLOBALS['__config_cache'];
  if ($cfg === null) {
    $archivo = dir_privado() . '/config.php';
    if (!is_file($archivo)) {
      $nuevo = [
        'url_sitio' => 'https://maquinariasmiguel.com',
        'clave_app' => bin2hex(random_bytes(32)),
        'token_instalacion' => bin2hex(random_bytes(16)),
        'requerir_2fa' => true,
        'proxy_confiable' => false,
        'mercadopago_access_token' => '',
      ];
      file_put_contents($archivo, "<?php\n// Configuración privada — NO compartir ni subir al repositorio.\n// token_instalacion: se pide para crear el primer administrador.\nreturn " . var_export($nuevo, true) . ";\n", LOCK_EX);
      @chmod($archivo, 0600);
    }
    $cfg = require $archivo;
  }
  return $clave === null ? $cfg : ($cfg[$clave] ?? null);
}

/** Actualiza un valor de config.php (escritura atómica). */
function config_guardar(string $clave, $valor): void {
  $archivo = dir_privado() . '/config.php';
  $cfg = config();
  $cfg[$clave] = $valor;
  $contenido = "<?php\n// Configuración privada — NO compartir ni subir al repositorio.\n// token_instalacion: se pide para crear el primer administrador.\nreturn " . var_export($cfg, true) . ";\n";
  $tmp = "$archivo.tmp";
  file_put_contents($tmp, $contenido, LOCK_EX);
  @chmod($tmp, 0600);
  rename($tmp, $archivo);
  if (function_exists('opcache_invalidate')) @opcache_invalidate($archivo, true);
  $GLOBALS['__config_cache'] = $cfg;
}

function url_sitio(string $ruta = ''): string {
  return rtrim((string) config('url_sitio'), '/') . '/' . ltrim($ruta, '/');
}

// ── BASE DE DATOS (SQLite) ──
function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  $pdo = new PDO('sqlite:' . dir_privado() . '/admin.sqlite', null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  $pdo->exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  $pdo->exec(<<<SQL
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT,
      rol TEXT NOT NULL CHECK (rol IN ('admin','editor')),
      activo INTEGER NOT NULL DEFAULT 1,
      totp_secreto TEXT,
      totp_activo INTEGER NOT NULL DEFAULT 0,
      totp_ultimo_paso INTEGER NOT NULL DEFAULT 0,
      sesion_version INTEGER NOT NULL DEFAULT 1,
      creado INTEGER NOT NULL,
      ultimo_acceso INTEGER
    );
    CREATE TABLE IF NOT EXISTS invitaciones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL CHECK (tipo IN ('alta','reset')),
      expira INTEGER NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS codigos_recuperacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      codigo_hash TEXT NOT NULL,
      usado INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS intentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clave TEXT NOT NULL,
      tiempo INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_intentos ON intentos (clave, tiempo);
    CREATE TABLE IF NOT EXISTS pagos_mp (
      payment_id TEXT PRIMARY KEY,
      pedido TEXT,
      estado TEXT,
      detalle_estado TEXT,
      monto REAL,
      cuotas INTEGER,
      email TEXT,
      notificado INTEGER NOT NULL DEFAULT 0,
      creado INTEGER NOT NULL,
      actualizado INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tiempo INTEGER NOT NULL,
      usuario_id INTEGER,
      email TEXT,
      accion TEXT NOT NULL,
      detalle TEXT,
      ip TEXT
    );
  SQL);
  return $pdo;
}

// ── HELPERS ──
function h($s): string {
  return htmlspecialchars((string) $s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function ip_cliente(): string {
  $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
  if (config('proxy_confiable') && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $ip = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
  }
  return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
}

function es_https(): bool {
  return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https'
    || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

function json_out(int $codigo, array $data): never {
  http_response_code($codigo);
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: no-store');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

function formatear_precio(float $n): string {
  return '$ ' . number_format(round($n), 0, ',', '.');
}
