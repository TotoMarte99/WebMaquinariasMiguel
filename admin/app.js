// ════════════════════════════════════════════════════════════
//  PANEL DE ADMINISTRACIÓN — Maquinarias Miguel
//  Toda la seguridad se valida en el servidor (/api/admin.php).
//  Sin scripts ni estilos inline (la CSP los bloquea).
// ════════════════════════════════════════════════════════════

const API = '/api/admin.php';

const estado = { csrf: '', usuario: null, requerir2fa: true };
let catalogo = null;
let pagosConfig = null; // configuración de pagos (para el editor de productos)
let version = '';
let invitacionToken = '';
let codigosPendientes = [];
let pasoTrasCodigos = 'app';

// ── HELPERS ──
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const formatPrecio = n => fmtARS.format(Math.round(Number(n) || 0));
const formatFecha = ts => ts ? new Date(ts * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function slugify(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function toast(msg, tipo = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${tipo}`;
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), tipo === 'error' ? 6000 : 3000);
}

function descargar(nombre, contenido, tipo = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); toast('Copiado al portapapeles'); }
  catch { toast('No se pudo copiar. Seleccioná el texto a mano.', 'error'); }
}

function datosForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ── API ──
class ErrorApi extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

async function api(accion, datos = null, { metodo = datos === null ? 'GET' : 'POST', formData = null, query = '' } = {}) {
  const opciones = { method: formData ? 'POST' : metodo, credentials: 'same-origin', headers: { 'X-CSRF-Token': estado.csrf } };
  if (formData) opciones.body = formData;
  else if (opciones.method === 'POST') {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(datos || {});
  }
  const res = await fetch(`${API}?accion=${encodeURIComponent(accion)}${query}`, opciones);
  const data = await res.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
  if (data.csrf) estado.csrf = data.csrf;
  if (!res.ok) {
    if (res.status === 401 && estado.usuario && !['login', 'login-2fa', 'cuenta-password', '2fa-nuevos-codigos'].includes(accion)) {
      estado.usuario = null;
      mostrarAuth('login', 'Tu sesión venció. Volvé a ingresar.');
    }
    throw new ErrorApi(data.error || 'Error inesperado.', res.status);
  }
  return data;
}

async function conBoton(boton, fn) {
  if (boton?.disabled) return;
  const texto = boton?.textContent;
  if (boton) { boton.disabled = true; boton.textContent = 'Procesando…'; }
  try { return await fn(); }
  catch (err) { toast(err.message, 'error'); throw err; }
  finally { if (boton) { boton.disabled = false; boton.textContent = texto; } }
}

// ════════════════════════════════════════════════════════════
//  ACCESO
// ════════════════════════════════════════════════════════════
function mostrarAuth(paso, error = '') {
  $('#vistaApp').hidden = true;
  $('#vistaAuth').hidden = false;
  $$('.auth-step').forEach(el => { el.hidden = el.dataset.paso !== paso; });
  const box = $('#authError');
  box.textContent = error;
  box.hidden = !error;
  const form = $(`.auth-step[data-paso="${paso}"]`);
  if (form?.reset && paso !== 'codigos') form.reset();
  setTimeout(() => form?.querySelector('input')?.focus(), 50);
  if (paso === 'configurar_2fa') iniciar2fa();
}

function errorAuth(msg) {
  const box = $('#authError');
  box.textContent = msg;
  box.hidden = false;
}

async function iniciar() {
  const token = new URLSearchParams(location.hash.slice(1)).get('invitacion');
  let data;
  try {
    data = await api('estado');
  } catch (err) {
    mostrarAuth('login', err.message);
    return;
  }
  aplicarEstado(data);

  if (token) {
    history.replaceState(null, '', location.pathname);
    invitacionToken = token;
    try {
      const inv = await api('invitacion-info', { token });
      $('#invTitulo').textContent = inv.tipo === 'alta' ? 'Bienvenido/a al panel' : 'Restablecer contraseña';
      $('#invDesc').textContent = `${inv.nombre} (${inv.email}): elegí tu contraseña para acceder.`;
      mostrarAuth('invitacion');
    } catch (err) {
      mostrarAuth(data.instalado ? 'login' : 'instalar', err.message);
    }
    return;
  }
  enrutarSegunEstado(data);
}

function aplicarEstado(data) {
  estado.csrf = data.csrf || estado.csrf;
  estado.usuario = data.usuario;
  estado.requerir2fa = data.requerir_2fa;
}

function enrutarSegunEstado(data) {
  if (!data.instalado) return mostrarAuth('instalar');
  const u = data.usuario;
  if (!u) return mostrarAuth('login');
  if (u.estado === '2fa') return mostrarAuth('2fa');
  if (u.estado === 'configurar_2fa') return mostrarAuth('configurar_2fa');
  abrirApp();
}

async function iniciar2fa() {
  const cont = $('#qr2fa');
  cont.innerHTML = '';
  try {
    const { uri, secreto } = await api('2fa-iniciar', {});
    $('#secreto2fa').textContent = secreto;
    if (window.QRCode) new QRCode(cont, { text: uri, width: 200, height: 200, colorDark: '#0a0a0a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    else cont.textContent = 'No se pudo generar el QR: usá la clave manual.';
  } catch (err) {
    errorAuth(err.message);
  }
}

function mostrarCodigos(codigos, siguiente) {
  codigosPendientes = codigos;
  pasoTrasCodigos = siguiente;
  $('#listaCodigos').innerHTML = codigos.map(c => `<li>${esc(c)}</li>`).join('');
  $('#vistaApp').hidden = true;
  $('#vistaAuth').hidden = false;
  $$('.auth-step').forEach(el => { el.hidden = el.dataset.paso !== 'codigos'; });
  $('#authError').hidden = true;
}

const formularios = {
  async instalar(form, d, boton) {
    if (d.password !== d.password2) return errorAuth('Las contraseñas no coinciden.');
    await conBotonAuth(boton, async () => {
      await api('instalar', { token: d.token.trim(), nombre: d.nombre, email: d.email, password: d.password });
      const r = await api('login', { email: d.email, password: d.password });
      enrutarSegunEstado({ instalado: true, usuario: { estado: r.estado } });
    });
  },

  async login(form, d, boton) {
    await conBotonAuth(boton, async () => {
      const r = await api('login', { email: d.email, password: d.password });
      if (r.estado === 'ok') {
        aplicarEstado(await api('estado'));
        abrirApp();
      } else {
        mostrarAuth(r.estado);
      }
    });
  },

  async login2fa(form, d, boton) {
    await conBotonAuth(boton, async () => {
      const data = await api('login-2fa', { codigo: d.codigo });
      aplicarEstado(data);
      if (data.usuario && data.usuario.codigos_restantes <= 2) toast(`Te quedan ${data.usuario.codigos_restantes} códigos de recuperación. Generá nuevos en "Mi cuenta".`, 'error');
      abrirApp();
    }, () => mostrarAuth('login', 'Demasiados intentos. Volvé a ingresar.'));
  },

  async confirmar2fa(form, d, boton) {
    await conBotonAuth(boton, async () => {
      const data = await api('2fa-confirmar', { codigo: d.codigo });
      aplicarEstado(data);
      mostrarCodigos(data.codigos, 'app');
    });
  },

  async invitacion(form, d, boton) {
    if (d.password !== d.password2) return errorAuth('Las contraseñas no coinciden.');
    await conBotonAuth(boton, async () => {
      await api('invitacion-aceptar', { token: invitacionToken, password: d.password });
      invitacionToken = '';
      mostrarAuth('login');
      $('#authError').hidden = true;
      toast('Contraseña guardada. Ya podés iniciar sesión.');
    });
  },

  async producto(form, d, boton) { await guardarProducto(boton); },

  async invitar(form, d, boton) {
    await conBoton(boton, async () => {
      const r = await api('usuario-invitar', d);
      mostrarLink(r.link, r.horas, d.email, 'alta');
      form.reset();
      cargarUsuarios();
    });
  },

  async 'cambiar-password'(form, d, boton) {
    if (d.nueva !== d.nueva2) return toast('Las contraseñas nuevas no coinciden.', 'error');
    await conBoton(boton, async () => {
      await api('cuenta-password', { actual: d.actual, nueva: d.nueva });
      form.reset();
      toast('Contraseña actualizada. Se cerraron tus otras sesiones.');
    });
  },

  async 'mp-token'(form, d, boton) {
    if (!d.token.trim()) return toast('Pegá el access token.', 'error');
    await conBoton(boton, async () => {
      await api('mp-token', { token: d.token.trim(), password: d.password });
      toast('Access token guardado');
      cargarPagos();
    });
  },

  async 'nuevos-codigos'(form, d, boton) {
    if (!confirm('Los códigos de recuperación anteriores dejarán de funcionar. ¿Continuar?')) return;
    await conBoton(boton, async () => {
      const r = await api('2fa-nuevos-codigos', { password: d.password });
      form.reset();
      mostrarCodigos(r.codigos, 'cuenta');
    });
  },
};

async function conBotonAuth(boton, fn, onFatal) {
  $('#authError').hidden = true;
  boton.disabled = true;
  try {
    await fn();
  } catch (err) {
    if (err.status === 401 && onFatal && /Volvé a iniciar/.test(err.message)) onFatal();
    else errorAuth(err.message);
  } finally {
    boton.disabled = false;
  }
}

// ════════════════════════════════════════════════════════════
//  APP
// ════════════════════════════════════════════════════════════
let vistaActual = 'productos';

async function abrirApp() {
  const u = estado.usuario;
  $('#vistaAuth').hidden = true;
  $('#vistaApp').hidden = false;
  $('#usuarioActual').innerHTML = `<strong>${esc(u.nombre)}</strong><span>${u.rol === 'admin' ? 'Administrador' : 'Editor'}</span>`;
  $$('[data-rol="admin"]').forEach(el => { el.hidden = u.rol !== 'admin'; });
  await cargarCatalogo();
  ir(vistaActual);
}

function ir(vista) {
  if (estado.usuario.rol !== 'admin' && ['pagos', 'usuarios', 'actividad', 'respaldos'].includes(vista)) vista = 'productos';
  vistaActual = vista;
  $$('.vista').forEach(el => { el.hidden = el.dataset.vista !== vista; });
  $$('.sidebar-nav button').forEach(b => b.classList.toggle('active', b.dataset.vista === vista));
  $('#sidebar').classList.remove('open');
  ({
    productos: renderProductos,
    categorias: renderCategorias,
    pagos: cargarPagos,
    usuarios: cargarUsuarios,
    actividad: cargarActividad,
    respaldos: cargarRespaldos,
    cuenta: renderCuenta,
  })[vista]?.();
}

async function cargarCatalogo() {
  const data = await api('catalogo');
  catalogo = data.catalogo;
  pagosConfig = data.pagos;
  version = data.version;
  const sel = $('#filtroCategoria');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    catalogo.categorias.map(c => `<option value="${esc(c.id)}">${esc(c.nombre)}</option>`).join('');
  sel.value = actual;
}

function manejarConflicto(err) {
  if (err.status === 422 && /modificado por otra persona/.test(err.message)) {
    cargarCatalogo().then(() => ir(vistaActual));
  }
}

const nombreCategoria = id => catalogo.categorias.find(c => c.id === id)?.nombre || id;
const imagenPrincipal = p => (p.imagenes || []).find(i => i.principal)?.url || p.imagenes?.[0]?.url || '';

// ── PRODUCTOS ──
function renderProductos() {
  const texto = slugify($('#filtroTexto').value).replace(/-/g, ' ');
  const cat = $('#filtroCategoria').value;
  const est = $('#filtroEstado').value;

  const lista = catalogo.productos.filter(p => {
    if (cat && p.categoria !== cat) return false;
    if (est === 'activos' && p.activo === false) return false;
    if (est === 'inactivos' && p.activo !== false) return false;
    if (est === 'sin-stock' && (p.stock || 0) > 0) return false;
    if (est === 'revisar' && !(p.revisar || []).length) return false;
    if (texto) {
      const hay = slugify([p.nombre, p.sku, p.marca, p.modelo].join(' ')).replace(/-/g, ' ');
      if (!texto.split(' ').every(t => hay.includes(t))) return false;
    }
    return true;
  });

  const activos = catalogo.productos.filter(p => p.activo !== false).length;
  $('#productosResumen').textContent = `${catalogo.productos.length} productos · ${activos} publicados · mostrando ${lista.length}`;

  $('#tablaProductos').innerHTML = lista.length ? lista.map(p => `
    <tr data-id="${esc(p.id)}" class="${p.activo === false ? 'inactivo' : ''}">
      <td class="col-thumb">${imagenPrincipal(p) ? `<img src="${esc(imagenPrincipal(p))}" alt="" loading="lazy">` : '<span class="sin-img">—</span>'}</td>
      <td class="col-nombre">
        <button type="button" class="link-nombre" data-accion="producto-editar">${esc(p.nombre)}</button>
        <div class="meta">${esc(nombreCategoria(p.categoria))} · SKU ${esc(p.sku)}${(p.variantes || []).length ? ` · ${p.variantes.length} variantes` : ''}${(p.revisar || []).length ? ` · <span class="badge-revisar" title="${esc(p.revisar.join('\n'))}">${p.revisar.length} para revisar</span>` : ''}</div>
      </td>
      <td><input class="input-rapido" type="number" min="0" step="0.01" value="${esc(p.precio)}" data-campo="precio" aria-label="Precio"></td>
      <td><input class="input-rapido input-stock ${(p.stock || 0) <= 0 ? 'sin-stock' : ''}" type="number" min="0" step="1" value="${esc(p.stock ?? 0)}" data-campo="stock" aria-label="Stock"></td>
      <td><label class="switch"><input type="checkbox" data-campo="activo" ${p.activo !== false ? 'checked' : ''}><span></span></label></td>
      <td><label class="switch"><input type="checkbox" data-campo="destacado" ${p.destacado ? 'checked' : ''}><span></span></label></td>
      <td class="col-acciones">
        <button type="button" class="btn-icono" data-accion="producto-editar" title="Editar">✎</button>
        <a class="btn-icono" href="/producto/${encodeURIComponent(p.slug)}" target="_blank" rel="noopener" title="Ver en la tienda">↗</a>
        <button type="button" class="btn-icono peligro" data-accion="producto-eliminar" title="Eliminar">✕</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="7" class="vacio">No hay productos con esos filtros.</td></tr>';
}

async function cambioRapido(input) {
  const fila = input.closest('tr');
  const id = fila.dataset.id;
  const campo = input.dataset.campo;
  const valor = input.type === 'checkbox' ? input.checked : input.value;
  input.disabled = true;
  try {
    const r = await api('producto-rapido', { id, cambios: { [campo]: valor }, version });
    version = r.version;
    const i = catalogo.productos.findIndex(p => p.id === id);
    catalogo.productos[i] = r.producto;
    fila.classList.toggle('inactivo', r.producto.activo === false);
    if (campo === 'stock') input.classList.toggle('sin-stock', r.producto.stock <= 0);
    input.classList.add('guardado');
    setTimeout(() => input.classList.remove('guardado'), 1200);
  } catch (err) {
    toast(err.message, 'error');
    manejarConflicto(err);
    const p = catalogo.productos.find(x => x.id === id);
    if (input.type === 'checkbox') input.checked = campo === 'activo' ? p.activo !== false : !!p[campo];
    else input.value = p[campo];
  } finally {
    input.disabled = false;
  }
}

async function eliminarProducto(id) {
  const p = catalogo.productos.find(x => x.id === id);
  if (!confirm(`¿Eliminar "${p.nombre}"?\n\nSe guarda un respaldo automático, pero el producto deja de verse en la tienda. Si solo querés ocultarlo, desactivá "Publicado".`)) return;
  try {
    const r = await api('producto-eliminar', { id, version });
    version = r.version;
    catalogo.productos = catalogo.productos.filter(x => x.id !== id);
    renderProductos();
    toast('Producto eliminado');
  } catch (err) {
    toast(err.message, 'error');
    manejarConflicto(err);
  }
}

// ── EDITOR DE PRODUCTO ──
const ed = { p: null, idOriginal: null, slugManual: false, sucio: false };

function productoVacio() {
  return {
    id: '', sku: '', slug: '', nombre: '', marca: '', modelo: '', categoria: catalogo.categorias[0]?.id || '',
    descripcion_corta: '', descripcion: '', caracteristicas: [], especificaciones: {}, precio: '', precio_anterior: null,
    stock: 0, condicion: 'nuevo', garantia: '', imagenes: [], variantes: [], etiquetas: [], destacado: false, activo: false,
    seo: { titulo: '', descripcion: '' }, revisar: [],
    pagos: { planes: 'defecto', descuento_efectivo: null, descuento_transferencia: null },
  };
}

function abrirEditor(id) {
  const original = id ? catalogo.productos.find(p => p.id === id) : null;
  const p = structuredClone(original || productoVacio());
  p.especificacionesLista = Object.entries(p.especificaciones || {});
  p.atributoVariante = Object.keys(p.variantes?.[0]?.atributos || {})[0] || 'color';
  p.seo = p.seo || { titulo: '', descripcion: '' };
  p.pagos = { planes: 'defecto', descuento_efectivo: null, descuento_transferencia: null, ...(p.pagos || {}) };
  ed.p = p;
  ed.idOriginal = original ? original.id : null;
  ed.slugManual = !!original;
  ed.sucio = false;

  $('#editorTag').textContent = original ? 'Editar producto' : 'Nuevo producto';
  $('#editorTitulo').textContent = original ? original.nombre : 'Nuevo producto';
  const ver = $('#editorVer');
  ver.hidden = !original;
  if (original) ver.href = `/producto/${encodeURIComponent(original.slug)}`;
  renderEditor();
  $('#editor').hidden = false;
  $('#editorOverlay').hidden = false;
  document.body.classList.add('no-scroll');
  $('#editorCuerpo').scrollTop = 0;
  setTimeout(() => $('#editor [data-campo="nombre"]')?.focus(), 50);
}

function cerrarEditor(forzar) {
  if (!forzar && ed.sucio && !confirm('Hay cambios sin guardar. ¿Descartarlos?')) return;
  $('#editor').hidden = true;
  $('#editorOverlay').hidden = true;
  document.body.classList.remove('no-scroll');
  ed.p = null;
}

function campo(etiqueta, path, { tipo = 'text', ayuda = '', max = 0, attrs = '', full = false, valor } = {}) {
  const v = valor ?? path.split('.').reduce((o, k) => o?.[k], ed.p) ?? '';
  const contador = max ? `<span class="contador" data-contador="${path}">${String(v).length}/${max}</span>` : '';
  const input = tipo === 'textarea'
    ? `<textarea data-campo="${path}" ${max ? `maxlength="${max * 2}"` : ''} ${attrs}>${esc(v)}</textarea>`
    : `<input type="${tipo}" data-campo="${path}" value="${esc(v)}" ${attrs}>`;
  return `<label class="${full ? 'full' : ''}"><span class="label-texto">${etiqueta}${contador}</span>${input}${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
}

function renderEditor() {
  const p = ed.p;
  const opcionesCategoria = catalogo.categorias.map(c => `<option value="${esc(c.id)}" ${p.categoria === c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('');

  $('#editorCuerpo').innerHTML = `
    <div class="ed-grid">
      <div class="ed-col">
        <fieldset class="card">
          <legend>Información principal</legend>
          <div class="campos">
            ${campo('Nombre *', 'nombre', { full: true, attrs: 'required maxlength="150"' })}
            ${campo('URL del producto', 'slug', { full: true, ayuda: `maquinariasmiguel.com/producto/<strong data-preview-slug>${esc(p.slug || slugify(p.nombre))}</strong>`, attrs: 'pattern="[a-z0-9-]+"' })}
            ${campo('SKU *', 'sku', { attrs: 'required maxlength="64"' })}
            <label><span class="label-texto">Categoría *</span><select data-campo="categoria">${opcionesCategoria}</select></label>
            ${campo('Marca', 'marca', { attrs: 'maxlength="80"' })}
            ${campo('Modelo', 'modelo', { attrs: 'maxlength="80"' })}
            <label><span class="label-texto">Condición</span>
              <select data-campo="condicion">
                ${['nuevo', 'usado', 'reacondicionado'].map(c => `<option value="${c}" ${p.condicion === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
              </select>
            </label>
            ${campo('Garantía', 'garantia', { attrs: 'maxlength="120" placeholder="Ej: 1 año"' })}
          </div>
        </fieldset>

        <fieldset class="card">
          <legend>Descripción</legend>
          <div class="campos">
            ${campo('Descripción corta', 'descripcion_corta', { tipo: 'textarea', max: 300, full: true, ayuda: 'Se muestra en la ficha debajo del precio.', attrs: 'rows="2"' })}
            ${campo('Descripción completa', 'descripcion', { tipo: 'textarea', full: true, ayuda: 'Separá párrafos con una línea en blanco.', attrs: 'rows="8"' })}
          </div>
        </fieldset>

        <fieldset class="card">
          <legend>Medios de pago y cuotas</legend>
          <div id="edPagos"></div>
        </fieldset>

        <fieldset class="card">
          <legend>Imágenes</legend>
          <div class="imagenes" id="edImagenes"></div>
          <div class="imagenes-agregar">
            <label class="btn-outline subir">Subir imágenes<input type="file" id="edSubir" accept="image/jpeg,image/png,image/webp" multiple hidden></label>
            <input type="url" id="edUrlImagen" placeholder="…o pegá una URL https de imagen">
            <button type="button" class="btn-outline" data-accion="img-url">Agregar</button>
          </div>
          <small class="hint">JPG, PNG o WebP de hasta 8 MB. Se optimizan automáticamente. La marcada con ★ es la principal.</small>
        </fieldset>

        <fieldset class="card">
          <legend>Variantes <small>(colores, medidas…)</small></legend>
          <div id="edVariantes"></div>
        </fieldset>

        <fieldset class="card">
          <legend>Características</legend>
          <div id="edCaracteristicas"></div>
        </fieldset>

        <fieldset class="card">
          <legend>Especificaciones técnicas</legend>
          <div id="edEspecificaciones"></div>
        </fieldset>
      </div>

      <div class="ed-col ed-lateral">
        <fieldset class="card">
          <legend>Publicación</legend>
          <label class="switch-linea"><span>Publicado en la tienda</span><span class="switch"><input type="checkbox" data-campo="activo" ${p.activo !== false ? 'checked' : ''}><span></span></span></label>
          <label class="switch-linea"><span>Destacado (aparece primero y en la home)</span><span class="switch"><input type="checkbox" data-campo="destacado" ${p.destacado ? 'checked' : ''}><span></span></span></label>
        </fieldset>

        <fieldset class="card">
          <legend>Precio y stock</legend>
          <div class="campos">
            ${campo('Precio (ARS, con IVA) *', 'precio', { tipo: 'number', attrs: 'min="0" step="0.01" required' })}
            ${campo('Precio anterior', 'precio_anterior', { tipo: 'number', attrs: 'min="0" step="0.01"', ayuda: 'Si es mayor al precio, se muestra como oferta.' })}
            ${campo('Stock', 'stock', { tipo: 'number', attrs: 'min="0" step="1"', ayuda: 'Si las variantes tienen stock propio, se usa ese.' })}
          </div>
        </fieldset>

        <fieldset class="card">
          <legend>Google (SEO)</legend>
          <div class="campos">
            ${campo('Título', 'seo.titulo', { max: 60, full: true, ayuda: 'Vacío = nombre del producto.' })}
            ${campo('Descripción', 'seo.descripcion', { tipo: 'textarea', max: 160, full: true, attrs: 'rows="3"', ayuda: 'Vacío = descripción corta.' })}
            ${campo('Etiquetas', 'etiquetas', { full: true, valor: (p.etiquetas || []).join(', '), ayuda: 'Separadas por coma. Ayudan al buscador de la tienda.' })}
          </div>
          <div class="serp" id="edSerp"></div>
        </fieldset>

        <fieldset class="card">
          <legend>Notas internas</legend>
          ${campo('Pendientes a revisar (una por línea)', 'revisar', { tipo: 'textarea', full: true, valor: (p.revisar || []).join('\n'), attrs: 'rows="5"', ayuda: 'No se muestran en la tienda.' })}
        </fieldset>
      </div>
    </div>`;

  renderPagosProducto();
  renderImagenes();
  renderVariantes();
  renderCaracteristicas();
  renderEspecificaciones();
  renderSerp();
}

// Descuento efectivo del producto: el propio si está cargado, si no el general
function descuentoEditor(metodo) {
  const v = ed.p.pagos[`descuento_${metodo}`];
  return v === '' || v === null || v === undefined ? Number(pagosConfig[metodo].descuento) || 0 : Number(v);
}

function renderPagosProducto() {
  const cont = $('#edPagos');
  if (!pagosConfig) { cont.innerHTML = '<p class="vacio">No se pudo cargar la configuración de pagos.</p>'; return; }
  const cfg = ed.p.pagos;
  const modo = Array.isArray(cfg.planes) ? 'elegir' : cfg.planes;
  const generales = pagosConfig.planes.filter(pl => pagosConfig.planes_por_defecto.includes(pl.id)).map(pl => pl.nombre + (pl.activo ? '' : ' (inactivo)'));
  cont.innerHTML = `
    <div class="campos">
      <label><span class="label-texto">Planes de cuotas</span>
        <select data-pagos-modo>
          <option value="defecto" ${modo === 'defecto' ? 'selected' : ''}>Usar los planes generales</option>
          <option value="elegir" ${modo === 'elegir' ? 'selected' : ''}>Elegir planes para este producto</option>
          <option value="ninguno" ${modo === 'ninguno' ? 'selected' : ''}>Sin cuotas (solo 1 pago)</option>
        </select>
        <small>${modo === 'defecto' ? `Generales: ${esc(generales.join(', ') || 'ninguno')}` : modo === 'ninguno' ? 'En Mercado Pago se cobra en 1 pago.' : 'Marcá los planes que aplican.'}</small>
      </label>
      <div class="planes-producto">${modo === 'elegir' ? pagosConfig.planes.map(pl => `
        <label class="check-linea"><input type="checkbox" data-plan-prod="${esc(pl.id)}" ${cfg.planes.includes(pl.id) ? 'checked' : ''}>
          ${esc(pl.nombre)}${pl.activo ? '' : ' <span class="badge">Inactivo</span>'}</label>`).join('') || '<p class="hint">No hay planes creados: agregalos en "Pagos y cuotas".</p>' : ''}</div>
      <label><span class="label-texto">Descuento en efectivo (%)</span>
        <input type="number" data-campo="pagos.descuento_efectivo" value="${esc(cfg.descuento_efectivo ?? '')}" min="0" max="100" step="0.5" placeholder="General: ${pagosConfig.efectivo.descuento}%"></label>
      <label><span class="label-texto">Descuento por transferencia (%)</span>
        <input type="number" data-campo="pagos.descuento_transferencia" value="${esc(cfg.descuento_transferencia ?? '')}" min="0" max="100" step="0.5" placeholder="General: ${pagosConfig.transferencia.descuento}%"></label>
    </div>
    <div id="edCalc"></div>`;
  renderCalcProducto();
}

function renderCalcProducto() {
  const cont = $('#edCalc');
  if (!cont || !pagosConfig) return;
  const precio = Number(ed.p.precio) || 0;
  if (!precio) { cont.innerHTML = '<p class="hint">Cargá el precio para ver la calculadora de costos.</p>'; return; }
  const cfg = ed.p.pagos;
  const ids = cfg.planes === 'ninguno' ? [] : Array.isArray(cfg.planes) ? cfg.planes : pagosConfig.planes_por_defecto;
  const planes = pagosConfig.planes.filter(pl => ids.includes(pl.id));
  cont.innerHTML = `<div class="label-texto calc-titulo">Calculadora para ${formatPrecio(precio)}</div>`
    + tablaCostos(precio, pagosConfig, { descEf: descuentoEditor('efectivo'), descTr: descuentoEditor('transferencia'), planes });
}

function renderImagenes() {
  const imgs = ed.p.imagenes;
  $('#edImagenes').innerHTML = imgs.length ? imgs.map((img, i) => `
    <div class="img-item ${img.principal ? 'principal' : ''}" data-i="${i}">
      <div class="img-thumb"><img src="${esc(img.url)}" alt=""></div>
      <input type="text" data-lista="imagenes" data-i="${i}" data-k="alt" value="${esc(img.alt || '')}" placeholder="Texto alternativo (para Google)">
      <div class="img-acciones">
        <button type="button" data-accion="img-principal" data-i="${i}" title="Marcar como principal">★</button>
        <button type="button" data-accion="img-mover" data-i="${i}" data-dir="-1" title="Mover antes" ${i === 0 ? 'disabled' : ''}>←</button>
        <button type="button" data-accion="img-mover" data-i="${i}" data-dir="1" title="Mover después" ${i === imgs.length - 1 ? 'disabled' : ''}>→</button>
        <button type="button" class="peligro" data-accion="img-quitar" data-i="${i}" title="Quitar">✕</button>
      </div>
    </div>`).join('') : '<p class="vacio">Todavía no hay imágenes.</p>';
}

function renderVariantes() {
  const vars = ed.p.variantes;
  $('#edVariantes').innerHTML = `
    <label class="atributo-variante"><span class="label-texto">Tipo de variante</span>
      <input type="text" data-campo="atributoVariante" value="${esc(ed.p.atributoVariante)}" placeholder="color, medida, grosor…" maxlength="30">
    </label>
    ${vars.length ? `<div class="tabla-mini">
      <div class="tm-head"><span>Nombre</span><span>SKU</span><span>Precio</span><span>Stock</span><span>Disp.</span><span></span></div>
      ${vars.map((v, i) => `
        <div class="tm-fila">
          <input data-lista="variantes" data-i="${i}" data-k="nombre" value="${esc(v.nombre)}" placeholder="Ej: Rojo" maxlength="80">
          <input data-lista="variantes" data-i="${i}" data-k="sku" value="${esc(v.sku)}" maxlength="64">
          <input data-lista="variantes" data-i="${i}" data-k="precio" type="number" min="0" step="0.01" value="${esc(v.precio ?? '')}">
          <input data-lista="variantes" data-i="${i}" data-k="stock" type="number" min="0" step="1" value="${esc(v.stock ?? '')}" placeholder="—">
          <span class="switch"><input type="checkbox" data-lista="variantes" data-i="${i}" data-k="disponible" ${v.disponible !== false ? 'checked' : ''}><span></span></span>
          <button type="button" class="btn-icono peligro" data-accion="var-quitar" data-i="${i}" title="Quitar">✕</button>
        </div>`).join('')}
    </div>` : '<p class="vacio">Sin variantes: el producto se vende tal cual.</p>'}
    <button type="button" class="btn-outline btn-chico" data-accion="var-agregar">+ Agregar variante</button>`;
}

function renderCaracteristicas() {
  const lista = ed.p.caracteristicas;
  $('#edCaracteristicas').innerHTML = lista.map((c, i) => `
    <div class="fila-lista">
      <input data-lista="caracteristicas" data-i="${i}" value="${esc(c)}" maxlength="200">
      <button type="button" class="btn-icono peligro" data-accion="car-quitar" data-i="${i}" title="Quitar">✕</button>
    </div>`).join('') + '<button type="button" class="btn-outline btn-chico" data-accion="car-agregar">+ Agregar característica</button>';
}

function renderEspecificaciones() {
  const lista = ed.p.especificacionesLista;
  $('#edEspecificaciones').innerHTML = lista.map(([k, v], i) => `
    <div class="fila-lista dos">
      <input data-lista="especificacionesLista" data-i="${i}" data-k="0" value="${esc(k)}" placeholder="Ej: Potencia" maxlength="80">
      <input data-lista="especificacionesLista" data-i="${i}" data-k="1" value="${esc(v)}" placeholder="Ej: 71 W" maxlength="300">
      <button type="button" class="btn-icono peligro" data-accion="esp-quitar" data-i="${i}" title="Quitar">✕</button>
    </div>`).join('') + '<button type="button" class="btn-outline btn-chico" data-accion="esp-agregar">+ Agregar especificación</button>';
}

function renderSerp() {
  const p = ed.p;
  const slug = p.slug || slugify(p.nombre);
  const titulo = p.seo.titulo || `${p.nombre || 'Nombre del producto'} | Maquinarias Miguel`;
  const desc = p.seo.descripcion || p.descripcion_corta || p.descripcion || 'Agregá una descripción corta para que Google la muestre.';
  $('#edSerp').innerHTML = `
    <div class="serp-label">Vista previa en Google</div>
    <div class="serp-url">maquinariasmiguel.com › producto › ${esc(slug)}</div>
    <div class="serp-titulo">${esc(titulo.length > 62 ? titulo.slice(0, 60) + '…' : titulo)}</div>
    <div class="serp-desc">${esc(desc.length > 160 ? desc.slice(0, 157) + '…' : desc)}</div>`;
  const prev = $('[data-preview-slug]');
  if (prev) prev.textContent = slug;
}

function setPath(obj, path, valor) {
  const keys = path.split('.');
  const ultimo = keys.pop();
  keys.reduce((o, k) => (o[k] ??= {}), obj)[ultimo] = valor;
}

function enInputEditor(e) {
  const el = e.target;
  if (!ed.p || !el.closest('#editor')) return;
  ed.sucio = true;
  const valor = el.type === 'checkbox' ? el.checked : el.value;

  if (el.dataset.pagosModo !== undefined) {
    const modo = el.value;
    ed.p.pagos.planes = modo === 'elegir' ? [...pagosConfig.planes_por_defecto] : modo;
    renderPagosProducto();
    return;
  }
  if (el.dataset.planProd !== undefined) {
    const id = el.dataset.planProd;
    const lista = ed.p.pagos.planes;
    ed.p.pagos.planes = el.checked ? [...new Set([...lista, id])] : lista.filter(x => x !== id);
    renderCalcProducto();
    return;
  }

  if (el.dataset.campo) {
    const path = el.dataset.campo;
    if (path === 'precio') {
      // Las variantes que tenían el mismo precio que el producto lo siguen
      const anterior = String(ed.p.precio);
      let cambiaron = false;
      ed.p.variantes.forEach(v => { if (String(v.precio) === anterior) { v.precio = valor; cambiaron = true; } });
      if (cambiaron && e.type === 'change') renderVariantes();
      else if (cambiaron) $$('#edVariantes [data-k="precio"]').forEach(i => { i.value = ed.p.variantes[Number(i.dataset.i)].precio; });
    }
    setPath(ed.p, path, valor);
    if (path === 'nombre') {
      $('#editorTitulo').textContent = valor || 'Nuevo producto';
      if (!ed.slugManual) {
        ed.p.slug = slugify(valor);
        const s = $('#editor [data-campo="slug"]');
        if (s) s.value = ed.p.slug;
      }
    }
    if (path === 'slug') {
      ed.slugManual = true;
      if (e.type === 'change') { ed.p.slug = slugify(valor); el.value = ed.p.slug; }
    }
    const contador = $(`[data-contador="${path}"]`);
    if (contador) {
      const max = Number(contador.textContent.split('/')[1]);
      contador.textContent = `${String(valor).length}/${max}`;
      contador.classList.toggle('excedido', String(valor).length > max);
    }
    renderSerp();
    if (path === 'precio' || path.startsWith('pagos.')) renderCalcProducto();
  } else if (el.dataset.lista) {
    const lista = ed.p[el.dataset.lista];
    const i = Number(el.dataset.i);
    if (el.dataset.k === undefined) lista[i] = valor;
    else if (Array.isArray(lista[i])) lista[i][Number(el.dataset.k)] = valor;
    else lista[i][el.dataset.k] = valor;
  }
}

function productoDesdeEditor() {
  const p = structuredClone(ed.p);
  const num = v => (v === '' || v === null || v === undefined) ? null : Number(v);
  const atributo = (p.atributoVariante || 'color').trim().toLowerCase() || 'color';
  return {
    ...p,
    precio: num(p.precio),
    precio_anterior: num(p.precio_anterior),
    stock: num(p.stock) ?? 0,
    etiquetas: String(Array.isArray(p.etiquetas) ? p.etiquetas.join(',') : p.etiquetas).split(',').map(t => t.trim()).filter(Boolean),
    revisar: String(Array.isArray(p.revisar) ? p.revisar.join('\n') : p.revisar).split('\n').map(t => t.trim()).filter(Boolean),
    caracteristicas: p.caracteristicas.map(c => c.trim()).filter(Boolean),
    especificaciones: Object.fromEntries(p.especificacionesLista.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), String(v).trim()])),
    variantes: p.variantes.map(v => ({
      ...v,
      precio: num(v.precio) ?? num(p.precio),
      stock: num(v.stock),
      atributos: { [atributo]: v.nombre },
    })),
    pagos: {
      planes: p.pagos.planes,
      descuento_efectivo: num(p.pagos.descuento_efectivo),
      descuento_transferencia: num(p.pagos.descuento_transferencia),
    },
    especificacionesLista: undefined,
    atributoVariante: undefined,
  };
}

async function guardarProducto(boton) {
  const producto = productoDesdeEditor();
  if (!producto.nombre?.trim()) return toast('El nombre es obligatorio.', 'error');
  if (!producto.sku?.trim()) return toast('El SKU es obligatorio.', 'error');
  if (producto.precio === null) return toast('El precio es obligatorio.', 'error');
  try {
    await conBoton(boton, async () => {
      const r = await api('producto-guardar', { producto, id_original: ed.idOriginal, version });
      version = r.version;
      if (ed.idOriginal) {
        const i = catalogo.productos.findIndex(p => p.id === ed.idOriginal);
        catalogo.productos[i] = r.producto;
      } else {
        catalogo.productos.unshift(r.producto);
      }
      cerrarEditor(true);
      renderProductos();
      toast(`"${r.producto.nombre}" guardado`);
    });
  } catch (err) {
    manejarConflicto(err);
  }
}

async function subirImagenes(archivos) {
  for (const archivo of archivos) {
    const fd = new FormData();
    fd.append('imagen', archivo);
    try {
      toast(`Subiendo ${archivo.name}…`);
      const { url } = await api('imagen-subir', null, { formData: fd });
      ed.p.imagenes.push({ url, alt: ed.p.nombre, principal: !ed.p.imagenes.length });
      ed.sucio = true;
      renderImagenes();
    } catch (err) {
      toast(`${archivo.name}: ${err.message}`, 'error');
    }
  }
  toast('Imágenes listas. Recordá guardar el producto.');
}

// ── CATEGORÍAS ──
let categoriasEdit = [];

function renderCategorias() {
  categoriasEdit = structuredClone(catalogo.categorias);
  pintarCategorias();
}

function pintarCategorias() {
  const cuenta = id => catalogo.productos.filter(p => p.categoria === id).length;
  $('#listaCategorias').innerHTML = categoriasEdit.map((c, i) => `
    <div class="card cat-item">
      <div class="cat-orden">
        <button type="button" data-accion="cat-mover" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} title="Subir">↑</button>
        <button type="button" data-accion="cat-mover" data-i="${i}" data-dir="1" ${i === categoriasEdit.length - 1 ? 'disabled' : ''} title="Bajar">↓</button>
      </div>
      <div class="cat-campos">
        <label><span class="label-texto">Nombre</span><input data-cat="${i}" data-k="nombre" value="${esc(c.nombre)}" maxlength="60"></label>
        <label><span class="label-texto">URL</span><input data-cat="${i}" data-k="id" value="${esc(c.id)}" ${c.nuevo ? '' : 'readonly title="La URL de una categoría existente no se cambia para no perder posicionamiento"'}></label>
        <label class="full"><span class="label-texto">Descripción para Google</span><textarea data-cat="${i}" data-k="descripcion" rows="2" maxlength="400" placeholder="Ej: Comprá hilos de poliéster para overlock y recta en Rosario…">${esc(c.descripcion || '')}</textarea></label>
      </div>
      <div class="cat-info">
        <span>${c.nuevo ? 'Nueva' : `${cuenta(c.id)} productos`}</span>
        <button type="button" class="btn-icono peligro" data-accion="cat-quitar" data-i="${i}" ${!c.nuevo && cuenta(c.id) ? 'disabled title="Tiene productos"' : 'title="Eliminar"'}>✕</button>
      </div>
    </div>`).join('');
}

// ── PAGOS Y CUOTAS ──
let pagosEdit = null;
let pagosVersion = '';
let pagosInfo = {};
let simPrecio = 100000;

async function cargarPagos() {
  try {
    const data = await api('pagos');
    pagosEdit = data.pagos;
    pagosVersion = data.version;
    pagosInfo = { token: data.mp_token, webhook: data.webhook };
    renderPagos();
    cargarPagosMP();
  } catch (err) { toast(err.message, 'error'); }
}

const pct = v => `${Number(v || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;

function inputPago(etiqueta, path, { tipo = 'number', attrs = '', ayuda = '' } = {}) {
  const v = path.split('.').reduce((o, k) => o?.[k], pagosEdit) ?? '';
  return `<label><span class="label-texto">${etiqueta}</span><input type="${tipo}" data-pago="${path}" value="${esc(v)}" ${attrs}>${ayuda ? `<small>${ayuda}</small>` : ''}</label>`;
}

function switchPago(etiqueta, path) {
  const v = path.split('.').reduce((o, k) => o?.[k], pagosEdit);
  return `<label class="switch-linea"><span>${etiqueta}</span><span class="switch"><input type="checkbox" data-pago="${path}" ${v ? 'checked' : ''}><span></span></span></label>`;
}

function renderPagos() {
  const p = pagosEdit;
  const tk = pagosInfo.token || {};
  $('#vistaPagos').innerHTML = `
    <div class="grid-2 pagos-grid">
      <div class="card">
        <h2>Efectivo y transferencia</h2>
        ${switchPago('Aceptar efectivo en el local', 'efectivo.activo')}
        ${switchPago('Efectivo solo con retiro en el local', 'efectivo.solo_retiro')}
        <div class="campos">${inputPago('Descuento en efectivo (%)', 'efectivo.descuento', { attrs: 'min="0" max="100" step="0.5"' })}</div>
        <hr>
        ${switchPago('Aceptar transferencia bancaria', 'transferencia.activo')}
        <div class="campos">
          ${inputPago('Descuento por transferencia (%)', 'transferencia.descuento', { attrs: 'min="0" max="100" step="0.5"' })}
          ${inputPago('Titular', 'transferencia.titular', { tipo: 'text', attrs: 'maxlength="100"' })}
          ${inputPago('Banco / billetera', 'transferencia.banco', { tipo: 'text', attrs: 'maxlength="80"' })}
          ${inputPago('CBU / CVU', 'transferencia.cbu', { tipo: 'text', attrs: 'inputmode="numeric" maxlength="22"' })}
          ${inputPago('Alias', 'transferencia.alias', { tipo: 'text', attrs: 'maxlength="40"' })}
          ${inputPago('CUIT', 'transferencia.cuit', { tipo: 'text', attrs: 'maxlength="20"' })}
        </div>
        <hr>
        ${switchPago('Permitir reservar por WhatsApp', 'whatsapp.activo')}
      </div>

      <div class="card">
        <h2>Mercado Pago</h2>
        ${switchPago('Cobrar con Mercado Pago', 'mercadopago.activo')}
        <div class="mp-estado ${tk.configurado ? 'ok' : ''}">
          ${tk.configurado
            ? `Access token cargado (termina en <code>${esc(tk.final)}</code>)${tk.prueba ? ' · <strong>credencial de PRUEBA</strong>' : ''}`
            : 'Todavía no cargaste el access token: Mercado Pago no aparece en la tienda.'}
          <button type="button" class="btn-link" data-accion="mp-probar" ${tk.configurado ? '' : 'hidden'}>Probar conexión</button>
        </div>
        <details class="mp-token" ${tk.configurado ? '' : 'open'}>
          <summary>${tk.configurado ? 'Reemplazar access token' : 'Cargar access token'}</summary>
          <form data-form="mp-token" class="campos">
            <label class="full"><span class="label-texto">Access token de producción</span><input name="token" type="password" autocomplete="off" placeholder="APP_USR-…" spellcheck="false">
              <small>Mercado Pago Developers → Tus integraciones → Credenciales de producción. Se guarda en la carpeta privada del servidor y no se vuelve a mostrar.</small></label>
            <label class="full"><span class="label-texto">Tu contraseña del panel</span><input name="password" type="password" required autocomplete="current-password"></label>
            <div class="full fila-botones"><button class="btn-outline" type="submit">Guardar token</button>${tk.configurado ? '<button type="button" class="btn-link peligro" data-accion="mp-token-quitar">Quitar token</button>' : ''}</div>
          </form>
        </details>
        <div class="campos">
          ${inputPago('Comisión por cobro (%)', 'mercadopago.comision', { attrs: 'min="0" max="100" step="0.01"', ayuda: 'Según el plazo de acreditación que elegiste en Mercado Pago → Costos.' })}
          ${inputPago('Plazo de acreditación', 'mercadopago.plazo', { tipo: 'text', attrs: 'maxlength="40" placeholder="Al instante, 10 días…"' })}
          ${inputPago('IVA sobre costos (%)', 'mercadopago.iva', { attrs: 'min="0" max="100" step="0.5"' })}
          <div>${switchPago('Sumar IVA a comisión y costo de cuotas', 'mercadopago.iva_sobre_costos')}</div>
        </div>
        <hr>
        <div class="campos">
          ${inputPago('Email para avisos de pagos aprobados', 'notificaciones.email', { tipo: 'email', attrs: 'maxlength="190"' })}
          <label><span class="label-texto">URL de notificaciones (webhook)</span>
            <span class="link-fila"><input readonly value="${esc(pagosInfo.webhook)}"><button type="button" class="btn-outline" data-accion="copiar-webhook">Copiar</button></span>
            <small>Pegala en Mercado Pago Developers → tu aplicación → Webhooks → evento "Pagos". También se envía automáticamente en cada cobro.</small></label>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Planes de cuotas</h2>
        <button type="button" class="btn-outline btn-chico" data-accion="plan-agregar">+ Agregar plan</button>
      </div>
      <p class="hint">
        <strong>Sin interés:</strong> el cliente paga el precio de lista en cuotas y vos absorbés el costo (activalo también en tu cuenta de Mercado Pago → Costos → Cuotas sin interés).
        <strong>Con interés:</strong> el interés lo cobra Mercado Pago al cliente; el coeficiente sirve para mostrar un valor estimado de la cuota.
        El <strong>recargo</strong> (opcional) se suma al precio cuando el cliente elige ese plan.
      </p>
      <div class="tabla-wrap">
        <table class="tabla tabla-planes">
          <thead><tr><th>Activo</th><th>Nombre</th><th>Cuotas</th><th>Tipo</th><th>Costo para vos</th><th>Recargo cliente</th><th>Coef.</th><th>TNA / TEA / CFT</th><th>General</th><th></th></tr></thead>
          <tbody>${p.planes.map((pl, i) => `
            <tr>
              <td><label class="switch"><input type="checkbox" data-plan="${i}" data-k="activo" ${pl.activo ? 'checked' : ''}><span></span></label></td>
              <td><input data-plan="${i}" data-k="nombre" value="${esc(pl.nombre)}" maxlength="60"></td>
              <td><input type="number" class="num-chico" data-plan="${i}" data-k="cuotas" value="${esc(pl.cuotas)}" min="2" max="48"></td>
              <td><select data-plan="${i}" data-k="tipo">
                <option value="sin_interes" ${pl.tipo === 'sin_interes' ? 'selected' : ''}>Sin interés</option>
                <option value="con_interes" ${pl.tipo === 'con_interes' ? 'selected' : ''}>Con interés</option></select></td>
              <td><input type="number" class="num-chico" data-plan="${i}" data-k="costo" value="${esc(pl.costo)}" min="0" max="100" step="0.01" ${pl.tipo === 'con_interes' ? 'disabled title="Con interés lo paga el cliente"' : ''}> %</td>
              <td><input type="number" class="num-chico" data-plan="${i}" data-k="recargo" value="${esc(pl.recargo)}" min="0" max="100" step="0.01"> %
                ${pl.tipo === 'sin_interes' ? `<small class="sugerido">Para cubrir costos: ${pct(Precios.recargoSugerido(p, pl))}</small>` : ''}</td>
              <td><input type="number" class="num-chico" data-plan="${i}" data-k="coeficiente" value="${esc(pl.coeficiente)}" min="1" max="10" step="0.0001" ${pl.tipo === 'con_interes' ? '' : 'disabled'}></td>
              <td class="tasas">${pl.tipo === 'con_interes' ? ['tna', 'tea', 'cft'].map(k => `<input type="number" class="num-chico" data-plan="${i}" data-k="${k}" value="${esc(pl[k])}" min="0" step="0.01" title="${k.toUpperCase()}" placeholder="${k.toUpperCase()}">`).join('') : '<span class="meta">—</span>'}</td>
              <td><input type="checkbox" data-plan-defecto="${esc(pl.id)}" ${p.planes_por_defecto.includes(pl.id) ? 'checked' : ''} title="Aplicar a todos los productos que usan los planes generales"></td>
              <td><button type="button" class="btn-icono peligro" data-accion="plan-quitar" data-i="${i}" title="Quitar">✕</button></td>
            </tr>`).join('') || '<tr><td colspan="10" class="vacio">Sin planes de cuotas.</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h2>Simulador de costos</h2>
        <label class="sim-precio"><span class="label-texto">Precio de lista</span><input type="number" id="simPrecio" value="${simPrecio}" min="0" step="100"></label>
      </div>
      <div id="simTabla"></div>
    </div>

    <div class="card">
      <div class="card-head"><h2>Pagos recibidos por Mercado Pago</h2><button type="button" class="btn-link" data-accion="mp-pagos-recargar">Actualizar</button></div>
      <div class="tabla-wrap"><table class="tabla tabla-compacta">
        <thead><tr><th>Fecha</th><th>Pedido</th><th>Estado</th><th>Monto</th><th>Cuotas</th><th>Pagador</th><th>ID de pago</th></tr></thead>
        <tbody id="tablaPagosMP"></tbody>
      </table></div>
    </div>`;
  renderSimulador();
}

/** Tabla: qué paga el cliente y cuánto te queda con cada medio. */
function tablaCostos(precio, pagos, { descEf, descTr, planes }) {
  const filas = [];
  if (pagos.efectivo.activo) filas.push(['Efectivo' + (descEf ? ` (−${pct(descEf)})` : ''), Precios.conDescuento(precio, descEf), null]);
  if (pagos.transferencia.activo) filas.push(['Transferencia' + (descTr ? ` (−${pct(descTr)})` : ''), Precios.conDescuento(precio, descTr), null]);
  const mpFilas = [['Mercado Pago · 1 pago', null, null], ...planes.map(pl => [pl.nombre, null, pl])];
  const referencia = Precios.costos(precio, pagos).neto;

  const html = [
    ...filas.map(([nombre, cobra]) => `<tr><td>${esc(nombre)}</td><td>${formatPrecio(cobra)}</td><td>—</td><td>—</td><td>—</td><td class="neto">${formatPrecio(cobra)}</td><td>—</td></tr>`),
    ...(pagos.mercadopago.activo ? mpFilas.map(([nombre, , pl]) => {
      const c = Precios.costos(precio, pagos, pl);
      const cliente = pl ? Precios.plan(precio, pl) : null;
      const detalleCliente = pl ? `<small>${pl.cuotas} × ${formatPrecio(cliente.cuota)}${pl.tipo === 'con_interes' ? ' (est.)' : ''}</small>` : '';
      const dif = c.neto - referencia;
      return `<tr class="${pl && !pl.activo ? 'inactivo' : ''}">
        <td>${esc(nombre)}${pl && !pl.activo ? ' <span class="badge">Inactivo</span>' : ''}</td>
        <td>${formatPrecio(pl ? cliente.totalCliente : c.cobrado)}${detalleCliente}</td>
        <td>${formatPrecio(c.comision)}</td>
        <td>${c.financiacion ? formatPrecio(c.financiacion) : '—'}</td>
        <td>${pct(c.porcentaje)}</td>
        <td class="neto">${formatPrecio(c.neto)}</td>
        <td class="${dif < 0 ? 'negativo' : dif > 0 ? 'positivo' : ''}">${pl ? (dif ? `${dif > 0 ? '+' : '−'}${formatPrecio(Math.abs(dif))}` : '=') : 'referencia'}</td>
      </tr>`;
    }) : []),
  ].join('');

  return `<div class="tabla-wrap"><table class="tabla tabla-compacta tabla-costos">
    <thead><tr><th>Medio</th><th>Paga el cliente</th><th>Comisión MP${pagos.mercadopago.iva_sobre_costos ? ' + IVA' : ''}</th><th>Costo cuotas</th><th>Costo total</th><th>Te queda</th><th>vs. 1 pago</th></tr></thead>
    <tbody>${html}</tbody></table></div>`;
}

function renderSimulador() {
  const cont = $('#simTabla');
  if (!cont) return;
  cont.innerHTML = tablaCostos(simPrecio, pagosEdit, {
    descEf: Number(pagosEdit.efectivo.descuento) || 0,
    descTr: Number(pagosEdit.transferencia.descuento) || 0,
    planes: pagosEdit.planes,
  }) + '<p class="hint">Los costos son los porcentajes que cargaste arriba. Verificalos en tu cuenta: Mercado Pago → Tu negocio → Costos.</p>';
}

async function cargarPagosMP() {
  try {
    const { pagos } = await api('mp-pagos');
    const estados = { approved: ['Aprobado', 'verde'], pending: ['Pendiente', 'amarillo'], in_process: ['En proceso', 'amarillo'], rejected: ['Rechazado', ''], refunded: ['Devuelto', ''], cancelled: ['Cancelado', ''], charged_back: ['Contracargo', ''] };
    $('#tablaPagosMP').innerHTML = pagos.map(p => {
      const [txt, clase] = estados[p.estado] || [p.estado, ''];
      return `<tr><td>${formatFecha(p.actualizado)}</td><td>${esc(p.pedido)}</td><td><span class="badge ${clase}">${esc(txt)}</span></td>
        <td>${formatPrecio(p.monto)}</td><td>${p.cuotas}</td><td>${esc(p.email)}</td><td class="meta">${esc(p.payment_id)}</td></tr>`;
    }).join('') || '<tr><td colspan="7" class="vacio">Todavía no se registraron pagos. Aparecen acá cuando Mercado Pago avisa al webhook.</td></tr>';
  } catch (err) { toast(err.message, 'error'); }
}

function enInputPagos(e) {
  const el = e.target;
  const valor = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value;
  if (el.dataset.pago) {
    setPath(pagosEdit, el.dataset.pago, valor);
  } else if (el.dataset.plan !== undefined) {
    const pl = pagosEdit.planes[Number(el.dataset.plan)];
    pl[el.dataset.k] = valor;
    if (el.dataset.k === 'nombre' && pl.nuevo) pl.id = slugify(valor);
    if (e.type === 'change' && ['tipo', 'costo'].includes(el.dataset.k)) return renderPagos();
  } else if (el.dataset.planDefecto !== undefined) {
    const id = el.dataset.planDefecto;
    pagosEdit.planes_por_defecto = el.checked
      ? [...new Set([...pagosEdit.planes_por_defecto, id])]
      : pagosEdit.planes_por_defecto.filter(x => x !== id);
  } else if (el.id === 'simPrecio') {
    simPrecio = Number(el.value) || 0;
  } else return;
  renderSimulador();
}

// ── USUARIOS ──
let usuarios = [];

async function cargarUsuarios() {
  try {
    usuarios = (await api('usuarios')).usuarios;
  } catch (err) { return toast(err.message, 'error'); }
  const yo = estado.usuario.id;
  $('#tablaUsuarios').innerHTML = usuarios.map(u => `
    <tr data-id="${u.id}">
      <td><strong>${esc(u.nombre)}</strong>${u.id === yo ? ' <span class="badge">Vos</span>' : ''}<div class="meta">${esc(u.email)}</div></td>
      <td>
        <select data-usuario="rol" ${u.id === yo ? 'disabled' : ''}>
          <option value="editor" ${u.rol === 'editor' ? 'selected' : ''}>Editor</option>
          <option value="admin" ${u.rol === 'admin' ? 'selected' : ''}>Administrador</option>
        </select>
      </td>
      <td>${u.pendiente ? '<span class="badge amarillo">Invitación pendiente</span>'
        : `<label class="switch" title="${u.activo ? 'Activo' : 'Desactivado'}"><input type="checkbox" data-usuario="activo" ${u.activo ? 'checked' : ''} ${u.id === yo ? 'disabled' : ''}><span></span></label>`}</td>
      <td>${u.totp ? '<span class="badge verde">Activo</span>' : '<span class="badge">Sin configurar</span>'}</td>
      <td>${formatFecha(u.ultimo_acceso)}</td>
      <td class="col-acciones">
        ${u.id === yo ? '' : `
          <button type="button" class="btn-link" data-accion="usuario-link">${u.pendiente ? 'Nuevo link de invitación' : 'Restablecer contraseña'}</button>
          ${u.totp ? '<button type="button" class="btn-link" data-accion="usuario-2fa">Resetear 2FA</button>' : ''}
          <button type="button" class="btn-icono peligro" data-accion="usuario-eliminar" title="Eliminar">✕</button>`}
      </td>
    </tr>`).join('');
}

function mostrarLink(link, horas, email, tipo) {
  const box = $('#linkInvitacion');
  const asunto = tipo === 'alta' ? 'Acceso al panel de Maquinarias Miguel' : 'Restablecer tu contraseña del panel';
  const cuerpo = `Hola! Usá este enlace para ${tipo === 'alta' ? 'crear tu contraseña y acceder' : 'elegir una nueva contraseña'} al panel de administración de Maquinarias Miguel:\n\n${link}\n\nEl enlace vence en ${horas} horas y sirve una sola vez.`;
  box.hidden = false;
  box.innerHTML = `
    <p><strong>Enlace generado para ${esc(email)}</strong> · vence en ${horas} h y sirve una sola vez. Se muestra solo ahora.</p>
    <div class="link-fila"><input readonly value="${esc(link)}" data-link-invitacion><button type="button" class="btn-outline" data-accion="copiar-link">Copiar</button></div>
    <a class="btn-link" href="mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}">Enviar por email ↗</a>`;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function accionUsuario(accion, id, extra = {}) {
  try {
    const r = await api(accion, { id, ...extra });
    return r;
  } catch (err) {
    toast(err.message, 'error');
    cargarUsuarios();
    throw err;
  }
}

// ── ACTIVIDAD ──
const ACCIONES = {
  login: 'Inició sesión', login_fallido: 'Intento de acceso fallido', logout: 'Cerró sesión', '2fa_fallido': 'Código 2FA incorrecto',
  instalacion: 'Instalación del panel', '2fa_activado': 'Activó 2FA', '2fa_desactivado': 'Desactivó 2FA', '2fa_reseteado': 'Reseteó 2FA de',
  codigo_recuperacion_usado: 'Usó un código de recuperación', codigos_recuperacion_regenerados: 'Generó nuevos códigos de recuperación',
  password_cambiada: 'Cambió su contraseña', password_reset_generado: 'Generó link de contraseña para', password_restablecida: 'Restableció su contraseña',
  usuario_invitado: 'Invitó a', invitacion_aceptada: 'Aceptó la invitación', usuario_actualizado: 'Modificó usuario', usuario_eliminado: 'Eliminó usuario',
  producto_creado: 'Creó producto', producto_editado: 'Editó producto', producto_eliminado: 'Eliminó producto', categorias_editadas: 'Editó categorías',
  imagen_subida: 'Subió imagen', catalogo_importado: 'Importó catálogo', respaldo_restaurado: 'Restauró respaldo',
};

async function cargarActividad() {
  try {
    const { eventos } = await api('auditoria');
    $('#tablaActividad').innerHTML = eventos.map(e => `
      <tr class="${/fallido/.test(e.accion) ? 'alerta' : ''}">
        <td>${formatFecha(e.tiempo)}</td>
        <td>${esc(e.email || '—')}</td>
        <td>${esc(ACCIONES[e.accion] || e.accion)}</td>
        <td class="detalle">${esc(e.detalle || '')}</td>
        <td class="meta">${esc(e.ip)}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="vacio">Sin actividad.</td></tr>';
  } catch (err) { toast(err.message, 'error'); }
}

// ── RESPALDOS ──
async function cargarRespaldos() {
  try {
    const { respaldos } = await api('respaldos');
    $('#tablaRespaldos').innerHTML = respaldos.map(r => `
      <tr data-archivo="${esc(r.archivo)}">
        <td>${formatFecha(r.fecha)}</td>
        <td>${r.productos}</td>
        <td>${(r.tamano / 1024).toFixed(0)} KB</td>
        <td class="col-acciones">
          <a class="btn-link" href="${API}?accion=respaldo-descargar&archivo=${encodeURIComponent(r.archivo)}">Descargar</a>
          <button type="button" class="btn-link" data-accion="respaldo-restaurar">Restaurar</button>
        </td>
      </tr>`).join('') || '<tr><td colspan="4" class="vacio">Todavía no hay respaldos: se crean al guardar cambios.</td></tr>';
  } catch (err) { toast(err.message, 'error'); }
}

// ── MI CUENTA ──
function renderCuenta() {
  const u = estado.usuario;
  $('#cuentaResumen').textContent = `${u.nombre} · ${u.email} · ${u.rol === 'admin' ? 'Administrador' : 'Editor'}`;
  $('#estado2fa').textContent = u.totp
    ? `Activa. Te quedan ${u.codigos_restantes} códigos de recuperación sin usar.`
    : 'No configurada.';
}

// ════════════════════════════════════════════════════════════
//  EVENTOS (delegación)
// ════════════════════════════════════════════════════════════
const acciones = {
  logout: async () => {
    try { await api('logout', {}); } catch { /* sesión ya vencida */ }
    estado.usuario = null;
    const data = await api('estado').catch(() => null);
    if (data) aplicarEstado(data);
    mostrarAuth('login');
  },
  ir: el => ir(el.dataset.vista),
  menu: () => $('#sidebar').classList.toggle('open'),

  'copiar-codigos': () => copiar(codigosPendientes.join('\n')),
  'descargar-codigos': () => descargar('codigos-recuperacion-maquinarias-miguel.txt',
    `Códigos de recuperación — Panel Maquinarias Miguel\n${estado.usuario?.email || ''}\nCada código sirve una sola vez.\n\n${codigosPendientes.join('\n')}\n`, 'text/plain'),
  'codigos-listos': async () => {
    codigosPendientes = [];
    aplicarEstado(await api('estado'));
    if (pasoTrasCodigos === 'cuenta') vistaActual = 'cuenta';
    abrirApp();
  },

  'producto-nuevo': () => abrirEditor(null),
  'producto-editar': el => abrirEditor(el.closest('tr').dataset.id),
  'producto-eliminar': el => eliminarProducto(el.closest('tr').dataset.id),
  'editor-cerrar': () => cerrarEditor(false),

  'img-principal': el => { ed.p.imagenes.forEach((im, i) => { im.principal = i === Number(el.dataset.i); }); ed.sucio = true; renderImagenes(); },
  'img-quitar': el => { const [q] = ed.p.imagenes.splice(Number(el.dataset.i), 1); if (q.principal && ed.p.imagenes[0]) ed.p.imagenes[0].principal = true; ed.sucio = true; renderImagenes(); },
  'img-mover': el => { mover(ed.p.imagenes, Number(el.dataset.i), Number(el.dataset.dir)); ed.sucio = true; renderImagenes(); },
  'img-url': () => {
    const input = $('#edUrlImagen');
    const url = input.value.trim();
    if (!/^https:\/\/\S+$/.test(url)) return toast('Ingresá una URL que empiece con https://', 'error');
    ed.p.imagenes.push({ url, alt: ed.p.nombre, principal: !ed.p.imagenes.length });
    input.value = '';
    ed.sucio = true;
    renderImagenes();
  },
  'var-agregar': () => {
    const base = (ed.p.sku || slugify(ed.p.nombre).toUpperCase() || 'VAR').toUpperCase();
    ed.p.variantes.push({ nombre: '', sku: `${base}-${ed.p.variantes.length + 1}`, precio: ed.p.precio, stock: null, disponible: true });
    ed.sucio = true;
    renderVariantes();
    $$('#edVariantes .tm-fila').pop()?.querySelector('input')?.focus();
  },
  'var-quitar': el => { ed.p.variantes.splice(Number(el.dataset.i), 1); ed.sucio = true; renderVariantes(); },
  'car-agregar': () => { ed.p.caracteristicas.push(''); renderCaracteristicas(); $$('#edCaracteristicas input').pop()?.focus(); },
  'car-quitar': el => { ed.p.caracteristicas.splice(Number(el.dataset.i), 1); ed.sucio = true; renderCaracteristicas(); },
  'esp-agregar': () => { ed.p.especificacionesLista.push(['', '']); renderEspecificaciones(); $$('#edEspecificaciones input').at(-2)?.focus(); },
  'esp-quitar': el => { ed.p.especificacionesLista.splice(Number(el.dataset.i), 1); ed.sucio = true; renderEspecificaciones(); },

  'categoria-nueva': () => { categoriasEdit.push({ id: '', nombre: '', descripcion: '', nuevo: true }); pintarCategorias(); $$('#listaCategorias input').at(-2)?.focus(); },
  'cat-mover': el => { mover(categoriasEdit, Number(el.dataset.i), Number(el.dataset.dir)); pintarCategorias(); },
  'cat-quitar': el => { categoriasEdit.splice(Number(el.dataset.i), 1); pintarCategorias(); },
  'categorias-guardar': async el => {
    try {
      await conBoton(el, async () => {
        const r = await api('categorias-guardar', { categorias: categoriasEdit.map(({ id, nombre, descripcion }) => ({ id, nombre, descripcion })), version });
        version = r.version;
        catalogo.categorias = r.categorias;
        await cargarCatalogo();
        renderCategorias();
        toast('Categorías guardadas');
      });
    } catch (err) { manejarConflicto(err); }
  },

  'copiar-link': () => copiar($('[data-link-invitacion]').value),
  'usuario-link': async el => {
    const id = Number(el.closest('tr').dataset.id);
    const u = usuarios.find(x => x.id === id);
    if (!confirm(u.pendiente ? `¿Generar un nuevo link de invitación para ${u.email}? El anterior deja de funcionar.`
      : `¿Generar un link para que ${u.email} elija una nueva contraseña? Se cerrarán sus sesiones abiertas.`)) return;
    const r = await accionUsuario('usuario-reset-password', id);
    mostrarLink(r.link, r.horas, u.email, u.pendiente ? 'alta' : 'reset');
  },
  'usuario-2fa': async el => {
    const id = Number(el.closest('tr').dataset.id);
    const u = usuarios.find(x => x.id === id);
    if (!confirm(`¿Resetear la verificación en dos pasos de ${u.email}? Va a tener que configurarla de nuevo al ingresar.`)) return;
    await accionUsuario('usuario-reset-2fa', id);
    toast('2FA reseteado');
    cargarUsuarios();
  },
  'usuario-eliminar': async el => {
    const id = Number(el.closest('tr').dataset.id);
    const u = usuarios.find(x => x.id === id);
    if (!confirm(`¿Eliminar definitivamente a ${u.nombre} (${u.email})? Si solo querés quitarle el acceso, desactivalo.`)) return;
    await accionUsuario('usuario-eliminar', id);
    toast('Usuario eliminado');
    cargarUsuarios();
  },

  'actividad-recargar': () => cargarActividad(),

  'pagos-guardar': async el => {
    try {
      await conBoton(el, async () => {
        const r = await api('pagos-guardar', { pagos: pagosEdit, version: pagosVersion });
        pagosVersion = r.version;
        pagosEdit = r.pagos;
        pagosConfig = r.pagos;
        renderPagos();
        toast('Configuración de pagos guardada');
      });
    } catch (err) {
      if (/otra persona/.test(err.message)) cargarPagos();
    }
  },
  'plan-agregar': () => {
    pagosEdit.planes.push({ id: '', nombre: '', cuotas: 3, tipo: 'sin_interes', costo: 0, recargo: 0, coeficiente: 1, tna: 0, tea: 0, cft: 0, activo: true, nuevo: true });
    renderPagos();
    $$('[data-plan][data-k="nombre"]').pop()?.focus();
  },
  'plan-quitar': el => {
    const [pl] = pagosEdit.planes.splice(Number(el.dataset.i), 1);
    pagosEdit.planes_por_defecto = pagosEdit.planes_por_defecto.filter(id => id !== pl.id);
    renderPagos();
  },
  'mp-probar': async el => {
    await conBoton(el, async () => {
      const r = await api('mp-probar', {});
      toast(`Conexión correcta con la cuenta ${r.cuenta || r.email} (${r.pais})`);
    });
  },
  'mp-token-quitar': async el => {
    const password = el.closest('form').password.value;
    if (!password) return toast('Escribí tu contraseña del panel para quitar el token.', 'error');
    if (!confirm('¿Quitar el access token? Mercado Pago deja de aparecer en la tienda.')) return;
    try {
      await api('mp-token', { token: '', password });
      toast('Access token eliminado: Mercado Pago deja de mostrarse en la tienda.');
      cargarPagos();
    } catch (err) { toast(err.message, 'error'); }
  },
  'copiar-webhook': () => copiar(pagosInfo.webhook),
  'mp-pagos-recargar': () => cargarPagosMP(),
  exportar: () => descargar(`catalogo-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(catalogo, null, 2)),
  importar: () => $('#inputImportar').click(),
  'respaldo-restaurar': async el => {
    const archivo = el.closest('tr').dataset.archivo;
    if (!confirm('¿Restaurar este respaldo? El catálogo actual se reemplaza (y también queda respaldado).')) return;
    try {
      const r = await api('respaldo-restaurar', { archivo, version });
      version = r.version;
      await cargarCatalogo();
      cargarRespaldos();
      toast('Respaldo restaurado');
    } catch (err) { toast(err.message, 'error'); manejarConflicto(err); }
  },
};

function mover(lista, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el || el.disabled) return;
  const fn = acciones[el.dataset.accion];
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, e)).catch(() => { /* el error ya se mostró */ });
});

document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = formularios[form.dataset.form];
  if (fn) Promise.resolve(fn(form, datosForm(form), form.querySelector('[type="submit"]'))).catch(() => {});
});

document.addEventListener('input', e => {
  if (e.target.closest('#vistaPagos')) { enInputPagos(e); return; }
  enInputEditor(e);
  const cat = e.target.dataset.cat;
  if (cat !== undefined) {
    const c = categoriasEdit[Number(cat)];
    c[e.target.dataset.k] = e.target.value;
    if (c.nuevo && e.target.dataset.k === 'nombre') {
      c.id = slugify(e.target.value);
      const idInput = $(`[data-cat="${cat}"][data-k="id"]`);
      if (idInput) idInput.value = c.id;
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.closest('#editor')) { enInputEditor(e); return; }
  if (el.closest('#vistaPagos')) { enInputPagos(e); return; }
  if (el.classList.contains('input-rapido') || (el.dataset.campo && el.closest('#tablaProductos'))) { cambioRapido(el); return; }
  if (el.dataset.usuario) {
    const fila = el.closest('tr');
    const id = Number(fila.dataset.id);
    const u = usuarios.find(x => x.id === id);
    const rol = fila.querySelector('[data-usuario="rol"]').value;
    const activoInput = fila.querySelector('[data-usuario="activo"]');
    const activo = activoInput ? activoInput.checked : u.activo;
    accionUsuario('usuario-actualizar', id, { rol, activo }).then(() => { toast('Usuario actualizado'); cargarUsuarios(); }).catch(() => {});
    return;
  }
  if (el.id === 'edSubir') { subirImagenes([...el.files]); el.value = ''; return; }
  if (el.id === 'inputImportar') { importarArchivo(el.files[0]); el.value = ''; }
});

['filtroTexto', 'filtroCategoria', 'filtroEstado'].forEach(id => $(`#${id}`).addEventListener('input', () => renderProductos()));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('#editor').hidden) cerrarEditor(false);
});

window.addEventListener('beforeunload', e => {
  if (ed.p && ed.sucio) { e.preventDefault(); e.returnValue = ''; }
});

async function importarArchivo(archivo) {
  if (!archivo) return;
  let data;
  try { data = JSON.parse(await archivo.text()); }
  catch { return toast('El archivo no es un JSON válido.', 'error'); }
  if (!Array.isArray(data.productos) || !Array.isArray(data.categorias)) return toast('El archivo no tiene el formato del catálogo (categorias + productos).', 'error');
  if (!confirm(`Se reemplazará el catálogo actual (${catalogo.productos.length} productos) por el del archivo (${data.productos.length} productos). El actual queda respaldado. ¿Continuar?`)) return;
  try {
    const r = await api('catalogo-importar', { catalogo: data, version });
    version = r.version;
    await cargarCatalogo();
    toast('Catálogo importado');
    ir(vistaActual);
  } catch (err) { toast(err.message, 'error'); }
}

iniciar();
