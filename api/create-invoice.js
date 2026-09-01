/* ============================================================
   POST /api/create-invoice — Telegram Stars (XTR) invoice link.
   Фронтенд (депозит-модалка) уже вызывает этот роут.
   ============================================================ */
'use strict';
import { json, readJson } from './_lib/http.mjs';

// Пакеты Stars с экрана пополнения (dep-card data-amount) — строго белый список.
const ALLOWED_AMOUNTS = new Set([5, 20, 50, 100, 500, 1000]);

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = await readJson(req);
    const amount = Math.round(Number(body.amount) || 0);
    if (!ALLOWED_AMOUNTS.has(amount)) return json(res, 400, { error: 'Bad amount' });

    const token = process.env.TELEGRAM_BOT_TOKEN || '';
    if (!token) return json(res, 500, { error: 'Bot token not configured' });

    try {
        const r = await fetch('https://api.telegram.org/bot' + token + '/createInvoiceLink', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: 'Пополнение баланса',
                description: amount + ' Stars',
                payload: 'stars_topup:' + Date.now(),
                currency: 'XTR',
                prices: [{ label: 'Stars', amount }],
            }),
        });
        const data = await r.json();
        if (!data.ok || !data.result) {
            return json(res, 502, { error: data.description || 'Telegram API error' });
        }
        return json(res, 200, { ok: true, invoiceLink: data.result });
    } catch (e) {
        return json(res, 502, { error: 'Telegram API unreachable' });
    }
}
