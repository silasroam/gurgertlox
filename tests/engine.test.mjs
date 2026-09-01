// Smoke-тесты движка: openCase / sellItems на фейковом клиенте БД
// (логика SQL-потока идентична реальному, транзакцией управляет withTransaction).
import { openCase, sellItems, getCaseConfig, weightedPick } from '../api/_lib/engine.mjs';

function fakeClient(script) {
    const calls = [];
    return {
        calls,
        query(sql, params) {
            calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
            const out = script(sql.replace(/\s+/g, ' ').trim(), params) || { rowCount: 0, rows: [] };
            return Promise.resolve(out);
        },
    };
}

let failed = 0;
function check(name, cond) {
    console.log((cond ? 'PASS' : 'FAIL') + ' ' + name);
    if (!cond) failed++;
}

// ── getCaseConfig ──
check('case_19 найден', !!getCaseConfig('case_19'));
check('неизвестный кейс -> null', getCaseConfig('nope') === null);
check('weightedPick возвращает предмет кейса', (() => {
    const cfg = getCaseConfig('case_19');
    return cfg.items.includes(weightedPick(cfg.items));
})());

const CASE_PRICE_STARS = Math.round(getCaseConfig('case_19').price * 80);

// ── openCase ──
{
    const invRow = { id: 500, item_id: 'trophy_100', name: 'Trophy', image: 'x.png', rarity: 'common', price_stars: 100, status: 'owned', won_at: new Date() };
    const c = fakeClient((sql) => {
        if (sql.startsWith('SELECT id, balance_stars FROM users')) return { rowCount: 1, rows: [{ id: 1, balance_stars: 100000 }] };
        if (sql.startsWith('UPDATE users SET balance_stars = balance_stars -')) return { rowCount: 1 };
        if (sql.startsWith('SELECT balance_stars FROM users')) return { rowCount: 1, rows: [{ balance_stars: 100000 - CASE_PRICE_STARS }] };
        if (sql.startsWith('INSERT INTO user_inventory')) return { rowCount: 1, rows: [invRow] };
        return { rowCount: 0, rows: [] };
    });
    const r = await openCase(c, 1, 'case_19', 1);
    check('openCase: списание цены кейса', r.balance === 100000 - CASE_PRICE_STARS && r.item.price_stars === Number(invRow.price_stars));
    check('openCase: предмет возвращён', r.item && r.item.item_id === 'trophy_100');
    check('openCase: блокировка FOR UPDATE применена', c.calls.some((x) => x.sql.includes('FOR UPDATE')));
    check('openCase: транзакция списания по CHECK >= price', c.calls.some((x) => x.sql.includes('balance_stars >= $2')));
}
{
    // Недостаточно средств -> INSUFFICIENT.
    const c = fakeClient((sql) => {
        if (sql.startsWith('SELECT id, balance_stars FROM users')) return { rowCount: 1, rows: [{ id: 1, balance_stars: 10 }] };
        return { rowCount: 0, rows: [] };
    });
    let err = null;
    try { await openCase(c, 1, 'case_19', 1); } catch (e) { err = e; }
    check('openCase: недостаточно баланса -> INSUFFICIENT', err && err.code === 'INSUFFICIENT');
}
{
    let err = null;
    try { await openCase(fakeClient(() => ({ rowCount: 0, rows: [] })), 1, 'nope', 1); } catch (e) { err = e; }
    check('openCase: неизвестный кейс -> NOT_FOUND', err && err.code === 'NOT_FOUND');
}

// ── sellItems ──
{
    const c = fakeClient((sql, params) => {
        if (sql.startsWith('SELECT id FROM users')) return { rowCount: 1, rows: [{ id: 1 }] };
        if (sql.startsWith('SELECT id, item_id, price_stars FROM user_inventory')) {
            const want = params[1];
            const rows = [500, 501].includes(want[0]) ? [{ id: 500, item_id: 'trophy_100', price_stars: 852 }] : [];
            return { rowCount: rows.length, rows };
        }
        if (sql.startsWith('UPDATE users SET balance_stars = balance_stars +')) return { rowCount: 1, rows: [{ balance_stars: 852 }] };
        return { rowCount: 1, rows: [] };
    });
    const r = await sellItems(c, 1, [500]);
    check('sellItems: зачтена сумма из БД', r.credited === 852 && r.balance === 852);
    check('sellItems: удаляет только статусы owned', c.calls.some((x) => x.sql.includes("status = 'owned'")));
    check('sellItems: FOR UPDATE на предметах', c.calls.some((x) => x.sql.includes('FOR UPDATE')));
    check('sellItems: лог item_sell с item_id', c.calls.some((x) => x.sql.includes("'item_sell'") && x.params[2] === 'trophy_100'));
}
{
    // Часть ID не существует / уже на выводе -> CONFLICT.
    const c = fakeClient((sql, params) => {
        if (sql.startsWith('SELECT id FROM users')) return { rowCount: 1, rows: [{ id: 1 }] };
        if (sql.startsWith('SELECT id, item_id, price_stars FROM user_inventory')) return { rowCount: 1, rows: [{ id: 500, item_id: 'trophy_100', price_stars: 100 }] };
        return { rowCount: 1, rows: [] };
    });
    let err = null;
    try { await sellItems(c, 1, [500, 999]); } catch (e) { err = e; }
    check('sellItems: чужие/недоступные ID -> CONFLICT', err && err.code === 'CONFLICT');
}
{
    let err = null;
    try { await sellItems(fakeClient(() => ({ rowCount: 0, rows: [] })), 1, []); } catch (e) { err = e; }
    check('sellItems: пустой список -> BAD_REQUEST', err && err.code === 'BAD_REQUEST');
}

console.log(failed ? ('FAILED: ' + failed) : 'ALL OK');
process.exit(failed ? 1 : 0);
