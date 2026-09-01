/* ============================================================
   POST /api/payment/create-crypto-deposit
   Создаёт депозит в крипте: генерирует Memo, считает сумму,
   пишет в crypto_deposits (status=pending), возвращает реквизиты.
   ============================================================ */
'use strict';
import { authUser } from '../../_lib/http.mjs';
import { getDb } from '../../_lib/db.mjs';
import { json, readJson } from '../../_lib/http.mjs';
import { WALLETS, COIN_META, cryptoAmountFor, roundCrypto, saturateAmount } from '../../_lib/crypto.mjs';

const VALID_CURRENCIES = Object.keys(COIN_META);

function parseStars(raw) {
  const n = Math.round(Number(raw));
  if (!Number.isInteger(n) || n < 1 || n > 1000000) return 0;
  return n;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  // Анти-фрод: только валидный Telegram initData (подпись HMAC).
  const user = await authUser(req);
  if (!user) return json(res, 401, { error: 'Unauthorized' });

  const body = await readJson(req);
  const currency = String(body.currency || '').toUpperCase();
  if (!VALID_CURRENCIES.includes(currency)) return json(res, 400, { error: 'Bad currency' });

  const stars = parseStars(body.stars_amount);
  if (!stars) return json(res, 400, { error: 'Bad stars_amount' });

  const base = roundCrypto(currency, cryptoAmountFor(currency, stars));
  if (base <= 0) return json(res, 400, { error: 'Bad amount' });
  // Гибрид: USDT/LTC — точная сумма с микро-копийками; TON — ровная (мемо).
  const amountCrypto = saturateAmount(currency, base);

  const db = await getDb();
  // Идемпотентность: UNIQUE(memo); при коллизии повторим до 3 раз.
  let dep;
  let memo = `DEP_${user.tg_id}_${Math.floor(1000 + Math.random() * 9000)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ins = await db.query(
        `INSERT INTO crypto_deposits (tg_id, currency, amount_crypto, stars_to_add, memo, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         RETURNING id, currency, amount_crypto::float8, stars_to_add, memo, status, created_at`,
        [user.tg_id, currency, amountCrypto, stars, memo]
      );
      dep = ins.rows[0];
      break;
    } catch (e) {
      // 23505 = unique violation (memo коллизия) -> новый random, повтор.
      if (e.code !== '23505' || attempt === 2) throw e;
      memo = `DEP_${user.tg_id}_${Math.floor(1000 + Math.random() * 9000)}`;
    }
  }

  return json(res, 200, {
    ok: true,
    id: dep.id,
    currency,
    network: COIN_META[currency].network,
    wallet_address: WALLETS[currency],
    amount_crypto: Number(dep.amount_crypto),
    symbol: COIN_META[currency].symbol,
    id_mode: currency === 'TON' ? 'memo' : 'amount',
    memo,
    stars_amount: stars,
  });
}