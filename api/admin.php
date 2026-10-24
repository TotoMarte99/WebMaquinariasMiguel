<?php
// ════════════════════════════════════════════════════════════
//  API DEL PANEL DE ADMINISTRACIÓN
//  /api/admin.php?accion=...   (JSON, POST protegido con CSRF)
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/../inc/auth.php';
require_once __DIR__ . '/../inc/catalogo.php';
require_once __DIR__ . '/../inc/imagenes.php';
require_once __DIR__ . '/../inc/pagos.php';

header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');

function entrada(): array {
  static $datos = null;
  if ($datos !== null) return $datos;
  if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) return $datos = [];
  $raw = file_get_contents('php://input', false, null, 0, 6 * 1024 * 1024);
  $datos = json_decode((string) $raw, true);
  if (!is_array($datos)) throw new ErrorAuth('Solicitud inválida.');
  return $datos;
}

function param(string $clave, $defecto = '') {
  return entrada()[$clave] ?? $defecto;
}

function requerir(?array $u, string $rol = 'editor', array $estados = ['ok']): array {
  if (!$u) throw new ErrorAuth('Tu sesión venció. Iniciá sesión de nuevo.', 401);
  if (!in_array($u['estado'], $estados, true)) throw new ErrorAuth('Completá la verificación en dos pasos.', 403);
  if ($rol === 'admin' && $u['rol'] !== 'admin') throw new ErrorAuth('No tenés permisos para esta acción.', 403);
  return $u;
}

function estado_sesion(?array $u): array {
  return [
    'instalado' => usuarios_cantidad() > 0,
    'csrf' => csrf_token(),
    'requerir_2fa' => (bool) config('requerir_2fa'),
    'usuario' => $u ? usuario_publico($u) + [
      'estado' => $u['estado'],
      'codigos_restantes' => $u['totp_activo'] ? codigos_recuperacion_restantes((int) $u['id']) : 0,
    ] : null,
  ];
}

function producto_indice(array $catalogo, string $id): int {
  foreach ($catalogo['productos'] as $i => $p) if ($p['id'] === $id) return $i;
  throw new ErrorValidacion('El producto no existe.');
}

try {
  sesion_iniciar();
  mantenimiento();
  $accion = (string) ($_GET['accion'] ?? '');
  $esPost = $_SERVER['REQUEST_METHOD'] === 'POST';
  if ($esPost) csrf_verificar();
  $u = sesion_usuario();

  $soloPost = fn() => $esPost ?: throw new ErrorAuth('Método no permitido.', 405);

  switch ($accion) {
    // ── SESIÓN ──
    case 'estado':
      json_out(200, estado_sesion($u));

    case 'instalar':
      $soloPost();
      instalar((string) param('token'), (string) param('nombre'), (string) param('email'), (string) param('password'));
      json_out(200, ['ok' => true]);

    case 'login':
      $soloPost();
      $estado = login((string) param('email'), (string) param('password'));
      json_out(200, ['estado' => $estado, 'csrf' => csrf_token()]);

    case 'login-2fa':
      $soloPost();
      login_2fa(requerir($u, 'editor', ['2fa']), (string) param('codigo'));
      json_out(200, estado_sesion(sesion_usuario()));

    case 'logout':
      $soloPost();
      if ($u) auditar((int) $u['id'], $u['email'], 'logout');
      sesion_destruir();
      json_out(200, ['ok' => true]);

    case 'invitacion-info':
      $soloPost();
      $inv = invitacion_buscar((string) param('token'));
      json_out(200, ['nombre' => $inv['nombre'], 'email' => $inv['email'], 'tipo' => $inv['tipo']]);

    case 'invitacion-aceptar':
      $soloPost();
      invitacion_aceptar((string) param('token'), (string) param('password'));
      json_out(200, ['ok' => true]);

    // ── MI CUENTA ──
    case '2fa-iniciar':
      $soloPost();
      json_out(200, totp_iniciar(requerir($u, 'editor', ['ok', 'configurar_2fa'])));

    case '2fa-confirmar':
      $soloPost();
      $codigos = totp_confirmar(requerir($u, 'editor', ['ok', 'configurar_2fa']), (string) param('codigo'));
      json_out(200, ['codigos' => $codigos] + estado_sesion(sesion_usuario()));

    case '2fa-nuevos-codigos':
      $soloPost();
      $yo = requerir($u);
      if (!password_verify((string) param('password'), (string) $yo['password_hash'])) throw new ErrorAuth('Contraseña incorrecta.');
      $codigos = codigos_recuperacion_generar((int) $yo['id']);
      auditar((int) $yo['id'], $yo['email'], 'codigos_recuperacion_regenerados');
      json_out(200, ['codigos' => $codigos]);

    case '2fa-desactivar':
      $soloPost();
      $yo = requerir($u);
      if (config('requerir_2fa')) throw new ErrorAuth('La verificación en dos pasos es obligatoria en este sitio.', 403);
      if (!password_verify((string) param('password'), (string) $yo['password_hash'])) throw new ErrorAuth('Contraseña incorrecta.');
      totp_desactivar((int) $yo['id']);
      auditar((int) $yo['id'], $yo['email'], '2fa_desactivado');
      sesion_destruir();
      json_out(200, ['ok' => true]);

    case 'cuenta-password':
      $soloPost();
      cambiar_password(requerir($u), (string) param('actual'), (string) param('nueva'));
      json_out(200, ['ok' => true, 'csrf' => csrf_token()]);

    // ── CATÁLOGO ──
    case 'catalogo':
      requerir($u);
      json_out(200, ['catalogo' => catalogo_leer(), 'version' => catalogo_version(), 'pagos' => pagos_leer()]);

    // ── PAGOS (solo administradores) ──
    case 'pagos':
      requerir($u, 'admin');
      $token = mp_token();
      json_out(200, [
        'pagos' => pagos_leer(),
        'version' => pagos_version(),
        'mp_token' => $token ? ['configurado' => true, 'final' => substr($token, -4), 'prueba' => str_starts_with($token, 'TEST-')] : ['configurado' => false],
        'webhook' => url_sitio('api/mp-webhook.php'),
      ]);

    case 'pagos-guardar':
      $soloPost();
      $yo = requerir($u, 'admin');
      $pagos = validar_pagos((array) param('pagos', []));
      $version = pagos_guardar($pagos, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'pagos_editados', implode(', ', array_map(fn($p) => $p['nombre'] . ($p['activo'] ? '' : ' (inactivo)'), $pagos['planes'])));
      json_out(200, ['pagos' => $pagos, 'version' => $version]);

    case 'mp-token':
      $soloPost();
      $yo = requerir($u, 'admin');
      if (!password_verify((string) param('password'), (string) $yo['password_hash'])) throw new ErrorAuth('Contraseña incorrecta.');
      mp_token_guardar((string) param('token'));
      auditar((int) $yo['id'], $yo['email'], param('token') ? 'mp_token_actualizado' : 'mp_token_eliminado');
      json_out(200, ['ok' => true]);

    case 'mp-probar':
      $soloPost();
      requerir($u, 'admin');
      if (!mp_token()) throw new ErrorValidacion('Todavía no cargaste el access token.');
      [$status, $data] = mp_api('GET', '/users/me');
      if ($status !== 200) throw new ErrorValidacion('Mercado Pago rechazó el token (' . ($data['message'] ?? "HTTP $status") . ').');
      json_out(200, ['cuenta' => $data['nickname'] ?? '', 'email' => $data['email'] ?? '', 'pais' => $data['site_id'] ?? '']);

    case 'mp-pagos':
      requerir($u, 'admin');
      $pagos = db()->query('SELECT * FROM pagos_mp ORDER BY actualizado DESC LIMIT 100')->fetchAll();
      json_out(200, ['pagos' => $pagos]);

    case 'producto-guardar':
      $soloPost();
      $yo = requerir($u);
      $catalogo = catalogo_leer();
      $idOriginal = (string) param('id_original', '');
      $anterior = $idOriginal !== '' ? $catalogo['productos'][producto_indice($catalogo, $idOriginal)] : null;
      $producto = validar_producto((array) param('producto', []), $catalogo, $anterior);
      if ($anterior) $catalogo['productos'][producto_indice($catalogo, $idOriginal)] = $producto;
      else array_unshift($catalogo['productos'], $producto);
      $version = catalogo_guardar($catalogo, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], $anterior ? 'producto_editado' : 'producto_creado', $producto['nombre']);
      json_out(200, ['producto' => $producto, 'version' => $version]);

    case 'producto-rapido':
      $soloPost();
      $yo = requerir($u);
      $catalogo = catalogo_leer();
      $i = producto_indice($catalogo, (string) param('id'));
      $p = $catalogo['productos'][$i];
      $cambios = (array) param('cambios', []);
      $detalle = [];
      foreach ($cambios as $campo => $valor) {
        switch ($campo) {
          case 'stock': $p['stock'] = (int) v_numero($valor, 'Stock', 0, 1e6); break;
          case 'precio': $p['precio'] = v_numero($valor, 'Precio'); break;
          case 'activo': case 'destacado': $p[$campo] = (bool) $valor; break;
          default: throw new ErrorValidacion('Campo no editable.');
        }
        $detalle[] = "$campo=" . json_encode($p[$campo]);
      }
      $p['actualizado'] = date('c');
      $catalogo['productos'][$i] = $p;
      $version = catalogo_guardar($catalogo, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'producto_editado', $p['nombre'] . ': ' . implode(', ', $detalle));
      json_out(200, ['producto' => $p, 'version' => $version]);

    case 'producto-eliminar':
      $soloPost();
      $yo = requerir($u);
      $catalogo = catalogo_leer();
      $i = producto_indice($catalogo, (string) param('id'));
      $nombre = $catalogo['productos'][$i]['nombre'];
      array_splice($catalogo['productos'], $i, 1);
      $version = catalogo_guardar($catalogo, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'producto_eliminado', $nombre);
      json_out(200, ['version' => $version]);

    case 'categorias-guardar':
      $soloPost();
      $yo = requerir($u);
      $catalogo = catalogo_leer();
      $catalogo['categorias'] = validar_categorias(param('categorias', []), $catalogo);
      $version = catalogo_guardar($catalogo, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'categorias_editadas', implode(', ', array_column($catalogo['categorias'], 'nombre')));
      json_out(200, ['categorias' => $catalogo['categorias'], 'version' => $version]);

    case 'imagen-subir':
      $soloPost();
      $yo = requerir($u);
      limite_verificar([['upload:' . $yo['id'], 120, 3600]]);
      intento_registrar('upload:' . $yo['id']);
      $url = imagen_subir($_FILES['imagen'] ?? []);
      auditar((int) $yo['id'], $yo['email'], 'imagen_subida', $url);
      json_out(200, ['url' => $url]);

    case 'catalogo-importar':
      $soloPost();
      $yo = requerir($u, 'admin');
      $nuevo = (array) param('catalogo', []);
      if (!isset($nuevo['productos'], $nuevo['categorias']) || !is_array($nuevo['productos'])) throw new ErrorValidacion('El archivo no tiene el formato del catálogo.');
      $actual = catalogo_leer();
      $resultado = $actual;
      $resultado['categorias'] = [];
      $resultado['productos'] = [];
      $resultado['categorias'] = validar_categorias($nuevo['categorias'], $resultado);
      foreach ($nuevo['productos'] as $n => $p) {
        try {
          $resultado['productos'][] = validar_producto((array) $p, $resultado, null);
        } catch (ErrorValidacion $e) {
          throw new ErrorValidacion('Producto ' . ($n + 1) . ' (' . ($p['nombre'] ?? 'sin nombre') . '): ' . $e->getMessage());
        }
      }
      $version = catalogo_guardar($resultado, (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'catalogo_importado', count($resultado['productos']) . ' productos');
      json_out(200, ['version' => $version]);

    // ── RESPALDOS ──
    case 'respaldos':
      requerir($u, 'admin');
      json_out(200, ['respaldos' => respaldos_listar()]);

    case 'respaldo-descargar':
      $yo = requerir($u, 'admin');
      $data = respaldo_leer((string) ($_GET['archivo'] ?? ''));
      header('Content-Type: application/json; charset=utf-8');
      header('Content-Disposition: attachment; filename="' . basename((string) $_GET['archivo']) . '"');
      echo json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
      exit;

    case 'respaldo-restaurar':
      $soloPost();
      $yo = requerir($u, 'admin');
      $archivo = (string) param('archivo');
      $version = catalogo_guardar(respaldo_leer($archivo), (string) param('version'));
      auditar((int) $yo['id'], $yo['email'], 'respaldo_restaurado', $archivo);
      json_out(200, ['version' => $version]);

    // ── USUARIOS (solo administradores) ──
    case 'usuarios':
      requerir($u, 'admin');
      json_out(200, ['usuarios' => usuarios_listar()]);

    case 'usuario-invitar':
      $soloPost();
      $link = usuario_invitar(requerir($u, 'admin'), (string) param('nombre'), (string) param('email'), (string) param('rol'));
      json_out(200, ['link' => $link, 'horas' => INVITACION_HORAS]);

    case 'usuario-actualizar':
      $soloPost();
      usuario_actualizar(requerir($u, 'admin'), (int) param('id'), (string) param('rol'), (bool) param('activo'));
      json_out(200, ['ok' => true]);

    case 'usuario-reset-2fa':
      $soloPost();
      usuario_reset_2fa(requerir($u, 'admin'), (int) param('id'));
      json_out(200, ['ok' => true]);

    case 'usuario-reset-password':
      $soloPost();
      $link = usuario_reset_password(requerir($u, 'admin'), (int) param('id'));
      json_out(200, ['link' => $link, 'horas' => INVITACION_HORAS]);

    case 'usuario-eliminar':
      $soloPost();
      usuario_eliminar(requerir($u, 'admin'), (int) param('id'));
      json_out(200, ['ok' => true]);

    case 'auditoria':
      requerir($u, 'admin');
      json_out(200, ['eventos' => auditoria_listar()]);

    default:
      json_out(404, ['error' => 'Acción desconocida.']);
  }
} catch (ErrorAuth $e) {
  json_out($e->http, ['error' => $e->getMessage()]);
} catch (ErrorValidacion $e) {
  json_out(422, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
  error_log('[admin] ' . $e);
  json_out(500, ['error' => 'Error interno del servidor.']);
}
