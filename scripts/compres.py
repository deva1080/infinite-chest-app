"""
Optimize NFT images generated in scripts/nftsv2/collections.

By default, writes compressed .webp files to scripts/nftsv2/collections_optimized.

Usage:
    python scripts/compres.py
    python scripts/compres.py --quality 80 --target-kb 180
    python scripts/compres.py --in-place
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image

NFTS_DIR = Path(__file__).resolve().parent / "nftsv2"
INPUT_DIR = NFTS_DIR / "collections"
OUTPUT_DIR = NFTS_DIR / "collections_optimized"
SUPPORTED = {".webp", ".png", ".jpg", ".jpeg"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compress NFT collection images.")
    parser.add_argument("--quality", type=int, default=82, help="Initial WEBP quality (1-100).")
    parser.add_argument(
        "--min-quality",
        type=int,
        default=55,
        help="Minimum quality when searching for a target size.",
    )
    parser.add_argument(
        "--target-kb",
        type=int,
        default=180,
        help="Target max size per file in KB. Set 0 to disable iterative search.",
    )
    parser.add_argument(
        "--in-place",
        action="store_true",
        help="Overwrite files in scripts/nftsv2/collections.",
    )
    return parser.parse_args()


def encode_webp(img: Image.Image, quality: int) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format="WEBP", quality=quality, method=6)
    return buffer.getvalue()


def prepare_image(img: Image.Image) -> Image.Image:
    if "A" in img.getbands():
        return img.convert("RGBA")
    return img.convert("RGB")


def compress_image(
    path: Path,
    output_dir: Path,
    quality: int,
    min_quality: int,
    target_kb: int,
) -> tuple[int, int, int, Path]:
    with Image.open(path) as img:
        prepared = prepare_image(img)
        original_size = path.stat().st_size

        best_quality = quality
        best_bytes = encode_webp(prepared, quality)

        if target_kb > 0:
            target_bytes = target_kb * 1024
            trial_quality = quality

            while len(best_bytes) > target_bytes and trial_quality > min_quality:
                trial_quality = max(min_quality, trial_quality - 5)
                trial_bytes = encode_webp(prepared, trial_quality)
                if len(trial_bytes) <= len(best_bytes):
                    best_bytes = trial_bytes
                    best_quality = trial_quality
                if len(best_bytes) <= target_bytes:
                    break

        output_path = output_dir / f"{path.stem}.webp"
        output_path.write_bytes(best_bytes)
        return original_size, len(best_bytes), best_quality, output_path


def main() -> None:
    args = parse_args()

    if not INPUT_DIR.exists():
        print("Input directory not found:", INPUT_DIR)
        return

    quality = max(1, min(100, args.quality))
    min_quality = max(1, min(quality, args.min_quality))
    target_kb = max(0, args.target_kb)

    output_dir = INPUT_DIR if args.in_place else OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    files = sorted(
        p for p in INPUT_DIR.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED
    )

    if not files:
        print("No supported image files found in", INPUT_DIR)
        return

    before_total = 0
    after_total = 0

    for index, path in enumerate(files, 1):
        original_size, compressed_size, used_quality, output_path = compress_image(
            path=path,
            output_dir=output_dir,
            quality=quality,
            min_quality=min_quality,
            target_kb=target_kb,
        )
        before_total += original_size
        after_total += compressed_size
        saved_pct = 100 - ((compressed_size / original_size) * 100) if original_size else 0
        print(
            f"[{index}/{len(files)}] {path.name} -> {output_path.name} | "
            f"{original_size // 1024}KB -> {compressed_size // 1024}KB | "
            f"q={used_quality} | saved={saved_pct:.1f}%"
        )

    total_saved_pct = 100 - ((after_total / before_total) * 100) if before_total else 0
    print(f"\nDone: {len(files)} files -> {output_dir}")
    print(
        f"Total: {before_total // 1024}KB -> {after_total // 1024}KB | "
        f"saved={total_saved_pct:.1f}%"
    )


if __name__ == "__main__":
    main()
