/* ============================================================
   CRYPTO DEPOSIT WORKER (локальный cron, Node).
   Опрос входящих транзакций каждые 15 сек, автоначисление по Memo.
   Запуск: node worker/crypto-deposit-worker.cjs   (env: DATABASE_URL)
   Останавливается по Ctrl+C. Для продакшн — Vercel Cron или pm2.
   ============================================================ */
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const { pathToFileURL } = require('url');

const INTERVAL = Number(process.env.CRYPTO_POLL_INTERVAL_MS || 15000);

async function tick() {
  try {
    const mod = await import(pathToFileURL(path.join(__dirname, '..', 'api', '_lib', 'cryptoWorker.mjs')).href);
    const result = await mod.processPendingDeposits();
    if (result.matched > 0) console.log(`[crypto-worker] matched=${result.matched} pending=${result.pending}`);
  } catch (e) {
    console.error('[crypto-worker]', (e && e.message) || e);
  }
}

console.log(`[crypto-worker] polling each ${INTERVAL / 1000}s`);
tick();
setInterval(tick, INTERVAL);