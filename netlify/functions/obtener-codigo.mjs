// GET /api/obtener-codigo?payment_id=XXXXX
// El frontend hace polling acá justo después de volver de MercadoPago,
// mientras el webhook procesa el pago y genera el código en paralelo.

import { getStore } from '@netlify/blobs';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const paymentId = url.searchParams.get('payment_id');

  if (!paymentId) return json({ ok: false }, 400);

  const payments = getStore('payments');
  const code = await payments.get(paymentId);

  if (!code) return json({ ok: false }); // el webhook todavía no lo procesó

  return json({ ok: true, code });
};

export const config = { path: '/api/obtener-codigo' };
