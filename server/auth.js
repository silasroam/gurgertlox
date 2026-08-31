/* ============================================================
   TELEGRAM initData AUTHENTICATION
   HMAC-SHA256 via bot token -> secret key -> datacheck_hash.
   Validates that the initData really comes from our bot.
   ============================================================ */
'use strict';
const crypto = require('crypto');

// Returns verified user object (from initData) or null.
// initData fields are &-joined query-style pairs sorted by key.
function verifyInitData(initData, botToken) {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');

    // data_check_string: sorted key=value pairs joined by \n (URL-unescaped values)
    const pairs = [...params.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k}=${decodeURIComponent(v)}`)
        .join('\n');

    // secret_key = HMAC_SHA256(bot_token, "WebAppData")
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    // computed hash over data_check_string
    const computed = crypto.createHmac('sha256', secretKey).update(pairs).digest('hex');

    // Constant-time compare
    const a = Buffer.from(computed, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;

    // Extract & verify auth_date freshness (within 24h)
    const authDate = Number(params.get('auth_date') || 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

    try {
        const user = JSON.parse(params.get('user') || '{}');
        if (!user || user.id == null) return null;
        return {
            tg_id: user.id,
            username: user.username || null,
            first_name: user.first_name || null,
            photo_url: user.photo_url || null
        };
    } catch (e) {
        return null;
    }
}

module.exports = { verifyInitData };