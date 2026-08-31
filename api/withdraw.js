/* ============================================================
   POST /api/withdraw — mark an owned item as pending_withdraw.
   ============================================================ */
'use strict';
import { withTransaction } from './_lib/db.mjs';
import { authUser, json, readJson, tryAcquire, release, httpCodeFor } from './_lib/http.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const user = await authUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    if (!tryAcquire(user.id)) return json(res, 409, { error: 'Request in progress' });

    try {
        const body = await readJson(req);
        const invId = Number(body.inventoryId);
        const username = String(body.username || '').slice(0, 64);
        const comment = String(body.comment || '').slice(0, 256);
        if (!invId) throw Object.assign(new Error('Bad inventoryId'), { code: 'BAD_REQUEST' });

        await withTransaction(async (client) => {
            const lk = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [user.id]);
            if (lk.rowCount === 0) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND' });

            const it = await client.query(
                `UPDATE user_inventory SET status = 'pending_withdraw'
                 WHERE id = $1 AND user_id = $2 AND status = 'owned' RETURNING item_id, name`,
                [invId, user.id]
            );
            if (it.rowCount === 0) {
                throw Object.assign(new Error('Item not sellable/owned'), { code: 'CONFLICT' });
            }

            await client.query(
                `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
                 VALUES ($1,'withdraw',0,$2,$3::jsonb)`,
                [user.id, it.rows[0].item_id, JSON.stringify({ username, comment, inventory_id: invId })]
            );
        });

        return json(res, 200, { ok: true });
    } catch (e) {
        return json(res, httpCodeFor(e), { error: e.message });
    } finally {
        release(user.id);
    }
}
