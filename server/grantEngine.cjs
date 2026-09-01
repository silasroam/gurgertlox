/* ============================================================
   GRANT ENGINE — серверная выдача игровых звёзд администратором.
   Один общий код для HTTP-эндпоинта (/api/admin/grant) и CLI (grant.cjs).

   Анти-фрод:
   - Начислиение идёт АТОМАРНО (balance_stars = balance_stars + amount)
     внутри одной транзакции с блокировкой строк FOR UPDATE — никогда
     не "перезаписывает" баланс, а добавляет к существующему.
   - Каждая выдача логируется в таблицу transactions (type='grant'),
     что даёт полный аудит «кто/кому/сколько/когда».
   - Доступ контролируется ADMIN_SECRET на уровне вызова (эндпоинт/CLI),
     клиент мини-аппа его не имеет.
   ============================================================ */
'use strict';

const crypto = require('crypto');

// Constant-time compare для секрета (защита от timing-атак).
function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function normalizeTgId(raw) {
    if (raw == null) return null;
    let s;
    if (typeof raw === 'bigint') s = raw.toString();
    else if (typeof raw === 'number') {
        if (!Number.isInteger(raw) || raw <= 0) return null;
        s = String(raw);
    } else s = String(raw).trim();
    if (!s) return null;
    if (/^\d{1,20}$/.test(s)) return s.replace(/^0+(?=\d)/, '');
    // Допускаем упоминание без @ и с @
    if (/^@?\d{1,20}$/.test(s)) return s.replace(/^@/, '').replace(/^0+(?=\d)/, '');
    return null;
}

// Валидация входа. amount >= 0 (0 допускается для аудита/нулевой выдачи).
function validateReq(body) {
    const amount = Number(body && body.amount);
    if (!Number.isInteger(amount) || amount < 0 || amount > 1e9) {
        const err = new Error('Invalid amount: integer >= 0');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const tgId = body.tg_id == null || body.tg_id === '' ? null : normalizeTgId(body.tg_id);
    // Если tg_id задан но невалиден -> BAD_REQUEST
    if (body.tg_id != null && body.tg_id !== '' && !tgId) {
        const err = new Error('Invalid tg_id');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const reason = String(body.reason || '').slice(0, 200);

    return { amount, tgId, reason };
}

// Массовая выдача ВСЕМ: если tgId === null -> всем пользователям БД.
async function grantStars(pool, { amount, tgId, reason = 'admin_grant' }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let rows;
        if (tgId) {
            // Одному: обновляем и возвращаем строку (FOR UPDATE -> сериализация).
            const upd = await client.query(
                `UPDATE users
                 SET balance_stars = balance_stars + $2, updated_at = now()
                 WHERE tg_id = $1
                 RETURNING id, tg_id, username, balance_stars`,
                [tgId, amount]
            );
            if (upd.rowCount === 0) {
                const err = new Error('User not found by tg_id: ' + tgId);
                err.code = 'NOT_FOUND';
                throw err;
            }
            rows = upd.rows;
        } else {
            // ОДИН запрос — кредит всем (+ аудит каждой строки).
            const upd = await client.query(
                `UPDATE users
                 SET balance_stars = balance_stars + $1, updated_at = now()
                 RETURNING id, tg_id, username, balance_stars`,
                [amount]
            );
            rows = upd.rows;
        }

        // Аудит: запись в transactions для каждой затронутой строки.
        for (const u of rows) {
            await client.query(
                `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
                 VALUES ($1, 'grant', $2, NULL, $3::jsonb)`,
                [u.id, amount, JSON.stringify({ granted_by: 'admin', reason, tg_id: String(u.tg_id) })]
            );
        }

        await client.query('COMMIT');
        return {
            ok: true,
            amount,
            granted: rows.length,
            totalSum: amount * rows.length,
            updated: rows.map((r) => ({
                tg_id: String(r.tg_id),
                username: r.username,
                balance_stars: Number(r.balance_stars),
            })),
        };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { grantStars, validateReq, normalizeTgId, safeEqual };