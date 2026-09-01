# AI.md — инструкции для ИИ

> Эталон инструкций: **`README.md`** (ARCHITECTURE / CRYPTO DEPOSITS / SECURITY / RULES). Читать первым.

## ПРАВИЛА РАБОТЫ
1. **МИНИМУМ ТОКЕНОВ** — коротко, без вступлений/заключений. Код + конкретика.
2. **ВЫСОКАЯ СКОРОСТЬ** — правь точечно, не переписывай файл целиком (одна функция = одна правка).
3. **МЕТКИ** — перед блоком кода `// DB_QUERY`, `// AUTH_CHECK` и т.п.
4. **БЕЗ ДУБЛЕЙ** — не создавать backup/old/temp/final копий, дублей, тестовых страниц.
5. **НЕ УДАЛЯТЬ** без проверки ссылок (findstr по всем файлам). Не уверен — не удаляй.
6. **СОХРАНИТЬ** визуал и логику; порядок `<script>` в index.html менять нельзя.
7. **ПРОВЕРКА** — `node --check` изменённых файлов → смоук `node server.cjs`.

## СТЕК (актуальный)
- Backend: **`server.cjs`** (http + PostgreSQL/Neon) на `:8080` + Vercel Serverless `api/`.
- Admin: `server/grantEngine.cjs` + `server/grant.cjs` (CLI) + `POST /api/admin/grant` (заголовок `X-Admin-Secret`).
- Auth: `server/auth.cjs` (Telegram initData HMAC-SHA256).
- БД: Neon PostgreSQL (`users/inventory/best_drops/transactions`, `tg_id` = BIGINT).

## ВАЛЮТА И ИНВАРИАНТЫ
- 1 TON = 80 Stars (XTR), курс только в `currency.js`. Баланс — `balance_stars` (число) в БД.
- `c.scale` ↔ CASE_IMAGE_SCALE (generate_cases.py) + BASE_IMG_SCALE (index.html) менять синхронно.
- Путь `gift image/` с пробелом — обязателен `encodeURI`.
- Данные кейсов правятся ТОЛЬКО через `generate_cases.py`, не руками.
- `script.js` зависит от глобалов `CURRENCY`, `CASES`/`CASES_DEFS`, `GIFTS_DB` — порядок подключения не менять.
