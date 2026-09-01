/* ============================================================
   GRANT CLI — выдача игровых звёзд администратором из терминала.
   Использует тот же движок (server/grantEngine.cjs), что и HTTP-эндпоинт
   /api/admin/grant, но подключается к БД напрямую — работает даже
   когда сервер выключен.

   Использование:
     // Одному пользователю по Telegram ID:
     node server/grant.cjs --amount 500 --tg_id 7969090536 --reason "weekend bonus"

     // Всем пользователям из базы:
     node server/grant.cjs --amount 100 --all --reason "mass drop"

   ADMIN_SECRET либо передаётся --secret, либо автоматически берётся из .env.
   ============================================================ */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { Pool } = require('pg');
const { grantStars, validateReq, safeEqual } = require(path.join(__dirname, 'grantEngine.cjs'));

// --- разбор аргументов ---
function arg(name) {
    const i = process.argv.indexOf(name);
    return i !== -1 ? process.argv[i + 1] : null;
}
function has(name) {
    return process.argv.includes(name);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    const amountRaw = arg('--amount');
    const tgIdRaw = arg('--tg_id');
    const all = has('--all');
    const reason = arg('--reason') || 'admin_grant';
    const secret = arg('--secret') || process.env.ADMIN_SECRET || '';

    if (!amountRaw) {
        console.error('❌ Usage: --amount <целое 0..1e9> --tg_id <id> | --all  [--reason "..." ] [--secret <ключ>]');
        process.exit(2);
    }

    // Проверка админ-секрета по .env (constant-time).
    if (!process.env.ADMIN_SECRET) {
        console.error('❌ ADMIN_SECRET не задан в .env — выдайте ключ в переменную ADMIN_SECRET');
        process.exit(2);
    }
    if (!safeEqual(secret, process.env.ADMIN_SECRET)) {
        console.error('❌ Неверный ADMIN_SECRET. Укажите --secret или убедитесь, что он совпадает с .env');
        process.exit(2);
    }

    if (!all && !tgIdRaw) {
        console.error('❌ Укажите --tg_id <id> или --all (выдача всем).');
        process.exit(2);
    }

    const body = { amount: Number(amountRaw), reason };
    if (!all) body.tg_id = tgIdRaw;

    let valid;
    try {
        valid = validateReq(body);
    } catch (e) {
        console.error('❌ ' + e.message);
        process.exit(2);
    }

    const target = valid.tgId ? `tg_id=${valid.tgId}` : 'ВСЕМ пользователям';
    console.log(`⏳ Выдаю ${valid.amount} звёзд: ${target} (причина: ${valid.reason})...`);

    try {
        const result = await grantStars(pool, valid);
        console.log(`✅ Выдано: ${result.granted} пользовател. | сумма: ${result.totalSum} звёзд.`);
        for (const u of result.updated) {
            console.log(`   • tg_id=${u.tg_id} (${u.username || '—'}) -> баланс ${u.balance_stars}`);
        }
    } catch (e) {
        console.error('❌ Ошибка: ' + e.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
})().catch((e) => {
    console.error('❌ Fatal: ' + (e && e.message));
    process.exit(1);
});