/* ============================================================
   DB INIT — применить схему и (опционально) засеять.
   Запуск: npm run db:init
   ============================================================ */
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function init() {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Schema applied (users, user_inventory, best_drops, transactions).');
    await pool.end();
}

init().catch((e) => {
    console.error('DB init failed:', e.message);
    process.exit(1);
});