// renderGifts.js — динамический рендер карточек подарков из giftsData.js
// Использование (ES-модуль):
//   <script type="module">
//     import { renderGiftsGrid } from './renderGifts.js';
//     renderGiftsGrid('gifts-grid');
//   </script>
//
// ВАЛЮТА: базовые цены в giftsData.js заданы в TON (напр. 61.90 TON).
//   * Главная цена на карточке — в исходной валюте предмета (TON).
//   * Подпись снизу — эквивалент в Telegram Stars (XTR): 1 TON = 160 ⭐.
import { giftsData } from './giftsData.js';

// Фиксированный курс: 1 TON = 160 Telegram Stars (XTR).
const STARS_PER_TON = 160;

// Переводит тон (base) в Telegram Stars: stars = ton * 160.
function tonToStars(tonAmount) {
    return (Number(tonAmount) || 0) * STARS_PER_TON;
}

// Число с разделителями тысяч (ru-RU) и дробной частью.
function fmtNum(value, digits) {
    const d = (digits === undefined || digits === null) ? 2 : digits;
    return (Number(value) || 0).toLocaleString('ru-RU', {
        minimumFractionDigits: d,
        maximumFractionDigits: d
    });
}

// Инжект стилей один раз при первом рендере.
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
.gifts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    padding: 16px;
}
.gift-card {
    background: #12141d;
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(255,255,255,0.06);
    transition: transform .15s ease, border-color .15s ease;
    cursor: pointer;
}
.gift-card:hover { transform: translateY(-3px); border-color: rgba(22,131,255,.5); }
.gift-card-img {
    width: 100%;
    aspect-ratio: 1 / 1;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
.gift-card-img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 8px;
    display: block;
}
.gift-card-body {
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
}
.gift-name {
    font-size: 12px;
    font-weight: 700;
    color: #EAF6FF;
    text-align: center;
    line-height: 1.2;
    min-height: 30px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.gift-price {
    font-size: 14px;
    font-weight: 800;
    color: #1683FF;
}
.gift-cur {
    font-size: 10px;
    font-weight: 700;
    color: #8D96A3;
    margin-left: 2px;
}
.gift-price-sub {
    font-size: 10px;
    font-weight: 700;
    color: #FFD54F;
    opacity: .95;
    letter-spacing: .2px;
}
.gifts-empty {
    color: #8D96A3;
    font-size: 14px;
    text-align: center;
    padding: 30px 10px;
}
`;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
}

// Отдаёт безопасный src (кодирует пробелы, убирает кавычки).
function safeSrc(path) {
    return path.replace(/"/g, '%22').replace(/ /g, '%20');
}

/**
 * Рендерит все подарки из giftsData в контейнер.
 * @param {HTMLElement|string} container - элемент или его id.
 * @param {object} [options]
 * @param {(gift)=>boolean} [options.filter] - функция фильтрации.
 * @param {(gift)=>string} [options.title]   - кастомный заголовок карточки.
 * @returns {number} количество отрисованных карточек.
 */
export function renderGiftsGrid(container, options = {}) {
    injectStyles();
    const root = typeof container === 'string'
        ? document.getElementById(container)
        : container;
    if (!root) return 0;

    const filter = options.filter || (() => true);
    const title = options.title || ((g) => g.name);
    const items = giftsData.filter(filter);

    if (!items.length) {
        root.classList.add('gifts-grid');
        root.innerHTML = '<div class="gifts-empty">Нет доступных подарков.</div>';
        return 0;
    }

    root.classList.add('gifts-grid');
    root.innerHTML = items.map((gift) => `
        <div class="gift-card" data-id="${gift.id}">
            <div class="gift-card-img">
                <img src="${safeSrc(gift.image)}" alt="${title(gift)}" loading="lazy">
            </div>
            <div class="gift-card-body">
                <span class="gift-name">${title(gift)}</span>
                <span class="gift-price">${fmtNum(gift.price)}<span class="gift-cur">${gift.currency || 'TON'}</span></span>
                <span class="gift-price-sub">≈ ${fmtNum(tonToStars(gift.price), 0)} ⭐</span>
            </div>
        </div>
    `).join('');

    return items.length;
}

export { giftsData };
