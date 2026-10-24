<?php
// ════════════════════════════════════════════════════════════
//  CATÁLOGO — lectura, escritura atómica, validación y respaldos
//  El catálogo maestro vive en la carpeta privada (catalogo.json).
//  jsonProductos/catalogo_tienda.json solo se usa como semilla inicial.
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

class ErrorValidacion extends RuntimeException {}

const CATALOGO_SEMILLA = ROOT . '/jsonProductos/catalogo_tienda.json';
const MAX_RESPALDOS = 40;

function catalogo_archivo(): string {
  $archivo = dir_privado() . '/catalogo.json';
  if (!is_file($archivo)) {
    if (!is_file(CATALOGO_SEMILLA)) throw new RuntimeException('No existe el catálogo inicial.');
    copy(CATALOGO_SEMILLA, $archivo);
  }
  return $archivo;
}

function catalogo_leer(): array {
  static $cache = null;
  if ($cache !== null) return $cache;
  $data = json_decode((string) file_get_contents(catalogo_archivo()), true);
  if (!is_array($data)) throw new RuntimeException('El catálogo está dañado.');
  $data['categorias'] ??= [];
  $data['productos'] ??= [];
  return $cache = $data;
}

function catalogo_version(): string {
  return sha1_file(catalogo_archivo());
}

/** Guarda el catálogo si la versión no cambió desde que el usuario lo leyó. */
function catalogo_guardar(array $catalogo, string $versionEsperada): string {
  $archivo = catalogo_archivo();
  $lock = fopen(dir_privado() . '/catalogo.lock', 'c');
  flock($lock, LOCK_EX);
  try {
    if (!hash_equals(sha1_file($archivo), $versionEsperada)) {
      throw new ErrorValidacion('El catálogo fue modificado por otra persona. Recargá para ver los últimos cambios.');
    }
    respaldo_crear($archivo);
    usort($catalogo['categorias'], fn($a, $b) => ($a['orden'] ?? 99) <=> ($b['orden'] ?? 99));
    $json = json_encode($catalogo, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    $tmp = $archivo . '.tmp';
    file_put_contents($tmp, $json, LOCK_EX);
    rename($tmp, $archivo);
    return sha1($json);
  } finally {
    flock($lock, LOCK_UN);
    fclose($lock);
  }
}

// ── RESPALDOS ──
function dir_respaldos(): string {
  $dir = dir_privado() . '/respaldos';
  if (!is_dir($dir)) mkdir($dir, 0700, true);
  return $dir;
}

function respaldo_crear(string $archivo): void {
  copy($archivo, dir_respaldos() . '/catalogo-' . date('Ymd-His') . '-' . bin2hex(random_bytes(2)) . '.json');
  $todos = glob(dir_respaldos() . '/catalogo-*.json');
  rsort($todos);
  foreach (array_slice($todos, MAX_RESPALDOS) as $viejo) @unlink($viejo);
}

function respaldos_listar(): array {
  $todos = glob(dir_respaldos() . '/catalogo-*.json');
  rsort($todos);
  return array_map(function ($f) {
    $data = json_decode((string) file_get_contents($f), true);
    return [
      'archivo' => basename($f),
      'fecha' => filemtime($f),
      'productos' => count($data['productos'] ?? []),
      'tamano' => filesize($f),
    ];
  }, $todos);
}

function respaldo_leer(string $nombre): array {
  if (!preg_match('/^catalogo-\d{8}-\d{6}-[a-f0-9]{4}\.json$/', $nombre)) throw new ErrorValidacion('Respaldo inválido.');
  $f = dir_respaldos() . '/' . $nombre;
  if (!is_file($f)) throw new ErrorValidacion('El respaldo no existe.');
  $data = json_decode((string) file_get_contents($f), true);
  if (!is_array($data) || !isset($data['productos'])) throw new ErrorValidacion('El respaldo está dañado.');
  return $data;
}

// ── VERSIÓN PÚBLICA (sin notas internas ni productos inactivos) ──
function catalogo_publico(): array {
  $cat = catalogo_leer();
  $productos = [];
  foreach ($cat['productos'] as $p) {
    if (($p['activo'] ?? true) === false) continue;
    unset($p['revisar'], $p['origen_ml']);
    foreach ($p['variantes'] ?? [] as $i => $v) unset($p['variantes'][$i]['ml_id']);
    $productos[] = $p;
  }
  return [
    'tienda' => $cat['tienda'] ?? new stdClass(),
    'categorias' => $cat['categorias'],
    'productos' => $productos,
  ];
}

function producto_por_slug(string $slug): ?array {
  foreach (catalogo_leer()['productos'] as $p) {
    if (($p['slug'] ?? '') === $slug && ($p['activo'] ?? true) !== false) return $p;
  }
  return null;
}

function categoria_por_id(string $id): ?array {
  foreach (catalogo_leer()['categorias'] as $c) if ($c['id'] === $id) return $c;
  return null;
}

// ── VALIDACIÓN ──
function slugify(string $texto): string {
  $t = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $texto) ?: $texto;
  $t = strtolower(preg_replace('/[^A-Za-z0-9]+/', '-', $t));
  return substr(trim($t, '-'), 0, 90);
}

function v_texto($valor, int $max, string $campo, bool $requerido = false): string {
  if (!is_scalar($valor) && $valor !== null) throw new ErrorValidacion("$campo: valor inválido.");
  $t = trim(strip_tags(str_replace("\r\n", "\n", (string) ($valor ?? ''))));
  if ($requerido && $t === '') throw new ErrorValidacion("$campo es obligatorio.");
  if (mb_strlen($t) > $max) throw new ErrorValidacion("$campo supera los $max caracteres.");
  return $t;
}

function v_numero($valor, string $campo, float $min = 0, float $max = 1e10): float {
  if (!is_numeric($valor)) throw new ErrorValidacion("$campo debe ser un número.");
  $n = (float) $valor;
  if ($n < $min || $n > $max) throw new ErrorValidacion("$campo está fuera de rango.");
  return round($n, 2);
}

function v_slug($valor, string $campo): string {
  $s = (string) $valor;
  if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $s) || strlen($s) > 100) {
    throw new ErrorValidacion("$campo solo admite minúsculas, números y guiones.");
  }
  return $s;
}

function v_lista_textos($valor, int $maxItems, int $maxLargo, string $campo): array {
  if ($valor === null) return [];
  if (!is_array($valor)) throw new ErrorValidacion("$campo: formato inválido.");
  $lista = array_values(array_filter(array_map(fn($x) => v_texto($x, $maxLargo, $campo), $valor), fn($x) => $x !== ''));
  if (count($lista) > $maxItems) throw new ErrorValidacion("$campo admite hasta $maxItems elementos.");
  return $lista;
}

function v_url_imagen($url): string {
  $url = trim((string) $url);
  if (preg_match('#^/img/productos/[A-Za-z0-9._-]+$#', $url)) return $url;
  if (filter_var($url, FILTER_VALIDATE_URL) && str_starts_with($url, 'https://') && strlen($url) <= 500) return $url;
  throw new ErrorValidacion('Las imágenes deben ser subidas al sitio o URLs https.');
}

/** Valida y normaliza un producto. $anterior permite conservar campos internos (origen_ml). */
function validar_producto(array $p, array $catalogo, ?array $anterior): array {
  $nombre = v_texto($p['nombre'] ?? '', 150, 'Nombre', true);
  $id = $anterior['id'] ?? v_slug((($p['id'] ?? '') ?: slugify($nombre)), 'ID');
  $slug = v_slug(($p['slug'] ?? '') ?: slugify($nombre), 'URL (slug)');

  foreach ($catalogo['productos'] as $otro) {
    if ($anterior && $otro['id'] === $anterior['id']) continue;
    if ($otro['id'] === $id) throw new ErrorValidacion('Ya existe un producto con ese ID.');
    if (($otro['slug'] ?? '') === $slug) throw new ErrorValidacion('Ya existe un producto con esa URL (slug).');
  }

  $categoria = (string) ($p['categoria'] ?? '');
  if (!in_array($categoria, array_column($catalogo['categorias'], 'id'), true)) throw new ErrorValidacion('Elegí una categoría válida.');

  $sku = v_texto($p['sku'] ?? '', 64, 'SKU', true);
  if (!preg_match('/^[A-Za-z0-9._-]+$/', $sku)) throw new ErrorValidacion('El SKU solo admite letras, números, puntos y guiones.');

  $especificaciones = [];
  if (!empty($p['especificaciones'])) {
    if (!is_array($p['especificaciones']) || count($p['especificaciones']) > 60) throw new ErrorValidacion('Especificaciones inválidas.');
    foreach ($p['especificaciones'] as $k => $v) {
      $k = v_texto($k, 80, 'Especificación');
      if ($k !== '') $especificaciones[$k] = v_texto($v, 300, "Especificación \"$k\"");
    }
  }

  $imagenes = [];
  foreach (array_slice((array) ($p['imagenes'] ?? []), 0, 20) as $img) {
    if (!is_array($img)) continue;
    $imagenes[] = [
      'url' => v_url_imagen($img['url'] ?? ''),
      'alt' => v_texto($img['alt'] ?? '', 200, 'Texto alternativo') ?: $nombre,
      'principal' => !empty($img['principal']),
    ];
  }
  if ($imagenes && !in_array(true, array_column($imagenes, 'principal'), true)) $imagenes[0]['principal'] = true;

  $variantes = [];
  $skus = [];
  $mlIds = array_column($anterior['variantes'] ?? [], 'ml_id', 'sku');
  foreach (array_slice((array) ($p['variantes'] ?? []), 0, 150) as $v) {
    if (!is_array($v)) continue;
    $vs = v_texto($v['sku'] ?? '', 64, 'SKU de variante', true);
    if (isset($skus[$vs])) throw new ErrorValidacion("SKU de variante repetido: $vs");
    $skus[$vs] = true;
    $vNombre = v_texto($v['nombre'] ?? '', 80, 'Nombre de variante', true);
    $atributos = [];
    foreach ((array) ($v['atributos'] ?? []) as $ak => $av) {
      $atributos[v_texto($ak, 30, 'Atributo')] = v_texto($av, 80, 'Atributo');
    }
    $variante = [
      'sku' => $vs,
      'nombre' => $vNombre,
      'atributos' => $atributos ?: ['color' => $vNombre],
      'precio' => v_numero($v['precio'] ?? $p['precio'] ?? 0, "Precio de $vNombre"),
      'disponible' => !empty($v['disponible']),
    ];
    if (isset($v['stock']) && $v['stock'] !== '' && $v['stock'] !== null) $variante['stock'] = (int) v_numero($v['stock'], "Stock de $vNombre", 0, 1e6);
    if (!empty($mlIds[$vs])) $variante['ml_id'] = $mlIds[$vs];
    $variantes[] = $variante;
  }

  $precioAnterior = $p['precio_anterior'] ?? null;
  $condicion = (string) ($p['condicion'] ?? 'nuevo');
  if (!in_array($condicion, ['nuevo', 'usado', 'reacondicionado'], true)) $condicion = 'nuevo';

  $producto = [
    'id' => $id,
    'sku' => $sku,
    'slug' => $slug,
    'nombre' => $nombre,
    'marca' => v_texto($p['marca'] ?? '', 80, 'Marca'),
    'modelo' => v_texto($p['modelo'] ?? '', 80, 'Modelo'),
    'categoria' => $categoria,
    'descripcion_corta' => v_texto($p['descripcion_corta'] ?? '', 300, 'Descripción corta'),
    'descripcion' => v_texto($p['descripcion'] ?? '', 10000, 'Descripción'),
    'caracteristicas' => v_lista_textos($p['caracteristicas'] ?? [], 60, 200, 'Características'),
    'especificaciones' => $especificaciones ?: new stdClass(),
    'precio' => v_numero($p['precio'] ?? null, 'Precio'),
    'precio_anterior' => ($precioAnterior === null || $precioAnterior === '') ? null : v_numero($precioAnterior, 'Precio anterior'),
    'moneda' => 'ARS',
    'stock' => (int) v_numero($p['stock'] ?? 0, 'Stock', 0, 1e6),
    'condicion' => $condicion,
    'garantia' => v_texto($p['garantia'] ?? '', 120, 'Garantía') ?: null,
    'imagenes' => $imagenes,
    'variantes' => $variantes,
    'etiquetas' => v_lista_textos($p['etiquetas'] ?? [], 30, 40, 'Etiquetas'),
    'destacado' => !empty($p['destacado']),
    'activo' => !empty($p['activo']),
    'seo' => [
      'titulo' => v_texto($p['seo']['titulo'] ?? '', 120, 'Título SEO'),
      'descripcion' => v_texto($p['seo']['descripcion'] ?? '', 320, 'Descripción SEO'),
    ],
    'revisar' => v_lista_textos($p['revisar'] ?? [], 40, 500, 'Notas internas'),
    'pagos' => validar_pagos_producto($p['pagos'] ?? null),
    'actualizado' => date('c'),
  ];
  if (!empty($anterior['origen_ml'])) $producto['origen_ml'] = $anterior['origen_ml'];
  return $producto;
}

/** Pagos por producto: planes ('defecto' | 'ninguno' | [ids]) y descuentos propios (null = usar el general). */
function validar_pagos_producto($in): array {
  $in = is_array($in) ? $in : [];
  $planes = $in['planes'] ?? 'defecto';
  if (is_array($planes)) {
    $planes = array_values(array_unique(array_map(fn($id) => v_slug($id, 'Plan de cuotas'), array_slice($planes, 0, 20))));
  } elseif (!in_array($planes, ['defecto', 'ninguno'], true)) {
    $planes = 'defecto';
  }
  $desc = function ($v, $campo) {
    if ($v === null || $v === '') return null;
    return v_numero($v, $campo, 0, 100);
  };
  return [
    'planes' => $planes,
    'descuento_efectivo' => $desc($in['descuento_efectivo'] ?? null, 'Descuento en efectivo del producto'),
    'descuento_transferencia' => $desc($in['descuento_transferencia'] ?? null, 'Descuento por transferencia del producto'),
  ];
}

function validar_categorias($categorias, array $catalogo): array {
  if (!is_array($categorias) || count($categorias) > 50) throw new ErrorValidacion('Categorías inválidas.');
  $salida = [];
  $ids = [];
  foreach (array_values($categorias) as $i => $c) {
    $nombre = v_texto($c['nombre'] ?? '', 60, 'Nombre de categoría', true);
    $id = v_slug(($c['id'] ?? '') ?: slugify($nombre), 'ID de categoría');
    if (isset($ids[$id])) throw new ErrorValidacion("Categoría repetida: $nombre");
    $ids[$id] = true;
    $salida[] = [
      'id' => $id,
      'nombre' => $nombre,
      'orden' => $i + 1,
      'descripcion' => v_texto($c['descripcion'] ?? '', 400, 'Descripción de categoría'),
    ];
  }
  foreach ($catalogo['productos'] as $p) {
    if (!isset($ids[$p['categoria']])) throw new ErrorValidacion("No se puede eliminar la categoría \"{$p['categoria']}\": tiene productos.");
  }
  return $salida;
}
