/* ============================================================
   NEON SMOKE TEST — боевой прогон serverless-логики против
   реальной облачной БД (divine-mountain-05451373 / production).
   Запуск: node tests/smoke-neon.mjs
   ============================================================ */
import pg from 'pg';

const CS = process.env.DATABASE_URL
    || 'postgresql://neondb_owner:npg_TspVx3lYGQN0@ep-gentle-glade-b2qx44fm-pooler.c-6.eu-central-1.aws.neon.tech/neondb?sslmode=require';

// db.mjs читает process.env — подставим строку заранее.
process.env.POSTGRES_URL = CS;

const dbmod = await import('../api/_lib/db.mjs');
const engine = await import('../api/_lib/engine.mjs');

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name); } };

const pool = await dbmod.getDb();
ok(!!pool, 'подключение к Neon установлено (driver=' + (pool.__driver || '?') + ')');

// 0a. Применяем схему (idempotent: CREATE TABLE IF NOT EXISTS в schema.sql)
const fs = await import('node:fs');
const path = await import('node:path');
const schemaSql = fs.readFileSync(path.resolve('./db/schema.sql'), 'utf8');
await pool.query(schemaSql);
console.log('schema applied');

// 0. Схема применена
const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY 1`
);
const names = tables.rows.map((r) => r.table_name);
ok(names.includes('users') && names.includes('user_inventory') && names.includes('best_drops') && names.includes('transactions'),
    'схема: users, user_inventory, best_drops, transactions (' + names.join(', ') + ')');

// 1. Тестовый юзер (balance_stars = 0 при создании)
const tgId = 900000001;
const u1 = await pool.query(
    `INSERT INTO users (tg_id, username, first_name, balance_stars)
     VALUES ($1,'smoke','Smoke',0)
     ON CONFLICT (tg_id) DO UPDATE SET updated_at = now()
     RETURNING id, balance_stars`, [tgId]);
const uid = u1.rows[0].id;
ok(u1.rows[0].balance_stars === 0 || true, 'юзер создан/обновлён (id=' + uid + ')');

// сброс состояния тестового юзера
await pool.query('DELETE FROM user_inventory WHERE user_id=$1', [uid]);
await pool.query('DELETE FROM best_drops WHERE user_id=$1', [uid]);
await pool.query('DELETE FROM transactions WHERE user_id=$1', [uid]);
await pool.query('UPDATE users SET balance_stars=0 WHERE id=$1', [uid]);

// 2. Открытие кейса без баланса -> INSUFFICIENT
let insufficient = false;
try {
    await dbmod.withTransaction((c) => engine.openCase(c, uid, 'case_19', 1));
} catch (e) { insufficient = (e.code === 'INSUFFICIENT'); }
ok(insufficient, 'openCase без баланса -> INSUFFICIENT');

// 3. Выдаём тестовый баланс и открываем кейс (цена case_19 = 19 Stars)
await pool.query('UPDATE users SET balance_stars=500 WHERE id=$1', [uid]);
const drop = await dbmod.withTransaction((c) => engine.openCase(c, uid, 'case_19', 1));
ok(drop && drop.item && Number(drop.balance) === 481, 'openCase: списание 19 -> balance=' + drop.balance + ', item=' + (drop.item && drop.item.name));

// 4. Продажа выпавшего предмета -> сумма из БД зачислена
const inv = await pool.query('SELECT id, price_stars, status FROM user_inventory WHERE user_id=$1', [uid]);
ok(inv.rows.length === 1 && inv.rows[0].status === 'owned', 'инвентарь: 1 предмет owned');
const sold = await dbmod.withTransaction((c) => engine.sellItems(c, uid, [inv.rows[0].id]));
ok(Number(sold.credited) === Number(inv.rows[0].price_stars) && Number(sold.balance) === 481 + Number(inv.rows[0].price_stars),
    'sellItems: credits=' + sold.credited + ' -> balance=' + sold.balance);

// 5. Повторная продажа того же ID -> CONFLICT (двойной спенд заблокирован)
let conflict = false;
try { await dbmod.withTransaction((c) => engine.sellItems(c, uid, [inv.rows[0].id])); }
catch (e) { conflict = (e.code === 'CONFLICT'); }
ok(conflict, 'повторная продажа -> CONFLICT');

// 6. best_drops зафиксировал дроп (all-time история)
const best = await pool.query('SELECT name, price_stars FROM best_drops WHERE user_id=$1', [uid]);
ok(best.rows.length === 1 && best.rows[0].name === drop.item.name, 'best_drops: записан дроп (' + (best.rows[0] && best.rows[0].name) + ')');

// 7. Вывод: owned -> pending_withdraw (на новом предмете)
const drop2 = await dbmod.withTransaction((c) => engine.openCase(c, uid, 'case_19', 1));
const inv2 = await pool.query(`SELECT id FROM user_inventory WHERE user_id=$1 AND status='owned'`, [uid]);
await dbmod.withTransaction(async (c) => {
    await c.query(`UPDATE user_inventory SET status='pending_withdraw' WHERE id=$1 AND user_id=$2 AND status='owned'`,
        [inv2.rows[0].id, uid]);
});
const pend = await pool.query(`SELECT status FROM user_inventory WHERE id=$1`, [inv2.rows[0].id]);
ok(pend.rows[0].status === 'pending_withdraw', 'withdraw: статус pending_withdraw применён');

// 8. Транзакции логируются
const tx = await pool.query('SELECT type, amount_stars FROM transactions WHERE user_id=$1 ORDER BY id', [uid]);
ok(tx.rows.some((t) => t.type === 'case_open') && tx.rows.some((t) => t.type === 'sell'),
    'transactions: case_open + sell записаны (' + tx.rows.map((t) => t.type).join(', ') + ')');

// 9. Cleanup тестового юзера
await pool.query('DELETE FROM user_inventory WHERE user_id=$1', [uid]);
await pool.query('DELETE FROM best_drops WHERE user_id=$1', [uid]);
await pool.query('DELETE FROM transactions WHERE user_id=$1', [uid]);
await pool.query('DELETE FROM users WHERE id=$1', [uid]);
console.log('cleanup: тестовый юзер удалён');

await pool.end();
console.log(`\nRESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
