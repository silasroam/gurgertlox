/* ============================================
    Casino Criptoporno — Telegram Mini App
    Fullscreen WebApp bootstrap + Case Roulette
    ============================================ */
// Added by Roo assistant

(function () {
    'use strict';

    /* ---------- Точки зацепа: всегда открывать страницу сверху ---------- */
    // Запрещаем браузеру восстанавливать позицию скролла при обновлении/навигации
    // (history.scrollRestoration управляет авто-восстановлением скролла браузером).
    try {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
    } catch (e) {}

    // Мгновенный сброс в самый верх на странице при каждой загрузке/переходе
    function scrollToTop() {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0; // Safari
    }

    // Гарантированный сброс при загрузке и После повторного входа (b.f-cache),
    // даже если браузер пытается вернуть прежний скролл.
    window.addEventListener('pageshow', scrollToTop);
    // Резерв: некоторые браузеры восстанавливают скролл после «load» — дожидаемся и сбрасываем ещё раз.
    if (document.readyState === 'complete') {
        scrollToTop();
    } else {
        window.addEventListener('load', scrollToTop);
    }

    /* ---------- Telegram WebApp ---------- */
    const tg = window.Telegram?.WebApp;

    if (tg) {
        tg.expand();
        tg.disableVerticalSwipes();
        tg.setHeaderColor('#050608');
        tg.setBackgroundColor('#050608');
        tg.ready();
        document.documentElement.style.colorScheme = 'dark';
    }

    /* ---------- Bottom nav interaction + screen switching ---------- */
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.screen');

    function showScreen(name) {
        screens.forEach((s) => {
            s.classList.toggle('hidden', s.dataset.screen !== name);
        });
        // Точка зацепа: при каждом переходе между экранами (вход в кейс,
        // возврат «Назад»/«Закрыть», нижняя навигация) — показываем самый верх.
        scrollToTop();

        // Инвентарь: перерисовываем экран (пустой рюкзак или сетка предметов).
        if (name === 'free') {
            renderInventory();
        }
        // Профиль: всегда перерисовываем реальные данные (юзер и ТОП-6 дропов).
        if (name === 'profile') {
            applyProfileUserData();
            updateBestDrops();
        }
    }

    /* ---------- Header Avatar (Telegram profile) ---------- */
    const headerAvatar = document.getElementById('headerAvatar');
    const avatarImg = document.querySelector('.user-avatar img') || document.getElementById('headerAvatarImg');

    function setupHeaderAvatar() {
        const user = tg?.initDataUnsafe?.user;
        if (!avatarImg) return;

        // Честная логика заглушки: первая буква имени (first_name → username → 'X')
        const firstLetter = (user?.first_name
            ? user.first_name[0]
            : (user?.username ? user.username[0] : 'X')
        ).toUpperCase();

        // Локальная заглушка — всегда доступна для каждого пользователя
        const stubUrl = 'image/avatar.png';

        // Если есть реальная аватарка из ТГ — используем её
        if (user && user.photo_url) {
            avatarImg.src = user.photo_url;
        } else {
            // Иначе сразу ставим заглушку
            avatarImg.src = stubUrl;
        }

        // Резервный вариант: если аватарка ТГ не загрузилась (CORS, 403, битая ссылка) — подменяем на заглушку
        avatarImg.onerror = function () {
            this.onerror = null; // защита от зацикливания
            this.src = stubUrl;
        };

        // Обновляем аватарку в секции профиля
        applyProfileUserData();
    }

    /* ---------- Profile: real Telegram user data (no hardcode) ---------- */
    // Custom ID из БД (создаётся при регистрации на первом запросе к API).
    // Объявлен ДО первого вызова applyProfileUserData (см. TDZ для let).
    let serverCustomId = null;
    function applyProfileUserData() {
        const user = tg?.initDataUnsafe?.user;
        const avatarEl = document.getElementById('profileAvatar');
        const nameEl = document.getElementById('profileUsername');
        const idEl = document.getElementById('profileIdValue');

        // Никнейм / имя: username → first_name → 'Пользователь'
        if (nameEl) {
            nameEl.textContent = user?.username
                ? '@' + user.username
                : (user?.first_name || 'Пользователь');
        }

        // ID: приоритет — Custom ID из БД (его видит пользователь),
        // fallback — Telegram ID, затем '—' (пока сервер не ответил).
        if (idEl) {
            idEl.textContent = serverCustomId
                || (user?.id != null ? String(user.id) : '—');
        }

        // Аватарка: если есть photo_url — круг с фото, иначе круглая заглушка с буквой
        if (avatarEl) {
            const letter = (
                user?.first_name
                    ? user.first_name[0]
                    : (user?.username ? user.username[0] : 'X')
            ).toUpperCase();

            if (user && user.photo_url) {
                avatarEl.innerHTML = `<img src="${user.photo_url}" alt="${letter}" onerror="this.onerror=null;this.parentNode.innerHTML='${letter}';this.parentNode.classList.remove('has-photo');">`;
                avatarEl.classList.add('has-photo');
                avatarEl.classList.remove('has-letter');
            } else {
                avatarEl.textContent = letter;
                avatarEl.classList.add('has-letter');
                avatarEl.classList.remove('has-photo');
            }
        }
    }

    if (headerAvatar) {
        headerAvatar.addEventListener('click', () => {
            // Переход на экран профиля
            navItems.forEach((i) => i.classList.remove('active'));
            const profileNav = [...navItems].find((i) => i.querySelector('span').textContent === 'Профиль');
            if (profileNav) profileNav.classList.add('active');
            showScreen('profile');
        });
    }

    setupHeaderAvatar();

    // Первичная отрисовка + ЗАГРУЗКА РЕАЛЬНЫХ ДАННЫХ ИЗ БД (/api/user/me).
    try { applyProfileUserData(); renderInventory(); updateBestDrops(); } catch (e) {}
    syncFromServer();

    // Когда модуль подарков (giftMatcher.js) догрузится асинхронно — перерисовываем.
    window.addEventListener('gifts-db-ready', () => {
        try { renderInventory(); updateBestDrops(); } catch (e) {}
    });

    /* ---------- Profile ID: fill from TG + copy to clipboard ---------- */
    const profileIdValueEl = document.getElementById('profileIdValue');
    const profileIdCopyBtn = document.getElementById('profileIdCopy');

    if (profileIdValueEl) {
        // Сразу при старте: Custom ID из БД, если уже загружен, иначе Telegram ID.
        if (serverCustomId) {
            profileIdValueEl.textContent = serverCustomId;
        } else {
            const tgUserId = tg?.initDataUnsafe?.user?.id;
            if (tgUserId) profileIdValueEl.textContent = String(tgUserId);
        }
    }

    if (profileIdCopyBtn) {
        profileIdCopyBtn.addEventListener('click', () => {
            const txt = profileIdValueEl ? profileIdValueEl.textContent.trim() : '';
            if (!txt) return;
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(txt);
            } else {
                const ta = document.createElement('textarea');
                ta.value = txt;
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); } catch (e) {}
                document.body.removeChild(ta);
            }
        });
    }

    /* ============ CURRENCY SYSTEM (TON ⇄ Stars, 1 TON = 80 XTR) ============ */
    // БАЗОВАЯ валюта проекта — TON: цены в giftsData.js (напр. 61.90) — это TON.
    // Stars (XTR) = ton * 80. Конвертеры и курс живут в currency.js (window.CURRENCY).
    const CURR = window.CURRENCY || {
        TON_TO_STARS_RATE: 80,
        tonToStars: (t) => (Number(t) || 0) * 80,
        starsToTon: (s) => (Number(s) || 0) / 80,
        formatNumber: (v, d) => (Number(v) || 0).toLocaleString('ru-RU', { minimumFractionDigits: (d === undefined ? 2 : d), maximumFractionDigits: (d === undefined ? 2 : d) }),
        toDisplay: (v) => (Number(v) || 0),
        formatDisplay: (v, d) => CURR_STR((Number(v) || 0)),
        state: { display: 'ton', base: 'ton' },
        setDisplay: function () {},
        onDisplayChange: function () {},
        isTonDisplay: () => true
    };
    function CURR_STR(v) { return (Number(v) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TON'; }

    // ── Баланс пользователя ─────────────────────────────────────────────
    // Production: единственный источник правды — БД на сервере.
    // Баланс приходит из /api/user/me (balance_stars) и обновляется после
    // каждой серверной операции (open-case/sell). localStorage НЕ используется.
    let serverBalanceStars = null; // null → ещё не загружен с сервера
    let rawBalanceTon = 0;

    function loadBalance() {
        // Баланс отражает серверное состояние (0 Stars у нового пользователя).
        rawBalanceTon = (serverBalanceStars == null) ? 0 : CURR.starsToTon(serverBalanceStars);
    }

    function saveBalance() {
        // Запись баланса на клиенте запрещена: меняет его ТОЛЬКО сервер.
    }

    // Читает баланс из состояния (метод оставлен для обратной совместимости вызовов).
    function readRawBalance() {
        loadBalance();
    }

    /* ============================================================
       API LAYER — всё общение с боевым бэкендом (PostgreSQL).
       Балансы, цены и результаты дропов фронтенд НЕ вычисляет:
       только отправляет намерения, всё решает сервер.
       ============================================================ */
    // ---------- Telegram auth: ждём SDK и initData (ретрай до 3с) ----------
    // SDK telegram-web-app.js грузится асинхронно: если дёрнуть API раньше,
    // initData будет пустой и сервер ответит 401. Гарантируем готовность.
    let tgReadyPromise = null;
    function ensureTelegramReady() {
        if (tgReadyPromise) return tgReadyPromise;
        tgReadyPromise = new Promise((resolve) => {
            const started = Date.now();
            (function poll() {
                const td = window.Telegram && window.Telegram.WebApp;
                if (td && typeof td.initData === 'string' && td.initData.length > 0) return resolve(true);
                if (Date.now() - started > 3000) return resolve(false); // dev-браузер без ТГ
                setTimeout(poll, 100);
            })();
        });
        return tgReadyPromise;
    }

    function tgAuthHeader() {
        // Telegram WebApp сам валидируется на сервере через initData HMAC.
        // ВАЖНО: initData шлём КАК ЕСТЬ (RAW, уже url-encoded Telegram) —
        // сервер считает HMAC над сырыми парами, любое перекодирование ломает подпись.
        const initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || '';
        return { 'x-init-data': initData, 'Content-Type': 'application/json' };
    }

    async function apiFetch(path, options) {
        // Абсолютно КАЖДЫЙ запрос к /api/* несёт x-init-data:
        // сливаем заголовки вызывающего кода с auth-заголовком (auth не перебить).
        const opts = Object.assign({}, options || {}, {
            headers: Object.assign(tgAuthHeader(), (options && options.headers) || {}),
        });
        let resp = await fetch(path, opts);
        // Один автоповтор при 401: initData мог догрузиться после первого запроса.
        if (resp.status === 401) {
            const ready = await ensureTelegramReady();
            if (ready) {
                opts.headers = Object.assign(tgAuthHeader(), (options && options.headers) || {});
                resp = await fetch(path, opts);
            }
        }
        let data = {};
        try { data = await resp.json(); } catch (e) {}
        if (!resp.ok) {
            const err = new Error(data.error || ('HTTP ' + resp.status));
            err.status = resp.status;
            throw err;
        }
        return data;
    }

    // Серверное состояние (зеркало БД, только для отрисовки).
    let serverInventory = [];   // user_inventory: текущие + pending_withdraw
    let serverBestDrops = [];   // best_drops: ТОП-6 за всю историю

    // GET /api/user/me — баланс, инвентарь и лучшие дропы из БД.
    async function syncFromServer() {
        // Ждём Telegram SDK/initData: первый запрос должен уйти авторизованным
        // сразу после СТАРТ в боте (без 401 и повторных заходов).
        await ensureTelegramReady();
        try {
            const data = await apiFetch('/api/user/me');
            serverBalanceStars = Number(data.user && data.user.balance_stars) || 0;
            serverInventory = Array.isArray(data.inventory) ? data.inventory : [];
            serverBestDrops = Array.isArray(data.bestDrops) ? data.bestDrops : [];
            // Custom ID приходит из БД этим же запросом (регистрация при входе):
            // показываем пользователю сразу, как только он нажал СТАРТ в боте.
            if (data.user && data.user.custom_id != null && data.user.custom_id !== '') {
                const next = String(data.user.custom_id);
                if (next !== serverCustomId) {
                    serverCustomId = next;
                    try { applyProfileUserData(); } catch (e) {}
                }
            }
        } catch (e) {
            // Нет связи/не авторизован — остаёмся с пустым состоянием (0 ⭐).
            serverBalanceStars = serverBalanceStars == null ? 0 : serverBalanceStars;
        }
        rawBalanceTon = CURR.starsToTon(serverBalanceStars || 0);
        renderBalance();
        try { renderInventory(); } catch (e) {}
        try { updateBestDrops(); } catch (e) {}
    }

    // POST /api/open-case — сервер сам проверяет баланс, списывает Stars и
    // генерирует дроп по весам. Фронт получает ГОТОВЫЙ предмет для анимации.
    function apiOpenCase(caseId, mult) {
        return apiFetch('/api/open-case', { method: 'POST', body: JSON.stringify({ caseId: String(caseId || ''), mult: Number(mult) || 1 }) });
    }

    // POST /api/sell — сервер пересчитывает сумму из БД и зачисляет Stars.
    function apiSell(ids) {
        return apiFetch('/api/sell', { method: 'POST', body: JSON.stringify({ ids: ids.map(Number) }) });
    }

    // POST /api/withdraw — пометка предмета pending_withdraw на сервере.
    function apiWithdraw(inventoryId, username, comment) {
        return apiFetch('/api/withdraw', { method: 'POST', body: JSON.stringify({ inventoryId: Number(inventoryId), username, comment }) });
    }

    // Отрисовка баланса (в шапке и профиле). Баланс всегда в Telegram Stars.
    function renderBalance() {
        const header = document.getElementById('headerBalanceAmount');
        const profile = document.getElementById('profileBalanceAmount');
        const emoji = document.getElementById('balanceEmoji');

        // Показываем баланс СТРОГО в Stars: сервер хранит balance_stars.
        const stars = Math.round(serverBalanceStars != null ? serverBalanceStars : CURR.tonToStars(rawBalanceTon));
        const displayVal = stars.toLocaleString('ru-RU', { maximumFractionDigits: 0 });

        if (header) header.textContent = displayVal;
        if (profile) profile.textContent = displayVal;
        if (emoji) emoji.innerHTML = '⭐';
        document.querySelectorAll('.balance-amount').forEach((el) => {
            el.classList.remove('ton-mode');
        });
        if (profile) {
            profile.style.color = '#FFD54F';
        }
        saveBalance();
    }

    // ГЛАВНАЯ цена на карточке — в активной валюте отображения.
    // По умолчанию (display='ton') показывает главной ценой TON: 61.90 TON.
    function priceHTML(rawTon) {
        const sym = CURR.isTonDisplay() ? 'TON' : '⭐';
        const val = CURR.toDisplay(rawTon); // raw — в TON, конвертим в display
        const d = 2;
        return `<span class="cur-price">${val.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })} ${sym}</span>`;
    }

    // Цена предмета в Telegram Stars (XTR) — для предметов из casesConfig (цена в Stars).
    function priceStarsHTML(value) {
        const stars = (Number(value) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
        return `<span class="cur-price cur-price-stars">${stars} ⭐</span>`;
    }

    // ВТОРИЧНАЯ подпись в другой валюте.
    // В режиме TON: главная=TON, подпись=Stars (≈ ton*80 ⭐).
    // В режиме Stars: главная=Stars, подпись=TON.
    function dualPriceHTML(rawTon) {
        if (CURR.isTonDisplay()) {
            const stars = CURR.tonToStars(rawTon);
            return `<span class="cur-price cur-price-sub">≈ ${stars.toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ⭐</span>`;
        }
        const ton = Number(rawTon) || 0;
        return `<span class="cur-price cur-price-sub">≈ ${ton.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TON</span>`;
    }

    if (typeof CURR.onDisplayChange === 'function') {
        CURR.onDisplayChange(() => {
            readRawBalance();
            renderBalance();
            // Перерисуем цены там, где они уже на экране.
            try { if (typeof buildCaseDetailItems === 'function') buildCaseDetailItems(); } catch (e) {}
            try { if (typeof buildRouletteStrip === 'function') buildRouletteStrip(); } catch (e) {}
            try { if (typeof updateCaseDetailPrice === 'function') updateCaseDetailPrice(); } catch (e) {}
        });
    }

    readRawBalance();
    renderBalance();

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            navItems.forEach((i) => i.classList.remove('active'));
            item.classList.add('active');

            const screen = item.dataset.screen;
            if (screen) {
                showScreen(screen);
            } else {
                const label = item.querySelector('span').textContent;
                if (label === 'Главная') showScreen('home');
                else if (label === 'Инвентарь') showScreen('free');
                else if (label === 'Профиль') showScreen('profile');
            }
        });
    });

    /* ============ MINES GAME ============ */
    const minesBack = document.getElementById('minesBack');
    const minesGrid = document.getElementById('minesGrid');
    const minesMultiplier = document.getElementById('minesMultiplier');
    const minesCount = document.getElementById('minesCount');
    const minesBet = document.getElementById('minesBet');
    const minesMinus = document.getElementById('minesMinus');
    const minesPlus = document.getElementById('minesPlus');
    const minesSelectValue = document.getElementById('minesSelectValue');
    const minesCashout = document.getElementById('minesCashout');

    const GRID_SIZE = 5;
    let minesTotal = 3;
    let minesGameActive = false;
    let minesRevealed = 0;
    let minesPositions = [];

    function buildMinesGrid() {
        minesGrid.innerHTML = '';
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.className = 'mines-cell';
            cell.dataset.index = i;
            cell.addEventListener('click', () => revealMineCell(cell));
            minesGrid.appendChild(cell);
        }
    }

    function startMinesGame() {
        minesGameActive = true;
        minesRevealed = 0;
        minesMultiplier.textContent = '1.00x';
        minesCashout.disabled = true;
        minesBet.disabled = true;
        minesMinus.disabled = true;
        minesPlus.disabled = true;

        // Случайные позиции мин
        minesPositions = [];
        const total = GRID_SIZE * GRID_SIZE;
        while (minesPositions.length < minesTotal) {
            const idx = Math.floor(Math.random() * total);
            if (!minesPositions.includes(idx)) {
                minesPositions.push(idx);
            }
        }

        // Сброс ячеек
        document.querySelectorAll('.mines-cell').forEach((cell) => {
            cell.classList.remove('revealed', 'mine-hit', 'disabled');
            cell.textContent = '';
        });
    }

    function revealMineCell(cell) {
        if (!minesGameActive) {
            startMinesGame();
            return;
        }
        if (cell.classList.contains('revealed') || cell.classList.contains('mine-hit')) return;

        const idx = parseInt(cell.dataset.index, 10);

        // Попали на мину
        if (minesPositions.includes(idx)) {
            cell.classList.add('mine-hit');
            cell.textContent = '💣';
            minesGameActive = false;
            minesCashout.disabled = true;
            minesBet.disabled = false;
            minesMinus.disabled = false;
            minesPlus.disabled = false;
            return;
        }

        // Безопасная ячейка
        cell.classList.add('revealed');
        cell.textContent = '💎';
        minesRevealed++;

        // Обновляем множитель
        const safeCells = GRID_SIZE * GRID_SIZE - minesTotal;
        const mult = Math.pow(safeCells / (safeCells - minesRevealed + 1), minesRevealed);
        minesMultiplier.textContent = mult.toFixed(2) + 'x';

        minesCashout.disabled = false;
    }

    function cashOutMines() {
        if (!minesGameActive) return;
        minesGameActive = false;
        minesCashout.disabled = true;
        minesBet.disabled = false;
        minesMinus.disabled = false;
        minesPlus.disabled = false;
    }

    minesBack.addEventListener('click', () => {
        showScreen('upgrade');
    });

    minesCashout.addEventListener('click', cashOutMines);

    minesMinus.addEventListener('click', () => {
        if (minesTotal > 1) {
            minesTotal--;
            minesSelectValue.textContent = minesTotal;
            minesCount.textContent = minesTotal;
        }
    });

    minesPlus.addEventListener('click', () => {
        if (minesTotal < 24) {
            minesTotal++;
            minesSelectValue.textContent = minesTotal;
            minesCount.textContent = minesTotal;
        }
    });

    buildMinesGrid();

    /* ============ X50 GAME ============ */
    const x50Back = document.getElementById('x50Back');
    const x50Sectors = document.getElementById('x50Sectors');
    const x50Multiplier = document.getElementById('x50Multiplier');
    const x50Bet = document.getElementById('x50Bet');
    const x50Spin = document.getElementById('x50Spin');
    const x50BetChips = document.querySelectorAll('.x50-bet-chip');

    // 12 секторов колеса
    const X50_VALUES = [2, 5, 10, 25, 50, 5, 10, 25, 2, 50, 10, 5];
    let x50SelectedMult = 2;
    let x50Spinning = false;

    function buildX50Wheel() {
        x50Sectors.innerHTML = '';
        const total = X50_VALUES.length;
        X50_VALUES.forEach((val, i) => {
            const sector = document.createElement('div');
            sector.className = 'x50-sector';
            const angle = (360 / total) * i;
            sector.style.transform = `rotate(${angle}deg)`;
            sector.textContent = 'x' + val;
            sector.dataset.mult = val;
            sector.style.display = 'flex';
            x50Sectors.appendChild(sector);
        });
    }

    x50Back.addEventListener('click', () => {
        showScreen('upgrade');
    });

    // Выбор коэффициента через чипы
    x50BetChips.forEach((chip) => {
        chip.addEventListener('click', () => {
            x50BetChips.forEach((c) => c.classList.remove('active'));
            chip.classList.add('active');
            x50SelectedMult = parseInt(chip.dataset.mult, 10);
            x50Multiplier.textContent = 'МНОЖИТЕЛЬ x' + x50SelectedMult;
        });
    });

    // Крутить колесо
    x50Spin.addEventListener('click', () => {
        if (x50Spinning) return;

        const bet = parseFloat(x50Bet.value) || 10;
        if (bet < 1) return;

        x50Spinning = true;
        x50Spin.disabled = true;

        // Случайный выигрыш
        const winMult = X50_VALUES[Math.floor(Math.random() * X50_VALUES.length)];

        // Подсветка сектора
        const sectors = document.querySelectorAll('.x50-sector');
        sectors.forEach((s) => s.classList.remove('selected'));
        const target = [...sectors].find((s) => parseInt(s.dataset.mult, 10) === winMult);
        if (target) {
            target.classList.add('selected');
        }

        const result = winMult >= x50SelectedMult ? 'ПОБЕДА: x' + winMult : 'ПРОИГРЫШ: x' + winMult;
        x50Multiplier.textContent = result;

        setTimeout(() => {
            x50Spinning = false;
            x50Spin.disabled = false;
        }, 1200);
    });

    buildX50Wheel();

    /* ============ UPGRADER GAME ============ */
    const upgraderBack = document.getElementById('upgraderBack');
    const upgraderCurrentVisual = document.getElementById('upgraderCurrentVisual');
    const upgraderCurrentName = document.getElementById('upgraderCurrentName');
    const upgraderCurrentValue = document.getElementById('upgraderCurrentValue');
    const upgraderTargetVisual = document.getElementById('upgraderTargetVisual');
    const upgraderTargetName = document.getElementById('upgraderTargetName');
    const upgraderTargetValue = document.getElementById('upgraderTargetValue');
    const upgraderPercent = document.getElementById('upgraderPercent');
    const upgraderRing = document.getElementById('upgraderRing');
    const upgraderLevel = document.getElementById('upgraderLevel');
    const upgraderBtn = document.getElementById('upgraderBtn');

    // Уровни апгрейда
    const UPGRADE_LEVELS = [
        { icon: '🐻', name: 'NFT Bear', value: 2500, iconTarget: '🐻‍❄️', nameTarget: 'NFT Bear Ice', valueTarget: 5000, chance: 75 },
        { icon: '🐻‍❄️', name: 'NFT Bear Ice', value: 5000, iconTarget: '🐼', nameTarget: 'NFT Panda', valueTarget: 10000, chance: 60 },
        { icon: '🐼', name: 'NFT Panda', value: 10000, iconTarget: '🦊', nameTarget: 'NFT Fox', valueTarget: 20000, chance: 45 },
        { icon: '🦊', name: 'NFT Fox', value: 20000, iconTarget: '🦁', nameTarget: 'NFT Lion', valueTarget: 40000, chance: 30 },
    ];

    let upgraderLevelIdx = 0;

    function updateUpgraderUI() {
        const lvl = UPGRADE_LEVELS[upgraderLevelIdx];
        upgraderCurrentVisual.textContent = lvl.icon;
        upgraderCurrentName.textContent = lvl.name;
        upgraderCurrentValue.textContent = lvl.value;
        upgraderTargetVisual.textContent = lvl.iconTarget;
        upgraderTargetName.textContent = lvl.nameTarget;
        upgraderTargetValue.textContent = lvl.valueTarget;
        upgraderPercent.textContent = lvl.chance + '%';
        upgraderLevel.textContent = 'УРОВЕНЬ ' + (upgraderLevelIdx + 1);
        upgraderRing.style.background = `conic-gradient(#1683FF 0% ${lvl.chance}%, rgba(234, 246, 255, 0.08) ${lvl.chance}% 100%)`;
    }

    upgraderBack.addEventListener('click', () => {
        showScreen('upgrade');
    });

    upgraderBtn.addEventListener('click', () => {
        const lvl = UPGRADE_LEVELS[upgraderLevelIdx];
        const roll = Math.random() * 100;

        if (roll <= lvl.chance) {
            // Успех
            if (upgraderLevelIdx < UPGRADE_LEVELS.length - 1) {
                upgraderLevelIdx++;
                updateUpgraderUI();
            } else {
                upgraderPercent.textContent = 'МАКС!';
            }
        } else {
            // Неудача — предмет остаётся
        }
    });

    updateUpgraderUI();

    /* ============ CRASH GAME ============ */
    const crashBack = document.getElementById('crashBack');
    const crashLine = document.getElementById('crashLine');
    const crashMultiplier = document.getElementById('crashMultiplier');
    const crashStatus = document.getElementById('crashStatus');
    const crashBet = document.getElementById('crashBet');
    const crashCashout = document.getElementById('crashCashout');
    const crashHistoryList = document.getElementById('crashHistory');

    let crashRunning = false;
    let crashMultiplierVal = 1.0;
    let crashInterval = null;
    let crashBetAmount = 0;

    function addCrashHistory(value) {
        const item = document.createElement('span');
        item.className = 'crash-history-item';
        item.textContent = value.toFixed(2) + 'x';
        crashHistoryList.prepend(item);
        // Ограничиваем до 8 записей
        while (crashHistoryList.children.length > 8) {
            crashHistoryList.removeChild(crashHistoryList.lastChild);
        }
    }

    function startCrash() {
        if (crashRunning) return;

        crashBetAmount = parseFloat(crashBet.value) || 10;
        if (crashBetAmount < 1) crashBetAmount = 1;

        crashRunning = true;
        crashMultiplierVal = 1.0;
        crashMultiplier.textContent = '1.00x';
        crashStatus.textContent = 'ИГРА ИДЁТ...';
        crashCashout.disabled = false;
        crashBet.disabled = true;

        // Сброс линии
        crashLine.style.height = '0px';
        crashLine.style.transform = 'rotate(0deg)';

        // Случайный краш-множитель (1.0 - 10.0)
        const crashPoint = 1 + Math.random() * 9;

        crashInterval = setInterval(() => {
            crashMultiplierVal += 0.01;
            crashMultiplier.textContent = crashMultiplierVal.toFixed(2) + 'x';

            // Рост линии
            const height = Math.min(100, (crashMultiplierVal - 1) * 20);
            const angle = Math.min(75, (crashMultiplierVal - 1) * 8);
            crashLine.style.height = height + '%';
            crashLine.style.transform = `rotate(${angle}deg)`;

            // Краш
            if (crashMultiplierVal >= crashPoint) {
                clearInterval(crashInterval);
                crashRunning = false;
                crashMultiplier.textContent = crashPoint.toFixed(2) + 'x';
                crashStatus.textContent = 'КРАШ!';
                crashCashout.disabled = true;
                crashBet.disabled = false;
                addCrashHistory(crashPoint);
            }
        }, 100);
    }

    function cashOut() {
        if (!crashRunning) return;

        clearInterval(crashInterval);
        crashRunning = false;
        crashStatus.textContent = 'ВЫВОД: ' + crashMultiplierVal.toFixed(2) + 'x';
        crashCashout.disabled = true;
        crashBet.disabled = false;
        addCrashHistory(crashMultiplierVal);
    }

    crashBack.addEventListener('click', () => {
        showScreen('upgrade');
    });

    crashCashout.addEventListener('click', cashOut);

    // Автозапуск при клике на экран (для демо)
    document.querySelector('.crash-screen').addEventListener('click', () => {
        if (!crashRunning) startCrash();
    });

    /* ============ ИНВЕНТАРЬ (бывш. FREE REWARD TIMER) ============ */
    // Раздел «Фри награда» удалён по ТЗ (кнопка freeClaimBtn/<free-card>), поэтому
    // таймер фри-кейса и логика кулдауна убраны. Экран data-screen="free"
    // теперь именуется «Инвентарь» и рендерится из script.js при необходимости.

    /* ============ CASE MODAL ============ */
    const modal = document.getElementById('caseModal');
    const modalClose = document.getElementById('modalClose');
    const modalTitle = document.getElementById('modalTitle');
    const modalVisual = document.getElementById('modalVisual');
    const modalPrice = document.getElementById('modalPrice');
    const modalOpenValue = document.getElementById('modalOpenValue');
    const rewardsList = document.getElementById('rewardsList');
    const modalOpenBtn = document.getElementById('modalOpen');
    const rouletteStrip = document.getElementById('rouletteStrip');
    const rouletteWindow = document.querySelector('.roulette-window');
    const winResult = document.getElementById('winResult');
    const particlesBox = document.getElementById('particles');

    const ITEM_W = 56; // px width of one roulette item
    const SPIN_DURATION = 5500; // ms — плавное вращение ~5.5 с с мягким замедлением
    const ROUGE_LOOPS = 8; // full passes before stopping

    let currentPrice = null;
    let currentRewards = [];
    let spinLock = false;

    /* --- Case dataset (цена, награды) --- */
    const CASES = {
        20: {
            name: 'OCEAN CASE',
            rewards: [
                { label: '₴ 0.5', chance: 45, icon: '¢' },
                { label: '₴ 1', chance: 30, icon: '¢' },
                { label: '₴ 3', chance: 15, icon: '₿' },
                { label: '₴ 8', chance: 8, icon: '◆' },
                { label: '₴ 15', chance: 2, icon: '✦' },
            ],
        },
        30: {
            name: 'СТАРТ',
            rewards: [
                { label: '₴ 0.5', chance: 42, icon: '¢' },
                { label: '₴ 2', chance: 30, icon: '¢' },
                { label: '₴ 5', chance: 16, icon: '₿' },
                { label: '₴ 12', chance: 9, icon: '◆' },
                { label: '₴ 25', chance: 3, icon: '✦' },
            ],
        },
        50: {
            name: 'НЕОН',
            rewards: [
                { label: '₴ 1', chance: 40, icon: '¢' },
                { label: '₴ 3', chance: 30, icon: '¢' },
                { label: '₴ 8', chance: 17, icon: '₿' },
                { label: '₴ 18', chance: 10, icon: '◆' },
                { label: '₴ 40', chance: 3, icon: '✦' },
            ],
        },
        100: {
            name: 'ТОКЕН',
            rewards: [
                { label: '₴ 2', chance: 38, icon: '¢' },
                { label: '₴ 5', chance: 30, icon: '¢' },
                { label: '₴ 15', chance: 18, icon: '₿' },
                { label: '₴ 40', chance: 10, icon: '◆' },
                { label: '₴ 90', chance: 4, icon: '✦' },
            ],
        },
        150: {
            name: 'КИБЕР',
            rewards: [
                { label: '₴ 3', chance: 36, icon: '¢' },
                { label: '₴ 8', chance: 30, icon: '¢' },
                { label: '₴ 25', chance: 18, icon: '₿' },
                { label: '₴ 60', chance: 12, icon: '◆' },
                { label: '₴ 130', chance: 4, icon: '✦' },
            ],
        },
        250: {
            name: 'КРИПТА',
            rewards: [
                { label: '₴ 5', chance: 34, icon: '¢' },
                { label: '₴ 15', chance: 30, icon: '₿' },
                { label: '₴ 40', chance: 20, icon: '◆' },
                { label: '₴ 100', chance: 12, icon: '✦' },
                { label: '₴ 220', chance: 4, icon: '★' },
            ],
        },
        400: {
            name: 'ЛЕГЕНДА',
            rewards: [
                { label: '₴ 10', chance: 30, icon: '¢' },
                { label: '₴ 30', chance: 28, icon: '₿' },
                { label: '₴ 80', chance: 22, icon: '◆' },
                { label: '₴ 200', chance: 14, icon: '✦' },
                { label: '₴ 350', chance: 6, icon: '★' },
            ],
        },
        500: {
            name: 'МАГНАТ',
            rewards: [
                { label: '₴ 15', chance: 28, icon: '₿' },
                { label: '₴ 40', chance: 28, icon: '◆' },
                { label: '₴ 100', chance: 22, icon: '✦' },
                { label: '₴ 250', chance: 15, icon: '★' },
                { label: '₴ 450', chance: 7, icon: '♛' },
            ],
        },
        750: {
            name: 'ИМПЕРИЯ',
            rewards: [
                { label: '₴ 25', chance: 26, icon: '₿' },
                { label: '₴ 60', chance: 26, icon: '◆' },
                { label: '₴ 150', chance: 24, icon: '✦' },
                { label: '₴ 350', chance: 16, icon: '★' },
                { label: '₴ 700', chance: 8, icon: '♛' },
            ],
        },
        1000: {
            name: 'БОГ',
            rewards: [
                { label: '₴ 40', chance: 24, icon: '◆' },
                { label: '₴ 100', chance: 24, icon: '✦' },
                { label: '₴ 250', chance: 24, icon: '★' },
                { label: '₴ 500', chance: 18, icon: '♛' },
                { label: '₴ 1000', chance: 10, icon: '♛' },
            ],
        },
    };

    /* ---------- 3D visual builder ---------- */
    function buildVisual(tier) {
        let html = '<div class="mv-glow"></div>';

        if (tier === 1) {
            html += '<div class="mv-coin">¢</div>';
        } else if (tier === 2) {
            html += '<div class="mv-ring"></div>';
            html += '<div class="mv-coin">₿</div>';
        } else {
            html += '<div class="mv-ring"></div>';
            html += '<div class="mv-ring mv-ring-2"></div>';
            html += '<div class="mv-diamond">◆</div>';
            html += '<div class="mv-coin">₿</div>';
        }

        return html;
    }

    function tierFor(price) {
        if (price <= 100) return 1;
        if (price <= 250) return 2;
        return 3;
    }

    /* ---------- Helpers ---------- */
    function itemClass(chance) {
        if (chance <= 10) return 'r-high';
        if (chance <= 25) return 'r-mid';
        return 'r-low';
    }

    function itemHtml(r, isHit = false) {
        const cls = itemClass(r.chance) + (isHit ? ' r-hit' : '');
        return `<div class="roulette-item ${cls}"><span>${r.icon}</span>${r.label.replace('₴ ', '')}</div>`;
    }

    function buildStripHtml(rewards, winIndex = -1) {
        return rewards.map((r, idx) => itemHtml(r, idx === winIndex)).join('');
    }

    function buildFullStrip() {
        let items = [];
        for (let rep = 0; rep < 6; rep++) {
            items = items.concat(currentRewards);
        }
        return items;
    }

    /* ---------- Weighted random pick ---------- */
    function pickReward(rewards) {
        const total = rewards.reduce((sum, r) => sum + r.chance, 0);
        let roll = Math.random() * total;
        for (const r of rewards) {
            roll -= r.chance;
            if (roll <= 0) return r;
        }
        return rewards[rewards.length - 1];
    }

    /* ---------- Particles ---------- */
    function spawnParticles() {
        const rect = modal.getBoundingClientRect();
        const cx = rect.width * 0.5 + 18;
        const cy = rect.height * 0.32;

        particlesBox.innerHTML = '';
        for (let i = 0; i < 26; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const angle = Math.random() * Math.PI * 2;
            const dist = 90 + Math.random() * 130;
            p.style.left = cx + 'px';
            p.style.top = cy + 'px';
            p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
            p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
            p.style.animationDelay = Math.random() * 0.25 + 's';
            particlesBox.appendChild(p);
        }
        setTimeout(() => (particlesBox.innerHTML = ''), 1900);
    }

    /* ---------- Main spin (Case Modal) ---------- */
    function spinCaseModalRoulette() {
        if (spinLock || !currentRewards.length) return;
        spinLock = true;
        modalOpenBtn.disabled = true;
        winResult.hidden = true;

        const TOTAL_CARDS = 80;        // ровно 80 карточек
        const targetIndex = 59;        // индекс 59 = позиция 60 (выигрышный)
        const CARD_W = 60;             // ширина карточки px
        const CARD_GAP = 10;           // gap между карточками px

        // Выбираем выигрышный предмет
        const win = pickReward(currentRewards);

        // Генерируем массив ровно из 80 элементов
        const strip = [];
        for (let i = 0; i < TOTAL_CARDS; i++) {
            const r = i === targetIndex ? win : currentRewards[Math.floor(Math.random() * currentRewards.length)];
            strip.push(r);
        }

        // Рендер ленты, подсветка выигрыша
        rouletteStrip.innerHTML = buildStripHtml(strip, targetIndex);

        // --- Сброс перед запуском ---
        rouletteStrip.style.transition = 'none';
        rouletteStrip.style.transform = 'translateX(0)';

        // --- Точный математический расчёт смещения ---
        // targetIndex = 59; карточки с 61 по 80 (20 шт.) остаются справа — хвостовой буфер
        const containerWidth = rouletteWindow.clientWidth;
        const targetOffset =
            targetIndex * (CARD_W + CARD_GAP) -
            containerWidth / 2 +
            CARD_W / 2;

        // --- Запуск через 50ms с плавным торможением ---
        setTimeout(() => {
            rouletteStrip.style.transition = `transform ${SPIN_DURATION}ms cubic-bezier(0.15, 0.9, 0.2, 1)`;
            rouletteStrip.style.transform = `translateX(-${targetOffset}px)`;
        }, 50);

        // --- После завершения вращения ---
        setTimeout(() => {
            // Жёсткое выравнивание
            rouletteStrip.style.transition = 'none';
            rouletteStrip.style.transform = `translateX(-${targetOffset}px)`;

            // Показ результата
            const val = parseFloat(win.label.replace('₴ ', ''));
            const isBig = val >= 0.2 * currentPrice;

            winResult.hidden = false;
            winResult.textContent = win.label + ' ВЫИГРЫШ!';
            winResult.classList.toggle('big-win', isBig);

            if (isBig) {
                spawnParticles();
            }

            spinLock = false;
            modalOpenBtn.disabled = false;
        }, SPIN_DURATION + 150);
    }

    // Alias to avoid confusion with buildFullStrip
    function buildFullStripItems() {
        let items = [];
        for (let rep = 0; rep < 6; rep++) {
            items = items.concat(currentRewards);
        }
        return items;
    }

    /* ---------- Open modal ---------- */
    function openCaseModal(price) {
        const caseData = CASES[price];
        if (!caseData) return;

        currentPrice = price;
        currentRewards = caseData.rewards;
        spinLock = false;
        modalOpenBtn.disabled = false;
        winResult.hidden = true;

        modalTitle.textContent = caseData.name + ' КЕЙС';
        modalPrice.textContent = '₴ ' + price;
        modalOpenValue.textContent = '₴ ' + price;
        modalVisual.innerHTML = buildVisual(tierFor(price));

        // Rewards list
        rewardsList.innerHTML = caseData.rewards
            .map((r) => {
                return `
                    <div class="reward-row">
                        <div class="reward-label">
                            <span class="reward-icon">${r.icon}</span>
                            ${r.label}
                        </div>
                        <div class="reward-chance-value">${r.chance}%</div>
                        <div class="reward-chance">
                            <div class="reward-bar">
                                <div class="reward-bar-fill" style="width:${r.chance}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            })
            .join('');

        // Build fresh idle strip
        const idleItems = buildFullStripItems();
        rouletteStrip.innerHTML = buildStripHtml(idleItems);
        rouletteStrip.style.transition = 'none';
        rouletteStrip.style.transform = 'translateX(0px)';

        modal.hidden = false;
    }

    /* ---------- Open button ---------- */
    if (modalOpenBtn) {
        modalOpenBtn.addEventListener('click', () => {
            if (currentPrice !== null && !spinLock) {
                spinCaseModalRoulette();
            }
        });
    }

    /* ---------- Close modal ---------- */
    function closeCaseModal() {
        if (modal) modal.hidden = true;
        spinLock = false;
        if (winResult) winResult.hidden = true;
        if (particlesBox) particlesBox.innerHTML = '';
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeCaseModal);
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeCaseModal();
            }
        });
    }

    /* ============ CASE DETAIL SCREEN ============ */
    const caseDetailBack = document.getElementById('caseDetailBack');
    const caseDetailClose = document.getElementById('caseDetailClose');
    const caseDetailTitle = document.getElementById('caseDetailTitle');
    const caseDetailOpenValue = document.getElementById('caseDetailOpenValue');
    const caseDetailOpenSub = document.getElementById('caseDetailOpenSub');
    const caseDetailOpenBtn = document.getElementById('btn-open-main');
    const caseDetailQuickBtn = document.getElementById('btn-open-fast');
    const caseDetailMultipliers = document.querySelectorAll('.mult-btn');
    const caseDetailItems = document.getElementById('caseDetailItems');
    const caseDetailContentsCount = document.getElementById('caseDetailContentsCount');
    const caseDetailRouletteStrip = document.getElementById('caseDetailRouletteStrip');

    let caseDetailBasePrice = 100;
    let caseDetailMult = 1;

    // Рарность по цене предмета (для цветов свечения и дропа)
    function rarityForPrice(price) {
        if (price < 5) return 'common';
        if (price < 20) return 'rare';
        if (price < 60) return 'epic';
        if (price < 160) return 'legendary';
        return 'mythic';
    }

    // Кодирует пробелы в пути к изображению, чтобы браузер корректно открыл файл.
    function safeImgSrc(p) {
        return String(p || '').replace(/"/g, '%22').replace(/ /g, '%20');
    }

    // Текущий выбранный кейс (id из casesData.js), по умолчанию первый.
    let currentCaseId = null;

    // ── Точечная подвязка валидных картинок (ТОЛЬКО отображение) ──────────
    // standard-gifts -> реальные PNG; stars/jackpot -> image/star.png;
    // синтетические nft_* -> реальный PNG из базы giftsData.js (по ближайшей цене).
    const STANDARD_GIFT_IMG = {
        heart_15: 'standard-gifts/heart_15.png',
        bear_15: 'standard-gifts/bear_15.png',
        gift_25: 'standard-gifts/gift_25.png',
        rose_25: 'standard-gifts/rose_25.png',
        cake_50: 'standard-gifts/cake_50.png',
        bouquet_50: 'standard-gifts/bouquet_50.png',
        rocket_50: 'standard-gifts/rocket_50.png',
        champagne_50: 'standard-gifts/champagne_50.png',
        trophy_100: 'standard-gifts/trophy_100.png',
        ring_100: 'standard-gifts/ring_100.png',
        diamond_100: 'standard-gifts/diamond_100.png'
    };
    let _nftByPrice = null;
    function nearestNftImage(value) {
        const db = window.GIFTS_DB;
        if (!db || !db.length) return null;
        if (!_nftByPrice) _nftByPrice = db.slice().sort((a, b) => a.priceInStars - b.priceInStars);
        const t = Number(value) || 0;
        let best = _nftByPrice[0];
        for (const x of _nftByPrice) {
            if (Math.abs(x.priceInStars - t) < Math.abs(best.priceInStars - t)) best = x;
        }
        return best.imagePath;
    }
    function resolveItemImage(g) {
        if (STANDARD_GIFT_IMG[g.id]) return STANDARD_GIFT_IMG[g.id];
        if (g.type === 'stars' || g.type === 'jackpot') return 'image/star.png';
        if (!g.image || /telegram-stars/.test(String(g.image))) {
            const nftImg = nearestNftImage(g.value);
            if (nftImg) return nftImg;
        }
        return g.image || 'image/star.png';
    }

    // Читает предметы КОНКРЕТНОГО кейса из сгенерированного casesData.js (window.CASES).
    // Каждый предмет получает rarity и путь к картинке из standard-gifts/.
    function getCaseItems() {
        const list = (typeof window !== 'undefined' && Array.isArray(window.CASES))
            ? window.CASES
            : null;
        const def = list && (list.find((c) => c.id === currentCaseId) || list[0]);
        if (def && Array.isArray(def.items) && def.items.length) {
            return def.items.map((g) => ({
                id: g.id,
                name: g.name,
                price: Number(g.value) || 0,   // цена в Telegram Stars (XTR)
                image: resolveItemImage(g),
                type: g.type,
                weight: Number(g.weight) || 0, // вес на шкале 1 000 000
                drop_chance_percent: Number(g.drop_chance_percent) || 0,
                rarity: rarityForPrice(Number(g.value) || 0),
                currency: 'XTR',
                icon: g.image ? '' : (g.name || 'X').split(/\s+/)[0].slice(0, 2).toUpperCase(),
            }));
        }

        // Фолбэк: если конфиг не загрузился — старые демо-предметы.
        return [
            { icon: 'IMG', name: 'Bronze Coin', price: 2, image: '', rarity: 'common' },
            { icon: 'IMG', name: 'Silver Fragment', price: 4, image: '', rarity: 'common' },
            { icon: 'IMG', name: 'Neon Token', price: 8, image: '', rarity: 'rare' },
            { icon: 'IMG', name: 'Plasma Crystal', price: 12, image: '', rarity: 'rare' },
            { icon: 'IMG', name: 'Ruby Shard', price: 20, image: '', rarity: 'epic' },
            { icon: 'IMG', name: 'Sapphire Heart', price: 30, image: '', rarity: 'epic' },
            { icon: 'IMG', name: "Dragon's Breath", price: 50, image: '', rarity: 'legendary' },
            { icon: 'IMG', name: 'Golden Idol', price: 80, image: '', rarity: 'legendary' },
            { icon: 'IMG', name: 'Godslayer Edge', price: 120, image: '', rarity: 'mythic' },
        ];
    }

    function buildCaseDetailItems() {
        caseDetailItems.innerHTML = '';
        const items = getCaseItems();
        items.forEach((item) => {
            const card = document.createElement('div');
            card.className = 'drop-card';

            const visual = document.createElement('div');
            visual.className = 'drop-card-visual';
            if (item.image) {
                const img = document.createElement('img');
                img.src = safeImgSrc(item.image);
                img.alt = item.name;
                img.loading = 'lazy';
                // NFT-предметы получают .is-nft — подтягивают масштаб в сетке (прозрачные отступы PNG)
                if (item.type === 'nft') img.classList.add('is-nft');
                // Защита: битая картинка -> дефолтная иконка звезды
                img.onerror = function () { this.onerror = null; this.src = 'image/star.png'; };
                visual.appendChild(img);
            } else {
                visual.textContent = item.icon;
            }

            const name = document.createElement('span');
            name.className = 'drop-card-name';
            name.textContent = item.name;

            const price = document.createElement('span');
            price.className = 'drop-card-price';
            price.innerHTML = priceStarsHTML(item.price);

            // Название и цена — в тёмной плашке внутри карточки (как .case-card-body у кейсов)
            const infoCard = document.createElement('div');
            infoCard.className = 'item-info-card';
            infoCard.appendChild(name);
            infoCard.appendChild(price);

            card.appendChild(visual);
            card.appendChild(infoCard);
            caseDetailItems.appendChild(card);
        });
        caseDetailContentsCount.textContent = items.length;
    }

    /* ---------- Render a single case-detail item as a roulette card ---------- */
    function renderRouletteCard(item) {
        const card = document.createElement('div');
        card.className = 'roulette-item';

        const visual = document.createElement('div');
        visual.className = 'roulette-item-visual';
        if (item.image) {
            const img = document.createElement('img');
            img.src = safeImgSrc(item.image);
            img.alt = item.name;
            img.draggable = false;
            // NFT-предметы получают маркер .is-nft — увеличиваем их масштаб в рулетке
            if (item.type === 'nft') img.classList.add('is-nft');
            // Подарки из standard-gifts компактные — уменьшаем их в ленте на 50%
            // (150% -> 75% слота). Остальные предметы остаются без изменений.
            if (String(item.image).indexOf('standard-gifts/') === 0) {
                img.classList.add('gift-standard');
            }
            // Защита: битая картинка -> дефолтная иконка звезды
            img.onerror = function () { this.onerror = null; this.src = 'image/star.png'; };
            visual.appendChild(img);
        } else {
            visual.textContent = item.icon;
        }

        // ВАЖНО: на крутящейся ленте название и цена не показываются —
        // остаётся только обёртка карточки и картинка. Название и цена
        // предмета видны в модальном окне выигрыша (showWinOverlay).
        card.appendChild(visual);

        return card;
    }

// Длительность AFK-прокрутки ленты (в секундах на пол-ленты).
    // Для кейса 19 — 150 секунд; остальные — 400 секунд.
    function afkScrollDuration() {
        return currentCaseId === 'case_19' ? 150 : 400;
    }

    function buildRouletteStrip() {
        caseDetailRouletteStrip.innerHTML = '';
        const items = getCaseItems();

        // Стартовая AFK-лента — та же визуальная рандомизация, что и у основной ленты:
        //   - случайное кол-во NFT (2–8) на период;
        //   - остальные позиции — обычные подарки (равномерно, НЕ по реальным весам);
        //   - ни один предмет не идёт 3+ раз подряд;
        //   - порядок обязательно перемешивается.
        // Каждый вход в кейс генерирует новую случайную комбинацию (фиксированного ряда нет).
        const periodLen = Math.max(items.length * 4, 16);
        let period = generateVisualSpinItems(periodLen, items);
        // Убеждаемся, что первый и последний элементы периода разные, — иначе на стыке
        // дублированной ленты (бесшовный CSS-цикл -50%) могли бы появиться 3+ одинаковых подряд.
        let guard = 0;
        while (period.length && period[0] === period[period.length - 1] && guard < 6) {
            period = generateVisualSpinItems(periodLen, items);
            guard++;
        }
        if (period[0] === period[period.length - 1]) {
            period.push(period.shift());
        }
        // Двойной период подряд: первые 50% == последние 50% → бесшовный scrollRight.
        const duplicatedItems = [...period, ...period];

        duplicatedItems.forEach((item) => {
            caseDetailRouletteStrip.appendChild(renderRouletteCard(item));
        });

        // Reset transform and re-enable idle scroll animation
        caseDetailRouletteStrip.style.transition = 'none';
        caseDetailRouletteStrip.style.transform = 'translate3d(0px, 0, 0)';
        caseDetailRouletteStrip.style.setProperty('--ss', '0px'); // старт AFK с начала экрана
        // AFK-прокрутка очень медленная (Nс) — пользователь успевает рассмотреть карточки.
        // Для кейса 19 — 150с (пол-ленты ≈ период из 16+ предметов), остальные — 400с.
        caseDetailRouletteStrip.style.animation = 'scrollRight ' + afkScrollDuration() + 's linear infinite';
    }

    // Возобновляет AFK-прокрутку ленты после закрытия окна выигрыша («Забрать»/«Продать»).
    // Лента пересобирается со СЛУЧАЙНЫМ порядком предметов, а прокрутка стартует с позиции
    // остановки последнего спина (lastSpinStopX) — без «телепорта» в начало.
    function resumeIdleScroll() {
        const strip = caseDetailRouletteStrip;

        // Перемешиваем базовый набор предметов
        const items = getCaseItems();
        const shuffled = [...items].sort(() => Math.random() - 0.5);
        // 4 копии перемешанного набора: первые 2 копии == последние 2 → бесшовный цикл (-50%)
        const duplicatedItems = [...shuffled, ...shuffled, ...shuffled, ...shuffled];

        strip.innerHTML = '';
        duplicatedItems.forEach((item) => {
            strip.appendChild(renderRouletteCard(item));
        });

        // Стартовая позиция = место остановки спина (без скачка в начало)
        const startX = lastSpinStopX || 0;
        strip.style.transition = 'none';
        strip.style.transform = `translate3d(${startX}px, 0, 0)`;
        strip.style.setProperty('--ss', startX + 'px');
        strip.style.animation = 'scrollRight ' + afkScrollDuration() + 's linear infinite';
    }

    function updateCaseDetailPrice() {
        const totalStars = caseDetailBasePrice * caseDetailMult; // цена кейса в Stars
        // ГЛАВНАЯ цена на кнопке — сами Stars (акцентная) — число уже в Stars.
        if (caseDetailOpenValue) {
            caseDetailOpenValue.textContent = totalStars.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
        }
        // Вторичный ценник — в TON, мелкими буквами.
        if (caseDetailOpenSub) {
            const ton = CURR.starsToTon(totalStars);
            caseDetailOpenSub.textContent = '≈ ' + ton.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TON';
        }
    }

    function openCaseDetail(caseData) {
        const name = (caseData && caseData.name) || 'QUANT';
        const price = (caseData && caseData.price) || 100;   // цена кейса в Telegram Stars
        const caseImage = (caseData && caseData.image) || '';
        currentCaseId = caseData ? caseData.id || null : null;
        caseDetailTitle.textContent = name;
        caseDetailBasePrice = price;
        caseDetailMult = 1;

        // Картинка кейса в превью — берём обложку кейса из casesData (image/<name>.webp).
        const detailVisual = document.getElementById('caseDetailVisual');
        if (detailVisual) {
            if (caseImage) {
                detailVisual.innerHTML = '<img src="' + caseImage + '" alt="' + name + '" class="roulette-page-case-img">';
            } else {
                detailVisual.innerHTML = '';
            }
        }

        // Сброс табов
        caseDetailMultipliers.forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.mult === '1');
        });

        updateCaseDetailPrice();
        buildCaseDetailItems();
        buildRouletteStrip();
        showScreen('case-detail');
    }

    // Назад на главную
    caseDetailBack.addEventListener('click', () => {
        showScreen('home');
    });

    // Закрыть экран
    if (caseDetailClose) {
        caseDetailClose.addEventListener('click', () => {
            showScreen('home');
        });
    }

    // Переключение множителей
    caseDetailMultipliers.forEach((btn) => {
        btn.addEventListener('click', () => {
            caseDetailMultipliers.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            caseDetailMult = parseInt(btn.dataset.mult, 10);
            updateCaseDetailPrice();
        });
    });

    // Открыть кейс: баланс и дроп решает СЕРВЕР (атомарно, race-safe).
    caseDetailOpenBtn.addEventListener('click', async () => {
        if (caseDetailOpenBtn.disabled) return;
        caseDetailOpenBtn.disabled = true;
        try {
            // Бэкенд проверяет баланс в БД, списывает Stars и генерирует предмет по весам.
            const data = await apiOpenCase(currentCaseId, caseDetailMult);
            serverBalanceStars = Number(data.balance) || 0;
            loadBalance();
            renderBalance();
            spinRoulette(SPIN_DURATION_MS, SPIN_EASING, data.item);
        } catch (e) {
            caseDetailOpenBtn.disabled = false;
            showToast(e.status === 402 ? 'Недостаточно Stars на балансе' : 'Ошибка открытия кейса: ' + e.message);
        }
    });

    /* ---------- Roulette spin config ---------- */
    const PRE_ROLL_COUNT = 45;         // случайные карточки до точки остановки (№1–45)
    const POST_ROLL_COUNT = 14;        // случайные карточки после точки остановки (№47–60), итого ровно 60
    const STOP_INDEX = PRE_ROLL_COUNT; // 46-я карточка — позиция остановки ленты
    const SPIN_DURATION_MS = 5500;     // длительность вращения = 5.5с (transition === таймеру)
    const SPIN_EASING = 'cubic-bezier(0.15, 0.9, 0.2, 1)'; // плавный старт + мягкое замедление в конце
    const QUICK_SPIN_DURATION_MS = 2000; // «Быстрое открытие»: ровно 2 секунды
    const QUICK_SPIN_EASING = 'cubic-bezier(0.1, 0.9, 0.2, 1)'; // резкий крутёж → эффектное торможение
    const CARD_WIDTH_PX = 60;         // px — ширина карточки (.roulette-item) — синхронизировано с CSS 60px
    const SEAM_SAFETY_MARGIN_PX = 8;   // px — отступ от шва (gap + margin карточек): стрелка не встаёт в стык
    const WIN_REVEAL_DELAY_MS = 400;   // пауза после остановки ленты до появления экрана выигрыша
    // Позиция остановки последнего спина — с неё возобновляется AFK-прокрутка (без «телепорта» в начало)
    let lastSpinStopX = 0;

    /* ---------- Взвешенный выбор предмета по цене (Drop Rate) ---------- */
    // Чем дешевле предмет — тем выше шанс выпадения.
    // Вес = 1 / (price + 1): дорогие высоковейте-НFT получают малый вес, дешёвые — большой.
    function weightedPick(items) {
        if (!items.length) return null;
        const weights = items.map((it) => (Number(it.weight) > 0 ? Number(it.weight) : 1 / (Number(it.price) + 1)));
        const total = weights.reduce((s, w) => s + w, 0);
        let roll = Math.random() * total;
        for (let i = 0; i < items.length; i++) {
            roll -= weights[i];
            if (roll <= 0) return items[i];
        }
        return items[items.length - 1];
    }

    function pickRandomCaseItem() {
        const items = getCaseItems();
        if (!items.length) return null;
        return weightedPick(items);
    }

/* ---------- Визуальная генерация ленты (только вид, НЕ реальный дроп) ---------- */
    // Лента собирается независимо от реальных шансов выпадения, чтобы выглядела
    // разнообразно и непредсказуемо:
    //   - NFT выбираются случайно (2–8 шт. на ленту) и встречаются реже подарков;
    //   - обычные подарки берутся случайно и равномерно (НЕ по реальным весам);
    //   - любой предмет не идёт 3+ раз подряд;
    //   - после сборки весь порядок обязательно перемешивается.
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
    }

    // Устраняет длинные повторы: ни один предмет не встречается 3+ раз подряд
    // (в т.ч. после перемешивания).
    function sanitizeRuns(arr) {
        let fixed = false;
        let guard = 0;
        do {
            fixed = false;
            guard++;
            if (guard > 1000) break;
            for (let i = 0; i < arr.length - 2; i++) {
                if (arr[i] === arr[i + 1] && arr[i + 1] === arr[i + 2]) {
                    for (let j = i + 2; j < arr.length; j++) {
                        if (arr[i + 1] !== arr[j]) {
                            const t = arr[i + 1]; arr[i + 1] = arr[j]; arr[j] = t;
                            fixed = true;
                            break;
                        }
                    }
                }
            }
        } while (fixed);
        return arr;
    }

    // Генерирует визуальную ленту из length карточек.
    // Возвращаемый массив ПЕРЕМЕШАН; место остановки (победитель) подставляет spinRoulette.
    function generateVisualSpinItems(length, allItems) {
        const nftItems = allItems.filter((it) => it.type === 'nft');
        const giftItems = allItems.filter((it) => it.type === 'gift');
        // Если в кейсе нет явных NFT/подарков — используем весь набор как пул для вида.
        const poolNft = nftItems.length ? nftItems : allItems;
        const poolGift = giftItems.length ? giftItems : allItems;

        // Кол-во NFT визуально: 2–8, но не больше 1/3 ленты и не больше доступных NFT.
        const maxNft = Math.min(8, Math.floor(length / 3), poolNft.length);
        const minNft = Math.min(2, maxNft);
        const nftCount = maxNft < minNft ? maxNft : (minNft + Math.floor(Math.random() * (maxNft - minNft + 1)));

        // Черновой список: nftCount случайных NFT + остальные обычные подарки (равномерно).
        const draft = [];
        for (let i = 0; i < nftCount; i++) {
            draft.push(poolNft[Math.floor(Math.random() * poolNft.length)]);
        }
        for (let i = nftCount; i < length; i++) {
            draft.push(poolGift[Math.floor(Math.random() * poolGift.length)]);
        }

        // Перемешиваем весь порядок и разбавляем длинные серии.
        shuffle(draft);
        sanitizeRuns(draft);
        return draft;
    }

    // Приводит предмет, пришедший с сервера, к виду клиентской модели.
    // dbId — id строки в user_inventory (нужен для продажи/вывода через API).
    function normalizeServerDrop(row) {
        return {
            dbId: row.id != null ? Number(row.id) : null,
            id: row.item_id != null ? row.item_id : row.id,
            name: row.name || 'Gift',
            image: row.image || '',
            rarity: row.rarity || 'common',
            price: Number(row.price_stars) || 0,
            type: 'gift',
        };
    }

    function spinRoulette(durationMs = SPIN_DURATION_MS, easing = SPIN_EASING, fixedItem = null) {
        if (caseDetailOpenBtn.disabled) return;

        // Disable button during spin
        caseDetailOpenBtn.disabled = true;

        const strip = caseDetailRouletteStrip;

        // --- Stop idle CSS scroll animation ---
        strip.style.animation = 'none';

        // --- Spin Track Generator: ровно 60 карточек, сплошная лента без пустот ---
        // РЕАЛЬНЫЙ выигрыш приходит с сервера (/api/open-case) — фиксированный предмет.
        // Клиентский weightedPick остаётся ТОЛЬКО как визуальный fallback (dev-режим).
        const allItems = getCaseItems();
        const winningItem = fixedItem ? normalizeServerDrop(fixedItem) : weightedPick(allItems);
        const TOTAL_CARDS = PRE_ROLL_COUNT + POST_ROLL_COUNT + 1; // 45 + 14 + 1 = 60
        // Визуальный конвейер генерируется ОТДЕЛЬНО от реальных шансов (чисто для вида).
        // Реальная частота предметов здесь НЕ совпадает с их настоящими шансами выпадения.
        const spinItems = generateVisualSpinItems(TOTAL_CARDS, allItems);
        // Гарантированно ставим победителя точно под стрелку остановки.
        spinItems[STOP_INDEX] = winningItem;

        // --- Рендерим ленту в трек рулетки ---
        strip.innerHTML = '';
        spinItems.forEach((item) => {
            strip.appendChild(renderRouletteCard(item));
        });

        // --- Сброс в базовую позицию и ЗАМЕР реальной геометрии ---
        // Не полагаемся на арифметику ширины/gap/центрирования flex-контейнера:
        // замеряем фактические координаты через getBoundingClientRect()
        strip.style.transition = 'none';
        strip.style.transform = 'translate3d(0px, 0, 0)';
        void strip.offsetWidth; // принудительный reflow — сброс применяется до замера

        // Базовое центрирование: (центр контейнера) − (центр карточки остановки) в текущем layout.
        const contRect = strip.parentElement.getBoundingClientRect();
        const stopRect = strip.children[STOP_INDEX].getBoundingClientRect();
        const centerX = (contRect.left + contRect.width / 2) - (stopRect.left + stopRect.width / 2);

        // --- Пиксельная (дробная) рандомизация остановки ---
        // Случайный сдвиг на N пикселей влево/вправо от центра карточки,
        // с запасом от швов: стрелка всегда визуально остаётся в пределах карточки.
        const maxOffset = (CARD_WIDTH_PX / 2) - SEAM_SAFETY_MARGIN_PX; // 45 − 6 = 39px
        const randomPixelOffset = (Math.random() * 2 - 1) * maxOffset; // −39..+39, с долями пикселя
        const targetX = centerX + randomPixelOffset;
        lastSpinStopX = targetX; // запоминаем позицию остановки — для возобновления AFK-прокрутки

        // --- Start spin animation on next frame (after reset is applied) ---
        // translate3d — аппаратное ускорение GPU; дробные пиксели интерполируются плавно.
        // cubic-bezier(0.15, 0.9, 0.2, 1) — плавный динамичный старт + мягкое
        // замедление в конце: лента «докатывается» к выигрышу без резких рывков.
        requestAnimationFrame(() => {
            strip.style.transition = `transform ${durationMs}ms ${easing}`;
            strip.style.transform = `translate3d(${targetX}px, 0, 0)`;
        });

        // --- После остановки: просто разблокируем кнопку «Открыть» ---
        // Лента НЕ очищается и НЕ прячется: фиксируем её на финальной позиции transform
        setTimeout(() => {
            strip.style.transition = 'none';
            strip.style.transform = `translate3d(${targetX}px, 0, 0)`;
            caseDetailOpenBtn.disabled = false;
            // Пауза 400мс: пользователь чётко видит остановку стрелки, затем — экран выигрыша
            setTimeout(() => showWinOverlay(winningItem), WIN_REVEAL_DELAY_MS);
        }, durationMs);
    }

    /* ---------- Win overlay: цвета редкости и действия ---------- */
    const RARITY_GLOW_COLORS = {
        common: '#8D96A3',
        rare: '#1683FF',
        epic: '#9D4EDD',
        legendary: '#FFB800',
        mythic: '#FF3C3C',
    };

    function rarityColor(rarity) {
        return RARITY_GLOW_COLORS[rarity] || RARITY_GLOW_COLORS.rare;
    }

    function itemMonogram(item) {
        // Иконки предметов — пока заглушки 'IMG': показываем монограмму имени
        if (item.icon !== 'IMG') return item.icon;
        return item.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    }

    function creditBalance(amountTon) {
        // Клиентское начисление запрещено: баланс правит только сервер.
        // Функция оставлена как no-op для обратной совместимости вызовов.
        readRawBalance();
    }

    /* ============================================================
       ИНВЕНТАРЬ — данные из БД (serverInventory), персистентность на сервере
       ============================================================ */
    void 0; // (localStorage-ключи удалены вместе с локальной схемой)

    /* ============================================================
       STATE: единый источник истины — СЕРВЕР (PostgreSQL).
       Локальные localStorage-массивы удалены: клиент только
       отображает serverInventory / serverBestDrops / balance.
       ============================================================ */

    // Текущий инвентарь — только «owned» (продаваемые) предметы.
    function getInventory() {
        return serverInventory.filter((g) => g && g.status !== 'pending_withdraw');
    }

    // Предметы в процессе вывода (pending_withdraw) — отдельно.
    function getPendingWithdraws() {
        return serverInventory.filter((g) => g && g.status === 'pending_withdraw');
    }

    // Запись инвентаря с клиента ЗАПРЕЩЕНА: меняет только сервер.
    function saveInventory() { /* no-op (server-side) */ }

    function savePendingWithdraws() { /* no-op (server-side) */ }

    // Разовая миграция старой localStorage-схемы больше не нужна.
    function migratePendingToStore() { /* no-op (server-side) */ }

    // Полный список для рендера карточек: owned + pending_withdraw.
    function getAllItems() {
        return serverInventory.slice();
    }

    // Единый хелпер получения ID предмета из любого объекта.
    function itemId(g) {
        return g && (g.id != null ? g.id : (g.item_id || g.slug || String(g.name || 'gift').toLowerCase().replace(/\s+/g, '_')));
    }

    // История лучших дропов — с сервера (best_drops, ТОП-6 all-time).
    function getBestDropsHistory() {
        return serverBestDrops.slice();
    }

    function saveBestDropsHistory() { /* no-op (server-side) */ }

    /* ============================================================
       ИСТОРИЯ ЛУЧШИХ ДРОПОВ — приходит с сервера (best_drops, all-time).
       ============================================================ */

    /* ============================================================
       PENDING WITHDRAWS — тоже серверное состояние (status='pending_withdraw')
       в user_inventory. Локальные ключи удалены.
       ============================================================ */
    void 0; // (server-side state)

    // best_drops обновляет сервер при открытии кейса — клиент не считает.
    function checkAndAddBestDrop() { /* no-op (server-side) */ }

    // Обновляет историю: реализовано на сервере (best_drops, all-time ТОП-6).

    // Рарность по цене в Stars (XTR) — как в остальной логике проекта.
    function rarityForStars(stars) {
        if (stars < 400) return 'common';
        if (stars < 1600) return 'rare';
        if (stars < 4800) return 'epic';
        if (stars < 12800) return 'legendary';
        return 'mythic';
    }

    // Класс-модификатор для карточек (фон по редкости).
    function rarityClass(rar) {
        return 'rarity-' + (rar || 'common');
    }

    // Реальные данные предмета: из БД (user_inventory / best_drops) или из кейс-конфига.
    function enrichGift(g) {
        if (!g) return null;
        const priceStars = Number(
            g.price_stars != null ? g.price_stars
            : (g.priceInStars != null ? g.priceInStars
            : (g.price != null ? g.price : g.value))
        ) || 0;
        const stars = Math.round(priceStars);
        const rarity = g.rarity || rarityForStars(stars);
        return {
            id: (g.id != null ? g.id : (g.item_id || g.slug || (g.name || 'gift').toLowerCase().replace(/\s+/g, '_'))),
            name: g.name || 'Gift',
            price: stars,
            image: g.image || g.imagePath || '',
            rarity,
            type: g.type || 'gift',
            status: g.status || 'owned',
            wonAt: g.won_at || g.wonAt || Date.now(),
        };
    }

    // Формат цены: `⭐ 1 234`.
    function formatStars(stars) {
        return (Number(stars) || 0).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
    }

    // Человеческое название редкости (подтип предмета).
    function rarityLabel(rar) {
        return { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' }[rar] || 'Common';
    }

    // Карточка предмета для сетки профиля («Мой лучший дроп»).
    function profileItemCard(g) {
        const it = enrichGift(g);
        const img = it.image
            ? `<img src="${safeImgSrc(it.image)}" alt="${it.name}" loading="lazy">`
            : `<div class="profile-item-monogram">${(it.name || '?').slice(0, 2).toUpperCase()}</div>`;
        return `
            <div class="profile-item-card ${rarityClass(it.rarity)}">
                <div class="profile-item-visual">${img}</div>
                <span class="profile-item-name">${it.name}</span>
                <span class="profile-item-subtype">${rarityLabel(it.rarity)}</span>
                <div class="profile-item-price">
                    <span class="profile-item-star">⭐</span>
                    <span class="profile-item-price-value">${formatStars(it.price)}</span>
                </div>
            </div>`;
    }

    // Карточка предмета для экрана «Инвентарь».
    function inventoryItemCard(g) {
        const it = enrichGift(g);
        const visual = it.image
            ? `<img src="${safeImgSrc(it.image)}" alt="${it.name}" class="inventory-img">`
            : `<div class="nft-art">${(it.name || '?').slice(0, 2).toUpperCase()}</div>`;

        // Предмет на выводе: бейдж + скрытые кнопки + плашка «В обработке».
        const isPending = g && g.status === 'pending_withdraw';
        if (isPending) {
            return `
            <div class="inventory-user-card ${rarityClass(it.rarity)} status-pending" data-id="${it.id}" data-price="${it.price}">
                <span class="inv-pending-badge">⏳ На выводе</span>
                <div class="inventory-user-visual">${visual}</div>
                <div class="inventory-user-info">
                    <span class="inventory-user-name">${it.name}</span>
                    <span class="inventory-user-sub">${rarityLabel(it.rarity)}</span>
                </div>
                <div class="inventory-user-price">⭐ ${formatStars(it.price)}</div>
                <div class="inv-pending-plate">⏳ В обработке (до 72ч)</div>
                <span class="inventory-name hidden">${it.name}</span>
                <span class="inventory-price hidden">${it.price}</span>
            </div>`;
        }

        return `
            <div class="inventory-user-card ${rarityClass(it.rarity)}" data-id="${it.id}" data-price="${it.price}">
                <div class="inventory-user-visual">${visual}</div>
                <div class="inventory-user-info">
                    <span class="inventory-user-name">${it.name}</span>
                    <span class="inventory-user-sub">${rarityLabel(it.rarity)}</span>
                </div>
                <div class="inventory-user-price">⭐ ${formatStars(it.price)}</div>
                <div class="inventory-user-actions">
                    <button class="inv-action-btn inv-action-sell inv-sell" type="button">Продать за ${formatStars(it.price)} ⭐</button>
                    <button class="inv-action-btn inv-action-withdraw inv-withdraw" type="button">Вывести</button>
                </div>
                <span class="inventory-name hidden">${it.name}</span>
                <span class="inventory-price hidden">${it.price}</span>
            </div>`;
    }

    /* ============================================================
       ТОП-6 ЛУЧШИХ ДРОПОВ В ПРОФИЛЕ + ИНВЕНТАРЬ
       ============================================================ */

    // Обновляет сетку «Мой лучший дроп»: ровно 6 самых дорогих предметов
    // за всю историю (All-Time) — приходит с сервера (best_drops).
    function updateBestDrops() {
        const grid = document.getElementById('profileItemGrid');
        if (!grid) return;

        const items = getBestDropsHistory();

        grid.innerHTML = items.length
            ? items.map(profileItemCard).join('')
            : `<div class="profile-grid-empty">Откройте кейс, чтобы собрать дроп</div>`;
    }

    // Рендер экрана «Инвентарь»: пустой экран (рюкзак) или сетка предметов.
    function renderInventory() {
        const emptyEl = document.getElementById('inventoryEmptyState');
        const grid = document.getElementById('inventoryUserGrid');
        if (!emptyEl || !grid) return;

        // Разовая миграция pending-предметов из старой схемы в отдельный массив.
        migratePendingToStore();

        // ТЕКУЩИЙ инвентарь (доступные к продаже) — без предметов на выводе.
        const raw = getInventory();
        // Полный список для рендера карточек: текущие + предметы на выводе.
        const all = getAllItems();
        const hasItems = all.length > 0;

        // Если предметов нет — показываем пустой экран, иначе сетку.
        emptyEl.classList.toggle('hidden', hasItems);
        grid.classList.toggle('hidden', !hasItems);
        // Карточка сама различает «на выводе» (status_pending) по переданному объекту.
        grid.innerHTML = hasItems ? all.map(inventoryItemCard).join('') : '';

        // Шапка-статистика: показываем только когда есть предметы (любые).
        const head = document.getElementById('inventoryHead');
        if (head) head.classList.toggle('hidden', !hasItems);

        // Счётчики учитывают ТОЛЬКО предметы, доступные к продаже (raw = без pending).
        const sellableItems = raw.map(enrichGift);
        const statsEl = document.getElementById('invGlassStats');
        const sellAllEl = document.getElementById('invSellAllBtn');
        const sellAllSum = document.getElementById('invSellAllSum');
        let totalStars = 0;
        sellableItems.forEach((it) => { totalStars += Number(it.price) || 0; });

        // Если нет ни одного продаваемого предмета — кнопка неактивна, «0 • 0 ⭐».
        const noun = plural(sellableItems.length, 'предмет', 'предмета', 'предметов');
        if (statsEl) statsEl.textContent = sellableItems.length + ' ' + noun + ' • ' + formatStars(totalStars) + ' ⭐';
        if (sellAllEl) sellAllEl.disabled = sellableItems.length === 0;
        if (sellAllSum) sellAllSum.textContent = formatStars(totalStars) + ' ⭐';
    }

    // Склонение существительных: 1 предмет, 2 предмета, 5 предметов.
    function plural(n, one, few, many) {
        const n10 = n % 10;
        const n100 = n % 100;
        if (n10 === 1 && n100 !== 11) return one;
        if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
        return many;
    }

    // Предмет уже записан в БД на сервере при /api/open-case.
    // Клиент только обновляет зеркальное состояние и перерисовывает экраны.
    function addItemToInventory(item) {
        if (!item) return;
        const enriched = enrichGift(item);
        if (enriched) {
            serverInventory = [Object.assign({}, item, enriched, { status: item.status || 'owned' })]
                .concat(serverInventory.filter((g) => String(itemId(g)) !== String(itemId(item))));
        }
        try { renderInventory(); } catch (e) {}
        try { updateBestDrops(); } catch (e) {}
    }

    function showWinOverlay(item) {
        const color = rarityColor(item.rarity);
        const container = document.getElementById('winResultContainer');
        const controls = document.querySelector('.case-controls');

        if (container) {
            // Инлайн-блок результата прямо под рулеткой (никаких модалок поверх).
            container.hidden = false;
            container.classList.remove('collapse');
            container.classList.add('is-open');
            // ФАЗА 1: скрываем блок управления кейсом (Открыть / Быстрое / x1-x5),
            // на экране остаются ТОЛЬКО кнопки «Забрать» / «Продать».
            if (controls) controls.classList.add('hide');

            container.innerHTML = `
                <div class="win-result-card" style="--rarity-color:${color}">
                    <div class="win-result-glow"></div>
                    <div class="win-result-item" style="--rarity-color:${color}">
                        ${item.image
                            ? `<img src="${safeImgSrc(item.image)}" alt="${item.name}" draggable="false" onerror="this.onerror=null;this.src='image/star.png'">`
                            : `<div class="win-result-monogram">${(item.name || '?').slice(0, 2).toUpperCase()}</div>`}
                    </div>
                    <div class="win-result-info">
                        <span class="win-result-name">${item.name}</span>
                        <span class="win-result-rarity" style="color:${color}">${rarityLabel(item.rarity)}</span>
                        <span class="win-result-price">⭐ ${formatStars(item.price)}</span>
                    </div>
                    <div class="win-result-actions">
                        <button data-act="keep" class="win-result-btn win-result-btn-primary">Забрать</button>
                        <button data-act="sell" class="win-result-btn win-result-btn-gold">Продать за ${formatStars(item.price)} ⭐</button>
                    </div>
                    <div class="win-result-confetti" aria-hidden="true"></div>
                </div>`;

            // Последовательное появление: предмет → конфети → инфо → кнопки.
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const card = container.querySelector('.win-result-card');
                card.classList.add('win-result-in');
                setTimeout(() => launchConfetti(container.querySelector('.win-result-confetti')), 360);
                setTimeout(() => card.classList.add('win-result-info-on'), 420);
                setTimeout(() => card.classList.add('win-result-actions-on'), 600);
                // АВТО-СКРОЛЛ: через 500ms после появления подводим предмет с кнопками
                // «Забрать»/«Продать» строго к центру экрана.
                setTimeout(() => {
                    container.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 500);
            }));

            const close = () => {
                // ФАЗА 2: скрываем блок предмета с кнопками, возвращаем управление кейсом.
                container.classList.remove('is-open');
                container.classList.add('collapse');
                if (controls) controls.classList.remove('hide');
                setTimeout(() => {
                    container.hidden = true;
                    container.innerHTML = '';
                    resumeIdleScroll();
                }, 340);
            };

            // «Забрать»: предмет УЖЕ в БД (записан при /api/open-case) —
            // обновляем зеркало состояния и подтягиваем актуальные данные.
            const keepBtn = container.querySelector('[data-act="keep"]');
            if (keepBtn) keepBtn.addEventListener('click', () => {
                addItemToInventory(item);
                syncFromServer();
                close();
            });

            // «Продать за X ⭐»: СЕРВЕР списывает предмет из инвентаря и зачисляет Stars.
            const sellBtn = container.querySelector('[data-act="sell"]');
            if (sellBtn) sellBtn.addEventListener('click', async () => {
                sellBtn.disabled = true;
                try {
                    if (item.dbId != null) {
                        await apiSell([item.dbId]);
                    }
                    await syncFromServer(); // баланс + инвентарь + best_drops из БД
                    close();
                } catch (e) {
                    showToast('Ошибка продажи: ' + e.message);
                    sellBtn.disabled = false;
                }
            });
            return;
        }

        // Резервный путь (контейнер не найден) — тихо ничего не показываем.
        resumeIdleScroll();
    }

    // Генерирует праздничные частицы (конфети) внутри контейнера.
    function launchConfetti(container) {
        if (!container) return;
        const colors = ['#22c55e', '#00e599', '#ffd977', '#f6c445', '#ffffff', '#f97316'];
        for (let i = 0; i < 42; i++) {
            const p = document.createElement('i');
            const size = 6 + Math.random() * 8;
            p.style.cssText = `
                position:absolute; left:50%; top:50%; width:${size}px; height:${size * (0.5 + Math.random()*0.6)}px;
                background:${colors[i % colors.length]};
                border-radius:${Math.random() > 0.5 ? '50%' : '2px'};
                opacity:0;
            `;
            // Разброс по всем направлениям от центра вылета.
            const angle = Math.random() * Math.PI * 2;
            const dist = 90 + Math.random() * 190;
            p.style.setProperty('--cx', Math.cos(angle) * dist + 'px');
            p.style.setProperty('--cy', Math.sin(angle) * dist + 'px');
            p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
            p.style.animationDelay = (Math.random() * 0.25) + 's';
            container.appendChild(p);
        }
    }

    // Быстрое открытие: та же серверная логика (атомарный списание+дроп).
    caseDetailQuickBtn.addEventListener('click', async () => {
        if (caseDetailQuickBtn.disabled) return;
        caseDetailQuickBtn.disabled = true;
        try {
            const data = await apiOpenCase(currentCaseId, caseDetailMult);
            serverBalanceStars = Number(data.balance) || 0;
            loadBalance();
            renderBalance();
            spinRoulette(QUICK_SPIN_DURATION_MS, QUICK_SPIN_EASING, data.item);
        } catch (e) {
            showToast(e.status === 402 ? 'Недостаточно Stars на балансе' : 'Ошибка открытия кейса: ' + e.message);
        } finally {
            caseDetailQuickBtn.disabled = false;
        }
    });

    // ── Цены кейсов на главной ──────────────────────────────────────────────
    // Источник правды — класс `case-NNN` (цена кейса в TON).
    // Главная/единственная цена на карточке — в Telegram Stars: stars = ton * 80.
    // Пример: вместо «10 TON / ≈ 800 ⭐» на карточке ровно «800 ⭐».
    function renderCaseCardPrices() {
        document.querySelectorAll('.case-card').forEach((card) => {
            const m = card.className.match(/case-(\d+)/);
            if (!m) return;
            const ton = parseInt(m[1], 10) || 0;
            const priceEl = card.querySelector('.case-price');
            if (!priceEl) return;
            const stars = Math.round(CURR.tonToStars(ton));
            priceEl.innerHTML =
                '<span class="case-price-stars">' + stars.toLocaleString('ru-RU', { maximumFractionDigits: 0 }) + ' ⭐</span>';
        });
    }
    renderCaseCardPrices();

    // Клик по карточке кейса → открыть case-detail.
    // Делегирование: карточки рендерятся ДИНАМИЧЕСКИ ES-модулем из casesData.js
    // и несут data-case="<case_id>" — прямые биндеры их не видят.
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.case-card[data-case]');
        if (!card) return;
        const def = (Array.isArray(window.CASES) ? window.CASES : [])
            .find((c) => c.id === card.dataset.case);
        if (!def) return;
        openCaseDetail(def);
    });

    /* ============ WITHDRAW MODAL ============ */
    const withdrawModal = document.getElementById('withdrawModal');
    const withdrawModalClose = document.getElementById('withdrawModalClose');
    const withdrawItemPreview = document.getElementById('withdrawItemPreview');
    const withdrawItemName = document.getElementById('withdrawItemName');
    const withdrawItemPrice = document.getElementById('withdrawItemPrice');
    const withdrawItemChange = document.getElementById('withdrawItemChange');
    const withdrawAddress = document.getElementById('withdrawAddress');
    const withdrawConfirm = document.getElementById('withdrawConfirm');

    const MIN_WITHDRAW_PRICE = 15;
    let currentWithdrawCard = null;

    function openWithdrawModal(card) {
        const nameEl = card.querySelector('.inventory-name');
        const priceEl = card.querySelector('.inventory-price');
        if (!nameEl || !priceEl) return;

        const name = nameEl.textContent;
        // Минимальная стоимость 15
        const price = Math.max(MIN_WITHDRAW_PRICE, parseInt(priceEl.textContent.replace(/\D/g, ''), 10) || MIN_WITHDRAW_PRICE);

        currentWithdrawCard = card;
        withdrawItemName.textContent = name;
        withdrawItemPrice.textContent = price;
        withdrawAddress.value = '';
        withdrawModal.hidden = false;
    }

    function closeWithdrawModal() {
        withdrawModal.hidden = true;
        currentWithdrawCard = null;
    }

    document.querySelectorAll('.inventory-card').forEach((card) => {
        const withdrawBtn = card.querySelector('.inv-withdraw');
        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openWithdrawModal(card);
            });
        }
    });

    withdrawItemChange.addEventListener('click', () => {
        // Переключение на следующий предмет
        const cards = document.querySelectorAll('.inventory-card');
        const currentIdx = [...cards].indexOf(currentWithdrawCard);
        if (cards.length > 0) {
            const next = cards[(currentIdx + 1) % cards.length];
            openWithdrawModal(next);
        }
    });

    withdrawConfirm.addEventListener('click', () => {
        const address = withdrawAddress.value.trim();
        if (!address) {
            withdrawAddress.style.borderColor = '#FF5252';
            return;
        }
        // Запрос вывода
        currentWithdrawCard.remove();
        closeWithdrawModal();
    });

    withdrawModalClose.addEventListener('click', closeWithdrawModal);

    withdrawModal.addEventListener('click', (e) => {
        if (e.target === withdrawModal) {
            closeWithdrawModal();
        }
    });

    /* ============ SELL MODAL ============ */
    const sellModal = document.getElementById('sellModal');
    const sellModalClose = document.getElementById('sellModalClose');
    const sellVisual = document.getElementById('sellVisual');
    const sellItemName = document.getElementById('sellItemName');
    const sellPriceAmount = document.getElementById('sellPriceAmount');
    const sellConfirm = document.getElementById('sellConfirm');

    let currentSellCard = null;
    let currentSellItem = null;

    // Локальный делегированный обработчик кликов: работает и с динамически
    // отрисованными карточками инвентаря (после renderInventoryList()).
    function bindInventorySell() {
        const grid = document.getElementById('profileInventoryGrid');
        if (!grid) return;
        grid.addEventListener('click', (e) => {
            const btn = e.target.closest('.inv-sell');
            if (!btn) return;
            e.stopPropagation();
            const card = btn.closest('.inventory-card');
            if (card) openSellModal(card);
        });
    }

    function openSellModal(card) {
        const id = card.getAttribute('data-id');
        const price = Number(card.getAttribute('data-price')) || 0;
        const nameEl = card.querySelector('.inventory-name');
        const name = nameEl ? nameEl.textContent : '';

        // Продажа по реальной стоимости предмета (из базы / выигрыша).
        currentSellCard = card;
        currentSellItem = { id, name, sellPrice: price };

        sellVisual.textContent = (name || '?').slice(0, 2).toUpperCase();
        sellItemName.textContent = name;
        sellPriceAmount.textContent = formatStars(price);

        sellModal.hidden = false;
    }

    function closeSellModal() {
        sellModal.hidden = true;
        currentSellCard = null;
        currentSellItem = null;
    }

    // Подтверждение продажи (старая модалка): СЕРВЕР пересчитывает и зачисляет Stars.
    sellConfirm.addEventListener('click', async () => {
        if (!currentSellCard || !currentSellItem) return;
        sellConfirm.disabled = true;
        try {
            const invId = Number(currentSellItem.id);
            if (Number.isFinite(invId) && invId > 0) {
                const data = await apiSell([invId]);
                serverBalanceStars = Number(data.balance) || 0;
                loadBalance();
                renderBalance();
                await syncFromServer();
                showToast('Продано! Зачислено ' + formatStars(data.credited) + ' ⭐');
            }
        } catch (e) {
            showToast('Ошибка продажи: ' + e.message);
            await syncFromServer().catch(() => {});
        } finally {
            sellConfirm.disabled = false;
            closeSellModal();
        }
    });

    sellModalClose.addEventListener('click', closeSellModal);

    sellModal.addEventListener('click', (e) => {
        if (e.target === sellModal) {
            closeSellModal();
        }
    });

    // Вешаем делегированный обработчик на продажу динамических карточек.
    bindInventorySell();

    /* ============ INVENTORY: действия через полноэкранные страницы ============ */
    const inventoryGridEl = document.getElementById('inventoryUserGrid');
    if (inventoryGridEl) {
        // Кнопки действий внутри карточек (делегирование, работает после перерисовки).
        inventoryGridEl.addEventListener('click', (e) => {
            const sellBtn = e.target.closest('.inv-sell');
            if (sellBtn) {
                const card = sellBtn.closest('.inventory-user-card');
                if (card) {
                    const id = card.getAttribute('data-id');
                    const item = getInventory().map(enrichGift).find((g) => String(g.id) === id);
                    // Открываем продажу ТОЛЬКО для этого одного предмета.
                    if (item) openSellPage([item]);
                }
                return;
            }
            const wdBtn = e.target.closest('.inv-withdraw');
            if (wdBtn) {
                const card = wdBtn.closest('.inventory-user-card');
                if (card) {
                    const id = card.getAttribute('data-id');
                    const item = getInventory().map(enrichGift).find((g) => String(g.id) === id);
                    if (item) openWithdrawPage(item);
                }
                return;
            }
        });
    }

    // «Продать всё за X ⭐» — открывает полноэкранную продажу со всеми предметами.
    const invSellAllBtn = document.getElementById('invSellAllBtn');
    if (invSellAllBtn) {
        invSellAllBtn.addEventListener('click', () => {
            const sellable = getInventory().filter((g) => g.status !== 'pending_withdraw');
            if (sellable.length > 0) openSellPage();
        });
    }

    /* ============================================================
       ПОЛНОЭКРАННЫЕ СТРАНИЦЫ: ПРОДАЖА / ВЫВОД (Web3)
       ============================================================ */
    const sellPage = document.getElementById('sellPage');
    const withdrawPage = document.getElementById('withdrawPage');
    let sellSelectedIds = null; // Set выбранных id для продажи

    // Плавное открытие оверлея.
    function showPage(page) {
        if (!page) return;
        page.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            page.classList.add('w3-open');
        }));
        document.body.style.overflow = 'hidden';
    }

    function hidePage(page) {
        if (!page) return;
        page.classList.remove('w3-open');
        setTimeout(() => { page.hidden = true; }, 280);
        document.body.style.overflow = '';
    }

    // Отрисовка карточек выбора продажи. Принимает необязательный список
    // предметов; если не задан — берутся ВСЕ предметы инвентаря.
    function renderSellGrid(scopeItems) {
        const grid = document.getElementById('sellPageGrid');
        if (!grid) return;
        const base = scopeItems || getInventory();
        // Предметы на выводе исключаются из продажи.
        const items = base
            .filter((g) => g.status !== 'pending_withdraw')
            .map(enrichGift);
        // ID строк user_inventory из БД (для продажи/вывода через API).
        sellSelectedIds = new Set(items.map((it) => String(it.id)));

        grid.innerHTML = items.map((it) => `
            <div class="w3-sell-card" data-id="${String(it.id)}">
                <button class="w3-sell-remove" type="button" aria-label="Убрать из продажи">&minus;</button>
                <div class="w3-sell-visual">
                    ${it.image
                        ? `<img src="${safeImgSrc(it.image)}" alt="${it.name}" loading="lazy">`
                        : `<span style="font-size:28px;font-weight:800;color:#6B7380">${(it.name || '?').slice(0, 2).toUpperCase()}</span>`}
                </div>
                <span class="w3-sell-name">${it.name}</span>
                <span class="w3-sell-price">⭐ ${formatStars(it.price)}</span>
            </div>
        `).join('') || '<p class="w3-page-sub" style="grid-column:1/-1;text-align:center">Нет предметов для продажи</p>';

        updateSellSum();
        updateSellGridLayout();
    }

    // Динамическая сетка продажи: количество колонок зависит от числа карточек.
    function updateSellGridLayout() {
        const grid = document.getElementById('sellPageGrid');
        if (!grid) return;
        const count = sellSelectedIds ? sellSelectedIds.size : 0;
        grid.dataset.items = String(count);
    }

    // Пересчёт итоговой суммы выбранных предметов.
    function updateSellSum() {
        const sumEl = document.getElementById('sellConfirmSum');
        const btn = document.getElementById('sellAllConfirm');
        if (!sumEl || !sellSelectedIds) return;
        // Предметы на выводе не учитываются в сумме.
        const items = getInventory().filter((g) => g.status !== 'pending_withdraw').map(enrichGift);
        let total = 0;
        items.forEach((it) => { if (sellSelectedIds.has(String(it.id))) total += Number(it.price) || 0; });
        sumEl.textContent = formatStars(total) + ' ⭐';
        if (btn) btn.disabled = sellSelectedIds.size === 0;
    }

    // Продажа выбранных предметов: СЕРВЕР пересчитывает сумму из БД,
    // зачисляет Stars и удаляет предметы. Клиент НЕ передаёт суммы.
    async function confirmSellSelected() {
        const btn = document.getElementById('sellAllConfirm');
        if (!sellSelectedIds || sellSelectedIds.size === 0) return;
        // Защита от Double-Click / Race Condition.
        if (btn && btn.dataset.locked === '1') return;
        if (btn) { btn.dataset.locked = '1'; btn.disabled = true; btn.classList.add('w3-btn-loading'); }

        try {
            const ids = [...sellSelectedIds].map(Number).filter(Boolean);
            const data = await apiSell(ids);           // сервер: FOR UPDATE + перерасчёт суммы
            serverBalanceStars = Number(data.balance) || 0;
            loadBalance();
            renderBalance();
            await syncFromServer();                    // инвентарь/best_drops из БД
            hidePage(sellPage);
            showToast('Продано! Зачислено ' + formatStars(data.credited) + ' ⭐');
        } catch (e) {
            showToast(e.status === 409 ? 'Уже идёт другая операция, попробуйте ещё раз' : 'Ошибка продажи: ' + e.message);
            await syncFromServer().catch(() => {});
        } finally {
            // Снимаем блокировку для следующих операций.
            setTimeout(() => {
                if (btn) { btn.dataset.locked = ''; btn.classList.remove('w3-btn-loading'); }
                if (sellSelectedIds && sellSelectedIds.size > 0) { if (btn) btn.disabled = false; }
            }, 400);
        }
    }

    function openSellPage(scopeItems) {
        renderSellGrid(scopeItems);
        showPage(sellPage);
    }

    // Вывод: открыть страницу с карточкой предмета.
    let currentWithdrawItem = null;
    function openWithdrawPage(item) {
        const it = enrichGift(item);
        currentWithdrawItem = item;
        const visEl = document.getElementById('withdrawItemVisual');
        const nameEl = document.getElementById('withdrawItemName');
        const priceEl = document.getElementById('withdrawItemPrice');
        const userEl = document.getElementById('wdUsername');
        const commentEl = document.getElementById('wdComment');

        if (visEl) {
            visEl.innerHTML = it.image
                ? `<img src="${safeImgSrc(it.image)}" alt="${it.name}" loading="lazy">`
                : `<span style="font-size:44px;font-weight:800;color:#6B7380">${(it.name || '?').slice(0, 2).toUpperCase()}</span>`;
        }
        if (nameEl) nameEl.textContent = it.name;
        if (priceEl) priceEl.textContent = formatStars(it.price) + ' ⭐';
        if (userEl) userEl.value = '';
        if (commentEl) commentEl.value = '';
        // Сброс состояния валидации поля username (кнопка блокируется до ввода).
        if (wdUsernameInput) wdUsernameInput.classList.remove('w3-invalid');
        if (wdUsernameError) { wdUsernameError.textContent = ''; wdUsernameError.hidden = true; }
        if (withdrawSubmitRaw) withdrawSubmitRaw.disabled = true;
        showPage(withdrawPage);
    }

    // Назад со страницы продажи.
    const sellPageBack = document.getElementById('sellPageBack');
    if (sellPageBack) sellPageBack.addEventListener('click', () => hidePage(sellPage));

    // Назад со страницы вывода.
    const withdrawPageBack = document.getElementById('withdrawPageBack');
    if (withdrawPageBack) withdrawPageBack.addEventListener('click', () => hidePage(withdrawPage));

    // Подтвердить продажу.
    const sellAllConfirm = document.getElementById('sellAllConfirm');
    if (sellAllConfirm) sellAllConfirm.addEventListener('click', confirmSellSelected);

    // Минус «—» на карточке: убирает/возвращает предмет в выборку (один раз).
    const sellPageGridEl = document.getElementById('sellPageGrid');
    if (sellPageGridEl) {
        sellPageGridEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.w3-sell-remove');
            if (!btn) return;
            const card = btn.closest('.w3-sell-card');
            if (!card || !sellSelectedIds) return;
            const id = card.getAttribute('data-id');
            const removed = !card.classList.contains('w3-removed');
            card.classList.toggle('w3-removed', removed);
            if (removed) sellSelectedIds.delete(id); else sellSelectedIds.add(id);
            updateSellSum();
            updateSellGridLayout();
        });
    }

    // Запросить вывод — валидация username.
    const wdUsernameInput = document.getElementById('wdUsername');
    const wdUsernameError = document.getElementById('wdUsernameError');
    const withdrawSubmitRaw = document.getElementById('withdrawSubmit');

    // Запрещённые (зарезервированные) слова.
    const RESERVED = ['admin', 'telegram', 'support', 'bot', 'tg', 'root', 'system', 'moderator', 'anonymous', 'undefined', 'null'];

    // Проверка: возвращает текст ошибки или ''.
    function validateUsername(raw) {
        const value = String(raw || '').trim().replace(/^@/, '');
        if (value.length < 4 || value.length > 32) return 'Длина от 4 до 32 символов';
        if (!/^[A-Za-z0-9_]+$/.test(value)) return 'Только латиница, цифры и _';
        if (/^_/.test(value) || /_$/.test(value)) return 'Символ \'_\' не может быть в начале или конце';
        if (/__/.test(value)) return 'Нельзя использовать два \'_\' подряд';
        const lower = value.toLowerCase();
        if (RESERVED.some((w) => lower.includes(w))) return 'Этот username зарезервирован';
        return '';
    }

    // Обновляет UI валидации и блокирует кнопку при ошибке.
    function runUsernameValidation() {
        const err = validateUsername(wdUsernameInput ? wdUsernameInput.value : '');
        if (wdUsernameInput) wdUsernameInput.classList.toggle('w3-invalid', !!err);
        if (wdUsernameError) {
            wdUsernameError.textContent = err;
            wdUsernameError.hidden = !err;
        }
        if (withdrawSubmitRaw) withdrawSubmitRaw.disabled = !!err;
    }

    if (wdUsernameInput) wdUsernameInput.addEventListener('input', () => {
            // Автоматический trim пробелов и пересчёт валидации.
            if (wdUsernameInput.value !== wdUsernameInput.value.trim()) {
                wdUsernameInput.value = wdUsernameInput.value.trim();
            }
            runUsernameValidation();
        });

    if (withdrawSubmitRaw) {
        withdrawSubmitRaw.addEventListener('click', async () => {
            // Защита от Double-Click / Race Condition.
            if (withdrawSubmitRaw.disabled) return;
            withdrawSubmitRaw.disabled = true;
            withdrawSubmitRaw.classList.add('w3-btn-loading');

            runUsernameValidation();
            const err = validateUsername(wdUsernameInput ? wdUsernameInput.value : '');
            if (err) {
                withdrawSubmitRaw.disabled = false;
                withdrawSubmitRaw.classList.remove('w3-btn-loading');
                return; // ошибка — блокируем отправку
            }

            try {
                const invId = currentWithdrawItem ? (Number(itemId(currentWithdrawItem)) || null) : null;
                if (invId == null) {
                    showToast('Не выбран предмет для вывода');
                    withdrawSubmitRaw.disabled = false;
                    withdrawSubmitRaw.classList.remove('w3-btn-loading');
                    return;
                }
                // СЕРВЕР помечает предмет pending_withdraw и пишет заявку в transactions.
                await apiWithdraw(invId, wdUsernameInput.value.trim(), '');
                await syncFromServer(); // обновляем pending-статусы из БД
                currentWithdrawItem = null;

                // Уведомление о принятии заявки.
                showToast('Заявка принята! 🚀 Предмет отправлен на вывод, ожидайте обработку до 72 часов.');

                // Плавно закрываем страницу и обновляем экраны.
                hidePage(withdrawPage);
            } catch (e) {
                showToast(e.status === 409 ? 'Уже идёт другая операция, попробуйте ещё раз' : 'Ошибка вывода: ' + e.message);
            } finally {
                setTimeout(() => {
                    withdrawSubmitRaw.disabled = false;
                    withdrawSubmitRaw.classList.remove('w3-btn-loading');
                }, 400);
            }
        });
    }

    // Простое Toast-уведомление.
    function showToast(message) {
        let toast = document.getElementById('w3Toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'w3Toast';
            toast.className = 'w3-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('w3-toast-show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('w3-toast-show'), 3600);
    }

    /* ============ HISTORY FILTERS ============ */
    const historyFilters = document.querySelectorAll('.history-filter');
    const historyItems = document.querySelectorAll('.history-item');

    historyFilters.forEach((filter) => {
        filter.addEventListener('click', () => {
            historyFilters.forEach((f) => f.classList.remove('active'));
            filter.classList.add('active');

            const type = filter.dataset.filter;
            historyItems.forEach((item) => {
                const show = type === 'all' || item.dataset.type === type;
                item.classList.toggle('hidden', !show);
            });
        });
    });

    /* ============ DEPOSIT MODAL (two-step) ============ */
    const depositModal = document.getElementById('deposit-modal');
    const openDepositBtn = document.getElementById('open-deposit-btn');
    const closeDepositBtn = document.getElementById('close-modal-btn');
    const categoriesView = document.getElementById('deposit-categories');
    const starsView = document.getElementById('deposit-stars-packages');
    const selectStarsCategory = document.getElementById('select-stars-category');
    const backBtn = document.getElementById('back-btn');
    const depositModalTitle = document.getElementById('modal-title');

    // Переход к звёздам
    selectStarsCategory?.addEventListener('click', () => {
        categoriesView.classList.add('hidden');
        starsView.classList.remove('hidden');
        backBtn.classList.remove('hidden');
        depositModalTitle.textContent = 'Купить звёзды';
    });

    // Возврат к категориям
    backBtn?.addEventListener('click', () => {
        starsView.classList.add('hidden');
        categoriesView.classList.remove('hidden');
        backBtn.classList.add('hidden');
        depositModalTitle.textContent = 'Пополнение баланса';
    });

    // Сброс на первый экран при закрытии модалки
    closeDepositBtn?.addEventListener('click', () => {
        depositModal.classList.add('hidden');
        starsView.classList.add('hidden');
        categoriesView.classList.remove('hidden');
        backBtn.classList.add('hidden');
        depositModalTitle.textContent = 'Пополнение баланса';
    });

    // Открытие модалки — всегда показываем Экран 1
    openDepositBtn?.addEventListener('click', () => {
        depositModal.classList.remove('hidden');
        starsView.classList.add('hidden');
        categoriesView.classList.remove('hidden');
        backBtn.classList.add('hidden');
        depositModalTitle.textContent = 'Пополнение баланса';
    });

    // Закрытие по клику на фон
    depositModal?.addEventListener('click', (e) => {
        if (e.target === depositModal) {
            depositModal.classList.add('hidden');
            starsView.classList.add('hidden');
            categoriesView.classList.remove('hidden');
            backBtn.classList.add('hidden');
            depositModalTitle.textContent = 'Пополнение баланса';
        }
    });

    // Вызов инвойса Telegram Stars
    document.querySelectorAll('.star-card').forEach((card) => {
        card.addEventListener('click', async () => {
            const amount = card.dataset.amount;

            // Запрос к бэкенду на получение invoiceLink
            try {
                const response = await fetch('/api/create-invoice', {
                    method: 'POST',
                    headers: Object.assign(tgAuthHeader(), { 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ amount: Number(amount) })
                });
                const data = await response.json();

                if (data.invoiceLink && window.Telegram?.WebApp) {
                    window.Telegram.WebApp.openInvoice(data.invoiceLink, (status) => {
                        if (status === 'paid') {
                            depositModal.classList.add('hidden');
                            // Баланс подтверждает только сервер: подтягиваем из БД.
                            syncFromServer();
                        }
                    });
                }
            } catch (e) {
                console.error("Ошибка проведения платежа:", e);
            }
        });
    });
})();
