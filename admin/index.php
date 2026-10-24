<?php
// ── PANEL DE ADMINISTRACIÓN ── (la lógica está en /api/admin.php)
declare(strict_types=1);

header("Content-Security-Policy: default-src 'self'; script-src 'self' https://cdnjs.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
header('X-Frame-Options: DENY');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');

$v = fn(string $f) => $f . '?v=' . filemtime(__DIR__ . '/' . $f);
?>
<!DOCTYPE html>
<html lang="es-AR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Panel de administración — Maquinarias Miguel</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;700;900&family=Barlow:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="<?= $v('style.css') ?>">
</head>
<body>

<!-- ══ PANTALLAS DE ACCESO ══ -->
<div class="auth" id="vistaAuth" hidden>
  <div class="auth-box">
    <div class="auth-brand">
      <svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2 L54 15 L67 10 L65 24 L78 26 L70 37 L82 44 L72 52 L80 63 L68 65 L70 79 L57 76 L52 90 L42 80 L30 88 L28 74 L15 75 L20 62 L8 56 L18 47 L10 36 L23 32 L20 19 L33 21 L38 8 Z"/><circle cx="50" cy="50" r="20"/><circle cx="50" cy="50" r="8"/></svg>
      Maquinarias Miguel
    </div>

    <!-- Instalación: primer administrador -->
    <form class="auth-step" data-form="instalar" data-paso="instalar" hidden>
      <h1>Crear administrador</h1>
      <p class="auth-desc">Es la primera vez que se abre el panel. Ingresá el <strong>token de instalación</strong> que está en el archivo <code>config.php</code> de la carpeta privada del servidor.</p>
      <label>Token de instalación<input name="token" required autocomplete="off" spellcheck="false"></label>
      <label>Nombre y apellido<input name="nombre" required autocomplete="name" maxlength="80"></label>
      <label>Email<input name="email" type="email" required autocomplete="email"></label>
      <label>Contraseña<input name="password" type="password" required autocomplete="new-password" minlength="12"></label>
      <label>Repetir contraseña<input name="password2" type="password" required autocomplete="new-password" minlength="12"></label>
      <p class="auth-hint">Mínimo 12 caracteres. Te recomendamos una frase larga, por ejemplo: <em>«tres hilos rojos en la overlock»</em>.</p>
      <button class="btn-primary" type="submit">Crear administrador</button>
    </form>

    <!-- Login -->
    <form class="auth-step" data-form="login" data-paso="login" hidden>
      <h1>Iniciar sesión</h1>
      <p class="auth-desc">Panel de administración de la tienda.</p>
      <label>Email<input name="email" type="email" required autocomplete="username"></label>
      <label>Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
      <button class="btn-primary" type="submit">Ingresar</button>
    </form>

    <!-- Segundo factor -->
    <form class="auth-step" data-form="login2fa" data-paso="2fa" hidden>
      <h1>Verificación</h1>
      <p class="auth-desc">Ingresá el código de 6 dígitos de tu app autenticadora (Google Authenticator, Microsoft Authenticator, Authy…).</p>
      <label>Código<input name="codigo" required inputmode="numeric" autocomplete="one-time-code" maxlength="9" class="input-codigo" spellcheck="false"></label>
      <p class="auth-hint">¿Perdiste el teléfono? Podés usar uno de tus códigos de recuperación (formato XXXX-XXXX).</p>
      <button class="btn-primary" type="submit">Verificar</button>
      <button class="btn-link" type="button" data-accion="logout">Cancelar</button>
    </form>

    <!-- Alta de 2FA -->
    <form class="auth-step" data-form="confirmar2fa" data-paso="configurar_2fa" hidden>
      <h1>Activá la verificación en dos pasos</h1>
      <p class="auth-desc">Es obligatoria para acceder al panel. Escaneá el código con tu app autenticadora y escribí el código que te muestra.</p>
      <div class="qr" id="qr2fa"></div>
      <p class="auth-hint">¿No podés escanear? Ingresá esta clave a mano:<br><code class="secreto" id="secreto2fa"></code></p>
      <label>Código de 6 dígitos<input name="codigo" required inputmode="numeric" autocomplete="one-time-code" maxlength="7" class="input-codigo"></label>
      <button class="btn-primary" type="submit">Activar</button>
      <button class="btn-link" type="button" data-accion="logout">Cerrar sesión</button>
    </form>

    <!-- Códigos de recuperación -->
    <div class="auth-step" data-paso="codigos" hidden>
      <h1>Guardá tus códigos de recuperación</h1>
      <p class="auth-desc">Si perdés el teléfono, cada código te deja entrar <strong>una sola vez</strong>. Guardalos en un lugar seguro: no se vuelven a mostrar.</p>
      <ol class="codigos" id="listaCodigos"></ol>
      <div class="auth-actions">
        <button class="btn-outline" type="button" data-accion="copiar-codigos">Copiar</button>
        <button class="btn-outline" type="button" data-accion="descargar-codigos">Descargar .txt</button>
      </div>
      <button class="btn-primary" type="button" data-accion="codigos-listos">Ya los guardé, continuar</button>
    </div>

    <!-- Invitación / restablecer contraseña -->
    <form class="auth-step" data-form="invitacion" data-paso="invitacion" hidden>
      <h1 id="invTitulo">Creá tu contraseña</h1>
      <p class="auth-desc" id="invDesc"></p>
      <label>Contraseña<input name="password" type="password" required autocomplete="new-password" minlength="12"></label>
      <label>Repetir contraseña<input name="password2" type="password" required autocomplete="new-password" minlength="12"></label>
      <p class="auth-hint">Mínimo 12 caracteres. Después vas a configurar la verificación en dos pasos.</p>
      <button class="btn-primary" type="submit">Guardar contraseña</button>
    </form>

    <div class="auth-error" id="authError" role="alert" hidden></div>
    <a class="auth-back" href="/">← Volver al sitio</a>
  </div>
</div>

<!-- ══ PANEL ══ -->
<div class="app" id="vistaApp" hidden>
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-brand">Maquinarias Miguel<span>Panel</span></div>
    <nav class="sidebar-nav">
      <button data-accion="ir" data-vista="productos" class="active">Productos</button>
      <button data-accion="ir" data-vista="categorias">Categorías</button>
      <button data-accion="ir" data-vista="pagos" data-rol="admin">Pagos y cuotas</button>
      <button data-accion="ir" data-vista="usuarios" data-rol="admin">Usuarios</button>
      <button data-accion="ir" data-vista="actividad" data-rol="admin">Actividad</button>
      <button data-accion="ir" data-vista="respaldos" data-rol="admin">Respaldos</button>
      <button data-accion="ir" data-vista="cuenta">Mi cuenta</button>
    </nav>
    <div class="sidebar-foot">
      <div class="sidebar-user" id="usuarioActual"></div>
      <a href="/tienda" target="_blank" rel="noopener" class="btn-link">Ver tienda ↗</a>
      <button class="btn-link" data-accion="logout">Cerrar sesión</button>
    </div>
  </aside>

  <button class="menu-movil" data-accion="menu" aria-label="Menú">☰</button>

  <main class="main">
    <!-- Productos -->
    <section class="vista" data-vista="productos">
      <header class="vista-head">
        <div><h1>Productos</h1><p class="vista-sub" id="productosResumen"></p></div>
        <button class="btn-primary" data-accion="producto-nuevo">+ Nuevo producto</button>
      </header>
      <div class="toolbar">
        <input type="search" id="filtroTexto" placeholder="Buscar por nombre, SKU o marca…" autocomplete="off">
        <select id="filtroCategoria"><option value="">Todas las categorías</option></select>
        <select id="filtroEstado">
          <option value="">Todos</option>
          <option value="activos">Publicados</option>
          <option value="inactivos">Ocultos</option>
          <option value="sin-stock">Sin stock</option>
          <option value="revisar">Con notas para revisar</option>
        </select>
      </div>
      <div class="tabla-wrap">
        <table class="tabla tabla-productos">
          <thead><tr><th></th><th>Producto</th><th>Precio</th><th>Stock</th><th>Publicado</th><th>Destacado</th><th></th></tr></thead>
          <tbody id="tablaProductos"></tbody>
        </table>
      </div>
    </section>

    <!-- Categorías -->
    <section class="vista" data-vista="categorias" hidden>
      <header class="vista-head">
        <div><h1>Categorías</h1><p class="vista-sub">El orden de esta lista es el de la tienda. La descripción se usa para Google.</p></div>
        <div class="vista-acciones">
          <button class="btn-outline" data-accion="categoria-nueva">+ Agregar</button>
          <button class="btn-primary" data-accion="categorias-guardar">Guardar cambios</button>
        </div>
      </header>
      <div id="listaCategorias" class="lista-categorias"></div>
    </section>

    <!-- Pagos y cuotas -->
    <section class="vista" data-vista="pagos" hidden>
      <header class="vista-head">
        <div><h1>Pagos y cuotas</h1><p class="vista-sub">Descuentos por medio de pago, Mercado Pago y planes de cuotas. Cada producto puede usar estos valores o tener los suyos.</p></div>
        <button class="btn-primary" data-accion="pagos-guardar">Guardar configuración</button>
      </header>
      <div id="vistaPagos"></div>
    </section>

    <!-- Usuarios -->
    <section class="vista" data-vista="usuarios" hidden>
      <header class="vista-head">
        <div><h1>Usuarios</h1><p class="vista-sub">Los administradores gestionan todo. Los editores solo productos y categorías.</p></div>
      </header>
      <form class="card form-invitar" data-form="invitar">
        <h2>Invitar usuario</h2>
        <div class="fila">
          <label>Nombre<input name="nombre" required maxlength="80"></label>
          <label>Email<input name="email" type="email" required></label>
          <label>Rol
            <select name="rol"><option value="editor">Editor</option><option value="admin">Administrador</option></select>
          </label>
          <button class="btn-primary" type="submit">Generar invitación</button>
        </div>
        <div class="link-generado" id="linkInvitacion" hidden></div>
      </form>
      <div class="tabla-wrap">
        <table class="tabla">
          <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>2FA</th><th>Último acceso</th><th></th></tr></thead>
          <tbody id="tablaUsuarios"></tbody>
        </table>
      </div>
    </section>

    <!-- Actividad -->
    <section class="vista" data-vista="actividad" hidden>
      <header class="vista-head">
        <div><h1>Actividad</h1><p class="vista-sub">Registro de accesos y cambios (últimos 300 eventos).</p></div>
        <button class="btn-outline" data-accion="actividad-recargar">Actualizar</button>
      </header>
      <div class="tabla-wrap">
        <table class="tabla tabla-compacta">
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr></thead>
          <tbody id="tablaActividad"></tbody>
        </table>
      </div>
    </section>

    <!-- Respaldos -->
    <section class="vista" data-vista="respaldos" hidden>
      <header class="vista-head">
        <div><h1>Respaldos</h1><p class="vista-sub">Antes de cada cambio se guarda una copia del catálogo (se conservan las últimas 40).</p></div>
        <div class="vista-acciones">
          <button class="btn-outline" data-accion="exportar">Exportar catálogo</button>
          <button class="btn-outline" data-accion="importar">Importar JSON</button>
        </div>
      </header>
      <div class="tabla-wrap">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Productos</th><th>Tamaño</th><th></th></tr></thead>
          <tbody id="tablaRespaldos"></tbody>
        </table>
      </div>
    </section>

    <!-- Mi cuenta -->
    <section class="vista" data-vista="cuenta" hidden>
      <header class="vista-head"><div><h1>Mi cuenta</h1><p class="vista-sub" id="cuentaResumen"></p></div></header>
      <div class="grid-2">
        <form class="card" data-form="cambiar-password">
          <h2>Cambiar contraseña</h2>
          <label>Contraseña actual<input name="actual" type="password" required autocomplete="current-password"></label>
          <label>Nueva contraseña<input name="nueva" type="password" required autocomplete="new-password" minlength="12"></label>
          <label>Repetir nueva contraseña<input name="nueva2" type="password" required autocomplete="new-password" minlength="12"></label>
          <p class="hint">Al cambiarla se cierran tus sesiones abiertas en otros dispositivos.</p>
          <button class="btn-primary" type="submit">Actualizar contraseña</button>
        </form>
        <form class="card" data-form="nuevos-codigos">
          <h2>Verificación en dos pasos</h2>
          <p class="hint" id="estado2fa"></p>
          <label>Confirmá tu contraseña<input name="password" type="password" required autocomplete="current-password"></label>
          <button class="btn-outline" type="submit">Generar nuevos códigos de recuperación</button>
        </form>
      </div>
    </section>
  </main>
</div>

<!-- ══ EDITOR DE PRODUCTO ══ -->
<div class="drawer-overlay" id="editorOverlay" data-accion="editor-cerrar" hidden></div>
<form class="drawer" id="editor" data-form="producto" hidden novalidate>
  <header class="drawer-head">
    <div>
      <div class="drawer-tag" id="editorTag">Nuevo producto</div>
      <h2 id="editorTitulo">Producto</h2>
    </div>
    <div class="drawer-head-acciones">
      <a class="btn-link" id="editorVer" target="_blank" rel="noopener" hidden>Ver en la tienda ↗</a>
      <button type="button" class="btn-outline" data-accion="editor-cerrar">Cancelar</button>
      <button type="submit" class="btn-primary">Guardar</button>
    </div>
  </header>
  <div class="drawer-body" id="editorCuerpo"></div>
</form>

<div class="toast" id="toast" role="status" aria-live="polite"></div>
<input type="file" id="inputImportar" accept="application/json,.json" hidden>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js" integrity="sha384-3zSEDfvllQohrq0PHL1fOXJuC/jSOO34H46t6UQfobFOmxE5BpjjaIJY5F2/bMnU" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
<script src="/js/precios.js?v=<?= filemtime(__DIR__ . '/../js/precios.js') ?>"></script>
<script src="<?= $v('app.js') ?>"></script>
</body>
</html>
