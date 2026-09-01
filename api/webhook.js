/* ============================================================
   POST /api/webhook — Telegram Bot API updates.
   successful_payment (XTR) -> ЕДИНАЯ SQL-транзакция:
   блокировка строки юзера -> зачисление Stars -> INSERT transactions('deposit').
   Идемпотентность: уникальный индекс по meta->>'charge_id'
   (повторная доставка вебхука не задвоит зачисление).
   ============================================================ */
'use strict';
import crypto from 'node:crypto';
import { getDb, withTransaction } from './_lib/db.mjs';
import { json, readJson } from './_lib/http.mjs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

// Тот же алгоритм, что в Telegram-доке для setWebhook (secret_token).
function webhookSecret() {
    return crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest('hex');
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    // Проверка секретного заголовка (защита от подделки платежа).
    if (BOT_TOKEN) {
        const a = Buffer.from(webhookSecret());
        const b = Buffer.from(String(req.headers['x-telegram-bot-api-secret-token'] || ''));
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            return json(res, 401, { error: 'Unauthorized webhook' });
        }
    }

    const update = await readJson(req);
    const msg = update && update.message;
    const pay = msg && msg.successful_payment;
    if (!pay) return json(res, 200, { ok: true }); // всё, кроме платежей, игнорируем

    const chargeId = pay.telegram_payment_charge_id || '';
    const stars = Math.round(Number(pay.total_amount) || 0);
    const from = (msg && msg.from) || {};
    const tgId = Number(from.id) || 0;
    if (!chargeId || !tgId || stars <= 0) return json(res, 200, { ok: true });

    const db = await getDb();
    try {
        const result = await withTransaction(async (client) => {
            // 1. Lock: сериализация с открытием кейсов / продажами.
            const lk = await client.query(`SELECT id FROM users WHERE tg_id = $1 FOR UPDATE`, [tgId]);
            if (lk.rowCount === 0) return { unknown: true };
            const userId = lk.rows[0].id;

            // 2. Зачисление Stars.
            const upd = await client.query(
                `UPDATE users SET balance_stars = balance_stars + $2, updated_at = now()
                 WHERE id = $1 RETURNING balance_stars`,
                [userId, stars]
            );

            // 3. deposit-лог — В ТОЙ ЖЕ транзакции, идемпотентно по charge_id.
            const tx = await client.query(
                `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
                 VALUES ($1, 'deposit', $2, NULL, $3::jsonb)
                 ON CONFLICT ((meta->>'charge_id')) WHERE meta->>'charge_id' IS NOT NULL DO NOTHING
                 RETURNING id`,
                [userId, stars, JSON.stringify({
                    charge_id: chargeId,
                    provider_charge_id: pay.provider_payment_charge_id || null,
                    invoice_payload: pay.invoice_payload || null,
                    currency: pay.currency || 'XTR',
                    tg_username: from.username || null,
                })]
            );
            return { balance: Number(upd.rows[0].balance_stars), applied: tx.rowCount === 1 };
        });

        if (result.unknown) {
            // Платёж от того, кто ни разу не заходил в Mini App: юзера нет,
            // начислять некому. Не теряем информацию — пишем в лог для разбора.
            console.error('[webhook] payment from unknown tg_id=' + tgId + ' charge=' + chargeId);
            return json(res, 200, { ok: true, user: 'unknown' });
        }
        return json(res, 200, { ok: true, balance: result.balance, applied: result.applied });
    } catch (e) {
        // 500 -> Telegram повторит доставку, идемпотентность не даст задвоить.
        return json(res, 500, { ok: false, error: e.message });
    }
}
