/* ============================================================
   POST /api/sell — server recomputes the total from DB and
   credits Stars. Client amounts are never trusted.
   ============================================================ */
'use strict';
import { withTransaction } from './_lib/db.mjs';
import { authUser, json, readJson, tryAcquire, release, httpCodeFor } from './_lib/http.mjs';
import { sellItems } from './_lib/engine.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const user = await authUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    if (!tryAcquire(user.id)) return json(res, 409, { error: 'Request in progress' });

    try {
        const body = await readJson(req);
        const result = await withTransaction((client) => sellItems(client, user.id, body.ids));
        return json(res, 200, { ok: true, credited: result.credited, balance: result.balance });
    } catch (e) {
        return json(res, httpCodeFor(e), { error: e.message });
    } finally {
        release(user.id);
    }
}
