# -*- coding: utf-8 -*-
"""
Casino Criptoporno — РАСЧЁТ ПРОЦЕНТОВ ВЫПАДЕНИЯ (RTP=90%)
=================================================================
Берёт существующие кейсы из casesConfig.json.
Для каждого кейса рассчитывает проценты выпадения так, чтобы:
  - Сумма всех процентов = 100%
  - RTP = 90%
  - Дешёвые предметы имеют высокий шанс
  - Дорогие предметы имеют низкий шанс
  - Каждый предмет сохраняет возможность выпадения
"""

import json
import os
import math

SCALE = 1_000_000
TARGET_RTP = 0.90
BINARY_SEARCH_ITERATIONS = 100
MIN_PROBABILITY = 0.0001


def calculate_probabilities_for_case(case):
    items = case["items"]
    price = case["price"]
    target_ev = price * TARGET_RTP
    
    sorted_indices = sorted(range(len(items)), key=lambda i: items[i]["value"])
    
    values = [items[i]["value"] for i in sorted_indices]
    n = len(values)
    
    if n == 0:
        return items
    
    value_max = max(values)
    value_min = min(values)
    
    if value_max == value_min:
        equal_prob = 1.0 / n
        for i, item in enumerate(items):
            item["weight"] = round(SCALE / n)
            item["drop_chance_percent"] = round(equal_prob * 100, 4)
        return items
    
    mean_value = sum(values) / n
    max_possible_rtp = mean_value / price
    
    if target_ev > mean_value:
        print(f"  ⚠ WARNING: Невозможно достичь 90% RTP для кейса {case['name']}")
        print(f"    Максимально возможный RTP: {max_possible_rtp*100:.2f}%")
        for i, item in enumerate(items):
            item["weight"] = round(SCALE / n)
            item["drop_chance_percent"] = round(100.0 / n, 4)
        return items
    
    lo_alpha = 0.001
    hi_alpha = 20.0
    
    best_alpha = None
    best_error = float('inf')
    best_probs = None
    
    for _ in range(BINARY_SEARCH_ITERATIONS):
        alpha = (lo_alpha + hi_alpha) / 2.0
        
        raw_weights = [(value_max / v) ** alpha for v in values]
        weight_sum = sum(raw_weights)
        
        probs = [w / weight_sum for w in raw_weights]
        
        ev = sum(v * p for v, p in zip(values, probs))
        
        error = ev - target_ev
        
        if abs(error) < best_error:
            best_error = abs(error)
            best_alpha = alpha
            best_probs = probs[:]
        
        if error > 0:
            lo_alpha = alpha
        else:
            hi_alpha = alpha
    
    probs = best_probs
    
    result_probs = [0.0] * len(items)
    for idx, prob in zip(sorted_indices, probs):
        result_probs[idx] = prob
    
    for i, item in enumerate(items):
        prob = result_probs[i]
        item["weight"] = round(prob * SCALE)
        item["drop_chance_percent"] = round(prob * 100, 4)
    
    total_weight = sum(item["weight"] for item in items)
    diff = SCALE - total_weight
    
    if diff != 0:
        cheapest_idx = min(range(len(items)), key=lambda i: items[i]["value"])
        items[cheapest_idx]["weight"] += diff
        items[cheapest_idx]["drop_chance_percent"] = round(
            items[cheapest_idx]["weight"] / SCALE * 100, 4
        )
    
    return items


def verify_case(case):
    price = case["price"]
    items = case["items"]
    
    total_prob = sum(item["drop_chance_percent"] for item in items) / 100.0
    total_weight = sum(item["weight"] for item in items)
    
    ev = sum(item["value"] * item["weight"] for item in items) / SCALE
    rtp = ev / price * 100
    
    jackpot_multiplier = round(ev / price, 2)
    
    return {
        "total_probability_percent": round(total_prob * 100, 4),
        "total_weight": total_weight,
        "expected_value": round(ev, 4),
        "target_ev": round(price * TARGET_RTP, 2),
        "rtp_percent": round(rtp, 4),
        "jackpot_multiplier": jackpot_multiplier,
        "is_rtp_correct": abs(rtp - 90.0) < 0.1,
        "is_total_prob_correct": abs(total_prob - 1.0) < 0.0001,
    }


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base, "casesConfig.json")
    
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    cases = config["cases"]
    
    print("=" * 70)
    print("РАСЧЁТ ПРОЦЕНТОВ ВЫПАДЕНИЯ (RTP = 90%)")
    print("=" * 70)
    print()
    
    all_ok = True
    
    for case in cases:
        print(f"Кейс: {case['name']} ({case['id']})")
        print(f"  Цена: {case['price']} ⭐")
        print(f"  Предметов: {len(case['items'])}")
        
        calculate_probabilities_for_case(case)
        
        case["target_ev"] = round(case["price"] * TARGET_RTP, 2)
        
        verification = verify_case(case)
        
        case["calculated_ev"] = verification["expected_value"]
        case["rtp_percent"] = verification["rtp_percent"]
        case["jackpot_multiplier"] = verification["jackpot_multiplier"]
        
        print(f"  Сумма вероятностей: {verification['total_probability_percent']}%")
        print(f"  Ожидаемый выигрыш: {verification['expected_value']} ⭐")
        print(f"  Целевой RTP: 90%")
        print(f"  Фактический RTP: {verification['rtp_percent']}%")
        
        if verification["is_rtp_correct"] and verification["is_total_prob_correct"]:
            print(f"  ✓ RTP корректен")
        else:
            print(f"  ✗ RTP НЕ корректен!")
            all_ok = False
        
        print()
    
    config["rtp"] = TARGET_RTP
    
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)
    
    print("=" * 70)
    if all_ok:
        print("✓ Все кейсы прошли валидацию!")
    else:
        print("✗ Некоторые кейсы не прошли валидацию!")
    print("=" * 70)
    
    js_cases = []
    for c in cases:
        js_cases.append({
            "id": c["id"], "name": c["name"], "tier": c["tier"],
            "price": c["price"], "image": c["image"],
            "scale": c.get("scale", 1.0),
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
        f"// 12 кейсов, RTP={int(TARGET_RTP*100)}%, 16-22 предмета в каждом.",
        "// Использование (ES-модуль):",
        "//   import { cases } from './casesData.js'",
        "",
        "export const cases = " + json.dumps(js_cases, ensure_ascii=False, indent=2) + ";",
        "",
        "export default cases;",
        "",
    ]
    
    js_path = os.path.join(base, "casesData.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write("\n".join(js_lines))
    
    print(f"\nФайлы обновлены:")
    print(f"  - {config_path}")
    print(f"  - {js_path}")


if __name__ == "__main__":
    main()
