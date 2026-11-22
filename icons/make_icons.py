"""Generates the PNG app icons. Run: python3 icons/make_icons.py"""
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))

def icon(size):
    img = Image.new("RGB", (size, size))
    top, bottom = (124, 58, 237), (219, 39, 119)
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line([(0, y), (size, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    s = size / 100
    # stylised note: stem + flag + head
    d.ellipse([28 * s, 58 * s, 50 * s, 76 * s], fill="white")
    d.rectangle([44 * s, 24 * s, 50 * s, 68 * s], fill="white")
    d.polygon([(50 * s, 24 * s), (72 * s, 32 * s), (72 * s, 42 * s), (50 * s, 34 * s)], fill="white")
    return img

for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    icon(size).save(os.path.join(HERE, name))
