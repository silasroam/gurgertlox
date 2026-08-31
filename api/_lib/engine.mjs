/* ============================================================
   CASE ENGINE (serverless port) — server-side drop generation
   + atomic DB operations. All randomness happens HERE.
   ============================================================ */
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirnameLib = path.dirname(fileURLToPath(import.meta.url));

// Case definitions are loaded once per warm lambda instance.
let CASES_CONF = null;
function loadCases() {
    if (CASES_CONF) return CASES_CONF;
    const p = path.join(__dirnameLib, '..', '..', 'casesConfig.json');
    CASES_CONF = JSON.parse(fs.readFileSync(p, 'utf8'));
    return CASES_CONF;
}

const CODES = { NOT_FOUND: 404, BAD_REQUEST: 400, INSUFFICIENT: 402, RACE: 409, CONFLICT: 409 };
export function httpCode(err) {
    return CODES[err && err.code] || 500;
}

export function getCaseConfig(caseId) {
    const conf = loadCases();
    return (conf.cases || []).find((x) => String(x.id) === String(caseId)) || null;
}

// Weighted random pick from case items.
export function weightedPick(items) {
    const total = items.reduce((s, it) => s + (Number(it.weight) || 0), 0);
    if (total <= 0) return items[0];
    let r = Math.random() * total;
    for (const it of items) {
        r -= Number(it.weight) || 0;
        if (r <= 0) return it;
    }
    return items[items.length - 1];
}

// Open a case atomically: lock user, validate/debit balance, roll drop,
// write inventory + best_drops, log transaction. Returns dropped item.
// NB: транзакцией управляет withTransaction() — здесь BEGIN/COMMIT не нужны.
export async function openCase(client, userId, caseId, mult) {
    const config = getCaseConfig(caseId);
    if (!config) throw Object.assign(new Error('Case not found'), { code: 'NOT_FOUND' });

    // Цена кейса в конфиге — в STARS (XTR), как её показывает фронтенд
    // («Открыть за 19 ⭐») и как трактуют её подарки (value → ⭐).
    const priceStars = Math.round((Number(config.price) || 0) * (Number(mult) || 1));
    if (priceStars <= 0) throw Object.assign(new Error('Invalid case price'), { code: 'BAD_REQUEST' });

    // SERIALIZE open requests per user: lock the user row FOR UPDATE.
    const lock = await client.query(`SELECT id, balance_stars FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (lock.rowCount === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
    const user = lock.rows[0];

    if (user.balance_stars < priceStars) {
        throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT' });
    }

    // Atomic debit (guarded by CHECK balance_stars >= 0 + row lock).
    await client.query(
        `UPDATE users SET balance_stars = balance_stars - $2, updated_at = now()
         WHERE id = $1 AND balance_stars >= $2`,
        [userId, priceStars]
    );
    const debited = await client.query(`SELECT balance_stars FROM users WHERE id = $1`, [userId]);
    if (debited.rowCount === 0 || Number(debited.rows[0].balance_stars) < 0) {
        throw Object.assign(new Error('Race: debit rejected'), { code: 'RACE' });
    }

    // Server-side weighted roll.
    const dropped = weightedPick(config.items);

    // Insert into inventory.
    const inv = await client.query(
        `INSERT INTO user_inventory (user_id, item_id, name, image, rarity, price_stars, status)
         VALUES ($1,$2,$3,$4,$5,$6,'owned')
         RETURNING id, item_id, name, image, rarity, price_stars, status, won_at`,
        [userId, dropped.id, dropped.name, dropped.image || null, dropped.tier || dropped.rarity || 'common',
         Math.round(Number(dropped.value) || 0)]
    );

    // Track best drops (all-time TOP-6) — never touched by sell/withdraw.
    await client.query(
        `INSERT INTO best_drops (user_id, item_id, name, image, rarity, price_stars)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [userId, dropped.id, dropped.name, dropped.image || null, dropped.tier || dropped.rarity || 'common',
         Math.round(Number(dropped.value) || 0)]
    );
    await client.query(
        `DELETE FROM best_drops
         WHERE id IN (
             SELECT id FROM best_drops WHERE user_id = $1
             ORDER BY price_stars DESC, won_at DESC
             OFFSET 6
         )`,
        [userId]
    );

    // Log transaction.
    await client.query(
        `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
         VALUES ($1,'case_open',$2,$3,$4::jsonb)`,
        [userId, -priceStars, dropped.id, JSON.stringify({ case_id: caseId, mult })]
    );

    return { item: inv.rows[0], priceStars, balance: Number(debited.rows[0].balance_stars) };
}

// Sell owned inventory items atomically. Server recomputes the total from DB
// (never trusts client amounts). Items with status pending_withdraw are refused.
// NB: транзакцией управляет withTransaction() — здесь BEGIN/COMMIT не нужны.
export async function sellItems(client, userId, inventoryIds) {
    const ids = Array.isArray(inventoryIds) ? inventoryIds.map(Number).filter(Boolean) : [];
    if (!ids.length) throw Object.assign(new Error('No items to sell'), { code: 'BAD_REQUEST' });

    // Serialise per user + lock their items to sell (FOR UPDATE).
    const lockU = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (lockU.rowCount === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

    const itemsRes = await client.query(
        `SELECT id, price_stars FROM user_inventory
         WHERE user_id = $1 AND id = ANY($2::bigint[]) AND status = 'owned'
         FOR UPDATE`,
        [userId, ids]
    );
    const items = itemsRes.rows;
    if (items.length !== ids.length) {
        // Some requested items missing / not owned / already on withdrawal.
        throw Object.assign(new Error('Some items are not sellable'), { code: 'CONFLICT' });
    }

    const total = items.reduce((s, it) => s + (Number(it.price_stars) || 0), 0);

    // Credit balance (guarded by row lock + CHECK >= 0).
    const credited = await client.query(
        `UPDATE users SET balance_stars = balance_stars + $2, updated_at = now()
         WHERE id = $1 RETURNING balance_stars`,
        [userId, total]
    );
    await client.query(`DELETE FROM user_inventory WHERE user_id = $1 AND id = ANY($2::bigint[])`, [userId, ids]);
    await client.query(
        `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
         VALUES ($1,'sell',$2,NULL,$3::jsonb)`,
        [userId, total, JSON.stringify({ ids })]
    );

    return { credited: total, balance: Number(credited.rows[0].balance_stars) };
}
