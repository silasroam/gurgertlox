// giftMatcher.js — динамический подбор NFT-подарка из базы (giftsData.js) по цене.
// Курс: 1 TON = 160 Telegram Stars (XTR) — синхронизировано с currency.js.
import { giftsData } from './giftsData.js';

const TON_TO_STARS = 160;

// Нормализованная база: у каждого предмета есть цена в Stars и путь к PNG.
const DB = giftsData.map((g) => ({
    id: g.id,
    name: g.name,
    type: 'gift',
    priceInStars: Math.round(Number(g.price) * TON_TO_STARS),
    imagePath: g.image,
}));

/**
 * Находит NFT-подарок с ценой, максимально близкой к targetStars.
 * @param {number} targetStars желаемая стоимость в Telegram Stars
 * @param {{excludeIds?: string[]}} [opts] исключить уже использованные id
 * @returns {{id:string,name:string,type:'gift',value:number,image:string}|null}
 */
export function findClosestGiftByPrice(targetStars, opts = {}) {
    const exclude = new Set(opts.excludeIds || []);
    const pool = DB.filter((g) => !exclude.has(g.id));
    if (!pool.length) return null;
    const t = Number(targetStars) || 0;
    const best = pool.reduce((a, b) =>
        Math.abs(b.priceInStars - t) < Math.abs(a.priceInStars - t) ? b : a);
    return { id: best.id, name: best.name, type: 'gift', value: best.priceInStars, image: best.imagePath };
}

// Глобалы для классических скриптов (script.js и др.)
if (typeof window !== 'undefined') {
    window.findClosestGiftByPrice = findClosestGiftByPrice;
    window.GIFTS_DB = DB;
}
