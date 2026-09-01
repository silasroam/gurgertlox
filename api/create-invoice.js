/* ============================================================
   POST /api/create-invoice — Telegram Stars (XTR) invoice link.
   Фронтенд (экран пополнения) вызывает этот роут как с пресетами,
   так и с произвольной суммой («Своя сумма»).
   ============================================================ */
'use strict';
import { json, readJson } from './_lib/http.mjs';

// Валидная сумма: целое число Stars, от 1 до 100000 (защита от мусора/абуза).
function parseAmount(raw) {
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1 || n > 100000) return 0;
    return n;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    const body = await readJson(req);
    const amount = parseAmount(body.amount);
    if (!amount) return json(res, 400, { error: 'Bad amount' });

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
