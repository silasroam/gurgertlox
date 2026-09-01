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

    // data_check_string: sorted key=value pairs joined by \n.
    // ВАЖНО: значения остаются RAW (как прислал Telegram) — decodeURIComponent
    // ломает HMAC. Фолбэк с декодированием оставлен для прокси-клиентов.
    const pairs = [...params.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]));

    // secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // Вариант 1 (каноничный): RAW-значения.
    const rawString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');
    // Вариант 2 (фолбэк): декодированные значения.
    const decString = pairs.map(([k, v]) => { try { return `${k}=${decodeURIComponent(v)}`; } catch (e) { return `${k}=${v}`; } }).join('\n');

    const computed = crypto.createHmac('sha256', secretKey).update(rawString).digest('hex');
    const computedDec = crypto.createHmac('sha256', secretKey).update(decString).digest('hex');

    // Constant-time compare (принимаем RAW или декодированный вариант).
    const a = Buffer.from(computed, 'hex');
    const ad = Buffer.from(computedDec, 'hex');
    const b = Buffer.from(hash, 'hex');
    const rawOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    const decOk = !rawOk && ad.length === b.length && crypto.timingSafeEqual(ad, b);
    if (!rawOk && !decOk) return null;

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