import io
import json
import math
import random
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "assets"
WALLPAPER_NIGHT = ASSETS_DIR / "wallpaper-night.jpg"
ICON_PNG = ASSETS_DIR / "icon.png"
OUT_ZIP = ASSETS_DIR / "peak-ui-pack.zip"


def png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def build_pack_png() -> bytes:
    im = Image.open(ICON_PNG).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    return png_bytes(im)


def build_panorama_faces(size: int = 512) -> dict[str, bytes]:
    """Generate 6 seamless dark-alpine mountain panorama faces derived from Peak night wallpaper."""
    src = Image.open(WALLPAPER_NIGHT).convert("RGB")
    strip_w = size * 4
    # Mirror-tile horizontally twice so wraparound at 360 deg (face 3 -> face 0) has zero seam
    flipped = src.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    combined = Image.new("RGB", (src.width * 2, src.height))
    combined.paste(src, (0, 0))
    combined.paste(flipped, (src.width, 0))
    strip = combined.resize((strip_w, size), Image.Resampling.LANCZOS)

    # Darken slightly and infuse alpine navy atmosphere so white Minecraft menus pop cleanly
    top_strip_color = (7, 14, 28)
    bot_strip_color = (5, 9, 17)
    overlay_grad = Image.new("RGBA", (strip_w, size))
    od = ImageDraw.Draw(overlay_grad)
    for y in range(size):
        t = y / max(1, size - 1)
        if t < 0.25:
            a = int(200 * (1.0 - t / 0.25))
            od.line([(0, y), (strip_w, y)], fill=(*top_strip_color, a))
        elif t > 0.78:
            a = int(225 * ((t - 0.78) / 0.22))
            od.line([(0, y), (strip_w, y)], fill=(*bot_strip_color, a))
        else:
            od.line([(0, y), (strip_w, y)], fill=(7, 13, 24, 52))

    # Add subtle aurora cyan/indigo mist band across the upper sky
    rng = random.Random(20261124)
    aurora = Image.new("RGBA", (strip_w, size), (0, 0, 0, 0))
    ad = ImageDraw.Draw(aurora)
    for i in range(18):
        cx = int((i / 18.0) * strip_w)
        cy = int(size * (0.28 + 0.06 * math.sin(i * 0.9)))
        rx = size // 2
        ry = size // 6
        ad.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(32, 165, 232, 10))
    aurora = aurora.filter(ImageFilter.GaussianBlur(radius=28))

    # Add subtle pinpoint alpine stars on upper sky
    stars = Image.new("RGBA", (strip_w, size), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stars)
    for _ in range(360):
        sx = rng.randint(0, strip_w - 1)
        sy = rng.randint(4, int(size * 0.52))
        alpha = rng.randint(55, 195)
        col = (210, 238, 255, alpha) if rng.random() < 0.7 else (120, 210, 255, alpha)
        sd.point((sx, sy), fill=col)

    strip_rgba = Image.alpha_composite(strip.convert("RGBA"), aurora)
    strip_rgba = Image.alpha_composite(strip_rgba, overlay_grad)
    strip_rgba = Image.alpha_composite(strip_rgba, stars).convert("RGB")

    faces: dict[str, bytes] = {}
    for idx in range(4):
        crop = strip_rgba.crop((idx * size, 0, (idx + 1) * size, size))
        faces[f"panorama_{idx}.png"] = png_bytes(crop)

    # Top face (panorama_4.png): deep zenith alpine night sky + stars
    top_img = Image.new("RGB", (size, size), top_strip_color)
    td = ImageDraw.Draw(top_img)
    for _ in range(180):
        sx = rng.randint(2, size - 3)
        sy = rng.randint(2, size - 3)
        b = rng.randint(85, 220)
        td.point((sx, sy), fill=(int(b * 0.8), int(b * 0.92), b))
    faces["panorama_4.png"] = png_bytes(top_img)

    # Bottom face (panorama_5.png): deep obsidian ridge shadow
    bot_img = Image.new("RGB", (size, size), bot_strip_color)
    faces["panorama_5.png"] = png_bytes(bot_img)

    # Subtle radial vignette overlay
    ov = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    ov_px = ov.load()
    for y in range(256):
        dy = (y - 127.5) / 127.5
        for x in range(256):
            dx = (x - 127.5) / 127.5
            dist = min(1.0, math.sqrt(dx * dx + dy * dy))
            alpha = int(max(0, min(145, 28 + 110 * (dist ** 1.65))))
            ov_px[x, y] = (7, 13, 23, alpha)
    faces["panorama_overlay.png"] = png_bytes(ov)
    return faces


def make_glass_button(fill_top, fill_bot, border_col, inner_glow=None) -> bytes:
    w, h = 200, 20
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        r = int(fill_top[0] + (fill_bot[0] - fill_top[0]) * t)
        g = int(fill_top[1] + (fill_bot[1] - fill_top[1]) * t)
        b = int(fill_top[2] + (fill_bot[2] - fill_top[2]) * t)
        a = int(fill_top[3] + (fill_bot[3] - fill_top[3]) * t)
        draw.line([(1, y), (w - 2, y)], fill=(r, g, b, a))

    # Crisp 1px perimeter with rounded corners
    draw.rectangle([0, 1, w - 1, h - 2], outline=border_col)
    draw.rectangle([1, 0, w - 2, h - 1], outline=border_col)
    if inner_glow:
        draw.line([(2, 1), (w - 3, 1)], fill=inner_glow)
    return png_bytes(im)


def build_hotbar_sprites() -> dict[str, bytes]:
    out: dict[str, bytes] = {}

    # 182x22 main hotbar: dark translucent glass with subtle ice-blue outer rim and slot separators
    hb = Image.new("RGBA", (182, 22), (0, 0, 0, 0))
    hd = ImageDraw.Draw(hb)
    for y in range(1, 21):
        t = (y - 1) / 19.0
        a = int(198 + 20 * t)
        hd.line([(1, y), (180, y)], fill=(8, 15, 28, a))
    hd.rectangle([0, 0, 181, 21], outline=(56, 189, 248, 105))
    hd.line([(1, 1), (180, 1)], fill=(186, 230, 253, 35))
    for slot in range(1, 9):
        x = 1 + slot * 20
        hd.line([(x, 3), (x, 18)], fill=(148, 163, 184, 48))
    out["hotbar.png"] = png_bytes(hb)

    # 24x23 active slot selection frame with ice-blue highlight
    sel = Image.new("RGBA", (24, 23), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sel)
    sd.rectangle([1, 1, 22, 21], fill=(56, 189, 248, 28), outline=(56, 189, 248, 245))
    sd.rectangle([0, 0, 23, 22], outline=(125, 211, 252, 165))
    # Bright corner pixels for modern tactical Peak look
    for cx, cy in [(0, 0), (1, 0), (0, 1), (22, 0), (23, 0), (23, 1), (0, 21), (0, 22), (1, 22), (23, 21), (22, 22), (23, 22)]:
        sel.putpixel((cx, cy), (224, 242, 254, 255))
    out["hotbar_selection.png"] = png_bytes(sel)

    # 29x24 offhand slot (left / right)
    def offhand_sprite(slot_x0: int) -> bytes:
        im = Image.new("RGBA", (29, 24), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.rectangle([slot_x0, 1, slot_x0 + 21, 22], fill=(8, 15, 28, 200), outline=(56, 189, 248, 105))
        d.line([(slot_x0 + 1, 2), (slot_x0 + 20, 2)], fill=(186, 230, 253, 35))
        return png_bytes(im)

    out["hotbar_offhand_left.png"] = offhand_sprite(0)
    out["hotbar_offhand_right.png"] = offhand_sprite(7)

    # 15x15 crisp minimal Peak crosshair
    ch = Image.new("RGBA", (15, 15), (0, 0, 0, 0))
    # Dark outer halo for contrast on white snow, crisp ice-white core
    dark = (7, 13, 23, 185)
    core = (232, 246, 255, 245)
    accent = (56, 189, 248, 255)
    for i in range(3, 6):
        ch.putpixel((7 - 1, i), dark)
        ch.putpixel((7 + 1, i), dark)
        ch.putpixel((7 - 1, 14 - i), dark)
        ch.putpixel((7 + 1, 14 - i), dark)
        ch.putpixel((i, 7 - 1), dark)
        ch.putpixel((i, 7 + 1), dark)
        ch.putpixel((14 - i, 7 - 1), dark)
        ch.putpixel((14 - i, 7 + 1), dark)
    for i in range(3, 6):
        ch.putpixel((7, i), core)
        ch.putpixel((7, 14 - i), core)
        ch.putpixel((i, 7), core)
        ch.putpixel((14 - i, 7), core)
    ch.putpixel((7, 7), accent)
    out["crosshair.png"] = png_bytes(ch)
    return out


def main() -> None:
    pack_mcmeta = {
        "pack": {
            "pack_format": 46,
            "supported_formats": {"min_inclusive": 15, "max_inclusive": 999},
            "min_format": 15,
            "max_format": 999,
            "description": "Peak Alpine UI — Ciemny alpejski motyw, HUD i menu Peak Launchera",
        }
    }
    button_mcmeta = json.dumps(
        {"gui": {"scaling": {"type": "nine_slice", "width": 200, "height": 20, "border": 3}}},
        indent=2,
    )

    splashes = "\n".join(
        [
            "Peak Launcher — Alpine Edition!",
            "Szczyt zawsze przed Tobą!",
            "Right Shift -> Nowe Peak Client GUI!",
            "Lepsze F3 aktywne!",
            "Zoom (C) & Fullbright (G)!",
            "Własny serwer <adres>.peak!",
            "Pure Cinema Alpine UI!",
            "Zero UAC, czysta wydajność!",
        ]
    ) + "\n"

    pano = build_panorama_faces(512)
    hud = build_hotbar_sprites()

    with zipfile.ZipFile(OUT_ZIP, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        zf.writestr("pack.mcmeta", json.dumps(pack_mcmeta, ensure_ascii=False, indent=2))
        zf.writestr("pack.png", build_pack_png())
        zf.writestr("assets/minecraft/texts/splashes.txt", splashes.encode("utf-8"))

        for name, data in pano.items():
            zf.writestr(f"assets/minecraft/textures/gui/title/background/{name}", data)

        btn_normal = make_glass_button((13, 23, 41, 212), (8, 15, 28, 224), (100, 116, 139, 135), (255, 255, 255, 26))
        btn_hover = make_glass_button((17, 36, 66, 234), (11, 24, 46, 240), (56, 189, 248, 255), (125, 211, 252, 80))
        btn_disabled = make_glass_button((15, 23, 42, 130), (10, 15, 28, 140), (71, 85, 105, 80))

        for name, img_data in [
            ("button.png", btn_normal),
            ("button_highlighted.png", btn_hover),
            ("button_disabled.png", btn_disabled),
        ]:
            zf.writestr(f"assets/minecraft/textures/gui/sprites/widget/{name}", img_data)
            zf.writestr(f"assets/minecraft/textures/gui/sprites/widget/{name}.mcmeta", button_mcmeta)

        for name, data in hud.items():
            zf.writestr(f"assets/minecraft/textures/gui/sprites/hud/{name}", data)

    print(f"Generated {OUT_ZIP} ({OUT_ZIP.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
