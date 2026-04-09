"""
Remove background, crop to content bounds, split every image in scripts/nftsv2/
into a 3x3 grid (9 tiles each), then upscale each tile 2x with waifu2x.
Output as sequentially numbered transparent .webp files.

Usage:
    pip install Pillow waifu2x-ncnn-py rembg onnxruntime
    python scripts/split_grid.py
"""

from pathlib import Path
from PIL import Image
from rembg import remove
from waifu2x_ncnn_py import Waifu2x

IMGS_DIR = Path(__file__).resolve().parent / "nftsv2"
OUTPUT_DIR = IMGS_DIR / "collections"
COLS = 3
ROWS = 3
SCALE = 2
SUPPORTED = {".png", ".jpg", ".jpeg", ".webp"}


def create_upscaler() -> Waifu2x:
    return Waifu2x(
        gpuid=0,
        scale=SCALE,
        noise=1,
        model="models-cunet",
    )


def upscale_pil(upscaler: Waifu2x, img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    rgb = rgba.convert("RGB")
    upscaled_rgb = upscaler.process_pil(rgb).convert("RGB")
    alpha = rgba.getchannel("A")

    resample = Image.Resampling.LANCZOS if hasattr(Image, "Resampling") else Image.LANCZOS
    upscaled_alpha = alpha.resize(upscaled_rgb.size, resample=resample)
    r, g, b = upscaled_rgb.split()
    return Image.merge("RGBA", (r, g, b, upscaled_alpha))


def remove_background_and_crop(img: Image.Image) -> Image.Image:
    # rembg returns an image with transparent background (RGBA).
    transparent = remove(img.convert("RGBA")).convert("RGBA")
    alpha_bbox = transparent.getchannel("A").getbbox()
    if alpha_bbox is None:
        return transparent
    return transparent.crop(alpha_bbox)


def split_and_upscale(path: Path, upscaler: Waifu2x, start_index: int) -> int:
    img = Image.open(path).convert("RGBA")
    img = remove_background_and_crop(img)
    w, h = img.size
    tile_w = w // COLS
    tile_h = h // ROWS

    count = 0

    for row in range(ROWS):
        for col in range(COLS):
            # Keep remainder pixels in the last row/column.
            left = col * tile_w
            top = row * tile_h
            right = (col + 1) * tile_w if col < COLS - 1 else w
            bottom = (row + 1) * tile_h if row < ROWS - 1 else h
            box = (left, top, right, bottom)
            tile = img.crop(box)
            upscaled = upscale_pil(upscaler, tile)
            out_path = OUTPUT_DIR / f"{start_index + count}.webp"
            upscaled.save(out_path, "WEBP", lossless=True)
            count += 1

    return count


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    images = sorted(
        p for p in IMGS_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED
    )

    if not images:
        print("No images found in", IMGS_DIR)
        return

    print("Initializing waifu2x upscaler (GPU)...")
    upscaler = create_upscaler()

    total = 0
    for i, img_path in enumerate(images, 1):
        print(f"[{i}/{len(images)}] {img_path.name}...", end=" ", flush=True)
        n = split_and_upscale(img_path, upscaler, total)
        total += n
        print(f"{n} tiles")

    print(f"\nDone: {total} tiles from {len(images)} images -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
