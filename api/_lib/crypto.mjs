/* ============================================================
   CRYPTO CONFIG — реквизиты Exodus-кошельков + курсы (фикс. коэфф.)
   Реквизиты и курсы настраиваются через env; дефолты ниже.
   Схема курса: { CURRENCY: stars_per_1_unit } — amount_crypto = stars / rate.
   ============================================================ */
'use strict';

// Адреса кошельков (Exodus, без KYC). Переопределяются env WALLET_<X>.
export const WALLETS = {
  USDT_TRC20: process.env.WALLET_USDT_TRC20 || 'TWq6JByvRy4S1KrJze7krqpfhUb7pbK7oR',
  TON: process.env.WALLET_TON || 'UQDbde4KnNiqjiWkx4IhsB5ChhVlKWtY6DSAyZzZ-G0mM6k7',
  LTC: process.env.WALLET_LTC || 'LaoDjKGe3NMdTLFQEt1ifVyHXcFXZ2wSF9',
};

// Ставки (звёзд за 1 единицу крипты). env CRYPTO_RATES = JSON.
// 1 USDT ≈ 100 stars, 1 TON ≈ 450 stars, 1 LTC ≈ 8000 stars.
const DEFAULT_RATES = { USDT_TRC20: 100, TON: 450, LTC: 8000 };
export function rates() {
  try {
    const r = JSON.parse(process.env.CRYPTO_RATES || '{}');
    return { ...DEFAULT_RATES, ...r };
  } catch (e) {
    return DEFAULT_RATES;
  }
}

// Метаданные монет для UI/валидации.
export const COIN_META = {
  USDT_TRC20: { network: 'TRON / TRC-20', symbol: 'USDT', precision: 2 },
  TON: { network: 'TON', symbol: 'TON', precision: 4 },
  LTC: { network: 'Litecoin', symbol: 'LTC', precision: 5 },
};

// Расчёт крипто-суммы по звёздам (фиксированный коэфф.).
export function cryptoAmountFor(currency, stars) {
  const rate = rates()[currency] || 0;
  if (!rate) return 0;
  return stars / rate;
}

// Округление до значимых цифр монеты (целая часть для валютных единиц).
export function roundCrypto(currency, value) {
  const p = COIN_META[currency]?.precision ?? 2;
  return Number(value.toFixed(p));
}

// Микродобавка range для идентификации по точной сумме (не для TON — там Memo).
const MICRO_RANGE = {
  USDT_TRC20: [0.0001, 0.0200], // +0.0001 .. 0.0199 (USDT 6-значная сеть)
  LTC: [0.00001, 0.00200],      // +0.00001 .. 0.00199 (LTC 8-значная сеть)
};

// Итоговая точность хранения суммы (кол-во знаков после точки).
const STORE_PRECISION = { USDT_TRC20: 4, TON: 4, LTC: 5 };

// Генерация точной суммы с уникальной микро-частью для идентификации.
// TON: возвращает ровную (идентификация по Memo). USDT/LTC: +микро-копийки.
export function saturateAmount(currency, amountCrypto) {
  const range = MICRO_RANGE[currency];
  if (!range) {
    // TON или неизвестная — ровная, точность по мете.
    return Number(amountCrypto.toFixed(STORE_PRECISION[currency] ?? 4));
  }
  const [lo, hi] = range;
  const micro = lo + Math.random() * (hi - lo);
  const p = STORE_PRECISION[currency];
  return Number((amountCrypto + micro).toFixed(p));
}