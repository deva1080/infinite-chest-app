"""
Generate a JSON metadata file for each .webp in scripts/output/collections/.
Each file: { "name": "<id>", "image": "https://radiant-tanuki-62e7ba.netlify.app/collections/<id>.webp" }

Output: scripts/output/metadata/<hex-id>.json

Usage:
    python scripts/gen_metadata.py
"""

import json
from pathlib import Path

OUTPUT_BASE = Path(__file__).resolve().parent / "output"
COLLECTIONS_DIR = OUTPUT_BASE / "collections"
OUTPUT_DIR = OUTPUT_BASE / "metadata"
BASE_URL = "https://radiant-tanuki-62e7ba.netlify.app/collections"


def sort_key(f: Path) -> tuple[int, int]:
    parts = f.stem.split("_", 1)
    return (int(parts[0]), int(parts[1])) if len(parts) == 2 else (int(parts[0]), 0)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(
        (f for f in COLLECTIONS_DIR.iterdir() if f.is_file() and f.suffix == ".webp"),
        key=sort_key,
    )

    if not files:
        print("No .webp files found in", COLLECTIONS_DIR)
        return

    for nft_id, f in enumerate(files, 1):
        hex_name = hex(nft_id)[2:].zfill(64)
        metadata = {
            "name": str(nft_id),
            "image": f"{BASE_URL}/{f.stem}.webp",
        }
        out_path = OUTPUT_DIR / f"{hex_name}.json"
        out_path.write_text(json.dumps(metadata, indent=2))
        print(f"  {hex_name}.json  ({f.name})")

    print(f"\nDone: {len(files)} metadata files -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
