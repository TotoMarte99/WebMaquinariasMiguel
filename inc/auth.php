<?php
// ════════════════════════════════════════════════════════════
//  AUTENTICACIÓN — sesiones, 2FA (TOTP), límite de intentos,
//  invitaciones, códigos de recuperación y auditoría.
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

const SESION_INACTIVIDAD = 1800;      // 30 minutos sin actividad
const SESION_MAXIMA = 43200;          // 12 horas como máximo
const INVITACION_HORAS = 48;
const PASSWORD_MIN = 12;
const MAX_INTENTOS_2FA = 5;

class ErrorAuth extends RuntimeException {
  public function __construct(string $mensaje, public int $http = 400) { parent::__construct($mensaje); }
}

// ── SESIÓN ──
function sesion_iniciar(): void {
  if (session_status() === PHP_SESSION_ACTIVE) return;
  $dir = dir_privado() . '/sesiones';
  if (!is_dir($dir)) mkdir($dir, 0700, true);
  session_save_path($dir);
  ini_set('session.use_strict_mode', '1');
  ini_set('session.use_only_cookies', '1');
  ini_set('session.use_trans_sid', '0');
  ini_set('session.gc_maxlifetime', (string) SESION_MAXIMA);
  ini_set('session.gc_probability', '1');
  ini_set('session.gc_divisor', '50');
  $https = es_https();
  session_name($https ? '__Host-mm_admin' : 'mm_admin');
  session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
  session_start();
}

function sesion_destruir(): void {
  sesion_iniciar();
  $_SESSION = [];
  $p = session_get_cookie_params();
  setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => $p['path'], 'secure' => $p['secure'], 'httponly' => true, 'samesite' => 'Strict']);
  session_destroy();
}

function huella_navegador(): string {
  return hash('sha256', $_SERVER['HTTP_USER_AGENT'] ?? '');
}

function sesion_nueva(array $u, string $estado): void {
  session_regenerate_id(true);
  $_SESSION = [
    'uid' => (int) $u['id'],
    'ver' => (int) $u['sesion_version'],
    'estado' => $estado,
    'creada' => time(),
    'ultima' => time(),
    'ua' => huella_navegador(),
    'csrf' => bin2hex(random_bytes(32)),
    'intentos_2fa' => 0,
  ];
}

/** Devuelve el usuario de la sesión actual (o null) y valida vencimientos. */
function sesion_usuario(): ?array {
  sesion_iniciar();
  if (empty($_SESSION['uid'])) return null;
  $s = $_SESSION;
  $ahora = time();
  $u = usuario_por_id((int) $s['uid']);
  $valida = $u && $u['activo'] && $u['password_hash']
    && (int) $u['sesion_version'] === (int) $s['ver']
    && hash_equals((string) $s['ua'], huella_navegador())
    && $ahora - (int) $s['ultima'] < SESION_INACTIVIDAD
    && $ahora - (int) $s['creada'] < SESION_MAXIMA;
  if (!$valida) {
    sesion_destruir();
    return null;
  }
  $_SESSION['ultima'] = $ahora;
  $u['estado'] = $s['estado'];
  return $u;
}

function csrf_token(): string {
  sesion_iniciar();
  if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
  return $_SESSION['csrf'];
}

function csrf_verificar(): void {
  $enviado = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
  if (!is_string($enviado) || !hash_equals(csrf_token(), $enviado)) throw new ErrorAuth('Sesión inválida. Recargá la página.', 403);
  // Defensa adicional: el Origin (si viene) debe ser este mismo sitio
  $origen = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origen !== '' && parse_url($origen, PHP_URL_HOST) !== parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST)) {
    throw new ErrorAuth('Origen no permitido.', 403);
  }
}

// ── LÍMITE DE INTENTOS ──
function intentos_contar(string $clave, int $ventana): int {
  $st = db()->prepare('SELECT COUNT(*) FROM intentos WHERE clave = ? AND tiempo > ?');
  $st->execute([$clave, time() - $ventana]);
  return (int) $st->fetchColumn();
}

function intento_registrar(string ...$claves): void {
  $st = db()->prepare('INSERT INTO intentos (clave, tiempo) VALUES (?, ?)');
  foreach ($claves as $c) $st->execute([$c, time()]);
}

function intentos_limpiar(string $clave): void {
  db()->prepare('DELETE FROM intentos WHERE clave = ?')->execute([$clave]);
}

/** @param array<array{0:string,1:int,2:int}> $reglas [clave, máximo, ventana en segundos] */
function limite_verificar(array $reglas): void {
  foreach ($reglas as [$clave, $max, $ventana]) {
    if (intentos_contar($clave, $ventana) >= $max) {
      throw new ErrorAuth('Demasiados intentos. Esperá unos minutos antes de volver a probar.', 429);
    }
  }
}

function mantenimiento(): void {
  if (random_int(1, 100) > 2) return;
  db()->prepare('DELETE FROM intentos WHERE tiempo < ?')->execute([time() - 86400]);
  db()->prepare('DELETE FROM auditoria WHERE tiempo < ?')->execute([time() - 86400 * 365]);
  db()->prepare('DELETE FROM invitaciones WHERE expira < ?')->execute([time() - 86400 * 7]);
}

// ── AUDITORÍA ──
function auditar(?int $uid, ?string $email, string $accion, string $detalle = ''): void {
  db()->prepare('INSERT INTO auditoria (tiempo, usuario_id, email, accion, detalle, ip) VALUES (?, ?, ?, ?, ?, ?)')
    ->execute([time(), $uid, $email, $accion, mb_substr($detalle, 0, 500), ip_cliente()]);
}

function auditoria_listar(int $limite = 300): array {
  $st = db()->prepare('SELECT tiempo, email, accion, detalle, ip FROM auditoria ORDER BY id DESC LIMIT ?');
  $st->execute([$limite]);
  return $st->fetchAll();
}

// ── CIFRADO (secretos 2FA) ──
function clave_cifrado(): string {
  return hash('sha256', config('clave_app') . '|totp', true);
}

function cifrar(string $texto): string {
  $iv = random_bytes(12);
  $ct = openssl_encrypt($texto, 'aes-256-gcm', clave_cifrado(), OPENSSL_RAW_DATA, $iv, $tag);
  return base64_encode($iv . $tag . $ct);
}

function descifrar(string $dato): string {
  $raw = base64_decode($dato, true);
  $texto = $raw === false ? false : openssl_decrypt(substr($raw, 28), 'aes-256-gcm', clave_cifrado(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
  if ($texto === false) throw new RuntimeException('No se pudo descifrar el secreto 2FA.');
  return $texto;
}

// ── TOTP (RFC 6238) ──
function base32_codificar(string $bin): string {
  $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  $bits = '';
  foreach (str_split($bin) as $c) $bits .= str_pad(decbin(ord($c)), 8, '0', STR_PAD_LEFT);
  $salida = '';
  foreach (str_split($bits, 5) as $grupo) $salida .= $alfabeto[bindec(str_pad($grupo, 5, '0'))];
  return $salida;
}

function base32_decodificar(string $b32): string {
  $alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  $bits = '';
  foreach (str_split(strtoupper(rtrim($b32, '='))) as $c) {
    $pos = strpos($alfabeto, $c);
    if ($pos === false) continue;
    $bits .= str_pad(decbin($pos), 5, '0', STR_PAD_LEFT);
  }
  $salida = '';
  foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $salida .= chr(bindec($byte));
  return $salida;
}

function totp_codigo(string $secreto, int $paso): string {
  $hash = hash_hmac('sha1', pack('J', $paso), $secreto, true);
  $o = ord($hash[19]) & 0x0f;
  $num = ((ord($hash[$o]) & 0x7f) << 24 | ord($hash[$o + 1]) << 16 | ord($hash[$o + 2]) << 8 | ord($hash[$o + 3])) % 1000000;
  return str_pad((string) $num, 6, '0', STR_PAD_LEFT);
}

/** Devuelve el paso válido (para evitar reutilizar el mismo código) o null. */
function totp_verificar(string $secreto, string $codigo, int $ultimoPaso): ?int {
  $codigo = preg_replace('/\D/', '', $codigo);
  if (strlen($codigo) !== 6) return null;
  $actual = intdiv(time(), 30);
  foreach ([0, -1, 1] as $d) {
    $paso = $actual + $d;
    if ($paso > $ultimoPaso && hash_equals(totp_codigo($secreto, $paso), $codigo)) return $paso;
  }
  return null;
}

// ── USUARIOS ──
function usuario_por_id(int $id): ?array {
  $st = db()->prepare('SELECT * FROM usuarios WHERE id = ?');
  $st->execute([$id]);
  return $st->fetch() ?: null;
}

function usuario_por_email(string $email): ?array {
  $st = db()->prepare('SELECT * FROM usuarios WHERE email = ?');
  $st->execute([$email]);
  return $st->fetch() ?: null;
}

function usuarios_cantidad(): int {
  return (int) db()->query('SELECT COUNT(*) FROM usuarios')->fetchColumn();
}

function usuario_publico(array $u): array {
  return [
    'id' => (int) $u['id'],
    'nombre' => $u['nombre'],
    'email' => $u['email'],
    'rol' => $u['rol'],
    'activo' => (bool) $u['activo'],
    'totp' => (bool) $u['totp_activo'],
    'pendiente' => $u['password_hash'] === null,
    'creado' => (int) $u['creado'],
    'ultimo_acceso' => $u['ultimo_acceso'] ? (int) $u['ultimo_acceso'] : null,
  ];
}

function hash_password(string $pw): string {
  return password_hash($pw, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

function validar_email(string $email): string {
  $email = strtolower(trim($email));
  if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) throw new ErrorAuth('Email inválido.');
  return $email;
}

function validar_password(string $pw, string $email, string $nombre): void {
  $largo = mb_strlen($pw);
  if ($largo < PASSWORD_MIN) throw new ErrorAuth('La contraseña debe tener al menos ' . PASSWORD_MIN . ' caracteres.');
  if ($largo > 200) throw new ErrorAuth('La contraseña es demasiado larga.');
  $minus = mb_strtolower($pw);
  $prohibidas = ['maquinarias', 'miguel', 'password', 'contraseña', 'contrasena', 'qwerty', '123456', 'admin'];
  foreach ($prohibidas as $p) if (str_contains($minus, $p)) throw new ErrorAuth("La contraseña no puede contener \"$p\".");
  $local = strtolower(explode('@', $email)[0]);
  if (strlen($local) >= 4 && str_contains($minus, $local)) throw new ErrorAuth('La contraseña no puede contener tu email.');
  foreach (preg_split('/\s+/', mb_strtolower($nombre)) as $parte) {
    if (mb_strlen($parte) >= 4 && str_contains($minus, $parte)) throw new ErrorAuth('La contraseña no puede contener tu nombre.');
  }
  if (count(array_unique(mb_str_split($pw))) < 6) throw new ErrorAuth('La contraseña es demasiado repetitiva.');
}

function registrar_acceso(array $u): void {
  db()->prepare('UPDATE usuarios SET ultimo_acceso = ? WHERE id = ?')->execute([time(), $u['id']]);
  auditar((int) $u['id'], $u['email'], 'login');
}

// ── INSTALACIÓN (primer administrador) ──
function instalar(string $token, string $nombre, string $email, string $password): void {
  limite_verificar([['setup:' . ip_cliente(), 10, 3600]]);
  if (usuarios_cantidad() > 0) throw new ErrorAuth('El panel ya fue instalado.', 403);
  if (!hash_equals((string) config('token_instalacion'), $token)) {
    intento_registrar('setup:' . ip_cliente());
    throw new ErrorAuth('Token de instalación incorrecto.', 403);
  }
  $nombre = trim(strip_tags($nombre));
  if ($nombre === '' || mb_strlen($nombre) > 80) throw new ErrorAuth('Ingresá tu nombre.');
  $email = validar_email($email);
  validar_password($password, $email, $nombre);
  db()->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, creado) VALUES (?, ?, ?, ?, ?)')
    ->execute([$nombre, $email, hash_password($password), 'admin', time()]);
  auditar((int) db()->lastInsertId(), $email, 'instalacion', 'Primer administrador creado');
}

// ── LOGIN ──
function login(string $email, string $password): string {
  $email = strtolower(trim($email));
  $ip = ip_cliente();
  limite_verificar([
    ["login:ip:$ip", 30, 900],
    ["login:par:$email|$ip", 5, 900],
    ["login:email:$email", 25, 3600],
  ]);

  $u = $email !== '' ? usuario_por_email($email) : null;
  // Si el usuario no existe se verifica igual un hash, para no revelar qué emails existen por el tiempo de respuesta
  $hash = $u['password_hash'] ?? hash_password(bin2hex(random_bytes(8)));
  $ok = password_verify($password, $hash) && $u && $u['activo'] && $u['password_hash'];

  if (!$ok) {
    intento_registrar("login:ip:$ip", "login:par:$email|$ip", "login:email:$email");
    auditar($u ? (int) $u['id'] : null, mb_substr($email, 0, 190), 'login_fallido');
    usleep(random_int(150000, 400000));
    throw new ErrorAuth('Email o contraseña incorrectos.', 401);
  }

  if (password_needs_rehash($hash, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT)) {
    db()->prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?')->execute([hash_password($password), $u['id']]);
  }
  intentos_limpiar("login:par:$email|$ip");

  $estado = $u['totp_activo'] ? '2fa' : (config('requerir_2fa') ? 'configurar_2fa' : 'ok');
  sesion_nueva($u, $estado);
  if ($estado === 'ok') registrar_acceso($u);
  return $estado;
}

function login_2fa(array $u, string $codigo): void {
  if ($u['estado'] !== '2fa') throw new ErrorAuth('No hay una verificación pendiente.', 400);
  limite_verificar([['2fa:' . $u['id'], 10, 900]]);

  $ok = false;
  $codigo = trim($codigo);
  if (!preg_match('/^\d{3}\s?\d{3}$/', $codigo)) {
    // No es un código de 6 dígitos: se prueba como código de recuperación
    $ok = preg_match('/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/', $codigo) && codigo_recuperacion_usar((int) $u['id'], $codigo);
    if ($ok) auditar((int) $u['id'], $u['email'], 'codigo_recuperacion_usado');
  } else {
    $paso = totp_verificar(descifrar($u['totp_secreto']), $codigo, (int) $u['totp_ultimo_paso']);
    if ($paso !== null) {
      db()->prepare('UPDATE usuarios SET totp_ultimo_paso = ? WHERE id = ?')->execute([$paso, $u['id']]);
      $ok = true;
    }
  }

  if (!$ok) {
    intento_registrar('2fa:' . $u['id']);
    auditar((int) $u['id'], $u['email'], '2fa_fallido');
    if (++$_SESSION['intentos_2fa'] >= MAX_INTENTOS_2FA) {
      sesion_destruir();
      throw new ErrorAuth('Demasiados códigos incorrectos. Volvé a iniciar sesión.', 401);
    }
    throw new ErrorAuth('Código incorrecto.', 401);
  }
  sesion_nueva($u, 'ok');
  registrar_acceso($u);
}

// ── 2FA: ALTA ──
function totp_iniciar(array $u): array {
  $secreto = random_bytes(20);
  $_SESSION['totp_pendiente'] = base32_codificar($secreto);
  $etiqueta = rawurlencode(SITIO_NOMBRE . ':' . $u['email']);
  return [
    'secreto' => trim(chunk_split($_SESSION['totp_pendiente'], 4, ' ')),
    'uri' => "otpauth://totp/$etiqueta?secret={$_SESSION['totp_pendiente']}&issuer=" . rawurlencode(SITIO_NOMBRE) . '&digits=6&period=30',
  ];
}

function totp_confirmar(array $u, string $codigo): array {
  if (empty($_SESSION['totp_pendiente'])) throw new ErrorAuth('Primero generá el código QR.');
  limite_verificar([['2fa:' . $u['id'], 10, 900]]);
  $secreto = base32_decodificar($_SESSION['totp_pendiente']);
  $paso = totp_verificar($secreto, $codigo, 0);
  if ($paso === null) {
    intento_registrar('2fa:' . $u['id']);
    throw new ErrorAuth('El código no coincide. Revisá que la hora de tu teléfono sea correcta.');
  }
  db()->prepare('UPDATE usuarios SET totp_secreto = ?, totp_activo = 1, totp_ultimo_paso = ? WHERE id = ?')
    ->execute([cifrar($secreto), $paso, $u['id']]);
  unset($_SESSION['totp_pendiente']);
  $codigos = codigos_recuperacion_generar((int) $u['id']);
  auditar((int) $u['id'], $u['email'], '2fa_activado');
  if ($_SESSION['estado'] === 'configurar_2fa') {
    $_SESSION['estado'] = 'ok';
    registrar_acceso($u);
  }
  return $codigos;
}

function hash_codigo(string $codigo): string {
  return hash_hmac('sha256', strtoupper(str_replace('-', '', trim($codigo))), (string) config('clave_app'));
}

function codigos_recuperacion_generar(int $uid): array {
  db()->prepare('DELETE FROM codigos_recuperacion WHERE usuario_id = ?')->execute([$uid]);
  $alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  $codigos = [];
  $st = db()->prepare('INSERT INTO codigos_recuperacion (usuario_id, codigo_hash) VALUES (?, ?)');
  for ($i = 0; $i < 10; $i++) {
    $c = '';
    for ($j = 0; $j < 8; $j++) $c .= $alfabeto[random_int(0, strlen($alfabeto) - 1)];
    $c = substr($c, 0, 4) . '-' . substr($c, 4);
    $codigos[] = $c;
    $st->execute([$uid, hash_codigo($c)]);
  }
  return $codigos;
}

function codigo_recuperacion_usar(int $uid, string $codigo): bool {
  $st = db()->prepare('UPDATE codigos_recuperacion SET usado = 1 WHERE usuario_id = ? AND codigo_hash = ? AND usado = 0');
  $st->execute([$uid, hash_codigo($codigo)]);
  return $st->rowCount() === 1;
}

function codigos_recuperacion_restantes(int $uid): int {
  $st = db()->prepare('SELECT COUNT(*) FROM codigos_recuperacion WHERE usuario_id = ? AND usado = 0');
  $st->execute([$uid]);
  return (int) $st->fetchColumn();
}

function totp_desactivar(int $uid): void {
  db()->prepare('UPDATE usuarios SET totp_secreto = NULL, totp_activo = 0, totp_ultimo_paso = 0, sesion_version = sesion_version + 1 WHERE id = ?')->execute([$uid]);
  db()->prepare('DELETE FROM codigos_recuperacion WHERE usuario_id = ?')->execute([$uid]);
}

// ── CONTRASEÑA ──
function cambiar_password(array $u, string $actual, string $nueva): void {
  limite_verificar([['pw:' . $u['id'], 5, 900]]);
  if (!password_verify($actual, (string) $u['password_hash'])) {
    intento_registrar('pw:' . $u['id']);
    throw new ErrorAuth('La contraseña actual es incorrecta.');
  }
  validar_password($nueva, $u['email'], $u['nombre']);
  if (password_verify($nueva, (string) $u['password_hash'])) throw new ErrorAuth('La nueva contraseña debe ser distinta.');
  db()->prepare('UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1 WHERE id = ?')->execute([hash_password($nueva), $u['id']]);
  // Cierra las demás sesiones abiertas y mantiene la actual
  $_SESSION['ver'] = (int) $u['sesion_version'] + 1;
  session_regenerate_id(true);
  auditar((int) $u['id'], $u['email'], 'password_cambiada');
}

// ── INVITACIONES (alta de usuarios y restablecer contraseña) ──
function invitacion_crear(int $uid, string $tipo): string {
  db()->prepare('UPDATE invitaciones SET usado = 1 WHERE usuario_id = ? AND usado = 0')->execute([$uid]);
  $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
  db()->prepare('INSERT INTO invitaciones (usuario_id, token_hash, tipo, expira) VALUES (?, ?, ?, ?)')
    ->execute([$uid, hash('sha256', $token), $tipo, time() + INVITACION_HORAS * 3600]);
  // El token va en el fragmento (#) para que no quede en logs ni en el Referer
  return url_sitio('admin/#invitacion=' . $token);
}

function invitacion_buscar(string $token): array {
  limite_verificar([['inv:' . ip_cliente(), 20, 900]]);
  $st = db()->prepare('SELECT i.id AS inv_id, i.tipo, u.* FROM invitaciones i JOIN usuarios u ON u.id = i.usuario_id
    WHERE i.token_hash = ? AND i.usado = 0 AND i.expira > ?');
  $st->execute([hash('sha256', $token), time()]);
  $fila = $st->fetch();
  if (!$fila || !$fila['activo']) {
    intento_registrar('inv:' . ip_cliente());
    throw new ErrorAuth('El enlace no es válido o venció. Pedile al administrador uno nuevo.', 404);
  }
  return $fila;
}

function invitacion_aceptar(string $token, string $password): void {
  $inv = invitacion_buscar($token);
  validar_password($password, $inv['email'], $inv['nombre']);
  db()->beginTransaction();
  db()->prepare('UPDATE invitaciones SET usado = 1 WHERE id = ?')->execute([$inv['inv_id']]);
  db()->prepare('UPDATE usuarios SET password_hash = ?, sesion_version = sesion_version + 1 WHERE id = ?')->execute([hash_password($password), $inv['id']]);
  db()->commit();
  auditar((int) $inv['id'], $inv['email'], $inv['tipo'] === 'alta' ? 'invitacion_aceptada' : 'password_restablecida');
}

// ── GESTIÓN DE USUARIOS (solo administradores) ──
function admins_activos(?int $excluir = null): int {
  $st = db()->prepare("SELECT COUNT(*) FROM usuarios WHERE rol = 'admin' AND activo = 1 AND password_hash IS NOT NULL AND id != ?");
  $st->execute([$excluir ?? 0]);
  return (int) $st->fetchColumn();
}

function usuarios_listar(): array {
  return array_map('usuario_publico', db()->query('SELECT * FROM usuarios ORDER BY creado')->fetchAll());
}

function usuario_invitar(array $actor, string $nombre, string $email, string $rol): string {
  $nombre = trim(strip_tags($nombre));
  if ($nombre === '' || mb_strlen($nombre) > 80) throw new ErrorAuth('Ingresá el nombre.');
  $email = validar_email($email);
  if (!in_array($rol, ['admin', 'editor'], true)) throw new ErrorAuth('Rol inválido.');
  if (usuario_por_email($email)) throw new ErrorAuth('Ya existe un usuario con ese email.');
  db()->prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, creado) VALUES (?, ?, NULL, ?, ?)')
    ->execute([$nombre, $email, $rol, time()]);
  $id = (int) db()->lastInsertId();
  auditar((int) $actor['id'], $actor['email'], 'usuario_invitado', "$email ($rol)");
  return invitacion_crear($id, 'alta');
}

function usuario_objetivo(array $actor, int $id): array {
  $u = usuario_por_id($id);
  if (!$u) throw new ErrorAuth('Usuario inexistente.', 404);
  return $u;
}

function usuario_actualizar(array $actor, int $id, string $rol, bool $activo): void {
  $u = usuario_objetivo($actor, $id);
  if (!in_array($rol, ['admin', 'editor'], true)) throw new ErrorAuth('Rol inválido.');
  if ($id === (int) $actor['id'] && ($rol !== 'admin' || !$activo)) throw new ErrorAuth('No podés quitarte permisos ni desactivarte a vos mismo.');
  if ($u['rol'] === 'admin' && ($rol !== 'admin' || !$activo) && admins_activos($id) === 0) throw new ErrorAuth('Tiene que quedar al menos un administrador activo.');
  db()->prepare('UPDATE usuarios SET rol = ?, activo = ?, sesion_version = sesion_version + 1 WHERE id = ?')->execute([$rol, $activo ? 1 : 0, $id]);
  auditar((int) $actor['id'], $actor['email'], 'usuario_actualizado', "{$u['email']}: rol $rol, " . ($activo ? 'activo' : 'desactivado'));
}

function usuario_reset_2fa(array $actor, int $id): void {
  $u = usuario_objetivo($actor, $id);
  totp_desactivar($id);
  auditar((int) $actor['id'], $actor['email'], '2fa_reseteado', $u['email']);
}

function usuario_reset_password(array $actor, int $id): string {
  $u = usuario_objetivo($actor, $id);
  if ($id === (int) $actor['id']) throw new ErrorAuth('Para cambiar tu contraseña usá "Mi cuenta".');
  db()->prepare('UPDATE usuarios SET sesion_version = sesion_version + 1 WHERE id = ?')->execute([$id]);
  auditar((int) $actor['id'], $actor['email'], 'password_reset_generado', $u['email']);
  return invitacion_crear($id, $u['password_hash'] === null ? 'alta' : 'reset');
}

function usuario_eliminar(array $actor, int $id): void {
  $u = usuario_objetivo($actor, $id);
  if ($id === (int) $actor['id']) throw new ErrorAuth('No podés eliminar tu propio usuario.');
  if ($u['rol'] === 'admin' && admins_activos($id) === 0) throw new ErrorAuth('Tiene que quedar al menos un administrador activo.');
  db()->prepare('DELETE FROM usuarios WHERE id = ?')->execute([$id]);
  auditar((int) $actor['id'], $actor['email'], 'usuario_eliminado', $u['email']);
}
