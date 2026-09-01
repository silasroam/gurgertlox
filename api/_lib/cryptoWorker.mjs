/* ============================================================
   CRYPTO WORKER — авто-проверка входящих транзакций по Memo.
   Для каждой монеты запрашивает входящие транзакции адреса через
   бесплатные public API и ищет наш Memo (комментарий к переводу).
   Порог подтверждений (confirms) настраивается.
   При совпадении: атомарно начисляет stars и ставит status=completed.
   ============================================================ */
'use strict';
import { getDb, withTransaction } from './db.mjs';
import { WALLETS } from './crypto.mjs';

const MIN_CONFIRMS = Number(process.env.CRYPTO_MIN_CONFIRMS || 1);
const AMOUNT_TOLERANCE = Number(process.env.CRYPTO_AMOUNT_TOLERANCE || 0.99);
const MEMO_RE = /^DEP_(\d{1,20})_(\d{1,10})$/;

function parseMemo(memo) {
  if (!memo) return null;
  const m = String(memo).trim().match(MEMO_RE);
  return m ? { tgId: m[1], suffix: m[2] } : null;
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('API ' + r.status + ' ' + url);
  return r.json();
}

function decodeComment(msg) {
  if (!msg.msg_data || msg.msg_data['@type'] !== 'msg.dataText') return null;
  try { return Buffer.from(msg.msg_data.text, 'base64').toString('utf8'); } catch (e) { return null; }
}

async function tonIncoming(address) {
  const url = `https://toncenter.com/api/v2/getTransactions?address=${address}&limit=40&archival=true`;
  const data = await fetchJson(url);
  const out = [];
  for (const tx of data.result || []) {
    for (const slot of ['in_msg', 'out_msg']) {
      const msg = tx[slot];
      if (!msg || !msg.source || msg.destination !== address) continue;
      const comment = decodeComment(msg);
      if (comment && comment.startsWith('DEP_')) {
        out.push({ hash: tx.transaction_id?.hash, comment, amount: Number(msg.value) / 1e9, confirms: tx.confirmations || 1 });
      }
    }
  }
  return out;
}

async function tronMemo(txid) {
  try {
    const t = await fetchJson(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txid}`);
    return t.raw_data?.contract?.[0]?.parameter?.data || '';
  } catch (e) { return ''; }
}

async function tronIncoming(address) {
  const url = `https://api.tronscan.org/api/token_trc20/transfers?limit=50&start=0&sort=-timestamp&relatedAddress=${address}`;
  const data = await fetchJson(url);
  const out = [];
  for (const t of data.token_transfers || []) {
    if (t.to_address?.toLowerCase() !== address.toLowerCase()) continue;
    const comment = (t.transaction_id && (await tronMemo(t.transaction_id))) || '';
    if (comment.startsWith('DEP_')) {
      const decimals = Number(t.token_info?.decimals || t.decimals || 6);
      out.push({ hash: t.transaction_id, comment, amount: Number(t.quant) / Math.pow(10, decimals), confirms: 1 });
    }
  }
  return out;
}

function extractLtcMemo(script) {
  const m = script.match(/^(?:6a0?[0-9a-fA-F]{2})(.+)$/);
  if (!m) return '';
  const hex = m[1];
  if (hex.length % 2) return '';
  let s = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substr(i, 2), 16);
    if (code >= 32 && code < 127) s += String.fromCharCode(code);
    else return '';
  }
  return s;
}

async function ltcIncoming(address) {
  const url = `https://api.blockcypher.com/v1/ltc/main/addrs/${address}?limit=30&unspentOnly=false`;
  const data = await fetchJson(url);
  const out = [];
  for (const tx of data.txrefs || []) {
    if (tx.spent === true) continue;
    const isIn = data.addresses && String(tx.address) === address;
    if (!isIn) continue;
    const script = String(tx.script || '');
    const comment = extractLtcMemo(script) || '';
    if (comment.startsWith('DEP_')) {
      out.push({ hash: tx.tx_hash, comment, amount: Math.abs(Number(tx.value)) / 1e8, confirms: tx.confirmations || 1 });
    }
  }
  return out;
}

async function incomingByAddress(currency) {
  const wallet = WALLETS[currency];
  if (!wallet) return [];
  if (currency === 'TON') return tonIncoming(wallet);
  if (currency === 'USDT_TRC20') return tronIncoming(wallet);
  if (currency === 'LTC') return ltcIncoming(wallet);
  return [];
}

// Единый проход: для всех pending депозитов сматчить по Memo (TON) или точной сумме (USDT/LTC).
export async function processPendingDeposits() {
  const db = await getDb();
  const pending = await db.query(
    `SELECT id, tg_id, currency, amount_crypto::float8, stars_to_add, memo, status, created_at
     FROM crypto_deposits WHERE status = 'pending' ORDER BY created_at LIMIT 200`
  );
  if (!pending.rows.length) return { matched: 0, pending: 0 };

  const incoming = {};
  for (const c of ['USDT_TRC20', 'TON', 'LTC']) {
    try { incoming[c] = await incomingByAddress(c); } catch (e) { incoming[c] = []; }
  }

  let matched = 0;
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  for (const row of pending.rows) {
    // TON: идентификация по Memo
    if (row.currency === 'TON') {
      if (!parseMemo(row.memo)) continue;
      const txs = (incoming[row.currency] || []).filter((t) => t.comment === row.memo);
      const hit = txs.find((t) => t.confirms >= MIN_CONFIRMS && t.amount > 0 && t.amount >= row.amount_crypto * AMOUNT_TOLERANCE);
      if (!hit) continue;

      try {
        await withTransaction(async (client) => {
          await client.query(`SELECT id FROM crypto_deposits WHERE id = $1 FOR UPDATE`, [row.id]);
          const cur = await client.query(`SELECT status FROM crypto_deposits WHERE id = $1`, [row.id]);
          if (cur.rows[0]?.status !== 'pending') return;
          await client.query(
            `UPDATE users SET balance_stars = balance_stars + $2, updated_at = now() WHERE tg_id = $1`,
            [row.tg_id, row.stars_to_add]
          );
          await client.query(
            `UPDATE crypto_deposits SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]
          );
          await client.query(
            `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
             SELECT id, 'deposit', $2, NULL, $3::jsonb FROM users WHERE tg_id = $1`,
            [row.tg_id, row.stars_to_add, JSON.stringify({ crypto_deposit_id: row.id, currency: row.currency, memo: row.memo })]
          );
        });
        matched++;
      } catch (e) { /* конфликт/дубль — пропускаем, не роняем worker. */ }
    }
    // USDT/LTC: идентификация по ТОЧНОЙ сумме за последний час
    else if (row.currency === 'USDT_TRC20' || row.currency === 'LTC') {
      const recentPending = pending.rows.filter(
        r => r.currency === row.currency && r.created_at >= oneHourAgo
      );
      const txs = (incoming[row.currency] || []).filter((t) => t.confirms >= MIN_CONFIRMS && t.amount > 0);
      
      // Ищем точное совпадение amount_crypto
      const hit = txs.find((t) => Math.abs(t.amount - row.amount_crypto) < 0.000001);
      if (!hit) continue;

      // Проверяем, что эта транзакция не использована другим депозитом
      const alreadyUsed = await db.query(
        `SELECT id FROM crypto_deposits WHERE status = 'completed' AND currency = $1 AND amount_crypto::float8 = $2`,
        [row.currency, hit.amount]
      );
      if (alreadyUsed.rows.length > 0) continue;

      try {
        await withTransaction(async (client) => {
          await client.query(`SELECT id FROM crypto_deposits WHERE id = $1 FOR UPDATE`, [row.id]);
          const cur = await client.query(`SELECT status FROM crypto_deposits WHERE id = $1`, [row.id]);
          if (cur.rows[0]?.status !== 'pending') return;
          await client.query(
            `UPDATE users SET balance_stars = balance_stars + $2, updated_at = now() WHERE tg_id = $1`,
            [row.tg_id, row.stars_to_add]
          );
          await client.query(
            `UPDATE crypto_deposits SET status = 'completed', completed_at = now() WHERE id = $1`, [row.id]
          );
          await client.query(
            `INSERT INTO transactions (user_id, type, amount_stars, item_id, meta)
             SELECT id, 'deposit', $2, NULL, $3::jsonb FROM users WHERE tg_id = $1`,
            [row.tg_id, row.stars_to_add, JSON.stringify({ crypto_deposit_id: row.id, currency: row.currency, amount: row.amount_crypto })]
          );
        });
        matched++;
      } catch (e) { /* конфликт/дубль — пропускаем, не роняем worker. */ }
    }
  }
  return { matched, pending: pending.rows.length };
}