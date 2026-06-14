// ── CONFIG ──
const CONFIG = {
  // Cambiar por la contraseña deseada y generar su hash SHA-256
  // Hash por defecto: admin123
  passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'
};

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let products = [];
let editingId = null;

// ── AUTH ──
document.getElementById('loginBtn').addEventListener('click', checkPassword);
document.getElementById('passwordInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkPassword();
});

async function checkPassword() {
  const input = document.getElementById('passwordInput').value;
  const hash = await sha256(input);
  if (hash === CONFIG.passwordHash) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminApp').style.display = 'block';
    loadProducts();
  } else {
    document.getElementById('loginError').textContent = 'Contraseña incorrecta';
    document.getElementById('passwordInput').value = '';
    document.getElementById('passwordInput').focus();
  }
}

// ── LOAD ──
async function loadProducts() {
  try {
    const res = await fetch('../data/products.json');
    products = await res.json();
    renderProducts();
  } catch (err) {
    console.error('Error al cargar:', err);
    products = [];
    renderProducts();
  }
}

// ── RENDER ──
function renderProducts() {
  const container = document.getElementById('productList');
  const count = document.getElementById('productCount');
  count.textContent = `${products.length} producto${products.length !== 1 ? 's' : ''}`;

  if (products.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:80px 0;color:rgba(255,255,255,0.25);font-size:14px;">
      <p>No hay productos todavía.</p>
      <p style="margin-top:8px;">Hacé clic en <strong style="color:var(--gold);">+ Nuevo Producto</strong> para empezar.</p>
    </div>`;
    return;
  }

  container.innerHTML = products.map(p => {
    const stockLabel = p.stock > 10 ? 'in-stock' : p.stock > 0 ? 'low-stock' : 'out-stock';
    const stockText = p.stock > 0 ? p.stock + ' uds.' : 'Sin stock';
    const thumb = p.image
      ? `<img src="${p.image}" alt="${p.name}">`
      : `<span class="no-img">—</span>`;

    return `
      <div class="product-card" data-id="${p.id}">
        <div class="product-thumb">${thumb}</div>
        <div class="product-meta">
          <div class="product-meta-name">${p.name}</div>
          <div class="product-meta-category">${categoryLabel(p.category)}</div>
          <div class="product-meta-desc">${p.desc}</div>
        </div>
        <span class="product-stock-badge ${stockLabel}">${stockText}</span>
        <div class="product-price-display">${p.price}</div>
        <div class="product-actions">
          <button class="btn-icon" onclick="editProduct(${p.id})" title="Editar">✎</button>
          <button class="btn-icon delete" onclick="deleteProduct(${p.id})" title="Eliminar">✕</button>
        </div>
      </div>`;
  }).join('');
}

function categoryLabel(cat) {
  return cat === 'industrial' ? 'Industrial' : cat === 'familiar' ? 'Familiar' : 'Repuesto';
}

// ── FORM ──
function openForm(product) {
  editingId = product ? product.id : null;
  document.getElementById('formTitle').textContent = product ? 'Editar Producto' : 'Nuevo Producto';
  document.getElementById('productId').value = product ? product.id : '';
  document.getElementById('productName').value = product ? product.name : '';
  document.getElementById('productCategory').value = product ? product.category : 'industrial';
  document.getElementById('productDesc').value = product ? product.desc : '';
  document.getElementById('productPrice').value = product ? product.price : '';
  document.getElementById('productPriceNum').value = product ? product.priceNum : '';
  document.getElementById('productStock').value = product ? product.stock : '';
  document.getElementById('productBadge').value = product ? product.badge || '' : '';
  document.getElementById('productImage').value = product ? product.image || '' : '';
  document.getElementById('productImageFile').value = '';
  document.getElementById('fileInputLabel').textContent = 'Seleccionar archivo';
  updateImagePreview();

  document.getElementById('formOverlay').style.display = 'block';
  document.getElementById('formModal').style.display = 'block';
  document.getElementById('productName').focus();
}

function closeForm() {
  document.getElementById('formOverlay').style.display = 'none';
  document.getElementById('formModal').style.display = 'none';
}

// Image preview & file upload
document.getElementById('productImage').addEventListener('input', updateImagePreview);
document.getElementById('productImageFile').addEventListener('change', handleFileUpload);

function updateImagePreview() {
  const preview = document.getElementById('imagePreview');
  const url = document.getElementById('productImage').value;
  if (url) {
    preview.innerHTML = `<img src="${url}" onerror="this.parentElement.classList.add('empty')" onload="this.parentElement.classList.remove('empty')">`;
    preview.classList.remove('empty');
  } else {
    preview.innerHTML = '';
    preview.classList.add('empty');
  }
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const label = document.getElementById('fileInputLabel');
  label.textContent = file.name;

  const reader = new FileReader();
  reader.onload = function(ev) {
    const dataUrl = ev.target.result;
    document.getElementById('productImage').value = dataUrl;
    updateImagePreview();
  };
  reader.readAsDataURL(file);
}

// ── SAVE ──
function saveProduct(e) {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const name = document.getElementById('productName').value.trim();
  const category = document.getElementById('productCategory').value;
  const desc = document.getElementById('productDesc').value.trim();
  const price = document.getElementById('productPrice').value.trim() || 'Consultar';
  const priceNum = parseFloat(document.getElementById('productPriceNum').value) || 0;
  const stock = parseInt(document.getElementById('productStock').value) || 0;
  const badge = document.getElementById('productBadge').value.trim() || null;
  const image = document.getElementById('productImage').value.trim() || '';

  if (!name || !desc) return;

  if (id) {
    // Edit existing
    const idx = products.findIndex(p => p.id === parseInt(id));
    if (idx !== -1) {
      products[idx] = { ...products[idx], name, category, desc, price, priceNum, stock, badge, image };
    }
  } else {
    // New product
    const maxId = products.reduce((max, p) => Math.max(max, p.id), 0);
    products.push({ id: maxId + 1, name, category, desc, price, priceNum, stock, badge, image });
  }

  renderProducts();
  closeForm();
}

// ── EDIT ──
function editProduct(id) {
  const product = products.find(p => p.id === id);
  if (product) openForm(product);
}

// ── DELETE ──
function deleteProduct(id) {
  const product = products.find(p => p.id === id);
  if (!product) return;
  if (!confirm(`¿Eliminar "${product.name}"?`)) return;
  products = products.filter(p => p.id !== id);
  renderProducts();
}

// ── EXPORT JSON ──
function exportJSON() {
  const json = JSON.stringify(products, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'products.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── IMPORT JSON ──
function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('El archivo debe ser un array de productos');
      if (!confirm(`Se reemplazarán todos los productos actuales (${products.length}) por los del archivo (${data.length}). ¿Continuar?`)) return;
      products = data;
      renderProducts();
    } catch (err) {
      alert('Error al leer el archivo: ' + err.message);
    }
  };
  input.click();
}
