/* ============================================================
   Shared serverless helpers: auth middleware, per-user in-flight
   lock (anti double-click), JSON body parsing, responses.
   ============================================================ */
'use strict';
import { getDb } from './db.mjs';
import { verifyInitData } from './auth.mjs';
import { registerUser } from './users.mjs';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SEED_BALANCE = Number(process.env.SEED_BALANCE_STARS || 0);
const REQUIRE_TG_AUTH = process.env.REQUIRE_TG_AUTH !== 'false';

// Per-user in-flight lock: rapid double-clicks are rejected with 409.
// (Serverless-safe: scoped to a warm instance; DB row locks guarantee
// cross-instance correctness, this map just cheaply dedupes bursts.)
const inFlight = new Set();
export function tryAcquire(userId) {
    if (inFlight.has(userId)) return false;
    inFlight.add(userId);
    return true;
}
export function release(userId) { inFlight.delete(userId); }

const CODE_MAP = { NOT_FOUND: 404, BAD_REQUEST: 400, INSUFFICIENT: 402, RACE: 409, CONFLICT: 409 };
export const httpCodeFor = (e) => CODE_MAP[e && e.code] || 500;

export function json(res, code, obj) {
    res.statusCode = code;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
}

export async function readJson(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
        req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); } });
        req.on('error', () => resolve({}));
    });
}

function initDataFrom(req) {
    const h = req.headers['x-init-data'] || '';
    if (h) {
        try { return decodeURIComponent(String(h)); } catch (e) { return String(h); }
    }
    const u = new URL(req.url, 'http://localhost');
    return u.searchParams.get('init_data') || '';
}

// Validate Telegram identity and register/refresh the user on ANY entry:
// new user -> INSERT with unique 8-digit custom_id; existing -> last_active = NOW().
export async function authUser(req) {
    const initData = initDataFrom(req);
    let tgUser;
    if (REQUIRE_TG_AUTH) {
        tgUser = verifyInitData(initData, BOT_TOKEN);
        if (!tgUser) return null;
    } else {
        tgUser = { tg_id: Number(initData) || 1, username: 'dev', first_name: 'Dev' };
    }

    const db = await getDb();
    return registerUser(db, tgUser, SEED_BALANCE);
}
