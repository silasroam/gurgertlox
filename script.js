/* ============================================
   Casino Criptoporno — Telegram Mini App
   Fullscreen WebApp bootstrap + Case Roulette
   ============================================ */

(function () {
    'use strict';

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
    }

    navItems.forEach((item) => {
        item.addEventListener('click', () => {
            navItems.forEach((i) => i.classList.remove('active'));
            item.classList.add('active');

            const label = item.querySelector('span').textContent;
            if (label === 'Главная') showScreen('home');
            else if (label === 'Игры') showScreen('games');
            else if (label === 'Фри награда') showScreen('free');
            else if (label === 'Профиль') showScreen('profile');
        });
    });

    /* ============ GAMES CATALOG ============ */
    const gameCards = document.querySelectorAll('.game-card');
    const crashBack = document.getElementById('crashBack');

    gameCards.forEach((card) => {
        card.addEventListener('click', () => {
            const game = card.dataset.game;
            if (game === 'crash') {
                showScreen('crash');
            } else if (game === 'mines') {
                showScreen('mines');
            } else if (game === 'x50') {
                showScreen('x50');
            } else if (game === 'upgrader') {
                showScreen('upgrader');
            }
        });
    });

    crashBack.addEventListener('click', () => {
        showScreen('games');
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
        showScreen('games');
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
        showScreen('games');
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
        showScreen('games');
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

    crashCashout.addEventListener('click', cashOut);

    // Автозапуск при клике на экран (для демо)
    document.querySelector('.crash-screen').addEventListener('click', () => {
        if (!crashRunning) startCrash();
    });

    /* ============ FREE REWARD TIMER ============ */
    const FREE_DURATION = 24 * 60 * 60; // 24 часа в секундах
    const timerHours = document.getElementById('timerHours');
    const timerMinutes = document.getElementById('timerMinutes');
    const timerSeconds = document.getElementById('timerSeconds');
    const freeClaimBtn = document.getElementById('freeClaimBtn');

    // Сохраняем время последнего получения в localStorage
    const FREE_KEY = 'casino_free_reward_time';
    let freeRemaining = FREE_DURATION;

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
            timerHours.textContent = '00';
            timerMinutes.textContent = '00';
            timerSeconds.textContent = '00';
            freeClaimBtn.disabled = false;
            return;
        }

        const h = Math.floor(freeRemaining / 3600);
        const m = Math.floor((freeRemaining % 3600) / 60);
        const s = freeRemaining % 60;

        timerHours.textContent = pad(h);
        timerMinutes.textContent = pad(m);
        timerSeconds.textContent = pad(s);

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
    const SPIN_DURATION = 4500; // ms
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

    /* ---------- Main spin ---------- */
    function spinRoulette() {
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
            rouletteStrip.style.transition = `transform ${SPIN_DURATION}ms cubic-bezier(0.15, 0.9, 0.15, 1)`;
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

    /* ---------- Wire case cards ---------- */
    document.querySelectorAll('.case-card').forEach((card) => {
        card.addEventListener('click', () => {
            const match = card.className.match(/case-(\d+)/);
            if (match) {
                openCaseModal(parseInt(match[1], 10));
            }
        });
    });

    /* ---------- Open button ---------- */
    modalOpenBtn.addEventListener('click', () => {
        if (currentPrice !== null && !spinLock) {
            spinRoulette();
        }
    });

    /* ---------- Close modal ---------- */
    function closeCaseModal() {
        modal.hidden = true;
        spinLock = false;
        winResult.hidden = true;
        particlesBox.innerHTML = '';
    }

    modalClose.addEventListener('click', closeCaseModal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeCaseModal();
        }
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

        // Добавляем стоимость к Casino Balance (шапка и профиль)
        const balanceEls = document.querySelectorAll('.balance-amount, .profile-balance-amount span');
        balanceEls.forEach((el) => {
            const current = parseFloat(el.textContent.replace(/\s/g, '')) || 0;
            const newVal = current + currentSellItem.sellPrice;
            el.textContent = newVal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        });

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
                            // Обновить баланс пользователя
                            const balanceEls = document.querySelectorAll('.balance-amount, .profile-balance-amount span');
                            balanceEls.forEach((el) => {
                                const current = parseFloat(el.textContent.replace(/\s/g, '')) || 0;
                                const newVal = current + Number(amount);
                                el.textContent = newVal.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            });
                        }
                    });
                }
            } catch (e) {
                console.error("Ошибка проведения платежа:", e);
            }
        });
    });
})();
