import shutil
from pathlib import Path
from PIL import Image, ImageDraw

GENERATED_SOURCE = Path(
    r"C:/Users/lataj/.gemini/antigravity/brain/d472accd-079f-49d6-aa5f-e9ef162866da/peak_launcher_icon_1795203939745.jpg"
)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = PROJECT_ROOT / "assets"
WEBSITE_ASSETS_DIR = PROJECT_ROOT / "website" / "assets"
LOCAL_SOURCE = ASSETS_DIR / "icon-source.jpg"


def create_rounded_mask(size: int, radius_ratio: float = 0.225, scale: int = 4) -> Image.Image:
    big = size * scale
    radius = int(big * radius_ratio)
    mask_big = Image.new("L", (big, big), 0)
    draw = ImageDraw.Draw(mask_big)
    draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=radius, fill=255)
    return mask_big.resize((size, size), Image.Resampling.LANCZOS)


def create_fallback_mountain(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), (8, 22, 46, 255))
    draw = ImageDraw.Draw(img)
    for y in range(size):
        t = y / max(1, size - 1)
        r = int(8 + 20 * t)
        g = int(26 + 58 * t)
        b = int(58 + 86 * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b, 255))
    draw.polygon(
        [(int(size * 0.12), int(size * 0.78)), (int(size * 0.50), int(size * 0.22)), (int(size * 0.88), int(size * 0.78))],
        fill=(42, 130, 218, 255),
    )
    draw.polygon(
        [(int(size * 0.36), int(size * 0.42)), (int(size * 0.50), int(size * 0.22)), (int(size * 0.64), int(size * 0.42)), (int(size * 0.54), int(size * 0.38)), (int(size * 0.50), int(size * 0.45)), (int(size * 0.44), int(size * 0.38))],
        fill=(242, 248, 255, 255),
    )
    return img


def build_icons() -> None:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    WEBSITE_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    if GENERATED_SOURCE.exists() and not LOCAL_SOURCE.exists():
        shutil.copy2(GENERATED_SOURCE, LOCAL_SOURCE)

    if LOCAL_SOURCE.exists():
        img = Image.open(LOCAL_SOURCE).convert("RGBA")
        w, h = img.size
        margin = int(min(w, h) * 0.06)
        cropped = img.crop((margin, margin, w - margin, h - margin))
    else:
        cropped = create_fallback_mountain(1024)

    icon_512 = cropped.resize((512, 512), Image.Resampling.LANCZOS)
    icon_512.putalpha(create_rounded_mask(512))
    icon_512.save(ASSETS_DIR / "icon.png", format="PNG")
    shutil.copy2(ASSETS_DIR / "icon.png", WEBSITE_ASSETS_DIR / "icon.png")

    icon_64 = cropped.resize((64, 64), Image.Resampling.LANCZOS)
    icon_64.putalpha(create_rounded_mask(64))
    icon_64.save(ASSETS_DIR / "icon-64.png", format="PNG")
    shutil.copy2(ASSETS_DIR / "icon-64.png", WEBSITE_ASSETS_DIR / "icon-64.png")

    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_base = cropped.resize((256, 256), Image.Resampling.LANCZOS)
    ico_base.putalpha(create_rounded_mask(256))
    ico_base.save(ASSETS_DIR / "icon.ico", format="ICO", sizes=ico_sizes)
    shutil.copy2(ASSETS_DIR / "icon.ico", WEBSITE_ASSETS_DIR / "icon.ico")

    print("Generated icons in:", ASSETS_DIR, "and", WEBSITE_ASSETS_DIR)


if __name__ == "__main__":
    build_icons()
