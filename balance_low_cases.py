# -*- coding: utf-8 -*-
"""
balance_low_cases.py — Часть 4: дешёвые стандартные подарки для низких кейсов.
Добавляет реальные standardGifts (15/25/50/100 ⭐) в низкие кейсы (19/39/79/149)
как игровые предметы, чтобы сделать RTP ровно 90%. NFT из TelegramGiftsAssests-main
не удаляются (там, где цена подходит). Правило min NFT>=50% для малых кейсов НЕ
применяется (иначе RTP невозможен). Остальные 8 кейсов не трогает.
"""
import json, sys
from math import exp

SCALE = 1_000_000
LOW = {'case_19', 'case_49', 'case_99', 'case_199'}

STD_GIFTS = [
    ('heart_15', 'Heart', 15, 'standard-gifts/heart_15.png'),
    ('bear_15', 'Teddy Bear', 15, 'standard-gifts/bear_15.png'),
    ('gift_25', 'Gift Box', 25, 'standard-gifts/gift_25.png'),
    ('rose_25', 'Red Rose', 25, 'standard-gifts/rose_25.png'),
    ('cake_50', 'Birthday Cake', 50, 'standard-gifts/cake_50.png'),
    ('bouquet_50', 'Bouquet', 50, 'standard-gifts/bouquet_50.png'),
    ('rocket_50', 'Rocket', 50, 'standard-gifts/rocket_50.png'),
    ('champagne_50', 'Champagne', 50, 'standard-gifts/champagne_50.png'),
    ('trophy_100', 'Trophy', 100, 'standard-gifts/trophy_100.png'),
    ('ring_100', 'Diamond Ring', 100, 'standard-gifts/ring_100.png'),
    ('diamond_100', 'Diamond', 100, 'standard-gifts/diamond_100.png'),
]


def read_cases(fn):
    s = open(fn, encoding='utf-8').read()
    start = s.index('export const cases = ') + len('export const cases = ')
    end = s.rindex('];') + 1
    return s, start, end, json.loads(s[start:end])


def weights_for(case, target):
    """Веса через exp(-k*ratio), бисекцией под EV; все веса >= 1, сумма = SCALE."""
    price = case['price']
    vals = [it['value'] for it in case['items']]
    ratios = [v / price for v in vals]
    rmin = min(ratios)
    vmin, vmax = min(vals), max(vals)

    def ev_of(k):
        raw = [exp(-k * (r - rmin)) for r in ratios]
        tot = sum(raw)
        return sum(v * w / tot for v, w in zip(vals, raw))

    if target <= vmin:
        k = 200.0
    elif target >= vmax:
        k = -200.0
    else:
        lo, hi = -400.0, 400.0
        for _ in range(400):
            mid = (lo + hi) / 2
            if ev_of(mid) > target:
                lo = mid
            else:
                hi = mid
        k = (lo + hi) / 2

    raw = [exp(-k * (r - rmin)) for r in ratios]
    tot = sum(raw)
    weights = [max(1, round(w / tot * SCALE)) for w in raw]
    over = sum(weights) - SCALE
    if over > 0:
        order = sorted(range(len(weights)), key=lambda i: weights[i], reverse=True)
        for i in order:
            if over <= 0:
                break
            take = min(over, weights[i] - 1)
            weights[i] -= take
            over -= take
    elif over < 0:
        weights[len(weights) - 1] += -over
    return weights


def ev_now(case, weights):
    return sum(it['value'] * w for it, w in zip(case['items'], weights)) / SCALE


def fine_tune(case, target, weights):
    """Точно доводит EV до target, перекладывая целый вес между 15⭐ и 25⭐."""
    vals = [it['value'] for it in case['items']]
    cur = ev_now(case, weights)
    delta = target - cur
    if abs(delta) < 0.0002:
        return weights
    cheap_idx = vals.index(min(vals))          # 15⭐
    # предмет дороже с запасом веса (возьмём 25⭐/50⭐ подарок, если есть)
    p_idx = None
    for i, v in enumerate(vals):
        if v > vals[cheap_idx] and weights[i] > 1:
            p_idx = i
            break
    if p_idx is None:
        return weights
    c = vals[cheap_idx]; p = vals[p_idx]
    X = int(round(delta * SCALE / (p - c)))     # положительно: дешёвый->дорогой
    if X > 0:
        can = min(X, weights[cheap_idx] - 1, weights[p_idx] - 1)
        if can > 0:
            weights[cheap_idx] -= can
            weights[p_idx] += can
    elif X < 0:
        can = min(-X, weights[p_idx] - 1, weights[cheap_idx] - 1)
        if can > 0:
            weights[p_idx] -= can
            weights[cheap_idx] += can
    return weights


def main():
    fn = 'casesData.js'
    s, start, end, cases = read_cases(fn)
    for c in cases:
        if c['id'] not in LOW:
            continue
        existing = {it['id'] for it in c['items']}
        added = 0
        for gid, name, val, img in STD_GIFTS:
            if gid in existing:
                continue
            c['items'].append({'id': gid, 'type': 'gift', 'value': val, 'weight': 0,
                               'drop_chance_percent': 0.0, 'name': name, 'image': img})
            added += 1
        c['items'].sort(key=lambda it: it['value'], reverse=True)
        target = round(c['price'] * 0.90, 4)
        w = weights_for(c, target)
        w = fine_tune(c, target, w)
        w = fine_tune(c, target, w)  # повторно, для полной точности
        for it, wi in zip(c['items'], w):
            it['weight'] = wi
            it['drop_chance_percent'] = round(wi / SCALE * 100, 4)
        c['calculated_ev'] = round(sum(i['value'] * i['weight'] for i in c['items']) / SCALE, 4)
        c['rtp_percent'] = round(c['calculated_ev'] / c['price'] * 100, 4)
        print('%-13s price=%4d items=%3d added_std=%d EV=%8.4f RTP=%7.4f%%' % (
            c['id'], c['price'], len(c['items']), added, c['calculated_ev'], c['rtp_percent']))

    s2 = s[:start] + json.dumps(cases, ensure_ascii=False, indent=2) + s[end:]
    open(fn, 'w', encoding='utf-8', newline='\n').write(s2)
    print('WROTE casesData.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())