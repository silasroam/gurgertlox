// Smoke-тесты регистрации: генерация Custom ID + registerUser на фейковой БД.
import { generateCustomId, registerUser, fixCustomIdCollision } from '../api/_lib/users.mjs';

let failed = 0;
function check(name, cond) {
    console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
    if (!cond) failed++;
}

// ── 1. generateCustomId: формат и диапазон ──
check('custom_id: 8 цифр', /^\d{8}$/.test(generateCustomId()));
check('custom_id: в диапазоне 10000000..99999999', (() => {
    for (let i = 0; i < 500; i++) {
        const v = Number(generateCustomId());
        if (v < 10000000 || v > 99999999) return false;
    }
    return true;
})());
check('custom_id: значения не детерминированы', (() => {
    const s = new Set();
    for (let i = 0; i < 200; i++) s.add(generateCustomId());
    return s.size > 150; // практически все различны
})());

// ── 2. registerUser: создание + повторный заход (last_active, тот же custom_id) ──
function fakeDb(script) {
    return { query: (sql, params) => Promise.resolve(script(String(sql).replace(/\s+/g, ' ').trim(), params) || { rowCount: 0, rows: [] }) };
}
{
    let customId = null;
    const db = fakeDb((sql) => {
        if (sql.startsWith('INSERT INTO users')) {
            // Вторая строка (INSERT-ветка) содержит сгенерированный БД custom_id.
            return { rowCount: 1, rows: [{ id: 7, tg_id: 777, username: 't', first_name: 'T', custom_id: 42424242, balance_stars: 0 }] };
        }
        if (sql.startsWith('UPDATE users SET custom_id')) {
            return { rowCount: 1, rows: [{ custom_id: 42424242 }] };
        }
        return { rowCount: 0, rows: [] };
    });
    const u1 = await registerUser(
        fakeDb((sql) => {
            if (sql.startsWith('INSERT INTO users')) return { rowCount: 1, rows: [{ id: 7, custom_id: null }] };
            if (sql.startsWith('UPDATE users SET custom_id')) return { rowCount: 1, rows: [{ custom_id: 42424242 }] };
            return { rowCount: 0, rows: [] };
        }),
        { tg_id: 777 }, 0
    );
    check('registerUser: NULL custom_id дозаполняется', String(u1.custom_id) === '42424242');
    const u2 = await registerUser(db, { tg_id: 777 }, 0);
    check('registerUser: строка с custom_id возвращена', String(u2.custom_id) === '42424242');
}

// ── 3. fixCustomIdCollision: коллизия 23505 -> перегенерация ──
{
    let calls = 0;
    const db = {
        query(sql) {
            calls++;
            if (String(sql).includes('UPDATE users SET custom_id')) {
                if (calls < 3) {
                    const e = new Error('duplicate key value violates unique constraint');
                    e.code = '23505';
                    throw e;
                }
                return Promise.resolve({ rowCount: 1, rows: [{ custom_id: 11111111 }] });
            }
            return Promise.resolve({ rowCount: 0, rows: [] });
        },
    };
    const id = await fixCustomIdCollision(db, 7);
    check('коллизия 23505 -> перегенерация ID', id === '11111111' && calls >= 3);
}

console.log(failed ? ('FAILED: ' + failed) : 'ALL OK');
process.exit(failed ? 1 : 0);
