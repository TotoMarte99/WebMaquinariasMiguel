<?php
// ════════════════════════════════════════════════════════════
//  MERCADO PAGO — webhook de pagos
//  MP avisa que hubo un movimiento; el servidor CONSULTA el pago a la
//  API con el access token (nunca confía en el contenido del aviso),
//  lo registra y, si fue aprobado, envía un email al administrador.
//  Opcional: validar la firma con 'mercadopago_webhook_secret' (config.php).
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/../inc/pagos.php';
require_once __DIR__ . '/../inc/auth.php';

function responder(int $codigo, string $msg = 'ok'): never {
  http_response_code($codigo);
  header('Content-Type: text/plain; charset=utf-8');
  echo $msg;
  exit;
}

function firma_valida(string $dataId): bool {
  $secreto = (string) config('mercadopago_webhook_secret');
  if ($secreto === '') return true; // sin secreto configurado se confía en la consulta a la API
  $partes = [];
  foreach (explode(',', $_SERVER['HTTP_X_SIGNATURE'] ?? '') as $par) {
    [$k, $v] = array_pad(explode('=', trim($par), 2), 2, '');
    $partes[$k] = $v;
  }
  if (empty($partes['ts']) || empty($partes['v1'])) return false;
  $manifiesto = 'id:' . strtolower($dataId) . ';request-id:' . ($_SERVER['HTTP_X_REQUEST_ID'] ?? '') . ';ts:' . $partes['ts'] . ';';
  return hash_equals(hash_hmac('sha256', $manifiesto, $secreto), $partes['v1']);
}

function enviar_email_pago(array $pago): bool {
  $destino = pagos_leer()['notificaciones']['email'] ?? '';
  if ($destino === '') return false;
  $f = fn($n) => '$ ' . number_format((float) $n, 2, ',', '.');
  $pedido = $pago['external_reference'] ?? '—';
  $filas = '';
  foreach ($pago['additional_info']['items'] ?? [] as $it) {
    $filas .= '<tr><td style="padding:6px;border-bottom:1px solid #eee;">' . h($it['title'] ?? '') . '</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">'
      . h($it['quantity'] ?? '') . '</td><td style="padding:6px;border-bottom:1px solid #eee;text-align:right;">' . $f($it['unit_price'] ?? 0) . '</td></tr>';
  }
  $neto = $pago['transaction_details']['net_received_amount'] ?? null;
  $payer = $pago['payer'] ?? [];
  $html = '<div style="font-family:Arial,sans-serif;max-width:620px;color:#222;">'
    . '<div style="background:#111;color:#fff;padding:20px 24px;border-bottom:3px solid #ffc107;">'
    . '<div style="color:#ffc107;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Mercado Pago · Pago aprobado</div>'
    . '<div style="font-size:22px;font-weight:bold;margin-top:6px;">Pedido ' . h($pedido) . '</div></div>'
    . '<div style="padding:20px 24px;font-size:14px;line-height:1.7;">'
    . '<strong>Monto cobrado:</strong> ' . $f($pago['transaction_amount'] ?? 0) . '<br>'
    . ($neto !== null ? '<strong>Neto a recibir:</strong> ' . $f($neto) . '<br>' : '')
    . '<strong>Cuotas:</strong> ' . h($pago['installments'] ?? 1) . '<br>'
    . '<strong>Medio:</strong> ' . h(($pago['payment_method_id'] ?? '') . ' (' . ($pago['payment_type_id'] ?? '') . ')') . '<br>'
    . '<strong>Pagador:</strong> ' . h(trim(($payer['first_name'] ?? '') . ' ' . ($payer['last_name'] ?? ''))) . ' ' . h($payer['email'] ?? '') . '<br>'
    . '<strong>ID de pago:</strong> ' . h($pago['id'] ?? '') . '</div>'
    . ($filas ? '<table style="width:100%;border-collapse:collapse;font-size:14px;margin:0 24px 24px;max-width:572px;"><tr style="background:#111;color:#ffc107;"><th style="padding:6px;text-align:left;">Producto</th><th style="padding:6px;">Cant.</th><th style="padding:6px;text-align:right;">Precio</th></tr>' . $filas . '</table>' : '')
    . '<div style="padding:14px 24px;background:#f5f3ee;color:#777;font-size:12px;">Verificado con la API de Mercado Pago. Los datos del cliente (teléfono, entrega) están en el email del pedido ' . h($pedido) . '.</div></div>';

  $dominio = parse_url(url_sitio(''), PHP_URL_HOST) ?: 'localhost';
  $asunto = '=?UTF-8?B?' . base64_encode("Pago aprobado · Pedido $pedido · " . $f($pago['transaction_amount'] ?? 0)) . '?=';
  $cabeceras = implode("\r\n", [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: ' . SITIO_NOMBRE . " <no-reply@$dominio>",
  ]);
  return @mail($destino, $asunto, $html, $cabeceras);
}

try {
  // Formatos de aviso: JSON {type, data:{id}} o query ?type=payment&data.id=… (PHP lo convierte a data_id) o IPN ?topic=payment&id=…
  $json = json_decode((string) file_get_contents('php://input', false, null, 0, 100000), true) ?: [];
  $tipo = $json['type'] ?? $_GET['type'] ?? $_GET['topic'] ?? '';
  $id = (string) ($json['data']['id'] ?? $_GET['data_id'] ?? $_GET['id'] ?? '');
  if ($tipo !== 'payment' || !preg_match('/^\d{1,20}$/', $id)) responder(200, 'ignorado');

  limite_verificar([['mp-webhook:' . ip_cliente(), 300, 3600]]);
  intento_registrar('mp-webhook:' . ip_cliente());
  if (!firma_valida($id)) responder(401, 'firma inválida');
  if (!mp_token()) responder(503, 'sin token');

  [$status, $pago] = mp_api('GET', "/v1/payments/$id");
  if ($status === 404) responder(200, 'inexistente');
  if ($status !== 200) responder(502, 'reintentar'); // MP vuelve a avisar más tarde

  $ahora = time();
  db()->prepare('INSERT INTO pagos_mp (payment_id, pedido, estado, detalle_estado, monto, cuotas, email, creado, actualizado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(payment_id) DO UPDATE SET estado = excluded.estado, detalle_estado = excluded.detalle_estado, monto = excluded.monto, cuotas = excluded.cuotas, actualizado = excluded.actualizado')
    ->execute([$id, (string) ($pago['external_reference'] ?? ''), (string) ($pago['status'] ?? ''), (string) ($pago['status_detail'] ?? ''),
      (float) ($pago['transaction_amount'] ?? 0), (int) ($pago['installments'] ?? 1), (string) ($pago['payer']['email'] ?? ''), $ahora, $ahora]);

  if (($pago['status'] ?? '') === 'approved') {
    // Se marca primero para que dos avisos simultáneos no manden dos emails
    $st = db()->prepare('UPDATE pagos_mp SET notificado = 1 WHERE payment_id = ? AND notificado = 0');
    $st->execute([$id]);
    if ($st->rowCount() === 1 && !enviar_email_pago($pago)) {
      error_log("[mp-webhook] No se pudo enviar el email del pago $id");
      db()->prepare('UPDATE pagos_mp SET notificado = 0 WHERE payment_id = ?')->execute([$id]);
    }
  }
  responder(200);
} catch (ErrorAuth $e) {
  responder($e->http, 'limite');
} catch (Throwable $e) {
  error_log('[mp-webhook] ' . $e);
  responder(500, 'error');
}
