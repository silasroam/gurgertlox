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
        const profileAvatar = document.querySelector('.tg-avatar.profile-avatar');
        if (profileAvatar) {
            profileAvatar.textContent = firstLetter;
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
    // Единственный источник правды — число rawBalanceTon (в TON).
    // Никогда НЕ парсим оформленный текст из DOM (там пробелы и запятая —
    // parseFloat резал бы число и каждое перерисовывание «распухало» баланс).
    // Значение хранится в localStorage как число и форматируется только при выводе.
    const BALANCE_KEY = 'casino_balance_ton';
    const DEFAULT_BALANCE_TON = 100; // 100 TON = 16 000 Stars

    let rawBalanceTon = DEFAULT_BALANCE_TON;

    function loadBalance() {
        try {
            const stored = localStorage.getItem(BALANCE_KEY);
            const v = stored === null ? NaN : parseFloat(stored);
            rawBalanceTon = Number.isFinite(v) && v >= 0 ? v : DEFAULT_BALANCE_TON;
        } catch (e) {
            rawBalanceTon = DEFAULT_BALANCE_TON;
        }
    }

    function saveBalance() {
        try {
            localStorage.setItem(BALANCE_KEY, String(rawBalanceTon));
        } catch (e) { /* ignore */ }
    }

    // Читает баланс из хранилища (метод оставлен для обратной совместимости вызовов).
    function readRawBalance() {
        loadBalance();
    }

    // Отрисовка баланса (в шапке и профиле). Баланс всегда в Telegram Stars.
    function renderBalance() {
        const header = document.getElementById('headerBalanceAmount');
        const profile = document.getElementById('profileBalanceAmount');
        const emoji = document.getElementById('balanceEmoji');

        // Показываем баланс СТРОГО в Stars: stars = ton * 80, целым числом (напр. 7 840 ⭐).
        const stars = CURR.tonToStars(rawBalanceTon);
        const displayVal = Math.round(stars).toLocaleString('ru-RU', { maximumFractionDigits: 0 });

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
        return `<span class="cur-price cur-price-stars">${stars} ★</span>`;
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
                else if (label === 'Фри награда') showScreen('free');
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

    /* ============ FREE REWARD TIMER ============ */
    const FREE_DURATION = 24 * 60 * 60; // 24 часа в секундах
    const freeClaimBtn = document.getElementById('freeClaimBtn');

    // Сохраняем время последнего получения в localStorage
    const FREE_KEY = 'casino_free_reward_time';
    let freeRemaining = 0;

    const lastClaim = parseInt(localStorage.getItem(FREE_KEY) || '0', 10);
    if (lastClaim) {
        const elapsed = Math.floor((Date.now() - lastClaim) / 1000);
        freeRemaining = Math.max(0, FREE_DURATION - elapsed);
    }

    function pad(n) {
        return String(n).padStart(2, '0');
    }

    function updateFreeTimer() {
        if (freeRemaining <= 0) {
            // Таймер завершён или не запускался - кнопка активна
            freeClaimBtn.disabled = false;
            freeClaimBtn.textContent = 'ОТКРЫТЬ КЕЙС';
            return;
        }

        // Таймер идёт - кнопка заблокирована с отображением времени
        const h = Math.floor(freeRemaining / 3600);
        const m = Math.floor((freeRemaining % 3600) / 60);
        const s = freeRemaining % 60;

        freeClaimBtn.disabled = true;
        freeClaimBtn.textContent = `ДОСТУПНО ЧЕРЕЗ ${pad(h)}:${pad(m)}:${pad(s)}`;

        freeRemaining--;
    }

    // Забираем Free Case
    freeClaimBtn.addEventListener('click', () => {
        if (freeRemaining > 0) return;

        localStorage.setItem(FREE_KEY, String(Date.now()));
        freeRemaining = FREE_DURATION;
        freeClaimBtn.disabled = true;
        updateFreeTimer();
    });

    updateFreeTimer();
    setInterval(updateFreeTimer, 1000);

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
        const CARD_W = 80;             // ширина карточки px
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

    // Открыть кейс (демо)
    caseDetailOpenBtn.addEventListener('click', () => {
        const costTon = CURR.starsToTon(caseDetailBasePrice * caseDetailMult); // Stars -> TON
        readRawBalance();
        if (rawBalanceTon >= costTon) {
            rawBalanceTon -= costTon;
            renderBalance();
            spinRoulette();
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
    const CARD_WIDTH_PX = 120;         // px — ширина карточки (.roulette-item) — синхронизировано с CSS 120px
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

    function spinRoulette(durationMs = SPIN_DURATION_MS, easing = SPIN_EASING) {
        if (caseDetailOpenBtn.disabled) return;

        // Disable button during spin
        caseDetailOpenBtn.disabled = true;

        const strip = caseDetailRouletteStrip;

        // --- Stop idle CSS scroll animation ---
        strip.style.animation = 'none';

        // --- Spin Track Generator: ровно 60 карточек, сплошная лента без пустот ---
        // Выигрышный предмет выбирается по взвешенному дропу (дорогие — реже),
        // а затем ПОДСТАВЛЯЕТСЯ в позицию остановки ленты (STOP_INDEX),
        // чтобы стрелка визуально указывала ровно на выигравший предмет.
        const allItems = getCaseItems();
        // Реальный выигрыш определяется СТАРОЙ логикой (взвешенный дроп) — НЕ трогаем.
        const winningItem = weightedPick(allItems);
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

    function creditBalance(amount) {
        readRawBalance();
        rawBalanceTon += Number(amount) || 0;
        renderBalance();
    }

    function addItemToInventory(item) {
        const grid = document.querySelector('.inventory-grid');
        if (!grid) return;

        const visualContent = item.image
            ? `<img src="${safeImgSrc(item.image)}" alt="${item.name}" class="inventory-img">`
            : `<div class="nft-art">${itemMonogram(item)}</div>`;

        const card = document.createElement('div');
        card.className = 'inventory-card';
        card.innerHTML = `
            <div class="inventory-visual">
                ${visualContent}
            </div>
            <div class="inventory-info">
                <span class="inventory-name">${item.name}</span>
                <span class="inventory-price">
                    ${priceHTML(item.price)}
                </span>
            </div>`;
        grid.prepend(card);

        // Пересчёт счётчика «N предмета/предметов»
        const counter = document.querySelector('.inventory-count');
        if (counter) {
            const match = counter.textContent.match(/\d+/);
            const n = (match ? parseInt(match[0], 10) : 0) + 1;
            const mod10 = n % 10;
            const mod100 = n % 100;
            let word = 'предметов';
            if (mod10 === 1 && mod100 !== 11) word = 'предмет';
            else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'предмета';
            counter.textContent = `${n} ${word}`;
        }
    }

    function showWinOverlay(item) {
        const color = rarityColor(item.rarity);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            /* Глухой тёмный фон: полностью перекрывает интерфейс за модалкой */
            background: #0a0a0c;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        overlay.innerHTML = `
            <div style="
                display: flex; flex-direction: column; align-items: center; text-align: center;
                padding: 24px; max-width: 320px; width: 88%;
                transform: scale(0.8); opacity: 0;
                transition: transform 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.2), opacity 0.35s ease;
            ">
                <div style="font-size: 20px; font-weight: 800; color: #EAF6FF; margin-bottom: 16px;">${item.name}</div>
                <div style="position: relative; width: 200px; height: 200px; margin-bottom: 26px;">
                    <div style="position: absolute; inset: -10px; border-radius: 24px;
                        background: radial-gradient(closest-side, ${color}88 0%, transparent 76%);
                        filter: blur(16px);"></div>
                    ${item.image
                        ? `<img src="${safeImgSrc(item.image)}" alt="${item.name}" draggable="false"
                            onerror="this.onerror=null;this.src='image/star.png'"
                            style="position: relative; display: block; width: 100%; height: 100%;
                                object-fit: contain; padding: 10px; background: #0d1220; border-radius: 16px;
                                border: 1px solid ${color}55;
                                box-shadow: 0 0 70px ${color}66, 0 0 24px ${color}44;"/>`
                        : `<img src="https://placehold.co/200x200/131c30/${color.slice(1)}?text=${encodeURIComponent(item.name)}"
                            alt="${item.name}" draggable="false"
                            style="position: relative; display: block; width: 100%; height: 100%;
                                object-fit: cover; border-radius: 16px;
                                border: 1px solid ${color}55;
                                box-shadow: 0 0 70px ${color}66, 0 0 24px ${color}44;"/>`}
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
                    <button data-act="keep" class="btn-open-main" style="
                        width: 100%; height: 48px; margin-bottom: 0; font-size: 15px;">Забрать</button>
                    <button data-act="sell" class="btn-open-fast" style="
                        width: 100%; height: 44px; font-size: 14px;">Продать за ${(Number(item.price)||0).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ⭐</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);

        // Плавное появление: подложка fade-in + карточка scale 0.8 → 1.0
        requestAnimationFrame(() => requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            const panel = overlay.firstElementChild;
            panel.style.transform = 'scale(1)';
            panel.style.opacity = '1';
        }));

        const close = () => {
            overlay.style.opacity = '0';
            const panel = overlay.firstElementChild;
            panel.style.transform = 'scale(0.85)';
            panel.style.opacity = '0';
            setTimeout(() => {
                overlay.remove();
                // После закрытия окна выигрыша лента снова начинает крутиться в idle/AFK режиме
                resumeIdleScroll();
            }, 320);
        };

        overlay.querySelector('[data-act="keep"]').addEventListener('click', () => {
            addItemToInventory(item);
            close();
        });
        overlay.querySelector('[data-act="sell"]').addEventListener('click', () => {
            creditBalance(CURR.starsToTon(item.price));  // предмет в Stars -> баланс в TON
            close();
        });
    }

    // Быстрое открытие (демо)
    caseDetailQuickBtn.addEventListener('click', () => {
        const costTon = CURR.starsToTon(caseDetailBasePrice * caseDetailMult); // Stars -> TON
        readRawBalance();
        if (rawBalanceTon >= costTon) {
            rawBalanceTon -= costTon;
            renderBalance();
            spinRoulette(QUICK_SPIN_DURATION_MS, QUICK_SPIN_EASING);
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

    // Данные предметов инвентаря: цена продажи
    const INVENTORY_ITEMS = {
        'NFT Bear': { icon: '🐻', sellPrice: 15 },
        'NFT Cake': { icon: '🎂', sellPrice: 12 },
    };

    let currentSellCard = null;
    let currentSellItem = null;

    function openSellModal(card) {
        const nameEl = card.querySelector('.inventory-name');
        const name = nameEl ? nameEl.textContent : '';
        const item = INVENTORY_ITEMS[name];
        if (!item) return;

        currentSellCard = card;
        currentSellItem = item;

        sellVisual.textContent = item.icon;
        sellItemName.textContent = name;
        sellPriceAmount.textContent = item.sellPrice;

        sellModal.hidden = false;
    }

    function closeSellModal() {
        sellModal.hidden = true;
        currentSellCard = null;
        currentSellItem = null;
    }

    // Клик по кнопке Sell в карточке инвентаря
    document.querySelectorAll('.inventory-card').forEach((card) => {
        const sellBtn = card.querySelector('.inv-sell');
        if (sellBtn) {
            sellBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openSellModal(card);
            });
        }
    });

    // Подтверждение продажи
    sellConfirm.addEventListener('click', () => {
        if (!currentSellCard || !currentSellItem) return;

        // Добавляем стоимость к Casino Balance (шапка и профиль) в активной валюте
        creditBalance(currentSellItem.sellPrice);

        // Удаляем карточку из инвентаря
        currentSellCard.remove();

        // Обновляем счётчик предметов
        const countEl = document.querySelector('.inventory-count');
        const remaining = document.querySelectorAll('.inventory-card').length;
        if (countEl) {
            const word = remaining === 1 ? 'предмет' : (remaining >= 2 && remaining <= 4 ? 'предмета' : 'предметов');
            countEl.textContent = remaining + ' ' + word;
        }

        closeSellModal();
    });

    sellModalClose.addEventListener('click', closeSellModal);

    sellModal.addEventListener('click', (e) => {
        if (e.target === sellModal) {
            closeSellModal();
        }
    });

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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: Number(amount) })
                });
                const data = await response.json();

                if (data.invoiceLink && window.Telegram?.WebApp) {
                    window.Telegram.WebApp.openInvoice(data.invoiceLink, (status) => {
                        if (status === 'paid') {
                            depositModal.classList.add('hidden');
                            // Обновить баланс пользователя в активной валюте
                            creditBalance(Number(amount));
                        }
                    });
                }
            } catch (e) {
                console.error("Ошибка проведения платежа:", e);
            }
        });
    });
})();
