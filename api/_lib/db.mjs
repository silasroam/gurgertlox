/* ============================================================
   Vercel Serverless — PostgreSQL connection layer.
   - Neon (neon.tech)  -> @neondatabase/serverless (WebSocket)
   - Vercel Postgres / Supabase / any TCP postgres -> pg
   Pool is cached on globalThis and reused across warm invocations.
   ============================================================ */
'use strict';

let _pool = null;

function connectionString() {
    return process.env.POSTGRES_URL
        || process.env.POSTGRES_PRISMA_URL
        || process.env.DATABASE_URL
        || '';
}

async function getPool() {
    if (_pool) return _pool;
    const cs = connectionString();
    if (!cs) throw new Error('Database not configured (set POSTGRES_URL in Vercel Environment Variables)');

    // Neon serverless driver when the host is a Neon database.
    if (/neon\.(tech|build|new)/i.test(cs)) {
        try {
            const neon = await import('@neondatabase/serverless');
            const cfg = neon.neonConfig;
            if (cfg) {
                // Node runtime: global WebSocket (Node >= 22) or `ws` package.
                const WS = (typeof WebSocket !== 'undefined') ? WebSocket : (await import('ws')).default;
                cfg.webSocketConstructor = WS;
            }
            _pool = new neon.Pool({ connectionString: cs, max: 5 });
            _pool.__driver = 'neon';
            return _pool;
        } catch (e) {
            // Driver missing / failed — fall back to pg over TCP.
        }
    }

    const pg = await import('pg');
    const PGPool = pg.Pool || (pg.default && pg.default.Pool);
    _pool = new PGPool({ connectionString: cs, max: 5, ssl: /sslmode=require/i.test(cs) ? { rejectUnauthorized: false } : undefined });
    _pool.__driver = 'pg';
    return _pool;
}

export async function getDb() {
    return getPool();
}

// Thin helper for single statements.
export async function query(sql, params) {
    const pool = await getPool();
    return pool.query(sql, params);
}

// Transaction helper: BEGIN -> fn(client) -> COMMIT / ROLLBACK.
export async function withTransaction(fn) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const out = await fn(client);
        await client.query('COMMIT');
        return out;
    } catch (e) {
        try { await client.query('ROLLBACK'); } catch (e2) { /* ignore */ }
        throw e;
    } finally {
        client.release();
    }
}
