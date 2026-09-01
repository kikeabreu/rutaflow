# RutaFlow: plan de capitalizacion inicial

## Oferta inicial

RutaFlow debe vender ahorro de tiempo y claridad de utilidad real, no solo "registro de viajes".

- Gratis: registro manual, 30 viajes al mes, resumen diario.
- Pro: viajes ilimitados, GPS automatico, Foto IA, asesor IA y proximamente reportes semanales.
- Precio sugerido de validacion: MXN 99/mes o MXN 899/anio.

## Por que empezar con PWA

La app ya esta hecha en Expo, asi que puede salir como web instalable antes de pasar por tiendas. Esto permite vender desde la pagina con un link de pago y validar si los conductores pagan antes de invertir tiempo en App Store, Play Store, revisiones y politicas de compra dentro de la app.

Android: el usuario abre la web en Chrome y usa "Instalar app".

iPhone: el usuario abre la web en Safari y usa "Compartir" > "Agregar a pantalla de inicio".

Nota: para GPS en segundo plano, la mejor experiencia sera la app nativa. La PWA sirve como primera version instalable y canal de venta, pero iOS limita bastante las capacidades de ubicacion en segundo plano desde navegador.

## Pagos

Para Mexico, empezaria con Stripe Payment Links si tienes cuenta Stripe Mexico activa: es simple para suscripciones, tarjetas y webhooks. Stripe publica una tarifa base para tarjetas domesticas en Mexico de 3.6% + MXN 3 por cargo exitoso.

Mercado Pago tambien es buena opcion si tu comprador confia mas en Mercado Pago o si quieres aceptar metodos locales desde su checkout. Suscripciones existe como producto separado; Checkout Pro sirve muy bien para pagos redirigidos, pero no es el camino principal para recurrentes.

La app ya lee estas variables:

```bash
EXPO_PUBLIC_STRIPE_PAYMENT_LINK=
EXPO_PUBLIC_MERCADOPAGO_PAYMENT_LINK=
```

## Estado Pro en Supabase

La app considera Pro a un usuario si en `profiles` existe cualquiera de estos valores:

```sql
alter table profiles add column if not exists plan text default 'free';
alter table profiles add column if not exists subscription_status text default 'inactive';
alter table profiles add column if not exists pro_until timestamptz;
alter table profiles add column if not exists stripe_customer_id text;
alter table profiles add column if not exists mercadopago_customer_id text;
```

Reglas actuales de la app:

- `plan = 'pro'` activa Pro.
- `subscription_status = 'active'` o `trialing` activa Pro.
- `pro_until` en el futuro activa Pro.

## Siguiente implementacion

1. Crear producto Pro mensual/anual en Stripe o Mercado Pago.
2. Configurar el link de pago en `.env`.
3. Crear webhook que reciba pago/suscripcion y actualice `profiles.subscription_status`.
4. Publicar `dist` en un hosting HTTPS.
5. Medir conversion: visitas, registros, clicks a Pro, pagos, cancelaciones.

## Mensaje de venta

Headline recomendado:

> Sabe si cada viaje te deja dinero antes de aceptar el siguiente.

Beneficios:

- Calcula gasolina, tiempo y km reales.
- Registra viajes con GPS o captura de pantalla.
- Detecta horarios y plataformas que mas te convienen.
- Convierte tus viajes en decisiones, no en corazonadas.
