# Tienda online, panel de administración y SEO

El sitio corre en **Hostinger**, con PHP y `.htaccess`. Las páginas públicas se generan en el servidor (para Google) y el panel de administración guarda todo en una carpeta privada.

## Estructura

| Ruta | Qué es |
|---|---|
| `/` (`index.html`) | Home con productos destacados |
| `/tienda`, `/tienda/{categoria}` (`tienda.php`) | Catálogo con filtros. Cada categoría es una página indexable |
| `/producto/{slug}` (`producto.php`) | Ficha de producto con datos estructurados para Google |
| `/sitemap.xml` (`sitemap.php`) | Sitemap automático, con imágenes |
| `/admin/` | Panel de administración |
| `api/admin.php` | API del panel (sesión + CSRF + 2FA) |
| `api/catalogo.php` | Catálogo público (sin notas internas ni productos ocultos) |
| `api/crear-preferencia.php` | Crea el cobro de Mercado Pago (precio, plan y recargo calculados en el servidor) |
| `api/mp-webhook.php` | Recibe los avisos de pago de Mercado Pago, los verifica y te manda el email |
| `inc/pagos.php`, `js/precios.js` | Descuentos, planes de cuotas y costos (mismas fórmulas en servidor y navegador) |
| `inc/` | Código PHP compartido (bloqueado desde la web) |
| `js/tienda.js`, `css/tienda.css` | Carrito, checkout, filtros y ficha interactiva |
| `js/tienda-config.js` | Datos de la tienda: WhatsApp, dirección, horario, envíos |
| `img/productos/` | Imágenes subidas desde el panel (no se permite ejecutar código ahí) |

## Carpeta privada

La primera vez que se usa el sitio se crea **`mm-privado/`** al lado de `public_html` (fuera de la web).
Si el hosting no lo permite, se usa `privado/`, que está bloqueada por `.htaccess`. Ahí se guardan:

- `config.php`: claves generadas automáticamente, el **token de instalación**, `url_sitio`, `requerir_2fa` y el access token de Mercado Pago (se carga desde el panel).
- `pagos.json`: medios de pago, descuentos y planes de cuotas (se edita en el panel → **Pagos y cuotas**).
- `catalogo.json`: el catálogo que edita el panel (el **catálogo maestro**).
- `admin.sqlite`: usuarios, invitaciones, intentos de acceso y registro de actividad.
- `respaldos/`: copia del catálogo antes de cada cambio (se guardan las últimas 40).
- `sesiones/`: sesiones del panel.

> `jsonProductos/catalogo_tienda.json` se usa solo como **semilla** la primera vez. Después, los productos se editan desde el panel.
> Subir una versión nueva del sitio **no pisa** los cambios hechos en el panel.

**Hacé una copia periódica de la carpeta privada** (por ejemplo, con los backups de Hostinger).

## Puesta en marcha en Hostinger

1. Subí los archivos a `public_html`.
2. En hPanel → **Seguridad → SSL**: activá **Forzar HTTPS**.
3. Entrá a `https://maquinariasmiguel.com/admin/`. Eso crea la carpeta privada y su `config.php`.
4. Con el **Administrador de archivos** abrí `mm-privado/config.php` (o `public_html/privado/config.php`) y copiá el valor de `token_instalacion`.
5. En el panel, completá el formulario **Crear administrador** con ese token.
6. Escaneá el QR con Google Authenticator, Microsoft Authenticator o Authy, y **guardá los 10 códigos de recuperación**.
7. Completá `js/config.js` (EmailJS) y revisá `js/tienda-config.js` (WhatsApp, dirección).
8. En el panel → **Pagos y cuotas**: cargá los datos bancarios, los descuentos, el access token de Mercado Pago y los planes de cuotas (ver abajo).

## Pagos y cuotas

Todo se configura en el panel → **Pagos y cuotas** (solo administradores):

- **Efectivo y transferencia:** descuento (%) y datos bancarios. El efectivo puede quedar limitado a retiro en el local.
- **Mercado Pago:**
  - access token: se pide tu contraseña del panel para cambiarlo y nunca se vuelve a mostrar;
  - botón *Probar conexión*;
  - comisión según tu plazo de acreditación;
  - IVA sobre los costos;
  - email que recibe los avisos de pago.
- **Planes de cuotas:** podés crear todos los que quieras. Cada uno tiene:
  - **Sin interés:** el cliente paga el precio de lista en cuotas y vos absorbés el costo, que cargás en "Costo para vos" copiándolo de Mercado Pago → Tu negocio → Costos. **Activá también las cuotas sin interés en tu cuenta de Mercado Pago**: la tienda limita la cantidad de cuotas, pero la promoción la otorga MP.
  - **Con interés:** el interés lo cobra Mercado Pago al cliente. El coeficiente sirve para mostrar una cuota estimada. Cargá TNA, TEA y CFT: la ley exige mostrarlos, junto con el precio de contado.
  - **Recargo** (opcional): se suma al precio cuando el cliente elige ese plan. El panel te sugiere cuánto recargar para recibir lo mismo que en 1 pago.
  - **General:** marcá los planes que aplican a todos los productos por defecto.
- **Simulador de costos:** con un precio de ejemplo muestra, para cada medio de pago, cuánto paga el cliente, la comisión, el costo de las cuotas y **cuánto te queda**.

En cada producto (editor → **Medios de pago y cuotas**) podés:
- usar los planes generales, elegir otros o dejarlo **sin cuotas**;
- poner descuentos propios para efectivo y transferencia;
- ver la calculadora de costos con su precio.

En el carrito solo se ofrecen los planes que tienen **todos** los productos. El servidor vuelve a validar el plan y el precio antes de crear el cobro.

**Webhook (aviso de pagos):** copiá la URL que muestra el panel y pegala en Mercado Pago Developers → tu aplicación → **Webhooks**, evento *Pagos*.
Cuando entra un aviso, el servidor consulta el pago a Mercado Pago con tu token. Recién si está **aprobado** te manda un email y lo registra en *Pagos recibidos*.
Opcional: copiá la *clave secreta* de los webhooks en `config.php` → `'mercadopago_webhook_secret' => '...'` para que además se valide la firma de cada aviso.
El email sale con `mail()` de PHP desde `no-reply@tu-dominio`. Si en Hostinger no llega, creá esa casilla en hPanel → Emails.

## Seguridad del panel

- **Altas solo por invitación:** un administrador genera un enlace de un solo uso que vence en 48 h. El invitado elige su contraseña y nadie más la conoce.
- **Roles:** *Administrador* gestiona todo. *Editor* solo productos y categorías.
- **Contraseñas:** se guardan con Argon2id y piden 12 caracteres como mínimo. No pueden incluir el nombre, el email ni palabras obvias.
- **Verificación en dos pasos obligatoria** (TOTP):
  - el secreto se guarda cifrado con AES-256-GCM
  - cada código sirve una sola vez
  - hay 10 códigos de recuperación de un solo uso
- **Límite de intentos:**
  - 5 intentos fallidos por email + IP bloquean 15 minutos
  - 25 por email, en una hora
  - 5 códigos 2FA incorrectos cierran la sesión
- **Sesiones:**
  - cookie `HttpOnly`, `Secure` y `SameSite=Strict`
  - el ID cambia al iniciar sesión
  - vencen tras 30 minutos sin uso o 12 horas en total
  - se cortan al instante si el usuario se desactiva, cambia su rol o su contraseña
- **CSRF:** cada acción lleva un token, y se verifica el `Origin`.
- **Cabeceras:** CSP estricta (sin scripts inline), anti-iframe y `noindex`.
- **Imágenes:** se validan y se vuelven a generar con GD (WebP, máximo 1600 px).
- **Registro de actividad:** guarda accesos, intentos fallidos y cada cambio, con usuario e IP.
- **Concurrencia:** si dos personas editan a la vez, el segundo cambio se rechaza en lugar de pisar al primero.

**Si un usuario pierde el teléfono**, un administrador puede *Resetear 2FA* desde **Usuarios**.
**Si el único administrador pierde el teléfono y los códigos de recuperación**, desde el Administrador de archivos
cambiá temporalmente `'requerir_2fa' => false` en `config.php`, entrá, volvé a activarlo y configurá el 2FA de nuevo.

Si Hostinger tiene activo su CDN y en *Actividad* todas las IP aparecen iguales, poné `'proxy_confiable' => true` en `config.php`.

## SEO

Ya implementado:

- URLs limpias (`/tienda/hilos`, `/producto/...`) con **redirecciones 301** desde las URLs anteriores (`tienda.html?...`, `index.html`).
- Dominio canónico sin `www`. Cada página tiene `<link rel="canonical">`.
- Títulos y descripciones únicos por página. Los de cada producto se editan en el panel (sección **Google (SEO)**, con vista previa).
- Descripción de cada categoría editable desde **Categorías**: se usa como texto de la página y como meta descripción.
- **Datos estructurados** (schema.org):
  - `LocalBusiness`: dirección, horario y teléfono
  - `Product` + `Offer`: precio, stock y condición; Google los puede mostrar en los resultados
  - `BreadcrumbList`, `ItemList` y `WebSite` con buscador
- Open Graph y Twitter Card, para que los links compartidos por WhatsApp o Facebook muestren foto y precio.
- `sitemap.xml` automático con imágenes, y `robots.txt`.
- Las búsquedas y los filtros de la tienda se marcan `noindex`, para no generar contenido duplicado.
- Caché y compresión configuradas en `.htaccess`.

Para hacer vos (son clave para posicionar la marca):

1. **Google Search Console** (https://search.google.com/search-console): agregá el dominio y enviá `https://maquinariasmiguel.com/sitemap.xml`.
2. **Perfil de Empresa de Google** (Google Maps): es lo que más pesa para búsquedas como “reparación máquinas de coser Rosario”.
   Usá exactamente el mismo nombre, dirección y teléfono que el sitio, y pedí reseñas a los clientes.
3. Subí una imagen de portada de 1200×630 px a `img/og-portada.jpg`: es la que aparece al compartir la home.
4. Reemplazá de a poco las fotos de Mercado Libre por fotos propias, subidas desde el panel.
5. Completá las descripciones de las categorías y las notas pendientes de cada producto (filtro **Con notas para revisar**).

## Probar en local

```
php -S localhost:8000 dev-router.php
```

`dev-router.php` reproduce las reglas de `.htaccess` (en producción ese archivo está bloqueado).
Para no mezclar datos de prueba, podés apuntar la carpeta privada a otro lugar: `MM_PRIVADO=/ruta/de/prueba php -S ...`.

## Notificaciones por email (EmailJS)

1. En EmailJS creá un template con el contenido de `docs/emailjs-template-pedido.html`.
2. Copiá el Template ID en `js/config.js` → `EMAILJS_ORDER_TEMPLATE_ID`.

Cada pedido (transferencia, Mercado Pago, efectivo o reserva por WhatsApp) envía un email al administrador.
El stock **no se descuenta solo** con las ventas: actualizalo desde el panel (se puede editar directo en la lista de productos).
