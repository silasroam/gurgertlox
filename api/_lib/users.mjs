/* ============================================================
   USER REGISTRATION + CUSTOM ID (Vercel Serverless port).
   - custom_id: случайный уникальный 8-значный ID (10000000..99999999)
   - Регистрация при ЛЮБОМ заходе (рут авторизации):
       * нет в базе  -> создаём запись с уникальным custom_id
       * есть в базе -> last_active = NOW(), возвращаем существующий custom_id
   ============================================================ */
'use strict';
import crypto from 'node:crypto';

const CUSTOM_ID_MIN = 10000000n; // 8 знаков, только цифры
const CUSTOM_ID_MAX = 99999999n;
const CUSTOM_ID_ATTEMPTS = 30;   // попыток против коллизий (база ~8e7, вероятность мизерная)

// Нормализация Telegram ID: любые 64-битные целые (number/string/bigint).
// Возвращаем СТРОКУ — node-postgres передаёт её как числовой текст, и BIGINT
// в PostgreSQL принимает любое значение без потери точности (в отличие от
// Number > 2^53 при бинарной передаче). 10-значные TG ID (~5e9) — валидны.
export function normalizeTgId(raw) {
    if (raw == null) return null;
    let s;
    if (typeof raw === 'bigint') s = raw.toString();
    else if (typeof raw === 'number') {
        if (!Number.isInteger(raw) || raw <= 0) return null;
        s = String(raw);
    } else {
        s = String(raw).trim();
    }
    if (!/^\d{1,20}$/.test(s)) return null; // до 20 цифр: запас на 64 бита
    return s.replace(/^0+(?=\d)/, '');       // без ведущих нулей
}

// Случайный 8-значный ID только из цифр (криптостойкий ГСЧ).
export function generateCustomId() {
    const span = CUSTOM_ID_MAX - CUSTOM_ID_MIN + 1n; // 90 000 000
    const rand = BigInt('0x' + crypto.randomBytes(8).toString('hex')); // 64 бита
    return (CUSTOM_ID_MIN + (rand % span)).toString();
}

// INSERT ... ON CONFLICT: одна атомарная операция вместо SELECT-then-INSERT.
// Возвращаемая строка ВСЕГДА с custom_id (для новых он проставлен через COALESCE).
export function registerUserSql(db, tgUser, seedBalance) {
    return db.query(
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
export async function fixCustomIdCollision(db, userId) {
    for (let i = 0; i < CUSTOM_ID_ATTEMPTS; i++) {
        try {
            const upd = await db.query(
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

// Единая точка регистрации при любом заходе пользователя в Mini App.
export async function registerUser(db, tgUser, seedBalance = 0) {
    // Строгая валидация tg_id ДО запроса к БД: невалидный ID -> 400,
    // а не падение на уровне PostgreSQL.
    const tgId = normalizeTgId(tgUser && tgUser.tg_id);
    if (!tgId) throw Object.assign(new Error('Invalid Telegram ID'), { code: 'BAD_REQUEST' });

    const result = await registerUserSql(db, { ...tgUser, tg_id: tgId }, seedBalance);
    const user = result.rows[0];
    if (user.custom_id == null) {
        user.custom_id = await fixCustomIdCollision(db, user.id);
    }
    return user;
}
