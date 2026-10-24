<?php
// ── SITEMAP XML ── /sitemap.xml (generado a partir del catálogo)
declare(strict_types=1);
require_once __DIR__ . '/inc/layout.php';

header('Content-Type: application/xml; charset=utf-8');
header('Cache-Control: public, max-age=3600');

$catalogo = catalogo_leer();
$fechaCatalogo = date('Y-m-d', filemtime(catalogo_archivo()));
$fechaHome = date('Y-m-d', filemtime(ROOT . '/index.html'));
$activos = array_filter($catalogo['productos'], fn($p) => ($p['activo'] ?? true) !== false);
$categoriasConProductos = array_unique(array_column($activos, 'categoria'));

$x = fn($s) => htmlspecialchars((string) $s, ENT_XML1 | ENT_QUOTES, 'UTF-8');

echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc><?= $x(url_sitio('')) ?></loc><lastmod><?= $fechaHome ?></lastmod></url>
  <url><loc><?= $x(url_sitio('tienda')) ?></loc><lastmod><?= $fechaCatalogo ?></lastmod></url>
<?php foreach ($catalogo['categorias'] as $c): if (!in_array($c['id'], $categoriasConProductos, true)) continue; ?>
  <url><loc><?= $x(url_sitio(url_categoria($c['id']))) ?></loc><lastmod><?= $fechaCatalogo ?></lastmod></url>
<?php endforeach ?>
<?php foreach ($activos as $p): ?>
  <url>
    <loc><?= $x(url_sitio(url_producto($p))) ?></loc>
    <lastmod><?= $x(!empty($p['actualizado']) ? substr($p['actualizado'], 0, 10) : $fechaCatalogo) ?></lastmod>
<?php foreach (array_slice($p['imagenes'] ?? [], 0, 10) as $img): ?>
    <image:image><image:loc><?= $x(url_absoluta($img['url'])) ?></image:loc></image:image>
<?php endforeach ?>
  </url>
<?php endforeach ?>
</urlset>
