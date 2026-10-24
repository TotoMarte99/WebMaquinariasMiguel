<?php
// ── CATÁLOGO PÚBLICO ── productos activos, sin notas internas
declare(strict_types=1);
require_once __DIR__ . '/../inc/pagos.php';

try {
  $etag = '"' . sha1(catalogo_version() . pagos_version() . (mp_disponible() ? '1' : '0')) . '"';
  header('Content-Type: application/json; charset=utf-8');
  header('Cache-Control: public, max-age=60, must-revalidate');
  header('X-Content-Type-Options: nosniff');
  header("ETag: $etag");
  if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
    http_response_code(304);
    exit;
  }
  echo json_encode(catalogo_publico() + ['pagos' => pagos_publico()], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
  error_log('[catalogo] ' . $e);
  json_out(500, ['error' => 'No se pudo cargar el catálogo.']);
}
