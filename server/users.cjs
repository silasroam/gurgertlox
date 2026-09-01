/* ============================================================
   USER REGISTRATION + CUSTOM ID (локальный бэкенд).
   - custom_id: случайный уникальный 8-значный ID (10000000..99999999)
   - Регистрация при ЛЮБОМ заходе (рут авторизации):
       * нет в базе  -> создаём запись с уникальным custom_id
       * есть в базе -> last_active = NOW(), возвращаем существующий custom_id
   ============================================================ */
'use strict';
const crypto = require('crypto');

const CUSTOM_ID_ATTEMPTS = 30; // попыток против коллизий (пространство ~90 млн)

// Нормализация Telegram ID (идентично api/_lib/users.mjs):
// строка из цифр (1..20 знаков) -> безопасная передача в BIGINT через pg.
function normalizeTgId(raw) {
    if (raw == null) return null;
    let s;
    if (typeof raw === 'bigint') s = raw.toString();
    else if (typeof raw === 'number') {
        if (!Number.isInteger(raw) || raw <= 0) return null;
        s = String(raw);
    } else {
        s = String(raw).trim();
    }
    if (!/^\d{1,20}$/.test(s)) return null;
    return s.replace(/^0+(?=\d)/, '');
}

// Случайный 8-значный ID только из цифр (криптостойкий ГСЧ).
function generateCustomId() {
    const span = 90000000n; // 99999999 - 10000000 + 1
    const rand = BigInt('0x' + crypto.randomBytes(8).toString('hex'));
    return (10000000n + (rand % span)).toString();
}

// INSERT ... ON CONFLICT: одна атомарная операция вместо SELECT-then-INSERT.
async function registerUserSql(pool, tgUser, seedBalance) {
    return pool.query(
        `INSERT INTO users (tg_id, username, first_name, balance_stars, custom_id, last_active)
         VALUES ($1, $2, $3, $4, (10000000 + floor(random() * 90000000))::bigint, now())
         ON CONFLICT (tg_id) DO UPDATE
           SET username    = EXCLUDED.username,
               first_name  = EXCLUDED.first_name,
               last_active = now(),
               updated_at  = now()
         RETURNING id, tg_id, username, first_name, custom_id, balance_stars,
                   created_at, updated_at, last_active`,
        [tgUser.tg_id, tgUser.username || null, tgUser.first_name || null, seedBalance]
    );
}

// Случайные коллизии уникального индекса (ошибка 23505) -> перегенерация custom_id.
async function fixCustomIdCollision(pool, userId) {
    for (let i = 0; i < CUSTOM_ID_ATTEMPTS; i++) {
        try {
            const upd = await pool.query(
                `UPDATE users SET custom_id = $2, updated_at = now() WHERE id = $1 AND custom_id IS NULL
                 RETURNING custom_id`,
                [userId, generateCustomId()]
            );
            if (upd.rowCount === 1) return String(upd.rows[0].custom_id);
            return null; // custom_id уже проставлен параллельным запросом
        } catch (e) {
            if (String(e.code) !== '23505') throw e; // не коллизия — наверх
        }
    }
    throw Object.assign(new Error('Cannot generate unique custom_id'), { code: 'CONFLICT' });
}

// Единая точка регистрации при любом заходе пользователя.
async function registerUser(pool, tgUser, seedBalance = 0) {
    // Валидация tg_id до запроса к БД (невалидный -> BAD_REQUEST, не ошибка pg).
    const tgId = normalizeTgId(tgUser && tgUser.tg_id);
    if (!tgId) throw Object.assign(new Error('Invalid Telegram ID'), { code: 'BAD_REQUEST' });

    const result = await registerUserSql(pool, { ...tgUser, tg_id: tgId }, seedBalance);
    const user = result.rows[0];
    if (user.custom_id == null) {
        user.custom_id = await fixCustomIdCollision(pool, user.id);
    }
    return user;
}

module.exports = { generateCustomId, normalizeTgId, registerUser };
