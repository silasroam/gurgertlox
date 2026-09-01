/* ============================================================
   Casino Criptoporno — Production backend (Node http + PostgreSQL)
   - Telegram initData HMAC validation (anti-fraud)
   - Atomic case opens & sells via SQL row locks (race-safe)
   - All randomness & balance logic server-side
   - Serves the static frontend (index.html, css, js, images)
   ============================================================ */
'use strict';
require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { verifyInitData } = require('./server/auth.cjs');
const { openCase, sellItems } = require('./server/caseEngine.cjs');
const { registerUser } = require('./server/users.cjs');
const CASES_CONF = require('./casesConfig.json');

// ---------- PostgreSQL ----------
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
});

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SEED_BALANCE = Number(process.env.SEED_BALANCE_STARS || 0);
const REQUIRE_TG_AUTH = process.env.REQUIRE_TG_AUTH !== 'false';

// Per-user in-flight lock (dedupe rapid double-clicks).
const inFlight = new Map();
function tryAcquire(userId) {
    if (inFlight.get(userId)) return false;
    inFlight.set(userId, true);
    return true;
}
function release(userId) {
    inFlight.delete(userId);
}

const mime = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg', '.gif': 'image/gif', '.json': 'application/json',
};
const codeMap = { NOT_FOUND: 404, BAD_REQUEST: 400, INSUFFICIENT: 402, RACE: 409, CONFLICT: 409 };

function send(res, code, obj) {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
}
function readJson(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); } });
    });
}
function urlGet(req, key) {
    const u = new URL(req.url, 'http://localhost');
    return u.searchParams.get(key) || '';
}

// Register/refresh user by valid Telegram identity on ANY entry:
// new user -> INSERT with unique 8-digit custom_id; existing -> last_active = NOW().
async function authMiddleware(req) {
    let tgUser = null;
    const initData = req.headers['x-init-data'] || urlGet(req, 'init_data');
    if (REQUIRE_TG_AUTH) {
        tgUser = verifyInitData(initData, BOT_TOKEN);
        if (!tgUser) return null;
    } else {
        tgUser = { tg_id: Number(initData || 1), username: 'dev', first_name: 'Dev' };
    }
    return registerUser(pool, tgUser, SEED_BALANCE);
}

async function fetchInventory(userId) {
    const inv = await pool.query(
        `SELECT id, item_id, name, image, rarity, price_stars, status, won_at
         FROM user_inventory WHERE user_id = $1 ORDER BY won_at DESC`, [userId]
    );
    return inv.rows;
}

// ---------- HTTP server ----------
const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    const p = new URL(req.url, 'http://localhost').pathname;

    // ---------- API ----------
    if (p === '/api/user/me') {
        const user = await authMiddleware(req);
        if (!user) return send(res, 401, { error: 'Unauthorized' });
        const [inv, best] = await Promise.all([
            fetchInventory(user.id),
            pool.query(
                `SELECT id, item_id, name, image, rarity, price_stars, won_at
                 FROM best_drops WHERE user_id = $1 ORDER BY price_stars DESC LIMIT 6`, [user.id]
            ),
        ]);
        return send(res, 200, { user, inventory: inv.rows, bestDrops: best.rows });
    }

    if (p === '/api/open-case' && req.method === 'POST') {
        const user = await authMiddleware(req);
        if (!user) return send(res, 401, { error: 'Unauthorized' });
        // Per-user flight lock: rapid double-clicks are rejected (409).
        if (!tryAcquire(user.id)) return send(res, 409, { error: 'Request in progress' });
        try {
            const body = await readJson(req);
            const mult = Number(body.mult) || 1;
            const result = await openCase(pool, user.id, body.caseId, mult);
            release(user.id);
            return send(res, 200, { ok: true, item: result.item, spent: result.priceStars, balance: result.balance });
        } catch (e) {
            release(user.id);
            return send(res, codeMap[e.code] || 500, { error: e.message });
        }
    }

    if (p === '/api/sell' && req.method === 'POST') {
        const user = await authMiddleware(req);
        if (!user) return send(res, 401, { error: 'Unauthorized' });
        if (!tryAcquire(user.id)) return send(res, 409, { error: 'Request in progress' });
        try {
            const body = await readJson(req);
            const result = await sellItems(pool, user.id, body.ids);
            release(user.id);
            return send(res, 200, { ok: true, credited: result.credits, balance: result.balance });
        } catch (e) {
            release(user.id);
            return send(res, codeMap[e.code] || 500, { error: e.message });
        }
    }

    if (p === '/api/withdraw' && req.method === 'POST') {
        const user = await authMiddleware(req);
        if (!user) return send(res, 401, { error: 'Unauthorized' });
        if (!tryAcquire(user.id)) return send(res, 409, { error: 'Request in progress' });
        try {
            const body = await readJson(req);
            const invId = Number(body.inventoryId);
            const username = String(body.username || '').slice(0, 64);
            if (!invId) throw Object.assign(new Error('Bad inventoryId'), { code: 'BAD_REQUEST' });
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const lk = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
                if (lk.rowCount === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });
                const it = await client.query(
                    `UPDATE user_inventory SET status = 'pending_withdraw'
                     WHERE id = $1 AND user_id = $2 AND status = 'owned' RETURNING item_id, name`,
                    [invId, user.id]
                );
                if (it.rowCount === 0) throw Object.assign(new Error('Item not sellable/owned'), { code: 'CONFLICT' });
                await client.query(
                    `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
                     VALUES ($1,'withdraw',0,$2,$3::jsonb)`,
                    [user.id, it.rows[0].item_id, JSON.stringify({ username, inventory_id: invId })]
                );
                await client.query('COMMIT');
            } finally { client.release(); }
            release(user.id);
            return send(res, 200, { ok: true });
        } catch (e) {
            release(user.id);
            return send(res, codeMap[e.code] || 500, { error: e.message });
        }
    }

    // ---------- Static frontend ----------
    let fp = p === '/' ? '/index.html' : p;
    if (fp.includes('..')) return send(res, 400, { error: 'Bad path' });
    const full = path.join(__dirname, fp);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        return send(res, 404, { error: 'Not found' });
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(full)] || 'application/octet-stream' });
    res.end(fs.readFileSync(full));
});

const PORT = Number(process.env.PORT || 8080);
server.listen(PORT, () => console.log(`✅ Casino backend on :${PORT} (auth=${REQUIRE_TG_AUTH ? 'telegram' : 'dev'})`));