// POST /api/validar-codigo
// Body: { code: string, deviceId: string }
// Valida un código contra el store de Blobs y controla el límite de
// dispositivos activados por código (no solo si "existe").

import { getStore } from '@netlify/blobs';

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'bad_request' }, 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad_request' }, 400);
  }

  const code = String(body?.code || '').trim().toUpperCase();
  const deviceId = String(body?.deviceId || '').trim();

  if (!code || !deviceId) return json({ ok: false, reason: 'bad_request' }, 400);

  const codes = getStore('codes');
  const record = await codes.get(code, { type: 'json' });

  if (!record) return json({ ok: false, reason: 'invalid' });

  if (record.expiresAt && record.expiresAt < Date.now()) {
    return json({ ok: false, reason: 'expired' });
  }

  const devices = record.devices || [];

  // Este dispositivo ya había activado el código antes → siempre se le permite reingresar
  if (devices.includes(deviceId)) {
    return json({ ok: true, expiresAt: record.expiresAt });
  }

  const max = record.maxActivations || 2;
  if (devices.length >= max) {
    return json({ ok: false, reason: 'limit' });
  }

  devices.push(deviceId);
  record.devices = devices;
  await codes.setJSON(code, record);

  return json({ ok: true, expiresAt: record.expiresAt });
};

export const config = { path: '/api/validar-codigo' };
