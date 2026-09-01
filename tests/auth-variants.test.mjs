// Проверка RAW и DECODED вариантов initData (временный скрипт).
import crypto from 'node:crypto';
import { verifyInitData } from '../api/_lib/auth.mjs';

const token = '12345:TESTTOKEN';
const userJson = JSON.stringify({ id: 555, username: 'dec_user', first_name: 'D' });
const pairs = [
    ['auth_date', String(Math.floor(Date.now() / 1000))],
    ['query_id', 'AAF'],
    ['user', userJson],
];
const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();

// 1. Каноничный RAW-вариант (как шлёт Telegram).
const dcs = pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).sort().join('\n');
const hash = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
const initData = [...pairs.map(([k, v]) => `${k}=${encodeURIComponent(v)}`), `hash=${hash}`].join('&');
const r1 = verifyInitData(initData, token);
console.log('RAW-вариант принят:', !!(r1 && r1.tg_id === 555 && r1.username === 'dec_user'));

// 2. DECODED-вариант (значения декодированы, подпись над декодированными парами).
const dcs2 = pairs.map(([k, v]) => `${k}=${v}`).sort().join('\n');
const hash2 = crypto.createHmac('sha256', secret).update(dcs2).digest('hex');
const decData = [...pairs.map(([k, v]) => `${k}=${v}`), `hash=${hash2}`].join('&');
const r2 = verifyInitData(decData, token);
console.log('DECODED-вариант принят (фолбэк):', !!(r2 && r2.tg_id === 555));

// 3. Подделка по-прежнему отбрасывается.
const bad = initData.replace('query_id=AAF', 'query_id=HACK');
console.log('Подделка отброшена:', verifyInitData(bad, token) === null);
