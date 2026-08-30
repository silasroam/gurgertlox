# -*- coding: utf-8 -*-
"""
rebuild_cases.py — Часть 2/5: пересборка состава кейсов.
Правила:
  - только реальные NFT из TelegramGiftsAssests-main/ (цена из Gifts_Details.json);
  - min_value = 0.5 * price кейса;
  - max   = price*20   (price < 999)
          = price*50   (999 <= price < 3999)
          = price*150  (price >= 3999);
  - всё вне диапазона выкидывается из конкретного кейса;
  - цены NFT не меняются, выдуманные NFT не добавляются (jing_decor удаляется);
  - по возможности 40-60 уникальных NFT на кейс (меньше — только существующие);
  - веса равномерные (сумма = 1_000_000).
"""
import json, os, re, sys

REPO = 'TelegramGiftsAssests-main'
DETAILS = os.path.join(REPO, 'Gifts_Details.json')
WEBP_DIR = os.path.join(REPO, 'webp', 'by_name')
SCALE = 1_000_000
TON_TO_STARS = 80.0


def max_mult(price):
    if price < 999:
        return 20
    if price < 3999:
        return 50
    return 150


def load_catalog():
    d = json.load(open(DETAILS, encoding='utf-8'))
    cats = {}
    for g in d['upgraded']:
        sn = g['short_name']
        fp = g.get('floor_price_ton')
        if fp is None:
            fp = g.get('portal_price_ton') or g.get('tgmrkt_price_ton')
        if fp is None:
            continue
        img = os.path.join('TelegramGiftsAssests-main', 'webp/by_name', sn + '.webp').replace('\\', '/')
        cats[sn] = {
            'id': sn,
            'name': g.get('full_name', sn),
            'value': round(float(fp) * TON_TO_STARS),
            'image': img,
        }
    return cats


def read_cases(fn):
    s = open(fn, encoding='utf-8').read()
    start = s.index('export const cases = ') + len('export const cases = ')
    end = s.rindex('];') + 1
    return s, start, end, json.loads(s[start:end])


def build_items(catalog, price):
    mn = price * 0.5
    mx = price * max_mult(price)
    band = sorted(
        (it for it in catalog.values() if mn <= it['value'] <= mx),
        key=lambda it: it['value'],
    )
    n = len(band)
    if n > 60:
        band = band[:60]  # оставляем 60 самых дешёвых из диапазона
        n = 60
    w = SCALE // n if n else 0
    last_w = SCALE - w * n
    items = []
    for k, it in enumerate(band):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            'id': it['id'],
            'type': 'gift',
            'value': it['value'],
            'weight': wi,
            'drop_chance_percent': round(wi / SCALE * 100, 4),
            'name': it['name'],
            'image': it['image'],
        })
    # дорогие сверху
    items.sort(key=lambda x: x['value'], reverse=True)
    return items, mn, mx, n


def main():
    catalog = load_catalog()
    s, start, end, cases = read_cases('casesData.js')
    out_cases = []
    report = []
    for c in cases:
        price = int(c['price'])
        items, mn, mx, n = build_items(catalog, price)
        nft_missing = [it['id'] for it in items if not os.path.exists(it['image'])]
        c['items'] = items
        ev = sum(i['value'] * i['weight'] for i in items) / SCALE if items else 0
        rtp = ev / price * 100 if price else 0
        c['target_ev'] = round(price * 0.85, 2)
        c['calculated_ev'] = round(ev, 4)
        c['rtp_percent'] = round(rtp, 4)
        c['jackpot_multiplier'] = round(price * 0.85 / price, 2) if price else 0
        out_cases.append(c)
        report.append((c['id'], price, n, mn, mx, nft_missing, round(rtp, 2)))
        print('%-16s price=%5d items=%3d band=[%8.1f..%d] rtp=%5.2f%% missing=%s' % (
            c['id'], price, n, mn, mx, rtp, nft_missing or '-'))

    # проверить отсутствие jing_decor и выдуманных
    used_ids = {it['id'] for c in out_cases for it in c['items']}
    fake = [i for i in used_ids if i not in catalog]
    print('\nused NFT ids:', len(used_ids), '| fake/unknown ids:', fake if fake else 'NONE')

    target = s[:start] + json.dumps(out_cases, ensure_ascii=False, indent=2) + s[end:]
    open('casesData.js', 'w', encoding='utf-8', newline='\n').write(target)
    print('WROTE casesData.js')
    return 0


if __name__ == '__main__':
    sys.exit(main())