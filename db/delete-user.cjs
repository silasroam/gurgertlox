/* ============================================================
   DB ADMIN — удалить пользователя по custom_id (каскадно).
   Каскад удаляет user_inventory, best_drops, transactions
   (ON DELETE CASCADE в schema.sql).
   Запуск: node db/delete-user.cjs <custom_id>
   ============================================================ */
'use strict';
require('dotenv').config();
const { Pool } = require('pg');

const customId = Number(process.argv[2]);
if (!customId || customId < 10000000 || customId > 99999999) {
    console.error('Usage: node db/delete-user.cjs <custom_id (8 digits)>');
    process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const lock = await client.query(
            'SELECT id, tg_id, username, first_name, custom_id, balance_stars FROM users WHERE custom_id = $1 FOR UPDATE',
            [customId]
        );
        if (!lock.rowCount) {
            console.log('USER ' + customId + ' NOT FOUND');
            await client.query('ROLLBACK');
            process.exitCode = 1;
            return;
        }
        const u = lock.rows[0];
        const inv = await client.query('SELECT count(*)::int AS c FROM user_inventory WHERE user_id = $1', [u.id]);
        const tx = await client.query('SELECT count(*)::int AS c FROM transactions WHERE user_id = $1', [u.id]);
        await client.query('DELETE FROM users WHERE id = $1', [u.id]); // каскад удалит всё связанное
        await client.query('COMMIT');
        console.log('DELETED user:', JSON.stringify({
            id: u.id, tg_id: u.tg_id, username: u.username,
            custom_id: u.custom_id, balance_stars: u.balance_stars,
            inventory_removed: inv.rows[0].c, transactions_removed: tx.rows[0].c,
        }));
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('ERR', e.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
})();
