/* ============================================================
   TELEGRAM initData AUTHENTICATION (Vercel Serverless port).
   HMAC-SHA256 via bot token -> secret key -> data_check_string.
   Fixed algorithm: values in data_check_string must stay RAW
   (url-encoded exactly as received), hash excluded, sorted by key.
   ============================================================ */
'use strict';
import crypto from 'node:crypto';

export function verifyInitData(initData, botToken) {
    if (!initData || !botToken) return null;

    // Manual split: keeps values RAW (URLSearchParams would decode them).
    const pairs = String(initData).split('&').map((s) => {
        const i = s.indexOf('=');
        return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
    });

    const hashPair = pairs.find(([k]) => k === 'hash');
    if (!hashPair) return null;
    const hash = hashPair[1];

    // data_check_string: sorted key=value pairs joined by \n, без hash.
    // Канонично — RAW-значения (как прислал Telegram). Фолбэк — декодированные
    // (некоторые прокси/клиенты декодируют значения заголовков).
    const body = pairs.filter(([k]) => k !== 'hash');
    const rawString = body
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([k, v]) => `${k}=${v}`)
        .join('\n');
    const decString = body
        .map(([k, v]) => { try { return `${k}=${decodeURIComponent(v)}`; } catch (e) { return `${k}=${v}`; } })
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
        .join('\n');

    // secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secretKey).update(rawString).digest('hex');
    const computedDec = crypto.createHmac('sha256', secretKey).update(decString).digest('hex');

    const a = Buffer.from(computed, 'hex');
    const ad = Buffer.from(computedDec, 'hex');
    const b = Buffer.from(hash, 'hex');
    const rawOk = a.length === b.length && crypto.timingSafeEqual(a, b);
    const decOk = !rawOk && ad.length === b.length && crypto.timingSafeEqual(ad, b);
    if (!rawOk && !decOk) return null;

    // Freshness: auth_date within 24h (anti-replay).
    const authPair = pairs.find(([k]) => k === 'auth_date');
    const authDate = Number(authPair ? authPair[1] : 0);
    if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

    try {
        const userPair = pairs.find(([k]) => k === 'user');
        const user = JSON.parse(decodeURIComponent(userPair ? userPair[1] : '{}'));
        if (!user || user.id == null) return null;
        // tg_id нормализуем в СТРОКУ сразу при парсинге initData:
        // Telegram-ID 10-значные (~5e9) — Number их вмещает точно (< 2^53),
        // но в БД уходит строка, чтобы pg/BIGINT не терял точность ни при каких ID.
        const rawId = user.id;
        const idStr = (typeof rawId === 'number' && Number.isInteger(rawId) && rawId > 0)
            ? String(rawId)
            : (typeof rawId === 'string' && /^\d{1,20}$/.test(rawId.trim()))
                ? rawId.trim().replace(/^0+(?=\d)/, '')
                : null;
        if (!idStr) return null;
        return {
            tg_id: idStr,
            username: user.username || null,
            first_name: user.first_name || null,
            photo_url: user.photo_url || null,
        };
    } catch (e) {
        return null;
    }
}
