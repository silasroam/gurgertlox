# -*- coding: utf-8 -*-
"""
sync_nft_source.py — Часть 1/5: источник NFT.
Собирает канонический каталог NFT строго из TelegramGiftsAssests-main/:
  - изображения: TelegramGiftsAssests-main/webp/by_name/<short_name>.webp
  - цены:        floor_price_ton из Gifts_Details.json (реальные маркет-цены)
  - имена:       full_name (реальные)

Действия:
  1. Генерирует giftsData.js (1 запись/коллекция, цена в TON, путь к webp).
  2. Патчит casesData.js: каждому NFT-предмету кейса проставляет реальную
     картинку (webp), реальную цену (Stars = floor_ton*80), реальное имя.
  3. Проверяет существование ВСЕХ путей к изображениям и печатает отчёт.
"""
import json, os, re, sys

REPO = 'TelegramGiftsAssests-main'
DETAILS = os.path.join(REPO, 'Gifts_Details.json')
WEBP_DIR = os.path.join(REPO, 'webp', 'by_name')
TON_TO_STARS = 80.0

PREFIX_TO_SHORT = {
 'artisan_bricks':'artisan_brick','astral_shards':'astral_shard','b_day_candles':'bday_candle',
 'bonded_rings':'bonded_ring','candy_canes':'candy_cane','chill_flames':'chill_flame',
 'cookie_hearts':'cookie_heart','crystal_balls':'crystal_ball','cupid_charms':'cupid_charm',
 'diamond_rings':'diamond_ring','durov_s_caps':'durovs_cap','durovs_caps':'durovs_cap',
 'easter_eggs':'easter_egg','electric_skulls':'electric_skull','eternal_candles':'eternal_candle',
 'evil_eyes':'evil_eye','flying_brooms':'flying_broom','gem_signets':'gem_signet',
 'genie_lamps':'genie_lamp','heart_lockets':'heart_locket','heroic_helmets':'heroic_helmet',
 'hex_potions':'hex_pot','hex_pots':'hex_pot','ice_creams':'ice_cream','ion_gems':'ion_gem',
 'jelly_bunnies':'jelly_bunny','jingle_bells':'jingle_bells','jolly_chimps':'jolly_chimp',
 'light_swords':'light_sword','loot_bags':'loot_bag','love_candles':'love_candle',
 'low_riders':'low_rider','mad_pumpkins':'mad_pumpkin','magic_potions':'magic_potion',
 'mighty_arms':'mighty_arm','mini_oscars':'mini_oscar','nail_bracelets':'nail_bracelet',
 'neko_helmets':'neko_helmet','perfume_bottles':'perfume_bottle','plush_pepes':'plush_pepe',
 'pool_floats':'pool_float','precious_peaches':'precious_peach','santa_hats':'santa_hat',
 'scared_cats':'scared_cat','sharp_tongues':'sharp_tongue','skull_flowers':'skull_flower',
 'sleig_set':'sleigh_bell','sleigh_bells':'sleigh_bell','snoop_cigars':'snoop_cigar',
 'snoop_doggs':'snoop_dogg','spring_baskets':'spring_basket','swag_bags':'swag_bag',
 'swiss_watches':'swiss_watch','top_hats':'top_hat','trapped_hearts':'trapped_heart',
 'valentine_boxes':'valentine_box','vintage_cigars':'vintage_cigar','voodoo_dolls':'voodoo_doll',
 'westside_signs':'westside_sign','witch_hats':'witch_hat',
}


def load_source():
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
        cats[sn] = {'short_name': sn, 'name': g.get('full_name', sn),
                    'price_ton': round(float(fp), 2), 'image': img}
    return cats


def webp_exists(sn):
    return os.path.exists(os.path.join(WEBP_DIR, sn + '.webp'))


def write_gifts_data(cats, ordered):
    lines = []
    lines.append('// Auto-generated from TelegramGiftsAssests-main (Gifts_Details.json + webp/by_name).')
    lines.append('// Реальные цены: floor_price_ton (TON). Пути — к реальным webp. НЕ править руками.')
    lines.append('export const giftsData = [')
    for sn in ordered:
        c = cats[sn]
        price = c['price_ton']
        ps = str(int(price)) if price == int(price) else str(price)
        lines.append("  { id: '%s', name: %s, price: %s, currency: 'TON', image: '%s' }," % (
            sn, json.dumps(c['name'], ensure_ascii=False), ps, c['image']))
    lines.append('];')
    lines.append('')
    lines.append('export const giftsCount = %d;' % len(ordered))
    old = open('giftsData.js', encoding='utf-8-sig').read()
    m = re.search(r'(export const standardGifts = \[.*?\];)', old, re.S)
    if m:
        lines.append('')
        lines.append('')
        lines.append(m.group(1))
        lines.append('')
    open('giftsData.js', 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print('WROTE giftsData.js: %d NFT (real TON prices, webp images)' % len(ordered))


def patch_cases(cats):
    data = open('casesData.js', encoding='utf-8').read()
    start = data.index('export const cases = ') + len('export const cases = ')
    end = data.rindex('];') + 1
    cases = json.loads(data[start:end])

    unmapped = []
    missing_imgs = []
    patched = 0
    for c in cases:
        for it in c['items']:
            gid = it.get('id', '')
            if '__' not in gid:
                continue
            prefix = gid.split('__')[0]
            sn = PREFIX_TO_SHORT.get(prefix)
            if sn is None:
                unmapped.append(prefix)
                continue
            cat = cats.get(sn)
            if cat is None:
                unmapped.append(prefix)
                continue
            if not webp_exists(sn):
                missing_imgs.append(sn)
            it['name'] = cat['name']
            it['value'] = round(cat['price_ton'] * TON_TO_STARS)
            it['image'] = cat['image']
            patched += 1

    target = data[:start] + json.dumps(cases, ensure_ascii=False, indent=2) + data[end:]
    open('casesData.js', 'w', encoding='utf-8', newline='\n').write(target)
    print('PATCHED casesData.js: %d NFT items' % patched)
    print('UNMAPPED prefixes (no real source):', sorted(set(unmapped)))
    if missing_imgs:
        print('MISSING webp images:', sorted(set(missing_imgs)))
    return verify_all_paths()


def verify_all_paths():
    data = open('casesData.js', encoding='utf-8').read()
    start = data.index('export const cases = ') + len('export const cases = ')
    end = data.rindex('];') + 1
    cases = json.loads(data[start:end])
    bad = []
    seen = set()
    for c in cases:
        for it in c['items']:
            img = it.get('image', '')
            if img and img not in seen:
                seen.add(img)
                if not os.path.exists(img):
                    bad.append(img)
    print('VERIFY: unique image paths in cases =', len(seen))
    print('VERIFY: missing paths =', bad if bad else 'NONE — all OK')
    return (not bad)


def main():
    cats = load_source()
    ordered = sorted(cats.keys())
    print('source catalog: %d NFTs' % len(ordered))
    miss = [sn for sn in ordered if not webp_exists(sn)]
    print('missing webp in catalog:', miss if miss else 'none')
    write_gifts_data(cats, ordered)
    ok = patch_cases(cats)
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()