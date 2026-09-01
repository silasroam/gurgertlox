# Casino Criptoporno — Telegram Mini App

Крипто-казино: кейсы, инвентарь NFT-подарков, крипто-депозиты, Telegram Stars.
Backend: Node (http + PostgreSQL/Neon) + Vercel Serverless (`api/`). Frontend — чистая статика (без сборки).

---

## 🚀 ARCHITECTURE & FILE MAP

```
├── server.cjs                  Точка входа API + все роуты (http+pg)
├── index.html                  Разметка + inline-скрипт каталога кейсов
├── style.css / modal.css       Стили каталога / модалок
├── script.js                   Вся UI-логика (IIFE), глобалы CURRENCY/CASES/GIFTS_DB
├── currency.js                 Курс TON→Stars → window.CURRENCY
├── giftMatcher.js              Подбор NFT по цене (ES-модуль)
├── casesConfig.json            Конфиг кейсов (цены, предметы, веса) — сервер
├── casesData.js / giftsData.js Автоген-данные → window.CASES / GIFTS_DB
├── shopData.js / giftsPrices.js / renderGifts.js   Данные/хелперы магазина
├── package.json / vercel.json  Зависимости / деплой Vercel
│
├── server/                     Локальный бэкенд (классы/модули Node)
│   ├── grantEngine.cjs         Ядро выдачи звёзд (admin logic, atomic)
│   ├── grant.cjs               CLI-обёртка для админки (--tg_id | --all)
│   ├── auth.cjs                Telegram initData HMAC валидация
│   ├── users.cjs               Регистрация + custom_id (INSERT ON CONFLICT)
│   ├── caseEngine.cjs          Открытие кейсов, атомарный дебет, инвентарь
│   └── memoryEngine.cjs        Каталог предметов из casesConfig.json
│
├── api/                        Vercel Serverless-функции (ES modules)
│   ├── _lib/auth.mjs / db.mjs / engine.mjs / http.mjs / users.mjs
│   ├── _lib/crypto.mjs         Реквизиты + курсы крипто-депозитов
│   ├── _lib/cryptoWorker.mjs   Ядро авто-проверки транзакций по Memo
│   ├── user/me.js              Профиль + инвентарь
│   ├── open-case.js / sell.js / withdraw.js   Игровые операции
│   ├── create-invoice.js       Инвойс Telegram Stars (депозит)
│   ├── payment/create-crypto-deposit.js  Создание крипто-депозита
│   ├── cron/crypto-deposits.js Vercel Cron: авто-зачисление по Memo
│   └── webhook.js              Приём платежей/вебхуков
│
├── worker/                     Локальный авто-воркер (Node, cron)
│   └── crypto-deposit-worker.cjs  Опрос каждые 15с + автоначисление
│
├── db/                         Схема + утилиты
│   ├── schema.sql              Таблицы users/inventory/best_drops/transactions/crypto_deposits
│   ├── init.cjs                npm run db:init
│   └── delete-user.cjs         Удаление пользователя
├── generate_cases.py           Генератор casesData.js (RTP 85%)
├── tests/                      Автотесты (auth/engine/handlers/neon)
└── image/, gift image/, standard-gifts/   PNG/WebP активы
```

---

## 💳 CRYPTO DEPOSITS (Requisites & Logic)

**Стек:** Direct Exodus Wallet (без KYC / без эквайринга). Изменение статуса — авто-воркер (Cron / Polling).

**Реквизиты (USDT/TRC-20, TON, LTC) — переопределяются env `WALLET_*`:**
| Актив | Адрес | Сеть |
|---|---|---|
| USDT (TRC-20) | `TWq6JByvRy4S1KrJze7krqpfhUb7pbK7oR` | TRON / TRC-20 |
| TON | `UQDbde4KnNiqjiWkx4IhsB5ChhVlKWtY6DSAyZzZ-G0mM6k7` | TON |
| LTC | `LaoDjKGe3NMdTLFQEt1ifVyHXcFXZ2wSF9` | Litecoin |

**Поток:**
1. `POST /api/payment/create-crypto-deposit` (auth по initData) — принимает `{currency, stars_amount}`.
   Генерирует Memo `DEP_{tg_id}_{rand4}`, считает `amount_crypto = stars / rate`, пишет в `crypto_deposits` (status=`pending`), возвращает `{wallet_address, amount_crypto, memo, network}`.
2. **Воркер** (Vercel Cron `/api/cron/crypto-deposits` каждые 15с, либо локально `worker/crypto-deposit-worker.cjs`): опрашивает входящие транзакции адресов через бесплатные API (Toncenter / Tronscan / Blockcypher), ищет Memo в комментариях, при совпадении атомарно начисляет `balance_stars` + `status='completed'`.
3. **Курсы** (`CRYPTO_RATES`, звёзд за 1 ед.): USDT=100, TON=450, LTC=8000. Порог подтверждений/суммы — `CRYPTO_MIN_CONFIRMS`, `CRYPTO_AMOUNT_TOLERANCE`.

**База данных:** Neon PostgreSQL. Таблица `crypto_deposits(id, tg_id BIGINT, currency, amount_crypto NUMERIC, stars_to_add, memo UNIQUE, status, created_at, completed_at)`. Зачисления логируются в `transactions` (type=`deposit`).

---

## 🛡️ SECURITY & ADMIN

- **Admin API**: `POST /api/admin/grant` защищён `ADMIN_SECRET` из `.env` через заголовок `X-Admin-Secret`.
- **Сравнение секрета**: только constant-time `safeEqual` (crypto.timingSafeEqual) — против timing-атак.
- **Пользователь**: Telegram `initData` HMAC-SHA256 валидация (`server/auth.cjs`, `api/_lib/auth.mjs`); `REQUIRE_TG_AUTH=true`.
- **Экономика**: атомарные операции в транзакциях с `FOR UPDATE` (кейсы, продажа, выдача); `CHECK balance_stars >= 0`.
- **Аудит**: каждая выдача/операция — запись в `transactions`. `ADMIN_SECRET` не попадает на клиент.

**Выдача звёзд (admin):**
```bash
# одному по Telegram ID:
node server/grant.cjs --amount 500 --tg_id 7969090536 --reason "bonus"
# всем пользователям:
node server/grant.cjs --amount 100 --all --reason "mass drop"
```
> Ключ берётся автоматически из `.env` (`ADMIN_SECRET`). HTTP-аналог: `curl -X POST /api/admin/grant -H "X-Admin-Secret: ..."`.

---

## ⚡ RULES FOR AI AGENTS

1. **МИНИМУМ ТОКЕНОВ**: короткие ответы, без вступлений/заключений. Только код и конкретика.
2. **ВЫСОКАЯ СКОРОСТЬ**: не переписывай файл целиком под одну функцию — правь точечно (editor, узкие old_text).
3. **ЧЁТКАЯ СТРУКТУРА**: перед каждым блоком кода — метка назначения (`// DB_QUERY`, `// AUTH_CHECK`).
4. **НЕ УДАЛЯТЬ** файлы без проверки ссылок (`findstr` по всем). Не уверен — не удаляй.
5. **СОХРАНЯТЬ** визуал/логику фронта; порядок `<script>` в `index.html` менять нельзя.
6. **ПРОВЕРКА**: `node --check` изменённых файлов → смоук `node server.cjs` (API = 200).

---

## ЗАПУСК

```bash
npm install
npm run db:init                    # применить schema.sql к Neon (в т.ч. crypto_deposits)
npm start                          # → http://localhost:8080  (REQUIRE_TG_AUTH=false в dev)
npm run grant -- --amount 500 --tg_id <id>   # административная выдача звёзд
npm run crypto:worker              # локальный воркер авто-проверки крипто-депозитов
```
Для Vercel: продублировать `.env`-ключи (`POSTGRES_URL`, `TELEGRAM_BOT_TOKEN`, `ADMIN_SECRET`, `CRON_SECRET`, `CRYPTO_RATES`, `WALLET_*`, `SEED_BALANCE_STARS`, `REQUIRE_TG_AUTH`) в Dashboard → Settings → Env Vars. Cron `/api/cron/crypto-deposits` настроен в `vercel.json`.