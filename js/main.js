
// ── PRODUCTS DATA ──
let products = [];
let cart = [];
let currentFilter = 'all';

async function loadProducts() {
  try {
    const res = await fetch('data/products.json');
    products = await res.json();
    renderProducts('all');
  } catch (err) {
    console.error('Error al cargar productos:', err);
  }
}

// ── SVG ICONS for products ──
const machineIcons = {
  industrial: `<svg viewBox="0 0 80 80" stroke="currentColor" fill="none" stroke-width="1.2"><rect x="15" y="25" width="50" height="30" rx="3"/><path d="M15 35h50"/><circle cx="40" cy="50" r="6"/><circle cx="40" cy="50" r="2"/><path d="M20 25V20M60 25V20"/><rect x="30" y="15" width="20" height="5" rx="1"/><path d="M40 44v-9M36 41l4-6 4 6"/></svg>`,
  familiar: `<svg viewBox="0 0 80 80" stroke="currentColor" fill="none" stroke-width="1.2"><path d="M20 55 Q20 30 40 25 Q60 20 60 45"/><path d="M25 55h30"/><circle cx="40" cy="50" r="5"/><circle cx="40" cy="50" r="1.5"/><path d="M40 45V30"/><path d="M30 30h20"/><circle cx="55" cy="32" r="3"/></svg>`,
  repuesto: `<svg viewBox="0 0 80 80" stroke="currentColor" fill="none" stroke-width="1.2"><path d="M40 20 L45 28 L55 25 L54 35 L62 38 L56 45 L62 52 L54 55 L55 65 L45 62 L40 70 L35 62 L25 65 L26 55 L18 52 L24 45 L18 38 L26 35 L25 25 L35 28 Z"/><circle cx="40" cy="45" r="10"/><circle cx="40" cy="45" r="4"/></svg>`
};

function renderProducts(filter) {
  const grid = document.getElementById('productsGrid');
  const filtered = filter === 'all' ? products : products.filter(p => p.category === filter);
  grid.innerHTML = filtered.map(p => `
    <div class="product-card reveal visible" data-id="${p.id}">
      <div class="product-image">
        <div class="product-image-inner" style="color: rgba(255,193,7,0.3);">
          ${p.image ? `<img src="${p.image}" alt="${p.name}" style="width:100%;height:100%;object-fit:contain;">` : machineIcons[p.category]}
        </div>
        ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
        ${p.stock !== undefined ? `<div class="product-stock" style="position:absolute;bottom:14px;right:14px;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;font-weight:500;padding:3px 8px;background:rgba(0,0,0,0.6);color:${p.stock > 0 ? 'rgba(255,255,255,0.6)' : '#e24b4a'};">${p.stock > 0 ? p.stock + ' uds.' : 'Sin stock'}</div>` : ''}
      </div>
      <div class="product-info">
        <div class="product-category">${p.category === 'industrial' ? 'Industrial' : p.category === 'familiar' ? 'Familiar' : 'Repuesto'}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-price-row">
          <div class="product-price">${p.price}</div>
          <button class="add-btn" onclick="addToCart(${p.id})" title="Agregar al carrito">
            <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function filterProducts(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderProducts(cat);
}

function addToCart(id) {
  const product = products.find(p => p.id === id);
  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  updateCartUI();
  showNotification(product.name);
}

function removeFromCart(id) {
  cart = cart.filter(c => c.id !== id);
  updateCartUI();
  renderCartItems();
}

function updateCartUI() {
  const total = cart.reduce((sum, item) => sum + item.priceNum * item.qty, 0);
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  document.getElementById('cartCount').textContent = count;
  const bubble = document.getElementById('cartBubble');
  bubble.textContent = count;
  bubble.classList.toggle('show', count > 0);
  document.getElementById('cartTotal').textContent = total > 0
    ? '$' + total.toLocaleString('es-AR')
    : 'A consultar';
  document.getElementById('cartFooter').style.display = cart.length ? 'block' : 'none';
  renderCartItems();
}

function renderCartItems() {
  const container = document.getElementById('cartItems');
  if (cart.length === 0) {
    container.innerHTML = `<div class="cart-empty"><svg viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg><p>Tu carrito está vacío.<br>Explorá nuestros productos.</p></div>`;
    return;
  }
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-image" style="color: rgba(255,193,7,0.4);">
        ${machineIcons[item.category]}
      </div>
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${item.price} ${item.qty > 1 ? '× ' + item.qty : ''}</div>
      </div>
      <button class="cart-item-remove" onclick="removeFromCart(${item.id})">×</button>
    </div>
  `).join('');
}

function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
  document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

function checkoutWhatsApp() {
  const items = cart.map(c => `• ${c.qty}x ${c.name}`).join('\n');
  const msg = encodeURIComponent(`Hola! Me interesa consultar sobre los siguientes productos:\n\n${items}\n\nQuedo esperando su respuesta, gracias!`);
  window.open(`https://wa.me/5493414551334?text=${msg}`, '_blank');
}

function showNotification(name) {
  const n = document.getElementById('notification');
  document.getElementById('notification-text').textContent = name + ' fue añadido';
  n.classList.add('show');
  clearTimeout(n._timeout);
  n._timeout = setTimeout(() => n.classList.remove('show'), 3000);
}

// ── EMAILJS CONFIG ── Reemplazá estos valores con los de tu cuenta emailjs.com
const EMAILJS_PUBLIC_KEY  = '8cYzkUl-Fgil8U2ow';
const EMAILJS_SERVICE_ID  = 'service_v0gkl4y';
const EMAILJS_TEMPLATE_ID = 'template_m1jf2n1';

emailjs.init(EMAILJS_PUBLIC_KEY);

function submitAppointment() {
  const name    = document.getElementById('apptName').value.trim();
  const phone   = document.getElementById('apptPhone').value.trim();
  const service = document.getElementById('apptService').value;
  const date    = document.getElementById('apptDate').value;
  const desc    = document.getElementById('apptDesc').value.trim();

  const errors = [];
  if (!name)    errors.push('Nombre y apellido');
  if (!phone)   errors.push('Teléfono / WhatsApp');
  if (!service) errors.push('Tipo de servicio');
  if (!date)    errors.push('Fecha preferida');

  if (errors.length) {
    alert('Por favor completá los siguientes campos:\n• ' + errors.join('\n• '));
    return;
  }

  const btn = document.querySelector('.form-submit');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    cliente_nombre:  name,
    cliente_telefono: phone,
    servicio:        service,
    fecha_preferida: date,
    descripcion:     desc || '(sin descripción)',
    to_email:        'maquinariasmiguel@hotmail.com',
  }).then(() => {
    btn.textContent = 'Confirmar Turno →';
    btn.disabled = false;

    document.getElementById('apptName').value    = '';
    document.getElementById('apptPhone').value   = '';
    document.getElementById('apptService').value = '';
    document.getElementById('apptDate').value    = '';
    document.getElementById('apptDesc').value    = '';

    alert('¡Turno solicitado! Te contactaremos pronto.');

  }).catch((err) => {
    btn.textContent = 'Confirmar Turno →';
    btn.disabled = false;
    console.error('EmailJS error:', err);
    alert('Hubo un error al enviar el turno. Intentá de nuevo o contactanos por WhatsApp.');
  });
}

// ── CHECKOUT ──
function openCheckout() {
  toggleCart();
  setTimeout(() => {
    const modal = document.getElementById('checkoutModal');
    const overlay = document.getElementById('checkoutOverlay');
    modal.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    checkoutStep(1);
  }, 400);
}

function closeCheckout() {
  const modal = document.getElementById('checkoutModal');
  const overlay = document.getElementById('checkoutOverlay');
  modal.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCheckoutItems() {
  const container = document.getElementById('checkoutItems');
  const total = cart.reduce((sum, item) => sum + item.priceNum * item.qty, 0);
  container.innerHTML = cart.map(item => `
    <div class="checkout-item">
      <div class="checkout-item-left">
        <span class="checkout-item-qty">${item.qty}x</span>
        <span class="checkout-item-name">${item.name}</span>
      </div>
      <span class="checkout-item-price">${item.price}</span>
    </div>
  `).join('');
  document.getElementById('checkoutTotal').textContent = total > 0
    ? '$' + total.toLocaleString('es-AR')
    : 'A consultar';
}

function checkoutStep(step) {
  [1, 2, 3].forEach(s => {
    document.getElementById('checkoutStep' + s).style.display = s === step ? 'block' : 'none';
  });
  document.querySelectorAll('.checkout-steps .step').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle('active', s === step);
    el.classList.toggle('done', s < step);
  });
  if (step === 1) renderCheckoutItems();
  if (step === 2) renderCheckoutItems();
  if (step === 3) renderCheckoutConfirm();
}

function renderCheckoutConfirm() {
  const name = document.getElementById('coName').value.trim() || '(sin nombre)';
  const phone = document.getElementById('coPhone').value.trim() || '(sin teléfono)';
  const email = document.getElementById('coEmail').value.trim() || '—';
  const address = document.getElementById('coAddress').value.trim() || '—';
  const notes = document.getElementById('coNotes').value.trim() || '—';

  const items = cart.map(c => `  ${c.qty}x ${c.name} = ${c.price}`).join('\n');
  const total = cart.reduce((sum, item) => sum + item.priceNum * item.qty, 0);
  const totalStr = total > 0 ? '$' + total.toLocaleString('es-AR') : 'A consultar';

  document.getElementById('checkoutConfirm').innerHTML =
`━━━  DATOS DEL CLIENTE  ━━━
Nombre:    ${name}
Teléfono:  ${phone}
Email:     ${email}
Dirección: ${address}
Notas:     ${notes}

━━━  PRODUCTOS  ━━━
${items}

━━━  TOTAL  ━━━
${totalStr}`;
}

function submitCheckout() {
  const name = document.getElementById('coName').value.trim();
  const phone = document.getElementById('coPhone').value.trim();
  if (!name || !phone) {
    checkoutStep(2);
    if (!name) document.getElementById('coName').focus();
    else document.getElementById('coPhone').focus();
    showNotification('Completá nombre y teléfono');
    return;
  }

  const email = document.getElementById('coEmail').value.trim();
  const address = document.getElementById('coAddress').value.trim();
  const notes = document.getElementById('coNotes').value.trim();

  let msg = '🛒 *NUEVO PEDIDO - Maquinarias Miguel*\n\n';
  msg += '*Datos del cliente:*\n';
  msg += `Nombre: ${name}\n`;
  msg += `Teléfono: ${phone}\n`;
  if (email) msg += `Email: ${email}\n`;
  if (address) msg += `Dirección: ${address}\n`;
  if (notes) msg += `Notas: ${notes}\n`;
  msg += '\n*Productos:*\n';
  cart.forEach(c => {
    msg += `• ${c.qty}x ${c.name} — ${c.price}\n`;
  });
  const total = cart.reduce((sum, item) => sum + item.priceNum * item.qty, 0);
  if (total > 0) {
    msg += `\n*Total: $${total.toLocaleString('es-AR')}*`;
  }

  window.open(`https://wa.me/5493414551334?text=${encodeURIComponent(msg)}`, '_blank');
  closeCheckout();
  cart = [];
  updateCartUI();
  showNotification('¡Pedido enviado! Te responderemos pronto');
}

// ── CURSOR ──
const cursor = document.getElementById('cursor');
const ring = document.getElementById('cursorRing');
let mx = 0, my = 0, rx = 0, ry = 0;
document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });
function animateCursor() {
  cursor.style.transform = `translate(${mx - 6}px, ${my - 6}px)`;
  rx += (mx - rx) * 0.12; ry += (my - ry) * 0.12;
  ring.style.transform = `translate(${rx - 18}px, ${ry - 18}px)`;
  requestAnimationFrame(animateCursor);
}
animateCursor();
document.querySelectorAll('a, button').forEach(el => {
  el.addEventListener('mouseenter', () => { cursor.style.transform += ' scale(1.6)'; ring.style.transform += ' scale(1.5)'; });
  el.addEventListener('mouseleave', () => {});
});

// ── SCROLL ──
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
});

// ── REVEAL ON SCROLL ──
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── INIT ──
loadProducts();
