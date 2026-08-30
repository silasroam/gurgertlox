# -*- coding: utf-8 -*-
"""
drop_weights.py — оптимизация распределения drop chance / weight.

Совместная оптимизация ДВУХ показателей:
  1) RTP  -> 90%      (приоритет №1)
  2) Break-even доля (item_price >= case_price) -> 45%  (цель, но НЕ жёсткий закон)

Правила:
  * вероятности зависят только от ratio = item_price / case_price;
      w(ratio) = ratio^(-alpha)  -> монотонный спад: чем дороже, тем реже;
  * BE-доля и alpha — две независимые степени свободы:
      - BE-доля нормируется на уровне кейса (сколько массы на >=price);
      - alpha распределяет вес внутри групп loss/break-even, чтобы EV -> 90% цены;
  * никаких одинаковых весов для массы предметов, никаких пиков на одном
    дорогом предмете, rarity не используется, jackpot строго > 0.

Алгоритм выбора (BE, alpha):
  * если RTP=90 достижим при BE=0.45 -> берём BE=0.45;
  * если при BE=0.45 RTP всегда >90 (например дешёвые кейсы со standard
    gifts 15/25/50/100) -> оставляем BE=0.45 (по ТЗ для таких кейсов),
    RTP получается >90 и это допустимо; выводится как отклонение;
  * если при BE=0.45 RTP всегда <90 (например почти весь состав в диапазоне
    50–90% цены кейса) -> повышаем BE до минимального значения, при котором
    RTP достигает 90% (монотонно, без пиков и без подмены состава), а
    отклонение BE показываем в таблице.
"""
import json, sys
from math import exp, log

SCALE = 1_000_000
TARGET_BE = 0.45          # желаемая доля дропов с item_price >= case_price
TARGET_RTP = 0.90
BE_MIN = 0.44             # нижняя граница поиска BE
BE_MAX = 0.80             # верхняя граница поиска BE
ALPHA_MAX = 200.0


def read_cases(fn):
    s = open(fn, encoding='utf-8').read()
    start = s.index('export const cases = ') + len('export const cases = ')
    end = s.rindex('];') + 1
    return s, start, end, json.loads(s[start:end])


def shape(r, a):
    """Монотонный степенной спад: w ∝ r^-alpha."""
    return exp(-a * log(r + 1e-12))


def groups(vals, ratios, high):
    """Индексы предметов в группах loss (<price) и break-even (>=price)."""
    lose = [i for i, h in enumerate(high) if not h]
    brek = [i for i, h in enumerate(high) if h]
    return lose, brek


def ev_for(vals, ratios, high, a, be):
    """EV при заданной BE-доле и спаде alpha внутри групп."""
    lose, brek = groups(vals, ratios, high)

    def norm(idx, alpha):
        tot = sum(shape(ratios[i], alpha) for i in idx)
        return [shape(ratios[i], alpha) / tot for i in idx] if tot else [0.0] * len(idx)

    wl = norm(lose, a)
    wb = norm(brek, a)
    ev = 0.0
    for ii, i in enumerate(lose):
        ev += vals[i] * ((1 - be) * wl[ii])
    for ii, i in enumerate(brek):
        ev += vals[i] * (be * wb[ii])
    return ev


def solve_alpha(vals, ratios, high, be, target):
    """alpha -> EV ближайший к target для данной BE-доли."""
    hi = ev_for(vals, ratios, high, 0.0, be)
    lo = ev_for(vals, ratios, high, ALPHA_MAX, be)
    if hi < target:
        return 0.0, hi, False          # выше не поднять
    if lo > target:
        return ALPHA_MAX, lo, False    # ниже не опустить
    a0, a1 = 0.0, ALPHA_MAX
    for _ in range(300):
        mid = (a0 + a1) / 2
        if ev_for(vals, ratios, high, mid, be) > target:
            a0 = mid
        else:
            a1 = mid
    a = (a0 + a1) / 2
    return a, ev_for(vals, ratios, high, a, be), True


def optimize(vals, ratios, high, target):
    """Выбор (BE, alpha) с приоритетом RTP->90, вторично BE->45."""
    a, ev, ok = solve_alpha(vals, ratios, high, TARGET_BE, target)
    if ok:
        return TARGET_BE, a, ev, 'be45'
    # RTP=90 не достижим при BE=0.45
    e_max = ev_for(vals, ratios, high, 0.0, TARGET_BE)
    if e_max > target:
        # при BE 0.45 RTP всегда выше 90 (дешёвые кейсы) — держим 45% и берём минимум RTP
        a, ev, _ = solve_alpha(vals, ratios, high, TARGET_BE, target)  # alpha=ALPHA_MAX
        return TARGET_BE, a, ev, 'be45_above'
    # при BE 0.45 RTP всегда ниже 90 — повышаем BE до минимального с RTP=90
    for i in range(int(BE_MAX * 100) - int(TARGET_BE * 100) + 1):
        be = TARGET_BE + i / 100.0
        a, ev, ok = solve_alpha(vals, ratios, high, be, target)
        if ok:
            return be, a, ev, 'raise_be'
    # не нашли в диапазоне — берём максимум BE с наименьшим отклонением RTP вниз
    best_be, best_a, best_ev = BE_MAX, ALPHA_MAX, -1e18
    for i in range(int(BE_MAX * 100) - int(TARGET_BE * 100) + 1):
        be = TARGET_BE + i / 100.0
        a, ev, _ = solve_alpha(vals, ratios, high, be, target)
        if ev > best_ev:
            best_be, best_a, best_ev = be, a, ev
    return best_be, best_a, best_ev, 'clamped'


def build_weights(vals, ratios, high, be, a):
    """Целые веса: BE-доля задана, сумма = SCALE, каждое >= 1."""
    lose, brek = groups(vals, ratios, high)

    def norm(idx, alpha):
        tot = sum(shape(ratios[i], alpha) for i in idx)
        return [shape(ratios[i], alpha) / tot for i in idx] if tot else [0.0] * len(idx)

    wl = norm(lose, a)
    wb = norm(brek, a)
    w = [0] * len(vals)
    for ii, i in enumerate(lose):
        w[i] = (1 - be) * wl[ii] * SCALE
    for ii, i in enumerate(brek):
        w[i] = be * wb[ii] * SCALE
    w = [max(1, round(x)) for x in w]
    over = sum(w) - SCALE
    if over > 0:
        order = sorted(range(len(w)), key=lambda i: w[i], reverse=True)
        for i in order:
            if over <= 0:
                break
            take = min(over, w[i] - 1)
            w[i] -= take
            over -= take
    elif over < 0:
        w[-1] += -over
    return w


def apply(cases):
    for c in cases:
        vals = [it['value'] for it in c['items']]
        ratios = [v / c['price'] for v in vals]
        high = [r >= 1.0 for r in ratios]
        target = c['price'] * TARGET_RTP
        be, a, ev, status = optimize(vals, ratios, high, target)
        w = build_weights(vals, ratios, high, be, a)

        for it, wi in zip(c['items'], w):
            it['weight'] = wi
            it['drop_chance_percent'] = round(wi / SCALE * 100, 4)
        c['calculated_ev'] = round(sum(i['value'] * i['weight'] for i in c['items']) / SCALE, 4)
        c['rtp_percent'] = round(c['calculated_ev'] / c['price'] * 100, 4)
        c['_achieved'] = round(c['calculated_ev'], 2)
        c['_alpha'] = round(a, 3)
        c['_be'] = round(be * 100, 2)
        c['_opt'] = status
        c['_vmin'] = min(vals)


def mass_bins(case):
    """Пояса в %: loss(<price) / break-even(>=price) / profit(1.5x..3x) / jackpot(>=3x)."""
    price = case['price']
    loss = near = profit = jackpot = 0.0
    for it in case['items']:
        p = it['weight'] / SCALE
        v = it['value']
        if v < price:
            loss += p
        elif v < 1.5 * price:
            near += p
        elif v < 3.0 * price:
            profit += p
        else:
            jackpot += p
    be = near + profit + jackpot
    return (round(loss * 100, 2), round(be * 100, 2),
            round(profit * 100, 2), round(jackpot * 100, 2))


def main():
    fn = 'casesData.js'
    s, start, end, cases = read_cases(fn)
    apply(cases)
    target = s[:start] + json.dumps(cases, ensure_ascii=False, indent=2) + s[end:]
    open(fn, 'w', encoding='utf-8', newline='\n').write(target)

    print('%-10s %6s %7s %6s %6s %6s %6s %8s %7s %7s %7s' % (
        'Case', 'Price', 'EV', 'Loss%', 'BE%', 'Profit%', 'Jack%', 'RTP%', 'dRTP', 'dBE', 'opt'))
    print('-' * 92)
    for c in cases:
        loss, be, profit, jackpot = mass_bins(c)
        print('%-10s %6d %7.3f %6.2f %6.2f %6.2f %6.2f %8.3f %+7.2f %+7.2f %7s' % (
            c['id'], c['price'], c['calculated_ev'], loss, be, profit, jackpot,
            c['rtp_percent'], c['rtp_percent'] - 90, be - 45, c['_opt']))

    bad = [c['id'] for c in cases if sum(i['weight'] for i in c['items']) != SCALE]
    neg = [c['id'] for c in cases if any(i['weight'] < 0 for i in c['items'])]
    zero = [c['id'] for c in cases if any(i['weight'] == 0 for i in c['items'])]
    print('\nСуммы весов != 1_000_000:', bad if bad else 'нет — все ок')
    print('Есть weight<0:', neg if neg else 'нет')
    print('Есть weight==0:', zero if zero else 'нет')
    return 0


if __name__ == '__main__':
    sys.exit(main())