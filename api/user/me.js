/* ============================================================
   GET /api/user/me — balance + inventory + best_drops from DB.
   ============================================================ */
'use strict';
import { getDb } from '../_lib/db.mjs';
import { authUser, json } from '../_lib/http.mjs';

export default async function handler(req, res) {
    try {
        const user = await authUser(req);
        if (!user) return json(res, 401, { error: 'Unauthorized' });

        const db = await getDb();
        const [inv, best] = await Promise.all([
            db.query(
                `SELECT id, item_id, name, image, rarity, price_stars, status, won_at
                 FROM user_inventory WHERE user_id = $1 ORDER BY won_at DESC`,
                [user.id]
            ),
            db.query(
                `SELECT id, item_id, name, image, rarity, price_stars, won_at
                 FROM best_drops WHERE user_id = $1 ORDER BY price_stars DESC LIMIT 6`,
                [user.id]
            ),
        ]);

        return json(res, 200, { user, inventory: inv.rows, bestDrops: best.rows });
    } catch (e) {
        return json(res, 500, { error: e.message });
    }
}
