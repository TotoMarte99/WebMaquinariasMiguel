<?php
// ════════════════════════════════════════════════════════════
//  FICHA DE PRODUCTO — /producto/{slug}
//  El contenido se renderiza en el servidor (indexable) y tienda.js
//  lo reemplaza por la versión interactiva (variantes, carrito).
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/inc/layout.php';

$p = producto_por_slug((string) ($_GET['slug'] ?? ''));
if (!$p) render_404();

$categoria = categoria_por_id($p['categoria']);
[$min, $max] = rango_precios($p);
$stock = stock_total($p);
$imagenes = array_values(array_filter($p['imagenes'] ?? [], fn($i) => !empty($i['url'])));
$principal = imagen_principal($p);
$url = url_producto($p);

$titulo = ($p['seo']['titulo'] ?? '') ?: $p['nombre'] . ' | ' . NEGOCIO['nombre'];
$descripcion = ($p['seo']['descripcion'] ?? '') ?: ($p['descripcion_corta'] ?: recortar($p['descripcion'] ?? '', 160));
$migas = [['Inicio', '/'], ['Tienda', '/tienda']];
if ($categoria) $migas[] = [$categoria['nombre'], url_categoria($categoria['id'])];
$migas[] = [$p['nombre'], $url];

$disponibilidad = $stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
$condicion = ['nuevo' => 'NewCondition', 'usado' => 'UsedCondition', 'reacondicionado' => 'RefurbishedCondition'][$p['condicion'] ?? 'nuevo'] ?? 'NewCondition';
$vendedor = ['@id' => url_sitio('#negocio')];
$oferta = $min !== $max
  ? ['@type' => 'AggregateOffer', 'lowPrice' => $min, 'highPrice' => $max, 'offerCount' => count($p['variantes'])]
  : ['@type' => 'Offer', 'price' => $min, 'url' => url_sitio($url)];
$oferta += [
  'priceCurrency' => 'ARS',
  'availability' => $disponibilidad,
  'itemCondition' => "https://schema.org/$condicion",
  'seller' => $vendedor,
];

$schemaProducto = array_filter([
  '@type' => 'Product',
  '@id' => url_sitio($url) . '#producto',
  'name' => $p['nombre'],
  'description' => recortar($p['descripcion'] ?: $p['descripcion_corta'], 5000),
  'sku' => $p['sku'],
  'mpn' => $p['modelo'] ?: null,
  'brand' => $p['marca'] ? ['@type' => 'Brand', 'name' => $p['marca']] : null,
  'category' => $categoria['nombre'] ?? null,
  'image' => array_map(fn($i) => url_absoluta($i['url']), $imagenes),
  'offers' => $oferta,
  'additionalProperty' => array_map(fn($k, $v) => ['@type' => 'PropertyValue', 'name' => $k, 'value' => $v],
    array_keys((array) $p['especificaciones']), array_values((array) $p['especificaciones'])) ?: null,
]);

$relacionados = array_slice(array_values(array_filter(catalogo_leer()['productos'], fn($o) => $o['id'] !== $p['id']
  && $o['categoria'] === $p['categoria'] && ($o['activo'] ?? true) !== false)), 0, 4);

render_head([
  'titulo' => $titulo,
  'descripcion' => $descripcion,
  'canonical' => $url,
  'tipo' => 'product',
  'imagen' => $principal ? url_absoluta($principal['url']) : null,
  'extra_head' => '<meta property="product:price:amount" content="' . h($min) . '">' . "\n  "
    . '<meta property="product:price:currency" content="ARS">' . "\n  "
    . '<meta property="product:availability" content="' . ($stock > 0 ? 'in stock' : 'out of stock') . '">',
  'schema' => [schema_migas($migas), $schemaProducto],
]);
?>
<body class="page-producto">
<?php render_nav('tienda') ?>

<main class="product-page">
  <?php render_migas($migas) ?>

  <div id="productPage" class="product-page-body" data-producto-id="<?= h($p['id']) ?>">
    <div class="pm-grid">
      <div class="pm-gallery">
        <div class="pm-main">
          <?php if ($principal): ?>
            <img src="<?= h($principal['url']) ?>" alt="<?= h($principal['alt'] ?: $p['nombre']) ?>" width="800" height="800" fetchpriority="high">
          <?php endif ?>
        </div>
        <?php if (count($imagenes) > 1): ?>
          <div class="pm-thumbs">
            <?php foreach ($imagenes as $i => $img): ?>
              <span class="pm-thumb<?= $i === 0 ? ' active' : '' ?>"><img src="<?= h($img['url']) ?>" alt="<?= h($img['alt'] ?: $p['nombre']) ?>" loading="lazy" width="72" height="72"></span>
            <?php endforeach ?>
          </div>
        <?php endif ?>
      </div>

      <div class="pm-info">
        <div class="product-category"><?= h($categoria['nombre'] ?? '') ?><?= $p['marca'] ? ' · ' . h($p['marca']) : '' ?></div>
        <h1 class="pm-title"><?= h($p['nombre']) ?></h1>
        <div class="pm-meta">SKU <?= h($p['sku']) ?></div>
        <div class="pm-price-row">
          <div class="pm-price"><?= $min !== $max ? '<small>Desde</small> ' : '' ?><?= formatear_precio($min) ?></div>
        </div>
        <?php if ($cuotas = linea_cuotas($p, $min)): ?><div class="pm-cuotas-destacado"><?= h($cuotas) ?></div><?php endif ?>
        <span class="pm-stock<?= $stock <= 0 ? ' out' : '' ?>"><?= $stock > 0 ? 'En stock' : 'Sin stock' ?></span>
        <?php if ($p['descripcion_corta']): ?><p class="pm-short"><?= h($p['descripcion_corta']) ?></p><?php endif ?>
        <?php if (!empty($p['variantes'])): ?>
          <div class="pm-label">Opciones disponibles</div>
          <div class="pm-variants">
            <?php foreach ($p['variantes'] as $v): ?><span class="pm-variant"><?= h($v['nombre']) ?></span><?php endforeach ?>
          </div>
        <?php endif ?>
      </div>
    </div>

    <div class="pm-details">
      <div>
        <?php if (!empty($p['descripcion'])): ?>
          <h2 class="pm-section-title">Descripción</h2>
          <div class="pm-desc">
            <?php foreach (preg_split('/\n\s*\n/', $p['descripcion']) as $parrafo): ?>
              <p><?= nl2br(h($parrafo)) ?></p>
            <?php endforeach ?>
          </div>
        <?php endif ?>
        <?php if (!empty($p['caracteristicas'])): ?>
          <h2 class="pm-section-title">Características</h2>
          <ul class="pm-features">
            <?php foreach ($p['caracteristicas'] as $c): ?><li><?= h($c) ?></li><?php endforeach ?>
          </ul>
        <?php endif ?>
      </div>
      <?php if (!empty((array) $p['especificaciones'])): ?>
        <div>
          <h2 class="pm-section-title">Especificaciones</h2>
          <table class="pm-specs">
            <?php foreach ((array) $p['especificaciones'] as $k => $v): ?>
              <tr><th scope="row"><?= h($k) ?></th><td><?= h($v) ?></td></tr>
            <?php endforeach ?>
          </table>
        </div>
      <?php endif ?>
    </div>
  </div>

  <?php if ($relacionados): ?>
    <section class="product-related">
      <div class="section-tag">También te puede interesar</div>
      <h2 class="section-title">Más en<br><em><?= h($categoria['nombre'] ?? 'la tienda') ?></em></h2>
      <div class="shop-grid featured-grid" id="relatedGrid" data-categoria="<?= h($p['categoria']) ?>" data-excluir="<?= h($p['id']) ?>">
        <?php foreach ($relacionados as $r) render_tarjeta($r) ?>
      </div>
    </section>
  <?php endif ?>
</main>

<?php render_footer();
