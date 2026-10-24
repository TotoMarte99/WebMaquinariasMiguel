<?php
// ════════════════════════════════════════════════════════════
//  IMÁGENES DE PRODUCTOS — validación y re-codificación
//  Toda imagen subida se vuelve a generar con GD: descarta metadatos
//  y cualquier contenido que no sea la imagen en sí.
// ════════════════════════════════════════════════════════════

declare(strict_types=1);
require_once __DIR__ . '/catalogo.php';

const IMG_MAX_BYTES = 8 * 1024 * 1024;
const IMG_MAX_LADO = 1600;
const IMG_DIR = ROOT . '/img/productos';

function imagen_subir(array $archivo): string {
  if (($archivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($archivo['tmp_name'])) {
    throw new ErrorValidacion('No se recibió la imagen.');
  }
  if ($archivo['size'] > IMG_MAX_BYTES) throw new ErrorValidacion('La imagen supera los 8 MB.');

  $mime = (new finfo(FILEINFO_MIME_TYPE))->file($archivo['tmp_name']);
  $tipos = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
  if (!isset($tipos[$mime])) throw new ErrorValidacion('Formato no permitido. Usá JPG, PNG o WebP.');
  $info = @getimagesize($archivo['tmp_name']);
  if (!$info || $info[0] < 1 || $info[0] > 10000 || $info[1] < 1 || $info[1] > 10000) throw new ErrorValidacion('La imagen no es válida.');

  if (!is_dir(IMG_DIR)) mkdir(IMG_DIR, 0755, true);
  $base = date('Ymd') . '-' . bin2hex(random_bytes(8));

  if (!extension_loaded('gd')) {
    // Sin GD no se puede re-codificar: se guarda tal cual (ya validada) con extensión fija
    $nombre = "$base.{$tipos[$mime]}";
    move_uploaded_file($archivo['tmp_name'], IMG_DIR . "/$nombre");
    return "/img/productos/$nombre";
  }

  $origen = match ($mime) {
    'image/jpeg' => @imagecreatefromjpeg($archivo['tmp_name']),
    'image/png' => @imagecreatefrompng($archivo['tmp_name']),
    'image/webp' => @imagecreatefromwebp($archivo['tmp_name']),
  };
  if (!$origen) throw new ErrorValidacion('No se pudo procesar la imagen.');

  [$w, $h] = [imagesx($origen), imagesy($origen)];
  $escala = min(1, IMG_MAX_LADO / max($w, $h));
  [$nw, $nh] = [max(1, (int) round($w * $escala)), max(1, (int) round($h * $escala))];
  $destino = imagecreatetruecolor($nw, $nh);

  $webp = function_exists('imagewebp');
  if ($webp) {
    imagealphablending($destino, false);
    imagesavealpha($destino, true);
    imagefill($destino, 0, 0, imagecolorallocatealpha($destino, 0, 0, 0, 127));
  } else {
    imagefill($destino, 0, 0, imagecolorallocate($destino, 255, 255, 255));
  }
  imagecopyresampled($destino, $origen, 0, 0, 0, 0, $nw, $nh, $w, $h);

  $nombre = $base . ($webp ? '.webp' : '.jpg');
  $ok = $webp ? imagewebp($destino, IMG_DIR . "/$nombre", 82) : imagejpeg($destino, IMG_DIR . "/$nombre", 85);
  imagedestroy($origen);
  imagedestroy($destino);
  if (!$ok) throw new RuntimeException('No se pudo guardar la imagen.');
  return "/img/productos/$nombre";
}
