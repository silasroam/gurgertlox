/* ============================================================
   POST /api/open-case — atomic debit + server-side weighted roll.
   Per-user flight lock rejects rapid double-clicks (409).
   ============================================================ */
'use strict';
import { withTransaction } from './_lib/db.mjs';
import { authUser, json, readJson, tryAcquire, release, httpCodeFor } from './_lib/http.mjs';
import { openCase } from './_lib/engine.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
    const user = await authUser(req);
    if (!user) return json(res, 401, { error: 'Unauthorized' });

    // Race protection: 10 clicks/sec -> strictly one in flight per user.
    if (!tryAcquire(user.id)) return json(res, 409, { error: 'Request in progress' });

    try {
        const body = await readJson(req);
        const mult = Number(body.mult) || 1;
        const result = await withTransaction((client) => openCase(client, user.id, body.caseId, mult));
        return json(res, 200, { ok: true, item: result.item, spent: result.priceStars, balance: result.balance });
    } catch (e) {
        return json(res, httpCodeFor(e), { error: e.message });
    } finally {
        release(user.id);
    }
}
