// POST /api/mp-webhook
// MercadoPago llama a esta URL cada vez que cambia el estado de un pago.
// Acá NUNCA confiamos en el contenido del webhook: siempre volvemos a
// consultar el pago directo a la API de MercadoPago antes de dar acceso.

import { getStore } from '@netlify/blobs';

function genCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `MC-${hex}`;
}

async function enviarCodigoPorMail(email, code, accessDays, maxActivations) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!email || !apiKey) return; // sin mail o sin API key configurada, se omite

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'MedCards <onboarding@resend.dev>',
        to: email,
        subject: 'Tu código de acceso a MedCards',
        html: `
          <p>¡Gracias por tu compra!</p>
          <p>Tu código de acceso es:</p>
          <h2 style="letter-spacing:2px">${code}</h2>
          <p>Válido por ${accessDays} días, en hasta ${maxActivations} dispositivos.</p>
        `,
      }),
    });
  } catch (err) {
    console.error('No se pudo enviar el mail con el código:', err);
  }
}

export default async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error('Falta MP_ACCESS_TOKEN');
    return new Response('server_misconfigured', { status: 500 });
  }

  // MercadoPago manda el id del pago por query string o en el body, según el tipo de notificación
  let paymentId = null;
  try {
    const url = new URL(req.url);
    paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    if (!paymentId) {
      const body = await req.json().catch(() => ({}));
      paymentId = body?.data?.id || body?.id || null;
    }
  } catch {
    // ignorar, seguimos con paymentId = null
  }

  // Si no reconocemos el evento, respondemos 200 igual para que MP no reintente en loop
  if (!paymentId) return new Response('ok', { status: 200 });

  // Consultar el estado REAL del pago (nunca confiar en el payload del webhook)
  let payment;
  try {
    const resp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    payment = await resp.json();
  } catch (err) {
    console.error('Fallo consultando el pago en MP:', err);
    return new Response('mp_lookup_failed', { status: 502 });
  }

  if (!payment || payment.status !== 'approved') {
    // Pendiente, rechazado, etc. — no hacemos nada todavía
    return new Response('ok', { status: 200 });
  }

  const payments = getStore('payments');
  const existingCode = await payments.get(String(paymentId));
  if (existingCode) {
    // Ya procesamos este pago antes (MP reintenta webhooks) — idempotencia
    return new Response('ok', { status: 200 });
  }

  const codes = getStore('codes');
  const code = genCode();
  const maxActivations = Number(process.env.MC_CODE_MAX_ACTIVATIONS || 2);
  const accessDays = Number(process.env.MC_ACCESS_DAYS || 30);

  const record = {
    paymentId: String(paymentId),
    email: payment.payer?.email || null,
    createdAt: Date.now(),
    expiresAt: Date.now() + accessDays * 24 * 60 * 60 * 1000,
    maxActivations,
    devices: [],
  };

  await codes.setJSON(code, record);
  await payments.set(String(paymentId), code);

  await enviarCodigoPorMail(record.email, code, accessDays, maxActivations);

  return new Response('ok', { status: 200 });
};

export const config = { path: '/api/mp-webhook' };
