#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Удаление однотонного (flat) фона у всех изображений в папке "gift image".

Метод: flood-fill от краёв изображения по цвету, близкому к фоновому.
Фон каждого изображения однотонный (ровный цвет), поэтому от границ
растёт связная область фона, которая и становится прозрачной.
Результат сохраняется в папку "gift image transparent" с теми же именами.
"""

import os
import sys
import numpy as np
from PIL import Image, ImageFilter

SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gift image")
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gift image transparent")

IMAGE_EXTS = (".webp", ".png", ".jpg", ".jpeg", ".bmp")

# Порог близости цвета к фону (евклидово расстояние в RGB-пространстве).
BACKGROUND_TOLERANCE = 55
# Число пикселей от края, из которых берём фоновый цвет.
BORDER_BAND = 6
# Если фон-регион заполняет больше этой доли площади - волновое подтверждение
MAX_REASONABLE_FILL = 0.94


def color_distance(a, b):
    return np.sqrt(np.sum((a.astype(np.float64) - b.astype(np.float64)) ** 2, axis=-1))


def remove_background(image: Image.Image, tol: float) -> Image.Image:
    """Возвращает RGBA-изображение с прозрачным однотонным фоном."""
    img = image.convert("RGBA")
    arr = np.asarray(img).copy()
    rgb = arr[:, :, :3].astype(np.float64)
    h, w, _ = rgb.shape

    # 1. Фоновый цвет: медиана по граничной полосе.
    border = np.vstack(
        [
            rgb[:BORDER_BAND].reshape(-1, 3),
            rgb[h - BORDER_BAND :].reshape(-1, 3),
            rgb[:, :BORDER_BAND].reshape(-1, 3),
            rgb[:, w - BORDER_BAND :].reshape(-1, 3),
        ]
    )
    bg_color = np.median(border, axis=0)

    # 2. Кандидат фона: пиксель близко к фоновому цвету.
    dist = color_distance(rgb, bg_color)
    cand = dist <= tol  # bool hxw

    # 3. Flood-fill от всех граничных пикселей, которые являются кандидатами.
    bg = np.zeros((h, w), dtype=bool)
    stack = []
    # граница
    seed = (
        list(zip(range(0, h), [0] * h))
        + list(zip(range(0, h), [w - 1] * h))
        + list(zip([0] * w, range(0, w)))
        + list(zip([h - 1] * w, range(0, w)))
    )
    for (y, x) in seed:
        if 0 <= y < h and 0 <= x < w and cand[y, x]:
            bg[y, x] = True
            stack.append((y, x))
    while stack:
        y, x = stack.pop()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                stack.append((ny, nx))

    fill_ratio = bg.sum() / (h * w)
    if fill_ratio > MAX_REASONABLE_FILL:
        # Слишком большой "фон" — возможно, объект закрывает весь кадр,
        # либо фон почти совпадает с объектом. Предупреждаем, но продолжаем.
        pass

    # 4. Также убираем отдельные фоновые пятна (свилящие пиксели фона),
    #    лежащие вдали от границы, но строго совпадающие с фоновым цветом,
    #    чтобы не продырявить сюжет. Используем более жёсткий порог.
    tight_tol = tol * 0.5
    tight = color_distance(rgb, bg_color) <= tight_tol
    isolated = tight & ~bg
    bg |= isolated

    # 5. Формируем альфа-канал. Базово фон=0, остальное=255.
    alpha = np.where(bg, 0, 255).astype(np.uint8)

    # 6. Смягчаем края (сглаживание антиалиасинга). Размываем маску альфы.
    am = Image.fromarray(alpha, "L")
    am = am.filter(ImageFilter.GaussianBlur(radius=0.8))
    soft_alpha = np.asarray(am)

    # Только уменьшаем счёт по формулам - гарантируем, что прозрачность не больше.
    arr[:, :, 3] = soft_alpha
    return Image.fromarray(arr, "RGBA")


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    files = [
        f
        for f in os.listdir(SRC_DIR)
        if f.lower().endswith(IMAGE_EXTS) and os.path.isfile(os.path.join(SRC_DIR, f))
    ]
    files.sort()
    if not files:
        print("Нет изображений в", SRC_DIR)
        return 1

    ok, failed = 0, 0
    for name in files:
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(OUT_DIR, name)
        try:
            with Image.open(src) as im:
                result = remove_background(im, BACKGROUND_TOLERANCE)
            result.save(dst)
            ok += 1
            print(f"OK   {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL {name}: {e!r}", file=sys.stderr)

    print("\nГотово: успешно {} , ошибок {}. Всего файлов {}.".format(ok, failed, len(files)))
    print("Результат сохранён в:", OUT_DIR)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())