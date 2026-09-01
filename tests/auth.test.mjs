import crypto from 'node:crypto';
import { verifyInitData } from '../api/_lib/auth.mjs';

const token = '12345:TESTTOKEN';
const userJson = JSON.stringify({ id: 777, username: 'tester', first_name: 'T' });

// Реалистичный initData: значения URL-encoded (как шлёт Telegram).
const encoded = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAF',
    user: userJson,
}).toString();

// Telegram-алгоритм: data_check_string = RAW-пары (без hash), сортировка по ключу, join '\n'.
const pairs = encoded.split('&').map((s) => {
    const i = s.indexOf('=');
    return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)];
});
const dcs = pairs
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => k + '=' + v)
    .join('\n');

const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
const initData = encoded + '&hash=' + hash;

const ok = verifyInitData(initData, token);
// tg_id теперь нормализуется в СТРОКУ (BIGINT-безопасно, 10+ знаков TG ID).
console.log('valid:', !!(ok && String(ok.tg_id) === '777' && ok.username === 'tester'));

// Подделка: меняем значение после подписи.
const tampered = initData.replace('query_id=AAF', 'query_id=HACK');
console.log('tampered rejected:', verifyInitData(tampered, token) === null);

// Просроченный auth_date (>24ч) — anti-replay.
const stale = verifyInitData(initData.replace(/auth_date=\d+/, 'auth_date=' + Math.floor(Date.now() / 1000 - 100000)), token);
console.log('stale(>24h) rejected:', stale === null);

// Без hash — отказ.
console.log('no-hash rejected:', verifyInitData(encoded, token) === null);

// Чужой токен — отказ.
console.log('wrong-token rejected:', verifyInitData(initData, '999:OTHER') === null);

