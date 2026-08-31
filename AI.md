# AI.md — инструкции для ИИ (читать первым, ~1 мин)

## ПРАВИЛА РАБОТЫ
1. ГЛАВНОЕ — СКОРОСТЬ: минимальный план → сразу правки → быстрая проверка. Без длинных рассуждений и лишних инструментов.
2. Никогда не создавать: backup/old/temp/final копии, дубли файлов, новые тестовые страницы.
3. Перед удалением чего-либо — убедиться, что нет ссылок (поиск по всем файлам). Не уверен — не удаляй.
4. СОХРАНЯТЬ 100%: визуал (layout/цвета/шрифты/анимации/адаптив) и функционал/логику. Правка только того, что просят.
5. После правок: `node --check` изменённых .js → смоук-тест `node server.js` (все ключевые URL = 200).

## ЧТО ЭТО
Telegram-стиль казино-мини-апп «Casino Criptoporno»: кейсы, игры, апгрейдер, инвентарь NFT-подарков. Чистая статика — без сборки, без npm, без фреймворков. Деплой Vercel (vercel.json → папка проекта).

## ЗАПУСК
```
cd Casino-criptoporno && node server.js   →  http://localhost:8123
```

## ФАЙЛЫ (всё в этой папке)
| Файл | Роль |
|---|---|
| index.html | вся разметка + inline-модуль: строит карточки кейсов из casesData.js |
| style.css / modal.css | стили каталога/игр / стили модалок |
| script.js | ВСЯ логика (IIFE). Секции помечены `/* ============ НАЗВАНИЕ ============ */` |
| currency.js | курс и конвертеры → `window.CURRENCY` |
| giftMatcher.js | подбор NFT по цене → `window.findClosestGiftByPrice`, `window.GIFTS_DB` |
| casesData.js / giftsData.js | данные (автоген, НЕ править руками) |
| generate_cases.py | генерирует casesData.js (RTP 85%) → `python generate_cases.py` |
| image/ case-арты .webp, gift image/ NFT PNG, standard-gifts/ обычные подарки |
| server.js | статический dev-сервер :8123 |

## АРХИТЕКТУРА
- **Экраны** (`data-screen="home|upgrade|mines|upgrader|crash|free|profile|case-detail"`): переключение `showScreen(name)` в script.js (тогглит `.hidden`). Нижняя навигация — `.nav-item[data-screen]`.
- **Модалки** (депозит 2 шага, sell, withdraw): `.modal-overlay[hidden]`, классы в modal.css.
- **Валюта**: базовая — TON. 1 TON = 80 Stars (XTR), курс только в currency.js. Цены giftsData.js — в TON.
- **Баланс**: `localStorage['casino_balance_ton']` (число TON, старт 100). Форматирование только при выводе.
- **Инвентарь**: экран `data-screen="free"` (нав-кнопка «Инвентарь»). Бывший раздел «Фри-награда» удалён по ТЗ, контент очищен.
- **Кейсы**: 12 шт (tier: basic/medium/elite → классы tier-1/2/3). Каталог строит inline-скрипт в конце index.html: грузит casesData.js, выставляет `window.CASES`/`window.CASES_DEFS`, рендерит карточки. Детали кейса — экран case-detail (script.js, секция CASE DETAIL SCREEN).
- **Инвентарь/профиль**: рендер из script.js (секции WITHDRAW MODAL, SELL MODAL, HISTORY FILTERS).

## КРИТИЧНЫЕ ИНВАРИАНТЫ (не ломать)
1. Не парсить оформленный баланс из DOM — только rawBalanceTon + saveBalance().
2. `c.scale` каждого кейса связан с CASE_IMAGE_SCALE в generate_cases.py и BASE_IMG_SCALE=1.65 (index.html) — менять синхронно.
3. Путь `gift image/` содержит ПРОБЕЛ — при fetch/encodeURI обязателен encodeURI.
4. Данные кейсов правятся ТОЛЬКО через generate_cases.py, не руками.
5. script.js — классический скрипт, зависит от window-глобалов: `CURRENCY`, `CASES`/`CASES_DEFS`, `GIFTS_DB`. Порядок подключения скриптов в конце index.html менять нельзя.

## КАК ДОБАВЛЯТЬ КОД (быстрый чек-лист)
1. Разметка → в index.html в нужный `[data-screen]` (или новая секция `<!-- SCREEN: X -->` + showScreen).
2. Логика → новая секция `/* ============ X ============ */` в script.js по образцу соседних (const els → listeners → render fn).
3. Стили → style.css (каталог/игры) или modal.css (модалки), БЭМ-подобные классы блока.
4. Данные → только генератор / giftsData.js регенерируется скриптом `gift image/_gen_png.ps1`.
5. Проверка: node --check → server.js → клик-смоук в браузере.
