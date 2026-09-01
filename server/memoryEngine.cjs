/* ============================================================
   Memory Engine — in-memory реализация боевой логики (dev/localhost).
   Интерфейс идентичен server/caseEngine.js (PostgreSQL).
   Включается автоматически, если DATABASE_URL не задан.
   Вся экономика (балансы, дроп по весам, продажа, вывод) — на сервере.
   ============================================================ */
'use strict';
const CASES_CONF = require('../casesConfig.json');

// ---------- Каталог предметов из casesConfig.json ----------
const CATALOG = new Map();
for (const c of CASES_CONF.cases || []) {
    for (const it of c.items || []) {
        if (!CATALOG.has(it.id)) {
            CATALOG.set(it.id, {
                item_id: it.id,
                name: it.name || it.id,
                image: it.image || '',
                price_stars: Math.round(Number(it.value) || 0),
                weight: Number(it.weight) || 0,
            });
        }
    }
}

// ---------- "Таблицы" ----------
let nextUserId = 1;
let nextInvId = 1;
const users = new Map();          // tg_id -> user
const inventory = new Map();      // inv_id -> row
const bestDrops = new Map();      // `${userId}:${item_id}` -> row
const transactions = [];

// ---------- Мьютекс на пользователя (race-safe, как FOR UPDATE) ----------
const userLocks = new Map();
function withLock(userId, fn) {
    const prev = userLocks.get(userId) || Promise.resolve();
    const next = prev.then(fn, fn);
    userLocks.set(userId, next.catch(() => {}));
    return next;
}

function updateUserTs(u) { u.updated_at = new Date(); return u; }

// ---------- Users ----------
function upsertUser(tgUser) {
    const tgId = Number(tgUser.tg_id) || 1;
    let u = users.get(tgId);
    if (!u) {
        u = { id: nextUserId++, tg_id: tgId, username: tgUser.username || null, first_name: tgUser.first_name || null, balance_stars: 0, created_at: new Date(), updated_at: new Date() };
        users.set(tgId, u);
    } else {
        u.username = tgUser.username || u.username;
        u.first_name = tgUser.first_name || u.first_name;
        updateUserTs(u);
    }
    return Object.assign({}, u);
}

// ---------- Inventory / Best drops ----------
function fetchInventory(userId) {
    return [...inventory.values()]
        .filter((r) => r.user_id === userId)
        .sort((a, b) => b.won_at - a.won_at)
        .map((r) => Object.assign({}, r));
}

function fetchBestDrops(userId) {
    return [...bestDrops.values()]
        .filter((r) => r.user_id === userId)
        .sort((a, b) => b.price_stars - a.price_stars)
        .slice(0, 6)
        .map((r) => Object.assign({}, r));
}

function upsertBestDrop(userId, row) {
    const key = userId + ':' + row.item_id;
    const ex = bestDrops.get(key);
    if (!ex) {
        bestDrops.set(key, Object.assign({}, row, { user_id: userId }));
    } else {
        ex.price_stars = Math.max(ex.price_stars, row.price_stars);
    }
    // Держим только ТОП-6 по цене для пользователя.
    const all = [...bestDrops.values()].filter((r) => r.user_id === userId);
    if (all.length > 6) {
        const keep = new Set(all.sort((a, b) => b.price_stars - a.price_stars).slice(0, 6).map((r) => r.item_id));
        for (const [k, r] of bestDrops) {
            if (r.user_id === userId && !keep.has(r.item_id)) bestDrops.delete(k);
        }
    }
}

function weightedPick(items) {
    const total = items.reduce((s, it) => s + (it.weight > 0 ? it.weight : 1), 0);
    let roll = Math.random() * total;
    for (const it of items) {
        roll -= (it.weight > 0 ? it.weight : 1);
        if (roll <= 0) return it;
    }
    return items[items.length - 1];
}

function caseError(code, message) {
    return Object.assign(new Error(message), { code });
}

// ---------- Открытие кейса (атомарно) ----------
function openCase(userId, caseId, mult) {
    return withLock(userId, () => {
        const c = (CASES_CONF.cases || []).find((x) => String(x.id) === String(caseId));
        if (!c) throw caseError('BAD_REQUEST', 'Unknown case');
        mult = Math.min(Math.max(Number(mult) || 1, 1), 5);
        const priceStars = Math.round(Number(c.price) || 0) * mult;

        const u = [...users.values()].find((x) => x.id === userId);
        if (!u) throw caseError('NOT_FOUND', 'User not found');

        // Проверка баланса (у нового пользователя 0 Stars).
        if (Number(u.balance_stars) < priceStars) throw caseError('INSUFFICIENT', 'Insufficient balance');

        // Списание.
        u.balance_stars = Number(u.balance_stars) - priceStars;
        updateUserTs(u);

        // Рандом по весам — СТРОГО на сервере.
        const drop = weightedPick([...CATALOG.values()]);
        const invRow = {
            id: nextInvId++,
            user_id: userId,
            item_id: drop.item_id,
            name: drop.name,
            image: drop.image,
            rarity: drop.rarity || 'common',
            price_stars: drop.price_stars,
            status: 'owned',
            won_at: Date.now(),
        };
        inventory.set(invRow.id, invRow);
        upsertBestDrop(userId, invRow);
        transactions.push({ user_id: userId, type: 'case_open', amount_stars: -priceStars, item_id: invRow.item_id, meta: { case_id: c.id, mult }, created_at: new Date() });

        return { item: Object.assign({}, invRow), priceStars, balance: u.balance_stars };
    });
}

// ---------- Продажа (атомарно) ----------
function sellItems(userId, ids) {
    return withLock(userId, () => {
        const wanted = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite);
        if (!wanted.length) throw caseError('BAD_REQUEST', 'No items');
        const u = [...users.values()].find((x) => x.id === userId);
        if (!u) throw caseError('NOT_FOUND', 'User not found');

        let credits = 0;
        const sold = [];
        for (const id of wanted) {
            const row = inventory.get(id);
            // Сервер перепроверяет владение и статус: pending_withdraw продать нельзя.
            if (!row || row.user_id !== userId || row.status !== 'owned') continue;
            credits += row.price_stars;
            sold.push(row);
            inventory.delete(id);
        }
        if (!sold.length) throw caseError('CONFLICT', 'Nothing to sell');

        u.balance_stars = Number(u.balance_stars) + credits;
        updateUserTs(u);
        for (const r of sold) {
            transactions.push({ user_id: userId, type: 'sell', amount_stars: r.price_stars, item_id: r.item_id, meta: { inventory_id: r.id }, created_at: new Date() });
        }
        return { credits, balance: u.balance_stars, sold: sold.length };
    });
}

// ---------- Вывод (атомарно) ----------
function withdraw(userId, invId, username) {
    return withLock(userId, () => {
        const row = inventory.get(Number(invId));
        if (!row || row.user_id !== userId || row.status !== 'owned') {
            throw caseError('CONFLICT', 'Item not sellable/owned');
        }
        row.status = 'pending_withdraw';
        transactions.push({ user_id: userId, type: 'withdraw', amount_stars: 0, item_id: row.item_id, meta: { username: String(username || '').slice(0, 64), inventory_id: row.id }, created_at: new Date() });
        return { ok: true };
    });
}

module.exports = { upsertUser, fetchInventory, fetchBestDrops, openCase, sellItems, withdraw, CATALOG };