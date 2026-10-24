
// ── EMAILJS CONFIG ── credenciales en js/config.js (gitignored)
try {
  if (typeof emailjs !== 'undefined' && typeof EMAILJS_PUBLIC_KEY !== 'undefined') {
    emailjs.init(EMAILJS_PUBLIC_KEY);
  } else {
    console.warn('EmailJS no inicializado: falta js/config.js o la librería de EmailJS.');
  }
} catch (err) {
  console.error('Error al inicializar EmailJS:', err);
}

// ── reCAPTCHA v2 ── se renderiza cuando la API de Google termina de cargar.
// La clave del sitio vive en js/config.js (RECAPTCHA_SITE_KEY).
let recaptchaWidgetId = null;
const recaptchaConfigured =
  typeof RECAPTCHA_SITE_KEY !== 'undefined' &&
  RECAPTCHA_SITE_KEY &&
  !RECAPTCHA_SITE_KEY.startsWith('TU_');

function onRecaptchaLoad() {
  const container = document.getElementById('recaptcha-appt');
  if (!container || typeof grecaptcha === 'undefined') return;
  if (!recaptchaConfigured) {
    // Sin clave real: no rompemos el formulario, solo avisamos en consola.
    console.warn('reCAPTCHA sin configurar: definí RECAPTCHA_SITE_KEY en js/config.js.');
    return;
  }
  try {
    recaptchaWidgetId = grecaptcha.render(container, {
      sitekey: RECAPTCHA_SITE_KEY,
      theme: 'dark',
    });
  } catch (err) {
    console.error('Error al renderizar reCAPTCHA:', err);
  }
}
// Exponer el callback para la API de Google (se llama vía ?onload=onRecaptchaLoad)
window.onRecaptchaLoad = onRecaptchaLoad;

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

  // Verificar que EmailJS esté configurado antes de intentar enviar.
  if (typeof emailjs === 'undefined' ||
      typeof EMAILJS_SERVICE_ID === 'undefined' ||
      EMAILJS_SERVICE_ID.startsWith('TU_')) {
    alert('El envío de turnos todavía no está configurado. Escribinos por WhatsApp y te atendemos al instante.');
    return;
  }

  // Validar reCAPTCHA (si está configurado).
  let captchaToken = '';
  if (recaptchaConfigured) {
    captchaToken = (typeof grecaptcha !== 'undefined' && recaptchaWidgetId !== null)
      ? grecaptcha.getResponse(recaptchaWidgetId)
      : '';
    if (!captchaToken) {
      alert('Por favor confirmá que no sos un robot marcando el reCAPTCHA.');
      return;
    }
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
    'g-recaptcha-response': captchaToken,
  }).then(() => {
    btn.textContent = 'Confirmar Turno →';
    btn.disabled = false;

    document.getElementById('apptName').value    = '';
    document.getElementById('apptPhone').value   = '';
    document.getElementById('apptService').value = '';
    document.getElementById('apptDate').value    = '';
    document.getElementById('apptDesc').value    = '';
    if (recaptchaConfigured && typeof grecaptcha !== 'undefined' && recaptchaWidgetId !== null) {
      grecaptcha.reset(recaptchaWidgetId);
    }

    alert('¡Turno solicitado! Te contactaremos pronto.');

  }).catch((err) => {
    btn.textContent = 'Confirmar Turno →';
    btn.disabled = false;
    if (recaptchaConfigured && typeof grecaptcha !== 'undefined' && recaptchaWidgetId !== null) {
      grecaptcha.reset(recaptchaWidgetId);
    }
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
  window.addEventListener('resize', () => { if (window.innerWidth > 900) setMenu(false); });
}
