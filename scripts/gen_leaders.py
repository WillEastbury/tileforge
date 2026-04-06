#!/usr/bin/env python3
"""Generate 128x128 transparent PNG leader portraits for Apollo's Time."""

import math
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = "/root/tileforge/assets/leaders"
SIZE = 128
CENTER = SIZE // 2
RADIUS = 58

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def lighter(rgb, factor=0.4):
    return tuple(min(255, int(c + (255 - c) * factor)) for c in rgb)

def darker(rgb, factor=0.4):
    return tuple(max(0, int(c * (1 - factor))) for c in rgb)

def draw_circle_frame(draw, color_rgb, width=4):
    for i in range(width):
        draw.ellipse([CENTER - RADIUS - i, CENTER - RADIUS - i,
                       CENTER + RADIUS + i, CENTER + RADIUS + i],
                      outline=(*color_rgb, 255))

def draw_bg_gradient(img, color_rgb):
    """Radial gradient background inside circle."""
    dark = darker(color_rgb, 0.7)
    mid = darker(color_rgb, 0.4)
    draw = ImageDraw.Draw(img)
    for r in range(RADIUS, 0, -1):
        t = r / RADIUS
        c = tuple(int(dark[i] + (mid[i] - dark[i]) * (1 - t)) for i in range(3))
        alpha = int(200 + 55 * (1 - t))
        draw.ellipse([CENTER - r, CENTER - r, CENTER + r, CENTER + r],
                      fill=(*c, alpha))

def make_portrait(leader_id, color_hex, draw_fn):
    img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    color_rgb = hex_to_rgb(color_hex)
    draw_bg_gradient(img, color_rgb)
    draw = ImageDraw.Draw(img)
    draw_fn(img, draw, color_rgb)
    draw_circle_frame(draw, color_rgb, width=3)
    # Mask to circle
    mask = Image.new('L', (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse([CENTER - RADIUS - 3, CENTER - RADIUS - 3,
                CENTER + RADIUS + 3, CENTER + RADIUS + 3], fill=255)
    img.putalpha(mask)
    img.save(f"{OUT_DIR}/{leader_id}.png")
    print(f"  ✓ {leader_id}.png")


# === Individual leader drawing functions ===

def draw_apollo(img, draw, color):
    light = lighter(color, 0.5)
    gold = (255, 215, 0)
    # Sun rays
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1 = CENTER + int(15 * math.cos(rad))
        y1 = CENTER - 20 + int(15 * math.sin(rad))
        x2 = CENTER + int(45 * math.cos(rad))
        y2 = CENTER - 20 + int(45 * math.sin(rad))
        draw.line([(x1, y1), (x2, y2)], fill=(*gold, 180), width=2)
    # Sun disk
    draw.ellipse([CENTER - 14, CENTER - 34, CENTER + 14, CENTER - 6],
                  fill=(*gold, 255))
    draw.ellipse([CENTER - 10, CENTER - 30, CENTER + 10, CENTER - 10],
                  fill=(*lighter(gold, 0.3), 255))
    # Laurel crown - two arcs of leaves
    for side in [-1, 1]:
        for i in range(5):
            y = CENTER - 8 + i * 6
            x = CENTER + side * (18 - abs(i - 2) * 2)
            draw.ellipse([x - 4, y - 2, x + 4, y + 2], fill=(100, 180, 80, 220))
    # Lyre body
    lx, ly = CENTER, CENTER + 22
    draw.arc([lx - 16, ly - 10, lx + 16, ly + 18], 0, 180, fill=(*gold, 255), width=3)
    draw.line([(lx - 16, ly - 10), (lx - 12, ly - 24)], fill=(*gold, 255), width=2)
    draw.line([(lx + 16, ly - 10), (lx + 12, ly - 24)], fill=(*gold, 255), width=2)
    draw.line([(lx - 12, ly - 24), (lx + 12, ly - 24)], fill=(*gold, 255), width=2)
    # Strings
    for sx in range(-6, 9, 4):
        draw.line([(lx + sx, ly - 24), (lx + sx, ly + 14)], fill=(*gold, 160), width=1)


def draw_athena(img, draw, color):
    light = lighter(color, 0.4)
    silver = (200, 210, 220)
    # Helmet crest
    draw.polygon([(CENTER, CENTER - 48), (CENTER - 6, CENTER - 20), (CENTER + 6, CENTER - 20)],
                  fill=(*color, 255))
    draw.arc([CENTER - 20, CENTER - 45, CENTER + 20, CENTER - 20], 180, 360,
             fill=(*light, 255), width=3)
    # Helmet visor
    draw.arc([CENTER - 18, CENTER - 32, CENTER + 18, CENTER - 8], 0, 180,
             fill=(*color, 255), width=3)
    draw.line([(CENTER, CENTER - 8), (CENTER, CENTER - 32)], fill=(*color, 200), width=2)
    # Shield (round with medusa hint)
    sx, sy = CENTER, CENTER + 18
    draw.ellipse([sx - 22, sy - 16, sx + 22, sy + 16], fill=(*darker(color, 0.2), 240),
                  outline=(*silver, 255), width=2)
    # Medusa spiral on shield
    draw.arc([sx - 10, sy - 8, sx + 10, sy + 8], 0, 300, fill=(*light, 200), width=2)
    draw.ellipse([sx - 3, sy - 3, sx + 3, sy + 3], fill=(*light, 255))
    # Owl eyes (small, on upper right)
    ox, oy = CENTER + 30, CENTER - 10
    draw.ellipse([ox - 8, oy - 6, ox + 8, oy + 6], fill=(*darker(color, 0.3), 200))
    draw.ellipse([ox - 5, oy - 4, ox - 1, oy], fill=(*gold_c(light), 255))
    draw.ellipse([ox + 1, oy - 4, ox + 5, oy], fill=(*gold_c(light), 255))
    draw.ellipse([ox - 3, oy - 2, ox - 2, oy - 1], fill=(0, 0, 0, 255))
    draw.ellipse([ox + 2, oy - 2, ox + 3, oy - 1], fill=(0, 0, 0, 255))
    # Olive branch
    for i in range(6):
        bx = CENTER - 30 + i * 4
        by = CENTER + 5 + i * 3
        draw.ellipse([bx - 3, by - 2, bx + 3, by + 2], fill=(100, 170, 80, 200))

def gold_c(base):
    return (min(255, base[0] + 40), min(255, base[1] + 30), base[2])


def draw_mars(img, draw, color):
    light = lighter(color, 0.3)
    flame = (255, 100, 30)
    # Flames at edges
    for i in range(8):
        angle = math.radians(i * 45)
        fx = CENTER + int(40 * math.cos(angle))
        fy = CENTER + int(40 * math.sin(angle))
        for j in range(3):
            jx = fx + int(8 * math.cos(angle + 0.3 * j))
            jy = fy + int(8 * math.sin(angle + 0.3 * j))
            draw.ellipse([jx - 4, jy - 6, jx + 4, jy + 2],
                          fill=(*flame, 150 - j * 30))
    # Shield
    sx, sy = CENTER - 10, CENTER + 5
    draw.polygon([(sx, sy - 24), (sx - 18, sy - 8), (sx - 14, sy + 16),
                   (sx, sy + 24), (sx + 14, sy + 16), (sx + 18, sy - 8)],
                  fill=(*darker(color, 0.2), 240), outline=(*light, 255))
    # Shield emblem - cross
    draw.line([(sx, sy - 14), (sx, sy + 14)], fill=(*light, 200), width=2)
    draw.line([(sx - 10, sy), (sx + 10, sy)], fill=(*light, 200), width=2)
    # Spear
    spx = CENTER + 16
    draw.line([(spx, CENTER - 45), (spx, CENTER + 40)], fill=(*light, 255), width=3)
    # Spearhead
    draw.polygon([(spx, CENTER - 50), (spx - 6, CENTER - 38), (spx + 6, CENTER - 38)],
                  fill=(*lighter(color, 0.6), 255))


def draw_odin(img, draw, color):
    light = lighter(color, 0.4)
    dark = darker(color, 0.3)
    # Staff
    draw.line([(CENTER + 18, CENTER - 45), (CENTER + 18, CENTER + 45)],
              fill=(*lighter(color, 0.2), 255), width=3)
    draw.ellipse([CENTER + 12, CENTER - 50, CENTER + 24, CENTER - 42],
                  fill=(*light, 255))
    # One eye (glowing)
    draw.ellipse([CENTER - 8, CENTER - 14, CENTER + 8, CENTER + 2],
                  fill=(*light, 255))
    draw.ellipse([CENTER - 4, CENTER - 10, CENTER + 4, CENTER - 2],
                  fill=(255, 200, 50, 255))
    draw.ellipse([CENTER - 2, CENTER - 8, CENTER + 2, CENTER - 4],
                  fill=(0, 0, 0, 255))
    # Eye patch on other eye
    draw.line([(CENTER - 20, CENTER - 18), (CENTER - 6, CENTER - 4)],
              fill=(*dark, 255), width=3)
    draw.ellipse([CENTER - 22, CENTER - 14, CENTER - 10, CENTER + 2],
                  fill=(*dark, 220))
    # Ravens (two small bird silhouettes)
    for rx, ry in [(CENTER - 25, CENTER - 30), (CENTER + 30, CENTER - 25)]:
        draw.polygon([(rx, ry), (rx - 8, ry - 3), (rx - 4, ry - 6)],
                      fill=(30, 30, 40, 220))
        draw.polygon([(rx, ry), (rx + 8, ry - 3), (rx + 4, ry - 6)],
                      fill=(30, 30, 40, 220))
        draw.ellipse([rx - 2, ry - 2, rx + 2, ry + 2], fill=(30, 30, 40, 240))
    # Runes around edge
    rune_angles = [30, 80, 150, 210, 280, 330]
    for a in rune_angles:
        rad = math.radians(a)
        rx = CENTER + int(48 * math.cos(rad))
        ry = CENTER + int(48 * math.sin(rad))
        draw.line([(rx - 3, ry - 4), (rx + 3, ry + 4)], fill=(*light, 150), width=1)
        draw.line([(rx - 3, ry), (rx + 3, ry)], fill=(*light, 150), width=1)
    # Beard suggestion
    for i in range(5):
        bx = CENTER - 8 + i * 4
        draw.line([(bx, CENTER + 8), (bx, CENTER + 28)], fill=(*darker(light, 0.2), 150), width=1)


def draw_ra(img, draw, color):
    light = lighter(color, 0.4)
    gold = (255, 200, 50)
    # Sun disk on head
    draw.ellipse([CENTER - 16, CENTER - 48, CENTER + 16, CENTER - 16],
                  fill=(*gold, 255))
    draw.ellipse([CENTER - 12, CENTER - 44, CENTER + 12, CENTER - 20],
                  fill=(*lighter(gold, 0.3), 255))
    # Sun rays from disk
    for angle in range(0, 360, 40):
        rad = math.radians(angle)
        x1 = CENTER + int(14 * math.cos(rad))
        y1 = CENTER - 32 + int(14 * math.sin(rad))
        x2 = CENTER + int(24 * math.cos(rad))
        y2 = CENTER - 32 + int(24 * math.sin(rad))
        draw.line([(x1, y1), (x2, y2)], fill=(*gold, 180), width=1)
    # Falcon head shape
    draw.polygon([(CENTER - 14, CENTER - 12), (CENTER + 14, CENTER - 12),
                   (CENTER + 10, CENTER + 8), (CENTER - 10, CENTER + 8)],
                  fill=(*color, 240))
    # Beak
    draw.polygon([(CENTER, CENTER + 4), (CENTER + 18, CENTER + 2), (CENTER + 8, CENTER + 12)],
                  fill=(*gold, 255))
    # Eye
    draw.ellipse([CENTER - 6, CENTER - 6, CENTER + 2, CENTER + 2],
                  fill=(*gold, 255))
    draw.ellipse([CENTER - 4, CENTER - 4, CENTER, CENTER],
                  fill=(0, 0, 0, 255))
    # Eye of Horus line
    draw.line([(CENTER + 2, CENTER), (CENTER + 6, CENTER + 8)],
              fill=(*color, 255), width=2)
    # Ankh
    ax, ay = CENTER, CENTER + 28
    draw.ellipse([ax - 6, ay - 10, ax + 6, ay], outline=(*gold, 255), width=2)
    draw.line([(ax, ay), (ax, ay + 16)], fill=(*gold, 255), width=2)
    draw.line([(ax - 8, ay + 6), (ax + 8, ay + 6)], fill=(*gold, 255), width=2)


def draw_amaterasu(img, draw, color):
    light = lighter(color, 0.5)
    white = (240, 240, 255)
    gold = (255, 220, 100)
    # Radiance - layered glow
    for r in range(50, 20, -5):
        alpha = int(60 + (50 - r) * 3)
        draw.ellipse([CENTER - r, CENTER - r - 5, CENTER + r, CENTER + r - 5],
                      fill=(*lighter(color, 0.6), alpha))
    # Elegant figure silhouette (simplified kimono shape)
    draw.polygon([(CENTER, CENTER - 25), (CENTER - 20, CENTER + 10),
                   (CENTER - 25, CENTER + 40), (CENTER + 25, CENTER + 40),
                   (CENTER + 20, CENTER + 10)],
                  fill=(*color, 200))
    # Mirror (sacred object)
    mx, my = CENTER, CENTER - 8
    draw.ellipse([mx - 12, my - 12, mx + 12, my + 12],
                  outline=(*white, 255), width=2)
    draw.ellipse([mx - 8, my - 8, mx + 8, my + 8],
                  fill=(*light, 200))
    # Mirror reflection sparkle
    draw.line([(mx - 3, my - 3), (mx + 3, my + 3)], fill=(*white, 255), width=1)
    draw.line([(mx + 3, my - 3), (mx - 3, my + 3)], fill=(*white, 255), width=1)
    draw.line([(mx, my - 5), (mx, my + 5)], fill=(*white, 200), width=1)
    draw.line([(mx - 5, my), (mx + 5, my)], fill=(*white, 200), width=1)
    # Light rays emanating
    for angle in range(0, 360, 25):
        rad = math.radians(angle)
        x1 = CENTER + int(20 * math.cos(rad))
        y1 = CENTER - 5 + int(20 * math.sin(rad))
        x2 = CENTER + int(48 * math.cos(rad))
        y2 = CENTER - 5 + int(48 * math.sin(rad))
        draw.line([(x1, y1), (x2, y2)], fill=(*gold, 80), width=1)


def draw_phi(img, draw, color):
    light = lighter(color, 0.5)
    energy = (180, 140, 100)
    # Quantum waveform pattern (sine waves)
    for wave in range(3):
        amp = 15 + wave * 8
        freq = 0.08 + wave * 0.03
        phase = wave * 1.2
        alpha = 200 - wave * 50
        points = []
        for x in range(CENTER - 45, CENTER + 46):
            y = CENTER + int(amp * math.sin(freq * x + phase))
            points.append((x, y))
        if len(points) > 1:
            for i in range(len(points) - 1):
                draw.line([points[i], points[i + 1]],
                           fill=(*lighter(color, 0.2 + wave * 0.15), alpha), width=2)
    # Central energy nexus
    for r in range(20, 0, -2):
        t = r / 20
        c = tuple(int(light[i] * t + 255 * (1 - t)) for i in range(3))
        draw.ellipse([CENTER - r, CENTER - r, CENTER + r, CENTER + r],
                      fill=(*c, int(255 * (1 - t * 0.5))))
    # Phi symbol (Φ)
    draw.ellipse([CENTER - 10, CENTER - 14, CENTER + 10, CENTER + 14],
                  outline=(*energy, 255), width=3)
    draw.line([(CENTER, CENTER - 22), (CENTER, CENTER + 22)],
              fill=(*energy, 255), width=3)
    # Particle effects - scattered dots
    import random
    random.seed(42)
    for _ in range(30):
        angle = random.uniform(0, 2 * math.pi)
        dist = random.uniform(20, 50)
        px = CENTER + int(dist * math.cos(angle))
        py = CENTER + int(dist * math.sin(angle))
        size = random.randint(1, 3)
        alpha = random.randint(100, 220)
        draw.ellipse([px - size, py - size, px + size, py + size],
                      fill=(*light, alpha))
    # Orbital rings
    for i in range(3):
        angle = i * 60
        draw.arc([CENTER - 35 - i * 5, CENTER - 25 + i * 3,
                   CENTER + 35 + i * 5, CENTER + 25 - i * 3],
                  angle, angle + 180, fill=(*light, 120 - i * 30), width=1)


def draw_quetzalcoatl(img, draw, color):
    light = lighter(color, 0.4)
    green = (80, 200, 120)
    gold = (220, 180, 50)
    # Serpent body (S-curve)
    points = []
    for t in range(40):
        tt = t / 40
        x = CENTER - 30 + tt * 60
        y = CENTER + int(20 * math.sin(tt * math.pi * 2.5))
        points.append((x, y))
    for i in range(len(points) - 1):
        width = max(2, int(8 - abs(i - 20) * 0.3))
        draw.line([points[i], points[i + 1]], fill=(*color, 230), width=width)
    # Scales pattern on body
    for i in range(0, len(points) - 2, 3):
        x, y = points[i]
        draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(*light, 180))
    # Feathers (fan at head position)
    head_x, head_y = int(points[0][0]), int(points[0][1])
    for angle in range(120, 260, 15):
        rad = math.radians(angle)
        fx = head_x + int(25 * math.cos(rad))
        fy = head_y + int(25 * math.sin(rad))
        draw.line([(head_x, head_y), (fx, fy)], fill=(*green, 200), width=2)
        draw.ellipse([fx - 3, fy - 3, fx + 3, fy + 3], fill=(*green, 220))
    # Serpent head
    draw.ellipse([head_x - 8, head_y - 8, head_x + 8, head_y + 8],
                  fill=(*color, 255))
    # Eye
    draw.ellipse([head_x - 3, head_y - 4, head_x + 3, head_y], fill=(*gold, 255))
    draw.ellipse([head_x - 1, head_y - 3, head_x + 1, head_y - 1], fill=(0, 0, 0, 255))
    # Wind spirals
    for sx, sy, r in [(CENTER + 25, CENTER - 25, 12), (CENTER - 20, CENTER + 30, 10)]:
        draw.arc([sx - r, sy - r, sx + r, sy + r], 0, 270, fill=(*light, 150), width=2)
        draw.arc([sx - r // 2, sy - r // 2, sx + r // 2, sy + r // 2], 90, 360,
                  fill=(*light, 120), width=1)
    # Gold accents
    for i in range(5, len(points) - 2, 6):
        x, y = points[i]
        draw.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(*gold, 200))


# === Generate all portraits ===

LEADERS = [
    ('apollo',       '#e94560', draw_apollo),
    ('athena',       '#2196f3', draw_athena),
    ('mars',         '#4caf50', draw_mars),
    ('odin',         '#ff9800', draw_odin),
    ('ra',           '#9c27b0', draw_ra),
    ('amaterasu',    '#00bcd4', draw_amaterasu),
    ('phi',          '#795548', draw_phi),
    ('quetzalcoatl', '#607d8b', draw_quetzalcoatl),
]

if __name__ == '__main__':
    print(f"Generating {len(LEADERS)} leader portraits...")
    for leader_id, color_hex, draw_fn in LEADERS:
        make_portrait(leader_id, color_hex, draw_fn)
    print("Done!")
