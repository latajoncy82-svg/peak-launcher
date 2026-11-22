import os
from PIL import Image

OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "assets", "skins"))
os.makedirs(OUT_DIR, exist_ok=True)


def fill(img, x, y, w, h, color):
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            img.putpixel((xx, yy), color)


def px(img, x, y, color):
    img.putpixel((x, y), color)


def shade(color, delta):
    r, g, b, a = color
    return (
        max(0, min(255, r + delta)),
        max(0, min(255, g + delta)),
        max(0, min(255, b + delta)),
        a,
    )


def paint_box(img, ox, oy, w, h, d, color_main, seam_delta=-12):
    # Top (ox+d, oy, w, d), Bottom (ox+d+w, oy, w, d)
    # Right (ox, oy+d, d, h), Front (ox+d, oy+d, w, h), Left (ox+d+w, oy+d, d, h), Back (ox+2*d+w, oy+d, w, h)
    fill(img, ox + d, oy, w, d, shade(color_main, 10))
    fill(img, ox + d + w, oy, w, d, shade(color_main, -16))
    fill(img, ox, oy + d, d, h, shade(color_main, -8))
    fill(img, ox + d, oy + d, w, h, color_main)
    fill(img, ox + d + w, oy + d, d, h, shade(color_main, -5))
    fill(img, ox + 2 * d + w, oy + d, w, h, shade(color_main, -10))
    # subtle bottom edge shading on vertical sides
    fill(img, ox, oy + d + h - 1, 2 * d + 2 * w, 1, shade(color_main, seam_delta))


def add_subtle_noise(img, rects, base_color, amp=8):
    for (rx, ry, rw, rh) in rects:
        for yy in range(ry, ry + rh):
            for xx in range(rx, rx + rw):
                delta = ((xx * 37 + yy * 17) % (amp * 2 + 1)) - amp
                cur = img.getpixel((xx, yy))
                if cur[3] > 0:
                    img.putpixel((xx, yy), shade(cur, delta // 2))


def build_steve():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    skin = (196, 152, 118, 255)
    hair = (58, 38, 24, 255)
    eye_white = (242, 244, 248, 255)
    eye_iris = (66, 86, 198, 255)
    beard = (118, 76, 52, 255)
    shirt = (22, 168, 176, 255)
    pants = (52, 62, 148, 255)
    shoes = (92, 92, 98, 255)

    # Head base
    paint_box(img, 0, 0, 8, 8, 8, skin, -8)
    # Hair cap (top, sides, back, forehead)
    fill(img, 8, 0, 8, 8, hair)
    fill(img, 0, 8, 32, 2, hair)
    fill(img, 0, 10, 8, 2, hair)  # sideburns right
    fill(img, 16, 10, 8, 2, hair)  # sideburns left
    fill(img, 24, 10, 8, 5, hair)  # back hair
    px(img, 8, 10, hair)
    px(img, 15, 10, hair)
    # Eyes (row 12)
    px(img, 9, 12, eye_white)
    px(img, 10, 12, eye_iris)
    px(img, 13, 12, eye_iris)
    px(img, 14, 12, eye_white)
    # Nose & classic goatee/smile
    px(img, 11, 13, shade(skin, -18))
    px(img, 12, 13, shade(skin, -18))
    fill(img, 10, 14, 4, 2, beard)
    px(img, 11, 14, shade(skin, -10))
    px(img, 12, 14, shade(skin, -10))

    # Torso shirt
    paint_box(img, 16, 16, 8, 12, 4, shirt, -14)
    # V-neck collar detail on front
    px(img, 23, 20, skin)
    px(img, 24, 20, skin)
    px(img, 23, 21, shade(shirt, -22))
    px(img, 24, 21, shade(shirt, -22))

    # Right Arm & Left Arm (sleeve 4px top, skin below)
    for (ax, ay) in [(40, 16), (32, 48)]:
        paint_box(img, ax, ay, 4, 12, 4, skin, -8)
        paint_box(img, ax, ay, 4, 4, 4, shirt, -12)
        fill(img, ax + 4, ay + 4, 4, 1, shirt)  # sleeve cuff front
        fill(img, ax, ay + 4, 16, 1, shade(shirt, -10))

    # Right Leg & Left Leg
    for (lx, ly) in [(0, 16), (16, 48)]:
        paint_box(img, lx, ly, 4, 12, 4, pants, -10)
        fill(img, lx, ly + 14, 16, 2, shoes)
        fill(img, lx + 8, ly, 4, 4, shade(shoes, -14))  # bottom sole

    add_subtle_noise(img, [(8, 0, 8, 8), (20, 20, 8, 12)], shirt, 6)
    img.save(os.path.join(OUT_DIR, "steve.png"))


def build_alex():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    skin = (232, 189, 158, 255)
    hair = (214, 116, 44, 255)
    hair_hi = shade(hair, 18)
    eye_white = (246, 248, 252, 255)
    eye_green = (58, 156, 78, 255)
    mouth = (186, 124, 102, 255)
    tunic = (108, 156, 66, 255)
    belt = (72, 48, 32, 255)
    buckle = (196, 182, 134, 255)
    pants = (82, 64, 52, 255)
    boots = (54, 42, 34, 255)

    # Head base
    paint_box(img, 0, 0, 8, 8, 8, skin, -6)
    fill(img, 8, 0, 8, 8, hair)
    fill(img, 0, 8, 32, 2, hair)
    fill(img, 8, 10, 3, 1, hair)  # bangs left side
    fill(img, 24, 10, 8, 6, hair)  # back hair
    fill(img, 16, 10, 8, 3, hair)
    fill(img, 0, 10, 8, 3, hair)
    # Ponytail on hat overlay (left/back)
    fill(img, 48, 10, 6, 4, hair_hi)
    fill(img, 56, 10, 6, 6, hair)
    # Eyes (row 12)
    px(img, 9, 12, eye_white)
    px(img, 10, 12, eye_green)
    px(img, 13, 12, eye_green)
    px(img, 14, 12, eye_white)
    px(img, 11, 14, mouth)
    px(img, 12, 14, mouth)

    # Torso tunic + belt
    paint_box(img, 16, 16, 8, 12, 4, tunic, -12)
    fill(img, 16, 29, 24, 2, belt)
    fill(img, 23, 29, 2, 2, buckle)

    # Slim Arms (3px front/back width!)
    for (ax, ay) in [(40, 16), (32, 48)]:
        # Right(4x12), Front(3x12), Left(4x12), Back(3x12), Top(3x4), Bottom(3x4)
        fill(img, ax + 4, ay, 3, 4, tunic)
        fill(img, ax + 7, ay, 3, 4, shade(skin, -10))
        fill(img, ax, ay + 4, 14, 12, skin)
        fill(img, ax, ay + 4, 14, 5, tunic)
        fill(img, ax + 4, ay + 9, 3, 1, shade(tunic, -14))

    # Legs + boots
    for (lx, ly) in [(0, 16), (16, 48)]:
        paint_box(img, lx, ly, 4, 12, 4, pants, -8)
        fill(img, lx, ly + 13, 16, 3, boots)
        fill(img, lx + 8, ly, 4, 4, shade(boots, -12))

    add_subtle_noise(img, [(20, 20, 8, 12), (8, 0, 8, 8)], tunic, 5)
    img.save(os.path.join(OUT_DIR, "alex.png"))


def build_peak_climber():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    skin = (224, 178, 144, 255)
    hair = (42, 48, 62, 255)
    jacket = (18, 126, 188, 255)
    jacket_hi = (56, 189, 248, 255)
    harness = (245, 158, 11, 255)
    pants = (28, 38, 56, 255)
    boots = (18, 24, 34, 255)
    goggle_frame = (30, 41, 59, 255)
    goggle_lens = (103, 232, 249, 255)

    # Head + climber beard/hair
    paint_box(img, 0, 0, 8, 8, 8, skin, -8)
    fill(img, 8, 0, 8, 8, hair)
    fill(img, 0, 8, 32, 2, hair)
    fill(img, 24, 10, 8, 5, hair)
    px(img, 9, 12, (245, 249, 255, 255))
    px(img, 10, 12, (14, 116, 144, 255))
    px(img, 13, 12, (14, 116, 144, 255))
    px(img, 14, 12, (245, 249, 255, 255))
    px(img, 11, 14, shade(skin, -24))
    px(img, 12, 14, shade(skin, -24))

    # 2nd Hat Layer: Alpine beanie + glacier goggles on forehead!
    fill(img, 40, 0, 8, 8, (14, 116, 144, 255))
    fill(img, 32, 8, 32, 2, (14, 116, 144, 255))
    fill(img, 40, 9, 8, 2, goggle_frame)
    fill(img, 41, 9, 2, 2, goggle_lens)
    fill(img, 45, 9, 2, 2, goggle_lens)
    # Strap around sides & back
    fill(img, 32, 9, 8, 1, goggle_frame)
    fill(img, 48, 9, 16, 1, goggle_frame)

    # Torso parka + climbing harness
    paint_box(img, 16, 16, 8, 12, 4, jacket, -12)
    fill(img, 23, 20, 2, 12, jacket_hi)  # zipper stripe
    fill(img, 16, 28, 24, 2, boots)  # harness belt
    fill(img, 21, 20, 1, 8, harness)
    fill(img, 26, 20, 1, 8, harness)
    fill(img, 23, 28, 2, 2, harness)

    # Jacket 2nd Layer collar/pocket
    fill(img, 16, 36, 24, 2, shade(jacket_hi, 12))

    # Arms (parka + gloves)
    for (ax, ay) in [(40, 16), (32, 48)]:
        paint_box(img, ax, ay, 4, 12, 4, jacket, -10)
        fill(img, ax, ay + 12, 16, 4, boots)
        fill(img, ax, ay + 11, 16, 1, jacket_hi)

    # Legs + snow boots
    for (lx, ly) in [(0, 16), (16, 48)]:
        paint_box(img, lx, ly, 4, 12, 4, pants, -8)
        fill(img, lx, ly + 12, 16, 4, boots)
        fill(img, lx, ly + 15, 16, 1, (226, 238, 255, 255))  # snow trim sole

    add_subtle_noise(img, [(20, 20, 8, 12), (40, 20, 16, 12)], jacket, 6)
    img.save(os.path.join(OUT_DIR, "peak-climber.png"))


def build_summit_knight():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    steel = (44, 52, 70, 255)
    steel_dark = (22, 27, 38, 255)
    steel_trim = (148, 163, 184, 255)
    visor = (56, 189, 248, 255)
    visor_glow = (186, 230, 253, 255)
    core = (16, 185, 129, 255)

    # Helmeted Head base
    paint_box(img, 0, 0, 8, 8, 8, steel, -10)
    fill(img, 8, 11, 8, 2, steel_dark)  # visor slit
    fill(img, 9, 11, 2, 2, visor)
    px(img, 10, 11, visor_glow)
    fill(img, 13, 11, 2, 2, visor)
    px(img, 13, 11, visor_glow)
    # Crest on hat overlay
    fill(img, 43, 0, 2, 8, steel_trim)
    fill(img, 40, 8, 8, 1, steel_trim)

    # Chestplate
    paint_box(img, 16, 16, 8, 12, 4, steel, -12)
    fill(img, 21, 20, 6, 4, steel_dark)
    fill(img, 23, 21, 2, 2, visor)
    px(img, 23, 24, core)
    px(img, 24, 24, core)
    fill(img, 16, 29, 24, 2, steel_trim)

    # Armor shoulder overlay
    fill(img, 40, 36, 16, 3, steel_trim)
    fill(img, 48, 52, 16, 3, steel_trim)

    # Arms & Legs
    for (ax, ay) in [(40, 16), (32, 48)]:
        paint_box(img, ax, ay, 4, 12, 4, steel, -10)
        fill(img, ax, ay + 4, 16, 2, steel_trim)
        fill(img, ax, ay + 13, 16, 3, steel_dark)

    for (lx, ly) in [(0, 16), (16, 48)]:
        paint_box(img, lx, ly, 4, 12, 4, steel_dark, -8)
        fill(img, lx, ly + 6, 16, 2, steel_trim)
        fill(img, lx, ly + 13, 16, 3, steel)

    add_subtle_noise(img, [(20, 20, 8, 12)], steel, 5)
    img.save(os.path.join(OUT_DIR, "summit-knight.png"))


if __name__ == "__main__":
    build_steve()
    build_alex()
    build_peak_climber()
    build_summit_knight()
    print("Generated preset skins in:", OUT_DIR)
