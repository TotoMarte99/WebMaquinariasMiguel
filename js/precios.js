// ════════════════════════════════════════════════════════════
//  PRECIOS — descuentos por medio de pago, planes de cuotas y
//  costos para el vendedor. Lo usan la tienda y el panel.
//  Las mismas fórmulas están en inc/pagos.php (servidor).
// ════════════════════════════════════════════════════════════

const Precios = {
  redondear: n => Math.round(n * 100) / 100,

  /** Planes activos que aplican a un producto. */
  planesProducto(producto, pagos) {
    if (!pagos) return [];
    const cfg = producto?.pagos?.planes ?? 'defecto';
    if (cfg === 'ninguno') return [];
    const ids = Array.isArray(cfg) ? cfg : (pagos.planes_por_defecto || []);
    return (pagos.planes || []).filter(pl => pl.activo !== false && ids.includes(pl.id));
  },

  /** Planes que aplican a TODOS los productos de una lista (carrito). */
  planesComunes(productos, pagos) {
    if (!productos.length) return [];
    return productos.map(p => this.planesProducto(p, pagos))
      .reduce((comunes, lista) => comunes.filter(pl => lista.some(x => x.id === pl.id)));
  },

  /** % de descuento de un medio (efectivo / transferencia) para un producto. */
  descuento(producto, pagos, metodo) {
    if (!pagos?.[metodo]?.activo) return 0;
    const propio = producto?.pagos?.[`descuento_${metodo}`];
    return Number(propio ?? pagos[metodo].descuento ?? 0);
  },

  conDescuento(precio, pct) {
    return this.redondear(precio * (1 - pct / 100));
  },

  /** total: lo que cobra la tienda · totalCliente: lo que paga el cliente (estimado si es con interés). */
  plan(precio, plan) {
    const total = this.redondear(precio * (1 + (plan.recargo || 0) / 100));
    const totalCliente = plan.tipo === 'con_interes' ? this.redondear(total * (plan.coeficiente || 1)) : total;
    return { total, totalCliente, cuota: this.redondear(totalCliente / plan.cuotas) };
  },

  /** El plan sin interés (y sin recargo) con más cuotas: el que conviene destacar. */
  mejorPlan(planes) {
    return planes.filter(p => p.tipo === 'sin_interes' && !p.recargo).sort((a, b) => b.cuotas - a.cuotas)[0] || null;
  },

  /** Costos para el vendedor (solo panel: usa la comisión y el costo de cada plan). */
  costos(precio, pagos, plan = null) {
    const mp = pagos.mercadopago;
    const iva = mp.iva_sobre_costos ? 1 + (mp.iva || 0) / 100 : 1;
    const cobrado = plan ? this.plan(precio, plan).total : precio;
    const comision = this.redondear(cobrado * (mp.comision || 0) / 100 * iva);
    const financiacion = plan && plan.tipo === 'sin_interes' ? this.redondear(cobrado * (plan.costo || 0) / 100 * iva) : 0;
    const neto = this.redondear(cobrado - comision - financiacion);
    return { cobrado, comision, financiacion, neto, porcentaje: cobrado ? (1 - neto / cobrado) * 100 : 0 };
  },

  /** Recargo (%) que habría que cobrar en un plan para recibir lo mismo que en 1 pago con Mercado Pago. */
  recargoSugerido(pagos, plan) {
    const mp = pagos.mercadopago;
    const iva = mp.iva_sobre_costos ? 1 + (mp.iva || 0) / 100 : 1;
    const com = (mp.comision || 0) / 100 * iva;
    const fin = plan.tipo === 'sin_interes' ? (plan.costo || 0) / 100 * iva : 0;
    if (com + fin >= 1) return null;
    return ((1 - com) / (1 - com - fin) - 1) * 100;
  },
};
