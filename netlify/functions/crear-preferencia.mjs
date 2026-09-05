// POST /api/crear-preferencia
// Crea una preferencia de pago (Checkout Pro) en MercadoPago y devuelve la URL
// a la que hay que redirigir al comprador.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);

  const token = process.env.MP_ACCESS_TOKEN;
  const siteUrl = process.env.SITE_URL; // ej: https://medcards.netlify.app (sin barra final)

  if (!token || !siteUrl) {
    console.error('Faltan variables de entorno MP_ACCESS_TOKEN o SITE_URL');
    return json({ ok: false, error: 'server_misconfigured' }, 500);
  }

  const preferencia = {
    items: [
      {
        title: 'MedCards — Acceso completo (30 días)',
        quantity: 1,
        currency_id: 'ARS',
        unit_price: Number(process.env.MC_PRICE_ARS || 15000),
      },
    ],
    back_urls: {
      success: siteUrl,
      pending: siteUrl,
      failure: siteUrl,
    },
    auto_return: 'approved',
    notification_url: `${siteUrl}/api/mp-webhook`,
  };

  try {
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(preferencia),
    });

    const data = await resp.json();

    if (!resp.ok || !data.init_point) {
      console.error('Error creando preferencia MP:', data);
      return json({ ok: false, error: 'mp_error' }, 502);
    }

    return json({ ok: true, checkoutUrl: data.init_point });
  } catch (err) {
    console.error('Fallo de red contra MercadoPago:', err);
    return json({ ok: false, error: 'network' }, 502);
  }
};

export const config = { path: '/api/crear-preferencia' };
