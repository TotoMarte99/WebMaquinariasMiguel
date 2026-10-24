<?php
// ════════════════════════════════════════════════════════════
//  PAGOS — medios de pago, planes de cuotas y cálculo de precios
//  Configuración en la carpeta privada (pagos.json), editable desde el panel.
//  Las mismas fórmulas están en js/precios.js (tienda y panel).
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/catalogo.php';

function pagos_defecto(): array {
  return [
    'efectivo' => ['activo' => true, 'descuento' => 0, 'solo_retiro' => true],
    'transferencia' => ['activo' => true, 'descuento' => 0, 'titular' => '', 'banco' => '', 'cbu' => '', 'alias' => '', 'cuit' => ''],
    'mercadopago' => ['activo' => true, 'comision' => 6.29, 'iva' => 21, 'iva_sobre_costos' => true, 'plazo' => 'Al instante'],
    'whatsapp' => ['activo' => true],
    'notificaciones' => ['email' => 'maquinariasmiguel@hotmail.com'],
    // Costos orientativos: verificalos en Mercado Pago → Tu negocio → Costos
    'planes' => [
      ['id' => '3-sin-interes', 'nombre' => '3 cuotas sin interés', 'cuotas' => 3, 'tipo' => 'sin_interes', 'costo' => 12.49, 'recargo' => 0, 'coeficiente' => 1, 'tna' => 0, 'tea' => 0, 'cft' => 0, 'activo' => false],
      ['id' => '6-sin-interes', 'nombre' => '6 cuotas sin interés', 'cuotas' => 6, 'tipo' => 'sin_interes', 'costo' => 19.79, 'recargo' => 0, 'coeficiente' => 1, 'tna' => 0, 'tea' => 0, 'cft' => 0, 'activo' => false],
      ['id' => '12-con-interes', 'nombre' => '12 cuotas', 'cuotas' => 12, 'tipo' => 'con_interes', 'costo' => 0, 'recargo' => 0, 'coeficiente' => 1.9, 'tna' => 0, 'tea' => 0, 'cft' => 0, 'activo' => false],
    ],
    'planes_por_defecto' => ['3-sin-interes', '6-sin-interes', '12-con-interes'],
  ];
}

function pagos_archivo(): string { return dir_privado() . '/pagos.json'; }

function pagos_leer(): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $def = pagos_defecto();
  $data = is_file(pagos_archivo()) ? json_decode((string) file_get_contents(pagos_archivo()), true) : null;
  if (!is_array($data)) return $cache = $def;
  foreach (['efectivo', 'transferencia', 'mercadopago', 'whatsapp', 'notificaciones'] as $k) {
    $data[$k] = array_merge($def[$k], (array) ($data[$k] ?? []));
  }
  $data['planes'] = array_values((array) ($data['planes'] ?? []));
  $data['planes_por_defecto'] = array_values((array) ($data['planes_por_defecto'] ?? []));
  return $cache = $data;
}

function pagos_version(): string {
  return is_file(pagos_archivo()) ? sha1_file(pagos_archivo()) : 'inicial';
}

function pagos_guardar(array $pagos, string $versionEsperada): string {
  if (!hash_equals(pagos_version(), $versionEsperada)) {
    throw new ErrorValidacion('La configuración de pagos fue modificada por otra persona. Recargá la página.');
  }
  $json = json_encode($pagos, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  $tmp = pagos_archivo() . '.tmp';
  file_put_contents($tmp, $json, LOCK_EX);
  rename($tmp, pagos_archivo());
  return sha1($json);
}

function v_bool($v): bool { return filter_var($v, FILTER_VALIDATE_BOOLEAN); }

function validar_pagos(array $in): array {
  $pct = fn($v, $campo) => v_numero($v === '' || $v === null ? 0 : $v, $campo, 0, 100);
  $ef = (array) ($in['efectivo'] ?? []);
  $tr = (array) ($in['transferencia'] ?? []);
  $mp = (array) ($in['mercadopago'] ?? []);

  $cbu = preg_replace('/\D/', '', (string) ($tr['cbu'] ?? ''));
  if ($cbu !== '' && strlen($cbu) !== 22) throw new ErrorValidacion('El CBU/CVU debe tener 22 dígitos.');

  $planes = [];
  $ids = [];
  foreach (array_slice((array) ($in['planes'] ?? []), 0, 20) as $p) {
    $nombre = v_texto($p['nombre'] ?? '', 60, 'Nombre del plan', true);
    $id = v_slug(($p['id'] ?? '') ?: slugify($nombre), 'ID del plan');
    if (isset($ids[$id])) throw new ErrorValidacion("Plan repetido: $nombre");
    $ids[$id] = true;
    $tipo = ($p['tipo'] ?? '') === 'con_interes' ? 'con_interes' : 'sin_interes';
    $cuotas = (int) v_numero($p['cuotas'] ?? 0, "Cuotas de \"$nombre\"", 2, 48);
    $planes[] = [
      'id' => $id,
      'nombre' => $nombre,
      'cuotas' => $cuotas,
      'tipo' => $tipo,
      'costo' => $pct($p['costo'] ?? 0, "Costo de \"$nombre\""),
      'recargo' => $pct($p['recargo'] ?? 0, "Recargo de \"$nombre\""),
      'coeficiente' => $tipo === 'con_interes' ? v_numero($p['coeficiente'] ?? 1, "Coeficiente de \"$nombre\"", 1, 10) : 1,
      'tna' => v_numero($p['tna'] ?? 0, "TNA de \"$nombre\"", 0, 1000),
      'tea' => v_numero($p['tea'] ?? 0, "TEA de \"$nombre\"", 0, 1000),
      'cft' => v_numero($p['cft'] ?? 0, "CFT de \"$nombre\"", 0, 1000),
      'activo' => v_bool($p['activo'] ?? false),
    ];
  }

  $email = trim((string) ($in['notificaciones']['email'] ?? ''));
  if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) throw new ErrorValidacion('El email de notificaciones no es válido.');

  return [
    'efectivo' => ['activo' => v_bool($ef['activo'] ?? true), 'descuento' => $pct($ef['descuento'] ?? 0, 'Descuento en efectivo'), 'solo_retiro' => v_bool($ef['solo_retiro'] ?? true)],
    'transferencia' => [
      'activo' => v_bool($tr['activo'] ?? true),
      'descuento' => $pct($tr['descuento'] ?? 0, 'Descuento por transferencia'),
      'titular' => v_texto($tr['titular'] ?? '', 100, 'Titular'),
      'banco' => v_texto($tr['banco'] ?? '', 80, 'Banco'),
      'cbu' => $cbu,
      'alias' => v_texto($tr['alias'] ?? '', 40, 'Alias'),
      'cuit' => v_texto($tr['cuit'] ?? '', 20, 'CUIT'),
    ],
    'mercadopago' => [
      'activo' => v_bool($mp['activo'] ?? true),
      'comision' => $pct($mp['comision'] ?? 0, 'Comisión de Mercado Pago'),
      'iva' => $pct($mp['iva'] ?? 21, 'IVA'),
      'iva_sobre_costos' => v_bool($mp['iva_sobre_costos'] ?? true),
      'plazo' => v_texto($mp['plazo'] ?? '', 40, 'Plazo de acreditación'),
    ],
    'whatsapp' => ['activo' => v_bool($in['whatsapp']['activo'] ?? true)],
    'notificaciones' => ['email' => $email],
    'planes' => $planes,
    'planes_por_defecto' => array_values(array_filter((array) ($in['planes_por_defecto'] ?? []), fn($id) => isset($ids[$id]))),
  ];
}

// ── TOKEN DE MERCADO PAGO (en config.php, nunca se devuelve completo) ──
function mp_token(): string {
  return (string) (config('mercadopago_access_token') ?: getenv('MP_ACCESS_TOKEN') ?: '');
}

function mp_token_guardar(string $token): void {
  $token = trim($token);
  if ($token !== '' && !preg_match('/^(APP_USR|TEST)-[A-Za-z0-9-]{20,}$/', $token)) {
    throw new ErrorValidacion('El access token no tiene el formato de Mercado Pago (empieza con APP_USR-).');
  }
  config_guardar('mercadopago_access_token', $token);
}

function mp_api(string $metodo, string $ruta, ?array $cuerpo = null, array $headers = []): array {
  $ch = curl_init('https://api.mercadopago.com' . $ruta);
  curl_setopt_array($ch, [
    CURLOPT_CUSTOMREQUEST => $metodo,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_HTTPHEADER => array_merge(['Content-Type: application/json', 'Authorization: Bearer ' . mp_token()], $headers),
  ]);
  if ($cuerpo !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($cuerpo, JSON_UNESCAPED_UNICODE));
  $respuesta = curl_exec($ch);
  $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);
  return [$status, json_decode((string) $respuesta, true) ?: []];
}

function mp_disponible(): bool {
  return pagos_leer()['mercadopago']['activo'] && mp_token() !== '';
}

// ── VERSIÓN PÚBLICA (sin costos internos ni token) ──
function pagos_publico(): array {
  $p = pagos_leer();
  $planes = array_values(array_map(fn($pl) => array_diff_key($pl, ['costo' => 1, 'activo' => 1]),
    array_filter($p['planes'], fn($pl) => $pl['activo'])));
  return [
    'efectivo' => $p['efectivo'],
    'transferencia' => $p['transferencia'],
    'mercadopago' => ['disponible' => mp_disponible()],
    'whatsapp' => $p['whatsapp'],
    'planes' => mp_disponible() ? $planes : [],
    'planes_por_defecto' => $p['planes_por_defecto'],
  ];
}

// ── CÁLCULOS (mismas fórmulas que js/precios.js) ──
/** Planes activos que aplican a un producto. */
function planes_producto(array $producto, array $pagos): array {
  $cfg = $producto['pagos']['planes'] ?? 'defecto';
  $activos = array_filter($pagos['planes'], fn($pl) => $pl['activo'] ?? true);
  if ($cfg === 'ninguno') return [];
  $ids = is_array($cfg) ? $cfg : $pagos['planes_por_defecto'];
  return array_values(array_filter($activos, fn($pl) => in_array($pl['id'], $ids, true)));
}

function descuento_producto(array $producto, array $pagos, string $metodo): float {
  $propio = $producto['pagos']["descuento_$metodo"] ?? null;
  return (float) ($propio ?? $pagos[$metodo]['descuento'] ?? 0);
}

/** Total que cobra la tienda con un plan (precio de lista + recargo) y, si es con interés, el total estimado para el cliente. */
function calcular_plan(float $precio, array $plan): array {
  $total = round($precio * (1 + ($plan['recargo'] ?? 0) / 100), 2);
  $totalCliente = $plan['tipo'] === 'con_interes' ? round($total * ($plan['coeficiente'] ?? 1), 2) : $total;
  return ['total' => $total, 'total_cliente' => $totalCliente, 'cuota' => round($totalCliente / $plan['cuotas'], 2)];
}

/** El plan sin interés con más cuotas (el que conviene destacar). */
function mejor_plan(array $planes): ?array {
  $sin = array_filter($planes, fn($p) => $p['tipo'] === 'sin_interes' && empty($p['recargo']));
  if (!$sin) return null;
  usort($sin, fn($a, $b) => $b['cuotas'] <=> $a['cuotas']);
  return $sin[0];
}
