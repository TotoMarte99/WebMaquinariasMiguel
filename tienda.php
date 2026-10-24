<?php
// ════════════════════════════════════════════════════════════
//  TIENDA — /tienda y /tienda/{categoria}
//  Se renderiza en el servidor (SEO) y tienda.js agrega filtros,
//  ficha rápida y carrito.
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/inc/layout.php';

$catId = (string) ($_GET['categoria'] ?? '');
$categoria = $catId !== '' ? categoria_por_id($catId) : null;
if ($catId !== '' && !$categoria) render_404();

$productos = array_values(array_filter(catalogo_leer()['productos'], fn($p) => ($p['activo'] ?? true) !== false
  && (!$categoria || $p['categoria'] === $categoria['id'])));
usort($productos, fn($a, $b) => (int) !empty($b['destacado']) <=> (int) !empty($a['destacado'])
  ?: (stock_total($b) > 0) <=> (stock_total($a) > 0));

if ($categoria) {
  $titulo = "{$categoria['nombre']} en Rosario | Venta online — " . NEGOCIO['nombre'];
  $descripcion = $categoria['descripcion'] ?: "Comprá {$categoria['nombre']} en " . NEGOCIO['nombre'] . ', Rosario. Precios con IVA, envíos a todo el país, retiro en el local y servicio técnico propio.';
  $canonical = url_categoria($categoria['id']);
  $migas = [['Inicio', '/'], ['Tienda', '/tienda'], [$categoria['nombre'], $canonical]];
} else {
  $titulo = 'Tienda online de máquinas de coser, overlock e insumos | ' . NEGOCIO['nombre'];
  $descripcion = 'Máquinas de coser familiares e industriales, overlock, cortadoras, hilos y accesorios en Rosario. Pagá con transferencia, Mercado Pago o efectivo. Envíos a todo el país.';
  $canonical = '/tienda';
  $migas = [['Inicio', '/'], ['Tienda', '/tienda']];
}

// Con filtros o búsqueda en la URL no se indexa (evita contenido duplicado); la canónica es la categoría
$conFiltros = (bool) array_intersect(array_keys($_GET), ['q', 'marca', 'min', 'max', 'stock', 'orden', 'pago']);

render_head([
  'titulo' => $titulo,
  'descripcion' => $descripcion,
  'canonical' => $canonical,
  'robots' => $conFiltros ? 'noindex, follow' : null,
  'schema' => [
    schema_migas($migas),
    [
      '@type' => 'CollectionPage',
      'name' => $categoria['nombre'] ?? 'Tienda online',
      'url' => url_sitio($canonical),
      'description' => $descripcion,
      'mainEntity' => [
        '@type' => 'ItemList',
        'numberOfItems' => count($productos),
        'itemListElement' => array_map(fn($p, $i) => [
          '@type' => 'ListItem',
          'position' => $i + 1,
          'url' => url_sitio(url_producto($p)),
          'name' => $p['nombre'],
        ], $productos, array_keys($productos)),
      ],
    ],
  ],
]);
?>
<body class="page-tienda" data-categoria="<?= h($categoria['id'] ?? '') ?>">
<?php render_nav('tienda') ?>

<header class="shop-hero">
  <svg class="hero-gear shop-hero-gear" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M50 2 L54 15 L67 10 L65 24 L78 26 L70 37 L82 44 L72 52 L80 63 L68 65 L70 79 L57 76 L52 90 L42 80 L30 88 L28 74 L15 75 L20 62 L8 56 L18 47 L10 36 L23 32 L20 19 L33 21 L38 8 Z" fill="none" stroke="#ffc107" stroke-width="1"/>
    <circle cx="50" cy="50" r="20" fill="none" stroke="#ffc107" stroke-width="1"/>
    <circle cx="50" cy="50" r="8" fill="none" stroke="#ffc107" stroke-width="1"/>
  </svg>
  <div class="shop-hero-inner">
    <?php render_migas($migas) ?>
    <?php if ($categoria): ?>
      <h1 class="section-title"><?= h($categoria['nombre']) ?><br><em>en Rosario</em></h1>
    <?php else: ?>
      <h1 class="section-title">Nuestra<br><em>Tienda</em></h1>
    <?php endif ?>
    <p class="section-subtitle"><?= h($descripcion) ?></p>
  </div>
  <ul class="shop-perks">
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      <div><strong>Envíos a todo el país</strong><span>O retiro gratis en Rosario</span></div>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
      <div><strong>Pagá como quieras</strong><span>Transferencia, Mercado Pago o efectivo</span></div>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
      <div><strong>Servicio técnico propio</strong><span>Respaldo real después de la compra</span></div>
    </li>
    <li>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>
      <div><strong>Factura A y B</strong><span>Precios con IVA incluido</span></div>
    </li>
  </ul>
</header>

<div class="payment-banner" id="paymentBanner" hidden></div>

<main class="shop">
  <nav class="shop-categories" id="shopCategories" aria-label="Categorías">
    <a class="filter-btn<?= !$categoria ? ' active' : '' ?>" href="/tienda">Todos</a>
    <?php foreach (catalogo_leer()['categorias'] as $c): ?>
      <a class="filter-btn<?= ($categoria['id'] ?? '') === $c['id'] ? ' active' : '' ?>" href="<?= h(url_categoria($c['id'])) ?>"><?= h($c['nombre']) ?></a>
    <?php endforeach ?>
  </nav>

  <div class="shop-layout">
    <div class="filters-overlay" id="filtersOverlay" onclick="toggleFiltros(false)"></div>
    <aside class="shop-filters" id="shopFilters" aria-label="Filtros">
      <div class="shop-filters-head">
        <span class="cart-title">Filtros</span>
        <button class="cart-close" onclick="toggleFiltros(false)" aria-label="Cerrar filtros">×</button>
      </div>

      <div class="filter-group">
        <label class="filter-title" for="filterSearch">Buscar</label>
        <div class="filter-search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input id="filterSearch" type="search" placeholder="Producto, marca, color..." autocomplete="off">
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-title">Marca</div>
        <div class="filter-list" id="filterBrands"></div>
      </div>

      <div class="filter-group">
        <div class="filter-title">Precio</div>
        <div class="filter-price">
          <input id="filterMin" type="number" inputmode="numeric" min="0" placeholder="Mínimo" aria-label="Precio mínimo">
          <span>—</span>
          <input id="filterMax" type="number" inputmode="numeric" min="0" placeholder="Máximo" aria-label="Precio máximo">
        </div>
      </div>

      <div class="filter-group">
        <div class="filter-title">Disponibilidad</div>
        <label class="filter-check">
          <input type="checkbox" id="filterStock">
          <span class="filter-check-box"></span>
          <span class="filter-check-label">Solo con stock</span>
        </label>
        <label class="filter-check" id="filterOfferWrap">
          <input type="checkbox" id="filterOffer">
          <span class="filter-check-box"></span>
          <span class="filter-check-label">En oferta</span>
        </label>
      </div>

      <button class="btn-outline filter-clear" onclick="limpiarFiltros()">Limpiar filtros</button>
      <button class="checkout-btn filter-apply" onclick="toggleFiltros(false)">Ver resultados</button>

      <div class="filter-help">
        <div class="filter-title">¿Necesitás ayuda?</div>
        <p>Te asesoramos para elegir la máquina ideal según tu trabajo.</p>
        <a href="<?= h(NEGOCIO['whatsapp']) ?>" target="_blank" rel="noopener" class="btn-secondary">Hablar con un asesor →</a>
      </div>
    </aside>

    <div class="shop-results" aria-live="polite">
      <div class="shop-toolbar">
        <button class="shop-filters-btn" onclick="toggleFiltros(true)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
          Filtros <span class="filters-badge" id="filtersBadge" hidden>0</span>
        </button>
        <span class="shop-count" id="shopCount"><?= count($productos) ?> productos</span>
        <label class="shop-sort">
          <span>Ordenar por</span>
          <select id="shopSort" class="form-select">
            <option value="destacados">Destacados</option>
            <option value="precio-asc">Menor precio</option>
            <option value="precio-desc">Mayor precio</option>
            <option value="nombre">Nombre A–Z</option>
          </select>
        </label>
      </div>
      <div class="shop-chips" id="shopChips"></div>
      <div class="shop-grid" id="shopGrid">
        <?php foreach ($productos as $p) render_tarjeta($p) ?>
      </div>
    </div>
  </div>
</main>

<section class="shop-how">
  <div class="section-tag">Cómo comprar</div>
  <h2 class="section-title">Simple, rápido<br><em>y seguro</em></h2>
  <div class="shop-how-grid">
    <div class="repair-step">
      <div class="step-num">01</div>
      <div class="step-content">
        <h3 class="step-title">Elegí tus productos</h3>
        <p class="step-desc">Agregalos al carrito con el color o la variante que necesites.</p>
      </div>
    </div>
    <div class="repair-step">
      <div class="step-num">02</div>
      <div class="step-content">
        <h3 class="step-title">Elegí cómo pagar</h3>
        <p class="step-desc">Transferencia bancaria, Mercado Pago, efectivo en el local o reservá por WhatsApp.</p>
      </div>
    </div>
    <div class="repair-step">
      <div class="step-num">03</div>
      <div class="step-content">
        <h3 class="step-title">Recibí o retirá</h3>
        <p class="step-desc">Coordinamos el envío a todo el país o lo retirás por nuestro local en Rosario.</p>
      </div>
    </div>
  </div>
</section>

<?php render_footer();
