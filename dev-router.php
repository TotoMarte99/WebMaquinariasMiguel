<?php
// ── SERVIDOR DE DESARROLLO ──
// Emula las reglas de .htaccess para probar en local:
//   php -S localhost:8000 dev-router.php
// En producción (Hostinger) se usa .htaccess y este archivo está bloqueado.

$ruta = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if (preg_match('#^/(inc|privado|jsonProductos|docs)(/|$)|/\.|\.(sqlite|lock|md)$#i', $ruta)) {
  http_response_code(403);
  exit('Prohibido');
}
if ($ruta === '/index.html') { header('Location: /', true, 301); exit; }

$reglas = [
  '#^/tienda/?$#' => ['tienda.php', []],
  '#^/tienda/([a-z0-9-]+)/?$#' => ['tienda.php', ['categoria']],
  '#^/producto/([a-z0-9-]+)/?$#' => ['producto.php', ['slug']],
  '#^/sitemap\.xml$#' => ['sitemap.php', []],
];
foreach ($reglas as $patron => [$script, $params]) {
  if (preg_match($patron, $ruta, $m)) {
    foreach ($params as $i => $nombre) $_GET[$nombre] = $m[$i + 1];
    $_SERVER['SCRIPT_NAME'] = "/$script";
    require __DIR__ . "/$script";
    return true;
  }
}

$archivo = __DIR__ . $ruta;
if ($ruta === '/' || is_dir($archivo)) {
  foreach (['index.php', 'index.html'] as $idx) {
    if (is_file(rtrim($archivo, '/') . "/$idx")) {
      if (str_ends_with($idx, '.php')) { require rtrim($archivo, '/') . "/$idx"; return true; }
      return false;
    }
  }
}
if (is_file($archivo)) return false;

require __DIR__ . '/404.php';
