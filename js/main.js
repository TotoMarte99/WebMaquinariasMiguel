
// ── EMAILJS CONFIG ── credenciales en js/config.js (gitignored)
if (typeof emailjs !== 'undefined' && typeof EMAILJS_PUBLIC_KEY !== 'undefined') emailjs.init(EMAILJS_PUBLIC_KEY);

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

// ── MOBILE MENU ──
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
if (navToggle && navLinks) {
  const setMenu = open => {
    navLinks.classList.toggle('open', open);
    navToggle.classList.toggle('open', open);
    navToggle.setAttribute('aria-expanded', open);
  };
  navToggle.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
}
