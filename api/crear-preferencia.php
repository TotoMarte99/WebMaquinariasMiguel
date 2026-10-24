<?php
// ════════════════════════════════════════════════════════════
//  MERCADO PAGO — crear preferencia de pago (Checkout Pro)
//  Los precios, el plan de cuotas y el recargo se calculan SIEMPRE
//  en el servidor a partir del catálogo y de la configuración de pagos.
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/../inc/pagos.php';
require_once __DIR__ . '/../inc/auth.php';

try {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') json_out(405, ['error' => 'Método no permitido']);
  if (!mp_disponible()) json_out(503, ['error' => 'Mercado Pago no está disponible en este momento']);
  limite_verificar([['mp-pref:' . ip_cliente(), 30, 3600]]);
  intento_registrar('mp-pref:' . ip_cliente());

  $catalogo = catalogo_leer();
  $pagos = pagos_leer();
  $body = json_decode((string) file_get_contents('php://input', false, null, 0, 200000), true) ?: [];
  $pedido = preg_replace('/[^A-Za-z0-9\-]/', '', (string) ($body['pedido'] ?? ''));
  $items = $body['items'] ?? [];
  $cliente = (array) ($body['cliente'] ?? []);
  $planId = (string) ($body['plan'] ?? '');
  if (!$pedido || strlen($pedido) > 40 || !is_array($items) || !count($items) || count($items) > 50) json_out(400, ['error' => 'Pedido inválido']);

  $plan = null;
  $mpItems = [];
  foreach ($items as $i) {
    $producto = null;
    foreach ($catalogo['productos'] as $p) {
      if ($p['id'] === ($i['id'] ?? null) && ($p['activo'] ?? true) !== false) { $producto = $p; break; }
    }
    if (!$producto) json_out(400, ['error' => 'Producto inexistente']);

    $variante = null;
    if (!empty($i['variante_sku'])) {
      foreach ($producto['variantes'] ?? [] as $v) {
        if ($v['sku'] === $i['variante_sku']) { $variante = $v; break; }
      }
      if (!$variante || ($variante['disponible'] ?? true) === false) json_out(400, ['error' => 'Variante no disponible']);
    }

    // El plan elegido tiene que estar habilitado para TODOS los productos del carrito
    if ($planId !== '') {
      $planesProducto = planes_producto($producto, $pagos);
      $encontrado = null;
      foreach ($planesProducto as $pl) if ($pl['id'] === $planId) $encontrado = $pl;
      if (!$encontrado) json_out(400, ['error' => "El plan de cuotas no está disponible para \"{$producto['nombre']}\""]);
      $plan = $encontrado;
    }

    $precio = (float) ($variante['precio'] ?? $producto['precio']);
    $unitario = $plan ? calcular_plan($precio, $plan)['total'] : $precio;

    $imagen = null;
    foreach ($producto['imagenes'] ?? [] as $im) { if (!empty($im['principal'])) { $imagen = $im['url']; break; } }
    if ($imagen && str_starts_with($imagen, '/')) $imagen = url_sitio($imagen);

    $mpItems[] = array_filter([
      'id' => $variante['sku'] ?? $producto['sku'],
      'title' => mb_substr($variante ? "{$producto['nombre']} ({$variante['nombre']})" : $producto['nombre'], 0, 250),
      'quantity' => max(1, min(99, intval($i['cantidad'] ?? 1))),
      'unit_price' => round($unitario, 2),
      'currency_id' => 'ARS',
      'picture_url' => $imagen,
      'category_id' => 'others',
    ], fn($v) => $v !== null);
  }

  $volver = fn($estado) => url_sitio('tienda') . "?pago=$estado&pedido=" . urlencode($pedido);
  $email = filter_var($cliente['email'] ?? '', FILTER_VALIDATE_EMAIL) ?: null;

  [$status, $data] = mp_api('POST', '/checkout/preferences', [
    'items' => $mpItems,
    'payer' => array_filter(['name' => mb_substr((string) ($cliente['nombre'] ?? ''), 0, 100), 'email' => $email]),
    'external_reference' => $pedido,
    'statement_descriptor' => 'MAQ MIGUEL',
    'back_urls' => ['success' => $volver('aprobado'), 'pending' => $volver('pendiente'), 'failure' => $volver('rechazado')],
    'auto_return' => 'approved',
    'notification_url' => url_sitio('api/mp-webhook.php') . '?source_news=webhooks',
    // Sin plan: 1 pago. Con plan: hasta la cantidad de cuotas del plan.
    'payment_methods' => ['installments' => $plan ? $plan['cuotas'] : 1, 'default_installments' => $plan ? $plan['cuotas'] : 1],
    'metadata' => ['pedido' => $pedido, 'plan' => $plan['id'] ?? null],
  ], ["X-Idempotency-Key: pref-$pedido-" . ($plan['id'] ?? '1pago')]);

  if ($status < 200 || $status >= 300 || empty($data['init_point'])) {
    error_log('Mercado Pago: ' . json_encode($data));
    json_out(502, ['error' => 'Mercado Pago rechazó la solicitud']);
  }
  json_out(200, ['id' => $data['id'], 'init_point' => $data['init_point']]);
} catch (ErrorAuth $e) {
  json_out($e->http, ['error' => $e->getMessage()]);
} catch (Throwable $e) {
  error_log('[mercadopago] ' . $e);
  json_out(500, ['error' => 'Error interno']);
}
