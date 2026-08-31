/* ============================================================
   CASE ENGINE — server-side drop generation + atomic DB ops.
   All randomness happens HERE, never on the client.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

// Load case definitions once at boot.
const CASES_FILE = path.join(__dirname, '..', 'casesConfig.json');
const CASES_CONF = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));

function getCaseConfig(caseId) {
    const c = (CASES_CONF.cases || []).find((x) => String(x.id) === String(caseId));
    return c || null;
}

// Weighted random pick from case items.
function weightedPick(items) {
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
async function openCase(pool, userId, caseId, mult) {
    const config = getCaseConfig(caseId);
    if (!config) {
        const err = new Error('Case not found');
        err.code = 'NOT_FOUND';
        throw err;
    }
    const priceTon = Number(config.price) || 0;
    const priceStars = Math.round(priceTon * 80 * (Number(mult) || 1));
    if (priceStars <= 0) {
        const err = new Error('Invalid case price');
        err.code = 'BAD_REQUEST';
        throw err;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // SERIALIZE open requests per user: lock the user row FOR UPDATE.
        const lock = await client.query(
            `SELECT id, balance_stars FROM users WHERE id = $1 FOR UPDATE`,
            [userId]
        );
        if (lock.rowCount === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
        const user = lock.rows[0];

        if (user.balance_stars < priceStars) {
            throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT' });
        }

        // Atomic debit (guarded by CHECK balance_stars >= 0 + row lock above).
        await client.query(
            `UPDATE users SET balance_stars = balance_stars - $2, updated_at = now()
             WHERE id = $1 AND balance_stars >= $2`,
            [userId, priceStars]
        );
        // Double-check the guarded update actually applied.
        const debited = await client.query(`SELECT balance_stars FROM users WHERE id = $1`, [userId]);
        if (debited.rowCount === 0 || debited.rows[0].balance_stars < 0) {
            throw Object.assign(new Error('Race: debit rejected'), { code: 'RACE' });
        }

        // Server-side weighted roll.
        const dropped = weightedPick(config.items);

        // Insert into inventory.
        const inv = await client.query(
            `INSERT INTO user_inventory (user_id, item_id, name, image, rarity, price_stars, status)
             VALUES ($1,$2,$3,$4,$5,$6,'owned')
             RETURNING id, item_id, name, image, rarity, price_stars, won_at`,
            [userId, dropped.id, dropped.name, dropped.image || null, dropped.tier || dropped.rarity || 'common',
             Math.round(Number(dropped.value) || 0)]
        );

        // Track best drops (history lives forever, top prices). Keep up to 6.
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
             VALUES ($1,'open_case',$2,$3,$4::jsonb)`,
            [userId, -priceStars, dropped.id, JSON.stringify({ case_id: caseId, mult }) ]
        );

        await client.query('COMMIT');
        return { item: inv.rows[0], priceStars, balance: debited.rows[0].balance_stars };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// Sell owned inventory items atomically. Server recomputes the total from DB
// (never trusts client amounts). Items with status pending_withdraw are refused.
async function sellItems(pool, userId, inventoryIds) {
    const ids = Array.isArray(inventoryIds) ? inventoryIds.map(Number).filter(Boolean) : [];
    if (!ids.length) throw Object.assign(new Error('No items to sell'), { code: 'BAD_REQUEST' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
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
        await client.query(
            `UPDATE users SET balance_stars = balance_stars + $2, updated_at = now()
             WHERE id = $1`,
            [userId, total]
        );
        // Delete sold inventory rows.
        await client.query(
            `DELETE FROM user_inventory WHERE user_id = $1 AND id = ANY($2::bigint[])`,
            [userId, ids]
        );
        // Log transaction (one per sold batch).
        await client.query(
            `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
             VALUES ($1,'sell',$2,NULL,$3::jsonb)`,
            [userId, total, JSON.stringify({ ids })]
        );

        const bal = await client.query(`SELECT balance_stars FROM users WHERE id = $1`, [userId]);
        await client.query('COMMIT');
        return { credits: total, balance: bal.rows[0].balance_stars };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { getCaseConfig, openCase, sellItems, weightedPick };