/* ============================================
   CURRENCY SYSTEM — Casino Criptoporno
   Фиксированный курс: 1 TON = 80 Telegram Stars (XTR)
   ============================================ */
(function () {
    'use strict';

    // ---- Фиксированный курс конвертации ----
    const TON_TO_STARS_RATE = 80;

    // ---- Конвертеры ----
    function tonToStars(tonAmount) {
        return (Number(tonAmount) || 0) * TON_TO_STARS_RATE;
    }
    function starsToTon(starsAmount) {
        return (Number(starsAmount) || 0) / TON_TO_STARS_RATE;
    }

    // ---- Форматирование чисел ----
    function formatNumber(value, digits) {
        const d = (digits === undefined || digits === null) ? 2 : digits;
        return (Number(value) || 0).toLocaleString('ru-RU', {
            minimumFractionDigits: d,
            maximumFractionDigits: d
        });
    }
    function formatStars(value) {
        return formatNumber(value, 2) + ' ⭐';
    }
    function formatTon(value) {
        return formatNumber(value, 2) + ' TON';
    }

    // ---- Валюта отображения ----
    // base:    'ton'   — исходные цены в giftsData.js заданы в TON (напр. 61.90 TON).
    // display: 'ton'   — по умолчанию показываем главной ценой TON,
    //                    а Stars (XTR) = ton * 80 — вторичной подписью.
    const state = {
        base: 'ton',   // внутренняя валюта цен/баланса — TON
        display: 'ton' // активная валюта отображения
    };

    /**
     * Переводит внутреннее «сырое» значение (в TON) в валюту отображения.
     * base='ton', display='ton'  -> value
     * base='ton', display='stars'-> value * 80
     * base='stars',display='ton' -> value / 80
     */
    function toDisplay(rawValue) {
        const v = Number(rawValue) || 0;
        if (state.base === state.display) return v;
        if (state.base === 'ton' && state.display === 'stars') return tonToStars(v);
        if (state.base === 'stars' && state.display === 'ton') return starsToTon(v);
        return v;
    }

    // Форматирует «сырое» значение в активной валюте отображения.
    function formatDisplay(rawValue, digits) {
        const d = (digits === undefined || digits === null) ? 2 : digits;
        const v = toDisplay(rawValue);
        return state.display === 'ton'
            ? formatNumber(v, d) + ' TON'
            : formatNumber(v, d) + ' ⭐';
    }

    // Символ (эмодзи) активной валюты.
    // Для TON возвращаем HTML с картинкой toncoin.svg/png вместо эмодзи.
    function displaySymbol() {
        if (state.display === 'ton') {
            return '<img src="image/toncoin.png" class="toncoin-ico" alt="TON" />';
        }
        return '⭐';
    }

    // Список слушателей смены валюты отображения.
    const listeners = [];
    function setDisplay(currency) {
        const c = String(currency || '').toLowerCase();
        if (c !== 'stars' && c !== 'ton') return;
        if (state.display === c) return;
        state.display = c;
        listeners.forEach((fn) => { try { fn(state.display); } catch (e) { /* ignore */ } });
    }
    function onDisplayChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }
    function isTonDisplay() { return state.display === 'ton'; }

    const api = {
        TON_TO_STARS_RATE,
        tonToStars,
        starsToTon,
        formatNumber,
        formatStars,
        formatTon,
        state,
        toDisplay,
        formatDisplay,
        displaySymbol,
        setDisplay,
        onDisplayChange,
        isTonDisplay
    };

    // Глобал для классических скриптов (script.js).
    if (typeof window !== 'undefined') {
        window.CURRENCY = api;
    }

    // Поддержка экспорта для ES-модулей (если понадобится импорт).
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})();