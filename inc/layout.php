<?php
// ════════════════════════════════════════════════════════════
//  LAYOUT PÚBLICO — <head> con SEO, nav, footer y helpers de render
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/pagos.php';

const NEGOCIO = [
  'nombre' => 'Maquinarias Miguel',
  'telefono' => '+54 341 610-5083',
  'telefono_texto' => '(0341) 610-5083',
  'email' => 'maquinariasmiguel@hotmail.com',
  'direccion' => 'Ricardo Núñez 602',
  'ciudad' => 'Rosario',
  'provincia' => 'Santa Fe',
  'cp' => '2000',
  'horario_texto' => 'Lun–Vie 7:30–13:00',
  'whatsapp' => 'https://wa.link/j76wdg',
  'facebook' => 'https://www.facebook.com/maquinariasmiguel/',
];

/** Ruta de un asset con versión según fecha de modificación (evita caché vieja tras un deploy). */
function asset(string $ruta): string {
  $archivo = ROOT . $ruta;
  return $ruta . (is_file($archivo) ? '?v=' . filemtime($archivo) : '');
}

function url_producto(array $p): string { return '/producto/' . rawurlencode($p['slug']); }
function url_categoria(?string $id): string { return '/tienda' . ($id ? '/' . rawurlencode($id) : ''); }

function url_absoluta(string $url): string {
  return str_starts_with($url, 'http') ? $url : url_sitio($url);
}

function imagen_principal(array $p): ?array {
  $imgs = $p['imagenes'] ?? [];
  foreach ($imgs as $i) if (!empty($i['principal'])) return $i;
  return $imgs[0] ?? null;
}

function stock_total(array $p): int {
  if (!empty($p['variantes'])) {
    $max = 0;
    foreach ($p['variantes'] as $v) {
      if (($v['disponible'] ?? true) === false) continue;
      $max = max($max, (int) ($v['stock'] ?? $p['stock'] ?? 0));
    }
    return $max;
  }
  return (int) ($p['stock'] ?? 0);
}

function rango_precios(array $p): array {
  $precios = !empty($p['variantes']) ? array_map(fn($v) => (float) ($v['precio'] ?? $p['precio']), $p['variantes']) : [(float) $p['precio']];
  return [min($precios), max($precios)];
}

function recortar(string $texto, int $max): string {
  $texto = trim(preg_replace('/\s+/', ' ', $texto));
  if (mb_strlen($texto) <= $max) return $texto;
  return rtrim(mb_substr($texto, 0, $max - 1), ' ,.;:') . '…';
}

function imagen_og_defecto(): string {
  if (is_file(ROOT . '/img/og-portada.jpg')) return url_sitio('img/og-portada.jpg');
  foreach (catalogo_leer()['productos'] as $p) {
    if (!empty($p['destacado']) && ($img = imagen_principal($p))) return url_absoluta($img['url']);
  }
  return url_sitio('');
}

function json_ld(array $data): string {
  return '<script type="application/ld+json">' . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG) . "</script>\n";
}

function schema_negocio(): array {
  return [
    '@type' => ['LocalBusiness', 'Store'],
    '@id' => url_sitio('#negocio'),
    'name' => NEGOCIO['nombre'],
    'url' => url_sitio(''),
    'image' => imagen_og_defecto(),
    'telephone' => NEGOCIO['telefono'],
    'email' => NEGOCIO['email'],
    'priceRange' => '$$',
    'address' => [
      '@type' => 'PostalAddress',
      'streetAddress' => NEGOCIO['direccion'],
      'addressLocality' => NEGOCIO['ciudad'],
      'addressRegion' => NEGOCIO['provincia'],
      'postalCode' => NEGOCIO['cp'],
      'addressCountry' => 'AR',
    ],
    'openingHoursSpecification' => [[
      '@type' => 'OpeningHoursSpecification',
      'dayOfWeek' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      'opens' => '07:30',
      'closes' => '13:00',
    ]],
    'sameAs' => [NEGOCIO['facebook']],
  ];
}

function schema_migas(array $migas): array {
  return [
    '@type' => 'BreadcrumbList',
    'itemListElement' => array_map(fn($m, $i) => [
      '@type' => 'ListItem',
      'position' => $i + 1,
      'name' => $m[0],
      'item' => url_sitio($m[1]),
    ], $migas, array_keys($migas)),
  ];
}

/**
 * @param array{titulo:string, descripcion:string, canonical:string, imagen?:string, tipo?:string,
 *              robots?:string, schema?:array, extra_head?:string} $m
 */
function render_head(array $m): void {
  $titulo = h($m['titulo']);
  $desc = h(recortar($m['descripcion'], 160));
  $canonical = h(url_sitio($m['canonical']));
  $imagen = h($m['imagen'] ?? imagen_og_defecto());
  ?>
<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><?= $titulo ?></title>
  <meta name="description" content="<?= $desc ?>">
  <meta name="robots" content="<?= h($m['robots'] ?? 'index, follow, max-image-preview:large') ?>">
  <link rel="canonical" href="<?= $canonical ?>">
  <meta name="theme-color" content="#0a0a0a">
  <meta property="og:site_name" content="<?= h(NEGOCIO['nombre']) ?>">
  <meta property="og:locale" content="es_AR">
  <meta property="og:type" content="<?= h($m['tipo'] ?? 'website') ?>">
  <meta property="og:title" content="<?= $titulo ?>">
  <meta property="og:description" content="<?= $desc ?>">
  <meta property="og:url" content="<?= $canonical ?>">
  <meta property="og:image" content="<?= $imagen ?>">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="<?= $titulo ?>">
  <meta name="twitter:description" content="<?= $desc ?>">
  <meta name="twitter:image" content="<?= $imagen ?>">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preconnect" href="https://http2.mlstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,300;0,500;0,700;0,900;1,300&family=Barlow:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?= asset('/css/style.css') ?>">
  <link rel="stylesheet" href="<?= asset('/css/tienda.css') ?>">
  <?= $m['extra_head'] ?? '' ?>
  <?= json_ld(['@context' => 'https://schema.org', '@graph' => array_merge([schema_negocio()], $m['schema'] ?? [])]) ?>
</head>
<?php
}

function render_nav(string $activo = ''): void { ?>
<div class="cursor" id="cursor"></div>
<div class="cursor-ring" id="cursorRing"></div>

<nav id="navbar">
  <a href="/" class="nav-logo" aria-label="<?= h(NEGOCIO['nombre']) ?> — Inicio">
    <span class="nav-logo-main"><?= h(NEGOCIO['nombre']) ?></span>
  </a>
  <ul class="nav-links" id="navLinks">
    <li><a href="/#servicios">Servicios</a></li>
    <li><a href="/tienda"<?= $activo === 'tienda' ? ' class="active" aria-current="page"' : '' ?>>Tienda</a></li>
    <li><a href="/#reparaciones">Reparaciones</a></li>
    <li><a href="/#turnos">Turnos</a></li>
    <li><a href="/#contacto">Contacto</a></li>
    <li><a href="/#turnos" class="nav-cta">Sacar Turno</a></li>
  </ul>
  <div class="nav-actions">
    <button class="cart-icon-btn" onclick="toggleCart()" aria-label="Abrir carrito">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="cart-icon-label">Carrito</span>
      <span class="cart-bubble">0</span>
    </button>
    <button class="nav-toggle" id="navToggle" aria-label="Abrir menú" aria-expanded="false"><span></span><span></span><span></span></button>
  </div>
</nav>
<?php }

function render_migas(array $migas): void { ?>
<nav class="breadcrumbs" aria-label="Ruta de navegación">
  <ol>
    <?php foreach ($migas as $i => [$nombre, $url]): ?>
      <li><?php if ($i < count($migas) - 1): ?><a href="<?= h($url) ?>"><?= h($nombre) ?></a><?php else: ?><span aria-current="page"><?= h($nombre) ?></span><?php endif ?></li>
    <?php endforeach ?>
  </ol>
</nav>
<?php }

/** "3 cuotas sin interés de $X" para tarjetas y fichas renderizadas en el servidor. */
function linea_cuotas(array $p, float $precio): string {
  if (!mp_disponible()) return '';
  $plan = mejor_plan(planes_producto($p, pagos_leer()));
  if (!$plan) return '';
  return $plan['cuotas'] . ' cuotas sin interés de ' . formatear_precio(calcular_plan($precio, $plan)['cuota']);
}

/** Tarjeta de producto renderizada en el servidor (la misma estructura que arma tienda.js). */
function render_tarjeta(array $p): void {
  $img = imagen_principal($p);
  [$min, $max] = rango_precios($p);
  $cat = categoria_por_id($p['categoria']);
  ?>
  <article class="shop-card">
    <a class="shop-card-media" href="<?= h(url_producto($p)) ?>">
      <?php if ($img): ?><img src="<?= h($img['url']) ?>" alt="<?= h($img['alt'] ?: $p['nombre']) ?>" loading="lazy" width="400" height="400"><?php endif ?>
    </a>
    <div class="shop-card-body">
      <div class="product-category"><?= h($cat['nombre'] ?? '') ?><?= $p['marca'] ? ' · ' . h($p['marca']) : '' ?></div>
      <h3 class="shop-card-name"><a href="<?= h(url_producto($p)) ?>"><?= h($p['nombre']) ?></a></h3>
      <?php if ($cuotas = linea_cuotas($p, $min)): ?><div class="shop-card-pago"><?= h($cuotas) ?></div><?php endif ?>
      <div class="shop-card-foot">
        <div class="shop-card-price"><?= $min !== $max ? '<small>Desde</small> ' : '' ?><?= formatear_precio($min) ?></div>
      </div>
    </div>
  </article>
<?php }

function render_footer(): void { ?>
<footer>
  <div class="footer-top">
    <div class="footer-brand">
      <div class="footer-logo-text"><?= h(NEGOCIO['nombre']) ?></div>
      <div class="footer-slogan">Al servicio de la industria de la confección</div>
      <p class="footer-brand-desc">
        Más de 40 años de experiencia en venta, reparación y asesoramiento de máquinas de coser familiares e industriales en Rosario, Santa Fe.
      </p>
    </div>
    <div>
      <div class="footer-col-title">Tienda</div>
      <ul class="footer-links">
        <?php foreach (catalogo_leer()['categorias'] as $c): ?>
          <li><a href="<?= h(url_categoria($c['id'])) ?>"><?= h($c['nombre']) ?></a></li>
        <?php endforeach ?>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">Servicios</div>
      <ul class="footer-links">
        <li><a href="/#reparaciones">Reparación técnica</a></li>
        <li><a href="/#reparaciones">Restauración</a></li>
        <li><a href="/#turnos">Sacar turno</a></li>
        <li><a href="/#reparaciones">Service a domicilio</a></li>
      </ul>
    </div>
    <div>
      <div class="footer-col-title">Contacto</div>
      <address class="footer-links footer-address">
        <span><?= h(NEGOCIO['direccion']) ?>, <?= h(NEGOCIO['ciudad']) ?></span>
        <a href="tel:<?= h(preg_replace('/[^\d+]/', '', NEGOCIO['telefono'])) ?>"><?= h(NEGOCIO['telefono_texto']) ?></a>
        <span><?= h(NEGOCIO['horario_texto']) ?></span>
        <a href="<?= h(NEGOCIO['whatsapp']) ?>" target="_blank" rel="noopener">WhatsApp directo</a>
        <a href="<?= h(NEGOCIO['facebook']) ?>" target="_blank" rel="noopener">Facebook</a>
      </address>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="footer-copy">© <?= date('Y') ?> <?= h(NEGOCIO['nombre']) ?>. Todos los derechos reservados.</div>
    <div class="footer-socials">
      <a href="<?= h(NEGOCIO['facebook']) ?>" target="_blank" rel="noopener" class="social-link" aria-label="Facebook">f</a>
      <a href="<?= h(NEGOCIO['whatsapp']) ?>" target="_blank" rel="noopener" class="social-link" aria-label="WhatsApp">w</a>
    </div>
  </div>
  <a href="https://www.linkedin.com/company/tcmsistemas" class="link-dev" target="_blank" rel="noopener">© Desarrollo — AgenciaTM</a>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
<script src="<?= asset('/js/config.js') ?>"></script>
<script src="<?= asset('/js/tienda-config.js') ?>"></script>
<script src="<?= asset('/js/main.js') ?>"></script>
<script src="<?= asset('/js/precios.js') ?>"></script>
<script src="<?= asset('/js/tienda.js') ?>"></script>
</body>
</html>
<?php }

function render_404(): never {
  http_response_code(404);
  render_head([
    'titulo' => 'Página no encontrada | ' . NEGOCIO['nombre'],
    'descripcion' => 'La página que buscás no existe o fue movida.',
    'canonical' => '/tienda',
    'robots' => 'noindex, follow',
  ]);
  echo '<body>';
  render_nav();
  ?>
  <main class="page-404">
    <div class="section-tag">Error 404</div>
    <h1 class="section-title">Página no<br><em>encontrada</em></h1>
    <p class="section-subtitle">El producto o la página que buscás no existe o ya no está disponible.</p>
    <div class="page-404-actions">
      <a href="/tienda" class="btn-primary">Ir a la tienda</a>
      <a href="/" class="btn-secondary">Volver al inicio</a>
    </div>
  </main>
  <?php
  render_footer();
  exit;
}
