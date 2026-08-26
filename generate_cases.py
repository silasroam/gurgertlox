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
def build_case(*, case_id, name, tier, price, jackpot_value, jackpot_weight,
               common, rare, epic):
    """
    common/rare/epic — список спецификаций (dict из пула либо stars()/nf()).
    Каждый получает малый фикс. вес; «регулирующий» Common-предмет
    (calib_<case_id>) добирает остаток веса до 1 000 000, его цена
    калибруется под EV = 0.85*price.
    """
    target_ev = round(price * RTP, 2)

    items = [{"id": "jackpot_" + str(case_id), "type": "jackpot",
              "value": jackpot_value, "weight": jackpot_weight}]

    def put(spec, mult, weight):
        items.append({
            "spec": spec,
            "type": spec.get("type", "gift"),
            "value": round(spec.get("value", mult * price), 2),
            "weight": weight,
        })

    # Common (звёзды-пакеты + базовые гифты) — фикс. малые веса
    for spec, w in common:
        put(spec, 0.30, w)
    # Rare
    for spec, w in rare:
        put(spec, 1.00, w)
    # Epic
    for spec, w in epic:
        put(spec, 3.00, w)

    # Консоляция: 3 разных пачки Stars (3/5/10)
    used = sum_weight(items)
    tail = SCALE - used
    w_a = int(tail * 0.40)
    w_b = int(tail * 0.35)
    w_c = tail - w_a - w_b
    items.append({"spec": {"id": "stars_min_3", "type": "stars",
                           "value": 3, "name": "Bonus"}, "type": "common",
                  "value": 3, "weight": w_a})
    items.append({"spec": {"id": "stars_min_5", "type": "stars",
                           "value": 5, "name": "5 Stars"}, "type": "common",
                  "value": 5, "weight": w_b})
    items.append({"spec": {"id": "stars_min_10", "type": "stars",
                           "value": 10, "name": "10 Stars"}, "type": "common",
                  "value": 10, "weight": w_c})
    # Калибруем цену первого (самого тяжёлого) консоль-дропа под точный RTP
    calibrate(items, len(items) - 3, target_ev, price * 0.05, price * 5.0)

    # Финальные объекты (id/name/image/drop) + сортировка по весу
    payload = []
    for i, it in enumerate(items):
        spec = dict(it.get("spec") or {})
        if it["type"] == "jackpot":
            ident = "jackpot_" + str(case_id)
            nm = "JACKPOT"
        else:
            ident = spec.get("id", "item_%d" % i)
            nm = spec.get("name") or (BY_ID.get(ident, {}).get("name") or ident)
        payload.append({
            "id": ident,
            "type": it["type"],
            "value": it["value"],
            "weight": it["weight"],
            "drop_chance_percent": round(it["weight"] / SCALE * 100, 4),
            "name": nm,
            "image": IMG_STARS if it["type"] == "jackpot" else img_for(spec),
        })
    payload[1:] = sorted(payload[1:], key=lambda it: it["weight"], reverse=True)
    items = payload

    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    rtp_pct = ev / price * 100

    return {
        "id": case_id,
        "name": name,
        "tier": tier,
        "price": price,
        "target_ev": round(price * RTP, 2),
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(rtp_pct, 4),
        "jackpot_multiplier": round(jackpot_value / price, 2),
        "items": items,
    }

def build_gift_case_19():
    """Кейс «Basic 19» — специальный подарочный кейс с 16 фиксированными
    предметами (без джекпота и консоляций). RTP ≈ 85%, сумма весов = 1 000 000.
    """
    price = 19
    # (id, name, value(stars), weight, image) — от дорогих к дешёвым
    rows = [
        ("nft_easter",  "Easter Eggs NFT", 587,      12, "gift image/eas-Photoroom.png"),
        ("nft_big",     "Big Years NFT",   546,      12, "gift image/big-Photoroom.png"),
        ("nft_chill",   "Chill Flames NFT",514,      12, "gift image/chi-Photoroom.png"),
        ("nft_ice",     "Ice Creams NFT",  454,      12, "gift image/ice-Photoroom.png"),
        ("nft_jester",  "Jester Hats NFT", 400,      12, "gift image/jes-Photoroom.png"),
        ("trophy_100",  "Trophy",          100,      80, "standard-gifts/trophy_100.png"),
        ("ring_100",    "Ring",            100,      80, "standard-gifts/ring_100.png"),
        ("diamond_100", "Diamond",         100,      80, "standard-gifts/diamond_100.png"),
        ("rocket_50",   "Rocket",           50,    1860, "standard-gifts/rocket_50.png"),
        ("champagne_50","Champagne",        50,    1860, "standard-gifts/champagne_50.png"),
        ("cake_50",     "Cake",             50,    1860, "standard-gifts/cake_50.png"),
        ("bouquet_50",  "Bouquet",          50,    1860, "standard-gifts/bouquet_50.png"),
        ("rose_25",     "Rose",             25,   43270, "standard-gifts/rose_25.png"),
        ("gift_25",     "Gift",             25,   43270, "standard-gifts/gift_25.png"),
        ("heart_15",    "Heart",            15,  452860, "standard-gifts/heart_15.png"),
        ("bear_15",     "Bear",             15,  452860, "standard-gifts/bear_15.png"),
    ]
    items = []
    for gid, name, val, w, img in rows:
        items.append({
            "id": gid,
            "type": "nft" if val >= 200 else "gift",
            "value": val,
            "weight": w,
            "drop_chance_percent": round(w / SCALE * 100, 4),
            "name": name,
            "image": img,
        })
    ev = sum(i["value"] * i["weight"] for i in items) / SCALE
    return {
        "id": "case_19",
        "name": "Basic 19",
        "tier": "basic",
        "price": price,
        "target_ev": round(price * RTP, 2),
        "calculated_ev": round(ev, 4),
        "rtp_percent": round(ev / price * 100, 4),
        "jackpot_multiplier": 0,
        "items": items,
    }
# ===========================================================================
# СПЕЦИФИКАЦИИ 12 КЕЙСОВ (16–22 предмета в каждом)
# Состав: 1 джекпот + common + rare + epic + консоляции + регулятор.
# ===========================================================================
CASES = [
    # -------------------------------------- БАЗОВЫЕ (x50) --------------------
    # ----- БАЗОВЫЙ ПОДАРОЧНЫЙ КЕЙС (16 предметов, RTP 85%) -----
    build_gift_case_19(),
    build_case(case_id="case_49", name="Basic 49", tier="basic", price=49,
               jackpot_value=2450, jackpot_weight=4000,
               common=[(stars(20), 24000), (stars(30), 21000), (stars(45), 19000),
                       (H15, 16000), (B15, 15000), (G25, 14000), (R25, 12000)],
               rare=[(C50, 18000), (BQ50, 17000), (CH50, 16000), (T100, 15000)],
               epic=[(RI100, 10000), (D100, 9000), (nf(200), 8000)]),
    build_case(case_id="case_99", name="Basic 99", tier="basic", price=99,
               jackpot_value=4950, jackpot_weight=4000,
               common=[(stars(25), 27000), (stars(50), 24000), (stars(75), 21000),
                       (H15, 20000), (B15, 19000), (G25, 18000), (R25, 17000)],
               rare=[(C50, 22000), (BQ50, 21000), (RI100, 20000), (D100, 19000)],
               epic=[(nf(200), 11000), (nf(300), 10000), (nf(450), 9000)]),

    # -------------------------------------- СРЕДНИЕ (x100) ------------------
    build_case(case_id="case_199", name="Medium 199", tier="medium", price=199,
               jackpot_value=19900, jackpot_weight=1200,
               common=[(stars(35), 30000), (stars(80), 27000), (stars(120), 24000),
                       (H15, 23000), (B15, 22000), (G25, 21000), (R25, 20000)],
               rare=[(C50, 25000), (BQ50, 24000), (RI100, 23000), (nf(200), 20000)],
               epic=[(nf(400), 12000), (nf(600), 11000), (nf(900), 10000)]),
]

# ------------------------------- СРЕДНИЕ (продолжение) х100 ---------------
CASES.extend([
    build_case(case_id="case_399", name="Medium 399", tier="medium", price=399,
               jackpot_value=39900, jackpot_weight=1200,
               common=[(stars(80), 33000), (stars(150), 30000), (stars(250), 27000),
                       (H15, 26000), (B15, 25000), (G25, 24000), (RI100, 23000)],
               rare=[(nf(400), 28000), (nf(450), 26000), (nf(480), 24000), (nf(380), 22000)],
               epic=[(nf(1000), 13000), (nf(1500), 12000), (nf(1900), 11000)]),
    build_case(case_id="case_799", name="Medium 799", tier="medium", price=799,
               jackpot_value=160000, jackpot_weight=1200,
               common=[(stars(150), 34000), (stars(300), 31000), (stars(500), 28000),
                       (H15, 27000), (B15, 26000), (G25, 25000), (RI100, 24000)],
               rare=[(nf(800), 29000), (nf(900), 27000), (nf(950), 25000), (nf(760), 23000)],
               epic=[(nf(2000), 13000), (nf(3000), 12000), (nf(3900), 11000)]),
])

# ------------------------------- ЭЛИТНЫЕ (1249-4999) ------------------------
CASES.extend([
    build_case(case_id="case_1249", name="Elite 1249", tier="elite", price=1249,
               jackpot_value=250000, jackpot_weight=400,
               common=[(stars(200), 35000), (stars(500), 32000), (stars(800), 29000),
                       (H15, 28000), (B15, 27000), (G25, 26000), (RI100, 25000)],
               rare=[(nf(1300), 30000), (nf(1500), 28000), (nf(1600), 26000), (nf(1200), 24000)],
               epic=[(nf(3200), 13000), (nf(6000), 12000), (nf(7400), 11000)]),
    build_case(case_id="case_1999", name="Elite 1999", tier="elite", price=1999,
               jackpot_value=400000, jackpot_weight=300,
               common=[(stars(350), 36000), (stars(700), 33000), (stars(1100), 30000),
                       (H15, 29000), (B15, 28000), (G25, 27000), (RI100, 26000)],
               rare=[(nf(2200), 31000), (nf(2500), 29000), (nf(2700), 27000), (nf(2000), 25000)],
               epic=[(nf(5200), 14000), (nf(8000), 13000), (nf(9800), 12000)]),
    build_case(case_id="case_2999", name="Elite 2999", tier="elite", price=2999,
               jackpot_value=600000, jackpot_weight=250,
               common=[(stars(400), 36000), (stars(900), 34000), (stars(1400), 32000),
                       (H15, 30000), (B15, 29000), (G25, 28000), (RI100, 27000)],
               rare=[(nf(3000), 34000), (nf(3400), 32000), (nf(3700), 30000), (nf(2800), 28000)],
               epic=[(nf(8200), 14000), (nf(14000), 13000), (nf(17000), 12000)]),
    build_case(case_id="case_4999", name="Elite 4999", tier="elite", price=4999,
               jackpot_value=1000000, jackpot_weight=200,
               common=[(stars(600), 36000), (stars(1200), 34000), (stars(2000), 32000),
                       (H15, 30000), (B15, 29000), (G25, 28000), (RI100, 27000)],
               rare=[(nf(5000), 32000), (nf(5500), 30000), (nf(4800), 28000), (nf(4600), 26000)],
               epic=[(nf(12000), 14000), (nf(20000), 13000), (nf(24900), 12000)]),

    # --------------------------------- МИФИК (9999-19999) --------------------------
    build_case(case_id="case_9999", name="Mythic 9999", tier="elite", price=9999,
               jackpot_value=2000000, jackpot_weight=180,
               common=[(stars(1500), 34000), (stars(3000), 32000), (stars(5000), 30000),
                       (nf(8000), 28000), (nf(10000), 26000), (nf(13000), 24000), (RI100, 23000)],
               rare=[(nf(10000), 34000), (nf(11000), 32000), (nf(12000), 30000), (nf(9000), 28000)],
               epic=[(nf(25000), 15000), (nf(40000), 14000), (nf(49000), 13000)]),
    build_case(case_id="case_19999", name="Mythic 19999", tier="elite", price=19999,
               jackpot_value=4000000, jackpot_weight=120,
               common=[(stars(2500), 34000), (stars(6000), 32000), (stars(10000), 30000),
                       (nf(16000), 28000), (nf(20000), 26000), (nf(24000), 24000), (RI100, 23000)],
               rare=[(nf(20000), 34000), (nf(23000), 32000), (nf(25000), 30000), (nf(18000), 28000)],
               epic=[(nf(50000), 15000), (nf(80000), 14000), (nf(99000), 13000)]),
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
            "price": c["price"], "target_ev": c["target_ev"],
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




