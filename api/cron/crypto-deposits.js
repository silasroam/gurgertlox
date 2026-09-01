/* ============================================================
   GET /api/cron/crypto-deposits — Vercel Cron.
   Запускается по расписанию (vercel.json crons). Секрет — заголовок
   Authorization: Bearer <CRON_SECRET>. Требует Node runtime и .env-ключ
   для получения access-токена (блокировано от внешних вызовов).
   ============================================================ */
'use strict';
import crypto from 'node:crypto';
import { processPendingDeposits } from '../_lib/cryptoWorker.mjs';
import { json } from '../_lib/http.mjs';

function safeEqual(a, b) {
  const A = Buffer.from(String(a));
  const B = Buffer.from(String(b));
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const expected = process.env.CRON_SECRET || process.env.ADMIN_SECRET || '';
  const got = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (!expected || !safeEqual(got, expected)) return json(res, 401, { error: 'Forbidden' });

  try {
    const result = await processPendingDeposits();
    return json(res, 200, { ok: true, ...result });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}