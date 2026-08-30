# -*- coding: utf-8 -*-
"""
Casino Criptoporno — ПРОВЕРКА РЕЗУЛЬТАТОВ (RTP=90%)
=================================================================
Проверяет casesConfig.json и casesData.js для всех 12 кейсов.
"""

import json
import os

SCALE = 1_000_000
TARGET_RTP = 0.90


def verify_case(case, case_index):
    price = case["price"]
    items = case["items"]
    case_name = case["name"]
    case_id = case["id"]
    
    print(f"\n{'='*80}")
    print(f"КЕЙС {case_index}: {case_name} ({case_id})")
    print(f"Цена: {price} ⭐")
    print(f"Предметов: {len(items)}")
    print(f"{'='*80}")
    
    # Проверка 1: Сумма вероятностей
    total_prob = sum(item["drop_chance_percent"] for item in items)
    total_weight = sum(item["weight"] for item in items)
    
    print(f"\n--- Проверка сумм ---")
    print(f"Сумма drop_chance_percent: {total_prob:.4f}% (должно быть 100%)")
    print(f"Сумма weight: {total_weight} (должно быть {SCALE})")
    
    prob_ok = abs(total_prob - 100.0) < 0.01
    weight_ok = total_weight == SCALE
    
    print(f"  {'✓' if prob_ok else '✗'} Сумма вероятностей {'корректна' if prob_ok else 'НЕ корректна'}")
    print(f"  {'✓' if weight_ok else '✗'} Сумма весов {'корректна' if weight_ok else 'НЕ корректна'}")
    
    # Проверка 2: RTP
    ev = sum(item["value"] * item["weight"] for item in items) / SCALE
    rtp = ev / price * 100
    target_ev = price * TARGET_RTP
    
    print(f"\n--- Проверка RTP ---")
    print(f"Ожидаемый выигрыш (EV): {ev:.4f} ⭐")
    print(f"Целевой EV (90% от цены): {target_ev:.2f} ⭐")
    print(f"Фактический RTP: {rtp:.4f}% (должно быть 90%)")
    
    rtp_ok = abs(rtp - 90.0) < 0.1
    print(f"  {'✓' if rtp_ok else '✗'} RTP {'корректен' if rtp_ok else 'НЕ корректен'}")
    
    # Проверка 3: Детали по предметам
    print(f"\n--- Детали по предметам ---")
    print(f"{'Название':<25} {'Цена':>8} {'Weight':>10} {'Шанс %':>12} {'Вклад в RTP':>12}")
    print("-" * 70)
    
    items_sorted = sorted(items, key=lambda x: x["value"])
    
    all_positive = True
    distribution_ok = True
    
    for item in items_sorted:
        name = item["name"]
        value = item["value"]
        weight = item["weight"]
        chance = item["drop_chance_percent"]
        
        # Вклад в RTP = value * (weight / SCALE) / price * 100
        contribution = value * (weight / SCALE) / price * 100
        
        print(f"{name:<25} {value:>8} {weight:>10} {chance:>12.4f} {contribution:>11.4f}%")
        
        if weight < 0 or chance < 0:
            all_positive = False
    
    print(f"\n--- Проверка распределения ---")
    print(f"  {'✓' if all_positive else '✗'} Все вероятности положительные")
    
    # Проверка логики распределения
    # Дешёвые предметы должны иметь больший шанс, чем дорогие
    prev_value = 0
    prev_chance = float('inf')
    monotonic = True
    
    for item in items_sorted:
        if item["value"] > prev_value:
            if item["drop_chance_percent"] > prev_chance + 0.0001:
                # У более дорогого предмета шанс больше, чем у более дешёвого - ошибка
                # Но допускаем равенство для предметов с одинаковой ценой
                if prev_value > 0:  # Не первый предмет
                    monotonic = False
            prev_value = item["value"]
            prev_chance = item["drop_chance_percent"]
    
    print(f"  {'✓' if monotonic else '✗'} Распределение соответствует стоимости (дешёвые > дорогие)")
    
    # Проверка на нулевые вероятности
    zero_chance_items = [item for item in items if item["drop_chance_percent"] == 0]
    if zero_chance_items:
        print(f"\n  ⚠ Предметы с 0% шансом:")
        for item in zero_chance_items:
            print(f"    - {item['name']} (цена: {item['value']} ⭐)")
    
    return {
        "prob_ok": prob_ok,
        "weight_ok": weight_ok,
        "rtp_ok": rtp_ok,
        "all_positive": all_positive,
        "monotonic": monotonic,
        "has_zero_chance": len(zero_chance_items) > 0
    }


def main():
    base = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(base, "casesConfig.json")
    js_path = os.path.join(base, "casesData.js")
    
    print("="*80)
    print("ПРОВЕРКА РЕЗУЛЬТАТОВ (RTP = 90%)")
    print("="*80)
    
    # Загружаем JSON
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)
    
    cases = config["cases"]
    
    # Проверяем casesData.js
    print(f"\nПроверка casesData.js...")
    with open(js_path, "r", encoding="utf-8") as f:
        js_content = f.read()
    
    # Извлекаем JSON из JS
    js_json_start = js_content.find("[")
    js_json_end = js_content.rfind("]") + 1
    js_cases = json.loads(js_content[js_json_start:js_json_end])
    
    print(f"  Найдено {len(js_cases)} кейсов в casesData.js")
    
    # Проверяем соответствие
    if len(cases) != len(js_cases):
        print(f"  ✗ Количество кейсов не совпадает: {len(cases)} vs {len(js_cases)}")
    else:
        print(f"  ✓ Количество кейсов совпадает")
    
    all_results = []
    
    for i, case in enumerate(cases, 1):
        result = verify_case(case, i)
        all_results.append(result)
    
    # Итоговая сводка
    print(f"\n{'='*80}")
    print(f"ИТОГОВАЯ СВОДКА")
    print(f"{'='*80}")
    
    all_ok = all(
        r["prob_ok"] and r["weight_ok"] and r["rtp_ok"] and r["all_positive"] and r["monotonic"]
        for r in all_results
    )
    
    for i, (case, result) in enumerate(zip(cases, all_results), 1):
        status = "✓" if all([result["prob_ok"], result["weight_ok"], result["rtp_ok"], result["all_positive"], result["monotonic"]]) else "✗"
        print(f"  {status} Кейс {i}: {case['name']:<15} RTP={case['rtp_percent']:.2f}%")
    
    print(f"\n{'='*80}")
    if all_ok:
        print("✓ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!")
    else:
        print("✗ НАЙДЕНЫ ОШИКИ!")
    print(f"{'='*80}")


if __name__ == "__main__":
    main()
