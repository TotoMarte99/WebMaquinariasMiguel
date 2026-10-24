// ── CONFIGURACIÓN DE LA TIENDA ──
// Datos públicos de la tienda (se muestran al cliente). Las credenciales
// de EmailJS siguen en js/config.js (gitignored). Los medios de pago se
// configuran desde el panel de administración (/admin → Pagos).
const TIENDA_CONFIG = {
  // Catálogo público (lo genera el servidor a partir del catálogo que se edita en /admin)
  catalogoUrl: '/api/catalogo.php',

  // WhatsApp para reservas y comprobantes (formato internacional, sin + ni espacios)
  whatsapp: '5493414551334',

  // Email que recibe las notificaciones de pedidos
  emailAdmin: 'maquinariasmiguel@hotmail.com',

  local: {
    direccion: 'Ricardo Núñez 602, Rosario, Santa Fe',
    horario: 'Lunes a Viernes de 7:30 a 13:00 hs',
  },

  // Horas que se mantiene una reserva / pedido sin pagar
  reservaHoras: 48,

  envio: {
    habilitado: true,
    texto: 'Enviamos a todo el país. El costo del envío se coordina por WhatsApp según destino.',
  },

  // Descuentos, datos bancarios, Mercado Pago y cuotas se configuran en el panel → Pagos
};
