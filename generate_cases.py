# -*- coding: utf-8 -*-
"""
Casino Criptoporno — ГЕНЕРАТОР 12 КЕЙСОВ (RTP=85%, 16–22 предмета/кейс)
=======================================================================
Базовая стабильная версия (откат экспериментальной логики).

Математика:
  EV   = Σ value_i * (weight_i / 1_000_000)
  RTP  = EV / price * 100
  weight / 1_000_000 = шанс выпадения (система весов).

Сборка:
  - Джекпот (фикс. вес value);
  - Common: звёзды-пакеты + базовые гифты, малые веса;
  - Rare / Epic: предметы ~0.8-5P;
  - «Регулирующий» Common-предмет добирает остаток веса до 1 000 000,
    его цена подбирается бисекцией под EV = RTP * price EXACTLY.

Выходы: casesConfig.json + casesData.js (для фронтенда/бэкенда).
"""
import json
import os

SCALE = 1_000_000
RTP = 0.85
BISECT_ITER = 96

# ---------------------------------------------------------------------------
# ПУЛ АССЕТОВ (id = имя png-файла / номенклатура; value — номинал в Stars)
# ---------------------------------------------------------------------------
GIFTS_LOW = [  # базовые, файлы есть в standard-gifts/
    {"id": "heart_15",  "value": 15, "name": "Heart"},
    {"id": "bear_15",   "value": 15, "name": "Teddy Bear"},
    {"id": "gift_25",   "value": 25, "name": "Gift Box"},
    {"id": "rose_25",   "value": 25, "name": "Red Rose"},
    {"id": "cake_50",   "value": 50, "name": "Birthday Cake"},
    {"id": "bouquet_50","value": 50, "name": "Bouquet"},
    {"id": "rocket_50", "value": 50, "name": "Rocket"},
    {"id": "champagne_50","value": 50, "name": "Champagne"},
    {"id": "trophy_100","value": 100, "name": "Trophy"},
    {"id": "ring_100",  "value": 100, "name": "Diamond Ring"},
    {"id": "diamond_100","value": 100, "name": "Diamond"},
]

# Алиасы
BY_ID = {g["id"]: g for g in GIFTS_LOW}
H15, B15 = GIFTS_LOW[0], GIFTS_LOW[1]
G25, R25 = GIFTS_LOW[2], GIFTS_LOW[3]
C50, BQ50, R50, CH50 = GIFTS_LOW[4], GIFTS_LOW[5], GIFTS_LOW[6], GIFTS_LOW[7]
T100, RI100, D100 = GIFTS_LOW[8], GIFTS_LOW[9], GIFTS_LOW[10]


def stars(val):
    """Пакет Telegram Stars (id stars_<val>)."""
    return {"id": "stars_" + str(val), "type": "stars", "value": int(val),
            "name": str(int(val)) + " Stars"}


def nf(v):
    """Синтетический NFT-слот nf(300) -> {id:'nft_300', value:300}."""
    return {"id": "nft_" + str(int(v)), "type": "nft", "value": int(v),
            "name": "NFT #" + str(int(v))}


def ev_of(items):
    return sum(it["value"] * it["weight"] for it in items) / SCALE


def sum_weight(items):
    return sum(it["weight"] for it in items)


def calibrate(items, fix_idx, target_ev, lo, hi):
    """Бисекция value предмета items[fix_idx] так, чтобы EV == target_ev."""
    for _ in range(BISECT_ITER):
        mid = (lo + hi) / 2
        items[fix_idx]["value"] = mid
        if ev_of(items) < target_ev:
            lo = mid
        else:
            hi = mid
    items[fix_idx]["value"] = round((lo + hi) / 2, 2)
    return items[fix_idx]["value"]

# ---------------------------------------------------------------------------
# ИЗОБРАЖЕНИЕ ПРЕДМЕТА
# ---------------------------------------------------------------------------
IMG_STARS = "standard-gifts/telegram-stars.svg"


def img_for(spec):
    """Путь к картинке предмета (для casesData.js)."""
    if spec.get("type") == "stars" or spec.get("type") == "jackpot":
        return IMG_STARS
    gid = spec["id"]
    if gid in BY_ID:
        return "standard-gifts/%s.png" % gid
    return IMG_STARS  # nft -> заглушка (реальный PNG подвязывается на фронте)

# ---------------------------------------------------------------------------
# СБОРКА ОДНОГО КЕЙСА (16–22 предмета, RTP ровно 85%)
# ---------------------------------------------------------------------------
def placeholder_items(case_id, price, n=16):
    """Возвращает ровно n карточек-заглушек с равными весами.

    value подбирается так, чтобы EV == 0.85 * price (RTP ровно 85%):
      16 * (value * weight/SCALE) = 0.85 * price
    weight = SCALE // n (сумма весов = SCALE).
    """
    val = round(price * RTP, 2)          # 0.85 * price
    weight = SCALE // n                  # напр. 1_000_000 // 16 = 62 500
    items = []
    for k in range(1, n + 1):
        items.append({
            "id": "ph_%s_%d" % (case_id, k),
            "type": "gift",
            "value": val,
            "weight": weight,
            "drop_chance_percent": round(weight / SCALE * 100, 4),
            "name": "Placeholder %d" % k,
            "image": "image/star.png",
        })
    return items


def build_case(*, case_id, name, tier, price, image, jackpot_value, jackpot_weight,
               common, rare, epic):
    """Кейс с 16 карточками-заглушками (RTP ровно 85%).

    Параметры common/rare/epic/jackpot_value/jackpot_weight больше не влияют
    на состав — содержимое очищено и заменено 16 унифицированными заглушками.
    """
    target_ev = round(price * RTP, 2)
    items = placeholder_items(case_id, price, n=16)

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    return {
        "id": case_id,
        "name": name,
        "tier": tier,
        "price": price,
        "image": image,
        "target_ev": round(price * RTP, 2),
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(price * RTP / price, 2),
        "items": items,
    }

def build_gift_case_19():
    """Кейс «sumercase» (19 звёзд): первые 2 карточки — Ice Creams и Pool Floats
    (редкие дропы), остальные 14 — заглушки. Общий RTP ≈ 85%."""
    price = 19
    name = "sumercase"
    image = "image/sumercase.webp"
    target_ev = round(price * RTP, 2)   # 16.15

    # Первые 3 карты в списке содержимого кейса.
    featured = [
        {"id": "ice_creams__ice-Photoroom", "name": "Ice Creams",
         "type": "gift", "value": 227, "image": "gift image/ice-Photoroom.png"},
        {"id": "pool_floats__poo-Photoroom", "name": "Pool Floats",
         "type": "gift", "value": 302, "image": "gift image/poo-Photoroom.png"},
        {"id": "valentine_boxes__val-Photoroom", "name": "Valentine Boxes",
         "type": "gift", "value": 852, "image": "gift image/val-Photoroom.png"},
    ]
    w_feat = 3000   # шанс выпадения ~0.3% на каждый

    items = []
    feat_ev = 0
    for it in featured:
        items.append({
            "id": it["id"], "type": it["type"], "value": it["value"],
            "weight": w_feat,
            "drop_chance_percent": round(w_feat / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })
        feat_ev += it["value"] * w_feat
    feat_ev /= SCALE

    # Оставшиеся 11 карт — стандартные подарки из standard-gifts/.
    gifts = [
        {"id": "heart_15",       "name": "Heart",          "value": 15,  "image": "standard-gifts/heart_15.png"},
        {"id": "bear_15",        "name": "Teddy Bear",     "value": 15,  "image": "standard-gifts/bear_15.png"},
        {"id": "gift_25",        "name": "Gift Box",       "value": 25,  "image": "standard-gifts/gift_25.png"},
        {"id": "rose_25",        "name": "Red Rose",       "value": 25,  "image": "standard-gifts/rose_25.png"},
        {"id": "cake_50",        "name": "Birthday Cake",  "value": 50,  "image": "standard-gifts/cake_50.png"},
        {"id": "bouquet_50",     "name": "Bouquet",        "value": 50,  "image": "standard-gifts/bouquet_50.png"},
        {"id": "rocket_50",      "name": "Rocket",         "value": 50,  "image": "standard-gifts/rocket_50.png"},
        {"id": "champagne_50",   "name": "Champagne",      "value": 50,  "image": "standard-gifts/champagne_50.png"},
        {"id": "trophy_100",     "name": "Trophy",         "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "ring_100",       "name": "Diamond Ring",   "value": 100, "image": "standard-gifts/ring_100.png"},
        {"id": "diamond_100",    "name": "Diamond",        "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]
    rem_w = SCALE - w_feat * len(featured)      # 1_000_000 - 9000 = 991_000
    g_w = rem_w // len(gifts)                    # 90 090
    last_w = rem_w - g_w * len(gifts)            # хвост 99010 - ... -> 10
    for k, it in enumerate(gifts):
        w = g_w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": w,
            "drop_chance_percent": round(w / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые внизу (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_19",
        "name": name,
        "tier": "basic",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }

def build_newyear_case_39():
    """Кейс «newyearcase» за 39 ⭐: первые 5 карточек — новые новогодние
    предметы (Santa Hats, Sleigh Bells, Jingle Bells + 2 доп.), остальные —
    стандартные подарки. 16 предметов, сумма весов строго 1_000_000."""
    price = 39
    name = "newyearcase"
    image = "image/newyearcase.webp"
    target_ev = round(price * RTP, 2)   # 33.15

    # Первые 5 карточек — новогодние предметы (изображения из gift image/).
    featured = [
        {"id": "santa_hats__han-Photoroom", "name": "Santa Hats",   "value": 352,  "image": "gift image/han-Photoroom.png"},
        {"id": "sleigh_bells__gin-Photoroom","name": "Sleigh Bells", "value": 509, "image": "gift image/gin-Photoroom.png"},
        {"id": "jingle_bells__san-Photoroom","name": "Jingle Bells", "value": 639, "image": "gift image/san-Photoroom.png"},
        {"id": "sleig_set__sle-Photoroom",   "name": "Sleig Set",    "value": 600, "image": "gift image/sle-Photoroom.png"},
        {"id": "jing_decor__jin-Photoroom",  "name": "Jing Decor",   "value": 450, "image": "gift image/jin-Photoroom.png"},
    ]
    w_feat = 30000   # шанс выпадения ~3% на каждый

    items = []
    for it in featured:
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": w_feat,
            "drop_chance_percent": round(w_feat / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    # Ещё 11 карточек — стандартные подарки из standard-gifts/.
    gifts = [
        {"id": "heart_15",       "name": "Heart",          "value": 15,  "image": "standard-gifts/heart_15.png"},
        {"id": "bear_15",        "name": "Teddy Bear",     "value": 15,  "image": "standard-gifts/bear_15.png"},
        {"id": "gift_25",        "name": "Gift Box",       "value": 25,  "image": "standard-gifts/gift_25.png"},
        {"id": "rose_25",        "name": "Red Rose",       "value": 25,  "image": "standard-gifts/rose_25.png"},
        {"id": "cake_50",        "name": "Birthday Cake",  "value": 50,  "image": "standard-gifts/cake_50.png"},
        {"id": "bouquet_50",     "name": "Bouquet",        "value": 50,  "image": "standard-gifts/bouquet_50.png"},
        {"id": "rocket_50",      "name": "Rocket",         "value": 50,  "image": "standard-gifts/rocket_50.png"},
        {"id": "champagne_50",   "name": "Champagne",      "value": 50,  "image": "standard-gifts/champagne_50.png"},
        {"id": "trophy_100",     "name": "Trophy",         "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "ring_100",       "name": "Diamond Ring",   "value": 100, "image": "standard-gifts/ring_100.png"},
        {"id": "diamond_100",    "name": "Diamond",        "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]
    rem_w = SCALE - w_feat * len(featured)      # 1_000_000 - 150_000 = 850_000
    g_w = rem_w // len(gifts)                    # 850_000 // 11 = 77 272
    last_w = rem_w - g_w * len(gifts)            # остаток
    for k, it in enumerate(gifts):
        w = g_w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": w,
            "drop_chance_percent": round(w / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_49",
        "name": name,
        "tier": "basic",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }

def build_toxic_case_99():
    """Кейс «toxiccase» за 79 ⭐: первые 2 карточки — Magic Potions и
    Love Candles, остальные 14 — зелёные NFT + подарки 50–100 ⭐.
    16 предметов, сумма весов строго 1_000_000."""
    price = 79
    name = "toxiccase"
    image = "image/toxiccase.webp"
    target_ev = round(price * RTP, 2)   # 67.15

    # Первые 2 карточки — новые предметы (изображения из gift image/).
    featured = [
        {"id": "magic_potions__mag-Photoroom", "name": "Magic Potions", "value": 4397, "image": "gift image/mag-Photoroom.png"},
        {"id": "love_candles__lov-Photoroom",  "name": "Love Candles",  "value": 654, "image": "gift image/lov-Photoroom.png"},
    ]
    w_feat = 30000   # шанс выпадения ~3% на каждый

    items = []
    for it in featured:
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": w_feat,
            "drop_chance_percent": round(w_feat / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    # Реальные предметы вместо NFT-заглушек (картинки из gift image/).
    nfts = [
        {"id": "hex_potions__hex-Photoroom",      "name": "Hex Potions",      "value": 333,  "image": "gift image/hex-Photoroom.png"},
        {"id": "eternal_candles__ete-Photoroom",  "name": "Eternal Candles",  "value": 456,  "image": "gift image/ete-Photoroom.png"},
        {"id": "electric_skulls__ele-Photoroom",  "name": "Electric Skulls",  "value": 1840, "image": "gift image/ele-Photoroom.png"},
        {"id": "evil_eyes__evi1-Photoroom",       "name": "Evil Eyes",        "value": 536,  "image": "gift image/evi1-Photoroom.png"},
        {"id": "cookie_hearts__coo-Photoroom",    "name": "Cookie Hearts",    "value": 367,  "image": "gift image/coo-Photoroom.png"},
        {"id": "chill_flames__chi1-Photoroom",    "name": "Chill Flames",     "value": 257,  "image": "gift image/chi1-Photoroom.png"},
        {"id": "candy_canes__can1-Photoroom",     "name": "Candy Canes",      "value": 318,  "image": "gift image/can1-Photoroom.png"},
    ]
    # Подарки 50–100 ⭐ из standard-gifts/.
    gifts = [
        {"id": "cake_50",       "name": "Birthday Cake", "value": 50,  "image": "standard-gifts/cake_50.png"},
        {"id": "bouquet_50",    "name": "Bouquet",       "value": 50,  "image": "standard-gifts/bouquet_50.png"},
        {"id": "rocket_50",     "name": "Rocket",        "value": 50,  "image": "standard-gifts/rocket_50.png"},
        {"id": "champagne_50",  "name": "Champagne",     "value": 50,  "image": "standard-gifts/champagne_50.png"},
        {"id": "trophy_100",    "name": "Trophy",        "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "ring_100",      "name": "Diamond Ring",  "value": 100, "image": "standard-gifts/ring_100.png"},
        {"id": "diamond_100",   "name": "Diamond",       "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]

    # 14 оставшихся карточек: 7 NFT + 7 подарков.
    rest = nfts + gifts
    rem_w = SCALE - w_feat * len(featured)      # 1_000_000 - 60_000 = 940_000
    g_w = rem_w // len(rest)                     # 940_000 // 14 = 67 142
    last_w = rem_w - g_w * len(rest)             # остаток
    for k, it in enumerate(rest):
        w = g_w + (last_w if k == 0 else 0)
        # NFT-предметы из списка nfts уже имеют type/value/name/imаge-заглушку
        if it.get("type") == "nft":
            items.append({
                "id": it["id"], "type": "nft", "value": it["value"],
                "weight": w,
                "drop_chance_percent": round(w / SCALE * 100, 4),
                "name": it["name"], "image": it.get("image", "image/star.png"),
            })
        else:
            items.append({
                "id": it["id"], "type": "gift", "value": it["value"],
                "weight": w,
                "drop_chance_percent": round(w / SCALE * 100, 4),
                "name": it["name"], "image": it["image"],
            })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_99",
        "name": name,
        "tier": "basic",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }

def build_ocean_case_199():
    """Кейс «oceancase» за 149 ⭐: добавить 14 предметов (wes1,wit1,vin,swa2,
    sno,nek1,low2,ice1,ete,ele,dog,cry2,chi1,bon1) + 3 классических подарка
    за 100 ⭐. Итого 17 предметов, сумма весов строго 1_000_000."""
    price = 149
    name = "oceancase"
    image = "image/oceancase.webp"
    target_ev = round(price * RTP, 2)   # 126.65

    # 14 новых предметов (изображения из gift image/), цены в Stars (TON*80).
    new_items = [
        {"id": "westside_signs__wes1-Photoroom", "name": "Westside Signs", "value": 7520, "image": "gift image/wes1-Photoroom.png"},
        {"id": "low_riders__low2-Photoroom",     "name": "Low Riders",     "value": 3632, "image": "gift image/low2-Photoroom.png"},
        {"id": "bonded_rings__bon1-Photoroom",   "name": "Bonded Rings",   "value": 3040, "image": "gift image/bon1-Photoroom.png"},
        {"id": "neko_helmets__nek1-Photoroom",   "name": "Neko Helmets",   "value": 2820, "image": "gift image/nek1-Photoroom.png"},
        {"id": "vintage_cigars__vin-Photoroom",  "name": "Vintage Cigars", "value": 2720, "image": "gift image/vin-Photoroom.png"},
        {"id": "electric_skulls__ele-Photoroom", "name": "Electric Skulls","value": 1840, "image": "gift image/ele-Photoroom.png"},
        {"id": "crystal_balls__cry2-Photoroom",  "name": "Crystal Balls",  "value": 960,  "image": "gift image/cry2-Photoroom.png"},
        {"id": "snoop_cigars__sno-Photoroom",    "name": "Snoop Cigars",   "value": 851,  "image": "gift image/sno-Photoroom.png"},
        {"id": "eternal_candles__ete-Photoroom", "name": "Eternal Candles", "value": 456, "image": "gift image/ete-Photoroom.png"},
        {"id": "swag_bags__swa2-Photoroom",      "name": "Swag Bags",      "value": 416,  "image": "gift image/swa2-Photoroom.png"},
        {"id": "snoop_doggs__dog-Photoroom",     "name": "Snoop Doggs",    "value": 336,  "image": "gift image/dog-Photoroom.png"},
        {"id": "witch_hats__wit1-Photoroom",     "name": "Witch Hats",     "value": 331,  "image": "gift image/wit1-Photoroom.png"},
        {"id": "chill_flames__chi1-Photoroom",   "name": "Chill Flames",   "value": 257,  "image": "gift image/chi1-Photoroom.png"},
        {"id": "ice_creams__ice1-Photoroom",     "name": "Ice Creams",     "value": 227,  "image": "gift image/ice1-Photoroom.png"},
    ]

    # 3 классических подарка за 100 ⭐ (реальные PNG из standard-gifts/).
    classic100 = [
        {"id": "trophy_100",    "name": "Trophy",       "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "ring_100",      "name": "Diamond Ring", "value": 100, "image": "standard-gifts/ring_100.png"},
        {"id": "diamond_100",   "name": "Diamond",      "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]

    all_items = new_items + classic100   # 14 + 3 = 17
    n = len(all_items)                    # 17
    w = SCALE // n                        # 1_000_000 // 17 = 58 823
    last_w = SCALE - w * n                # остаток
    items = []
    for k, it in enumerate(all_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_199",
        "name": name,
        "tier": "basic",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }

def build_pasha_case_399():
    """Кейс «pashacase» (пасха) за 299 ⭐: 15 новых предметов + 3 подарка
    по 100 ⭐. Итого 18 предметов, сумма весов строго 1_000_000."""
    price = 299
    name = "pashacase"
    image = "image/pashacase.webp"
    target_ev = round(price * RTP, 2)   # 254.15

    # 15 новых предметов (изображения из gift image/), цены в Stars (TON*80).
    new_items = [
        {"id": "heroic_helmets__her1-Photoroom", "name": "Heroic Helmets", "value": 13920, "image": "gift image/her1-Photoroom.png"},
        {"id": "scared_cats__sca-Photoroom",      "name": "Scared Cats",    "value": 12320, "image": "gift image/sca-Photoroom.png"},
        {"id": "loot_bags__loo1-Photoroom",       "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo1-Photoroom.png"},
        {"id": "nail_bracelets__nai1-Photoroom",  "name": "Nail Bracelets", "value": 8934,  "image": "gift image/nai1-Photoroom.png"},
        {"id": "mighty_arms__mig1-Photoroom",     "name": "Mighty Arms",    "value": 8386,  "image": "gift image/mig1-Photoroom.png"},
        {"id": "perfume_bottles__per-Photoroom",  "name": "Perfume Bottles", "value": 5146, "image": "gift image/per-Photoroom.png"},
        {"id": "swiss_watches__swi-Photoroom",    "name": "Swiss Watches",  "value": 3674,  "image": "gift image/swi-Photoroom.png"},
        {"id": "neko_helmets__nek-Photoroom",     "name": "Neko Helmets",   "value": 2820,  "image": "gift image/nek-Photoroom.png"},
        {"id": "vintage_cigars__vin-Photoroom",   "name": "Vintage Cigars", "value": 2720,  "image": "gift image/vin-Photoroom.png"},
        {"id": "trapped_hearts__tra-Photoroom",   "name": "Trapped Hearts", "value": 1191,  "image": "gift image/tra-Photoroom.png"},
        {"id": "sleig_set__sle-Photoroom",        "name": "Sleig Set",      "value": 600,   "image": "gift image/sle-Photoroom.png"},
        {"id": "jelly_bunnies__jel-Photoroom",    "name": "Jelly Bunnies",  "value": 558,   "image": "gift image/jel-Photoroom.png"},
        {"id": "spring_baskets__spr-Photoroom",   "name": "Spring Baskets", "value": 441,   "image": "gift image/spr-Photoroom.png"},
        {"id": "easter_eggs__eas1-Photoroom",     "name": "Easter Eggs",    "value": 294,   "image": "gift image/eas1-Photoroom.png"},
        {"id": "ice_creams__ice1-Photoroom",      "name": "Ice Creams",     "value": 227,   "image": "gift image/ice1-Photoroom.png"},
    ]

    # 3 классических подарка за 100 ⭐ (реальные PNG из standard-gifts/).
    classic100 = [
        {"id": "trophy_100",    "name": "Trophy",       "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "ring_100",      "name": "Diamond Ring", "value": 100, "image": "standard-gifts/ring_100.png"},
        {"id": "diamond_100",   "name": "Diamond",      "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]

    all_items = new_items + classic100   # 15 + 3 = 18
    n = len(all_items)                    # 18
    w = SCALE // n                        # 1_000_000 // 18 = 55 555
    last_w = SCALE - w * n                # остаток
    items = []
    for k, it in enumerate(all_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_399",
        "name": name,
        "tier": "medium",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_day_case_799():
    """Кейс «daycase» за 399 ⭐: 18 новых предметов (изображения из gift image/)
    + 2 классических подарка за 100 ⭐ (standard-gifts/).
    Итого 20 предметов, сумма весов строго 1_000_000."""
    price = 399
    name = "daycase"
    image = "image/daycase.webp"
    target_ev = round(price * RTP, 2)   # 339.15

    new_items = [
        {"id": "nail_bracelets__nai-Photoroom",       "name": "Nail Bracelets", "value": 8934, "image": "gift image/nai-Photoroom.png"},
        {"id": "gem_signets__gem1-Photoroom",         "name": "Gem Signets",    "value": 5023, "image": "gift image/gem1-Photoroom.png"},
        {"id": "ion_gems__ion-Photoroom",             "name": "Ion Gems",       "value": 4638, "image": "gift image/ion-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",       "name": "Magic Potions",  "value": 4397, "image": "gift image/mag1-Photoroom.png"},
        {"id": "low_riders__low-Photoroom",           "name": "Low Riders",     "value": 3632, "image": "gift image/low-Photoroom.png"},
        {"id": "sharp_tongues__sha1-Photoroom",       "name": "Sharp Tongues",  "value": 3111, "image": "gift image/sha1-Photoroom.png"},
        {"id": "neko_helmets__nek1-Photoroom",        "name": "Neko Helmets",   "value": 2820, "image": "gift image/nek1-Photoroom.png"},
        {"id": "vintage_cigars__vin-Photoroom",       "name": "Vintage Cigars", "value": 2720, "image": "gift image/vin-Photoroom.png"},
        {"id": "electric_skulls__ele-Photoroom",      "name": "Electric Skulls","value": 1840, "image": "gift image/ele-Photoroom.png"},
        {"id": "cupid_charms__cup2-Photoroom",        "name": "Cupid Charms",   "value": 1680, "image": "gift image/cup2-Photoroom.png"},
        {"id": "crystal_balls__cry-Photoroom",        "name": "Crystal Balls",  "value": 960,  "image": "gift image/cry-Photoroom.png"},
        {"id": "skull_flowers__sku-Photoroom",        "name": "Skull Flowers",  "value": 756,  "image": "gift image/sku-Photoroom.png"},
        {"id": "evil_eyes__evi1-Photoroom",           "name": "Evil Eyes",      "value": 536,  "image": "gift image/evi1-Photoroom.png"},
        {"id": "eternal_candles__ete-Photoroom",      "name": "Eternal Candles","value": 456,  "image": "gift image/ete-Photoroom.png"},
        {"id": "swag_bags__swa1-Photoroom",           "name": "Swag Bags",      "value": 416,  "image": "gift image/swa1-Photoroom.png"},
        {"id": "b_day_candles__bda2-Photoroom",       "name": "B-Day Candles",  "value": 334,  "image": "gift image/bda2-Photoroom.png"},
        {"id": "witch_hats__wit-Photoroom",           "name": "Witch Hats",     "value": 331,  "image": "gift image/wit-Photoroom.png"},
        {"id": "hex_pots__hex-Photoroom",             "name": "Hex Pots",       "value": 332,  "image": "gift image/hex-Photoroom.png"},
    ]

    # 2 классических подарка за 100 ⭐ (реальные PNG из standard-gifts/).
    classic100 = [
        {"id": "trophy_100",    "name": "Trophy",       "value": 100, "image": "standard-gifts/trophy_100.png"},
        {"id": "diamond_100",   "name": "Diamond",      "value": 100, "image": "standard-gifts/diamond_100.png"},
    ]

    all_items = new_items + classic100   # 18 + 2 = 20
    n = len(all_items)                    # 20
    w = SCALE // n                        # 1_000_000 // 20 = 50 000
    last_w = SCALE - w * n                # остаток
    items = []
    for k, it in enumerate(all_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_799",
        "name": name,
        "tier": "medium",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_halouincase_1249():
    """Кейс «halouincase» за 499 ⭐: 20 реальных предметов (изображения из gift image/).
    Итого 20 предметов, сумма весов строго 1_000_000."""
    price = 499
    name = "halouincase"
    image = "image/halouincase.webp"
    target_ev = round(price * RTP, 2)   # 424.15

    new_items = [
        {"id": "witch_hats__wit-Photoroom",      "name": "Witch Hats",     "value": 331,  "image": "gift image/wit-Photoroom.png"},
        {"id": "voodoo_dolls__voo-Photoroom",    "name": "Voodoo Dolls",   "value": 2563, "image": "gift image/voo-Photoroom.png"},
        {"id": "valentine_boxes__val-Photoroom", "name": "Valentine Boxes","value": 852,  "image": "gift image/val-Photoroom.png"},
        {"id": "top_hats__top-Photoroom",        "name": "Top Hats",       "value": 800,  "image": "gift image/top-Photoroom.png"},
        {"id": "swiss_watches__swi-Photoroom",   "name": "Swiss Watches",  "value": 3674,  "image": "gift image/swi-Photoroom.png"},
        {"id": "skull_flowers__sku-Photoroom",   "name": "Skull Flowers",  "value": 756,  "image": "gift image/sku-Photoroom.png"},
        {"id": "scared_cats__sca-Photoroom",     "name": "Scared Cats",    "value": 12320, "image": "gift image/sca-Photoroom.png"},
        {"id": "mini_oscars__min-Photoroom",     "name": "Mini Oscars",    "value": 5588,  "image": "gift image/min-Photoroom.png"},
        {"id": "mighty_arms__mig2-Photoroom",    "name": "Mighty Arms",    "value": 8386,  "image": "gift image/mig2-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",  "name": "Magic Potions",  "value": 4397,  "image": "gift image/mag1-Photoroom.png"},
        {"id": "loot_bags__loo-Photoroom",       "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo-Photoroom.png"},
        {"id": "light_swords__lig-Photoroom",    "name": "Light Swords",   "value": 466,  "image": "gift image/lig-Photoroom.png"},
        {"id": "ion_gems__ion1-Photoroom",       "name": "Ion Gems",       "value": 4638,  "image": "gift image/ion1-Photoroom.png"},
        {"id": "genie_lamps__gen-Photoroom",     "name": "Genie Lamps",    "value": 2920,  "image": "gift image/gen-Photoroom.png"},
        {"id": "gem_signets__gem1-Photoroom",    "name": "Gem Signets",    "value": 5023,  "image": "gift image/gem1-Photoroom.png"},
        {"id": "flying_brooms__fly-Photoroom",   "name": "Flying Brooms",  "value": 880,   "image": "gift image/fly-Photoroom.png"},
        {"id": "evil_eyes__evi1-Photoroom",      "name": "Evil Eyes",      "value": 536,   "image": "gift image/evi1-Photoroom.png"},
        {"id": "electric_skulls__ele-Photoroom", "name": "Electric Skulls","value": 1840,  "image": "gift image/ele-Photoroom.png"},
        {"id": "diamond_rings__dia1-Photoroom",  "name": "Diamond Rings",  "value": 2376,  "image": "gift image/dia1-Photoroom.png"},
        {"id": "cupid_charms__cup-Photoroom",    "name": "Cupid Charms",   "value": 1680,  "image": "gift image/cup-Photoroom.png"},
    ]

    n = len(new_items)                    # 20
    w = SCALE // n                        # 1_000_000 // 20 = 50 000
    last_w = SCALE - w * n                # остаток (0)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_1249",
        "name": name,
        "tier": "medium",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_lovecase_1999():
    """Кейс «lovecase» за 599 ⭐: 17 реальных предметов (изображения из gift image/).
    Итого 17 предметов, сумма весов строго 1_000_000."""
    price = 599
    name = "lovecase"
    image = "image/lovecase.webp"
    target_ev = round(price * RTP, 2)   # 509.15

    new_items = [
        {"id": "witch_hats__wit1-Photoroom",       "name": "Witch Hats",     "value": 331,  "image": "gift image/wit1-Photoroom.png"},
        {"id": "westside_signs__wes-Photoroom",    "name": "Westside Signs", "value": 7520, "image": "gift image/wes-Photoroom.png"},
        {"id": "voodoo_dolls__voo-Photoroom",      "name": "Voodoo Dolls",   "value": 2563, "image": "gift image/voo-Photoroom.png"},
        {"id": "valentine_boxes__val-Photoroom",   "name": "Valentine Boxes","value": 852,  "image": "gift image/val-Photoroom.png"},
        {"id": "top_hats__top-Photoroom",          "name": "Top Hats",       "value": 800,  "image": "gift image/top-Photoroom.png"},
        {"id": "spring_baskets__spr-Photoroom",    "name": "Spring Baskets", "value": 441,  "image": "gift image/spr-Photoroom.png"},
        {"id": "sharp_tongues__sha1-Photoroom",    "name": "Sharp Tongues",  "value": 3111,  "image": "gift image/sha1-Photoroom.png"},
        {"id": "precious_peaches__pre1-Photoroom", "name": "Precious Peaches","value": 19216,"image": "gift image/pre1-Photoroom.png"},
        {"id": "perfume_bottles__per1-Photoroom",  "name": "Perfume Bottles", "value": 5146,  "image": "gift image/per1-Photoroom.png"},
        {"id": "neko_helmets__nek-Photoroom",      "name": "Neko Helmets",   "value": 2820,  "image": "gift image/nek-Photoroom.png"},
        {"id": "nail_bracelets__nai-Photoroom",    "name": "Nail Bracelets", "value": 8934,  "image": "gift image/nai-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",    "name": "Magic Potions",  "value": 4397,  "image": "gift image/mag1-Photoroom.png"},
        {"id": "low_riders__low1-Photoroom",       "name": "Low Riders",     "value": 3632,  "image": "gift image/low1-Photoroom.png"},
        {"id": "loot_bags__loo-Photoroom",         "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo-Photoroom.png"},
        {"id": "ion_gems__ion2-Photoroom",         "name": "Ion Gems",       "value": 4638,  "image": "gift image/ion2-Photoroom.png"},
        {"id": "light_swords__lig-Photoroom",      "name": "Light Swords",   "value": 466,   "image": "gift image/lig-Photoroom.png"},
        {"id": "flying_brooms__fly-Photoroom",     "name": "Flying Brooms",  "value": 880,   "image": "gift image/fly-Photoroom.png"},
    ]

    n = len(new_items)                    # 17
    w = SCALE // n                        # 1_000_000 // 17 = 58 823
    last_w = SCALE - w * n                # остаток (9 — добавится к первой карточке)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_1999",
        "name": name,
        "tier": "medium",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_gemcase_2999():
    """Кейс «gemcase» за 999 ⭐: 19 реальных предметов (изображения из gift image/).
    Итого 19 предметов, сумма весов строго 1_000_000."""
    price = 999
    name = "gemcase"
    image = "image/gemcase.webp"
    target_ev = round(price * RTP, 2)   # 849.15

    new_items = [
        {"id": "westside_signs__wes-Photoroom",   "name": "Westside Signs", "value": 7520,  "image": "gift image/wes-Photoroom.png"},
        {"id": "voodoo_dolls__voo-Photoroom",     "name": "Voodoo Dolls",   "value": 2563,  "image": "gift image/voo-Photoroom.png"},
        {"id": "valentine_boxes__val-Photoroom",  "name": "Valentine Boxes","value": 852,   "image": "gift image/val-Photoroom.png"},
        {"id": "trapped_hearts__tra-Photoroom",   "name": "Trapped Hearts", "value": 1191,  "image": "gift image/tra-Photoroom.png"},
        {"id": "top_hats__top-Photoroom",         "name": "Top Hats",       "value": 800,   "image": "gift image/top-Photoroom.png"},
        {"id": "sharp_tongues__sha-Photoroom",    "name": "Sharp Tongues",  "value": 3111,  "image": "gift image/sha-Photoroom.png"},
        {"id": "jingle_bells__san-Photoroom",     "name": "Jingle Bells",   "value": 639,   "image": "gift image/san-Photoroom.png"},
        {"id": "mighty_arms__mig2-Photoroom",     "name": "Mighty Arms",    "value": 8386,  "image": "gift image/mig2-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",   "name": "Magic Potions",  "value": 4397,  "image": "gift image/mag1-Photoroom.png"},
        {"id": "low_riders__low1-Photoroom",      "name": "Low Riders",     "value": 3632,  "image": "gift image/low1-Photoroom.png"},
        {"id": "loot_bags__loo-Photoroom",        "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo-Photoroom.png"},
        {"id": "light_swords__lig-Photoroom",     "name": "Light Swords",   "value": 466,   "image": "gift image/lig-Photoroom.png"},
        {"id": "ion_gems__ion2-Photoroom",        "name": "Ion Gems",       "value": 4638,  "image": "gift image/ion2-Photoroom.png"},
        {"id": "artisan_bricks__art-Photoroom",   "name": "Artisan Bricks", "value": 4952,  "image": "gift image/art-Photoroom.png"},
        {"id": "astral_shards__ast3-Photoroom",   "name": "Astral Shards",  "value": 10400, "image": "gift image/ast3-Photoroom.png"},
        {"id": "b_day_candles__bda1-Photoroom",   "name": "B-Day Candles",  "value": 334,   "image": "gift image/bda1-Photoroom.png"},
        {"id": "candy_canes__can-Photoroom",      "name": "Candy Canes",    "value": 318,   "image": "gift image/can-Photoroom.png"},
        {"id": "bonded_rings__bon-Photoroom",     "name": "Bonded Rings",   "value": 3040,  "image": "gift image/bon-Photoroom.png"},
        {"id": "cupid_charms__cup-Photoroom",     "name": "Cupid Charms",   "value": 1680,  "image": "gift image/cup-Photoroom.png"},
    ]

    n = len(new_items)                    # 19
    w = SCALE // n                        # 1_000_000 // 19 = 52 631
    last_w = SCALE - w * n                # остаток (11 — добавится к первой карточке)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_2999",
        "name": name,
        "tier": "elite",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_forestcase_4999():
    """Кейс «forestcase» за 1499 ⭐: 21 реальный предмет (изображения из gift image/).
    Итого 21 предмет, сумма весов строго 1_000_000."""
    price = 1499
    name = "forestcase"
    image = "image/forestcase.webp"
    target_ev = round(price * RTP, 2)   # 1274.15

    new_items = [
        {"id": "swiss_watches__swi-Photoroom",     "name": "Swiss Watches",  "value": 3674,  "image": "gift image/swi-Photoroom.png"},
        {"id": "swag_bags__swa-Photoroom",         "name": "Swag Bags",      "value": 416,   "image": "gift image/swa-Photoroom.png"},
        {"id": "scared_cats__sca1-Photoroom",      "name": "Scared Cats",    "value": 12320, "image": "gift image/sca1-Photoroom.png"},
        {"id": "precious_peaches__pre1-Photoroom", "name": "Precious Peaches","value": 19216,"image": "gift image/pre1-Photoroom.png"},
        {"id": "perfume_bottles__per1-Photoroom",  "name": "Perfume Bottles", "value": 5146,  "image": "gift image/per1-Photoroom.png"},
        {"id": "nail_bracelets__nai2-Photoroom",   "name": "Nail Bracelets", "value": 8934,  "image": "gift image/nai2-Photoroom.png"},
        {"id": "mini_oscars__min1-Photoroom",      "name": "Mini Oscars",    "value": 5588,  "image": "gift image/min1-Photoroom.png"},
        {"id": "love_candles__lov-Photoroom",      "name": "Love Candles",   "value": 654,   "image": "gift image/lov-Photoroom.png"},
        {"id": "loot_bags__loo1-Photoroom",        "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo1-Photoroom.png"},
        {"id": "jolly_chimps__jol-Photoroom",      "name": "Jolly Chimps",   "value": 507,   "image": "gift image/jol-Photoroom.png"},
        {"id": "heroic_helmets__her-Photoroom",    "name": "Heroic Helmets", "value": 13920, "image": "gift image/her-Photoroom.png"},
        {"id": "cookie_hearts__coo-Photoroom",      "name": "Cookie Hearts",  "value": 367,   "image": "gift image/coo-Photoroom.png"},
        {"id": "genie_lamps__gen-Photoroom",       "name": "Genie Lamps",    "value": 2920,  "image": "gift image/gen-Photoroom.png"},
        {"id": "gem_signets__gem-Photoroom",       "name": "Gem Signets",    "value": 5023,  "image": "gift image/gem-Photoroom.png"},
        {"id": "durovs_caps__dur1-Photoroom",      "name": "Durov's Caps",   "value": 31200, "image": "gift image/dur1-Photoroom.png"},
        {"id": "diamond_rings__dia-Photoroom",     "name": "Diamond Rings",  "value": 2376,  "image": "gift image/dia-Photoroom.png"},
        {"id": "cupid_charms__cup2-Photoroom",     "name": "Cupid Charms",   "value": 1680,  "image": "gift image/cup2-Photoroom.png"},
        {"id": "bonded_rings__bon-Photoroom",      "name": "Bonded Rings",   "value": 3040,  "image": "gift image/bon-Photoroom.png"},
        {"id": "scared_cats__sca-Photoroom",       "name": "Scared Cats",    "value": 12320, "image": "gift image/sca-Photoroom.png"},
        {"id": "artisan_bricks__art2-Photoroom",   "name": "Artisan Bricks", "value": 4952,  "image": "gift image/art2-Photoroom.png"},
        {"id": "astral_shards__ast2-Photoroom",    "name": "Astral Shards",  "value": 10400, "image": "gift image/ast2-Photoroom.png"},
    ]

    n = len(new_items)                    # 21
    w = SCALE // n                        # 1_000_000 // 21 = 47 619
    last_w = SCALE - w * n                # остаток (1 — добавится к первой карточке)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_4999",
        "name": name,
        "tier": "elite",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_hellcase_9999():
    """Кейс «hellcase» за 2999 ⭐: 16 реальных предметов (изображения из gift image/).
    Итого 16 предметов, сумма весов строго 1_000_000."""
    price = 2999
    name = "hellcase"
    image = "image/hellcase.webp"
    target_ev = round(price * RTP, 2)   # 2549.15

    new_items = [
        {"id": "heroic_helmets__her3-Photoroom",  "name": "Heroic Helmets", "value": 13920, "image": "gift image/her3-Photoroom.png"},
        {"id": "heart_lockets__hea2-Photoroom",   "name": "Heart Lockets",  "value": 88000, "image": "gift image/hea2-Photoroom.png"},
        {"id": "westside_signs__wes-Photoroom",   "name": "Westside Signs", "value": 7520,  "image": "gift image/wes-Photoroom.png"},
        {"id": "voodoo_dolls__voo-Photoroom",     "name": "Voodoo Dolls",   "value": 2563,  "image": "gift image/voo-Photoroom.png"},
        {"id": "top_hats__top-Photoroom",         "name": "Top Hats",       "value": 800,   "image": "gift image/top-Photoroom.png"},
        {"id": "sharp_tongues__sha-Photoroom",    "name": "Sharp Tongues",  "value": 3111,  "image": "gift image/sha-Photoroom.png"},
        {"id": "perfume_bottles__per1-Photoroom", "name": "Perfume Bottles", "value": 5146,  "image": "gift image/per1-Photoroom.png"},
        {"id": "mighty_arms__mig2-Photoroom",     "name": "Mighty Arms",    "value": 8386,  "image": "gift image/mig2-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",   "name": "Magic Potions",  "value": 4397,  "image": "gift image/mag1-Photoroom.png"},
        {"id": "mad_pumpkins__mad-Photoroom",     "name": "Mad Pumpkins",   "value": 736,   "image": "gift image/mad-Photoroom.png"},
        {"id": "loot_bags__loo-Photoroom",        "name": "Loot Bags",      "value": 9022,  "image": "gift image/loo-Photoroom.png"},
        {"id": "ion_gems__ion2-Photoroom",        "name": "Ion Gems",       "value": 4638,  "image": "gift image/ion2-Photoroom.png"},
        {"id": "diamond_rings__dia1-Photoroom",   "name": "Diamond Rings",  "value": 2376,  "image": "gift image/dia1-Photoroom.png"},
        {"id": "cupid_charms__cup1-Photoroom",    "name": "Cupid Charms",   "value": 1680,  "image": "gift image/cup1-Photoroom.png"},
        {"id": "astral_shards__ast3-Photoroom",   "name": "Astral Shards",  "value": 10400, "image": "gift image/ast3-Photoroom.png"},
        {"id": "artisan_bricks__art-Photoroom",   "name": "Artisan Bricks", "value": 4952,  "image": "gift image/art-Photoroom.png"},
    ]

    n = len(new_items)                    # 16
    w = SCALE // n                        # 1_000_000 // 16 = 62 500
    last_w = SCALE - w * n                # остаток (0)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_9999",
        "name": name,
        "tier": "elite",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


def build_pokercase_19999():
    """Кейс «pokercase» за 3999 ⭐: 27 реальных предметов (изображения из gift image/).
    Итого 27 предметов, сумма весов строго 1_000_000."""
    price = 3999
    name = "pokercase"
    image = "image/pokercase.webp"
    target_ev = round(price * RTP, 2)   # 3399.15

    new_items = [
        {"id": "plush_pepes__plu-Photoroom",       "name": "Plush Pepes",     "value": 411920, "image": "gift image/plu-Photoroom.png"},
        {"id": "plush_pepes__plu1-Photoroom",      "name": "Plush Pepes",     "value": 411920, "image": "gift image/plu1-Photoroom.png"},
        {"id": "westside_signs__wes-Photoroom",    "name": "Westside Signs",  "value": 7520,   "image": "gift image/wes-Photoroom.png"},
        {"id": "westside_signs__wes1-Photoroom",   "name": "Westside Signs",  "value": 7520,   "image": "gift image/wes1-Photoroom.png"},
        {"id": "scared_cats__sca3-Photoroom",      "name": "Scared Cats",     "value": 12320,  "image": "gift image/sca3-Photoroom.png"},
        {"id": "scared_cats__sca2-Photoroom",      "name": "Scared Cats",     "value": 12320,  "image": "gift image/sca2-Photoroom.png"},
        {"id": "precious_peaches__pre1-Photoroom", "name": "Precious Peaches","value": 19216,  "image": "gift image/pre1-Photoroom.png"},
        {"id": "precious_peaches__pre-Photoroom",  "name": "Precious Peaches","value": 19216,  "image": "gift image/pre-Photoroom.png"},
        {"id": "mighty_arms__mig-Photoroom",       "name": "Mighty Arms",     "value": 8386,   "image": "gift image/mig-Photoroom.png"},
        {"id": "magic_potions__mag1-Photoroom",    "name": "Magic Potions",   "value": 4397,   "image": "gift image/mag1-Photoroom.png"},
        {"id": "loot_bags__loo-Photoroom",         "name": "Loot Bags",       "value": 9022,   "image": "gift image/loo-Photoroom.png"},
        {"id": "loot_bags__loo1-Photoroom",        "name": "Loot Bags",       "value": 9022,   "image": "gift image/loo1-Photoroom.png"},
        {"id": "ion_gems__ion4-Photoroom",         "name": "Ion Gems",        "value": 4638,   "image": "gift image/ion4-Photoroom.png"},
        {"id": "ion_gems__ion5-Photoroom",         "name": "Ion Gems",        "value": 4638,   "image": "gift image/ion5-Photoroom.png"},
        {"id": "heroic_helmets__her1-Photoroom",   "name": "Heroic Helmets",  "value": 13920,  "image": "gift image/her1-Photoroom.png"},
        {"id": "heroic_helmets__her2-Photoroom",   "name": "Heroic Helmets",  "value": 13920,  "image": "gift image/her2-Photoroom.png"},
        {"id": "heart_lockets__hea3-Photoroom",    "name": "Heart Lockets",   "value": 88000,  "image": "gift image/hea3-Photoroom.png"},
        {"id": "durov_s_caps__dur1-Photoroom",     "name": "Durov's Caps",    "value": 31200,  "image": "gift image/dur1-Photoroom.png"},
        {"id": "durov_s_caps__dur-Photoroom",      "name": "Durov's Caps",    "value": 31200,  "image": "gift image/dur-Photoroom.png"},
        {"id": "diamond_rings__dia-Photoroom",     "name": "Diamond Rings",   "value": 2376,   "image": "gift image/dia-Photoroom.png"},
        {"id": "diamond_rings__dia1-Photoroom",    "name": "Diamond Rings",   "value": 2376,   "image": "gift image/dia1-Photoroom.png"},
        {"id": "artisan_bricks__art1-Photoroom",   "name": "Artisan Bricks",  "value": 4952,   "image": "gift image/art1-Photoroom.png"},
        {"id": "artisan_bricks__art2-Photoroom",   "name": "Artisan Bricks",  "value": 4952,   "image": "gift image/art2-Photoroom.png"},
        {"id": "neko_helmets__nek-Photoroom",      "name": "Neko Helmets",    "value": 2820,   "image": "gift image/nek-Photoroom.png"},
        {"id": "neko_helmets__nek1-Photoroom",     "name": "Neko Helmets",    "value": 2820,   "image": "gift image/nek1-Photoroom.png"},
        {"id": "sharp_tongues__sha-Photoroom",     "name": "Sharp Tongues",   "value": 3111,   "image": "gift image/sha-Photoroom.png"},
        {"id": "sharp_tongues__sha1-Photoroom",    "name": "Sharp Tongues",   "value": 3111,   "image": "gift image/sha1-Photoroom.png"},
    ]

    n = len(new_items)                    # 27
    w = SCALE // n                        # 1_000_000 // 27 = 37 037
    last_w = SCALE - w * n                # остаток (1 — добавится к первой карточке)
    items = []
    for k, it in enumerate(new_items):
        wi = w + (last_w if k == 0 else 0)
        items.append({
            "id": it["id"], "type": "gift", "value": it["value"],
            "weight": wi,
            "drop_chance_percent": round(wi / SCALE * 100, 4),
            "name": it["name"], "image": it["image"],
        })

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    # Сортировка по цене: дорогие сверху, дешёвые вниз (стабильная).
    items.sort(key=lambda it: it["value"], reverse=True)

    return {
        "id": "case_19999",
        "name": name,
        "tier": "elite",
        "price": price,
        "image": image,
        "target_ev": target_ev,
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(target_ev / price, 2),
        "items": items,
    }


# ===========================================================================
# СПЕЦИФИКАЦИИ 12 КЕЙСОВ (16–22 предметов в каждом)
# Состав: 1 джекпот + common + rare + epic + консоляции + регулятор.
# ===========================================================================
CASES = [
    # -------------------------------------- БАЗОВЫЕ (x50) --------------------
    # ----- БАЗОВЫЙ ПОДАРОЧНЫЙ КЕЙС (16 предметов, RTP 85%) -----
    build_gift_case_19(),
    build_newyear_case_39(),
    build_toxic_case_99(),

    # -------------------------------------- СРЕДНИЕ (x100) ------------------
    build_ocean_case_199(),
]

# ------------------------------- СРЕДНИЕ (продолжение) х100 ---------------
CASES.extend([
    build_pasha_case_399(),
    build_day_case_799(),
])

# ------------------------------- ЭЛИТНЫЕ (1249-4999) ------------------------
CASES.extend([
    build_halouincase_1249(),
    build_lovecase_1999(),
    build_gemcase_2999(),
    build_forestcase_4999(),

    # --------------------------------- МИФИК (9999-19999) --------------------------
    build_hellcase_9999(),
    build_pokercase_19999(),
])

# ===========================================================================
#      ВАЛИДАЦИЯ + ВЫХОДЫ (casesConfig.json и casesData.js)
# ===========================================================================
def validate_case(c):
    issues = []
    n = len(c["items"])
    if not (16 <= n <= 22):
        issues.append("предметов %d (нужно 16-22)" % n)
    total_w = sum(i["weight"] for i in c["items"])
    if total_w != SCALE:
        issues.append("сумма весов %d != %d" % (total_w, SCALE))
    if abs(c["rtp_percent"] - 85.0) > 1.0:
        issues.append("RTP %.2f вне 85±1" % c["rtp_percent"])
    return issues


def main():
    print("Контроль 12 кейсов (RTP=85%, 16-22 предмета):\n")
    all_ok = True
    for c in CASES:
        issues = validate_case(c)
        ok = not issues
        all_ok = all_ok and ok
        print("  [%s] %-11s price=%-5s RTP=%.2f%% items=%d  %s" % (
            "OK " if ok else "FAIL", c["id"], c["price"],
            c["rtp_percent"], len(c["items"]), " ".join(issues)))

    base = os.path.dirname(os.path.abspath(__file__))

    # --- 1) casesConfig.json (сырой конфиг) ---
    payload = {"rtp": RTP, "scale": SCALE, "cases": CASES}
    with open(os.path.join(base, "casesConfig.json"), "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # --- 2) casesData.js (ES-модуль для фронтенда) ---
    js_cases = []
    for c in CASES:
        js_cases.append({
            "id": c["id"], "name": c["name"], "tier": c["tier"],
            "price": c["price"], "image": c["image"],
            "target_ev": c["target_ev"],
            "jackpot_multiplier": c["jackpot_multiplier"],
            "items": [{"id": i["id"], "type": i["type"], "value": i["value"],
                       "weight": i["weight"],
                       "drop_chance_percent": i["drop_chance_percent"],
                       "name": i["name"], "image": i["image"]}
                      for i in c["items"]],
        })
    js_lines = [
        "// Auto-generated from casesConfig.json — не редактировать вручную.",
        "// 12 кейсов, RTP=85%, 16-22 предмета в каждом.",
        "// Использование (ES-модуль):",
        "//   import { cases } from './casesData.js'",
        "",
        "export const cases = " + json.dumps(js_cases, ensure_ascii=False, indent=2) + ";",
        "",
        "export default cases;",
        "",
    ]
    with open(os.path.join(base, "casesData.js"), "w", encoding="utf-8") as f:
        f.write("\n".join(js_lines))

    print("\ngenerate_cases.py: OK -> casesConfig.json + casesData.js")
    print("Валидация: %s" % ("все кейсы прошли (RTP 85%)" if all_ok else "ЕСТЬ ОШИБКИ"))


if __name__ == "__main__":
    main()




