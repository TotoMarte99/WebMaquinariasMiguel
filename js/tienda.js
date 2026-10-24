// ════════════════════════════════════════════════════════════
//  TIENDA ONLINE — Maquinarias Miguel
//  Catálogo, filtros, ficha de producto, carrito y checkout.
//  Se usa en /tienda (catálogo), /producto/{slug} (ficha) e index.html
//  (productos destacados). El carrito está disponible en todo el sitio.
// ════════════════════════════════════════════════════════════

const CFG = TIENDA_CONFIG;
const CART_KEY = 'mm_carrito_v1';
const LAST_ORDER_KEY = 'mm_ultimo_pedido';

let productos = [];
let categorias = [];
let carrito = [];
let pagos = null; // medios de pago y planes de cuotas (panel → catálogo público)

const filtros = {
  q: '',
  categoria: '',
  marcas: new Set(),
  min: null,
  max: null,
  stock: false,
  oferta: false,
  orden: 'destacados',
};

// ── HELPERS ──
const fmtARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const formatPrecio = n => fmtARS.format(Math.round(n));

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const normalizar = str => String(str ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function storageGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* modo privado */ }
}

const waLink = msg => `https://wa.me/${CFG.whatsapp}?text=${encodeURIComponent(msg)}`;

const ICONS = {
  cart: '<svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  close: '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  truck: '<svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  store: '<svg viewBox="0 0 24 24"><path d="M3 9l1-5h16l1 5"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0V9z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/></svg>',
  bank: '<svg viewBox="0 0 24 24"><path d="M3 21h18M3 10h18M5 6l7-3 7 3"/><path d="M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>',
  card: '<svg viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
  cash: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  wa: '<svg viewBox="0 0 24 24" class="icon-fill"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.124.554 4.118 1.526 5.855L.057 23.928a.5.5 0 0 0 .609.63l6.34-1.536A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.96 0-3.793-.558-5.345-1.52l-.408-.255-4.217 1.021 1.043-4.101-.272-.432A9.955 9.955 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>',
  machine: '<svg viewBox="0 0 80 80" class="placeholder-icon"><path d="M20 55 Q20 30 40 25 Q60 20 60 45"/><path d="M25 55h30"/><circle cx="40" cy="50" r="5"/><circle cx="40" cy="50" r="1.5"/><path d="M40 45V30"/><path d="M30 30h20"/><circle cx="55" cy="32" r="3"/></svg>',
};

// ── CATÁLOGO ──
async function cargarCatalogo() {
  const res = await fetch(CFG.catalogoUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  pagos = data.pagos || null;
  categorias = [...(data.categorias || [])].sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
  productos = (data.productos || []).filter(p => p.activo !== false);
}

const urlProducto = p => `/producto/${encodeURIComponent(p.slug)}`;
const urlCategoria = id => `/tienda${id ? `/${encodeURIComponent(id)}` : ''}`;
const getProducto = id => productos.find(p => p.id === id);
const nombreCategoria = id => categorias.find(c => c.id === id)?.nombre || id;

function imagenPrincipal(p) {
  const imgs = p.imagenes || [];
  return (imgs.find(i => i.principal) || imgs[0])?.url || '';
}

function variantes(p) { return Array.isArray(p.variantes) ? p.variantes : []; }

function stockDe(p, variante) {
  if (variante) {
    if (variante.disponible === false) return 0;
    return variante.stock ?? p.stock ?? 0;
  }
  if (variantes(p).length) return Math.max(0, ...variantes(p).map(v => stockDe(p, v)));
  return p.stock ?? 0;
}

function precioDe(p, variante) { return variante?.precio ?? p.precio; }

function rangoPrecios(p) {
  const precios = variantes(p).length ? variantes(p).map(v => precioDe(p, v)) : [p.precio];
  return { min: Math.min(...precios), max: Math.max(...precios) };
}

const enOferta = p => p.precio_anterior && p.precio_anterior > p.precio;
const descuentoPct = p => enOferta(p) ? Math.round((1 - p.precio / p.precio_anterior) * 100) : 0;
const nombreVariante = v => v ? (v.nombre || Object.values(v.atributos || {}).join(' / ')) : '';
const atributoVariante = p => {
  const keys = Object.keys(variantes(p)[0]?.atributos || {});
  return keys.length ? keys[0].charAt(0).toUpperCase() + keys[0].slice(1) : 'Variante';
};

// ── RENDER: TARJETA DE PRODUCTO ──
function cardProducto(p) {
  const stock = stockDe(p);
  const vars = variantes(p);
  const { min, max } = rangoPrecios(p);
  const img = imagenPrincipal(p);

  let badge = '';
  if (stock <= 0) badge = '<span class="shop-badge shop-badge-out">Sin stock</span>';
  else if (enOferta(p)) badge = `<span class="shop-badge">-${descuentoPct(p)}%</span>`;
  else if (p.destacado) badge = '<span class="shop-badge">Destacado</span>';
  const lowStock = stock > 0 && stock <= 2 ? '<span class="shop-badge shop-badge-low">Últimas unidades</span>' : '';

  const addAction = vars.length
    ? `abrirProducto('${esc(p.id)}')`
    : `agregarAlCarrito('${esc(p.id)}', null, 1)`;

  return `
    <article class="shop-card">
      <a class="shop-card-media" href="${urlProducto(p)}" onclick="return abrirProducto('${esc(p.id)}', event)" aria-label="${esc(p.nombre)}">
        ${ICONS.machine}
        ${img ? `<img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy" onerror="this.remove()">` : ''}
        <div class="shop-card-badges">${badge}${lowStock}</div>
      </a>
      <div class="shop-card-body">
        <div class="product-category">${esc(nombreCategoria(p.categoria))}${p.marca ? ` · ${esc(p.marca)}` : ''}</div>
        <h3 class="shop-card-name">
          <a href="${urlProducto(p)}" onclick="return abrirProducto('${esc(p.id)}', event)">${esc(p.nombre)}</a>
        </h3>
        ${vars.length ? `<div class="shop-card-variants">${vars.length} ${vars.length === 1 ? 'opción' : 'opciones'} de ${esc(atributoVariante(p).toLowerCase())}</div>` : ''}
        ${lineaPagoTarjeta(p, min)}
        <div class="shop-card-foot">
          <div class="shop-card-price">
            ${enOferta(p) ? `<s>${formatPrecio(p.precio_anterior)}</s>` : ''}
            ${min !== max ? '<small>Desde</small> ' : ''}${formatPrecio(min)}
          </div>
          <button class="add-btn" onclick="${addAction}" ${stock <= 0 ? 'disabled' : ''} title="${vars.length ? 'Elegir opción' : 'Agregar al carrito'}" aria-label="Agregar ${esc(p.nombre)} al carrito">
            ${ICONS.plus}
          </button>
        </div>
      </div>
    </article>`;
}

/** "3 cuotas sin interés de $X" o "$Y con transferencia" (lo más atractivo que tenga el producto). */
function lineaPagoTarjeta(p, precio) {
  if (!pagos) return '';
  const plan = Precios.mejorPlan(Precios.planesProducto(p, pagos));
  if (plan) return `<div class="shop-card-pago">${plan.cuotas} cuotas sin interés de <strong>${formatPrecio(Precios.plan(precio, plan).cuota)}</strong></div>`;
  const desc = descuentosProducto(p).sort((x, y) => y.pct - x.pct)[0];
  if (desc) return `<div class="shop-card-pago"><strong>${formatPrecio(Precios.conDescuento(precio, desc.pct))}</strong> con ${desc.metodo === 'efectivo' ? 'efectivo' : 'transferencia'}</div>`;
  return '';
}

// ── FILTROS ──
function aplicarFiltros({ ignorar } = {}) {
  const q = normalizar(filtros.q).trim();
  const terminos = q ? q.split(/\s+/) : [];

  let lista = productos.filter(p => {
    if (ignorar !== 'categoria' && filtros.categoria && p.categoria !== filtros.categoria) return false;
    if (ignorar !== 'marca' && filtros.marcas.size && !filtros.marcas.has(p.marca)) return false;
    if (filtros.stock && stockDe(p) <= 0) return false;
    if (filtros.oferta && !enOferta(p)) return false;
    const { min, max } = rangoPrecios(p);
    if (filtros.min != null && max < filtros.min) return false;
    if (filtros.max != null && min > filtros.max) return false;
    if (terminos.length) {
      const texto = normalizar([p.nombre, p.marca, p.modelo, p.sku, p.descripcion_corta, nombreCategoria(p.categoria),
        ...(p.etiquetas || []), ...variantes(p).map(nombreVariante)].join(' '));
      if (!terminos.every(t => texto.includes(t))) return false;
    }
    return true;
  });

  const orden = {
    'destacados': (a, b) => (b.destacado === true) - (a.destacado === true) || (stockDe(b) > 0) - (stockDe(a) > 0),
    'precio-asc': (a, b) => rangoPrecios(a).min - rangoPrecios(b).min,
    'precio-desc': (a, b) => rangoPrecios(b).min - rangoPrecios(a).min,
    'nombre': (a, b) => a.nombre.localeCompare(b.nombre, 'es'),
  }[filtros.orden];
  if (orden) lista = [...lista].sort(orden);
  return lista;
}

function renderTienda() {
  const grid = document.getElementById('shopGrid');
  if (!grid) return;

  const lista = aplicarFiltros();
  document.getElementById('shopCount').textContent =
    `${lista.length} ${lista.length === 1 ? 'producto' : 'productos'}`;

  grid.innerHTML = lista.length
    ? lista.map(cardProducto).join('')
    : `<div class="shop-empty">
         ${ICONS.search}
         <div class="shop-empty-title">No encontramos productos</div>
         <p>Probá con otra búsqueda o quitá algunos filtros.</p>
         <button class="btn-outline" onclick="limpiarFiltros()">Limpiar filtros</button>
       </div>`;

  renderCategorias();
  renderMarcas();
  renderChips();
  syncURL();
}

function renderCategorias() {
  const cont = document.getElementById('shopCategories');
  if (!cont) return;
  const base = aplicarFiltros({ ignorar: 'categoria' });
  const count = id => base.filter(p => p.categoria === id).length;
  const qs = location.search;
  cont.innerHTML = [
    `<a class="filter-btn ${!filtros.categoria ? 'active' : ''}" href="/tienda${qs}">Todos <span>${base.length}</span></a>`,
    ...categorias.map(c => `<a class="filter-btn ${filtros.categoria === c.id ? 'active' : ''}" href="${urlCategoria(c.id)}${qs}">${esc(c.nombre)} <span>${count(c.id)}</span></a>`),
  ].join('');
}

function renderMarcas() {
  const cont = document.getElementById('filterBrands');
  if (!cont) return;
  const base = aplicarFiltros({ ignorar: 'marca' });
  const marcas = [...new Set(productos.map(p => p.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  cont.innerHTML = marcas.map(m => {
    const n = base.filter(p => p.marca === m).length;
    const checked = filtros.marcas.has(m);
    if (!n && !checked) return '';
    return `<label class="filter-check">
      <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleMarca('${esc(m)}')">
      <span class="filter-check-box"></span>
      <span class="filter-check-label">${esc(m)}</span>
      <span class="filter-check-count">${n}</span>
    </label>`;
  }).join('');
}

function renderChips() {
  const cont = document.getElementById('shopChips');
  if (!cont) return;
  const chips = [];
  if (filtros.q) chips.push([`“${filtros.q}”`, "setFiltro('q', '')"]);
  if (filtros.categoria) chips.push([nombreCategoria(filtros.categoria), "setCategoria('')"]);
  filtros.marcas.forEach(m => chips.push([m, `toggleMarca('${esc(m)}')`]));
  if (filtros.min != null) chips.push([`Desde ${formatPrecio(filtros.min)}`, "setFiltro('min', null)"]);
  if (filtros.max != null) chips.push([`Hasta ${formatPrecio(filtros.max)}`, "setFiltro('max', null)"]);
  if (filtros.stock) chips.push(['Con stock', "setFiltro('stock', false)"]);
  if (filtros.oferta) chips.push(['En oferta', "setFiltro('oferta', false)"]);

  cont.innerHTML = chips.map(([label, action]) =>
    `<button class="shop-chip" onclick="${action}">${esc(label)} ${ICONS.close}</button>`).join('')
    + (chips.length > 1 ? '<button class="shop-chip-clear" onclick="limpiarFiltros()">Limpiar todo</button>' : '');

  const badge = document.getElementById('filtersBadge');
  if (badge) {
    const n = filtros.marcas.size + (filtros.min != null) + (filtros.max != null) + filtros.stock + filtros.oferta;
    badge.textContent = n;
    badge.hidden = !n;
  }
}

function setCategoria(id) {
  location.href = urlCategoria(id) + location.search;
}

function toggleMarca(m) {
  filtros.marcas.has(m) ? filtros.marcas.delete(m) : filtros.marcas.add(m);
  renderTienda();
}

function setFiltro(key, value) {
  filtros[key] = value;
  const inputs = { q: 'filterSearch', min: 'filterMin', max: 'filterMax', stock: 'filterStock', oferta: 'filterOffer', orden: 'shopSort' };
  const el = document.getElementById(inputs[key]);
  if (el) el.type === 'checkbox' ? (el.checked = !!value) : (el.value = value ?? '');
  renderTienda();
}

function limpiarFiltros() {
  if (filtros.categoria) { location.href = '/tienda'; return; }
  Object.assign(filtros, { q: '', min: null, max: null, stock: false, oferta: false });
  filtros.marcas.clear();
  ['filterSearch', 'filterMin', 'filterMax'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['filterStock', 'filterOffer'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  renderTienda();
}

function toggleFiltros(open) {
  const panel = document.getElementById('shopFilters');
  const overlay = document.getElementById('filtersOverlay');
  if (!panel) return;
  const abrir = open ?? !panel.classList.contains('open');
  panel.classList.toggle('open', abrir);
  overlay?.classList.toggle('open', abrir);
  document.body.classList.toggle('no-scroll', abrir);
}

function initFiltros() {
  let t;
  const debounce = fn => { clearTimeout(t); t = setTimeout(fn, 250); };
  const parsePrecio = v => { const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return isNaN(n) ? null : n; };

  document.getElementById('filterSearch')?.addEventListener('input', e => debounce(() => { filtros.q = e.target.value.trim(); renderTienda(); }));
  document.getElementById('filterMin')?.addEventListener('input', e => debounce(() => { filtros.min = parsePrecio(e.target.value); renderTienda(); }));
  document.getElementById('filterMax')?.addEventListener('input', e => debounce(() => { filtros.max = parsePrecio(e.target.value); renderTienda(); }));
  document.getElementById('filterStock')?.addEventListener('change', e => { filtros.stock = e.target.checked; renderTienda(); });
  document.getElementById('filterOffer')?.addEventListener('change', e => { filtros.oferta = e.target.checked; renderTienda(); });
  document.getElementById('shopSort')?.addEventListener('change', e => { filtros.orden = e.target.value; renderTienda(); });

  // Ocultar "En oferta" si ningún producto tiene precio anterior
  if (!productos.some(enOferta)) document.getElementById('filterOfferWrap')?.remove();
}

// ── URL (filtros compartibles) ──
function leerURL() {
  const params = new URLSearchParams(location.search);
  filtros.q = params.get('q') || '';
  const cat = document.body.dataset.categoria || '';
  filtros.categoria = categorias.some(c => c.id === cat) ? cat : '';
  (params.get('marca') || '').split(',').filter(Boolean).forEach(m => filtros.marcas.add(m));
  filtros.min = params.get('min') ? Number(params.get('min')) : null;
  filtros.max = params.get('max') ? Number(params.get('max')) : null;
  filtros.stock = params.get('stock') === '1';
  filtros.orden = params.get('orden') || 'destacados';

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.type === 'checkbox' ? (el.checked = v) : (el.value = v ?? ''); };
  set('filterSearch', filtros.q);
  set('filterMin', filtros.min);
  set('filterMax', filtros.max);
  set('filterStock', filtros.stock);
  set('shopSort', filtros.orden);
}

function syncURL() {
  const params = new URLSearchParams(location.search);
  const setP = (k, v) => v ? params.set(k, v) : params.delete(k);
  setP('q', filtros.q);
  setP('marca', [...filtros.marcas].join(','));
  setP('min', filtros.min ?? '');
  setP('max', filtros.max ?? '');
  setP('stock', filtros.stock ? '1' : '');
  setP('orden', filtros.orden !== 'destacados' ? filtros.orden : '');
  const qs = params.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
}

// ── FICHA COMPLETA (/producto/{slug}) ──
function initPaginaProducto() {
  const pagina = document.getElementById('productPage');
  const p = pagina && getProducto(pagina.dataset.productoId);
  if (!p) return;
  prepararFicha(p);
  pm.el = pagina;
  pm.inline = true;
  renderProductoModal();

  const relacionados = document.getElementById('relatedGrid');
  if (relacionados) {
    const lista = productos.filter(o => o.categoria === p.categoria && o.id !== p.id).slice(0, 4);
    if (lista.length) relacionados.innerHTML = lista.map(cardProducto).join('');
  }
}

// ── DESTACADOS (home) ──
function renderDestacados() {
  const grid = document.getElementById('featuredGrid');
  if (!grid) return;
  let lista = productos.filter(p => p.destacado && stockDe(p) > 0);
  if (lista.length < 4) lista = lista.concat(productos.filter(p => !lista.includes(p) && stockDe(p) > 0));
  grid.innerHTML = lista.slice(0, 4).map(cardProducto).join('');
}

// ════════════════════════════════════════════════════════════
//  FICHA DE PRODUCTO (modal)
// ════════════════════════════════════════════════════════════
const pm = { p: null, variante: null, qty: 1, img: 0, el: null, inline: false };

function prepararFicha(p) {
  const vars = variantes(p);
  pm.p = p;
  pm.variante = vars.find(v => stockDe(p, v) > 0) || vars[0] || null;
  pm.qty = 1;
  pm.img = 0;
}

// Vista rápida: la URL pasa a /producto/{slug} y el botón "atrás" la cierra
function abrirProducto(id, event) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1)) return true;
  if (pm.inline) return true;
  const p = getProducto(id);
  if (!p) return true;
  prepararFicha(p);
  pm.el = document.getElementById('productModalBody');
  renderProductoModal();
  abrirCapa('productModal');

  const estado = { modal: p.slug };
  history.state?.modal ? history.replaceState(estado, '', urlProducto(p)) : history.pushState(estado, '', urlProducto(p));
  document.title = p.seo?.titulo || `${p.nombre} | Maquinarias Miguel`;
  return false;
}

function cerrarProducto() {
  if (history.state?.modal) history.back();
  else cerrarFicha();
}

function cerrarFicha() {
  cerrarCapa('productModal');
  document.title = document.body.dataset.title || document.title;
}

window.addEventListener('popstate', () => {
  if (capaAbierta.includes('productModal') && !history.state?.modal) cerrarFicha();
});

function renderProductoModal() {
  const { p, variante } = pm;
  const vars = variantes(p);
  const stock = stockDe(p, variante);
  const precio = precioDe(p, variante);
  const imgs = (p.imagenes || []).filter(i => i.url);
  const img = imgs[pm.img] || imgs[0];
  pm.qty = Math.max(1, Math.min(pm.qty, stock || 1));

  const stockTxt = stock <= 0
    ? '<span class="pm-stock out">Sin stock</span>'
    : stock <= 2
      ? `<span class="pm-stock low">Últimas ${stock === 1 ? 'unidad' : stock + ' unidades'}</span>`
      : `<span class="pm-stock">En stock${stock < 50 ? ` · ${stock} disponibles` : ''}</span>`;

  const parrafos = String(p.descripcion || '').split(/\n\s*\n/).filter(Boolean)
    .map(t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('');
  const specs = Object.entries(p.especificaciones || {});

  pm.el.innerHTML = `
    <div class="pm-grid">
      <div class="pm-gallery">
        <div class="pm-main">
          ${ICONS.machine}
          ${img ? `<img src="${esc(img.url)}" alt="${esc(img.alt || p.nombre)}" onerror="this.remove()">` : ''}
          ${imgs.length > 1 ? `
            <button class="pm-nav prev" onclick="cambiarImagen(-1)" aria-label="Imagen anterior">‹</button>
            <button class="pm-nav next" onclick="cambiarImagen(1)" aria-label="Imagen siguiente">›</button>
            <div class="pm-counter">${pm.img + 1} / ${imgs.length}</div>` : ''}
        </div>
        ${imgs.length > 1 ? `<div class="pm-thumbs">${imgs.map((im, i) => `
          <button class="pm-thumb ${i === pm.img ? 'active' : ''}" onclick="verImagen(${i})" aria-label="Ver imagen ${i + 1}">
            <img src="${esc(im.url)}" alt="" loading="lazy" onerror="this.remove()">
          </button>`).join('')}</div>` : ''}
      </div>

      <div class="pm-info">
        <div class="product-category">${esc(nombreCategoria(p.categoria))}${p.marca ? ` · ${esc(p.marca)}` : ''}</div>
        <${pm.inline ? 'h1' : 'h2'} class="pm-title" id="productModalTitle">${esc(p.nombre)}</${pm.inline ? 'h1' : 'h2'}>
        <div class="pm-meta">SKU ${esc(variante?.sku || p.sku)}${p.condicion ? ` · ${esc(p.condicion.charAt(0).toUpperCase() + p.condicion.slice(1))}` : ''}</div>

        <div class="pm-price-row">
          <div class="pm-price">${formatPrecio(precio)}</div>
          ${enOferta(p) && !variante ? `<s class="pm-price-old">${formatPrecio(p.precio_anterior)}</s><span class="shop-badge">-${descuentoPct(p)}%</span>` : ''}
        </div>
        ${bloquePagos(p, precio)}
        ${stockTxt}

        ${p.descripcion_corta ? `<p class="pm-short">${esc(p.descripcion_corta)}</p>` : ''}

        ${vars.length ? `
          <div class="pm-label">${esc(atributoVariante(p))}: <strong>${esc(nombreVariante(variante))}</strong></div>
          <div class="pm-variants">${vars.map(v => `
            <button class="pm-variant ${v === variante ? 'active' : ''}" ${stockDe(p, v) <= 0 ? 'disabled title="Sin stock"' : ''} onclick="elegirVariante('${esc(v.sku)}')">${esc(nombreVariante(v))}</button>`).join('')}
          </div>` : ''}

        <div class="pm-buy">
          <div class="qty-stepper">
            <button onclick="cambiarCantidadModal(-1)" ${pm.qty <= 1 ? 'disabled' : ''} aria-label="Restar">${ICONS.minus}</button>
            <span>${pm.qty}</span>
            <button onclick="cambiarCantidadModal(1)" ${pm.qty >= stock ? 'disabled' : ''} aria-label="Sumar">${ICONS.plus}</button>
          </div>
          <button class="btn-primary pm-add" onclick="agregarDesdeModal()" ${stock <= 0 ? 'disabled' : ''}>
            ${stock <= 0 ? 'Sin stock' : 'Agregar al carrito'}
          </button>
        </div>
        <button class="whatsapp-btn" onclick="consultarProducto()">${ICONS.wa} Consultar por WhatsApp</button>
        ${pm.inline ? '' : `<a class="pm-full-link" href="${urlProducto(p)}">Ver ficha completa →</a>`}

        <ul class="pm-perks">
          <li>${ICONS.store}<span><strong>Retiro en el local</strong>${esc(CFG.local.direccion)}</span></li>
          ${CFG.envio.habilitado ? `<li>${ICONS.truck}<span><strong>Envíos a todo el país</strong>Costo a coordinar según destino</span></li>` : ''}
          <li>${ICONS.shield}<span><strong>Garantía</strong>${esc(p.garantia || 'Respaldo y servicio técnico propio')}</span></li>
          <li>${ICONS.file}<span><strong>Factura A y B</strong>Precios con IVA incluido</span></li>
        </ul>
      </div>
    </div>

    <div class="pm-details">
      <div>
        ${parrafos ? `<div class="pm-section-title">Descripción</div><div class="pm-desc">${parrafos}</div>` : ''}
        ${(p.caracteristicas || []).length ? `
          <div class="pm-section-title">Características</div>
          <ul class="pm-features">${p.caracteristicas.map(c => `<li>${ICONS.check}${esc(c)}</li>`).join('')}</ul>` : ''}
      </div>
      ${specs.length ? `
        <div>
          <div class="pm-section-title">Especificaciones</div>
          <table class="pm-specs">${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        </div>` : ''}
    </div>`;
}

/** Medios de pago y cuotas de la ficha (con los datos que exige la ley para cuotas con interés). */
function bloquePagos(p, precio) {
  if (!pagos) return '';
  const filas = [];
  descuentosProducto(p).forEach(d => filas.push(`
    <li><span>${d.metodo === 'efectivo' ? 'Efectivo en el local' : 'Transferencia bancaria'} <em>-${d.pct}%</em></span><strong>${formatPrecio(Precios.conDescuento(precio, d.pct))}</strong></li>`));
  const planes = Precios.planesProducto(p, pagos);
  if (pagos.mercadopago?.disponible) {
    filas.push(`<li><span>Mercado Pago · 1 pago</span><strong>${formatPrecio(precio)}</strong></li>`);
    planes.forEach(pl => {
      const c = Precios.plan(precio, pl);
      const conInteres = pl.tipo === 'con_interes';
      const datos = conInteres
        ? [`Total estimado ${formatPrecio(c.totalCliente)}`, pl.tna ? `TNA ${pl.tna}%` : '', pl.tea ? `TEA ${pl.tea}%` : '', pl.cft ? `CFT ${pl.cft}%` : ''].filter(Boolean).join(' · ')
        : pl.recargo ? `Total ${formatPrecio(c.totalCliente)}` : '';
      filas.push(`<li class="${!conInteres && !pl.recargo ? 'destacado' : ''}"><span>${esc(pl.nombre)}${datos ? `<small>${datos}</small>` : ''}</span><strong>${pl.cuotas} × ${formatPrecio(c.cuota)}${conInteres ? '*' : ''}</strong></li>`);
    });
  }
  if (!filas.length) return '';
  const mejor = Precios.mejorPlan(planes);
  return `
    ${mejor && pagos.mercadopago?.disponible ? `<div class="pm-cuotas-destacado">${mejor.cuotas} cuotas sin interés de <strong>${formatPrecio(Precios.plan(precio, mejor).cuota)}</strong></div>` : ''}
    <details class="pm-pagos">
      <summary>Ver medios de pago y cuotas</summary>
      <ul>${filas.join('')}</ul>
      ${planes.some(pl => pl.tipo === 'con_interes') && pagos.mercadopago?.disponible ? `<p class="pm-pagos-nota">* Valores estimados: el interés final lo define Mercado Pago según tu tarjeta. Precio de contado: ${formatPrecio(precio)}.</p>` : ''}
    </details>`;
}

function verImagen(i) { pm.img = i; renderProductoModal(); }
function cambiarImagen(delta) {
  const n = (pm.p.imagenes || []).length;
  pm.img = (pm.img + delta + n) % n;
  renderProductoModal();
}
function elegirVariante(sku) {
  pm.variante = variantes(pm.p).find(v => v.sku === sku) || null;
  renderProductoModal();
}
function cambiarCantidadModal(delta) {
  pm.qty += delta;
  renderProductoModal();
}
function agregarDesdeModal() {
  if (agregarAlCarrito(pm.p.id, pm.variante?.sku, pm.qty) && !pm.inline) {
    cerrarProducto();
  }
}
function consultarProducto() {
  const { p, variante } = pm;
  const msg = `Hola! Quería consultar por este producto de la tienda online:\n\n• ${p.nombre}${variante ? ` (${nombreVariante(variante)})` : ''}\nSKU: ${variante?.sku || p.sku}\nPrecio: ${formatPrecio(precioDe(p, variante))}\n\n¿Está disponible?`;
  window.open(waLink(msg), '_blank', 'noopener');
}

// ════════════════════════════════════════════════════════════
//  CARRITO
// ════════════════════════════════════════════════════════════
function cargarCarrito() {
  // Revalida contra el catálogo: precios actuales, stock y productos dados de baja
  carrito = storageGet(CART_KEY, []).map(item => {
    const p = getProducto(item.id);
    if (!p) return null;
    const v = item.sku ? variantes(p).find(x => x.sku === item.sku) : null;
    if (item.sku && !v) return null;
    const stock = stockDe(p, v);
    if (stock <= 0) return null;
    return { id: p.id, sku: v?.sku || null, qty: Math.min(item.qty, stock) };
  }).filter(Boolean);
  guardarCarrito();
}

function guardarCarrito() { storageSet(CART_KEY, carrito); }

function lineaCarrito(item) {
  const p = getProducto(item.id);
  const v = item.sku ? variantes(p).find(x => x.sku === item.sku) : null;
  return { ...item, p, v, precio: precioDe(p, v), stock: stockDe(p, v), subtotal: precioDe(p, v) * item.qty };
}

const lineas = () => carrito.map(lineaCarrito);
const subtotalCarrito = () => lineas().reduce((s, l) => s + l.subtotal, 0);
const unidadesCarrito = () => carrito.reduce((s, i) => s + i.qty, 0);

function agregarAlCarrito(id, sku, qty = 1) {
  const p = getProducto(id);
  if (!p) return false;
  const v = sku ? variantes(p).find(x => x.sku === sku) : null;
  const stock = stockDe(p, v);
  const existente = carrito.find(i => i.id === id && i.sku === (v?.sku || null));
  const actual = existente?.qty || 0;

  if (actual + qty > stock) {
    mostrarAviso('Stock insuficiente', `Hay ${stock} ${stock === 1 ? 'unidad disponible' : 'unidades disponibles'} y ya tenés ${actual} en el carrito.`);
    return false;
  }
  if (existente) existente.qty += qty;
  else carrito.push({ id, sku: v?.sku || null, qty });

  guardarCarrito();
  renderCarrito();
  mostrarAviso('Agregado al carrito', `${p.nombre}${v ? ` — ${nombreVariante(v)}` : ''}`, true);
  return true;
}

function cambiarCantidad(index, delta) {
  const item = carrito[index];
  if (!item) return;
  const { stock } = lineaCarrito(item);
  item.qty = Math.min(stock, item.qty + delta);
  if (item.qty <= 0) carrito.splice(index, 1);
  guardarCarrito();
  renderCarrito();
}

function quitarDelCarrito(index) {
  carrito.splice(index, 1);
  guardarCarrito();
  renderCarrito();
}

function vaciarCarrito() {
  carrito = [];
  guardarCarrito();
  renderCarrito();
}

function renderCarrito() {
  const count = unidadesCarrito();
  document.querySelectorAll('.cart-bubble').forEach(b => {
    b.textContent = count;
    b.classList.toggle('show', count > 0);
  });

  const cont = document.getElementById('cartItems');
  if (!cont) return;
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartFooter').hidden = !carrito.length;

  if (!carrito.length) {
    cont.innerHTML = `<div class="cart-empty">${ICONS.cart}<p>Tu carrito está vacío.<br>Explorá nuestros productos.</p>
      <a href="/tienda" class="btn-outline">Ir a la tienda</a></div>`;
    return;
  }

  cont.innerHTML = lineas().map((l, i) => `
    <div class="cart-item">
      <div class="cart-item-image">
        ${ICONS.machine}
        ${imagenPrincipal(l.p) ? `<img src="${esc(imagenPrincipal(l.p))}" alt="" onerror="this.remove()">` : ''}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${esc(l.p.nombre)}</div>
        ${l.v ? `<div class="cart-item-variant">${esc(atributoVariante(l.p))}: ${esc(nombreVariante(l.v))}</div>` : ''}
        <div class="cart-item-row">
          <div class="qty-stepper small">
            <button onclick="cambiarCantidad(${i}, -1)" aria-label="Restar">${ICONS.minus}</button>
            <span>${l.qty}</span>
            <button onclick="cambiarCantidad(${i}, 1)" ${l.qty >= l.stock ? 'disabled' : ''} aria-label="Sumar">${ICONS.plus}</button>
          </div>
          <div class="cart-item-price">${formatPrecio(l.subtotal)}</div>
        </div>
      </div>
      <button class="cart-item-remove" onclick="quitarDelCarrito(${i})" aria-label="Quitar">×</button>
    </div>`).join('');

  document.getElementById('cartTotal').textContent = formatPrecio(subtotalCarrito());
}

function toggleCart(open) {
  const sidebar = document.getElementById('cartSidebar');
  const abrir = open ?? !sidebar.classList.contains('open');
  if (abrir && capaAbierta.includes('productModal')) cerrarProducto();
  abrir ? abrirCapa('cartSidebar') : cerrarCapa('cartSidebar');
}

// ════════════════════════════════════════════════════════════
//  CHECKOUT
//  Descuentos, planes de cuotas y recargos vienen de la configuración
//  de pagos del panel (catálogo público → pagos) y se calculan con Precios.
// ════════════════════════════════════════════════════════════
const METODOS = {
  transferencia: { nombre: 'Transferencia bancaria', icon: 'bank', desc: 'Te mostramos los datos bancarios al confirmar.' },
  mercadopago: { nombre: 'Mercado Pago', icon: 'card', desc: 'Tarjetas de crédito, débito y dinero en cuenta.' },
  efectivo: { nombre: 'Efectivo en el local', icon: 'cash', desc: 'Reservamos tu pedido y lo abonás al retirarlo.' },
  whatsapp: { nombre: 'Reservar por WhatsApp', icon: 'wa', desc: 'Reservá ahora y coordinamos pago y entrega por chat.' },
};

/** Medio habilitado en el panel (se muestra). */
function metodoVisible(m) {
  if (!pagos) return m === 'whatsapp';
  if (m === 'mercadopago') return !!pagos.mercadopago?.disponible;
  return pagos[m]?.activo !== false;
}

/** Medio elegible para este pedido (efectivo puede requerir retiro en el local). */
function metodoDisponible(m) {
  if (m === 'efectivo' && co.entrega === 'envio' && pagos?.efectivo?.solo_retiro) return false;
  return metodoVisible(m);
}

/** Medios con descuento para un producto: [{metodo, pct}] */
function descuentosProducto(p) {
  return ['transferencia', 'efectivo']
    .filter(m => pagos?.[m]?.activo)
    .map(m => ({ metodo: m, pct: Precios.descuento(p, pagos, m) }))
    .filter(d => d.pct > 0);
}

const co = { paso: 1, entrega: 'retiro', metodo: 'transferencia', plan: '', enviando: false };

function abrirCheckout(metodo) {
  if (!carrito.length) return;
  if (metodo) co.metodo = metodo;
  co.paso = 1;
  cerrarCapa('cartSidebar');
  document.getElementById('checkoutContent').hidden = false;
  document.getElementById('checkoutSuccess').hidden = true;
  renderCheckout();
  setTimeout(() => abrirCapa('checkoutModal'), 150);
}

function cerrarCheckout() { cerrarCapa('checkoutModal'); }

const planesCarrito = () => Precios.planesComunes(lineas().map(l => l.p), pagos);
const planElegido = () => co.metodo === 'mercadopago' && co.plan ? planesCarrito().find(pl => pl.id === co.plan) || null : null;

function totales() {
  const ls = lineas();
  const subtotal = ls.reduce((s, l) => s + l.subtotal, 0);
  const pcts = ls.map(l => ['efectivo', 'transferencia'].includes(co.metodo) ? Precios.descuento(l.p, pagos, co.metodo) : 0);
  const descuento = Math.round(ls.reduce((s, l, i) => s + l.subtotal * pcts[i] / 100, 0));
  const plan = planElegido();
  const conPlan = plan ? ls.reduce((s, l) => s + Precios.plan(l.precio, plan).total * l.qty, 0) : subtotal;
  const recargo = Math.max(0, Math.round(conPlan - subtotal));
  const total = Math.round(subtotal - descuento + recargo);
  const cuotas = plan ? Precios.plan(total, { ...plan, recargo: 0 }) : null;
  const pctUnico = new Set(pcts).size === 1 ? pcts[0] : null;
  return { subtotal, descuento, pct: pctUnico, recargo, total, plan, cuotas };
}

function renderMetodos() {
  if (!metodoDisponible(co.metodo)) co.metodo = Object.keys(METODOS).find(metodoDisponible) || 'whatsapp';
  const planes = metodoDisponible('mercadopago') ? planesCarrito() : [];
  if (co.plan && !planes.some(pl => pl.id === co.plan)) co.plan = '';

  const sub = Math.round(subtotalCarrito());
  const etiquetaDescuento = m => {
    const pcts = lineas().map(l => Precios.descuento(l.p, pagos, m));
    const max = Math.max(0, ...pcts);
    if (!max) return '';
    return ` <em>${pcts.every(x => x === max) ? '' : 'hasta '}${max}% OFF</em>`;
  };

  document.getElementById('coMetodos').innerHTML = Object.keys(METODOS).filter(metodoVisible).map(id => {
    const m = METODOS[id];
    const disponible = metodoDisponible(id);
    const algunoConCuotas = lineas().some(l => Precios.planesProducto(l.p, pagos).length);
    const desc = id === 'efectivo' && pagos?.efectivo?.solo_retiro ? `${m.desc} Solo con retiro en el local.`
      : id === 'mercadopago' && planes.length ? `${m.desc} Hasta ${Math.max(...planes.map(p => p.cuotas))} cuotas.`
      : id === 'mercadopago' && algunoConCuotas ? `${m.desc} En 1 pago: algunos productos del carrito no tienen cuotas.` : m.desc;
    const subplanes = id === 'mercadopago' && co.metodo === 'mercadopago' && planes.length ? `
      <div class="co-planes">
        <label class="co-plan"><input type="radio" name="coPlan" value="" ${!co.plan ? 'checked' : ''} onchange="co.plan = ''; renderCheckout()">
          <span>1 pago</span><strong>${formatPrecio(sub)}</strong></label>
        ${planes.map(pl => {
          const total = Math.round(lineas().reduce((s, l) => s + Precios.plan(l.precio, pl).total * l.qty, 0));
          const c = Precios.plan(total, { ...pl, recargo: 0 });
          return `<label class="co-plan"><input type="radio" name="coPlan" value="${esc(pl.id)}" ${co.plan === pl.id ? 'checked' : ''} onchange="co.plan = this.value; renderCheckout()">
            <span>${esc(pl.nombre)}</span><strong>${pl.cuotas} × ${formatPrecio(c.cuota)}${pl.tipo === 'con_interes' ? '*' : ''}</strong>
            ${pl.recargo || pl.tipo === 'con_interes' ? `<small>Total ${pl.tipo === 'con_interes' ? 'estimado ' : ''}${formatPrecio(c.totalCliente)}${pl.cft ? ` · CFT ${pl.cft}%` : ''}</small>` : ''}</label>`;
        }).join('')}
        ${planes.some(pl => pl.tipo === 'con_interes') ? '<p class="co-planes-nota">* Estimado: el interés final lo define Mercado Pago según tu tarjeta.</p>' : ''}
      </div>` : '';
    return `
      <label class="co-option ${disponible ? '' : 'disabled'}">
        <input type="radio" name="coMetodo" value="${id}" ${co.metodo === id ? 'checked' : ''} ${disponible ? '' : 'disabled'} onchange="co.metodo = this.value; renderCheckout()">
        <span class="co-option-icon">${ICONS[m.icon]}</span>
        <span class="co-option-text"><strong>${m.nombre}${pagos && ['efectivo', 'transferencia'].includes(id) ? etiquetaDescuento(id) : ''}</strong><small>${desc}</small></span>
        <span class="co-option-radio"></span>
      </label>${subplanes}`;
  }).join('');
}

function renderCheckout() {
  document.querySelectorAll('#checkoutModal .co-step').forEach(el => {
    el.hidden = Number(el.dataset.step) !== co.paso;
  });
  document.querySelectorAll('#checkoutModal .co-progress-step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === co.paso);
    el.classList.toggle('done', s < co.paso);
  });

  document.querySelectorAll('input[name="coEntrega"]').forEach(r => { r.checked = r.value === co.entrega; });
  document.getElementById('coShippingFields').hidden = co.entrega !== 'envio';
  renderMetodos();

  const t = totales();
  document.getElementById('coSummaryItems').innerHTML = lineas().map(l => `
    <div class="co-sum-item">
      <div class="co-sum-thumb">${ICONS.machine}${imagenPrincipal(l.p) ? `<img src="${esc(imagenPrincipal(l.p))}" alt="" onerror="this.remove()">` : ''}<span>${l.qty}</span></div>
      <div class="co-sum-name">${esc(l.p.nombre)}${l.v ? `<small>${esc(nombreVariante(l.v))}</small>` : ''}</div>
      <div class="co-sum-price">${formatPrecio(l.subtotal)}</div>
    </div>`).join('');
  document.getElementById('coSummaryTotals').innerHTML = `
    <div class="co-sum-row"><span>Subtotal</span><span>${formatPrecio(t.subtotal)}</span></div>
    ${t.descuento ? `<div class="co-sum-row discount"><span>Descuento ${co.metodo === 'efectivo' ? 'efectivo' : 'transferencia'}${t.pct ? ` (${t.pct}%)` : ''}</span><span>−${formatPrecio(t.descuento)}</span></div>` : ''}
    ${t.recargo ? `<div class="co-sum-row"><span>Recargo ${esc(t.plan.nombre)}</span><span>+${formatPrecio(t.recargo)}</span></div>` : ''}
    <div class="co-sum-row"><span>${co.entrega === 'envio' ? 'Envío' : 'Retiro en local'}</span><span>${co.entrega === 'envio' ? 'A coordinar' : 'Gratis'}</span></div>
    <div class="co-sum-row total"><span>Total</span><span>${formatPrecio(t.total)}</span></div>
    ${t.plan ? `<div class="co-sum-cuotas">${t.plan.cuotas} cuotas de ${formatPrecio(t.cuotas.cuota)}${t.plan.tipo === 'con_interes' ? ` (estimado, total ${formatPrecio(t.cuotas.totalCliente)})` : ''}</div>` : ''}`;

  if (co.paso === 3) renderConfirmacion();

  const submit = document.getElementById('coSubmit');
  submit.innerHTML = co.metodo === 'whatsapp'
    ? `${ICONS.wa} Reservar por WhatsApp`
    : co.metodo === 'mercadopago' ? 'Pagar con Mercado Pago →' : 'Confirmar pedido →';
  submit.classList.toggle('is-wa', co.metodo === 'whatsapp');
}

function datosCliente() {
  const val = id => document.getElementById(id)?.value.trim() || '';
  return {
    nombre: val('coName'),
    telefono: val('coPhone'),
    email: val('coEmail'),
    documento: val('coDoc'),
    factura: val('coInvoice'),
    direccion: val('coAddress'),
    ciudad: val('coCity'),
    provincia: val('coProvince'),
    cp: val('coZip'),
    notas: val('coNotes'),
  };
}

function validarPaso(paso) {
  const d = datosCliente();
  const errores = [];
  const marcar = (id, ok) => document.getElementById(id)?.classList.toggle('invalid', !ok);

  if (paso === 1) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email);
    const telOk = d.telefono.replace(/\D/g, '').length >= 8;
    marcar('coName', !!d.nombre); if (!d.nombre) errores.push('nombre y apellido');
    marcar('coPhone', telOk); if (!telOk) errores.push('un teléfono válido');
    marcar('coEmail', emailOk); if (!emailOk) errores.push('un email válido');
  }
  if (paso === 2 && co.entrega === 'envio') {
    [['coAddress', 'dirección'], ['coCity', 'ciudad'], ['coProvince', 'provincia'], ['coZip', 'código postal']].forEach(([id, label]) => {
      const ok = !!document.getElementById(id).value.trim();
      marcar(id, ok);
      if (!ok) errores.push(label);
    });
  }

  const box = document.getElementById('coError');
  box.textContent = errores.length ? `Completá ${errores.join(', ')}.` : '';
  box.hidden = !errores.length;
  if (errores.length) document.querySelector('#checkoutModal .invalid')?.focus();
  return !errores.length;
}

function irPaso(paso) {
  if (paso > co.paso && !validarPaso(co.paso)) return;
  co.paso = paso;
  document.getElementById('coError').hidden = true;
  renderCheckout();
  document.querySelector('#checkoutModal .co-main').scrollTop = 0;
}

function nombreMetodo(metodo, plan) {
  return METODOS[metodo].nombre + (plan ? ` — ${plan.nombre}` : metodo === 'mercadopago' ? ' — 1 pago' : '');
}

function renderConfirmacion() {
  const d = datosCliente();
  const t = totales();
  const entrega = co.entrega === 'envio'
    ? `Envío a ${esc(d.direccion)}, ${esc(d.ciudad)}, ${esc(d.provincia)} (CP ${esc(d.cp)})`
    : `Retiro en ${esc(CFG.local.direccion)}`;
  const notaMetodo = {
    transferencia: `Al confirmar te mostramos los datos bancarios. Reservamos tu pedido por ${CFG.reservaHoras} hs hasta recibir el comprobante.`,
    mercadopago: `Te redirigiremos a Mercado Pago para pagar de forma segura${t.plan ? ` en hasta ${t.plan.cuotas} cuotas` : ' en 1 pago'}.`,
    efectivo: `Reservamos tu pedido por ${CFG.reservaHoras} hs. Lo abonás en efectivo al retirarlo en el local (${esc(CFG.local.horario)}).`,
    whatsapp: 'Se abrirá WhatsApp con el detalle de tu pedido para coordinar el pago y la entrega.',
  }[co.metodo];

  document.getElementById('coReview').innerHTML = `
    <div class="co-review-block">
      <div class="co-review-label">Contacto <button class="co-link" onclick="irPaso(1)">Editar</button></div>
      <div>${esc(d.nombre)} · ${esc(d.telefono)}<br>${esc(d.email)}${d.documento ? `<br>${esc(d.factura)} — ${esc(d.documento)}` : ''}</div>
    </div>
    <div class="co-review-block">
      <div class="co-review-label">Entrega <button class="co-link" onclick="irPaso(2)">Editar</button></div>
      <div>${entrega}</div>
    </div>
    <div class="co-review-block">
      <div class="co-review-label">Pago <button class="co-link" onclick="irPaso(2)">Editar</button></div>
      <div>${esc(nombreMetodo(co.metodo, t.plan))}</div>
      <p class="co-review-note">${notaMetodo}</p>
    </div>
    ${d.notas ? `<div class="co-review-block"><div class="co-review-label">Notas</div><div>${esc(d.notas)}</div></div>` : ''}`;
}

function generarNumeroPedido() {
  const f = new Date();
  const fecha = `${String(f.getFullYear()).slice(2)}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MM-${fecha}-${rand}`;
}

function armarPedido() {
  const d = datosCliente();
  const t = totales();
  return {
    numero: generarNumeroPedido(),
    fecha: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
    metodo: co.metodo,
    metodoNombre: nombreMetodo(co.metodo, t.plan),
    entrega: co.entrega,
    cliente: d,
    items: lineas().map(l => ({
      id: l.p.id,
      sku: l.v?.sku || l.p.sku,
      variante_sku: l.v?.sku || null,
      nombre: l.p.nombre,
      variante: l.v ? nombreVariante(l.v) : '',
      cantidad: l.qty,
      precio: l.precio,
      subtotal: l.subtotal,
    })),
    ...t,
  };
}

function textoItems(pedido) {
  return pedido.items.map(i =>
    `• ${i.cantidad}x ${i.nombre}${i.variante ? ` (${i.variante})` : ''} — ${formatPrecio(i.subtotal)}`).join('\n');
}

function mensajeWhatsApp(pedido) {
  const d = pedido.cliente;
  let msg = `Hola! Hice un pedido en la tienda online.\n\n*Pedido ${pedido.numero}*\n${textoItems(pedido)}\n\n`;
  if (pedido.descuento) msg += `Descuento: −${formatPrecio(pedido.descuento)}\n`;
  if (pedido.recargo) msg += `Recargo ${pedido.plan.nombre}: +${formatPrecio(pedido.recargo)}\n`;
  msg += `*Total: ${formatPrecio(pedido.total)}*\n\n`;
  msg += `Pago: ${pedido.metodoNombre}\n`;
  msg += pedido.entrega === 'envio'
    ? `Entrega: envío a ${d.direccion}, ${d.ciudad}, ${d.provincia} (CP ${d.cp})\n`
    : 'Entrega: retiro en el local\n';
  msg += `\nNombre: ${d.nombre}\nTeléfono: ${d.telefono}`;
  if (d.notas) msg += `\nNotas: ${d.notas}`;
  return msg;
}

// Notificación por email al administrador (EmailJS)
function notificarPedido(pedido, estado) {
  if (typeof emailjs === 'undefined' || typeof EMAILJS_ORDER_TEMPLATE_ID === 'undefined' || typeof EMAILJS_SERVICE_ID === 'undefined') {
    return Promise.reject(new Error('EmailJS no está configurado (ver js/config.js)'));
  }
  const d = pedido.cliente;
  const filas = pedido.items.map(i => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${esc(i.nombre)}${i.variante ? `<br><small style="color:#888;">${esc(i.variante)}</small>` : ''}<br><small style="color:#888;">SKU ${esc(i.sku)}</small></td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i.cantidad}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatPrecio(i.precio)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatPrecio(i.subtotal)}</td>
    </tr>`).join('');
  const ajustes = [
    pedido.descuento ? `−${formatPrecio(pedido.descuento)}${pedido.pct ? ` (${pedido.pct}%)` : ''}` : '',
    pedido.recargo ? `Recargo ${pedido.plan.nombre}: +${formatPrecio(pedido.recargo)}` : '',
  ].filter(Boolean).join(' · ');

  return emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_ORDER_TEMPLATE_ID, {
    to_email: CFG.emailAdmin,
    reply_to: d.email,
    pedido_numero: pedido.numero,
    pedido_fecha: pedido.fecha,
    pedido_tipo: pedido.metodo === 'whatsapp' ? 'Reserva' : 'Compra',
    pedido_estado: estado,
    metodo_pago: pedido.metodoNombre,
    entrega: pedido.entrega === 'envio' ? 'Envío a domicilio' : 'Retiro en el local',
    direccion_envio: pedido.entrega === 'envio' ? `${d.direccion}, ${d.ciudad}, ${d.provincia} (CP ${d.cp})` : '—',
    cliente_nombre: d.nombre,
    cliente_telefono: d.telefono,
    cliente_email: d.email,
    cliente_documento: d.documento ? `${d.factura} — ${d.documento}` : '—',
    notas: d.notas || '—',
    productos_texto: textoItems(pedido),
    productos_html: `<table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr style="background:#111;color:#ffc107;"><th style="padding:8px;text-align:left;">Producto</th><th style="padding:8px;">Cant.</th><th style="padding:8px;text-align:right;">Precio</th><th style="padding:8px;text-align:right;">Subtotal</th></tr>
      ${filas}</table>`,
    subtotal: formatPrecio(pedido.subtotal),
    descuento: ajustes || '—',
    total: formatPrecio(pedido.total) + (pedido.plan ? ` (${pedido.plan.cuotas} cuotas de ${formatPrecio(pedido.cuotas.cuota)})` : ''),
    whatsapp_cliente: `https://wa.me/${d.telefono.replace(/\D/g, '')}`,
  });
}

async function crearPreferenciaMP(pedido) {
  const res = await fetch('/api/crear-preferencia.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pedido: pedido.numero,
      plan: pedido.plan?.id || '',
      items: pedido.items.map(i => ({ id: i.id, variante_sku: i.variante_sku, cantidad: i.cantidad })),
      cliente: { nombre: pedido.cliente.nombre, email: pedido.cliente.email, telefono: pedido.cliente.telefono },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.init_point) throw new Error(data.error || 'No se pudo iniciar el pago');
  return data.init_point;
}

async function confirmarPedido() {
  if (co.enviando || !carrito.length) return;
  if (!validarPaso(1)) return irPaso(1);
  if (!validarPaso(2)) return irPaso(2);

  const btn = document.getElementById('coSubmit');
  co.enviando = true;
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  const pedido = armarPedido();
  const estado = {
    transferencia: 'Pendiente de pago — esperando comprobante de transferencia',
    mercadopago: 'Pendiente de pago — Mercado Pago (llega otro email cuando se acredite)',
    efectivo: 'Reservado — abona en efectivo al retirar',
    whatsapp: 'Reserva — coordinar por WhatsApp',
  }[pedido.metodo];

  // WhatsApp se abre en el mismo gesto del click para evitar el bloqueo de popups
  if (pedido.metodo === 'whatsapp') window.open(waLink(mensajeWhatsApp(pedido)), '_blank', 'noopener');

  let emailOk = true;
  try {
    await notificarPedido(pedido, estado);
  } catch (err) {
    emailOk = false;
    console.error('No se pudo enviar la notificación del pedido:', err);
  }

  storageSet(LAST_ORDER_KEY, { numero: pedido.numero, total: pedido.total, metodo: pedido.metodo, mensaje: mensajeWhatsApp(pedido) });

  if (pedido.metodo === 'mercadopago') {
    try {
      const url = await crearPreferenciaMP(pedido);
      vaciarCarrito();
      location.href = url;
      return;
    } catch (err) {
      console.error('Mercado Pago:', err);
      pedido.mpError = true;
    }
  }

  vaciarCarrito();
  mostrarExito(pedido, emailOk);
  co.enviando = false;
  btn.disabled = false;
}

function filaCopiable(label, valor) {
  if (!valor) return '';
  return `<div class="co-bank-row"><span>${label}</span><strong>${esc(valor)}</strong>
    <button class="co-copy" onclick="copiar('${esc(valor)}', this)" aria-label="Copiar ${label}">${ICONS.copy}</button></div>`;
}

function mostrarExito(pedido, emailOk) {
  const tb = pagos?.transferencia || {};
  const comprobanteMsg = `Hola! Te envío el comprobante de pago del pedido ${pedido.numero} por ${formatPrecio(pedido.total)}.`;
  const instrucciones = {
    transferencia: `
      <p>Transferí <strong>${formatPrecio(pedido.total)}</strong> a la siguiente cuenta y envianos el comprobante. Reservamos tu pedido por ${CFG.reservaHoras} hs.</p>
      <div class="co-bank">
        ${filaCopiable('Titular', tb.titular)}
        ${filaCopiable('Banco', tb.banco)}
        ${filaCopiable('CBU / CVU', tb.cbu)}
        ${filaCopiable('Alias', tb.alias)}
        ${filaCopiable('CUIT', tb.cuit)}
        ${filaCopiable('Monto', String(Math.round(pedido.total)))}
      </div>
      <a class="whatsapp-btn" href="${waLink(comprobanteMsg)}" target="_blank" rel="noopener">${ICONS.wa} Enviar comprobante por WhatsApp</a>`,
    efectivo: `
      <p>Tu pedido quedó reservado por ${CFG.reservaHoras} hs. Acercate al local y abonás <strong>${formatPrecio(pedido.total)}</strong> en efectivo.</p>
      <div class="co-bank">
        <div class="co-bank-row"><span>Dirección</span><strong>${esc(CFG.local.direccion)}</strong></div>
        <div class="co-bank-row"><span>Horario</span><strong>${esc(CFG.local.horario)}</strong></div>
      </div>`,
    mercadopago: `
      <p>No pudimos conectar con Mercado Pago en este momento. Tu pedido quedó registrado: te enviamos el link de pago por <strong>${formatPrecio(pedido.total)}</strong> a la brevedad.</p>
      <a class="whatsapp-btn" href="${waLink(mensajeWhatsApp(pedido))}" target="_blank" rel="noopener">${ICONS.wa} Pedir el link por WhatsApp</a>`,
    whatsapp: `
      <p>Abrimos WhatsApp con el detalle de tu reserva. Si no se abrió, tocá el botón para enviarnos el mensaje.</p>
      <a class="whatsapp-btn" href="${waLink(mensajeWhatsApp(pedido))}" target="_blank" rel="noopener">${ICONS.wa} Abrir WhatsApp</a>`,
  }[pedido.metodo];

  document.getElementById('checkoutContent').hidden = true;
  const box = document.getElementById('checkoutSuccess');
  box.hidden = false;
  box.innerHTML = `
    <div class="co-success-icon">${ICONS.check}</div>
    <div class="section-tag">Pedido ${esc(pedido.numero)}</div>
    <h2 class="section-title">${pedido.metodo === 'whatsapp' ? '¡Reserva' : '¡Pedido'} <em>recibido!</em></h2>
    <p class="co-success-sub">Gracias, ${esc(pedido.cliente.nombre.split(' ')[0])}. Te contactaremos al ${esc(pedido.cliente.telefono)} para coordinar la entrega.</p>
    <div class="co-success-body">${instrucciones}</div>
    ${!emailOk && pedido.metodo !== 'whatsapp' ? `
      <div class="co-warning">No pudimos registrar tu pedido automáticamente. Para asegurarte de que lo recibamos, envianos el detalle por WhatsApp.
        <a class="whatsapp-btn" href="${waLink(mensajeWhatsApp(pedido))}" target="_blank" rel="noopener">${ICONS.wa} Enviar pedido por WhatsApp</a>
      </div>` : ''}
    <button class="btn-outline" onclick="cerrarCheckout()">Seguir comprando</button>`;
}

function copiar(texto, btn) {
  navigator.clipboard?.writeText(texto).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  });
}

// Retorno desde Mercado Pago (back_urls → /tienda?pago=...&pedido=...)
// El aviso al administrador lo envía el servidor (api/mp-webhook.php) tras verificar el pago con Mercado Pago.
function revisarRetornoMP() {
  const params = new URLSearchParams(location.search);
  const pago = params.get('pago');
  if (!pago) return;
  const numero = params.get('pedido') || '';
  const ultimo = storageGet(LAST_ORDER_KEY, null);

  const textos = {
    aprobado: ['¡Pago aprobado!', `Recibimos el pago del pedido ${numero}. Te contactaremos para coordinar la entrega.`],
    pendiente: ['Pago pendiente', `El pago del pedido ${numero} está siendo procesado. Te avisaremos cuando se acredite.`],
    rechazado: ['El pago no se completó', `El pedido ${numero} sigue reservado. Podés reintentar o coordinar otro medio de pago por WhatsApp.`],
  };
  const [titulo, texto] = textos[pago] || textos.pendiente;

  const banner = document.getElementById('paymentBanner');
  if (banner) {
    banner.className = `payment-banner ${pago}`;
    banner.hidden = false;
    banner.innerHTML = `<div><strong>${titulo}</strong><span>${esc(texto)}</span></div>
      ${pago === 'rechazado' && ultimo ? `<a class="whatsapp-btn" href="${waLink(ultimo.mensaje)}" target="_blank" rel="noopener">${ICONS.wa} Coordinar por WhatsApp</a>` : ''}
      <button class="cart-close" onclick="this.parentElement.hidden = true" aria-label="Cerrar">×</button>`;
  }
  ['pago', 'pedido', 'payment_id', 'status', 'collection_id', 'collection_status', 'external_reference', 'payment_type',
    'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'].forEach(k => params.delete(k));
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

// ════════════════════════════════════════════════════════════
//  CAPAS (drawer / modales), AVISOS Y MARKUP COMPARTIDO
// ════════════════════════════════════════════════════════════
let capaAbierta = [];

function abrirCapa(id) {
  const el = document.getElementById(id);
  el.classList.add('open');
  document.getElementById(id + 'Overlay')?.classList.add('open');
  document.body.classList.add('no-scroll');
  capaAbierta = capaAbierta.filter(x => x !== id).concat(id);
  setTimeout(() => el.querySelector('[data-autofocus], button, input')?.focus({ preventScroll: true }), 50);
}

function cerrarCapa(id) {
  document.getElementById(id)?.classList.remove('open');
  document.getElementById(id + 'Overlay')?.classList.remove('open');
  capaAbierta = capaAbierta.filter(x => x !== id);
  if (!capaAbierta.length) document.body.classList.remove('no-scroll');
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const ultima = capaAbierta[capaAbierta.length - 1];
  if (ultima === 'productModal') cerrarProducto();
  else if (ultima === 'checkoutModal') cerrarCheckout();
  else if (ultima === 'cartSidebar') toggleCart(false);
  else if (document.getElementById('shopFilters')?.classList.contains('open')) toggleFiltros(false);
});

function mostrarAviso(titulo, texto, conCarrito) {
  const n = document.getElementById('notification');
  n.innerHTML = `<div class="notification-title">${esc(titulo)}</div>
    <div class="notification-text">${esc(texto)}</div>
    ${conCarrito ? '<button class="notification-link" onclick="toggleCart(true)">Ver carrito →</button>' : ''}`;
  n.classList.add('show');
  clearTimeout(n._timeout);
  n._timeout = setTimeout(() => n.classList.remove('show'), 3500);
}

function inyectarMarkup() {

  document.body.insertAdjacentHTML('beforeend', `
    <div class="notification" id="notification" role="status" aria-live="polite"></div>

    <!-- Carrito -->
    <div class="cart-overlay" id="cartSidebarOverlay" onclick="toggleCart(false)"></div>
    <aside class="cart-sidebar" id="cartSidebar" aria-label="Carrito de compras">
      <div class="cart-header">
        <div><span class="cart-title">Tu Carrito</span><span class="cart-count" id="cartCount">0</span></div>
        <button class="cart-close" onclick="toggleCart(false)" aria-label="Cerrar carrito">×</button>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-footer" id="cartFooter" hidden>
        <div class="cart-total-row">
          <span class="cart-total-label">Subtotal</span>
          <span class="cart-total-amount" id="cartTotal">$0</span>
        </div>
        <p class="cart-note">${CFG.envio.habilitado ? 'Retiro gratis en el local o envío a todo el país.' : 'Retiro en el local.'}</p>
        <button class="checkout-btn" onclick="abrirCheckout()">Finalizar compra →</button>
        <button class="whatsapp-btn" onclick="abrirCheckout('whatsapp')">${ICONS.wa} Reservar por WhatsApp</button>
      </div>
    </aside>

    <!-- Ficha de producto -->
    <div class="modal-overlay" id="productModalOverlay" onclick="cerrarProducto()"></div>
    <div class="product-modal" id="productModal" role="dialog" aria-modal="true" aria-labelledby="productModalTitle">
      <button class="modal-x" onclick="cerrarProducto()" aria-label="Cerrar">${ICONS.close}</button>
      <div class="product-modal-body" id="productModalBody"></div>
    </div>

    <!-- Checkout -->
    <div class="modal-overlay" id="checkoutModalOverlay" onclick="cerrarCheckout()"></div>
    <div class="co-modal" id="checkoutModal" role="dialog" aria-modal="true" aria-label="Finalizar compra">
      <button class="modal-x" onclick="cerrarCheckout()" aria-label="Cerrar">${ICONS.close}</button>

      <div class="co-content" id="checkoutContent">
        <div class="co-main">
          <div class="co-head">
            <div class="section-tag">Checkout</div>
            <h2 class="co-title">Finalizar compra</h2>
            <div class="co-progress">
              <div class="co-progress-step" data-step="1"><span>1</span>Datos</div>
              <div class="co-progress-step" data-step="2"><span>2</span>Entrega y pago</div>
              <div class="co-progress-step" data-step="3"><span>3</span>Confirmar</div>
            </div>
          </div>

          <div class="co-error" id="coError" role="alert" hidden></div>

          <!-- Paso 1 -->
          <div class="co-step" data-step="1">
            <div class="co-fields">
              <div class="co-field full"><label for="coName">Nombre y apellido *</label><input id="coName" autocomplete="name" placeholder="María García" data-autofocus></div>
              <div class="co-field"><label for="coPhone">Teléfono / WhatsApp *</label><input id="coPhone" type="tel" autocomplete="tel" placeholder="341 000-0000"></div>
              <div class="co-field"><label for="coEmail">Email *</label><input id="coEmail" type="email" autocomplete="email" placeholder="tu@email.com"></div>
              <div class="co-field"><label for="coInvoice">Facturación</label>
                <select id="coInvoice"><option>Consumidor final</option><option>Factura A</option><option>Factura B</option></select>
              </div>
              <div class="co-field"><label for="coDoc">DNI / CUIT</label><input id="coDoc" inputmode="numeric" placeholder="Opcional"></div>
            </div>
            <div class="co-nav"><button class="checkout-next-btn" onclick="irPaso(2)">Continuar →</button></div>
          </div>

          <!-- Paso 2 -->
          <div class="co-step" data-step="2" hidden>
            <div class="co-subtitle">¿Cómo querés recibirlo?</div>
            <div class="co-options two">
              <label class="co-option">
                <input type="radio" name="coEntrega" value="retiro" onchange="co.entrega = this.value; renderCheckout()">
                <span class="co-option-icon">${ICONS.store}</span>
                <span class="co-option-text"><strong>Retiro en el local</strong><small>${esc(CFG.local.direccion)} · Gratis</small></span>
                <span class="co-option-radio"></span>
              </label>
              ${CFG.envio.habilitado ? `
              <label class="co-option">
                <input type="radio" name="coEntrega" value="envio" onchange="co.entrega = this.value; renderCheckout()">
                <span class="co-option-icon">${ICONS.truck}</span>
                <span class="co-option-text"><strong>Envío a domicilio</strong><small>${esc(CFG.envio.texto)}</small></span>
                <span class="co-option-radio"></span>
              </label>` : ''}
            </div>
            <div class="co-fields" id="coShippingFields" hidden>
              <div class="co-field full"><label for="coAddress">Dirección *</label><input id="coAddress" autocomplete="street-address" placeholder="Calle, número, piso/depto"></div>
              <div class="co-field"><label for="coCity">Ciudad *</label><input id="coCity" autocomplete="address-level2"></div>
              <div class="co-field"><label for="coProvince">Provincia *</label><input id="coProvince" autocomplete="address-level1" value="Santa Fe"></div>
              <div class="co-field"><label for="coZip">Código postal *</label><input id="coZip" autocomplete="postal-code" inputmode="numeric"></div>
            </div>

            <div class="co-subtitle">¿Cómo querés pagar?</div>
            <div class="co-options" id="coMetodos"></div>

            <div class="co-field full"><label for="coNotes">Notas del pedido</label><textarea id="coNotes" placeholder="Horario de entrega, combinación de colores, consultas..."></textarea></div>
            <div class="co-nav">
              <button class="checkout-back-btn" onclick="irPaso(1)">← Volver</button>
              <button class="checkout-next-btn" onclick="irPaso(3)">Revisar pedido →</button>
            </div>
          </div>

          <!-- Paso 3 -->
          <div class="co-step" data-step="3" hidden>
            <div class="co-review" id="coReview"></div>
            <div class="co-nav">
              <button class="checkout-back-btn" onclick="irPaso(2)">← Volver</button>
              <button class="checkout-next-btn" id="coSubmit" onclick="confirmarPedido()">Confirmar pedido →</button>
            </div>
          </div>
        </div>

        <aside class="co-summary">
          <div class="co-subtitle">Resumen del pedido</div>
          <div class="co-sum-items" id="coSummaryItems"></div>
          <div class="co-sum-totals" id="coSummaryTotals"></div>
          <div class="co-secure">${ICONS.shield} Tus datos se usan solo para gestionar el pedido.</div>
        </aside>
      </div>

      <div class="co-success" id="checkoutSuccess" hidden></div>
    </div>`);
}

// ── INIT ──
async function initTienda() {
  inyectarMarkup();
  document.body.dataset.title = document.title;

  try {
    await cargarCatalogo();
  } catch (err) {
    console.error('Error al cargar el catálogo:', err);
    const target = document.getElementById('shopGrid') || document.getElementById('featuredGrid');
    if (target) target.innerHTML = `<div class="shop-empty"><div class="shop-empty-title">No pudimos cargar los productos</div>
      <p>Intentá recargar la página o consultanos por WhatsApp.</p></div>`;
    return;
  }

  cargarCarrito();
  renderCarrito();
  renderDestacados();
  initPaginaProducto();

  if (document.getElementById('shopGrid')) {
    leerURL();
    initFiltros();
    renderTienda();
    revisarRetornoMP();
  }
}

initTienda();
