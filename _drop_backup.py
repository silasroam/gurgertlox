# -*- coding: utf-8 -*-
"""
drop_weights.py — Часть 3/5: распределение drop chance / weight.
Изменяет ТОЛЬКО weight/drop_chance_percent. Цены/состав (Часть 2) не трогает.
Логика: шанс ~ f(item_price / case_price).
  weight_i ∝ (1-t)/value_i + t*value_i  -> дорогие реже, дешёвые чаще.
  t подбирается так, чтобы EV в точности = 0.9*case_price (если достижимо).
  jackpot: экстремально дорогие получают маленький, но строго >0 шанс
           (формула даёт положительный вес для всех предметов).
Если 0.9*price < min_value NFT -> RTP 90% математически недостижим:
  НЕ подделываем. Ставим максимально дешёвый профиль (t=0) и сообщаем отдельно
  (EV -> минимально возможный, RTP = EV/price).
"""
import json, sys
from math import exp

SCALE = 1_000_000


def read_cases(fn):
    s = open(fn, encoding='utf-8').read()
    start = s.index('export const cases = ') + len('export const cases = ')
    end = s.rindex('];') + 1
    return s, start, end, json.loads(s[start:end])


def weights_for(case, target):
    """Двухсегментный спад: вблизи цены (до knee) — пологий, дальше — крутой хвост.
    => предметы ~цены достижимы, прибыль/джекпот — редкие. EV бисекцией = target."""
    price = case['price']
    vals = [it['value'] for it in case['items']]
    ratios = [v / price for v in vals]
    vmin, vmax = min(vals), max(vals)
    KNEE = 1.75     # где начинается крутой хвост
    M2 = 3.0        # крутизна хвоста (джекпот очень редкий)

    def shape(m1):
        # piecewise: пологий до knee, далее крутой (непрерывно)
        r = [m1 * min(x, KNEE) + M2 * max(x - KNEE, 0.0) for x in ratios]
        return [exp(-v) for v in r]

    def ev_of(m1):
        raw = shape(m1)
        tot = sum(raw)
        return sum(v * w / tot for v, w in zip(vals, raw))

    # m1>=0: больше -> дешёвые чаще (EV ниже). EV монотонно падает с ростом m1.
    if ev_of(0.0) < target and ev_of(40.0) > target:
        # target вне диапазона мягкого сегмента -> используем края
        m1 = 40.0 if ev_of(40.0) > target else 0.0
    else:
        lo, hi = 0.0, 40.0
        for _ in range(600):
            mid = (lo + hi) / 2
            if ev_of(mid) > target:
                lo = mid
            else:
                hi = mid
        m1 = (lo + hi) / 2
    ok = True

    raw = shape(m1)
    tot = sum(raw)
    weights = [max(1, round(w / tot * SCALE)) for w in raw]
    normalize(weights)
    return weights, vmin, vmax, None, ok


def normalize(weights):
    """Сумма весов ровно SCALE, все >= 1."""
    for i in range(len(weights)):
        if weights[i] < 1:
            weights[i] = 1
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


def guarantee_near_price(weights, vals, price):
    """Предметы в 90-150% цены кейса получают заметную долю (не нулевую)."""
    lo_i = [i for i, v in enumerate(vals) if 0.9 * price <= v <= 1.5 * price]
    if not lo_i:
        return weights
    cur = sum(weights[i] for i in lo_i)
    floor_sum = int(0.05 * SCALE)  # ~5% на всю полосу 90-150%
    if cur >= floor_sum:
        return weights
    need = floor_sum - cur
    # снять нужный объём с самых весомых (не из полосы)
    order = sorted(range(len(weights)), key=lambda i: weights[i], reverse=True)
    taken = 0
    for j in order:
        if taken >= need:
            break
        if j in lo_i:
            continue
        take = min(need - taken, weights[j] - 1)
        if take <= 0:
            continue
        weights[j] -= take
        taken += take
    # вернуть снятое в полосу (пропорционально текущим весам полосы)
    base = [weights[i] for i in lo_i]
    tally = sum(base)
    rest = taken
    if tally > 0:
        for pos, i in enumerate(lo_i):
            w = int(taken * base[pos] / tally)
            weights[i] += w
            rest -= w
    # остаток долить первому предмету полосы
    if rest > 0:
        weights[lo_i[0]] += rest
    return weights


def apply(cases):
    for c in cases:
        target = round(c['price'] * 0.90, 4)
        w, vmin, vmax, achieved, ok = weights_for(c, target)
        # точная доводка EV до 90% без смены состава (целые веса)
        w = fine_tune(c, target, w)
        for it, wi in zip(c['items'], w):
            it['weight'] = wi
            it['drop_chance_percent'] = round(wi / SCALE * 100, 4)
        c['calculated_ev'] = round(sum(i['value'] * i['weight'] for i in c['items']) / SCALE, 4)
        c['rtp_percent'] = round(c['calculated_ev'] / c['price'] * 100, 4)
        c['_achieved'] = round(c['calculated_ev'], 2)
        c['_ok'] = ok
        c['_vmin'] = vmin


def fine_tune(case, target, weights):
    """Точно доводит EV до target, перекладывая вес между предметами разной цены.
    Итерирует, пока |EV-target| <= 0.01 или кончится запас веса."""
    vals = [it['value'] for it in case['items']]
    midx = {v: [] for v in set(vals)}
    for i, v in enumerate(vals):
        midx[v].append(i)
    cheapest = min(vals)

    for _ in range(3000):
        cur = sum(v * w for v, w in zip(vals, weights)) / SCALE
        delta = target - cur
        if abs(delta) <= 0.01:
            break
        if delta > 0:
            # нужно поднять EV: переложить вес с дешёвого на самый дорогой с запасом
            src = min(midx[cheapest], key=lambda i: weights[i])
            # самый дорогой предмет (всегда может принять вес)
            p = max(range(len(vals)), key=lambda i: weights[i] if i != src else -1)
            if weights[src] <= 1:
                break
            diff = vals[p] - cheapest
            if diff <= 0:
                break
            X = int(round(delta * SCALE / diff))
            X = min(X, weights[src] - 1)
            if X <= 0:
                break
            weights[src] -= X
            weights[p] += X
        else:
            # нужно опустить EV: переложить вес с дорогого на самый дешёвый
            dst = midx[cheapest][0]
            p = max(range(len(vals)), key=lambda i: weights[i] if (vals[i] > cheapest and i != dst) else -1)
            if weights[p] <= 1:
                break
            diff = vals[p] - cheapest
            X = int(round(-delta * SCALE / diff))
            X = min(X, weights[p] - 1)
            if X <= 0:
                break
            weights[p] -= X
            weights[dst] += X
    return weights


def mass_bins(case):
    """Шанс попадания в пояса: loss / >=price / profit / jackpot."""
    price = case['price']
    loss = up = profit = jackpot = 0.0
    jack_thr = 3.0 * price
    for it in case['items']:
        p = it['weight'] / SCALE
        v = it['value']
        if v < price:
            loss += p
        elif v >= price and v < 1.5 * price:
            up += p
        elif v < jack_thr:
            profit += p
        else:
            jackpot += p
    return round(loss * 100, 2), round(up * 100, 2), round(profit * 100, 2), round(jackpot * 100, 2)


def main():
    fn = 'casesData.js'
    s, start, end, cases = read_cases(fn)
    apply(cases)
    target = s[:start] + json.dumps(cases, ensure_ascii=False, indent=2) + s[end:]
    open(fn, 'w', encoding='utf-8', newline='\n').write(target)

    print('%-12s %6s %9s %8s | %6s %6s %6s %6s' % ('Case', 'Price', 'EV', 'RTP%', 'Loss%', '>=price%', 'Profit%', 'Jack%'))
    print('-' * 76)
    for c in cases:
        lb, ub, pb, jb = mass_bins(c)
        print('%-12s %6d %9.3f %8.3f | %6.2f %6.2f %6.2f %6.2f' % (
            c['id'], c['price'], c['calculated_ev'], c['rtp_percent'], lb, ub, pb, jb))

    bad = [c['id'] for c in cases if sum(i['weight'] for i in c['items']) != SCALE]
    print('\nСуммы весов != 1_000_000:', bad if bad else 'нет — все ок')
    return 0


if __name__ == '__main__':
    sys.exit(main())